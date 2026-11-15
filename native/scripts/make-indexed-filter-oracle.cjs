// Executes actual legacy filter commands and animation linking via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,nextResolve) {
  let target;
  if(specifier.startsWith('@/')) target=path.join(legacy,'src/renderer/src',specifier.slice(2));
  else if(specifier.startsWith('@shared/')) target=path.join(legacy,'src/shared',specifier.slice(8));
  else if(specifier.startsWith('.') && context.parentURL?.startsWith('file:')) target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if(target) {for(const candidate of [target,target+'.ts',path.join(target,'index.ts')]) if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()) return {url:pathToFileURL(candidate).href,shortCircuit:true};}
  try{return nextResolve(specifier,context);}catch(error) {
   if(specifier.startsWith('.')||specifier.startsWith('node:')||specifier.startsWith('file:')) throw error;
   const store=path.join(legacy,'node_modules/.pnpm'),name=specifier.split('/')[0];
   const matches=fs.readdirSync(store).filter(n=>n.startsWith(name+'@'));
   if(matches.length!==1) throw error;
   const full=path.join(store,matches[0],'node_modules',specifier);
   return {url:pathToFileURL(require.resolve(full)).href,shortCircuit:true};
  }
 },
 load(url,context,nextLoad) {
  if(url.startsWith('file:')&&url.endsWith('.ts')) {
   // Node strips explicit type imports; legacy's bundler also erases these
   // two interface imports. This changes no executable legacy statement.
   const input=fs.readFileSync(fileURLToPath(url),'utf8').replace('import { BrushGradientSample,','import { type BrushGradientSample,').replace(', BrushGradientSample,',', type BrushGradientSample,').replace(/, BrushMaskPoint(?=[, }])/g,', type BrushMaskPoint');
   return {format:'module',source:stripTypeScriptTypes(input,{mode:'transform'}),shortCircuit:true};
  }
  return nextLoad(url,context);
 }
});


