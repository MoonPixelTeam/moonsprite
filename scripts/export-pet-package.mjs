import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import UPNG from 'upng-js'

/**
 * Build a MoonSprite pet extension package.
 *
 * The package ships one built-in pet rendered from a `.moonsprite` animation
 * timeline, plus a pet manager window that decodes a user-supplied GIF into an
 * extra pet. Imported sprites use the host storage bridge because sandboxed
 * windows cannot share IndexedDB. Oversized sprites fail with a visible error.
 *
 * The extension manager owns pet metadata and its declarative form. The runtime
 * reconciles independent companion windows; the host only renders generic UI.
 */
const [sourcePath, outputPath, petName = '宠物', extensionId = 'moonsprite.pet'] = process.argv.slice(2)
if (!sourcePath || !outputPath) throw new Error('用法：node scripts/export-pet-package.mjs <源.moonsprite> <输出.msext> [名称] [扩展ID]')

/** Maximum pets stored by this extension, including the bundled pet. */
const PET_SLOT_COUNT = 8
const BUILT_IN_PET_ID = 'builtin'

const archive = unzipSync(readFileSync(resolve(sourcePath)))
const document = JSON.parse(strFromU8(archive['manifest.json'])).document
const timeline = document.animation
if (!timeline?.frames?.length) throw new Error('源工程没有动画时间轴。')

const frames = timeline.frames
const frameIndex = new Map(frames.map((frame, index) => [frame.id, index]))
const rangeFor = (name) => {
  const section = (timeline.loopSections ?? []).find((item) => item.name.toUpperCase() === name)
  const start = section && frameIndex.get(section.startFrameId)
  const end = section && frameIndex.get(section.endFrameId)
  if (start === undefined || end === undefined || end < start) throw new Error(`找不到有效的 ${name} 循环节。`)
  return frames.slice(start, end + 1)
}

// A document background is an editor surface, not part of the transparent pet.
const visibleLayers = new Map(document.layers.filter((layer) => layer.visible && !layer.background).map((layer) => [layer.id, layer]))
const celsById = new Map((timeline.cels ?? []).map((cell) => [cell.id, cell]))
const resolvedCell = (cell) => {
  let source = cell
  const visited = new Set([cell.id])
  while (source.linkedCelId) {
    if (visited.has(source.linkedCelId)) throw new Error(`动画帧链接循环：${cell.id}`)
    visited.add(source.linkedCelId)
    source = celsById.get(source.linkedCelId)
    if (!source) throw new Error(`缺少已链接的动画帧：${cell.linkedCelId}`)
  }
  return { ...source, frameId: cell.frameId, layerId: cell.layerId, opacity: cell.opacity ?? source.opacity }
}
const cellsByFrame = new Map()
for (const cell of timeline.cels ?? []) {
  if (!visibleLayers.has(cell.layerId)) continue
  const cells = cellsByFrame.get(cell.frameId) ?? []
  cells.push(resolvedCell(cell))
  cellsByFrame.set(cell.frameId, cells)
}

const pixelsFor = (cell) => {
  const stored = archive[cell.dataFile]
  if (!stored) throw new Error(`缺少动画帧资源：${cell.dataFile}`)
  if (cell.dataEncoding !== 'sparse-tiles-v1') return stored
  const output = new Uint8Array(cell.width * cell.height * 4)
  const view = new DataView(stored.buffer, stored.byteOffset, stored.byteLength)
  const count = view.getUint32(16, true)
  for (let index = 0; index < count; index++) {
    const entry = 24 + index * 16
    const x = view.getUint32(entry, true)
    const y = view.getUint32(entry + 4, true)
    const width = view.getUint16(entry + 8, true)
    const height = view.getUint16(entry + 10, true)
    const offset = view.getUint32(entry + 12, true)
    for (let row = 0; row < height; row++) output.set(stored.subarray(offset + row * width * 4, offset + (row + 1) * width * 4), ((y + row) * cell.width + x) * 4)
  }
  return output
}

const blend = (target, offset, source, sourceOffset, opacity = 1) => {
  const alpha = source[sourceOffset + 3] / 255 * opacity
  if (!alpha) return
  const destinationAlpha = target[offset + 3] / 255
  const outputAlpha = alpha + destinationAlpha * (1 - alpha)
  for (let channel = 0; channel < 3; channel++) target[offset + channel] = Math.round((source[sourceOffset + channel] * alpha + target[offset + channel] * destinationAlpha * (1 - alpha)) / outputAlpha)
  target[offset + 3] = Math.round(outputAlpha * 255)
}

const render = (frame) => {
  const output = new Uint8Array(document.width * document.height * 4)
  for (const cell of cellsByFrame.get(frame.id) ?? []) {
    const pixels = pixelsFor(cell)
    for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) {
      const targetX = cell.offsetX + x
      const targetY = cell.offsetY + y
      if (targetX < 0 || targetY < 0 || targetX >= document.width || targetY >= document.height) continue
      blend(output, (targetY * document.width + targetX) * 4, pixels, (y * cell.width + x) * 4, cell.opacity ?? 1)
    }
  }
  return output
}

const showFrames = rangeFor('SHOW')
const idleFrames = rangeFor('IDLE')
const allFrames = [...showFrames, ...idleFrames]
const renderedFrames = allFrames.map(render)
const cropBounds = (rendered) => {
  let left = document.width
  let top = document.height
  let right = -1
  let bottom = -1
  for (const pixels of rendered) for (let y = 0; y < document.height; y++) for (let x = 0; x < document.width; x++) {
    if (pixels[(y * document.width + x) * 4 + 3] < 16) continue
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x)
    bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) throw new Error('宠物动画没有可见像素。')
  return { left, top, width: right - left + 1, height: bottom - top + 1 }
}
const bounds = cropBounds(renderedFrames)
const frameWidth = bounds.width
const frameHeight = bounds.height
const sheet = new Uint8Array(frameWidth * frameHeight * allFrames.length * 4)
for (let index = 0; index < renderedFrames.length; index++) for (let row = 0; row < frameHeight; row++) {
  const sourceOffset = ((bounds.top + row) * document.width + bounds.left) * 4
  const targetOffset = (index * frameWidth * frameHeight + row * frameWidth) * 4
  sheet.set(renderedFrames[index].subarray(sourceOffset, sourceOffset + frameWidth * 4), targetOffset)
}

const builtInPet = {
  id: BUILT_IN_PET_ID,
  name: petName,
  frameWidth,
  frameHeight,
  frameCount: allFrames.length,
  showFrames: showFrames.map((_, index) => index),
  idleFrames: idleFrames.map((_, index) => showFrames.length + index),
  durations: null,
  source: 'builtin'
}

const defaults = { enabled: true, scale: 2, remindersEnabled: true, clockEnabled: true, unsavedMinutes: 15, breakMinutes: 60, unsavedEnabled: true, breakEnabled: true }

