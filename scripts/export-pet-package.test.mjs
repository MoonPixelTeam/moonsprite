import { animationLoopFrameIdsForExport } from '../src/renderer/src/core/animation-loop-sections.ts'
import { readFileSync } from 'node:fs'
import nodeVm from 'node:vm'
import { createLocalizationSource, catalogs, languages } from './pet-companion-localization.mjs'
const localeContext={navigator:{languages:['zh-CN']},t:(key,params={})=>key.replace(/\{([a-zA-Z]+)\}/g,(all,name)=>params[name]??all),setPetLanguage:()=>{},petLocale:'zh-CN',PET_LANGUAGES:[],createLocalizationSource};
const vm={...nodeVm,createContext:(value={})=>nodeVm.createContext({...localeContext,...value}),runInNewContext:(source,value={})=>nodeVm.runInNewContext(source,{...localeContext,...value})};
import assert from 'node:assert/strict'
import test from 'node:test'

const source = readFileSync(new URL('./export-pet-package.mjs', import.meta.url), 'utf8')
const context = vm.createContext({
  builtInPet: { id: 'builtin', name: 'Test', frameWidth: 2, frameHeight: 2, frameCount: 1, idleFrames: [0], source: 'builtin' },
  PET_SLOT_COUNT: 8, BUILT_IN_PET_ID: 'builtin', petName: 'Test', extensionId: 'test.pet',
  basename: value => value, sourcePath: 'test.moonsprite'
})
vm.runInContext(source.slice(source.indexOf('const localizationSource ='), source.indexOf('const sprite =')), context)
const activatePets=async(handlers,ids=['builtin'])=>{await handlers.activate();for(const commandId of ids)await handlers.command({event:'toggle-pet',commandId})};
const generated = vm.runInContext('({runtimePage,petWindowSource,managerSource,storeSource,triggerConditions})', context)

test('restarting restores explicit visibility and leaves persisted pet settings untouched', async () => {
 const stored=new Map([['preferences',{enabled:true,language:'ja-JP',breakMinutes:37}],['shownPets',['builtin']],['position:builtin',{ratioX:0.3,ratioY:0.7}],['pet-sprites',[{id:'builtin',frameCount:1,scale:3,mirrored:true}]]]);
 const boot=async()=>{const handlers={},opened=[];vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/)[1],{moonsprite:{on:(name,fn)=>handlers[name]=fn,storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},menus:{setItems:async()=>{}},windows:{open:async value=>opened.push(value),close:async()=>{},setVisible:async()=>{},postMessage:async()=>{}},diagnostics:{log:error=>{throw Error(error.message)}}}});await handlers.activate();return{handlers,opened}};
 const before=JSON.stringify([...stored]);
 const first=await boot();assert.equal(first.opened.length,1);assert.equal(JSON.stringify([...stored]),before);
 const second=await boot();assert.equal(second.opened.length,1);assert.equal(JSON.stringify([...stored]),before);
 await second.handlers.command({event:'toggle-pet',commandId:'builtin'});
 assert.equal((await boot()).opened.length,0);
 assert.equal(stored.get('preferences').breakMinutes,37);
 assert.deepEqual(stored.get('position:builtin'),{ratioX:0.3,ratioY:0.7});
 assert.equal(stored.get('pet-sprites')[0].scale,3);assert.equal(stored.get('pet-sprites')[0].mirrored,true);
});

test('all extension messages have nine translations with identical placeholders', () => {
  const keys=new Set([...source.matchAll(/\bt\('([^']+)'/g)].map(match=>match[1]));
  for(const condition of generated.triggerConditions){keys.add(condition[1]);keys.add(condition[2])}
  const placeholders=value=>[...value.matchAll(/\{([a-zA-Z]+)\}/g)].map(match=>match[1]).sort();
  assert.equal(languages.length,9);
  for(const [locale] of languages)for(const key of keys){
    assert.ok(catalogs[locale][key],locale+': '+key);
    assert.deepEqual(placeholders(catalogs[locale][key]),placeholders(key),locale+': '+key);
  }
});

test('locale resolution supports regional variants, explicit override and English fallback', () => {
  const sandbox=nodeVm.createContext({navigator:{languages:['fr-CA','en-US']}});
  nodeVm.runInContext(createLocalizationSource(),sandbox);
  assert.equal(nodeVm.runInContext('petLocale',sandbox),'fr-FR');
  for(const [input,expected] of [['pt-PT','pt-BR'],['zh-Hant-TW','zh-CN'],['JA_jp','ja-JP'],['xx','en-US']])
    assert.equal(nodeVm.runInContext(`resolvePetLanguage('auto',${JSON.stringify([input])})`,sandbox),expected);
  assert.equal(nodeVm.runInContext("setPetLanguage('ko-KR');t('上传动画')",sandbox),'애니메이션 업로드');
  assert.equal(nodeVm.runInContext("t('已显示 {name}',{name:'{time} My 宠物'})",sandbox),'{time} My 宠物 표시 중');
});

test('manager switches all nine languages, preserves names and persists reminder preferences', async () => {
  const pet={id:'builtin',name:'上传动画',frameCount:0,animations:{},triggerSlots:[{id:'TRIGGER_X',event:'tool.changed',tool:'pencil',cooldownMs:0,idleSeconds:60}]};
  const stored=new Map([['pet-sprites',[pet]],['preferences',{language:'zh-CN',scale:3,enabled:false,unsavedMinutes:17,breakMinutes:33}]]);
  const views=[],messages=[],errors=[];let listener;
  const sandbox=nodeVm.createContext({navigator:{languages:['en-US']},moonsprite:{storage:{get:async key=>stored.get(key),set:async(key,value)=>stored.set(key,value)},window:{onMessage:fn=>listener=fn,postMessage:async value=>{messages.push(value);if(value.type==='ui-state')views.push(value)}},diagnostics:{log:error=>errors.push(error)}}});
  nodeVm.runInContext(generated.storeSource+generated.managerSource,sandbox);
  await new Promise(resolve=>setImmediate(resolve));
  const send=async message=>{listener(message);await nodeVm.runInContext('operations',sandbox)};
  const flatten=nodes=>nodes.flatMap(node=>[node,...flatten(node.children||[])]);
  for(const [locale] of languages){
    await send({type:'ui-language',values:{language:locale}});
    const nodes=flatten(views.at(-1).nodes),byId=id=>nodes.find(node=>node.id===id);
    assert.equal(byId('edit-builtin').label,'上传动画'); // User text must never be translated.
    assert.equal(byId('upload-IDLE').label,catalogs[locale]['上传动画']);
    assert.equal(byId('slot-TRIGGER_X').label,catalogs[locale]['切换工具']+' · '+catalogs[locale]['画笔']);
    assert.equal(stored.get('preferences').language,locale);
    assert.equal(stored.get('preferences').scale,3);
    await send({type:'ui-add-trigger',petId:'builtin'});
    const dialog=flatten(views.at(-1).nodes).find(node=>node.id==='trigger-event');
    assert.equal(dialog.options[0].label,catalogs[locale]['撤销']);
    assert.equal(dialog.options[0].description,catalogs[locale]['实际完成一次撤销后播放。']);
    await send({type:'ui-cancel-trigger'});
  }
  await send({type:'ui-preference',key:'remindersEnabled',value:false});
  assert.ok(!flatten(views.at(-1).nodes).some(node=>node.id==='clockEnabled'));
  await send({type:'ui-preference',key:'remindersEnabled',value:true});
  await send({type:'ui-preference',key:'unsavedEnabled',value:false});
  assert.ok(!flatten(views.at(-1).nodes).some(node=>node.id==='unsavedMinutes'));
  assert.ok(flatten(views.at(-1).nodes).some(node=>node.id==='breakMinutes'));
  await send({type:'ui-preference',key:'breakMinutes',values:{breakMinutes:42}});
  assert.equal(stored.get('preferences').breakMinutes,42);
  assert.equal(stored.get('preferences').unsavedMinutes,17);
  assert.equal(stored.get('preferences').enabled,false);
  assert.deepEqual(errors,[]);
  assert.ok(messages.some(message=>message.type==='catalog'));
});

test('runtime broadcasts the selected language and translates menus after preference changes', async () => {
  const stored=new Map([['preferences',{language:'ja-JP'}]]),handlers={},menus=[],sent=[];
  const sandbox=nodeVm.createContext({moonsprite:{on:(name,fn)=>handlers[name]=fn,storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},menus:{setItems:async value=>menus.push(value)},windows:{open:async()=>{},close:async()=>{},postMessage:async value=>sent.push(value)},diagnostics:{log:error=>{throw Error(error.message)}}}});
  nodeVm.runInContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/)[1],sandbox);
  await activatePets(handlers,['builtin']);
  await handlers['window-message']({windowId:'pet-builtin',message:{type:'ready'}});
  assert.equal(sent.at(-1).message.preferences.language,'ja-JP');
  assert.equal(menus.at(-1).items.find(item=>item.id==='manager').name,catalogs['ja-JP']['宠物管理…']);
  stored.set('preferences',{...stored.get('preferences'),language:'de-DE'});
  await handlers['window-message']({windowId:'manager',message:{type:'catalog'}});
  assert.equal(sent.at(-1).message.preferences.language,'de-DE');
  assert.equal(menus.at(-1).items.find(item=>item.id==='manager').name,catalogs['de-DE']['宠物管理…']);
});