(async()=>{
 globalThis.localStorage={getItem:()=>null};globalThis.window={moonSprite:{getResourceInfo:async()=>({freeBytes:16*1024**3})}};
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src',p)));
 const model=await imp('core/document-model.ts'),anim=await imp('core/animation.ts'),{unpackColor,packColor}=await imp('core/raster.ts');
 const {createLayerAdjustmentCommands}=await imp('store/workspace-commands-layer-adjustment.ts');
 const presets=['crt-scanlines-subtle','crt-scanlines-medium','crt-scanlines-strong','vhs-color-fringe','vignette','phosphor-glow'];
 const base=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0x70000000},{id:41,color:0x24000000},{id:53,color:0x1c60ff40},{id:65,color:0x8000ff00},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const cases=[];
 for(const palette of ['normal','opaque-zero','duplicate','transparent-first','empty','transparent','hidden'])for(const orderKind of ['all','subset','empty'])for(const layout of ['tiny','normal','negative','offcanvas'])for(const choice of [...presets,'lcd','lcd-wide','lcd-outside']){
  const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xffabcdef;if(palette==='duplicate')entries.push({id:7,color:0xff00ff00});if(palette==='transparent-first')entries.unshift({id:19,color:0x00123456});if(palette==='empty')entries.length=0;if(palette==='transparent')for(const e of entries)e.color&=0xffffff;
  const order=orderKind==='all'?base.map(e=>e.id):orderKind==='subset'?[77,41,65,7]:[];if(palette==='hidden')order.splice(0,order.length,0,99);
  const w=layout==='tiny'?1:7,h=layout==='tiny'?1:5,sw=layout==='tiny'?1:5,sh=layout==='tiny'?1:3,ox=layout==='negative'?-3:layout==='offcanvas'?12:0,oy=layout==='negative'?-2:layout==='offcanvas'?9:1;
  const d=model.createDocument('indexed filters',w,h,'indexed',false),source=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));d.paletteOrder=[...order];d.nextColorId=100;
  const frame0=d.animation.activeFrameId;anim.addBlankAnimationFrame(d);anim.addBlankAnimationFrame(d);d.animation.activeFrameId=frame0;anim.refreshActiveAnimationFrame(d);
  const initial=Array.from({length:sw*sh},(_,i)=>[7,0,19,41,99,53,404,65,30,77][i%10]);source.width=sw;source.height=sh;source.offsetX=ox;source.offsetY=oy;source.pixels=new Uint32Array(initial);source.locked=true;source.visible=layout!=='offcanvas';model.setLayerStorageOrigin(source,{x:5,y:-3});
  const grouped=layout==='negative';if(grouped){d.groups.push({id:'P',name:'Parent',visible:true,locked:false,opacity:1,blendMode:'normal'});source.groupId='P';}anim.syncActiveAnimationLayer(d,source.id);
  // Source frame two is an existing alias, frame three retains independent content.
  const sourceCels=d.animation.cels.filter(c=>c.layerId===source.id);sourceCels[1].linkedCelId=sourceCels[0].id;sourceCels[1].surface=sourceCels[0].surface;d.animation.activeFrameId=d.animation.frames[1].id;anim.refreshActiveAnimationFrame(d);
  const history=[],session={document:d,selectedLayerIds:[source.id],selectedGroupId:grouped?'P':null,selectedGroupIds:grouped?['P']:[],collapsedGroupIds:grouped?['P']:[],history:{push:e=>history.push(e)},revision:0,contentRevision:0};
  let message='';const context={get:()=>({sessions:[session],activeId:d.id,commitFloatingPaste:()=>{},mutateActive:f=>f(session)}),set:v=>{if(v.message)message=v.message;},recording:{recordDocumentOperation:()=>{}},services:{}};
  const api=createLayerAdjustmentCommands(context);const lcd=choice.startsWith('lcd'),options=choice==='lcd-wide'?{width:2,height:1}:choice==='lcd-outside'?{width:99,height:99}:{width:1,height:1};const preset=presets.indexOf(choice),opacity=layout==='tiny'?0:layout==='normal'?undefined:layout==='negative'?.43:2;
  if(lcd)await api.applyLcdScreenFilter(options);else await api.applyFilterPreset(choice,opacity);
  if(message||history.length!==1)throw Error(choice+': '+message+' history='+history.length);
  const created=d.layers.filter(l=>l.id!==source.id);
  const snapshot=()=>({layers:d.layers.filter(l=>l.id!==source.id).reverse().map(l=>({name:l.name,description:l.description??'',blend:l.blendMode,opacity:l.opacity,parent:!!l.groupId,frames:d.animation.frames.map(f=>{const c=anim.animationCelAt(d.animation,l.id,f.id),s=anim.resolveAnimationCel(d.animation,c).surface;return {linked:!!c.linkedCelId,pixels:Array.from(s.pixels),format:s.format,width:s.width,height:s.height,ox:s.offsetX,oy:s.offsetY};})})),sourceVisible:d.layers.find(l=>l.id===source.id).visible,active:d.layers.find(l=>l.id===d.activeLayerId).name,selectedGroup:!!session.selectedGroupId,palette:d.palette.map(e=>({id:e.id,color:packColor(e.color)})),order:[...d.paletteOrder]});
  const expected=snapshot();history[0].undo();if(d.layers.length!==1||source.visible!==(layout!=='offcanvas'))throw Error('undo');history[0].redo();const redo=snapshot();if(JSON.stringify(expected)!==JSON.stringify(redo))throw Error('redo');
  cases.push({name:`${palette}-${orderKind}-${layout}-${choice}`,entries:entries.map(e=>({...e,name:String(e.id)})),order,w,h,sw,sh,ox,oy,initial,grouped,lcd,preset,options,opacity:opacity??null,sourceVisible:layout!=='offcanvas',expected});
 }
 fs.writeFileSync(out,JSON.stringify({cases}));console.log(cases.length+' actual legacy indexed filter command transactions');
})().catch(e=>{console.error(e);process.exitCode=1;});