const manifest = {
  schemaVersion: 2,
  apiVersion: '1.0.0',
  id: extensionId,
  name: '宠物伴侣',
  version: '1.0.0',
  description: '支持多宠物陪伴、自定义动画及宠物包导入导出，提供报时、保存与休息提醒。',
  settingsUi: {
    storageKey: 'preferences',
    controls: [
      { id: 'remindersEnabled', type: 'checkbox', label: '提醒总开关', description: '统一控制下方报时、保存和休息提醒；关闭后保留各项设置。', defaultValue: true },
      { id: 'clockEnabled', type: 'checkbox', visibleWhen: { remindersEnabled: true }, label: '自动报时', description: '在整点和半点显示当前时间。', defaultValue: true },
      { id: 'unsavedEnabled', type: 'checkbox', visibleWhen: { remindersEnabled: true }, label: '启用保存提醒', defaultValue: true },
      { id: 'breakEnabled', type: 'checkbox', visibleWhen: { remindersEnabled: true }, label: '启用连续绘制提醒', defaultValue: true },
      { id: 'unsavedMinutes', type: 'number', label: '未保存时长', visibleWhen: { remindersEnabled: true, unsavedEnabled: true }, defaultValue: 15, min: 1, max: 1440, step: 1, suffix: '分钟' },
      { id: 'breakMinutes', type: 'number', label: '连续绘制时长', visibleWhen: { remindersEnabled: true, breakEnabled: true }, defaultValue: 60, min: 1, max: 1440, step: 1, suffix: '分钟' },
      { id: 'manager', type: 'button', label: '宠物管理…', fullWidth: true, commandId: 'manager', variant: 'primary' },
    ]
  },
  runtime: {
    entry: 'runtime/index.html',
    permissions: ['runtime', 'commands', 'menus', 'ui', 'windows', 'workspace.read', 'document.read', 'events', 'storage', 'resources', 'notifications', 'diagnostics'],
    resources: { 'pet-window': 'ui/pet.html', 'pet-manager': 'ui/manager.html', sprite: 'assets/companion.png' }
  },
  commands: [
    { id: 'manager', name: '宠物管理…', runtimeEvent: 'manager' },
    { id: 'settings', name: '宠物设置…', opensSettings: true }
  ],
  topMenus: [
    {
      id: 'pet-menu',
      name: '宠物',
      description: '宠物扩展菜单',
      position: 'after:window',
      commands: ['manager', 'settings']
    }
  ]
}

/**
 * Pet sheet lookup shared by the pet window and the manager window.
 *
 * Built-in pets are package resources. Imported pets are PNG data URLs kept in
 * the host storage bridge, shared by the manager and companion windows.
 */
const storeSource = `
const META_KEY='pet-sprites',BUILT_IN=${JSON.stringify(builtInPet)},SLOT_COUNT=${PET_SLOT_COUNT};
const spriteRead=key=>moonsprite.storage.get('sprite.'+key);
const spriteWrite=async(key,value)=>{if(new TextEncoder().encode(JSON.stringify(value)).length>250000)throw new Error('素材超过单项存储容量，请使用更小或更短的动画。');await moonsprite.storage.set('sprite.'+key,value);return true};
const spriteDelete=key=>moonsprite.storage.remove('sprite.'+key);
const readMeta=async()=>{const stored=await moonsprite.storage.get(META_KEY);return Array.isArray(stored)?stored.filter(entry=>entry&&typeof entry.id==='string'):[]};
const writeMeta=list=>moonsprite.storage.set(META_KEY,list);
const listPets=async()=>{const meta=await readMeta();return[meta.find(entry=>entry.id===BUILT_IN.id)||BUILT_IN,...meta.filter(entry=>entry.id!==BUILT_IN.id)]};
const loadSheetUrl=async pet=>{if(pet.source==='builtin'){const bytes=await moonsprite.resources.read('sprite');return{url:URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'image/png'})),revoke:true}}const dataUrl=await spriteRead(pet.spriteKey||pet.id);if(typeof dataUrl!=='string')throw new Error('宠物素材已丢失：'+pet.name);return{url:dataUrl,revoke:false}};
const decodeImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('宠物素材无法解码。'));image.src=url});
`

const runtimePage = `<!doctype html><html><body><script>
const defaults=${JSON.stringify(defaults)},builtInPet=${JSON.stringify(builtInPet)};
let preferences={...defaults},project=null,dirtySince=0,drawingSince=0,lastDrawingAt=0,lastRevision=null,lastProjectId=null,lastBreakNotice=0,lastUnsavedNotice=0,lastClockKey='';
const live=new Map(),visible=new Set(),ready=new Set();let shownIds=[],queue=Promise.resolve();
const read=key=>moonsprite.storage.get({key});
const write=(key,value)=>moonsprite.storage.set({key,value});
const report=error=>moonsprite.diagnostics.log({message:String(error),level:'error'});
const send=(windowId,message)=>moonsprite.windows.postMessage({windowId,message}).catch(report);
const broadcast=message=>Promise.all([...visible].map(id=>send(id,message)));
let noticeSequence=0,noticeQueue=Promise.resolve();const noticeRequests=new Map();
const acceptNoticeDistance=(windowId,message)=>{const request=noticeRequests.get(message.requestId);if(!request||!request.pending.delete(windowId))return;if(Number.isFinite(message.distance)&&message.distance>=0)request.distances.set(windowId,message.distance);if(!request.pending.size)request.finish()};
const notifyNearest=message=>{const task=noticeQueue.then(async()=>{
 if(!preferences.enabled||!preferences.remindersEnabled)return;
 const ids=[...visible].filter(id=>ready.has(id));if(!ids.length)return;
 const requestId=++noticeSequence;
 const distances=await new Promise(resolve=>{const request={pending:new Set(ids),distances:new Map(),finish:()=>{clearTimeout(timer);noticeRequests.delete(requestId);resolve(request.pending.size?null:request.distances)}};const timer=setTimeout(request.finish,1500);noticeRequests.set(requestId,request);for(const id of ids)send(id,{type:'notice-distance',requestId})});
 if(!distances||!preferences.enabled||!preferences.remindersEnabled)return;
 let winner=null,best=Infinity;for(const id of ids){const distance=distances.get(id);if(visible.has(id)&&ready.has(id)&&distance<best){best=distance;winner=id}}
 if(!winner)return;await Promise.all([...visible].filter(id=>id!==winner).map(id=>send(id,{type:'dismiss-notice'})));if(visible.has(winner))await send(winner,message);
 });noticeQueue=task.catch(report);return noticeQueue};

const catalog=async()=>{const meta=await read('pet-sprites')||[];return[meta.find(pet=>pet.id===builtInPet.id)||builtInPet,...meta.filter(pet=>pet.id!==builtInPet.id)]};
const configure=(pet,playShow)=>({type:'configure',windowId:'pet-'+pet.id,pet,project,preferences:{...preferences,scale:pet.scale||preferences.scale||2},activePetId:pet.id,playShow,positionKey:'position:'+pet.id});
const syncMenu=pets=>moonsprite.menus.setItems({menuId:'pet-menu',items:pets.filter(pet=>pet.frameCount>0).map(pet=>({id:pet.id,name:pet.name,event:'toggle-pet',checked:preferences.enabled&&shownIds.includes(pet.id)}))});
const enqueue=operation=>{const task=queue.then(operation);queue=task.catch(report);return task};
const reload=async()=>{preferences={...defaults,...await read('preferences')};const stored=await read('shownPets');shownIds=Array.isArray(stored)?stored:[builtInPet.id]};
const reconcileNow=async()=>{
 const pets=await catalog(),wanted=preferences.enabled?pets.filter(pet=>pet.frameCount>0&&shownIds.includes(pet.id)):[];
 for(const [id,pet] of live)if(!wanted.some(next=>next.id===pet.id)&&visible.has(id)){await moonsprite.windows.setVisible({windowId:id,visible:false});visible.delete(id);await send(id,{type:'visibility',visible:false})}
 for(const [id,pet] of live)if(!pets.some(next=>next.id===pet.id)){await moonsprite.windows.close({windowId:id});live.delete(id);ready.delete(id)}
 for(const pet of wanted){const id='pet-'+pet.id;try{
 if(live.has(id)){const wasVisible=visible.has(id);live.set(id,pet);if(!wasVisible){await moonsprite.windows.setVisible({windowId:id,visible:true});visible.add(id)}if(ready.has(id))await send(id,configure(pet,!wasVisible));continue}
 const scale=pet.scale||preferences.scale||2,width=Math.max(360,pet.frameWidth*scale+600),height=Math.max(360,pet.frameHeight*scale+400),position=await read('position:'+pet.id)||{x:100+live.size*100,y:100};
 live.set(id,pet);visible.add(id);try{await moonsprite.windows.open({windowId:id,resourceId:'pet-window',options:{presentation:'overlay',x:position.x,y:position.y,width,height}})}catch(error){live.delete(id);visible.delete(id);ready.delete(id);throw error}
 }catch(error){await report(error)}}
 await syncMenu(pets);
 if(managerReady)await send('manager',{type:'catalog'});
};
const reconcile=()=>enqueue(async()=>{await reload();await reconcileNow()});
let initialization=Promise.resolve(),managerPetId=null,managerReady=false;
const openManager=async(petId=null)=>{managerPetId=petId;await moonsprite.windows.open({windowId:'manager',resourceId:'pet-manager',options:{presentation:'dialog',component:'form',title:'宠物管理'}});if(managerReady)await send('manager',{type:'catalog',petId:managerPetId})};
moonsprite.on('activate',()=>{initialization=enqueue(async()=>{await reload();preferences.enabled=true;shownIds=[...new Set([builtInPet.id,...shownIds])];await write('preferences',preferences);await write('shownPets',shownIds);await moonsprite.windows.close({windowId:'companion'}).catch(report);await reconcileNow()});return initialization});
moonsprite.on('command',async event=>{if(event.event==='toggle-pet')return enqueue(async()=>{await reload();const pet=(await catalog()).find(pet=>pet.id===event.commandId&&pet.frameCount>0);if(!pet)return;const showing=preferences.enabled&&shownIds.includes(pet.id);shownIds=shownIds.filter(id=>id!==pet.id);if(!showing){shownIds.push(pet.id);preferences.enabled=true;await write('preferences',preferences)}await write('shownPets',shownIds);await reconcileNow()});if(event.event==='manager')await openManager()});
moonsprite.on('settings-changed',async event=>{if(event.key==='preferences')await reconcile()});
moonsprite.on('window-message',async event=>{const message=event.message;if(!message)return;
 if(event.windowId==='manager'){
  if(message.type==='catalog')await reconcile()
  if(message.type==='ready'){managerReady=true;await send('manager',{type:'catalog',petId:managerPetId})}
  return
 }
 const pet=live.get(event.windowId);if(!pet)return;
 if(message.type==='notice-distance'){acceptNoticeDistance(event.windowId,message);return}
 if(message.type==='ready'){ready.add(event.windowId);if(visible.has(event.windowId))await send(event.windowId,configure(pet,true));else await send(event.windowId,{type:'visibility',visible:false})}
 if(message.type==='manager')await openManager(pet.id)
});
moonsprite.on('project',event=>{const next=event.project,now=Date.now();if(next?.id!==lastProjectId){dirtySince=0;drawingSince=0;lastDrawingAt=0;lastRevision=null;lastUnsavedNotice=0;lastBreakNotice=0}lastProjectId=next?.id;project=next;
 if(next){if(next.dirty&&!dirtySince)dirtySince=now;if(!next.dirty){dirtySince=0;lastUnsavedNotice=0}if(lastRevision!==null&&next.contentRevision!==lastRevision){if(!lastDrawingAt||now-lastDrawingAt>300000)drawingSince=now;lastDrawingAt=now}lastRevision=next.contentRevision}return broadcast({type:'project',project})});
moonsprite.on('document-saved',()=>notifyNearest({type:'notice',text:'保存好啦，这份进度安心收下了。'}));
moonsprite.on('clock',event=>{
 if(!preferences.enabled||!preferences.remindersEnabled)return;const now=event.timestamp,date=new Date(now);
 if(preferences.clockEnabled&&(date.getMinutes()===0||date.getMinutes()===30)){const key=date.toDateString()+date.getHours()+':'+date.getMinutes();if(key!==lastClockKey){lastClockKey=key;notifyNearest({type:'notice',text:'现在是 '+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0')+' 啦，愿你的灵感正好在身边。'})}}
 const breakMs=Math.max(1,Number(preferences.breakMinutes)||60)*60000;
 if(project&&preferences.breakEnabled!==false&&drawingSince&&now-lastDrawingAt<300000&&now-drawingSince>=breakMs&&now-lastBreakNotice>=breakMs){lastBreakNotice=now;notifyNearest({type:'notice',text:'你已经连续绘制了 '+Math.floor((now-drawingSince)/60000)+' 分钟，休息一下眼睛和手腕吧，我在这里等你。'})}
 const unsavedMs=Math.max(1,Number(preferences.unsavedMinutes)||15)*60000;
 if(project&&preferences.unsavedEnabled!==false&&dirtySince&&now-dirtySince>=unsavedMs&&now-lastUnsavedNotice>=unsavedMs){lastUnsavedNotice=now;notifyNearest({type:'notice',text:'已经 '+Math.floor((now-dirtySince)/60000)+' 分钟没有保存文件啦，记得保存，别让灵感溜走哦。'})}
});
</script></body></html>`