test('host locale changes follow by default, localize the built-in name, and never enable pets', async () => {
  const stored=new Map([['preferences',{language:'auto',enabled:false}],['shownPets',['builtin']],['pet-sprites',[{id:'builtin',localizedName:'奶龙',name:'奶龙',frameCount:1}]]]);
  const handlers={},opened=[],sent=[],menus=[];
  const sandbox=nodeVm.createContext({moonsprite:{on:(name,fn)=>handlers[name]=fn,storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},menus:{setItems:async value=>menus.push(value)},windows:{open:async value=>opened.push(value),close:async()=>{},postMessage:async value=>sent.push(value)},diagnostics:{log:error=>{throw Error(error.message)}}}});
  nodeVm.runInContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/)[1],sandbox);
  await handlers['locale-changed']({locale:'de-DE'});
  assert.deepEqual(opened,[]);
  await handlers.activate();
  assert.deepEqual(opened,[]);
  assert.equal(menus.at(-1).items.find(item=>item.id==='manager').name,catalogs['de-DE']['宠物管理…']);
  await handlers.command({event:'toggle-pet',commandId:'builtin'});
  await handlers['window-message']({windowId:'pet-builtin',message:{type:'ready'}});
  assert.equal(sent.at(-1).message.pet.name,'Nailong');
  await handlers['locale-changed']({locale:'ja-JP'});
  assert.equal(sent.at(-1).message.pet.name,'ナイロン');
  assert.equal(sent.at(-1).message.preferences.hostLocale,'ja-JP');
  stored.set('preferences',{...stored.get('preferences'),language:'zh-CN'});
  await handlers['locale-changed']({locale:'fr-FR'});
  assert.equal(sent.at(-1).message.pet.name,'奶龙');
  assert.equal(opened.length,1);
});

test('new built-in assets replace old animation overrides while preserving scale and mirror', () => {
  const sandbox=nodeVm.createContext({});
  nodeVm.runInContext(createLocalizationSource()+vm.runInContext('builtinSource',context),sandbox);
  const builtin={id:'builtin',name:'奶龙',localizedName:'奶龙',assetVersion:'new',source:'builtin',animations:{SHOW:[0],IDLE:[1],TRIGGER_TOUCH:[2],TRIGGER_UNDO:[3]},triggerSlots:[{id:'TRIGGER_TOUCH',event:'pet.enter',cooldownMs:0},{id:'TRIGGER_UNDO',event:'history.undo',cooldownMs:0}]};
  sandbox.builtin=builtin;
  sandbox.saved={id:'builtin',name:'Old',source:'custom',spriteKey:'old',scale:4,mirrored:true,animations:{IDLE:[77]}};
  const migrated=nodeVm.runInContext('resolveBuiltin(saved,builtin)',sandbox);
  assert.equal(migrated.name,'Nailong');
  assert.equal(migrated.source,'builtin');
  assert.equal(migrated.spriteKey,undefined);
  assert.equal(migrated.scale,4);assert.equal(migrated.mirrored,true);
  assert.deepEqual(migrated.animations,builtin.animations);
  assert.deepEqual(migrated.triggerSlots,builtin.triggerSlots);
  sandbox.saved={...migrated,animations:{...migrated.animations,IDLE:[8]}};
  assert.deepEqual(nodeVm.runInContext('resolveBuiltin(saved,builtin).animations.IDLE',sandbox),[8]);
});

test('transparent pet margins never become an input region', async () => {
  const calls=[]
  const sandbox=vm.createContext({
    hitAlpha:new Uint8Array([0,255,0,0]),pointer:null,window:{innerWidth:360,innerHeight:360},
    pet:{frameWidth:2,frameHeight:2},petElement:{getBoundingClientRect:()=>({left:178,top:340,width:4,height:4})},
    info:{hidden:true},notice:{hidden:true},
    moonsprite:{window:{setHitRegion:async(...args)=>calls.push(args)},diagnostics:{log:()=>{}}}
  })
  const start=generated.petWindowSource.indexOf('const updateHitRegion=')
  const end=generated.petWindowSource.indexOf('const scheduleHitRegion=',start)
  vm.runInContext(generated.petWindowSource.slice(start,end),sandbox)
  vm.runInContext('updateHitRegion()',sandbox)
  assert.equal(calls.length,1)
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])),[{x:180,y:340,width:2},{x:180,y:341,width:2}])
})

test('clicking a pet without a project still shows a bubble', async () => {
  const notices = []
  const start = generated.petWindowSource.indexOf('const showInfo=')
  const end = generated.petWindowSource.indexOf('const showNotice=', start)
  const sandbox = vm.createContext({project:null,pet:{name:'奶龙'},showNotice:async text=>notices.push(text)})
  vm.runInContext(generated.petWindowSource.slice(start,end),sandbox)
  await vm.runInContext('showInfo()',sandbox)
  assert.equal(notices.length,1)
  assert.match(notices[0],/奶龙/)
})

test('multiple pets have independent windows, positions and scales', async () => {
 const handlers={},opened=[],closed=[],visibility=[],sent=[],stored=new Map([['shownPets',[]],['pet-sprites',[{id:'custom',frameWidth:20,frameHeight:20,frameCount:1,scale:3}]]])
 vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],{moonsprite:{menus:{setItems:async()=>{}},on:(name,fn)=>handlers[name]=fn,storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},windows:{setVisible:async payload=>visibility.push(payload),open:async payload=>opened.push(payload),close:async payload=>closed.push(payload),postMessage:async payload=>sent.push(payload)},diagnostics:{log:async()=>{}}}})
 await activatePets(handlers,['builtin','custom'])
 closed.length=0
 assert.deepEqual(opened.map(value=>value.windowId),['pet-builtin','pet-custom'])
 await handlers['window-message']({windowId:'pet-custom',message:{type:'ready'}})
 assert.equal(sent.at(-1).message.preferences.scale,3)
 assert.equal(sent.at(-1).message.positionKey,'position:custom')
 stored.set('shownPets',['custom'])
 await handlers['window-message']({windowId:'manager',message:{type:'catalog'}})
 assert.deepEqual(closed,[])
 assert.equal(visibility[0].windowId,'pet-builtin');assert.equal(visibility[0].visible,false)
 assert.equal(opened.length,2)
 await handlers.command({event:'manager'})
 assert.equal(opened.at(-1).options.component,'form')
})

test('configuration does not restart the ready handshake', async () => {
  const branch = generated.petWindowSource.match(/if\(message.type==='configure'\)\{([\s\S]*?);return\}/)[1]
  let refreshed = 0
  const sandbox = vm.createContext({message:{playShow:true}, activePets:null,positionKey:'position', preferences:{}, activePetId:'builtin', applyCursorPolicy:()=>{}, refreshCatalog:async()=>{refreshed++}, moonsprite:{window:{postMessage:()=>{throw new Error('Repeated handshake')}}}})
  vm.runInContext('(async()=>{'+branch+'})()', sandbox)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(refreshed, 1)
})

test('GIF frames keep their vertical positions and individual durations', async () => {
  const draws = []
  const sandbox = vm.createContext({
    document:{createElement:()=>({getContext:()=>({drawImage:(...args)=>draws.push(args),clearRect:()=>{}})})},
    requestAnimationFrame: callback => callback(), setTimeout: callback => callback(),
    ImageDecoder: class {
      tracks={ready:Promise.resolve(),selectedTrack:{frameCount:2}}
      completed=Promise.resolve()
      async decode({frameIndex}) { return {image:{displayWidth:2,displayHeight:3,duration:(frameIndex+1)*100000,close(){}}} }
      close(){}
    }
  })
  const start = generated.managerSource.indexOf('const scaleSurface=')
  const end = generated.managerSource.indexOf('const decodeStill=')
  vm.runInContext('const MAX_EDGE=192,MAX_FRAMES=120;'+generated.managerSource.slice(start,end),sandbox)
  const result = await vm.runInContext('decodeGif(new Uint8Array())',sandbox)
  assert.equal(result.sheet.width,2)
  assert.equal(result.sheet.height,6)
  assert.deepEqual(Array.from(result.durations),[100,200])
  assert.deepEqual(draws.slice(-2).map(args=>args[2]),[0,3])
})

test('sprite storage is shared across windows and failures propagate', async () => {
  const values = new Map()
  const moonsprite = {storage:{get:async key=>values.get(key),set:async(key,value)=>values.set(key,value),remove:async key=>values.delete(key)}}
  const manager = vm.createContext({moonsprite,TextEncoder}), companion = vm.createContext({moonsprite,TextEncoder})
  vm.runInContext(generated.storeSource,manager)
  vm.runInContext(generated.storeSource,companion)
  await vm.runInContext("spriteWrite('custom-1','data:image/png;base64,abc')",manager)
  assert.equal(await vm.runInContext("spriteRead('custom-1')",companion),'data:image/png;base64,abc')
  await assert.rejects(vm.runInContext("spriteWrite('large','x'.repeat(250001))",manager),/容量/)
  moonsprite.storage.set=async()=>{throw new Error('quota')}
  await assert.rejects(vm.runInContext('writeMeta([])',manager),/quota/)
})

test('opening and closing a bubble preserves the native window bounds', async () => {
  const start = generated.petWindowSource.indexOf('const setExpanded=')
  const end = generated.petWindowSource.indexOf('const syncBubbleLayout=',start)
  let resizes=0
  const sandbox=vm.createContext({desiredExpanded:false,expanded:false,boundsQueue:Promise.resolve(),compactSize:()=>({width:360,height:360}),updateHitRegion:()=>{},moonsprite:{window:{getBounds:async()=>({x:20,y:30,width:360,height:360}),setBounds:async()=>{resizes++}},diagnostics:{log:()=>{}}}})
  vm.runInContext(generated.petWindowSource.slice(start,end),sandbox)
  await vm.runInContext('setExpanded(true)',sandbox)
  await vm.runInContext('setExpanded(false)',sandbox)
  assert.equal(resizes,0)
})

test('drag bounds use visible content and allow the transparent window above the host', () => {
  const start=generated.petWindowSource.indexOf('const clampPetBounds=')
  const end=generated.petWindowSource.indexOf('let dragQueue=',start)
  const sandbox=vm.createContext({})
  vm.runInContext(generated.petWindowSource.slice(start,end),sandbox)
  const clamp=vm.runInContext('clampPetBounds',sandbox)
  const host={x:0,y:0,width:1000,height:700},content={x:260,y:280,width:80,height:60}
  const topLeft=clamp({x:-500,y:-500,width:360,height:360},host,content)
  assert.equal(topLeft.x,-260);assert.equal(topLeft.y,-280)
  assert.equal(topLeft.x+content.x,0);assert.equal(topLeft.y+content.y,0)
  const bottomRight=clamp({x:2000,y:2000,width:360,height:360},host,content)
  assert.equal(bottomRight.x+content.x+content.width,1000)
  assert.equal(bottomRight.y+content.y+content.height,700)
})

test('dragging drops stale requests and applies the latest pointer position', async () => {
  const start=generated.petWindowSource.indexOf('const movePet=')
  const end=generated.petWindowSource.indexOf('// Coalesce host changes',start)
  const requests=[],releases=[]
  const sandbox=vm.createContext({stopDraggingAnimation:()=>{},hostEpoch:0,clampPetBounds:bounds=>bounds,moonsprite:{window:{setBounds:bounds=>{requests.push(bounds);return new Promise(resolve=>releases.push(resolve))}},diagnostics:{log:()=>{}}}})
  vm.runInContext('let dragQueue=null,pendingDrag=null;'+generated.petWindowSource.slice(start,end),sandbox)
  sandbox.gesture={epoch:0,x:0,y:0,origin:Promise.resolve([{x:0,y:0,width:360,height:360},{}]),content:{}}
  vm.runInContext('movePet(gesture,1,1)',sandbox)
  await new Promise(resolve=>setImmediate(resolve))
  for(let x=2;x<=100;x++)vm.runInContext('movePet(gesture,'+x+',0)',sandbox)
  assert.equal(requests.length,1)
  releases.shift()()
  await new Promise(resolve=>setImmediate(resolve))
  assert.equal(requests.length,2)
  assert.equal(requests[1].x,100)
  releases.shift()()
  await new Promise(resolve=>setImmediate(resolve))
})

test('multiple named animations share one aligned sheet and keep separate frame ranges', () => {
  const draws=[]
  const sandbox=vm.createContext({document:{createElement:()=>({getContext:()=>({drawImage:(...args)=>draws.push(args)})})}})
  const start=generated.managerSource.indexOf('const combineAnimations=')
  const end=generated.managerSource.indexOf('const importAnimations=',start)
  vm.runInContext(generated.managerSource.slice(start,end),sandbox)
  sandbox.parts=[{name:'SHOW',sheet:{width:4,height:6},durations:[80,90]},{name:'IDLE',sheet:{width:2,height:2},durations:[120]},{name:'WAVE',sheet:{width:3,height:4},durations:[150]}]
  const result=vm.runInContext('combineAnimations(parts)',sandbox)
  assert.equal(result.sheet.width,4)
  assert.equal(result.sheet.height,16)
  assert.deepEqual(Array.from(result.animations.SHOW),[0,1])
  assert.deepEqual(Array.from(result.animations.IDLE),[2])
  assert.deepEqual(Array.from(result.animations.WAVE),[3])
  assert.deepEqual(Array.from(result.durations),[80,90,120,150])
  assert.equal(draws[2][5],1)
  assert.equal(draws[2][6],10)
})

test('supplementing SHOW preserves IDLE, drops unsupported slots, and rollback preserves the old sheet', async () => {
  let meta=[{id:'custom-1',name:'Test',source:'custom',frameWidth:2,frameHeight:2,frameCount:3,animations:{IDLE:[0],SHOW:[1],WAVE:[2]},durations:[100,200,300],mirrored:true}]
  const sprites=new Map([['custom-1','old-sheet']]);let rejectMeta=false
  const sandbox=vm.createContext({
    document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'new-sheet'})},
    readMeta:async()=>meta,listPets:async()=>meta,loadSheetUrl:async()=>({url:'old',revoke:false}),decodeImage:async()=>({}),
    decodeStill:async()=>({sheet:{width:2,height:4},durations:[40,50]}),
    spriteWrite:async(key,value)=>sprites.set(key,value),spriteDelete:async key=>sprites.delete(key),
    writeMeta:async value=>{if(rejectMeta)throw new Error('quota');meta=value},
    publish:async()=>{},activeId:'other',status:'',moonsprite:{window:{postMessage:async()=>{}}}
  })
  const sliceStart=generated.managerSource.indexOf('const sliceSheet=')
  const sliceEnd=generated.managerSource.indexOf('let activeId=',sliceStart)
  vm.runInContext(generated.managerSource.slice(sliceStart,sliceEnd),sandbox)
  const start=generated.managerSource.indexOf('const combineAnimations=')
  const end=generated.managerSource.indexOf('let operations=',start)
  vm.runInContext(generated.managerSource.slice(start,end),sandbox)
  await vm.runInContext("importAnimations([{animation:'SHOW',bytes:[1],mime:'image/png'}],'custom-1')",sandbox)
  assert.equal(meta.length,1);assert.equal(meta[0].id,'custom-1');assert.equal(meta[0].mirrored,true)
  assert.deepEqual(Array.from(meta[0].animations.IDLE),[0])
  assert.equal(meta[0].animations.WAVE,undefined)
  assert.deepEqual(Array.from(meta[0].animations.SHOW),[1,2])
  assert.deepEqual(Array.from(meta[0].durations),[100,40,50])
  assert.equal(sprites.has('custom-1'),false)
  const saved=meta[0],key=saved.spriteKey
  rejectMeta=true
  await new Promise(resolve=>setTimeout(resolve,2))
  await assert.rejects(vm.runInContext("importAnimations([{animation:'SHOW',bytes:[1],mime:'image/png'}],'custom-1')",sandbox),/quota/)
  assert.equal(meta[0],saved);assert.equal(sprites.has(key),true);assert.equal(sprites.size,1)
})

test('manifest keeps a neutral settings launcher and runtime owns localized menus', () => {
 const manifest=vm.runInContext('manifest',context);
 assert.deepEqual(Array.from(manifest.topMenus[0].commands),['settings']);
 assert.deepEqual(Array.from(manifest.settingsUi.controls,c=>c.id),['manager']);
 assert.equal(manifest.settingsUi.controls[0].fullWidth,true);
 assert.equal(manifest.settingsUi.controls[0].closeOnRun,true);
 assert.ok(generated.runtimePage.includes("name:t('宠物管理…')"));
});

test('mirrored playback flips the actual drawn pixels, not only the element', () => {
  const calls=[]
  const sandbox=vm.createContext({boundsForAnimation:()=>null,info:{hidden:true},notice:{hidden:true},animationToken:0,pointer:null,image:{},pet:{mirrored:true,frameWidth:2,frameHeight:2,durations:[125],idleFrames:[0]},hitAlpha:null,
    context:{clearRect(){},save(){},translate:(...args)=>calls.push(['translate',...args]),scale:(...args)=>calls.push(['scale',...args]),drawImage(){},restore(){},getImageData:()=>({data:new Uint8Array(16)})},scheduleHitRegion(){},setTimeout(){}})
  const start=generated.petWindowSource.indexOf('const play=')
  const end=generated.petWindowSource.indexOf('const showInfo=',start)
  vm.runInContext(generated.petWindowSource.slice(start,end),sandbox)
  vm.runInContext('play([0],true)',sandbox)
  assert.deepEqual(calls,[['translate',2,0],['scale',-1,1]])
})

test('reminders use actual elapsed minutes and ignore old custom wording', async () => {
 const handlers={},sent=[],base=Date.now(),storage=new Map([['preferences',{breakMinutes:1,unsavedMinutes:1,clockEnabled:false,unsavedText:'OLD',breakText:'OLD'}]])
 const sandbox=vm.createContext({setTimeout,clearTimeout,moonsprite:{menus:{setItems:async()=>{}},on:(name,fn)=>handlers[name]=fn,storage:{set:async({key,value})=>storage.set(key,value),get:async({key})=>storage.get(key)},windows:{setVisible:async()=>{},open:async()=>{},close:async()=>{},postMessage:async payload=>{sent.push(payload);if(payload.message.type==='notice-distance')await handlers['window-message']({windowId:payload.windowId,message:{...payload.message,distance:10}})}},diagnostics:{log:async()=>{}}}})
 vm.runInContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],sandbox)
 await activatePets(handlers)
 await handlers['window-message']({windowId:'pet-builtin',message:{type:'ready'}})
 await handlers.project({project:{id:'doc',dirty:true,contentRevision:0},homeOpen:false})
 await handlers.project({project:{id:'doc',dirty:true,contentRevision:1},homeOpen:false})
 handlers.clock({timestamp:base+121000})
 await vm.runInContext('noticeQueue',sandbox)
 const texts=sent.filter(item=>item.message.type==='notice').map(item=>item.message.text)
 assert.ok(texts.some(text=>text.includes('2 分钟没有保存文件')))
 assert.ok(texts.some(text=>text.includes('连续绘制了 2 分钟')))
 assert.ok(texts.every(text=>!text.includes('OLD')))
})