const petWindowSource = `
const expandedSize=360;
let pet=null,image=null,hitAlpha=null,hitRegionDirty=false,project=null,preferences=${JSON.stringify(defaults)},animationToken=0,pointer=null,noticeTimer=0,expanded=false,desiredExpanded=false,boundsQueue=Promise.resolve(),sheetUrl=null,sheetRevoke=false,catalog=[],slotPets=[],activePets=null,activePetId=${JSON.stringify(BUILT_IN_PET_ID)},resizeTimer=0,positionKey='position';
const petElement=document.querySelector('#pet'),canvas=document.querySelector('canvas'),context=canvas.getContext('2d',{willReadFrequently:true}),info=document.querySelector('#info'),notice=document.querySelector('#notice');
const scaleOf=()=>Math.max(1,Math.min(4,Math.round(preferences.scale||2)));
const compactSize=()=>pet?{width:Math.max(360,pet.frameWidth*scaleOf()+600),height:Math.max(360,pet.frameHeight*scaleOf()+400)}:{width:120,height:120};
let positionRatio=null,positionLoaded=false,hostEpoch=0;
const persistPosition=bounds=>moonsprite.storage.set(positionKey,{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,layout:'relative',ratio:positionRatio});
const savePosition=async(bounds,epoch=hostEpoch)=>{const host=await moonsprite.window.getHostBounds();if(epoch!==hostEpoch)return;positionRatio=relativePetPosition(bounds,host,contentBounds());positionLoaded=true;await persistPosition(bounds)};
// Overlay regions clip drawing as well as input. Use the union of all animation
// silhouettes so asynchronous region updates cannot cut off a newer frame.
const updateHitRegion=async()=>{try{await positionBubbles()}catch(error){moonsprite.diagnostics.log(String(error),'error')}if(!hitAlpha)return;const viewportWidth=Math.max(1,window.innerWidth),viewportHeight=Math.max(1,window.innerHeight),spans=[],rect=petElement.getBoundingClientRect(),scale=rect.width/pet.frameWidth;for(let y=0;y<pet.frameHeight;y++){let start=-1;for(let x=0;x<=pet.frameWidth;x++){const opaque=x<pet.frameWidth&&hitAlpha[y*pet.frameWidth+(pet.mirrored?pet.frameWidth-1-x:x)]>0;if(opaque&&start<0)start=x;if(!opaque&&start>=0){const left=Math.max(0,Math.floor(rect.left+start*scale)),right=Math.min(viewportWidth,Math.ceil(rect.left+x*scale)),top=Math.max(0,Math.floor(rect.top+y*scale)),bottom=Math.min(viewportHeight,Math.ceil(rect.top+(y+1)*scale));for(let hitY=top;hitY<bottom;hitY++)spans.push({x:left,y:hitY,width:Math.max(1,right-left)});start=-1}}}for(const bubble of [info,notice])if(!bubble.hidden){const box=bubble.getBoundingClientRect();for(let y=Math.max(0,Math.floor(box.top));y<Math.min(viewportHeight,Math.ceil(box.bottom));y++){const left=Math.max(0,Math.floor(box.left)),right=Math.min(viewportWidth,Math.ceil(box.right));spans.push({x:left,y,width:Math.max(1,right-left)})}}return moonsprite.window.setHitRegion(viewportWidth,viewportHeight,spans).catch(error=>moonsprite.diagnostics.log('无法更新宠物命中区域：'+String(error),'error'))};
const scheduleHitRegion=()=>{if(hitRegionDirty)return;hitRegionDirty=true;requestAnimationFrame(()=>{hitRegionDirty=false;updateHitRegion()})};
const setExpanded=(next,force=false)=>{desiredExpanded=next;boundsQueue=boundsQueue.then(async()=>{const targetExpanded=desiredExpanded,target=compactSize(),current=await moonsprite.window.getBounds();if(current.width===target.width&&current.height===target.height){expanded=targetExpanded;updateHitRegion();return}const bounds={x:current.x+current.width-target.width,y:current.y+current.height-target.height,...target};await moonsprite.window.setBounds(bounds);expanded=targetExpanded;clearTimeout(resizeTimer);resizeTimer=setTimeout(updateHitRegion,50)}).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return boundsQueue};
const syncBubbleLayout=()=>setExpanded(!info.hidden||!notice.hidden);
const updateScale=()=>{const scale=scaleOf();canvas.style.width=pet.frameWidth*scale+'px';canvas.style.height=pet.frameHeight*scale+'px';return setExpanded(desiredExpanded,true).then(constrainPet)};
const play=(frames,repeat)=>{const token=++animationToken;if(!image||!frames||!frames.length)return;let index=0;const tick=()=>{if(token!==animationToken)return;if(pointer?.dragged){setTimeout(tick,125);return}context.clearRect(0,0,pet.frameWidth,pet.frameHeight);const delay=pet.durations?.[frames[index]]||125;context.save();if(pet.mirrored){context.translate(pet.frameWidth,0);context.scale(-1,1)}context.drawImage(image,0,-frames[index]*pet.frameHeight);context.restore();index++;if(index>=frames.length){if(!repeat){setTimeout(()=>{if(token===animationToken)play(pet.idleFrames,true)},delay);return}index=0}setTimeout(tick,delay)};tick()};
const revealBubble=async bubble=>{bubble.style.visibility='hidden';bubble.hidden=false;try{await positionBubbles();if(bubble.hidden)return;await updateHitRegion();if(!bubble.hidden)bubble.style.visibility='visible'}catch(error){bubble.hidden=true;throw error}};
const showInfo=async()=>{if(!project){await showNotice((pet?.name||'宠物')+'在这里陪你。打开工程后，点击可查看工程信息。');return}if(!info.hidden){info.hidden=true;await syncBubbleLayout();return}notice.hidden=true;info.innerHTML='<strong></strong><small>'+project.width+' × '+project.height+' · '+project.colorMode+'</small><small>图层 '+project.layerCount+' · 帧 '+project.frameCount+'</small><small>'+(project.dirty?'有未保存修改':'已保存')+'</small>';info.querySelector('strong').textContent=project.name;await setExpanded(true);await revealBubble(info)};
const showNotice=async text=>{if(!pet)return;info.hidden=true;notice.textContent=text;await setExpanded(true);await revealBubble(notice);clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;syncBubbleLayout()},7000);updateHitRegion()};
const clampPetBounds=(bounds,host,content)=>({...bounds,x:Math.max(host.x-content.x,Math.min(host.x+host.width-content.x-content.width,bounds.x)),y:Math.max(host.y-content.y,Math.min(host.y+host.height-content.y-content.height,bounds.y))});
const relativePetPosition=(bounds,host,content)=>({x:Math.max(0,Math.min(1,(bounds.x+content.x-host.x)/Math.max(1,host.width-content.width))),y:Math.max(0,Math.min(1,(bounds.y+content.y-host.y)/Math.max(1,host.height-content.height)))});
const boundsAtRelativePosition=(bounds,host,content,ratio)=>clampPetBounds({...bounds,x:host.x+ratio.x*Math.max(0,host.width-content.width)-content.x,y:host.y+ratio.y*Math.max(0,host.height-content.height)-content.y},host,content);
let dragQueue=null,pendingDrag=null;
let spriteBounds=null,frameBounds=[],displayedFrame=0;
// Anchor to the union silhouette so animation frames never move the bubble.
const positionBubbles=async()=>{if(!pet)return;const [outer,host]=await Promise.all([moonsprite.window.getBounds(),moonsprite.window.getHostBounds()]);const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const bounds=spriteBounds||{x:0,y:0,width:pet.frameWidth,height:pet.frameHeight};const sx=rect.width/pet.frameWidth,sy=rect.height/pet.frameHeight;const x=pet.mirrored?pet.frameWidth-bounds.x-bounds.width:bounds.x;const center=rect.left+(x+bounds.width/2)*sx,top=rect.top+bounds.y*sy,bottom=top+bounds.height*sy;const left=Math.max(0,host.x-outer.x)+4,right=Math.min(window.innerWidth,host.x+host.width-outer.x)-4,upper=Math.max(0,host.y-outer.y)+4,lower=Math.min(window.innerHeight,host.y+host.height-outer.y)-4;if(right<=left||lower<=upper)return;for(const bubble of [info,notice]){bubble.style.transform='none';bubble.style.bottom='auto';bubble.style.maxWidth=Math.min(280,right-left)+'px';bubble.style.maxHeight=Math.min(180,lower-upper)+'px';bubble.style.overflow='auto';const box=bubble.getBoundingClientRect();const preferred=top-8-box.height>=upper?top-8-box.height:bottom+8;bubble.style.left=Math.max(left,Math.min(right-box.width,center-box.width/2))+'px';bubble.style.top=Math.max(upper,Math.min(lower-box.height,preferred))+'px'}};
const contentBounds=()=>{const rect=petElement.getBoundingClientRect(),bounds=spriteBounds||{x:0,y:0,width:pet.frameWidth,height:pet.frameHeight},scale=scaleOf();return{x:rect.left+(pet.mirrored?pet.frameWidth-bounds.x-bounds.width:bounds.x)*scale,y:rect.top+bounds.y*scale,width:bounds.width*scale,height:bounds.height*scale}};
const findSpriteBounds=(decoded,next)=>{frameBounds=[];displayedFrame=0;hitAlpha=new Uint8Array(next.frameWidth*next.frameHeight);const surface=document.createElement('canvas');surface.width=next.frameWidth;surface.height=next.frameHeight;const ctx=surface.getContext('2d',{willReadFrequently:true});let left=next.frameWidth,top=next.frameHeight,right=-1,bottom=-1;for(let frame=0;frame<next.frameCount;frame++){let fl=next.frameWidth,ft=next.frameHeight,fr=-1,fb=-1;ctx.clearRect(0,0,surface.width,surface.height);ctx.drawImage(decoded,0,-frame*next.frameHeight);const pixels=ctx.getImageData(0,0,surface.width,surface.height).data;for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++)if(pixels[(y*surface.width+x)*4+3]>0){hitAlpha[y*surface.width+x]=255;fl=Math.min(fl,x);ft=Math.min(ft,y);fr=Math.max(fr,x);fb=Math.max(fb,y);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}frameBounds.push(fr<0?null:{x:fl,y:ft,width:fr-fl+1,height:fb-ft+1})}return right<0?{x:0,y:0,width:next.frameWidth,height:next.frameHeight}:{x:left,y:top,width:right-left+1,height:bottom-top+1}};
const movePet=(gesture,x,y)=>{pendingDrag={gesture,x,y};if(!dragQueue)dragQueue=(async()=>{try{while(pendingDrag){const current=pendingDrag;pendingDrag=null;const [bounds,host]=await current.gesture.origin;const latest=pendingDrag?.gesture===current.gesture?pendingDrag:current;if(latest!==current)pendingDrag=null;if(current.gesture.cancelled||current.gesture.epoch!==hostEpoch)continue;const next=clampPetBounds({...bounds,x:bounds.x+latest.x-current.gesture.x,y:bounds.y+latest.y-current.gesture.y},host,current.gesture.content);await moonsprite.window.setBounds(next)}}catch(error){await moonsprite.diagnostics.log(String(error),'error')}finally{dragQueue=null}})();return dragQueue};
// Coalesce host changes, then correct any move that was already in flight.
let constraintQueued=false;
const constrainPet=()=>{if(!pet)return Promise.resolve();if(constraintQueued)return boundsQueue;constraintQueued=true;boundsQueue=boundsQueue.then(async()=>{constraintQueued=false;if(dragQueue)await dragQueue;const [bounds,host]=await Promise.all([moonsprite.window.getBounds(),moonsprite.window.getHostBounds()]);if(host.width<=0||host.height<=0)return;const initialize=!positionLoaded;if(initialize){const stored=await moonsprite.storage.get(positionKey);if(stored?.ratio&&Number.isFinite(stored.ratio.x)&&Number.isFinite(stored.ratio.y))positionRatio={x:Math.max(0,Math.min(1,stored.ratio.x)),y:Math.max(0,Math.min(1,stored.ratio.y))};positionLoaded=true}const content=contentBounds();positionRatio??=relativePetPosition(bounds,host,content);const next=boundsAtRelativePosition(bounds,host,content,positionRatio);if(next.x!==bounds.x||next.y!==bounds.y)await moonsprite.window.setBounds(next);if(initialize)await persistPosition(next);scheduleHitRegion()}).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return boundsQueue};
const hostGeometryChanged=()=>{hostEpoch++;if(pointer){pointer.cancelled=true;pointer=null}pendingDrag=null;return constrainPet()};
const loadPet=async next=>{const loaded=await loadSheetUrl(next);const decoded=await decodeImage(loaded.url);if(sheetRevoke&&sheetUrl)URL.revokeObjectURL(sheetUrl);sheetUrl=loaded.url;sheetRevoke=loaded.revoke;image=decoded;spriteBounds=findSpriteBounds(decoded,next);pet={...next,idleFrames:next.animations?(next.animations.IDLE?.length?next.animations.IDLE:next.animations.SHOW||[]):next.idleFrames?.length?next.idleFrames:Array.from({length:next.frameCount},(_,index)=>index)};canvas.width=pet.frameWidth;canvas.height=pet.frameHeight;canvas.style.visibility='visible';canvas.style.width=pet.frameWidth*scaleOf()+'px';canvas.style.height=pet.frameHeight*scaleOf()+'px';petElement.setAttribute('aria-label',pet.name);await updateScale();play(pet.showFrames&&pet.showFrames.length?pet.showFrames:pet.idleFrames,false)};
// Embedded surfaces receive the host cursor theme; native compatibility uses the same policy API.
const applyCursorPolicy=useLocalCursors=>moonsprite.window.setCursorPolicy({useLocalCursors}).catch(()=>undefined);
const reportCatalog=()=>{};
// Each window resolves only the pet assigned to it by the runtime.
let catalogQueue=Promise.resolve();
const refreshCatalog=playShow=>{const pending=activePets;activePets=null;const task=catalogQueue.then(()=>refreshCatalogNow(playShow,pending));catalogQueue=task.catch(()=>undefined);return task};
const refreshCatalogNow=async(playShow,pending)=>{catalog=(Array.isArray(pending)?pending:await listPets()).filter(entry=>entry.frameCount>0);slotPets=catalog.slice(0,SLOT_COUNT);if(!catalog.some(candidate=>candidate.id===activePetId))throw new Error('指定宠物不存在：'+activePetId);const next=catalog.find(candidate=>candidate.id===activePetId);if(next){const changed=!pet||pet.id!==next.id;if(!pet||pet.id!==next.id||pet.spriteKey!==next.spriteKey||pet.mirrored!==next.mirrored)await loadPet(next);else await updateScale();if(playShow&&next.showFrames&&next.showFrames.length)play(next.showFrames,false);else if(changed||playShow)play(pet.idleFrames,true);moonsprite.window.postMessage({type:'active',pet:next}).catch(()=>{})}reportCatalog()};
petElement.addEventListener('pointerdown',event=>{if(event.button!==0)return;pointer={epoch:hostEpoch,x:event.screenX,y:event.screenY,dragged:false,content:contentBounds(),origin:Promise.all([moonsprite.window.getBounds(),moonsprite.window.getHostBounds()])};petElement.setPointerCapture(event.pointerId)});
petElement.addEventListener('pointermove',event=>{if(!pointer)return;if(!pointer.dragged&&Math.hypot(event.screenX-pointer.x,event.screenY-pointer.y)<5)return;if(!pointer.dragged){info.hidden=true;notice.hidden=true;scheduleHitRegion()}pointer.dragged=true;clearTimeout(noticeTimer);movePet(pointer,event.screenX,event.screenY)});
petElement.addEventListener('pointerup',event=>{if(!pointer)return;const gesture=pointer;pointer=null;if(petElement.hasPointerCapture(event.pointerId))petElement.releasePointerCapture(event.pointerId);if(gesture.dragged){movePet(gesture,event.screenX,event.screenY).then(async()=>{if(gesture.epoch!==hostEpoch)return;await savePosition(await moonsprite.window.getBounds(),gesture.epoch);scheduleHitRegion()}).catch(error=>moonsprite.diagnostics.log(String(error),'error'))}else{scheduleHitRegion();showInfo().catch(error=>moonsprite.diagnostics.log(String(error),'error'))}});
addEventListener('contextmenu',event=>{event.preventDefault();moonsprite.window.postMessage({type:'manager'}).catch(()=>{})});
petElement.addEventListener('pointercancel',()=>{pointer=null;petElement.classList.remove('dragging');scheduleHitRegion()});
addEventListener('resize',()=>{scheduleHitRegion();constrainPet()});
addEventListener('moonsprite:window-host-geometry',hostGeometryChanged);
addEventListener('blur',()=>{if(!info.hidden){info.hidden=true;syncBubbleLayout()}});
moonsprite.window.onMessage(message=>{if(!message)return;
if(message.type==='notice-distance'){(async()=>{let distance=null;try{if(pet&&typeof moonsprite.window.getPointerPosition==='function'){const [point,bounds]=await Promise.all([moonsprite.window.getPointerPosition(),moonsprite.window.getBounds()]);if(point){const content=contentBounds(),left=bounds.x+content.x,top=bounds.y+content.y;const dx=Math.max(left-point.x,0,point.x-left-content.width),dy=Math.max(top-point.y,0,point.y-top-content.height);distance=dx*dx+dy*dy}}}catch(error){await moonsprite.diagnostics.log(String(error),'error')}await moonsprite.window.postMessage({type:'notice-distance',requestId:message.requestId,distance})})().catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='dismiss-notice'){clearTimeout(noticeTimer);notice.hidden=true;syncBubbleLayout();return}


if(message.type==='configure'){if(moonsprite.window.id&&message.windowId!==moonsprite.window.id)return;activePets=message.pet?[message.pet]:null;positionKey=message.positionKey||positionKey;project=message.project;preferences={...preferences,...message.preferences};activePetId=message.activePetId||activePetId;(async()=>{await refreshCatalog(message.playShow===true)})().catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='visibility'&&message.visible===false){animationToken++;return}
if(message.type==='project'){project=message.project;return}
if(message.type==='preferences'){preferences={...preferences,...message.preferences};if(pet)updateScale();return}
if(message.type==='cursorPolicy'){applyCursorPolicy(message.useLocalCursors===true);return}
if(message.type==='activate'){activePetId=message.petId;activePets=Array.isArray(message.pets)?message.pets:null;refreshCatalog(true).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='catalog'||message.type==='refresh'){activePets=null;refreshCatalog(false).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='notice')showNotice(message.text).catch(error=>moonsprite.diagnostics.log(String(error),'error'))});
moonsprite.window.postMessage({type:'ready'}).catch(()=>{});
`