test('extension manager stages animation names and toggles visibility without replacing other pets', async () => {
 const store=new Map([['shownPets',['builtin']]])
 let meta=[{id:'custom',name:'Second',source:'custom',frameCount:1}]
 let listener
 const sandbox=vm.createContext({activeId:'custom',staged:[],nameInput:{value:''},result:null,status:'',SLOT_COUNT:8,BUILT_IN:{id:'builtin'},readMeta:async()=>meta,listPets:async()=>[{id:'builtin',frameCount:1},...meta],writeMeta:async value=>meta=value,publish:async()=>{},renderList:async()=>{},moonsprite:{on:()=>{},window:{onMessage:fn=>listener=fn},storage:{get:async key=>store.get(key),set:async(key,value)=>store.set(key,value)},diagnostics:{log:async()=>{}}}})
 const start=generated.managerSource.indexOf('let operations=')
 const end=generated.managerSource.indexOf('renderList().catch',start)
 vm.runInContext(generated.managerSource.slice(start,end),sandbox)
 const dispatch=async message=>{listener(message);await vm.runInContext('operations',sandbox)}
 await dispatch({type:'ui-stage',petId:'custom',files:[{name:'SHOW.gif',mime:'image/gif',bytes:[1]}],requestId:'1'})
 assert.equal(sandbox.staged[0].animation,'SHOW')
 await dispatch({type:'ui-visible',petId:'custom',value:true,requestId:'2'})
 assert.deepEqual(Array.from(store.get('shownPets')),['builtin','custom'])
 await dispatch({type:'ui-scale',petId:'custom',values:{scale:3},requestId:'3'})
 assert.equal(meta[0].scale,3)
 await dispatch({type:'ui-visible',petId:'builtin',value:false,requestId:'4'})
 assert.deepEqual(Array.from(store.get('shownPets')),['custom'])
})


test('manager opens even while pet initialization is pending or fails', async () => {
 const handlers={},opened=[];let rejectRead;
 vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],{moonsprite:{menus:{setItems:async()=>{}},on:(name,fn)=>handlers[name]=fn,storage:{get:()=>new Promise((_,reject)=>{rejectRead=reject})},windows:{setVisible:async()=>{},open:async payload=>opened.push(payload)},diagnostics:{log:async()=>{}}}})
 const activation=handlers.activate();const failed=assert.rejects(activation,/storage failed/);
 await handlers.command({event:'manager'});
 assert.equal(opened.length,1);
 rejectRead(new Error('storage failed'));await failed;
 await handlers.command({event:'manager'});
 assert.equal(opened.length,2);
})

test('a failed pet does not block the other pets and can be opened on the next change', async () => {
 const handlers={},opened=[],sent=[],stored=new Map([['shownPets',[]],['pet-sprites',[{id:'custom',frameWidth:20,frameHeight:20,frameCount:1,scale:3}]]]);let fail=true;
 vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],{moonsprite:{menus:{setItems:async()=>{}},on:(name,fn)=>handlers[name]=fn,storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},windows:{setVisible:async()=>{},open:async payload=>{if(fail&&payload.windowId==='pet-builtin')throw Error('open failed');opened.push(payload)},close:async()=>{},postMessage:async payload=>sent.push(payload)},diagnostics:{log:async()=>{}}}})
 await activatePets(handlers,['builtin','custom']);assert.deepEqual(opened.map(p=>p.windowId),['pet-custom']);
 await handlers['window-message']({windowId:'pet-custom',message:{type:'ready'}});sent.length=0;
 fail=false;stored.set('pet-sprites',[{id:'custom',frameWidth:20,frameHeight:20,frameCount:1,scale:4}]);
 await handlers['window-message']({windowId:'manager',message:{type:'catalog'}});
 assert.deepEqual(opened.map(p=>p.windowId),['pet-custom','pet-builtin']);
 assert.equal(sent.find(p=>p.windowId==='pet-custom').message.preferences.scale,4);
})


test('activation restores pets when the previous session had them enabled and publishes only usable menu items', async () => {
 const handlers={},opened=[],menus=[],stored=new Map([['preferences',{enabled:true}],['shownPets',['builtin']],['pet-sprites',[{id:'empty',name:'Empty',frameCount:0}]]]);
 vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],{moonsprite:{on:(name,fn)=>handlers[name]=fn,menus:{setItems:async value=>menus.push(value)},storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},windows:{setVisible:async()=>{},open:async value=>opened.push(value),close:async()=>{},postMessage:async()=>{}},diagnostics:{log:async()=>{}}}});
 await handlers.activate();
 assert.deepEqual(opened.map(p=>p.windowId),['pet-builtin']);
 assert.equal(stored.get('preferences').enabled,true);
 assert.deepEqual(Array.from(stored.get('shownPets')),['builtin']);
 assert.deepEqual(Array.from(menus.at(-1).items.filter(item=>item.event==='toggle-pet'),item=>item.id),['builtin']);
 assert.equal(menus.at(-1).items.find(item=>item.id==='builtin').checked,true);

 await handlers.command({event:'toggle-pet',commandId:'builtin'});
 assert.equal(menus.at(-1).items.find(item=>item.id==='builtin').checked,false);
 await handlers.command({event:'toggle-pet',commandId:'builtin'});
 assert.equal(menus.at(-1).items.find(item=>item.id==='builtin').checked,true);
 assert.equal(opened.length,1);
})

test('two pet windows keep their own configuration and sheet even if a foreign message arrives', async () => {
 const branch=generated.petWindowSource.match(/if\(message.type==='configure'\)\{([\s\S]*?);return\}/)[1];
 const start=generated.petWindowSource.indexOf('let catalogQueue='),end=generated.petWindowSource.indexOf("petElement.addEventListener('pointerdown'",start);
 const make=id=>{
  const loaded=[];
  const state=vm.createContext({activePets:null,activePetId:'builtin',positionKey:'position',preferences:{},pet:null,catalog:[],slotPets:[],SLOT_COUNT:8,BUILT_IN:{id:'builtin'},moonsprite:{window:{id,postMessage:async()=>{}},diagnostics:{log:async error=>{throw Error(error)}}},applyCursorPolicy:()=>{},loadPet:async pet=>{loaded.push(pet);state.pet=pet},updateScale:()=>{},play:()=>{},reportCatalog:()=>{},listPets:async()=>{throw Error('Configuration must carry the assigned pet')}});
  vm.runInContext(generated.petWindowSource.slice(start,end),state);
  return {loaded,async send(message){state.message=message;await vm.runInContext('(async()=>{'+branch+'})()',state);await vm.runInContext('catalogQueue',state)}};
 };
 const first=make('pet-builtin'),second=make('pet-custom');
 const a={type:'configure',windowId:'pet-builtin',activePetId:'builtin',pet:{id:'builtin',source:'builtin',frameCount:1}},b={type:'configure',windowId:'pet-custom',activePetId:'custom',pet:{id:'custom',source:'custom',spriteKey:'sheet-custom',frameCount:1}};
 await Promise.all([first.send(a),second.send(b)]);
 await Promise.all([first.send(b),second.send(a)]);
 assert.equal(first.loaded.length,1);assert.equal(second.loaded.length,1);
 assert.equal(first.loaded[0].source,'builtin');assert.equal(second.loaded[0].spriteKey,'sheet-custom');
})


test('menu toggles restore all selected pets and reopening does not depend on a second ready event', async () => {
 const handlers={},opened=[],shown=new Map(),messages=[],stored=new Map([['shownPets',[]],['pet-sprites',[{id:'custom',name:'Second',frameWidth:2,frameHeight:2,frameCount:1,source:'custom',spriteKey:'custom-sheet'}]]]);
 vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],{moonsprite:{on:(name,fn)=>handlers[name]=fn,menus:{setItems:async()=>{}},storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},windows:{open:async p=>{opened.push(p.windowId);shown.set(p.windowId,true)},close:async p=>{if(p.windowId!=='companion')throw Error('Visibility must not destroy the pet window')},setVisible:async p=>shown.set(p.windowId,p.visible),postMessage:async p=>messages.push(p)},diagnostics:{log:async error=>{throw Error(error.message)}}}});
 await activatePets(handlers,['builtin','custom']);
 for(const id of opened)await handlers['window-message']({windowId:id,message:{type:'ready'}});
 stored.set('preferences',{enabled:false});await handlers['settings-changed']({key:'preferences'});
 assert.equal(shown.get('pet-custom'),false);
 await handlers.command({event:'toggle-pet',commandId:'builtin'});
 assert.equal(shown.get('pet-builtin'),true);assert.equal(shown.get('pet-custom'),true);
 for(let i=0;i<3;i++){
  await handlers.command({event:'toggle-pet',commandId:'builtin'});assert.equal(shown.get('pet-builtin'),false);
  await handlers.command({event:'toggle-pet',commandId:'builtin'});assert.equal(shown.get('pet-builtin'),true);
  assert.equal(shown.get('pet-custom'),true);
 }
 await Promise.all([handlers.command({event:'toggle-pet',commandId:'custom'}),handlers.command({event:'toggle-pet',commandId:'custom'})]);
 assert.equal(shown.get('pet-custom'),true);assert.deepEqual(opened,['pet-builtin','pet-custom']);
 const configured=messages.filter(p=>p.windowId==='pet-custom'&&p.message.type==='configure');
 assert.ok(configured.length>1);assert.equal(configured.at(-1).message.pet.spriteKey,'custom-sheet');
})


test('home and different projects preserve selected pets and their shared positions', async () => {
 const handlers={},opened=[],shown=new Map(),sent=[],stored=new Map([
  ['shownPets',[]],['position:builtin',{x:42,y:67}],['position:custom',{x:123,y:89}],
  ['pet-sprites',[{id:'custom',frameWidth:2,frameHeight:2,frameCount:1}]]
 ]);
 vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],{moonsprite:{on:(name,fn)=>handlers[name]=fn,menus:{setItems:async()=>{}},storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},windows:{open:async p=>{opened.push(p);shown.set(p.windowId,true)},setVisible:async p=>shown.set(p.windowId,p.visible),close:async()=>{},postMessage:async p=>sent.push(p)},diagnostics:{log:async e=>{throw Error(e.message)}}}});
 await activatePets(handlers,['builtin','custom']);assert.equal(opened.length,2);
 await handlers.project({project:{id:'first'},homeOpen:true});assert.equal(opened.length,2);
 await handlers.project({project:{id:'first'},homeOpen:false});assert.equal(opened.length,2);
 assert.deepEqual(opened.map(p=>[p.options.x,p.options.y]),[[42,67],[123,89]]);
 for(const p of opened)await handlers['window-message']({windowId:p.windowId,message:{type:'ready'}});
 await handlers.project({project:{id:'first'},homeOpen:true});assert.deepEqual([...shown.values()],[true,true]);
 await handlers.command({event:'toggle-pet',commandId:'custom'});assert.deepEqual([...shown.values()],[true,false]);
 await handlers.project({project:{id:'second'},homeOpen:false});assert.deepEqual([...shown.values()],[true,false]);
 await handlers.command({event:'toggle-pet',commandId:'custom'});assert.deepEqual([...shown.values()],[true,true]);
 assert.equal(opened.length,2);
 const configs=sent.filter(p=>p.message.type==='configure');
 assert.equal(configs.at(-1).message.positionKey,'position:custom');assert.equal(configs.at(-1).message.project.id,'second');
 assert.deepEqual(stored.get('position:custom'),{x:123,y:89});
 await handlers.project({project:null,homeOpen:false});assert.deepEqual([...shown.values()],[true,true]);
});

test('animation silhouette union remains complete while dragging and mirrors with the sprite', () => {
 let frame=0;const calls=[];
 const sandbox=vm.createContext({hitAlpha:null,pointer:{dragged:true},document:{createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage:(_image,_x,y)=>frame=-y/2,getImageData:()=>{const data=new Uint8Array(24);data[(frame===0?0:5)*4+3]=255;return{data}}})})},
  window:{innerWidth:100,innerHeight:100},pet:{frameWidth:3,frameHeight:2,mirrored:false},petElement:{getBoundingClientRect:()=>({left:10,top:20,width:6,height:4})},info:{hidden:true},notice:{hidden:true},
  moonsprite:{window:{setHitRegion:async(...args)=>calls.push(args)},diagnostics:{log:()=>{}}}});
 let start=generated.petWindowSource.indexOf('const findSpriteBounds='),end=generated.petWindowSource.indexOf('const movePet=',start);
 vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 const bounds=vm.runInContext('findSpriteBounds({}, {frameWidth:3,frameHeight:2,frameCount:2})',sandbox);
 assert.deepEqual(JSON.parse(JSON.stringify(bounds)),{x:0,y:0,width:3,height:2});
 assert.deepEqual(Array.from(sandbox.hitAlpha),[255,0,0,0,0,255]);
 start=generated.petWindowSource.indexOf('const updateHitRegion=');end=generated.petWindowSource.indexOf('const scheduleHitRegion=',start);
 vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);vm.runInContext('updateHitRegion()',sandbox);
 assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2])),[{x:10,y:20,width:2},{x:10,y:21,width:2},{x:14,y:22,width:2},{x:14,y:23,width:2}]);
 sandbox.pet.mirrored=true;vm.runInContext('updateHitRegion()',sandbox);
 assert.deepEqual(Array.from(calls[1][2],p=>p.x),[14,14,10,10]);
});

test('host shrink corrects an in-flight drag and preserves visible content within new bounds', async () => {
 const content={x:200,y:260,width:100,height:80};let bounds={x:1300,y:700,width:360,height:360},host={x:0,y:0,width:800,height:600};const saved=[],moves=[];
 let finishDrag;const gesture={cancelled:false};
 const sandbox=vm.createContext({pet:{},stopDraggingAnimation:()=>{},hostEpoch:0,positionRatio:{x:1,y:1},positionLoaded:true,pointer:gesture,pendingDrag:{gesture},boundsQueue:Promise.resolve(),dragQueue:new Promise(resolve=>finishDrag=resolve),contentBounds:()=>content,persistPosition:async p=>saved.push(p),scheduleHitRegion:()=>{},
  moonsprite:{window:{getBounds:async()=>({...bounds}),getHostBounds:async()=>({...host}),setBounds:async p=>{moves.push(p);bounds=p}},diagnostics:{log:error=>{throw Error(error)}}}});
 let start=generated.petWindowSource.indexOf('const clampPetBounds='),end=generated.petWindowSource.indexOf('let dragQueue=',start);
 vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 start=generated.petWindowSource.indexOf('// Coalesce host changes');end=generated.petWindowSource.indexOf('const loadPet=',start);
 vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 const correcting=vm.runInContext('hostGeometryChanged()',sandbox);
 assert.equal(gesture.cancelled,true);assert.equal(sandbox.pendingDrag,null);assert.equal(sandbox.pointer,null);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(moves.length,0);
 // A native move already submitted before the resize finishes afterwards.
 bounds={...bounds,x:1500,y:800};finishDrag();await correcting;
 assert.equal(bounds.x+content.x+content.width,800);assert.equal(bounds.y+content.y+content.height,600);
 assert.equal(saved.length,0);
 host={x:8,y:30,width:500,height:400};await vm.runInContext('constrainPet()',sandbox);
 assert.equal(bounds.x+content.x+content.width,508);assert.equal(bounds.y+content.y+content.height,430);
 const count=moves.length;await vm.runInContext('constrainPet()',sandbox);assert.equal(moves.length,count);
});


test('relative pet positions survive maximize, restore, host movement and scale changes without drift', async () => {
 let host={x:8,y:30,width:1800,height:1000},content={x:200,y:260,width:100,height:80};
 let bounds={x:233,y:199,width:360,height:360};const saved=[];
 const sandbox=vm.createContext({pet:{},stopDraggingAnimation:()=>{},hostEpoch:0,positionRatio:null,positionLoaded:false,positionKey:'position:custom',pointer:null,pendingDrag:null,dragQueue:null,boundsQueue:Promise.resolve(),contentBounds:()=>content,persistPosition:async b=>saved.push({...b}),scheduleHitRegion:()=>{},
  moonsprite:{storage:{get:async()=>({ratio:{x:0.2,y:0.8}})},window:{getBounds:async()=>({...bounds}),getHostBounds:async()=>({...host}),setBounds:async b=>{bounds=b}},diagnostics:{log:error=>{throw Error(error)}}}});
 let start=generated.petWindowSource.indexOf('const clampPetBounds='),end=generated.petWindowSource.indexOf('let dragQueue=',start);vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 start=generated.petWindowSource.indexOf('// Coalesce host changes');end=generated.petWindowSource.indexOf('const loadPet=',start);vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 await vm.runInContext('constrainPet()',sandbox);
 const maximized={...bounds};assert.equal(bounds.x+content.x,348);assert.equal(bounds.y+content.y,766);
 for(let i=0;i<3;i++){
  host={x:8,y:30,width:1000,height:600};bounds={...bounds,x:bounds.x-400,y:bounds.y-200};
  await vm.runInContext('hostGeometryChanged()',sandbox);
  assert.equal(bounds.x+content.x,188);assert.equal(bounds.y+content.y,446);
  host={x:8,y:30,width:1800,height:1000};await vm.runInContext('hostGeometryChanged()',sandbox);assert.deepEqual({...bounds},maximized);
 }
 content={x:100,y:100,width:200,height:160};await vm.runInContext('constrainPet()',sandbox);
 assert.equal(bounds.x+content.x,328);assert.equal(bounds.y+content.y,702);
 assert.deepEqual({...sandbox.positionRatio},{x:0.2,y:0.8});
});

test('legacy coordinates migrate to ratios and a drag saves a new ratio for only its pet', async () => {
 const writes=[],host={x:8,y:30,width:1000,height:600},content={x:200,y:260,width:100,height:80};
 const sandbox=vm.createContext({positionKey:'position:cat',contentBounds:()=>content,moonsprite:{window:{getHostBounds:async()=>host},storage:{set:async(...args)=>writes.push(args)}}});
 let start=generated.petWindowSource.indexOf('const clampPetBounds='),end=generated.petWindowSource.indexOf('let dragQueue=',start);vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 start=generated.petWindowSource.indexOf('let positionRatio=');end=generated.petWindowSource.indexOf('// Overlay regions',start);vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 await vm.runInContext('savePosition({x:258,y:30,width:360,height:360})',sandbox);
 assert.equal(writes[0][0],'position:cat');assert.equal(writes[0][1].layout,'relative');
 assert.equal(writes[0][1].ratio.x,0.5);assert.equal(writes[0][1].ratio.y,0.5);
});