const managerSource = `
const MAX_EDGE=192,MAX_FRAMES=120;
const scaleSurface=(source,sourceWidth,sourceHeight)=>{const factor=Math.min(1,MAX_EDGE/Math.max(sourceWidth||1,sourceHeight||1));const width=Math.max(1,Math.round((sourceWidth||1)*factor)),height=Math.max(1,Math.round((sourceHeight||1)*factor));const surface=document.createElement('canvas');surface.width=width;surface.height=height;const ctx=surface.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(source,0,0,width,height);return{surface,ctx,width,height}};
const decodeGif=async bytes=>{if(typeof ImageDecoder!=='function')throw new Error('当前环境不支持 GIF 动画解码，请导入 PNG 或 WebP 静态图片。');const decoder=new ImageDecoder({data:bytes,type:'image/gif',preferAnimation:true});try{await decoder.tracks.ready;await decoder.completed;const track=decoder.tracks.selectedTrack;const count=Math.min(track?track.frameCount:1,MAX_FRAMES);if(track&&track.frameCount>MAX_FRAMES)throw new Error('单个动画最多 120 帧，请缩短素材。');if(count<=1)return null;const first=await decoder.decode({frameIndex:0,completeFramesOnly:true});const size=scaleSurface(first.image,first.image.displayWidth||first.image.width,first.image.displayHeight||first.image.height);first.image.close();const sheet=document.createElement('canvas');sheet.width=size.width;sheet.height=size.height*count;const ctx=sheet.getContext('2d'),durations=[];for(let index=0;index<count;index++){const decoded=await decoder.decode({frameIndex:index,completeFramesOnly:true});ctx.drawImage(decoded.image,0,index*size.height,size.width,size.height);durations.push(Math.max(40,Math.min(1000,Math.round((decoded.image.duration||100000)/1000))));decoded.image.close();await new Promise(resolve=>setTimeout(resolve,0))}return{sheet,durations}}finally{decoder.close()}};
const decodeStill=async bytes=>{const url=URL.createObjectURL(new Blob([bytes]));try{const image=await decodeImage(url);const size=scaleSurface(image,image.naturalWidth,image.naturalHeight);return{sheet:size.surface,durations:[125]}}finally{URL.revokeObjectURL(url)}};
const sliceSheet=(surface,frameCount)=>({dataUrl:surface.toDataURL('image/png'),frameWidth:surface.width,frameHeight:surface.height/frameCount,frameCount});

// Slots follow the behaviors implemented by the extension, never user metadata.
const animationSlots=()=>['SHOW','IDLE'];
let activeId=BUILT_IN.id,status='',nameInput={value:''},result=null,staged=[];
const publish=()=>moonsprite.window.postMessage({type:'catalog'});
const renderList=async()=>{
 const pets=await listPets(),shown=await moonsprite.storage.get('shownPets')||[BUILT_IN.id],prefs=await moonsprite.storage.get('preferences')||{};
 if(!pets.some(pet=>pet.id===activeId))activeId=BUILT_IN.id;
 const sidebar=[{id:'list-title',type:'heading',label:'我的宠物'}];
 for(const pet of pets)sidebar.push({id:'edit-'+pet.id,type:'choice',label:pet.name,description:!pet.frameCount?'待上传动画':prefs.enabled!==false&&shown.includes(pet.id)?'显示中':'已隐藏',selected:pet.id===activeId,action:{type:'ui-edit',petId:pet.id}});
 sidebar.push({id:'create-line',type:'separator'},{id:'newName',type:'input',label:'新宠物名称',value:nameInput.value},{id:'create',type:'button',label:'创建宠物',action:{type:'ui-create'}},{id:'import-pet',type:'file',label:'导入宠物包…',accept:'.mspet',multiple:false,action:{type:'ui-import-pet'}});
 const detail=[],target=pets.find(pet=>pet.id===activeId);
 if(target){
 const header=[{id:'name',type:'heading',label:target.name}];
 if(target.frameCount){try{const loaded=await loadSheetUrl(target);try{const image=await decodeImage(loaded.url),canvas=document.createElement('canvas');canvas.width=target.frameWidth;canvas.height=target.frameHeight;const ctx=canvas.getContext('2d');if(target.mirrored){ctx.translate(canvas.width,0);ctx.scale(-1,1)}ctx.drawImage(image,0,0);header.unshift({id:'preview',type:'image',src:canvas.toDataURL('image/png'),label:target.name})}finally{if(loaded.revoke)URL.revokeObjectURL(loaded.url)}}catch(error){status=String(error)}}
 detail.push({id:'header',type:'row',children:header},{id:'display-row',type:'row',children:[{id:'pet-visible',type:'toggle',label:'宠物显示',value:target.frameCount>0&&prefs.enabled!==false&&shown.includes(target.id),disabled:!target.frameCount,action:{type:'ui-visible',petId:target.id}},{id:'mirror',type:'toggle',label:'水平镜像',value:target.mirrored===true,action:{type:'ui-mirror',petId:target.id}}]},
 {id:'scale-row',type:'row',align:'end',children:[{id:'scale',type:'number',label:'缩放倍率',value:target.scale||2,min:1,max:4},{id:'save-scale',type:'button',label:'应用',action:{type:'ui-scale',petId:target.id}}]},
 {id:'animations-line',type:'separator'},{id:'animation-title',type:'heading',label:'动画槽位'});
 const animations=animationMap(target);
 for(const name of animationSlots(target)){const count=animations[name]?.length||0;detail.push({id:'slot-'+name,type:'slot',label:name+(name==='SHOW'?' · 出场':name==='IDLE'?' · 待机':''),description:count?count+' 帧':'未上传',children:[{id:'upload-'+name,type:'file',label:(count?'替换 ':'上传 ')+name,multiple:false,action:{type:'ui-upload-slot',petId:target.id,animation:name}},{id:'clear-'+name,type:'button',label:'清除',disabled:!count,action:{type:'ui-clear-slot',petId:target.id,animation:name}}]})}
 detail.push({id:'hint',type:'text',label:'每个槽位独立上传、替换或清除。支持 GIF、PNG、WebP。'},{id:'package-line',type:'separator'},{id:'export-pet',type:'button',label:'导出宠物包…',action:{type:'ui-export-pet',petId:target.id}});
 if(target.id!==BUILT_IN.id)detail.push({id:'delete-line',type:'separator'},{id:'delete-'+target.id,type:'button',label:'删除此宠物',action:{type:'ui-delete',petId:target.id}});
 }
 const nodes=[{id:'manager-layout',type:'split',children:[{id:'pet-list',type:'sidebar',label:'宠物列表',children:sidebar},{id:'pet-detail',type:'column',label:'当前宠物设置',children:detail}]}];
 await moonsprite.window.postMessage({type:'ui-state',nodes,status,result});
};
const combineAnimations=parts=>{
 const width=Math.max(...parts.map(part=>part.sheet.width)),height=Math.max(...parts.map(part=>part.sheet.height/part.durations.length)),frameCount=parts.reduce((sum,part)=>sum+part.durations.length,0);
 if(frameCount>240)throw new Error('一个宠物最多包含 240 帧。');
 const sheet=document.createElement('canvas');sheet.width=width;sheet.height=height*frameCount;const ctx=sheet.getContext('2d');const animations=Object.create(null),durations=[];let offset=0;
 for(const part of parts){const h=part.sheet.height/part.durations.length;animations[part.name]=[];for(let index=0;index<part.durations.length;index++){ctx.drawImage(part.sheet,0,index*h,part.sheet.width,h,Math.floor((width-part.sheet.width)/2),(offset+index)*height+height-h,part.sheet.width,h);animations[part.name].push(offset+index)}offset+=part.durations.length;durations.push(...part.durations)}
 return{sheet,animations,durations};
};
const animationMap=entry=>entry.animations?Object.fromEntries(Object.entries(entry.animations).filter(([name])=>animationSlots().includes(name))):{...(entry.showFrames?.length?{SHOW:entry.showFrames}:{}),IDLE:entry.idleFrames?.length?entry.idleFrames:Array.from({length:entry.frameCount},(_,index)=>index)};
const mergeAnimationParts=(existing,uploaded)=>{const names=new Set(uploaded.map(part=>part.name));return [...existing.filter(part=>!names.has(part.name)),...uploaded]};
const importAnimations=async(files,petId,clearName=null)=>{
 const meta=await readMeta(),target=(await listPets()).find(entry=>entry.id===petId);if(!target)throw new Error('请先创建或选择宠物。');
 if(!Array.isArray(files)||(!files.length&&!clearName)||files.length>16)throw new Error('请选择 1 至 16 个动画。');
 const names=files.map(file=>String(file.animation||'').trim().toUpperCase());if(names.some(name=>!name||name.length>32)||new Set(names).size!==names.length)throw new Error('动画名称不能为空或重复，最多 32 个字符。');
 const oldParts=[];
 if(target.frameCount){const loaded=await loadSheetUrl(target);try{const image=await decodeImage(loaded.url);for(const [name,frames] of Object.entries(animationMap(target))){if(name===clearName||names.includes(name)||!frames.length)continue;const sheet=document.createElement('canvas');sheet.width=target.frameWidth;sheet.height=target.frameHeight*frames.length;const ctx=sheet.getContext('2d');frames.forEach((frame,index)=>ctx.drawImage(image,0,frame*target.frameHeight,target.frameWidth,target.frameHeight,0,index*target.frameHeight,target.frameWidth,target.frameHeight));oldParts.push({name,sheet,durations:frames.map(frame=>target.durations?.[frame]||125)})}}finally{if(loaded.revoke)URL.revokeObjectURL(loaded.url)}}
 const uploaded=[];for(let index=0;index<files.length;index++){const file=files[index],bytes=new Uint8Array(file.bytes);const decoded=(file.mime==='image/gif'?await decodeGif(bytes):null)||await decodeStill(bytes);uploaded.push({...decoded,name:names[index]})}
 const parts=mergeAnimationParts(oldParts,uploaded);if(parts.length>16)throw new Error('一个宠物最多包含 16 个动画。');
 if(!parts.length){const entry={...target,frameCount:0,animations:{},idleFrames:[],showFrames:[],durations:[],spriteKey:undefined};await writeMeta([...meta.filter(item=>item.id!==target.id),entry]);if(target.source==='custom'&&target.frameCount)await spriteDelete(target.spriteKey||target.id);await publish();return}
 const combined=combineAnimations(parts),frameCount=combined.durations.length,sliced=sliceSheet(combined.sheet,frameCount),spriteKey=target.id+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const entry={...target,spriteKey,frameWidth:sliced.frameWidth,frameHeight:sliced.frameHeight,frameCount,animations:combined.animations,idleFrames:combined.animations.IDLE||Object.values(combined.animations)[0],showFrames:combined.animations.SHOW||[],durations:combined.durations,source:'custom'};
 await spriteWrite(spriteKey,sliced.dataUrl);try{await writeMeta([...meta.filter(item=>item.id!==target.id),entry])}catch(error){await spriteDelete(spriteKey);throw error}
 if(target.source==='custom'&&target.frameCount)await spriteDelete(target.spriteKey||target.id);
 await publish();status='已保存 '+target.name+' 的动画';
};
// Self-contained data-only pet package. Local IDs, storage keys and visibility never travel.
const validatePetPackage=data=>{
 if(!data||data.format!=='moonsprite-pet'||data.version!==1)throw new Error('不是受支持的宠物包，或版本不兼容。');
 const p=data.pet;if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>24)throw new Error('宠物名称无效。');
 const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
 if(!integer(p.frameWidth,1,512)||!integer(p.frameHeight,1,512)||!integer(p.frameCount,0,240)||p.frameWidth*p.frameHeight*p.frameCount>16000000)throw new Error('动画尺寸或帧数无效。');
 if(!integer(p.scale,1,4)||typeof p.mirrored!=='boolean')throw new Error('宠物显示设置无效。');
 if(!Array.isArray(p.durations)||p.durations.length!==p.frameCount||p.durations.some(n=>!integer(n,1,60000)))throw new Error('动画时长无效。');
 if(!p.animations||typeof p.animations!=='object'||Array.isArray(p.animations)||Object.keys(p.animations).length>16)throw new Error('动画列表无效。');
 const animations=Object.create(null);for(const [name,frames] of Object.entries(p.animations)){if(!/^[A-Z][A-Z0-9_-]{0,31}$/.test(name)||!Array.isArray(frames)||frames.length>240||frames.some(n=>!integer(n,0,p.frameCount-1)))throw new Error('动画帧索引无效。');animations[name]=[...frames]}
 if(p.frameCount&&!Object.values(animations).some(frames=>frames.length))throw new Error('宠物包缺少动画。');
 if(p.frameCount){
  if(typeof data.sprite!=='string'||data.sprite.length>249000||(!data.sprite.startsWith('data:image/png;base64,')||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.sprite.slice(22))))throw new Error('宠物素材无效或超过容量。');
  const binary=atob(data.sprite.slice(22)),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(bytes.length<33||[137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error('宠物素材不是 PNG。');
  const view=new DataView(bytes.buffer);if(view.getUint32(16)!==p.frameWidth||view.getUint32(20)!==p.frameHeight*p.frameCount)throw new Error('素材尺寸与动画设置不一致。');
 }else if(data.sprite!==null)throw new Error('空宠物不应包含素材。');
 return{pet:{name:p.name.trim(),frameWidth:p.frameWidth,frameHeight:p.frameHeight,frameCount:p.frameCount,scale:p.scale,mirrored:p.mirrored,durations:[...p.durations],animations},sprite:data.sprite};
};
const exportPetPackage=async petId=>{
 const target=(await listPets()).find(p=>p.id===petId);if(!target)throw new Error('宠物不存在。');
 let sprite=null;if(target.frameCount){if(target.source==='builtin'){const bytes=await moonsprite.resources.read('sprite');let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);sprite='data:image/png;base64,'+btoa(binary)}else sprite=await spriteRead(target.spriteKey||target.id)}
 const data={format:'moonsprite-pet',version:1,pet:{name:target.name,frameWidth:target.frameWidth,frameHeight:target.frameHeight,frameCount:target.frameCount,scale:target.scale||2,mirrored:target.mirrored===true,animations:animationMap(target),durations:Array.from({length:target.frameCount},(_,i)=>target.durations?.[i]||125)},sprite};
 validatePetPackage(data);return{name:Array.from(target.name,c=>c.charCodeAt(0)<32||'<>:"/|?*'.includes(c)||c.charCodeAt(0)===92?'_':c).join('')+'.mspet',bytes:Array.from(new TextEncoder().encode(JSON.stringify(data)))};
};
const importPetPackage=async files=>{
 if(!Array.isArray(files)||files.length!==1||!Array.isArray(files[0].bytes)||files[0].bytes.length>512000||files[0].bytes.some(n=>!Number.isInteger(n)||n<0||n>255))throw new Error('请选择一个有效的宠物包（最大 500 KiB）。');
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(files[0].bytes)))}catch{throw new Error('宠物包无法读取，文件可能已损坏。')}
 const parsed=validatePetPackage(data),meta=await readMeta();if(meta.filter(p=>p.id!==BUILT_IN.id).length>=SLOT_COUNT-1)throw new Error('宠物数量已达上限。');
 if(parsed.sprite){const image=await decodeImage(parsed.sprite);if(image.naturalWidth!==parsed.pet.frameWidth||image.naturalHeight!==parsed.pet.frameHeight*parsed.pet.frameCount)throw new Error('宠物素材解码尺寸不一致。')}
 const id='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),spriteKey=id+'-sheet',animations=animationMap(parsed.pet);
 const entry={...parsed.pet,id,source:'custom',spriteKey:parsed.sprite?spriteKey:undefined,idleFrames:animations.IDLE?.length?animations.IDLE:animations.SHOW?.length?animations.SHOW:Object.values(animations).find(frames=>frames.length)||[],showFrames:animations.SHOW||[]};
 if(parsed.sprite)await spriteWrite(spriteKey,parsed.sprite);
 try{await writeMeta([...meta,entry])}catch(error){if(parsed.sprite)await spriteDelete(spriteKey);throw error}
 activeId=id;staged=[];await publish();status='已导入 '+entry.name+'，可从顶部宠物菜单开启显示';return entry;
};
let operations=Promise.resolve();
moonsprite.window.onMessage(message=>{
 operations=operations.then(async()=>{
  result=null;
  try{
   const values=message.values||{};if(typeof values.newName==='string')nameInput.value=values.newName;staged=staged.map((file,index)=>({...file,animation:String(values['animation-'+index]??file.animation)}));
   if(message.type==='catalog'){if(message.petId&&(await listPets()).some(pet=>pet.id===message.petId)){activeId=message.petId;staged=[]}}
   else if(message.type==='ui-export-pet'){const file=await exportPetPackage(message.petId);result={requestId:message.requestId,ok:true,file};status='宠物包已准备好'}
   else if(message.type==='ui-import-pet'){await importPetPackage(message.files)}
   else if(message.type==='ui-edit'){activeId=message.petId;staged=[]}
   else if(message.type==='ui-upload-slot'){if(message.petId!==activeId)throw new Error('编辑对象已变更');const target=(await listPets()).find(pet=>pet.id===activeId);if(!target||!animationSlots(target).includes(message.animation))throw new Error('动画槽位不存在');if(!Array.isArray(message.files)||message.files.length!==1)throw new Error('每个槽位请选择一个动画文件');await importAnimations([{...message.files[0],animation:message.animation}],target.id)}
   else if(message.type==='ui-clear-slot'){if(message.petId!==activeId)throw new Error('编辑对象已变更');if(!animationSlots().includes(message.animation))throw new Error('动画槽位不存在');await importAnimations([],message.petId,message.animation);status='已清除 '+message.animation+' 动画'}
   else if(message.type==='ui-stage'){if(message.petId!==activeId)throw new Error('编辑对象已变更');if(!Array.isArray(message.files)||staged.length+message.files.length>16)throw new Error('最多 16 个动画');const target=(await listPets()).find(pet=>pet.id===activeId);for(const file of message.files){const base=String(file.name||'').replace(/\\.[^.]+$/,'').toUpperCase();staged.push({...file,animation:base==='SHOW'||base==='IDLE'?base:!target.frameCount&&!staged.length?'IDLE':base})}}
   else if(message.type==='ui-unstage'){staged=staged.filter((_,index)=>index!==message.index)}
   else if(message.type==='ui-scale'){const meta=await readMeta(),target=(await listPets()).find(pet=>pet.id===message.petId);if(!target)throw new Error('宠物不存在');const scale=Math.max(1,Math.min(4,Math.round(Number(values.scale??target.scale)||2)));await writeMeta([...meta.filter(pet=>pet.id!==target.id),{...target,scale}]);await publish();status='缩放已更新'}
   else if(message.type==='ui-visible'){const target=(await listPets()).find(pet=>pet.id===message.petId);if(!target?.frameCount)throw new Error('请先上传 IDLE 动画');let shown=await moonsprite.storage.get('shownPets')||[BUILT_IN.id];shown=shown.filter(id=>id!==target.id);if(message.value){shown.push(target.id);const preferences=await moonsprite.storage.get('preferences')||{};if(preferences.enabled===false)await moonsprite.storage.set('preferences',{...preferences,enabled:true})}await moonsprite.storage.set('shownPets',shown);await publish();status=message.value?'已显示 '+target.name:'已隐藏 '+target.name}
   else if(message.type==='ui-create'){
    const meta=await readMeta(),name=String(message.name||nameInput.value||'').trim().slice(0,24);if(!name)throw new Error('请输入宠物名称。');if(meta.filter(entry=>entry.id!==BUILT_IN.id).length>=SLOT_COUNT-1)throw new Error('宠物数量已达上限。');
    const entry={id:'custom-'+Date.now().toString(36),name,source:'custom',frameCount:0,frameWidth:1,frameHeight:1,animations:{},idleFrames:[],showFrames:[],mirrored:false};await writeMeta([...meta,entry]);activeId=entry.id;staged=[];nameInput.value='';status='已创建 '+name+'，请上传 IDLE 等动画';result={requestId:message.requestId,ok:true,petId:entry.id};
   }else if(message.type==='ui-import'){await importAnimations(message.files||staged,message.petId);staged=[]}
   else if(message.type==='ui-mirror'){
    const target=(await listPets()).find(entry=>entry.id===message.petId);if(!target)throw new Error('宠物不存在。');const meta=await readMeta();await writeMeta([...meta.filter(entry=>entry.id!==target.id),{...target,mirrored:(message.value??message.mirrored)===true}]);await publish();status='已更新镜像设置';
   }else if(message.type==='ui-delete'){
    const meta=await readMeta(),target=meta.find(entry=>entry.id===message.petId);if(!target||target.id===BUILT_IN.id)throw new Error('此宠物不能删除');
    await writeMeta(meta.filter(entry=>entry.id!==target.id));if(target.frameCount)await spriteDelete(target.spriteKey||target.id);if(activeId===target.id)activeId=BUILT_IN.id;await publish();status='已删除宠物';
   }else return;
   if(message.requestId&&!result)result={requestId:message.requestId,ok:true,petId:message.petId};
  }catch(error){status=String(error);result={requestId:message.requestId,ok:false}}
  await renderList();
 }).catch(error=>moonsprite.diagnostics.log(String(error),'error'));
});
renderList().catch(error=>moonsprite.diagnostics.log(String(error),'error'));
moonsprite.window.postMessage({type:'ready'}).catch(error=>moonsprite.diagnostics.log(String(error),'error'));
`

const petWindowPage = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;user-select:none}
#pet{position:absolute;left:50%;transform:translateX(-50%);bottom:200px;padding:0;border:0;outline:none;box-shadow:none;background:transparent;image-rendering:pixelated}
#pet,#pet *{cursor:var(--cursor-default)!important}
#pet.dragging,#pet.dragging *{cursor:var(--cursor-default)!important}
canvas{display:block;visibility:hidden;image-rendering:pixelated}
.bubble{position:absolute;left:50%;transform:translateX(-50%);width:max-content;max-width:280px;padding:4px 8px;overflow-wrap:anywhere;color:#f5f7fa;background:#151a22ee;border:1px solid #728096;font:12px/17px system-ui,sans-serif}
.bubble[hidden]{display:none}.bubble strong{display:block;margin-bottom:4px;color:white}.bubble small{display:block;color:#aeb9c7}
.notice{pointer-events:none}
</style></head><body><button id="pet" aria-label="${petName}"><canvas></canvas></button><aside id="info" class="bubble" hidden></aside><aside id="notice" class="bubble notice" hidden></aside><script>
${storeSource}
${petWindowSource}
</script></body></html>`

const managerPage = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
${storeSource}
${managerSource}
</script></body></html>`

const sprite = new Uint8Array(UPNG.encode([sheet.buffer], frameWidth, frameHeight * allFrames.length, 0))
writeFileSync(resolve(outputPath), zipSync({
  'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  'runtime/index.html': new TextEncoder().encode(runtimePage),
  'ui/pet.html': new TextEncoder().encode(petWindowPage),
  'ui/manager.html': new TextEncoder().encode(managerPage),
  'assets/companion.png': sprite
}, { level: 9 }))
console.log(`已生成 ${outputPath}：${frameWidth}x${frameHeight}，已裁剪源画布 (${bounds.left}, ${bounds.top})，SHOW ${showFrames.length} 帧，IDLE ${idleFrames.length} 帧，宠物槽位 ${PET_SLOT_COUNT} 个。`)