test('manager presents independent named upload slots and an aligned scale action', async () => {
 let view;const target={id:'builtin',name:'奶龙',frameCount:0,animations:{},animationSlots:['WAVE']};
 const sandbox=vm.createContext({TRIGGER_CONDITIONS:generated.triggerConditions,BUILT_IN:target,animationMap:entry=>entry.animations,listPets:async()=>[target],moonsprite:{storage:{get:async()=>null},window:{postMessage:async value=>view=value}}});
 const start=generated.managerSource.indexOf('const animationSlots='),end=generated.managerSource.indexOf('const combineAnimations=',start);
 vm.runInContext(generated.managerSource.slice(start,end),sandbox);await vm.runInContext('renderList()',sandbox);
 const [nav,detail]=view.nodes[0].children;assert.equal(nav.children.find(node=>node.id==='edit-builtin').label,'奶龙');assert.equal(nav.children.find(node=>node.id==='edit-builtin').description,'待上传动画');
 const slots=detail.children.filter(node=>node.type==='slot');assert.deepEqual(Array.from(slots,node=>node.id),['slot-SHOW','slot-IDLE']);
 for(const slot of slots){const upload=slot.children.at(-1);assert.equal(upload.multiple,false);assert.equal(upload.action.animation,slot.id.slice(5));assert.equal(upload.action.petId,'builtin')}
 assert.equal(detail.children.find(node=>node.id==='scale-row').align,'end');
 assert.ok(!detail.children.some(node=>node.id==='add-slot-row'));
 for(const slot of slots){assert.equal(slot.children[0].action.type,'ui-clear-slot');assert.equal(slot.children[0].disabled,true)}
});

test('slot uploads bind the selected slot instead of the filename and preserve other slots', async () => {
 let meta=[{id:'custom',name:'Cat',frameCount:1,animations:{IDLE:[0]}}],listener;const uploaded=[];
 const sandbox=vm.createContext({activeId:'custom',staged:[],nameInput:{value:''},result:null,status:'',animationMap:pet=>pet.animations,readMeta:async()=>meta,listPets:async()=>meta,writeMeta:async value=>meta=value,importAnimations:async(files,id)=>uploaded.push({files,id}),renderList:async()=>{},moonsprite:{window:{onMessage:fn=>listener=fn},diagnostics:{log:error=>{throw Error(error)}}}});
 let start=generated.managerSource.indexOf('const animationSlots='),end=generated.managerSource.indexOf('let activeId=',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 start=generated.managerSource.indexOf('let operations=');end=generated.managerSource.indexOf('renderList().catch',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 const send=async message=>{listener(message);await vm.runInContext('operations',sandbox)};
 await send({type:'ui-upload-slot',petId:'custom',animation:'WAVE',files:[{name:'wave.gif',bytes:[1]}],requestId:'1'});assert.equal(sandbox.result.ok,false);assert.equal(uploaded.length,0);
 await send({type:'ui-upload-slot',petId:'custom',animation:'SHOW',files:[{name:'IDLE.gif',bytes:[1]}],requestId:'2'});
 assert.equal(uploaded[0].files[0].animation,'SHOW');assert.equal(uploaded[0].id,'custom');assert.deepEqual(meta[0].animations.IDLE,[0]);
 await send({type:'ui-upload-slot',petId:'other',animation:'SHOW',files:[{name:'a.gif',bytes:[1]}],requestId:'3'});assert.equal(sandbox.result.ok,false);assert.equal(uploaded.length,1);
});


test('SHOW can be uploaded before IDLE and adding IDLE preserves the SHOW frames', async () => {
 let meta=[{id:'custom',name:'Cat',source:'custom',frameWidth:1,frameHeight:1,frameCount:0,animations:{},animationSlots:['SHOW','IDLE','WAVE']}];
 const sprites=new Map();
 const sandbox=vm.createContext({document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'sheet'})},readMeta:async()=>meta,listPets:async()=>meta,loadSheetUrl:async()=>({url:'sheet',revoke:false}),decodeImage:async()=>({}),decodeStill:async()=>({sheet:{width:2,height:2},durations:[100]}),spriteWrite:async(key,value)=>sprites.set(key,value),spriteDelete:async key=>sprites.delete(key),writeMeta:async value=>meta=value,publish:async()=>{},status:''});
 let start=generated.managerSource.indexOf('const sliceSheet='),end=generated.managerSource.indexOf('let activeId=',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 start=generated.managerSource.indexOf('const combineAnimations=');end=generated.managerSource.indexOf('let operations=',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 await vm.runInContext("importAnimations([{animation:'SHOW',bytes:[1],mime:'image/png'}],'custom')",sandbox);
 assert.deepEqual(Array.from(meta[0].animations.SHOW),[0]);assert.deepEqual(Array.from(meta[0].idleFrames),[0]);
 await vm.runInContext("importAnimations([{animation:'IDLE',bytes:[2],mime:'image/png'}],'custom')",sandbox);
 assert.deepEqual(Array.from(meta[0].animations.SHOW),[0]);assert.deepEqual(Array.from(meta[0].animations.IDLE),[1]);assert.deepEqual(Array.from(meta[0].idleFrames),[1]);
 assert.deepEqual(meta[0].animationSlots,['SHOW','IDLE','WAVE']);
});


test('clearing slots preserves the other animation, rolls back failures and allows uploading again', async () => {
 let meta=[{id:'custom',name:'Cat',source:'custom',spriteKey:'original',frameWidth:2,frameHeight:2,frameCount:3,animations:{SHOW:[0,1],IDLE:[2]},durations:[80,90,120],mirrored:true,scale:3}];
 const sprites=new Map([['original','old']]);let fail=false,published=0;
 const sandbox=vm.createContext({document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toDataURL:()=> 'new-sheet'})},readMeta:async()=>meta,listPets:async()=>meta,loadSheetUrl:async()=>({url:'sheet',revoke:false}),decodeImage:async()=>({}),decodeStill:async()=>({sheet:{width:2,height:2},durations:[100]}),spriteWrite:async(key,value)=>sprites.set(key,value),spriteDelete:async key=>sprites.delete(key),writeMeta:async value=>{if(fail)throw Error('quota');meta=value},publish:async()=>{published++},status:''});
 let start=generated.managerSource.indexOf('const sliceSheet='),end=generated.managerSource.indexOf('let activeId=',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 start=generated.managerSource.indexOf('const combineAnimations=');end=generated.managerSource.indexOf('let operations=',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 fail=true;await assert.rejects(vm.runInContext("importAnimations([],'custom','SHOW')",sandbox),/quota/);
 assert.equal(meta[0].spriteKey,'original');assert.deepEqual([...sprites.keys()],['original']);assert.equal(published,0);
 fail=false;await vm.runInContext("importAnimations([],'custom','SHOW')",sandbox);
 assert.equal(meta[0].animations.SHOW,undefined);assert.deepEqual(Array.from(meta[0].animations.IDLE),[0]);assert.deepEqual(Array.from(meta[0].durations),[120]);assert.equal(meta[0].frameCount,1);
 assert.equal(meta[0].mirrored,true);assert.equal(meta[0].scale,3);assert.equal(sprites.has('original'),false);assert.equal(sprites.size,1);
 fail=true;await assert.rejects(vm.runInContext("importAnimations([],'custom','IDLE')",sandbox),/quota/);assert.equal(meta[0].frameCount,1);assert.equal(sprites.size,1);
 fail=false;await vm.runInContext("importAnimations([],'custom','IDLE')",sandbox);
 assert.equal(meta[0].frameCount,0);assert.equal(Object.keys(meta[0].animations).length,0);assert.equal(sprites.size,0);assert.equal(meta.length,1);
 await vm.runInContext("importAnimations([{animation:'IDLE',bytes:[1],mime:'image/png'}],'custom')",sandbox);
 assert.equal(meta[0].frameCount,1);assert.deepEqual(Array.from(meta[0].idleFrames),[0]);assert.equal(sprites.size,1);
});

test('clear-slot messages clear only their selected pet and named animation', async () => {
 let listener;const calls=[];
 const sandbox=vm.createContext({activeId:'cat',staged:[],nameInput:{value:''},result:null,status:'',listPets:async()=>[{id:'cat'}],animationSlots:()=>['SHOW','IDLE'],importAnimations:async(...args)=>calls.push(args),renderList:async()=>{},moonsprite:{window:{onMessage:fn=>listener=fn},diagnostics:{log:error=>{throw Error(error)}}}});
 const start=generated.managerSource.indexOf('let operations='),end=generated.managerSource.indexOf('renderList().catch',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 const send=async message=>{listener(message);await vm.runInContext('operations',sandbox)};
 await send({type:'ui-clear-slot',petId:'cat',animation:'SHOW',requestId:'1'});assert.equal(calls.length,1);assert.equal(calls[0][1],'cat');assert.equal(calls[0][2],'SHOW');assert.equal(sandbox.result.ok,true);
 await send({type:'ui-clear-slot',petId:'other',animation:'IDLE',requestId:'2'});assert.equal(sandbox.result.ok,false);
 await send({type:'ui-clear-slot',petId:'cat',animation:'WAVE',requestId:'3'});assert.equal(sandbox.result.ok,false);assert.equal(calls.length,1);
});


const packagePng='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function petPackageHarness(sourceKind='custom'){
 let meta=[{id:'cat',name:'小猫',source:sourceKind,spriteKey:'sheet',frameWidth:1,frameHeight:1,frameCount:1,animations:{SHOW:[0],IDLE:[0]},durations:[180],scale:3,mirrored:true}],fail=false;
 const sprites=new Map([['sheet',packagePng]]),sandbox=vm.createContext({TextEncoder,TextDecoder,atob,btoa,BUILT_IN:{id:'builtin'},SLOT_COUNT:8,activeId:'cat',staged:[],status:'',animationMap:pet=>pet.animations,listPets:async()=>meta,readMeta:async()=>meta,writeMeta:async value=>{if(fail)throw Error('quota');meta=value},spriteRead:async key=>sprites.get(key),spriteWrite:async(key,value)=>sprites.set(key,value),spriteDelete:async key=>sprites.delete(key),decodeImage:async()=>({naturalWidth:1,naturalHeight:1}),publish:async()=>{},moonsprite:{resources:{read:async()=>Array.from(Buffer.from(packagePng.slice(22),'base64'))}}});
 const start=generated.managerSource.indexOf('// Self-contained data-only'),end=generated.managerSource.indexOf('let operations=',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 return{sandbox,sprites,meta:()=>meta,setFail:value=>fail=value,export:()=>vm.runInContext("exportPetPackage('cat')",sandbox),async import(bytes){sandbox.files=[{bytes:Array.from(bytes)}];return vm.runInContext('importPetPackage(files)',sandbox)}};
}
test('custom and built-in pets round-trip all settings and animation data with independent IDs',async()=>{
 for(const kind of ['custom','builtin']){
  const h=petPackageHarness(kind),file=await h.export();assert.equal(file.name,'小猫.mspet');
  const data=JSON.parse(new TextDecoder().decode(new Uint8Array(file.bytes)));assert.equal(data.pet.id,undefined);assert.equal(data.pet.spriteKey,undefined);assert.equal(data.sprite,packagePng);
  const first=await h.import(file.bytes),second=await h.import(file.bytes);
  assert.notEqual(first.id,'cat');assert.notEqual(first.id,second.id);assert.notEqual(first.spriteKey,second.spriteKey);assert.equal(h.meta().length,3);
  for(const pet of [first,second]){assert.equal(pet.name,'小猫');assert.equal(pet.scale,3);assert.equal(pet.mirrored,true);assert.deepEqual(Array.from(pet.durations),[180]);assert.deepEqual(Array.from(pet.animations.SHOW),[0]);assert.deepEqual(Array.from(pet.animations.IDLE),[0]);assert.equal(h.sprites.get(pet.spriteKey),packagePng);assert.equal(pet.source,'custom')}
 }
});
test('invalid packages and failed imports leave existing pets and assets intact',async()=>{
 const h=petPackageHarness(),file=await h.export(),original=JSON.parse(new TextDecoder().decode(new Uint8Array(file.bytes)));
 for(const mutate of [p=>p.version=99,p=>p.pet.frameWidth=100000,p=>p.pet.animations.IDLE=[5],p=>p.pet.scale=9,p=>p.sprite='https://example.com/cat.png',p=>p.pet.durations=[-1]]){
  const data=structuredClone(original);mutate(data);await assert.rejects(h.import(new TextEncoder().encode(JSON.stringify(data))));assert.equal(h.meta().length,1);assert.equal(h.sprites.size,1);
 }
 await assert.rejects(h.import([255,0,1]),/无法读取/);
 h.setFail(true);await assert.rejects(h.import(file.bytes),/quota/);assert.equal(h.meta().length,1);assert.deepEqual([...h.sprites.keys()],['sheet']);
});
test('an empty pet can be exported and imported without an image',async()=>{
 const h=petPackageHarness();Object.assign(h.meta()[0],{frameCount:0,animations:{},durations:[]});
 const file=await h.export(),pet=await h.import(file.bytes);assert.equal(pet.frameCount,0);assert.equal(pet.spriteKey,undefined);assert.equal(h.sprites.size,1);
});


test('companions request generic host overlays instead of native transparent windows', () => {
 assert.ok(generated.runtimePage.includes("presentation:'overlay'"));
 assert.ok(!generated.runtimePage.includes('transparent:true,focusable:true'));
});


test('right-click manager selection survives loading and menu changes refresh the open manager', async () => {
 const handlers={},sent=[],opened=[],stored=new Map([['shownPets',[]],['pet-sprites',[{id:'cat',frameWidth:2,frameHeight:2,frameCount:1}]]]);
 vm.runInNewContext(generated.runtimePage.match(/<script>([\s\S]*?)<\/script>/i)[1],{moonsprite:{menus:{setItems:async()=>{}},on:(name,fn)=>handlers[name]=fn,storage:{get:async({key})=>stored.get(key),set:async({key,value})=>stored.set(key,value)},windows:{setVisible:async()=>{},open:async value=>opened.push(value),close:async()=>{},postMessage:async value=>sent.push(value)},diagnostics:{log:async()=>{}}}});
 await activatePets(handlers,['builtin','cat']);
 await handlers['window-message']({windowId:'pet-cat',message:{type:'manager'}});
 assert.equal(opened.at(-1).windowId,'manager');
 await handlers['window-message']({windowId:'manager',message:{type:'ready'}});
 assert.equal(sent.at(-1).message.petId,'cat');
 await handlers.command({event:'toggle-pet',commandId:'cat'});
 assert.deepEqual(Array.from(stored.get('shownPets')),['builtin']);
 assert.equal(sent.at(-1).windowId,'manager');assert.equal(sent.at(-1).message.type,'catalog');
 await handlers['window-message']({windowId:'pet-builtin',message:{type:'manager'}});
 assert.equal(sent.at(-1).message.petId,'builtin');
});

test('manager selects the requested pet and visibility updates the shared menu data', async () => {
 let listener;const stored=new Map([['shownPets',['builtin']]]),published=[];
 const sandbox=vm.createContext({activeId:'builtin',staged:[],nameInput:{value:''},result:null,status:'',BUILT_IN:{id:'builtin'},listPets:async()=>[{id:'builtin',frameCount:1},{id:'cat',frameCount:1}],renderList:async()=>{},publish:async()=>published.push(true),moonsprite:{storage:{get:async key=>stored.get(key),set:async(key,value)=>stored.set(key,value)},window:{onMessage:fn=>listener=fn},diagnostics:{log:error=>{throw Error(error)}}}});
 const start=generated.managerSource.indexOf('let operations='),end=generated.managerSource.indexOf('renderList().catch',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 listener({type:'catalog',petId:'cat'});await vm.runInContext('operations',sandbox);assert.equal(sandbox.activeId,'cat');
 listener({type:'ui-visible',petId:'cat',value:true});await vm.runInContext('operations',sandbox);assert.deepEqual(Array.from(stored.get('shownPets')),['builtin','cat']);
 listener({type:'ui-visible',petId:'cat',value:false});await vm.runInContext('operations',sandbox);assert.deepEqual(Array.from(stored.get('shownPets')),['builtin']);assert.equal(published.length,2);
});


test('condition slots are configurable, stay attached to the chosen pet and render a host dialog', async () => {
 let listener,view;let meta=[{id:'cat',name:'小猫',frameCount:0,animations:{}}];
 const sandbox=vm.createContext({TRIGGER_CONDITIONS:generated.triggerConditions,BUILT_IN:{id:'cat'},listPets:async()=>meta,readMeta:async()=>meta,writeMeta:async value=>{meta=value},publish:async()=>{},animationMap:entry=>entry.animations,moonsprite:{storage:{get:async()=>null},window:{onMessage:fn=>listener=fn,postMessage:async value=>{view=value}},diagnostics:{log:error=>{throw Error(error)}}}});
 let start=generated.managerSource.indexOf('const animationSlots='),end=generated.managerSource.indexOf('const combineAnimations=',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 start=generated.managerSource.indexOf('let operations=');end=generated.managerSource.indexOf('renderList().catch',start);vm.runInContext(generated.managerSource.slice(start,end),sandbox);
 listener({type:'ui-add-trigger',petId:'cat'});await vm.runInContext('operations',sandbox);
 assert.equal(view.nodes.at(-1).type,'dialog');assert.equal(view.nodes.at(-1).children[0].options.length,22);assert.ok(view.nodes.at(-1).children[0].options.every(option=>option.description));
 listener({type:'ui-confirm-trigger',petId:'cat',values:{'trigger-event':'tool.changed','trigger-tool':'eraser','trigger-cooldown':4}});await vm.runInContext('operations',sandbox);
 assert.equal(meta[0].triggerSlots[0].event,'tool.changed');assert.equal(meta[0].triggerSlots[0].tool,'eraser');assert.equal(meta[0].triggerSlots[0].cooldownMs,4000);
 assert.equal(view.nodes.some(node=>node.type==='dialog'),false);
 const slot=view.nodes[0].children[1].children.find(node=>node.id.startsWith('slot-TRIGGER_'));assert.ok(slot.tooltip);assert.match(slot.label,/切换工具/);
 const id=meta[0].triggerSlots[0].id;listener({type:'ui-edit-trigger',petId:'cat',slotId:id});await vm.runInContext('operations',sandbox);assert.equal(view.nodes.at(-1).children[0].value,'tool.changed');
 listener({type:'ui-confirm-trigger',petId:'cat',values:{'trigger-cooldown':0}});await vm.runInContext('operations',sandbox);assert.equal(meta[0].triggerSlots.length,1);assert.equal(meta[0].triggerSlots[0].id,id);assert.equal(meta[0].triggerSlots[0].event,'tool.changed');assert.equal(meta[0].triggerSlots[0].cooldownMs,0);
});

test('condition animations honor filters, cooldown, busy playback and idle reset', () => {
 let now=10000,timer;const played=[];
 const sandbox=vm.createContext({Date:{now:()=>now},pet:{triggerSlots:[{id:'TRIGGER_A',event:'tool.changed',tool:'eraser',cooldownMs:3000},{id:'TRIGGER_B',event:'idle',idleSeconds:5,cooldownMs:1000}],animations:{TRIGGER_A:[1],TRIGGER_B:[2]},durations:[125,500,500]},play:(frames,repeat)=>played.push([Array.from(frames),repeat]),document:{hidden:false},petElement:{addEventListener:()=>{}},addEventListener:()=>{},setInterval:fn=>{timer=fn}});
 const start=generated.petWindowSource.indexOf('let draggingAnimation='),end=generated.petWindowSource.indexOf('const scaleOf=',start);vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 vm.runInContext("triggerAnimation('tool.changed',{tool:'pencil'})",sandbox);assert.equal(played.length,0);
 vm.runInContext("triggerAnimation('tool.changed',{tool:'eraser'})",sandbox);assert.deepEqual(played,[[[1],false]]);
 now+=1000;vm.runInContext("triggerAnimation('tool.changed',{tool:'eraser'})",sandbox);assert.equal(played.length,1);
 now+=5000;timer();assert.equal(played.length,2);now+=5000;timer();assert.equal(played.length,2);
 vm.runInContext('markActivity()',sandbox);now+=6000;timer();assert.equal(played.length,3);
});


test('pet package keeps condition bindings and rejects malformed condition configuration', async () => {
 const h=petPackageHarness(),file=await h.export();
 const payload=JSON.parse(new TextDecoder().decode(new Uint8Array(file.bytes)));
 payload.pet.triggerSlots=[{id:'TRIGGER_TEST',event:'history.undo',tool:'',idleSeconds:60,cooldownMs:3000}];payload.pet.animations.TRIGGER_TEST=[0];
 h.sandbox.TRIGGER_CONDITIONS=generated.triggerConditions;
 const imported=await h.import(new TextEncoder().encode(JSON.stringify(payload)));
 assert.equal(imported.triggerSlots[0].event,'history.undo');assert.deepEqual(Array.from(imported.animations.TRIGGER_TEST),[0]);
 payload.pet.triggerSlots[0].event='run-arbitrary-code';await assert.rejects(()=>h.import(new TextEncoder().encode(JSON.stringify(payload))),/条件槽位配置无效/);
});


test('preview fits opaque content in a fixed frame instead of shrinking transparent margins', async () => {
 const draws=[];let created=0;
 const pixels=new Uint8ClampedArray(20*20*4);pixels[(10*20+9)*4+3]=255;pixels[(11*20+10)*4+3]=255;
 const sandbox=vm.createContext({document:{createElement:()=>{const index=created++;return {width:0,height:0,getContext:()=>index===0?{clearRect(){},drawImage(){},getImageData:()=>({data:pixels})}:{drawImage:(...args)=>draws.push(args),translate(){},scale(){}},toDataURL:()=> 'preview'}}}});
 const start=generated.managerSource.indexOf('const previewSprite='),end=generated.managerSource.indexOf('const animationSlots=',start);
 vm.runInContext(generated.managerSource.slice(start,end),sandbox);sandbox.image={};sandbox.target={frameWidth:20,frameHeight:20,frameCount:2,animations:{IDLE:[1]}};
 assert.equal(await vm.runInContext('previewSprite(image,target)',sandbox),'preview');
 assert.deepEqual(draws[0].slice(1),[9,30,2,2,4,4,88,88]);
});


test('zero cooldown restarts immediately and overlapping idle slots choose one random candidate per idle period', () => {
 let now=10000,timer;const played=[];
 const sandbox=vm.createContext({Date:{now:()=>now},Math:{...Math,random:()=>0.99,floor:Math.floor},pet:{triggerSlots:[{id:'A',event:'history.undo',cooldownMs:0},{id:'B',event:'idle',idleSeconds:5,cooldownMs:0},{id:'C',event:'idle',idleSeconds:5,cooldownMs:0}],animations:{A:[0],B:[1],C:[2]},durations:[500,500,500]},play:frames=>played.push(Array.from(frames)),document:{hidden:false},petElement:{addEventListener:()=>{}},addEventListener:()=>{},setInterval:fn=>{timer=fn}});
 const start=generated.petWindowSource.indexOf('let draggingAnimation='),end=generated.petWindowSource.indexOf('const scaleOf=',start);vm.runInContext(generated.petWindowSource.slice(start,end),sandbox);
 vm.runInContext("triggerAnimation('history.undo');triggerAnimation('history.undo')",sandbox);assert.deepEqual(played,[[0],[0]]);
 now+=6000;timer();assert.deepEqual(played,[[0],[0],[2]]);now+=2000;timer();assert.equal(played.length,3);
 vm.runInContext('markActivity()',sandbox);now+=6000;timer();assert.equal(played.length,4);
});


test('pointer entry tests rendered alpha, not transparent button margins',()=>{
 const source=generated.petWindowSource;const start=source.indexOf('const hitCurrentPixel='),end=source.indexOf(";petElement.addEventListener('pointermove'",start);
 const sandbox=vm.createContext({pet:{},canvas:{width:4,height:4,getBoundingClientRect:()=>({left:10,top:20,width:8,height:8})},context:{getImageData:(x,y)=>({data:[0,0,0,x===2&&y===2?255:0]})}});
 vm.runInContext(source.slice(start,end),sandbox);
 assert.equal(vm.runInContext('hitCurrentPixel({clientX:10,clientY:20})',sandbox),false);
 assert.equal(vm.runInContext('hitCurrentPixel({clientX:14,clientY:24})',sandbox),true);
 assert.equal(vm.runInContext('hitCurrentPixel({clientX:30,clientY:24})',sandbox),false);
});
test('continuous drag loops its slot and releases back to idle',()=>{
 const played=[];const sandbox=vm.createContext({pet:{triggerSlots:[{id:'DRAG',event:'pet.dragging'}],animations:{DRAG:[2,3]},idleFrames:[0]},draggingAnimation:false,triggerBusyUntil:99,play:(frames,repeat)=>played.push([frames,repeat])});
 const source=generated.petWindowSource,start=source.indexOf('const startDraggingAnimation='),end=source.indexOf("petElement.addEventListener('pointerdown'",start);vm.runInContext(source.slice(start,end),sandbox);
 vm.runInContext('startDraggingAnimation();stopDraggingAnimation()',sandbox);assert.deepEqual(played,[[[2,3],true],[[0],true]]);assert.equal(sandbox.draggingAnimation,false);
});

test('bubble stays fixed within an animation and moves only when its animation bounds change',async()=>{
 const bubble={style:{},getBoundingClientRect:()=>({width:40,height:20})};const sandbox=vm.createContext({pet:{frameWidth:100,frameHeight:100},animationBounds:{x:10,y:40,width:20,height:30},displayedFrame:0,frameBounds:[{x:10,y:40,width:20,height:30},{x:50,y:70,width:30,height:20}],spriteBounds:{x:0,y:0,width:100,height:100},canvas:{getBoundingClientRect:()=>({left:0,top:0,width:100,height:100})},window:{innerWidth:300,innerHeight:300},info:bubble,notice:{...bubble,style:{}},moonsprite:{window:{getBounds:async()=>({x:0,y:0}),getHostBounds:async()=>({x:0,y:0,width:300,height:300})}}});
 const src=generated.petWindowSource,start=src.indexOf('const positionBubbles='),end=src.indexOf('const contentBounds=',start);vm.runInContext(src.slice(start,end),sandbox);
 await vm.runInContext('positionBubbles()',sandbox);const first={...bubble.style};sandbox.displayedFrame=1;await vm.runInContext('positionBubbles()',sandbox);assert.equal(bubble.style.top,first.top);sandbox.animationBounds={x:50,y:70,width:30,height:20};await vm.runInContext('positionBubbles()',sandbox);assert.notEqual(bubble.style.top,first.top);sandbox.animationBounds={x:10,y:40,width:20,height:30};await vm.runInContext('positionBubbles()',sandbox);assert.equal(bubble.style.top,first.top);
});

test('animation anchor uses only the union of that animation frames',()=>{
 const sandbox=vm.createContext({frameBounds:[{x:10,y:10,width:10,height:10},{x:12,y:8,width:10,height:10},{x:0,y:0,width:40,height:40}],spriteBounds:{x:0,y:0,width:40,height:40}});
 const source=generated.petWindowSource,start=source.indexOf('const boundsForAnimation='),end=source.indexOf('const play=',start);vm.runInContext(source.slice(start,end),sandbox);
 assert.deepEqual({...vm.runInContext('boundsForAnimation([0,1])',sandbox)},{x:10,y:8,width:12,height:12});
 assert.deepEqual({...vm.runInContext('boundsForAnimation([2])',sandbox)},{x:0,y:0,width:40,height:40});
});


test('package frame extraction honors parent repeats and nested repeats and directions', () => {
 const frames=Array.from({length:5},(_,index)=>({id:String(index),duration:40+index*10}));
 const timeline={frames,loopSections:[{id:'root',name:'UNDO',startFrameId:'0',endFrameId:'4',direction:'forward',repeatCount:4},{id:'child',name:'nested',startFrameId:'1',endFrameId:'2',direction:'reverse',repeatCount:6}]};
 const sandbox=nodeVm.createContext({frames,timeline,frameIndex:new Map(frames.map((frame,index)=>[frame.id,index])),animationLoopFrameIdsForExport});
 nodeVm.runInContext(source.slice(source.indexOf('const rangeFor ='),source.indexOf('// A document background')),sandbox);
 const actual=nodeVm.runInContext("rangeFor('UNDO')",sandbox);
 const cycle=['0',...Array.from({length:6},()=>['2','1']).flat(),'3','4'];
 assert.deepEqual(Array.from(actual,frame=>frame.id),Array.from({length:4},()=>cycle).flat());
 assert.deepEqual(Array.from(actual,frame=>frame.duration),Array.from({length:4},()=>cycle.map(id=>frames[Number(id)].duration)).flat());
 assert.deepEqual(Array.from(nodeVm.runInContext("rangeFor('UNDO', 1)",sandbox),frame=>frame.id),cycle);
 assert.equal(timeline.loopSections[0].repeatCount,4);
 assert.equal(timeline.loopSections[1].repeatCount,6);
 timeline.loopSections[0].repeatCount=null;
 assert.equal(nodeVm.runInContext("rangeFor('UNDO').length",sandbox),cycle.length);
});
