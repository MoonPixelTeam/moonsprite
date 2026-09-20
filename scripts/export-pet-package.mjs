import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, resolve } from 'node:path'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import UPNG from 'upng-js'
import { animationLoopFrameIdsForExport } from '../src/renderer/src/core/animation-loop-sections.ts'
import { createLocalizationSource } from './pet-companion-localization.mjs'

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

const sourceBytes = readFileSync(resolve(sourcePath))
const archive = unzipSync(sourceBytes)
const document = JSON.parse(strFromU8(archive['manifest.json'])).document
const timeline = document.animation
if (!timeline?.frames?.length) throw new Error('源工程没有动画时间轴。')

const frames = timeline.frames
const frameIndex = new Map(frames.map((frame, index) => [frame.id, index]))
const rangeFor = (name, repeatCount) => {
  const section = (timeline.loopSections ?? []).find((item) => item.name.toUpperCase() === name)
  const start = section && frameIndex.get(section.startFrameId)
  const end = section && frameIndex.get(section.endFrameId)
  if (start === undefined || end === undefined || end < start) throw new Error(`找不到有效的 ${name} 循环节。`)
  const byId = new Map(frames.map(frame => [frame.id, frame]))
  const playbackTimeline = repeatCount === undefined ? timeline : {...timeline, loopSections: timeline.loopSections.map(item => item.id === section.id ? {...item, repeatCount} : item)}
  return animationLoopFrameIdsForExport(playbackTimeline, start, end, section.id).map(id => byId.get(id))
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
const touchFrames = rangeFor('TOUCH')
const undoFrames = rangeFor('UNDO', 1)
const allFrames = [...showFrames, ...idleFrames, ...touchFrames, ...undoFrames]
const animationFrames = {}
let animationOffset = 0
for (const [name, frames] of [['SHOW', showFrames], ['IDLE', idleFrames], ['TOUCH', touchFrames], ['UNDO', undoFrames]]) {
  animationFrames[name === 'TOUCH' || name === 'UNDO' ? 'TRIGGER_' + name : name] = frames.map((_, index) => animationOffset + index)
  animationOffset += frames.length
}
if (allFrames.length > 240) throw new Error('展开循环后超过宠物的 240 帧上限，请减少循环次数。')
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
  assetVersion: 'loops-v2-undo-once:' + createHash('sha256').update(sourceBytes).digest('hex'),
  localizedName: petName === '奶龙' ? '奶龙' : undefined,
  animations: animationFrames,
  triggerSlots: [{id:'TRIGGER_TOUCH',event:'pet.enter',cooldownMs:0,idleSeconds:60,tool:''},{id:'TRIGGER_UNDO',event:'history.undo',cooldownMs:0,idleSeconds:60,tool:''}],
  durations: allFrames.map(frame => Math.max(1, Number(frame.duration) || 125)),
  source: 'builtin'
}

const localizationSource = createLocalizationSource();
const defaults = { language: 'auto', enabled: false, scale: 2, remindersEnabled: true, clockEnabled: true, unsavedMinutes: 15, breakMinutes: 60, unsavedEnabled: true, breakEnabled: true }

const triggerConditions = [
 ['history.undo','撤销','实际完成一次撤销后播放。'],['history.redo','重做','实际完成一次重做后播放。'],
 ['color.sampled','吸色','完成吸色操作后播放，不因手动改颜色触发。'],['document.saved','保存成功','文件写入成功后播放；取消或失败不触发。'],
 ['project.opened','打开工程','打开一个新工程后播放。'],['project.created','新建工程','新建工程成功后播放。'],['export-complete','导出成功','图片或动画导出成功后播放。'],
 ['drawing.completed','完成绘制','完成一笔有效绘制后播放。'],['fill.completed','填充完成','油漆桶或 F 填充产生修改后播放。'],
 ['selection.created','创建选区','创建或改变选区后播放。'],['tool.changed','切换工具','切换工具后播放，可限定目标工具。'],
 ['layer.created','新建图层','新增图层后播放，包括撤销恢复图层。'],['layer.deleted','删除图层','图层移除后播放，包括撤销新建图层。'],['layer.activated','切换图层','活动图层改变后播放。'],
 ['animation.started','播放动画','开始工程动画预览时播放。'],['animation.stopped','停止动画','停止工程动画预览时播放。'],
 ['pet.click','点击宠物','点击当前宠物时播放，拖动不算点击。'],['pet.drag-start','开始拖动宠物','当前宠物开始拖动时播放。'],['pet.dragging','持续拖动宠物','开始拖动后持续循环，松开或取消拖动时停止。'],['pet.drag-end','结束拖动宠物','松开拖动当前宠物后播放。'],
 ['pet.enter','鼠标移入宠物','指针进入当前宠物时播放。'],['idle','空闲一段时间','软件无键盘或指针活动达到指定秒数后播放，每次空闲只触发一次。']
];

const manifest = {
  schemaVersion: 2,
  apiVersion: '1.0.0',
  id: extensionId,
  name: 'Pet Companion',
  version: '1.0.0',
  description: 'Animated companions with custom animations, pet packages and reminders. Supports 9 languages.',
  settingsUi: { storageKey: 'preferences', controls: [
    {id:'remindersEnabled',type:'checkbox',label:'提醒总开关',description:'统一控制报时、保存和休息提醒；关闭后保留各项设置。',defaultValue:true},
    {id:'clockEnabled',type:'checkbox',visibleWhen:{remindersEnabled:true},label:'自动报时',description:'在整点和半点显示当前时间。',defaultValue:true},
    {id:'unsavedEnabled',type:'checkbox',visibleWhen:{remindersEnabled:true},label:'启用保存提醒',defaultValue:true},
    {id:'breakEnabled',type:'checkbox',visibleWhen:{remindersEnabled:true},label:'启用连续绘制提醒',defaultValue:true},
    {id:'unsavedMinutes',type:'number',label:'未保存时长（分钟）',visibleWhen:{remindersEnabled:true,unsavedEnabled:true},defaultValue:15,min:1,max:1440,step:1},
    {id:'breakMinutes',type:'number',label:'连续绘制时长（分钟）',visibleWhen:{remindersEnabled:true,breakEnabled:true},defaultValue:60,min:1,max:1440,step:1},
    {id:'manager',type:'button',label:'宠物管理…',fullWidth:true,commandId:'manager',variant:'primary',closeOnRun:true}
  ] },
  runtime: {
    entry: 'runtime/index.html',
    permissions: ['runtime', 'commands', 'menus', 'ui', 'windows', 'workspace.read', 'document.read', 'events', 'storage', 'resources', 'notifications', 'diagnostics'],
    resources: { 'pet-window': 'ui/pet.html', 'pet-manager': 'ui/manager.html', sprite: 'assets/companion.png' }
  },
  commands: [
    { id: 'manager', name: 'Pet Companion…', runtimeEvent: 'manager' },
    { id: 'settings', name: '宠物设置…', opensSettings: true }
  ],
  topMenus: [
    {
      id: 'pet-menu',
      name: '宠物',
      description: 'Pet Companion',
      position: 'after:window',
      commands: ['settings']
    }
  ]
}

/**
 * Pet sheet lookup shared by the pet window and the manager window.
 *
 * Built-in pets are package resources. Imported pets are PNG data URLs kept in
 * the host storage bridge, shared by the manager and companion windows.
 */
const builtinSource = `
const resolveBuiltin=(saved,builtin)=>{const entry=saved&&saved.assetVersion===builtin.assetVersion?saved:{...builtin,...(saved?.scale?{scale:saved.scale}:{}),...(typeof saved?.mirrored==='boolean'?{mirrored:saved.mirrored}:{})};return entry.localizedName?{...entry,name:t(entry.localizedName)}:entry};
`;
const storeSource = `
${localizationSource}
${builtinSource}
const TRIGGER_CONDITIONS=${JSON.stringify(triggerConditions)};
const META_KEY='pet-sprites',BUILT_IN=${JSON.stringify(builtInPet)},SLOT_COUNT=${PET_SLOT_COUNT};
const spriteRead=key=>moonsprite.storage.get('sprite.'+key);
const spriteWrite=async(key,value)=>{if(new TextEncoder().encode(JSON.stringify(value)).length>250000)throw new Error(t('素材超过单项存储容量，请使用更小或更短的动画。'));await moonsprite.storage.set('sprite.'+key,value);return true};
const spriteDelete=key=>moonsprite.storage.remove('sprite.'+key);
const readMeta=async()=>{const stored=await moonsprite.storage.get(META_KEY);return Array.isArray(stored)?stored.filter(entry=>entry&&typeof entry.id==='string'):[]};
const writeMeta=list=>moonsprite.storage.set(META_KEY,list);
const listPets=async()=>{const meta=await readMeta();return[resolveBuiltin(meta.find(entry=>entry.id===BUILT_IN.id),BUILT_IN),...meta.filter(entry=>entry.id!==BUILT_IN.id)]};
const loadSheetUrl=async pet=>{if(pet.source==='builtin'){const bytes=await moonsprite.resources.read('sprite');return{url:URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'image/png'})),revoke:true}}const dataUrl=await spriteRead(pet.spriteKey||pet.id);if(typeof dataUrl!=='string')throw new Error(t('宠物素材已丢失：{name}',{name:pet.name}));return{url:dataUrl,revoke:false}};
const decodeImage=url=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error(t('宠物素材无法解码。')));image.src=url});
`

const runtimePage = `<!doctype html><html><body><script>
${localizationSource}
${builtinSource}
const defaults=${JSON.stringify(defaults)},builtInPet=${JSON.stringify(builtInPet)};
let hostLocale=null,runtimeActivated=false;
let preferences={...defaults},project=null,dirtySince=0,drawingSince=0,lastDrawingAt=0,lastRevision=null,lastProjectId=null,lastBreakNotice=0,lastUnsavedNotice=0,lastClockKey='';
const live=new Map(),visible=new Set(),ready=new Set();let shownIds=[],queue=Promise.resolve();
const read=key=>moonsprite.storage.get({key});
const write=(key,value)=>moonsprite.storage.set({key,value});
const report=error=>moonsprite.diagnostics.log({message:String(error),level:'error'});
const send=(windowId,message)=>moonsprite.windows.postMessage({windowId,message}).catch(error=>{if(windowId==='manager'&&String(error).includes('扩展窗口不存在')){managerReady=false;return}return report(error)});
const broadcast=message=>Promise.all([...visible].map(id=>send(id,message)));
moonsprite.on('editor-event',event=>Promise.all([...live].filter(([id,pet])=>visible.has(id)&&pet.triggerSlots?.some(slot=>slot.event===event.name)).map(([id])=>send(id,{type:'trigger',event:event.name,detail:event.detail}))));
moonsprite.on('export-complete',()=>broadcast({type:'trigger',event:'export-complete'}));
moonsprite.on('interaction',()=>broadcast({type:'activity'}));
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

const catalog=async()=>{const meta=await read('pet-sprites')||[];return[resolveBuiltin(meta.find(pet=>pet.id===builtInPet.id),builtInPet),...meta.filter(pet=>pet.id!==builtInPet.id)]};
const configure=(pet,playShow)=>({type:'configure',windowId:'pet-'+pet.id,pet,project,preferences:{...preferences,scale:pet.scale||preferences.scale||2},activePetId:pet.id,playShow,positionKey:'position:'+pet.id});
const syncMenu=pets=>{const available=pets.filter(pet=>pet.frameCount>0);return moonsprite.menus.setItems({menuId:'pet-menu',name:t('宠物'),items:[...available.map(pet=>({id:pet.id,name:pet.name,event:'toggle-pet',checked:preferences.enabled&&shownIds.includes(pet.id)})),{id:'manager',name:t('宠物管理…'),event:'manager',checked:false,dividerBefore:available.length>0},{id:'settings',name:t('宠物设置…'),event:'settings',checked:false}]})};
const enqueue=operation=>{const task=queue.then(operation);queue=task.catch(report);return task};
const reload=async()=>{preferences={...defaults,...await read('preferences'),hostLocale};setPetLanguage(preferences.language,preferences.hostLocale);const stored=await read('shownPets');shownIds=Array.isArray(stored)?stored:[]};
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
 if(managerReady)await send('manager',{type:'catalog',hostLocale});
};
const reconcile=()=>enqueue(async()=>{await reload();await reconcileNow()});
let initialization=Promise.resolve(),managerPetId=null,managerReady=false;
const openManager=async(petId=null)=>{managerPetId=petId;await moonsprite.windows.open({windowId:'manager',resourceId:'pet-manager',options:{presentation:'dialog',component:'form',title:t('宠物管理')}});if(managerReady)await send('manager',{type:'catalog',petId:managerPetId,hostLocale})};
moonsprite.on('locale-changed',event=>{hostLocale=event.locale;if(!runtimeActivated)return;return enqueue(async()=>{await reload();await reconcileNow();if(managerReady)await openManager(managerPetId)})});
moonsprite.on('activate',()=>{initialization=enqueue(async()=>{if(moonsprite.runtime?.getLocale){const current=await moonsprite.runtime.getLocale();hostLocale=current.locale}await reload();runtimeActivated=true;await moonsprite.windows.close({windowId:'companion'}).catch(report);await reconcileNow()});return initialization});
moonsprite.on('command',async event=>{if(event.event==='toggle-pet')return enqueue(async()=>{await reload();const pet=(await catalog()).find(pet=>pet.id===event.commandId&&pet.frameCount>0);if(!pet)return;const showing=preferences.enabled&&shownIds.includes(pet.id);shownIds=shownIds.filter(id=>id!==pet.id);if(!showing){shownIds.push(pet.id);preferences.enabled=true;await write('preferences',preferences)}await write('shownPets',shownIds);await reconcileNow()});if(event.event==='settings')return moonsprite.ui.openSettings();if(event.event==='manager')await openManager()});
moonsprite.on('settings-changed',async event=>{if(event.key==='preferences')await reconcile()});
moonsprite.on('window-message',async event=>{const message=event.message;if(!message)return;
 if(event.windowId==='manager'){
  if(message.type==='catalog')await reconcile()
  if(message.type==='language'){await reload();await openManager(managerPetId)}
  if(message.type==='ready'){managerReady=true;await send('manager',{type:'catalog',petId:managerPetId,hostLocale})}
  return
 }
 const pet=live.get(event.windowId);if(!pet)return;
 if(message.type==='activity'){await broadcast({type:'activity'});return}
if(message.type==='notice-distance'){acceptNoticeDistance(event.windowId,message);return}
 if(message.type==='ready'){ready.add(event.windowId);if(visible.has(event.windowId))await send(event.windowId,configure(pet,true));else await send(event.windowId,{type:'visibility',visible:false})}
 if(message.type==='manager')await openManager(pet.id)
});
moonsprite.on('project',event=>{const next=event.project,now=Date.now();if(next?.id!==lastProjectId){dirtySince=0;drawingSince=0;lastDrawingAt=0;lastRevision=null;lastUnsavedNotice=0;lastBreakNotice=0}lastProjectId=next?.id;project=next;
 if(next){if(next.dirty&&!dirtySince)dirtySince=now;if(!next.dirty){dirtySince=0;lastUnsavedNotice=0}if(lastRevision!==null&&next.contentRevision!==lastRevision){if(!lastDrawingAt||now-lastDrawingAt>300000)drawingSince=now;lastDrawingAt=now}lastRevision=next.contentRevision}return broadcast({type:'project',project})});
moonsprite.on('document-saved',()=>notifyNearest({type:'notice',text:t('保存好啦，这份进度安心收下了。')}));
moonsprite.on('clock',event=>{
 if(!preferences.enabled||!preferences.remindersEnabled)return;const now=event.timestamp,date=new Date(now);
 if(preferences.clockEnabled&&(date.getMinutes()===0||date.getMinutes()===30)){const key=date.toDateString()+date.getHours()+':'+date.getMinutes();if(key!==lastClockKey){lastClockKey=key;notifyNearest({type:'notice',text:t('现在是 {time} 啦，愿你的灵感正好在身边。',{time:date.toLocaleTimeString(petLocale,{hour:'2-digit',minute:'2-digit'})})})}}
 const breakMs=Math.max(1,Number(preferences.breakMinutes)||60)*60000;
 if(project&&preferences.breakEnabled!==false&&drawingSince&&now-lastDrawingAt<300000&&now-drawingSince>=breakMs&&now-lastBreakNotice>=breakMs){lastBreakNotice=now;notifyNearest({type:'notice',text:t('你已经连续绘制了 {minutes} 分钟，休息一下眼睛和手腕吧，我在这里等你。',{minutes:Math.floor((now-drawingSince)/60000)})})}
 const unsavedMs=Math.max(1,Number(preferences.unsavedMinutes)||15)*60000;
 if(project&&preferences.unsavedEnabled!==false&&dirtySince&&now-dirtySince>=unsavedMs&&now-lastUnsavedNotice>=unsavedMs){lastUnsavedNotice=now;notifyNearest({type:'notice',text:t('已经 {minutes} 分钟没有保存文件啦，记得保存，别让灵感溜走哦。',{minutes:Math.floor((now-dirtySince)/60000)})})}
});
</script></body></html>`

const petWindowSource = `
const expandedSize=360;
let pet=null,image=null,hitAlpha=null,hitRegionDirty=false,project=null,preferences=${JSON.stringify(defaults)},animationToken=0,pointer=null,noticeTimer=0,expanded=false,desiredExpanded=false,boundsQueue=Promise.resolve(),sheetUrl=null,sheetRevoke=false,catalog=[],slotPets=[],activePets=null,activePetId=${JSON.stringify(BUILT_IN_PET_ID)},resizeTimer=0,positionKey='position';
const petElement=document.querySelector('#pet'),canvas=document.querySelector('canvas'),context=canvas.getContext('2d',{willReadFrequently:true}),info=document.querySelector('#info'),notice=document.querySelector('#notice');
let draggingAnimation=false;
let petVisible=true,triggerBusyUntil=0,lastActivity=Date.now();const triggerLast=new Map(),idleTriggered=new Set();
const markActivity=()=>{lastActivity=Date.now();idleTriggered.clear()};
const triggerAnimation=(event,detail={})=>{if(!petVisible||!pet||draggingAnimation)return false;const now=Date.now();for(const slot of pet.triggerSlots||[]){if(slot.event!==event||(event==='tool.changed'&&slot.tool&&slot.tool!==detail.tool)||(detail.slotId&&detail.slotId!==slot.id))continue;const frames=pet.animations?.[slot.id];if(!frames?.length||(slot.cooldownMs>0&&now<triggerBusyUntil)||(triggerLast.has(slot.id)&&now-triggerLast.get(slot.id)<slot.cooldownMs))continue;triggerLast.set(slot.id,now);triggerBusyUntil=now+frames.reduce((total,frame)=>total+(pet.durations?.[frame]||125),0);play(frames,false);return true}return false};
setInterval(()=>{if(!petVisible||document.hidden||!pet||Date.now()<triggerBusyUntil)return;const now=Date.now(),due=(pet.triggerSlots||[]).filter(slot=>slot.event==='idle'&&!idleTriggered.has(slot.id)&&now-lastActivity>=slot.idleSeconds*1000&&pet.animations?.[slot.id]?.length&&(!triggerLast.has(slot.id)||now-triggerLast.get(slot.id)>=slot.cooldownMs));if(!due.length)return;const chosen=due[Math.floor(Math.random()*due.length)];if(triggerAnimation('idle',{slotId:chosen.id}))for(const slot of due)idleTriggered.add(slot.id)},1000);
let lastActivityReport=0;const reportActivity=()=>{markActivity();if(Date.now()-lastActivityReport<500)return;lastActivityReport=Date.now();moonsprite.window.postMessage({type:'activity'}).catch(error=>moonsprite.diagnostics.log(String(error),'error'))};addEventListener('pointermove',reportActivity);addEventListener('keydown',reportActivity);let hoveringOpaque=false;const hitCurrentPixel=event=>{if(!pet)return false;const rect=canvas.getBoundingClientRect(),x=Math.floor((event.clientX-rect.left)*canvas.width/rect.width),y=Math.floor((event.clientY-rect.top)*canvas.height/rect.height);return x>=0&&y>=0&&x<canvas.width&&y<canvas.height&&context.getImageData(x,y,1,1).data[3]>0};petElement.addEventListener('pointermove',event=>{if(pointer?.dragged)return;const inside=hitCurrentPixel(event);if(inside&&!hoveringOpaque)triggerAnimation('pet.enter');hoveringOpaque=inside});petElement.addEventListener('pointerleave',()=>{hoveringOpaque=false});
const scaleOf=()=>Math.max(1,Math.min(4,Math.round(preferences.scale||2)));
const compactSize=()=>pet?{width:Math.max(360,pet.frameWidth*scaleOf()+600),height:Math.max(360,pet.frameHeight*scaleOf()+400)}:{width:120,height:120};
let positionRatio=null,positionLoaded=false,hostEpoch=0;
const persistPosition=bounds=>moonsprite.storage.set(positionKey,{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,layout:'relative',ratio:positionRatio});
const savePosition=async(bounds,epoch=hostEpoch)=>{const host=await moonsprite.window.getHostBounds();if(epoch!==hostEpoch)return;positionRatio=relativePetPosition(bounds,host,contentBounds());positionLoaded=true;await persistPosition(bounds)};
// Overlay regions clip drawing as well as input. Use the union of all animation
// silhouettes so asynchronous region updates cannot cut off a newer frame.
const updateHitRegion=async()=>{try{await positionBubbles()}catch(error){moonsprite.diagnostics.log(String(error),'error')}if(!hitAlpha)return;const viewportWidth=Math.max(1,window.innerWidth),viewportHeight=Math.max(1,window.innerHeight),spans=[],rect=petElement.getBoundingClientRect(),scale=rect.width/pet.frameWidth;for(let y=0;y<pet.frameHeight;y++){let start=-1;for(let x=0;x<=pet.frameWidth;x++){const opaque=x<pet.frameWidth&&hitAlpha[y*pet.frameWidth+(pet.mirrored?pet.frameWidth-1-x:x)]>0;if(opaque&&start<0)start=x;if(!opaque&&start>=0){const left=Math.max(0,Math.floor(rect.left+start*scale)),right=Math.min(viewportWidth,Math.ceil(rect.left+x*scale)),top=Math.max(0,Math.floor(rect.top+y*scale)),bottom=Math.min(viewportHeight,Math.ceil(rect.top+(y+1)*scale));for(let hitY=top;hitY<bottom;hitY++)spans.push({x:left,y:hitY,width:Math.max(1,right-left)});start=-1}}}for(const bubble of [info,notice])if(!bubble.hidden){const box=bubble.getBoundingClientRect();for(let y=Math.max(0,Math.floor(box.top));y<Math.min(viewportHeight,Math.ceil(box.bottom));y++){const left=Math.max(0,Math.floor(box.left)),right=Math.min(viewportWidth,Math.ceil(box.right));spans.push({x:left,y,width:Math.max(1,right-left)})}}return moonsprite.window.setHitRegion(viewportWidth,viewportHeight,spans).catch(error=>moonsprite.diagnostics.log(t('无法更新宠物命中区域：')+String(error),'error'))};
const scheduleHitRegion=()=>{if(hitRegionDirty)return;hitRegionDirty=true;requestAnimationFrame(()=>{hitRegionDirty=false;updateHitRegion()})};
const setExpanded=(next,force=false)=>{desiredExpanded=next;boundsQueue=boundsQueue.then(async()=>{const targetExpanded=desiredExpanded,target=compactSize(),current=await moonsprite.window.getBounds();if(current.width===target.width&&current.height===target.height){expanded=targetExpanded;updateHitRegion();return}const bounds={x:current.x+current.width-target.width,y:current.y+current.height-target.height,...target};await moonsprite.window.setBounds(bounds);expanded=targetExpanded;clearTimeout(resizeTimer);resizeTimer=setTimeout(updateHitRegion,50)}).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return boundsQueue};
const syncBubbleLayout=()=>setExpanded(!info.hidden||!notice.hidden);
const updateScale=()=>{const scale=scaleOf();canvas.style.width=pet.frameWidth*scale+'px';canvas.style.height=pet.frameHeight*scale+'px';return setExpanded(desiredExpanded,true).then(constrainPet)};
const boundsForAnimation=frames=>{let bounds=null;for(const frame of frames){const next=frameBounds[frame];if(!next)continue;if(!bounds){bounds={...next};continue}const x=Math.min(bounds.x,next.x),y=Math.min(bounds.y,next.y);bounds={x,y,width:Math.max(bounds.x+bounds.width,next.x+next.width)-x,height:Math.max(bounds.y+bounds.height,next.y+next.height)-y}}return bounds||spriteBounds};
const play=(frames,repeat)=>{const token=++animationToken;if(!image||!frames||!frames.length)return;animationBounds=boundsForAnimation(frames);if(!info.hidden||!notice.hidden)scheduleHitRegion();let index=0;const tick=()=>{if(token!==animationToken)return;context.clearRect(0,0,pet.frameWidth,pet.frameHeight);const delay=pet.durations?.[frames[index]]||125;context.save();if(pet.mirrored){context.translate(pet.frameWidth,0);context.scale(-1,1)}context.drawImage(image,0,-frames[index]*pet.frameHeight);context.restore();displayedFrame=frames[index];index++;if(index>=frames.length){if(!repeat){setTimeout(()=>{if(token===animationToken)play(pet.idleFrames,true)},delay);return}index=0}setTimeout(tick,delay)};tick()};
const revealBubble=async bubble=>{bubble.style.visibility='hidden';bubble.hidden=false;try{await positionBubbles();if(bubble.hidden)return;await updateHitRegion();if(!bubble.hidden)bubble.style.visibility='visible'}catch(error){bubble.hidden=true;throw error}};
const showInfo=async()=>{if(!project){await showNotice(t('{name}在这里陪你。打开工程后，点击可查看工程信息。',{name:pet?.name||t('宠物')}));return}if(!info.hidden){info.hidden=true;await syncBubbleLayout();return}notice.hidden=true;info.innerHTML='<strong></strong><small>'+project.width+' × '+project.height+' · '+project.colorMode+'</small><small>'+t('图层 {layers} · 帧 {frames}',{layers:project.layerCount,frames:project.frameCount})+'</small><small>'+(project.dirty?t('有未保存修改'):t('已保存'))+'</small>';info.querySelector('strong').textContent=project.name;await setExpanded(true);await revealBubble(info)};
const showNotice=async text=>{if(!pet)return;info.hidden=true;notice.textContent=text;await setExpanded(true);await revealBubble(notice);clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;syncBubbleLayout()},7000);updateHitRegion()};
const clampPetBounds=(bounds,host,content)=>({...bounds,x:Math.max(host.x-content.x,Math.min(host.x+host.width-content.x-content.width,bounds.x)),y:Math.max(host.y-content.y,Math.min(host.y+host.height-content.y-content.height,bounds.y))});
const relativePetPosition=(bounds,host,content)=>({x:Math.max(0,Math.min(1,(bounds.x+content.x-host.x)/Math.max(1,host.width-content.width))),y:Math.max(0,Math.min(1,(bounds.y+content.y-host.y)/Math.max(1,host.height-content.height)))});
const boundsAtRelativePosition=(bounds,host,content,ratio)=>clampPetBounds({...bounds,x:host.x+ratio.x*Math.max(0,host.width-content.width)-content.x,y:host.y+ratio.y*Math.max(0,host.height-content.height)-content.y},host,content);
let dragQueue=null,pendingDrag=null;
let animationBounds=null,spriteBounds=null,frameBounds=[],displayedFrame=0;
// Use one union bound per animation, recomputed only when playback switches.
const positionBubbles=async()=>{if(!pet)return;const [outer,host]=await Promise.all([moonsprite.window.getBounds(),moonsprite.window.getHostBounds()]);const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;const bounds=animationBounds||spriteBounds||{x:0,y:0,width:pet.frameWidth,height:pet.frameHeight};const sx=rect.width/pet.frameWidth,sy=rect.height/pet.frameHeight;const x=pet.mirrored?pet.frameWidth-bounds.x-bounds.width:bounds.x;const center=rect.left+(x+bounds.width/2)*sx,top=rect.top+bounds.y*sy,bottom=top+bounds.height*sy;const left=Math.max(0,host.x-outer.x)+4,right=Math.min(window.innerWidth,host.x+host.width-outer.x)-4,upper=Math.max(0,host.y-outer.y)+4,lower=Math.min(window.innerHeight,host.y+host.height-outer.y)-4;if(right<=left||lower<=upper)return;for(const bubble of [info,notice]){bubble.style.transform='none';bubble.style.bottom='auto';bubble.style.maxWidth=Math.min(280,right-left)+'px';bubble.style.maxHeight=Math.min(180,lower-upper)+'px';bubble.style.overflow='auto';const box=bubble.getBoundingClientRect();const preferred=top-8-box.height>=upper?top-8-box.height:bottom+8;bubble.style.left=Math.max(left,Math.min(right-box.width,center-box.width/2))+'px';bubble.style.top=Math.max(upper,Math.min(lower-box.height,preferred))+'px'}};
const contentBounds=()=>{const rect=petElement.getBoundingClientRect(),bounds=spriteBounds||{x:0,y:0,width:pet.frameWidth,height:pet.frameHeight},scale=scaleOf();return{x:rect.left+(pet.mirrored?pet.frameWidth-bounds.x-bounds.width:bounds.x)*scale,y:rect.top+bounds.y*scale,width:bounds.width*scale,height:bounds.height*scale}};
const findSpriteBounds=(decoded,next)=>{frameBounds=[];displayedFrame=0;hitAlpha=new Uint8Array(next.frameWidth*next.frameHeight);const surface=document.createElement('canvas');surface.width=next.frameWidth;surface.height=next.frameHeight;const ctx=surface.getContext('2d',{willReadFrequently:true});let left=next.frameWidth,top=next.frameHeight,right=-1,bottom=-1;for(let frame=0;frame<next.frameCount;frame++){let fl=next.frameWidth,ft=next.frameHeight,fr=-1,fb=-1;ctx.clearRect(0,0,surface.width,surface.height);ctx.drawImage(decoded,0,-frame*next.frameHeight);const pixels=ctx.getImageData(0,0,surface.width,surface.height).data;for(let y=0;y<surface.height;y++)for(let x=0;x<surface.width;x++)if(pixels[(y*surface.width+x)*4+3]>0){hitAlpha[y*surface.width+x]=255;fl=Math.min(fl,x);ft=Math.min(ft,y);fr=Math.max(fr,x);fb=Math.max(fb,y);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}frameBounds.push(fr<0?null:{x:fl,y:ft,width:fr-fl+1,height:fb-ft+1})}return right<0?{x:0,y:0,width:next.frameWidth,height:next.frameHeight}:{x:left,y:top,width:right-left+1,height:bottom-top+1}};
const movePet=(gesture,x,y)=>{pendingDrag={gesture,x,y};if(!dragQueue)dragQueue=(async()=>{try{while(pendingDrag){const current=pendingDrag;pendingDrag=null;const [bounds,host]=await current.gesture.origin;const latest=pendingDrag?.gesture===current.gesture?pendingDrag:current;if(latest!==current)pendingDrag=null;if(current.gesture.cancelled||current.gesture.epoch!==hostEpoch)continue;const next=clampPetBounds({...bounds,x:bounds.x+latest.x-current.gesture.x,y:bounds.y+latest.y-current.gesture.y},host,current.gesture.content);await moonsprite.window.setBounds(next)}}catch(error){await moonsprite.diagnostics.log(String(error),'error')}finally{dragQueue=null}})();return dragQueue};
// Coalesce host changes, then correct any move that was already in flight.
let constraintQueued=false;
const constrainPet=()=>{if(!pet)return Promise.resolve();if(constraintQueued)return boundsQueue;constraintQueued=true;boundsQueue=boundsQueue.then(async()=>{constraintQueued=false;if(dragQueue)await dragQueue;const [bounds,host]=await Promise.all([moonsprite.window.getBounds(),moonsprite.window.getHostBounds()]);if(host.width<=0||host.height<=0)return;const initialize=!positionLoaded;if(initialize){const stored=await moonsprite.storage.get(positionKey);if(stored?.ratio&&Number.isFinite(stored.ratio.x)&&Number.isFinite(stored.ratio.y))positionRatio={x:Math.max(0,Math.min(1,stored.ratio.x)),y:Math.max(0,Math.min(1,stored.ratio.y))};positionLoaded=true}const content=contentBounds();positionRatio??=relativePetPosition(bounds,host,content);const next=boundsAtRelativePosition(bounds,host,content,positionRatio);if(next.x!==bounds.x||next.y!==bounds.y)await moonsprite.window.setBounds(next);if(initialize)await persistPosition(next);scheduleHitRegion()}).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return boundsQueue};
const hostGeometryChanged=()=>{stopDraggingAnimation();hostEpoch++;if(pointer){pointer.cancelled=true;pointer=null}pendingDrag=null;return constrainPet()};
const loadPet=async next=>{const loaded=await loadSheetUrl(next);const decoded=await decodeImage(loaded.url);if(sheetRevoke&&sheetUrl)URL.revokeObjectURL(sheetUrl);sheetUrl=loaded.url;sheetRevoke=loaded.revoke;image=decoded;spriteBounds=findSpriteBounds(decoded,next);pet={...next,idleFrames:next.animations?(next.animations.IDLE?.length?next.animations.IDLE:next.animations.SHOW?.length?next.animations.SHOW:[0]):next.idleFrames?.length?next.idleFrames:Array.from({length:next.frameCount},(_,index)=>index)};canvas.width=pet.frameWidth;canvas.height=pet.frameHeight;canvas.style.visibility='visible';canvas.style.width=pet.frameWidth*scaleOf()+'px';canvas.style.height=pet.frameHeight*scaleOf()+'px';petElement.setAttribute('aria-label',pet.name);await updateScale();play(pet.showFrames&&pet.showFrames.length?pet.showFrames:pet.idleFrames,false)};
// Embedded surfaces receive the host cursor theme; native compatibility uses the same policy API.
const applyCursorPolicy=useLocalCursors=>moonsprite.window.setCursorPolicy({useLocalCursors}).catch(()=>undefined);
const reportCatalog=()=>{};
// Each window resolves only the pet assigned to it by the runtime.
let catalogQueue=Promise.resolve();
const refreshCatalog=playShow=>{const pending=activePets;activePets=null;const task=catalogQueue.then(()=>refreshCatalogNow(playShow,pending));catalogQueue=task.catch(()=>undefined);return task};
const refreshCatalogNow=async(playShow,pending)=>{catalog=(Array.isArray(pending)?pending:await listPets()).filter(entry=>entry.frameCount>0);slotPets=catalog.slice(0,SLOT_COUNT);if(!catalog.some(candidate=>candidate.id===activePetId))throw new Error(t('指定宠物不存在：{name}',{name:activePetId}));const next=catalog.find(candidate=>candidate.id===activePetId);if(next){const changed=!pet||pet.id!==next.id;if(!pet||pet.id!==next.id||pet.spriteKey!==next.spriteKey||pet.mirrored!==next.mirrored)await loadPet(next);else {pet={...pet,...next};await updateScale()}if(playShow&&next.showFrames&&next.showFrames.length)play(next.showFrames,false);else if(changed||playShow)play(pet.idleFrames,true);moonsprite.window.postMessage({type:'active',pet:next}).catch(()=>{})}reportCatalog()};
const startDraggingAnimation=()=>{const slot=pet?.triggerSlots?.find(slot=>slot.event==='pet.dragging'&&pet.animations?.[slot.id]?.length);if(!slot)return;draggingAnimation=true;triggerBusyUntil=0;play(pet.animations[slot.id],true)};
const stopDraggingAnimation=()=>{if(!draggingAnimation)return;draggingAnimation=false;triggerBusyUntil=0;play(pet.idleFrames,true)};
petElement.addEventListener('pointerdown',event=>{if(event.button!==0||!hitCurrentPixel(event))return;pointer={epoch:hostEpoch,x:event.screenX,y:event.screenY,dragged:false,content:contentBounds(),origin:Promise.all([moonsprite.window.getBounds(),moonsprite.window.getHostBounds()])};petElement.setPointerCapture(event.pointerId)});
petElement.addEventListener('pointermove',event=>{if(!pointer)return;if(!pointer.dragged&&Math.hypot(event.screenX-pointer.x,event.screenY-pointer.y)<5)return;if(!pointer.dragged){triggerAnimation('pet.drag-start');info.hidden=true;notice.hidden=true;scheduleHitRegion()}if(!pointer.dragged)startDraggingAnimation();pointer.dragged=true;clearTimeout(noticeTimer);movePet(pointer,event.screenX,event.screenY)});
petElement.addEventListener('pointerup',event=>{if(!pointer)return;const gesture=pointer;pointer=null;if(petElement.hasPointerCapture(event.pointerId))petElement.releasePointerCapture(event.pointerId);if(gesture.dragged){stopDraggingAnimation();triggerAnimation('pet.drag-end');movePet(gesture,event.screenX,event.screenY).then(async()=>{if(gesture.epoch!==hostEpoch)return;await savePosition(await moonsprite.window.getBounds(),gesture.epoch);scheduleHitRegion()}).catch(error=>moonsprite.diagnostics.log(String(error),'error'))}else{triggerAnimation('pet.click');scheduleHitRegion();showInfo().catch(error=>moonsprite.diagnostics.log(String(error),'error'))}});
addEventListener('contextmenu',event=>{event.preventDefault();moonsprite.window.postMessage({type:'manager'}).catch(()=>{})});
petElement.addEventListener('pointercancel',()=>{stopDraggingAnimation();pointer=null;petElement.classList.remove('dragging');scheduleHitRegion()});
addEventListener('resize',()=>{scheduleHitRegion();constrainPet()});
addEventListener('moonsprite:window-host-geometry',hostGeometryChanged);
addEventListener('blur',()=>{if(!info.hidden){info.hidden=true;syncBubbleLayout()}});
moonsprite.window.onMessage(message=>{if(!message)return;
if(message.type==='activity'){markActivity();return}
if(message.type==='trigger'){triggerAnimation(message.event,message.detail);return}
if(message.type==='notice-distance'){(async()=>{let distance=null;try{if(pet&&typeof moonsprite.window.getPointerPosition==='function'){const [point,bounds]=await Promise.all([moonsprite.window.getPointerPosition(),moonsprite.window.getBounds()]);if(point){const content=contentBounds(),left=bounds.x+content.x,top=bounds.y+content.y;const dx=Math.max(left-point.x,0,point.x-left-content.width),dy=Math.max(top-point.y,0,point.y-top-content.height);distance=dx*dx+dy*dy}}}catch(error){await moonsprite.diagnostics.log(String(error),'error')}await moonsprite.window.postMessage({type:'notice-distance',requestId:message.requestId,distance})})().catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='dismiss-notice'){clearTimeout(noticeTimer);notice.hidden=true;syncBubbleLayout();return}


if(message.type==='configure'){petVisible=true;if(moonsprite.window.id&&message.windowId!==moonsprite.window.id)return;activePets=message.pet?[message.pet]:null;positionKey=message.positionKey||positionKey;project=message.project;preferences={...preferences,...message.preferences};setPetLanguage(preferences.language,preferences.hostLocale);activePetId=message.activePetId||activePetId;(async()=>{await refreshCatalog(message.playShow===true)})().catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='visibility'&&message.visible===false){petVisible=false;draggingAnimation=false;triggerBusyUntil=0;animationToken++;return}
if(message.type==='project'){project=message.project;return}
if(message.type==='preferences'){preferences={...preferences,...message.preferences};setPetLanguage(preferences.language,preferences.hostLocale);if(pet)updateScale();return}
if(message.type==='cursorPolicy'){applyCursorPolicy(message.useLocalCursors===true);return}
if(message.type==='activate'){activePetId=message.petId;activePets=Array.isArray(message.pets)?message.pets:null;refreshCatalog(true).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='catalog'||message.type==='refresh'){activePets=null;refreshCatalog(false).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return}
if(message.type==='notice')showNotice(message.text).catch(error=>moonsprite.diagnostics.log(String(error),'error'))});
moonsprite.window.postMessage({type:'ready'}).catch(()=>{});
`

const managerSource = `
const MAX_EDGE=192,MAX_FRAMES=120;
const scaleSurface=(source,sourceWidth,sourceHeight)=>{const factor=Math.min(1,MAX_EDGE/Math.max(sourceWidth||1,sourceHeight||1));const width=Math.max(1,Math.round((sourceWidth||1)*factor)),height=Math.max(1,Math.round((sourceHeight||1)*factor));const surface=document.createElement('canvas');surface.width=width;surface.height=height;const ctx=surface.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.drawImage(source,0,0,width,height);return{surface,ctx,width,height}};
const decodeGif=async bytes=>{if(typeof ImageDecoder!=='function')throw new Error(t('当前环境不支持 GIF 动画解码，请导入 PNG 或 WebP 静态图片。'));const decoder=new ImageDecoder({data:bytes,type:'image/gif',preferAnimation:true});try{await decoder.tracks.ready;await decoder.completed;const track=decoder.tracks.selectedTrack;const count=Math.min(track?track.frameCount:1,MAX_FRAMES);if(track&&track.frameCount>MAX_FRAMES)throw new Error(t('单个动画最多 120 帧，请缩短素材。'));if(count<=1)return null;const first=await decoder.decode({frameIndex:0,completeFramesOnly:true});const size=scaleSurface(first.image,first.image.displayWidth||first.image.width,first.image.displayHeight||first.image.height);first.image.close();const sheet=document.createElement('canvas');sheet.width=size.width;sheet.height=size.height*count;const ctx=sheet.getContext('2d'),durations=[];for(let index=0;index<count;index++){const decoded=await decoder.decode({frameIndex:index,completeFramesOnly:true});ctx.drawImage(decoded.image,0,index*size.height,size.width,size.height);durations.push(Math.max(40,Math.min(1000,Math.round((decoded.image.duration||100000)/1000))));decoded.image.close();await new Promise(resolve=>setTimeout(resolve,0))}return{sheet,durations}}finally{decoder.close()}};
const decodeStill=async bytes=>{const url=URL.createObjectURL(new Blob([bytes]));try{const image=await decodeImage(url);const size=scaleSurface(image,image.naturalWidth,image.naturalHeight);return{sheet:size.surface,durations:[125]}}finally{URL.revokeObjectURL(url)}};
const sliceSheet=(surface,frameCount)=>({dataUrl:surface.toDataURL('image/png'),frameWidth:surface.width,frameHeight:surface.height/frameCount,frameCount});

// Slots follow the behaviors implemented by the extension, never user metadata.
const previewSprite=async(image,target)=>{
 const source=document.createElement('canvas');source.width=target.frameWidth;source.height=target.frameHeight;const ctx=source.getContext('2d',{willReadFrequently:true});
 const frames=target.animations?.IDLE?.length?target.animations.IDLE:target.idleFrames?.length?target.idleFrames:Array.from({length:target.frameCount},(_,i)=>i);
 let best=null;
 for(const frame of frames){ctx.clearRect(0,0,source.width,source.height);ctx.drawImage(image,0,-frame*source.height);const pixels=ctx.getImageData(0,0,source.width,source.height).data;let left=source.width,top=source.height,right=-1,bottom=-1,count=0;for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++)if(pixels[(y*source.width+x)*4+3]>0){count++;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y)}if(count&&(!best||count>best.count))best={frame,left,top,width:right-left+1,height:bottom-top+1,count}}
 const preview=document.createElement('canvas');preview.width=96;preview.height=96;const output=preview.getContext('2d');output.imageSmoothingEnabled=false;
 if(best){const scale=Math.min(88/best.width,88/best.height),width=best.width*scale,height=best.height*scale;if(target.mirrored){output.translate(96,0);output.scale(-1,1)}output.drawImage(image,best.left,best.frame*target.frameHeight+best.top,best.width,best.height,(96-width)/2,(96-height)/2,width,height)}
 return preview.toDataURL('image/png');
};
const animationSlots=entry=>['SHOW','IDLE',...(entry?.triggerSlots||[]).map(slot=>slot.id)];
let conditionDialog=false,editingTriggerId=null;
let hostLocale=null;
let activeId=BUILT_IN.id,status='',nameInput={value:''},result=null,staged=[];
const publish=()=>moonsprite.window.postMessage({type:'catalog'});
const renderList=async()=>{
 const prefs={...${JSON.stringify(defaults)},...await moonsprite.storage.get('preferences')};setPetLanguage(prefs.language,hostLocale);const pets=await listPets(),shown=await moonsprite.storage.get('shownPets')||[];
 if(!pets.some(pet=>pet.id===activeId))activeId=BUILT_IN.id;
 const sidebar=[{id:'language',type:'select',label:t('语言'),value:prefs.language||'auto',options:[{value:'auto',label:t('跟随软件')},...PET_LANGUAGES.map(([value,label])=>({value,label}))]},{id:'apply-language',type:'button',label:t('应用语言'),action:{type:'ui-language'}},{id:'language-line',type:'separator'},{id:'list-title',type:'heading',label:t('我的宠物')}];
 for(const pet of pets)sidebar.push({id:'edit-'+pet.id,type:'choice',label:pet.name,description:!pet.frameCount?t('待上传动画'):prefs.enabled!==false&&shown.includes(pet.id)?t('显示中'):t('已隐藏'),selected:pet.id===activeId,action:{type:'ui-edit',petId:pet.id}});
 sidebar.push({id:'create-line',type:'separator'},{id:'newName',type:'input',label:t('新宠物名称'),value:nameInput.value},{id:'create',type:'button',label:t('创建宠物'),action:{type:'ui-create'}},{id:'import-pet',type:'file',label:t('导入宠物包…'),accept:'.mspet',multiple:false,action:{type:'ui-import-pet'}});
 const detail=[],target=pets.find(pet=>pet.id===activeId);
 if(target){
 const header=[{id:'name',type:'heading',label:target.name}];
 if(target.frameCount){try{const loaded=await loadSheetUrl(target);try{const image=await decodeImage(loaded.url);header.unshift({id:'preview',type:'image',src:await previewSprite(image,target),label:target.name,width:96,height:96})}finally{if(loaded.revoke)URL.revokeObjectURL(loaded.url)}}catch(error){status=String(error)}}
 detail.push({id:'header',type:'row',children:header},{id:'display-row',type:'row',children:[{id:'pet-visible',type:'toggle',label:t('宠物显示'),value:target.frameCount>0&&prefs.enabled!==false&&shown.includes(target.id),disabled:!target.frameCount,action:{type:'ui-visible',petId:target.id}},{id:'mirror',type:'toggle',label:t('水平镜像'),value:target.mirrored===true,action:{type:'ui-mirror',petId:target.id}}]},
 {id:'scale-row',type:'row',align:'end',children:[{id:'scale',type:'number',label:t('缩放倍率'),value:target.scale||2,min:1,max:4},{id:'save-scale',type:'button',label:t('应用'),action:{type:'ui-scale',petId:target.id}}]},
 {id:'animations-line',type:'separator'},{id:'animation-title',type:'heading',label:t('动画槽位')},{id:'add-trigger',type:'button',label:t('添加动画槽…'),action:{type:'ui-add-trigger',petId:target.id}});
 const animations=animationMap(target);
 for(const name of animationSlots(target)){const trigger=target.triggerSlots?.find(slot=>slot.id===name),condition=TRIGGER_CONDITIONS.find(item=>item[0]===trigger?.event);const count=animations[name]?.length||0;detail.push({id:'slot-'+name,type:'slot',contextAction:trigger?{type:'ui-edit-trigger',petId:target.id,slotId:trigger.id}:undefined,tooltip:(condition?t(condition[2]):'')||t('上传此槽位的动画素材。'),label:condition?t(condition[1])+(trigger.tool?' · '+t(({pencil:'画笔',eraser:'橡皮',fill:'填充',eyedropper:'吸色',selection:'选区',move:'移动',shape:'形状',line:'线条',text:'文字',hand:'抓手',zoom:'缩放',rotate:'旋转',airbrush:'喷枪',smooth:'平滑',liquify:'液化'})[trigger.tool]||trigger.tool):''):(name==='SHOW'?t('出场'):name==='IDLE'?t('待机'):t('条件动画')),description:count?t('{count} 帧',{count}):t('未上传'),children:[...(trigger?[{id:'remove-'+name,type:'button',label:t('删除槽位'),action:{type:'ui-remove-trigger',petId:target.id,animation:name}}]:[]),{id:'clear-'+name,type:'button',label:t('清除'),disabled:!count,action:{type:'ui-clear-slot',petId:target.id,animation:name}},{id:'upload-'+name,type:'file',label:t('上传动画'),multiple:false,action:{type:'ui-upload-slot',petId:target.id,animation:name}}]})}
 detail.push({id:'hint',type:'text',label:t('每个槽位独立上传、替换或清除。支持 GIF、PNG、WebP。')},{id:'package-line',type:'separator'},{id:'export-pet',type:'button',label:t('导出宠物包…'),action:{type:'ui-export-pet',petId:target.id}});
 if(target.id!==BUILT_IN.id)detail.push({id:'delete-line',type:'separator'},{id:'delete-'+target.id,type:'button',label:t('删除此宠物'),action:{type:'ui-delete',petId:target.id}});
 }
 const nodes=[{id:'manager-layout',type:'split',children:[{id:'pet-list',type:'sidebar',label:t('宠物列表'),children:sidebar},{id:'pet-detail',type:'column',label:t('当前宠物设置'),children:detail}]}];
 const editing=target?.triggerSlots?.find(slot=>slot.id===editingTriggerId);
 if(conditionDialog)nodes.push({id:'trigger-dialog',type:'dialog',label:editing?t('编辑条件动画槽'):t('添加条件动画槽'),action:{type:'ui-cancel-trigger'},children:[
 {id:'trigger-event',type:'select',label:t('触发条件'),tooltip:t('条件发生时播放一次，然后回到 IDLE。'),value:editing?.event||'history.undo',options:TRIGGER_CONDITIONS.map(([value,label,description])=>({value,label:t(label),description:t(description)}))},
 {id:'trigger-tool',visibleWhen:{'trigger-event':'tool.changed'},type:'select',label:t('目标工具'),tooltip:t('仅切换工具条件使用；其他条件忽略此项。'),value:editing?.tool||'',options:[{value:'',label:t('所有工具')},...['pencil','eraser','fill','eyedropper','selection','move','shape','line','text','hand','zoom','rotate','airbrush','smooth','liquify'].map((value,index)=>({value,label:[t('画笔'),t('橡皮'),t('填充'),t('吸色'),t('选区'),t('移动'),t('形状'),t('线条'),t('文字'),t('抓手'),t('缩放'),t('旋转'),t('喷枪'),t('平滑'),t('液化')][index]}))]},
 {id:'trigger-idle',visibleWhen:{'trigger-event':'idle'},type:'number',label:t('空闲时长（秒）'),tooltip:t('仅空闲条件使用；在软件内无输入达到此时长后触发。'),value:editing?.idleSeconds??60,min:5,max:86400},
 {id:'trigger-cooldown',type:'number',label:t('冷却时间（秒）'),tooltip:t('0 表示每次操作立即从头播放，可打断当前动画；大于 0 时限制间隔，忙时不排队。空闲槽位同时满足时随机选一个。'),value:editing?editing.cooldownMs/1000:3,min:0,max:3600},
 {id:'confirm-trigger',type:'button',label:editing?t('保存设置'):t('新增槽位'),primary:true,action:{type:'ui-confirm-trigger',petId:target.id}}
 ]});
 await moonsprite.window.postMessage({type:'ui-state',nodes,status,result});
};
const combineAnimations=parts=>{
 const width=Math.max(...parts.map(part=>part.sheet.width)),height=Math.max(...parts.map(part=>part.sheet.height/part.durations.length)),frameCount=parts.reduce((sum,part)=>sum+part.durations.length,0);
 if(frameCount>240)throw new Error(t('一个宠物最多包含 240 帧。'));
 const sheet=document.createElement('canvas');sheet.width=width;sheet.height=height*frameCount;const ctx=sheet.getContext('2d');const animations=Object.create(null),durations=[];let offset=0;
 for(const part of parts){const h=part.sheet.height/part.durations.length;animations[part.name]=[];for(let index=0;index<part.durations.length;index++){ctx.drawImage(part.sheet,0,index*h,part.sheet.width,h,Math.floor((width-part.sheet.width)/2),(offset+index)*height+height-h,part.sheet.width,h);animations[part.name].push(offset+index)}offset+=part.durations.length;durations.push(...part.durations)}
 return{sheet,animations,durations};
};
const animationMap=entry=>entry.animations?Object.fromEntries(Object.entries(entry.animations).filter(([name])=>animationSlots(entry).includes(name))):{...(entry.showFrames?.length?{SHOW:entry.showFrames}:{}),IDLE:entry.idleFrames?.length?entry.idleFrames:Array.from({length:entry.frameCount},(_,index)=>index)};
const mergeAnimationParts=(existing,uploaded)=>{const names=new Set(uploaded.map(part=>part.name));return [...existing.filter(part=>!names.has(part.name)),...uploaded]};
const importAnimations=async(files,petId,clearName=null)=>{
 const meta=await readMeta(),target=(await listPets()).find(entry=>entry.id===petId);if(!target)throw new Error(t('请先创建或选择宠物。'));
 if(!Array.isArray(files)||(!files.length&&!clearName)||files.length>16)throw new Error(t('请选择 1 至 16 个动画。'));
 const names=files.map(file=>String(file.animation||'').trim().toUpperCase());if(names.some(name=>!name||name.length>32)||new Set(names).size!==names.length)throw new Error(t('动画名称不能为空或重复，最多 32 个字符。'));
 const oldParts=[];
 if(target.frameCount){const loaded=await loadSheetUrl(target);try{const image=await decodeImage(loaded.url);for(const [name,frames] of Object.entries(animationMap(target))){if(name===clearName||names.includes(name)||!frames.length)continue;const sheet=document.createElement('canvas');sheet.width=target.frameWidth;sheet.height=target.frameHeight*frames.length;const ctx=sheet.getContext('2d');frames.forEach((frame,index)=>ctx.drawImage(image,0,frame*target.frameHeight,target.frameWidth,target.frameHeight,0,index*target.frameHeight,target.frameWidth,target.frameHeight));oldParts.push({name,sheet,durations:frames.map(frame=>target.durations?.[frame]||125)})}}finally{if(loaded.revoke)URL.revokeObjectURL(loaded.url)}}
 const uploaded=[];for(let index=0;index<files.length;index++){const file=files[index],bytes=new Uint8Array(file.bytes);const decoded=(file.mime==='image/gif'?await decodeGif(bytes):null)||await decodeStill(bytes);uploaded.push({...decoded,name:names[index]})}
 const parts=mergeAnimationParts(oldParts,uploaded);if(parts.length>32)throw new Error(t('一个宠物最多包含 32 个动画。'));
 if(!parts.length){const entry={...target,frameCount:0,animations:{},idleFrames:[],showFrames:[],durations:[],spriteKey:undefined};await writeMeta([...meta.filter(item=>item.id!==target.id),entry]);if(target.source==='custom'&&target.frameCount)await spriteDelete(target.spriteKey||target.id);await publish();return}
 const combined=combineAnimations(parts),frameCount=combined.durations.length,sliced=sliceSheet(combined.sheet,frameCount),spriteKey=target.id+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
 const entry={...target,spriteKey,frameWidth:sliced.frameWidth,frameHeight:sliced.frameHeight,frameCount,animations:combined.animations,idleFrames:combined.animations.IDLE||combined.animations.SHOW||[0],showFrames:combined.animations.SHOW||[],durations:combined.durations,source:'custom'};
 await spriteWrite(spriteKey,sliced.dataUrl);try{await writeMeta([...meta.filter(item=>item.id!==target.id),entry])}catch(error){await spriteDelete(spriteKey);throw error}
 if(target.source==='custom'&&target.frameCount)await spriteDelete(target.spriteKey||target.id);
 await publish();status=t('已保存 {name} 的动画',{name:target.name});
};
// Self-contained data-only pet package. Local IDs, storage keys and visibility never travel.
const validatePetPackage=data=>{
 if(!data||data.format!=='moonsprite-pet'||data.version!==1)throw new Error(t('不是受支持的宠物包，或版本不兼容。'));
 const p=data.pet;if(!p||typeof p.name!=='string'||!p.name.trim()||p.name.length>24)throw new Error(t('宠物名称无效。'));
 const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
 if(!integer(p.frameWidth,1,512)||!integer(p.frameHeight,1,512)||!integer(p.frameCount,0,240)||p.frameWidth*p.frameHeight*p.frameCount>16000000)throw new Error(t('动画尺寸或帧数无效。'));
 if(!integer(p.scale,1,4)||typeof p.mirrored!=='boolean')throw new Error(t('宠物显示设置无效。'));
 if(!Array.isArray(p.durations)||p.durations.length!==p.frameCount||p.durations.some(n=>!integer(n,1,60000)))throw new Error(t('动画时长无效。'));
 if(!p.animations||typeof p.animations!=='object'||Array.isArray(p.animations)||Object.keys(p.animations).length>32)throw new Error(t('动画列表无效。'));
 const animations=Object.create(null);for(const [name,frames] of Object.entries(p.animations)){if(!/^[A-Z][A-Z0-9_-]{0,31}$/.test(name)||!Array.isArray(frames)||frames.length>240||frames.some(n=>!integer(n,0,p.frameCount-1)))throw new Error(t('动画帧索引无效。'));animations[name]=[...frames]}
 if(p.frameCount&&!Object.values(animations).some(frames=>frames.length))throw new Error(t('宠物包缺少动画。'));
 if(p.frameCount){
  if(typeof data.sprite!=='string'||data.sprite.length>249000||(!data.sprite.startsWith('data:image/png;base64,')||!/^[A-Za-z0-9+/]+={0,2}$/.test(data.sprite.slice(22))))throw new Error(t('宠物素材无效或超过容量。'));
  const binary=atob(data.sprite.slice(22)),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(bytes.length<33||[137,80,78,71,13,10,26,10].some((n,i)=>bytes[i]!==n)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')throw new Error(t('宠物素材不是 PNG。'));
  const view=new DataView(bytes.buffer);if(view.getUint32(16)!==p.frameWidth||view.getUint32(20)!==p.frameHeight*p.frameCount)throw new Error(t('素材尺寸与动画设置不一致。'));
 }else if(data.sprite!==null)throw new Error(t('空宠物不应包含素材。'));
 const triggerSlots=p.triggerSlots||[];if(!Array.isArray(triggerSlots)||triggerSlots.length>30)throw new Error(t('条件槽位无效。'));const ids=new Set();
 for(const slot of triggerSlots){if(!slot||!/^TRIGGER_[A-Z0-9_]{1,24}$/.test(slot.id)||ids.has(slot.id)||!TRIGGER_CONDITIONS.some(item=>item[0]===slot.event)||typeof slot.tool!=='string'||slot.tool.length>32||!integer(slot.idleSeconds,5,86400)||!integer(slot.cooldownMs,0,3600000))throw new Error(t('条件槽位配置无效。'));ids.add(slot.id)}
 return{pet:{triggerSlots:triggerSlots.map(slot=>({...slot})),name:p.name.trim(),frameWidth:p.frameWidth,frameHeight:p.frameHeight,frameCount:p.frameCount,scale:p.scale,mirrored:p.mirrored,durations:[...p.durations],animations},sprite:data.sprite};
};
const exportPetPackage=async petId=>{
 const target=(await listPets()).find(p=>p.id===petId);if(!target)throw new Error(t('宠物不存在。'));
 let sprite=null;if(target.frameCount){if(target.source==='builtin'){const bytes=await moonsprite.resources.read('sprite');let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);sprite='data:image/png;base64,'+btoa(binary)}else sprite=await spriteRead(target.spriteKey||target.id)}
 const data={format:'moonsprite-pet',version:1,pet:{name:target.name,frameWidth:target.frameWidth,frameHeight:target.frameHeight,frameCount:target.frameCount,scale:target.scale||2,mirrored:target.mirrored===true,triggerSlots:target.triggerSlots||[],animations:animationMap(target),durations:Array.from({length:target.frameCount},(_,i)=>target.durations?.[i]||125)},sprite};
 validatePetPackage(data);return{name:Array.from(target.name,c=>c.charCodeAt(0)<32||'<>:"/|?*'.includes(c)||c.charCodeAt(0)===92?'_':c).join('')+'.mspet',bytes:Array.from(new TextEncoder().encode(JSON.stringify(data)))};
};
const importPetPackage=async files=>{
 if(!Array.isArray(files)||files.length!==1||!Array.isArray(files[0].bytes)||files[0].bytes.length>512000||files[0].bytes.some(n=>!Number.isInteger(n)||n<0||n>255))throw new Error(t('请选择一个有效的宠物包（最大 500 KiB）。'));
 let data;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(new Uint8Array(files[0].bytes)))}catch{throw new Error(t('宠物包无法读取，文件可能已损坏。'))}
 const parsed=validatePetPackage(data),meta=await readMeta();if(meta.filter(p=>p.id!==BUILT_IN.id).length>=SLOT_COUNT-1)throw new Error(t('宠物数量已达上限。'));
 if(parsed.sprite){const image=await decodeImage(parsed.sprite);if(image.naturalWidth!==parsed.pet.frameWidth||image.naturalHeight!==parsed.pet.frameHeight*parsed.pet.frameCount)throw new Error(t('宠物素材解码尺寸不一致。'))}
 const id='custom-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),spriteKey=id+'-sheet',animations=animationMap(parsed.pet);
 const entry={...parsed.pet,id,source:'custom',spriteKey:parsed.sprite?spriteKey:undefined,idleFrames:animations.IDLE?.length?animations.IDLE:animations.SHOW?.length?animations.SHOW:Object.values(animations).find(frames=>frames.length)||[],showFrames:animations.SHOW||[]};
 if(parsed.sprite)await spriteWrite(spriteKey,parsed.sprite);
 try{await writeMeta([...meta,entry])}catch(error){if(parsed.sprite)await spriteDelete(spriteKey);throw error}
 activeId=id;staged=[];await publish();status=t('已导入 {name}，可从顶部宠物菜单开启显示',{name:entry.name});return entry;
};
let operations=Promise.resolve();
moonsprite.window.onMessage(message=>{
 operations=operations.then(async()=>{
  result=null;
  try{
   const values=message.values||{};if(typeof values.newName==='string')nameInput.value=values.newName;staged=staged.map((file,index)=>({...file,animation:String(values['animation-'+index]??file.animation)}));
   if(message.type==='catalog'){if(message.hostLocale)hostLocale=message.hostLocale;if(message.petId&&(await listPets()).some(pet=>pet.id===message.petId)){activeId=message.petId;staged=[]}}
   else if(message.type==='ui-language'){const language=String(values.language||'auto');if(language!=='auto'&&!PET_LANGUAGES.some(([id])=>id===language))throw new Error(t('语言无效'));const prefs=await moonsprite.storage.get('preferences')||{};await moonsprite.storage.set('preferences',{...prefs,language});setPetLanguage(language,hostLocale);status='';await publish();await moonsprite.window.postMessage({type:'language'})}
   else if(message.type==='ui-preference'){const key=message.key;if(!['remindersEnabled','clockEnabled','unsavedEnabled','breakEnabled','unsavedMinutes','breakMinutes'].includes(key))return;const value=key.endsWith('Minutes')?Math.max(1,Math.min(1440,Math.round(Number(values[key])||1))):message.value===true;const prefs=await moonsprite.storage.get('preferences')||{};await moonsprite.storage.set('preferences',{...prefs,[key]:value});await publish()}
   else if(message.type==='ui-export-pet'){const file=await exportPetPackage(message.petId);result={requestId:message.requestId,ok:true,file};status=t('宠物包已准备好')}
   else if(message.type==='ui-import-pet'){await importPetPackage(message.files)}
   else if(message.type==='ui-add-trigger'){activeId=message.petId;editingTriggerId=null;conditionDialog=true}
   else if(message.type==='ui-edit-trigger'){activeId=message.petId;editingTriggerId=message.slotId;conditionDialog=true}
   else if(message.type==='ui-cancel-trigger'){conditionDialog=false}
   else if(message.type==='ui-confirm-trigger'){
    const meta=await readMeta(),target=(await listPets()).find(pet=>pet.id===message.petId);if(!target||target.id!==activeId)throw new Error(t('编辑对象已变更'));
    const existing=target.triggerSlots?.find(slot=>slot.id===editingTriggerId);if(editingTriggerId&&!existing)throw new Error(t('槽位不存在'));
    const event=String(values['trigger-event']??existing?.event??'history.undo');if(!TRIGGER_CONDITIONS.some(item=>item[0]===event))throw new Error(t('条件无效'));
    const slots=target.triggerSlots||[];if(!editingTriggerId&&slots.length>=30)throw new Error(t('最多 30 个条件动画槽'));
    const tool=event==='tool.changed'?String(values['trigger-tool']??existing?.tool??''):'';
    const idleSeconds=Math.max(5,Math.min(86400,Math.round(Number(values['trigger-idle']??existing?.idleSeconds)||60))),cooldownMs=Math.max(0,Math.min(3600,Math.round(Number(values['trigger-cooldown']??(existing?existing.cooldownMs/1000:3)))))*1000;
    const slot={id:editingTriggerId||'TRIGGER_'+Date.now().toString(36).toUpperCase()+'_'+Math.random().toString(36).slice(2,6).toUpperCase(),event,tool,idleSeconds,cooldownMs};
    await writeMeta([...meta.filter(item=>item.id!==target.id),{...target,triggerSlots:editingTriggerId?slots.map(old=>old.id===editingTriggerId?slot:old):[...slots,slot]}]);conditionDialog=false;await publish();status=t('槽位已新增，请上传动画');
   }
   else if(message.type==='ui-remove-trigger'){
    const target=(await listPets()).find(pet=>pet.id===message.petId);if(!target?.triggerSlots?.some(slot=>slot.id===message.animation))throw new Error(t('槽位不存在'));
    await importAnimations([],message.petId,message.animation);const meta=await readMeta();await writeMeta(meta.map(pet=>pet.id===message.petId?{...pet,triggerSlots:(pet.triggerSlots||[]).filter(slot=>slot.id!==message.animation)}:pet));await publish();
   }
   else if(message.type==='ui-edit'){activeId=message.petId;staged=[]}
   else if(message.type==='ui-upload-slot'){if(message.petId!==activeId)throw new Error(t('编辑对象已变更'));const target=(await listPets()).find(pet=>pet.id===activeId);if(!target||!animationSlots(target).includes(message.animation))throw new Error(t('动画槽位不存在'));if(!Array.isArray(message.files)||message.files.length!==1)throw new Error(t('每个槽位请选择一个动画文件'));await importAnimations([{...message.files[0],animation:message.animation}],target.id)}
   else if(message.type==='ui-clear-slot'){if(message.petId!==activeId)throw new Error(t('编辑对象已变更'));if(!animationSlots((await listPets()).find(pet=>pet.id===message.petId)).includes(message.animation))throw new Error(t('动画槽位不存在'));await importAnimations([],message.petId,message.animation);status=t('已清除 {name} 动画',{name:message.animation})}
   else if(message.type==='ui-stage'){if(message.petId!==activeId)throw new Error(t('编辑对象已变更'));if(!Array.isArray(message.files)||staged.length+message.files.length>16)throw new Error(t('最多 16 个动画'));const target=(await listPets()).find(pet=>pet.id===activeId);for(const file of message.files){const base=String(file.name||'').replace(/\\.[^.]+$/,'').toUpperCase();staged.push({...file,animation:base==='SHOW'||base==='IDLE'?base:!target.frameCount&&!staged.length?'IDLE':base})}}
   else if(message.type==='ui-unstage'){staged=staged.filter((_,index)=>index!==message.index)}
   else if(message.type==='ui-scale'){const meta=await readMeta(),target=(await listPets()).find(pet=>pet.id===message.petId);if(!target)throw new Error(t('宠物不存在'));const scale=Math.max(1,Math.min(4,Math.round(Number(values.scale??target.scale)||2)));await writeMeta([...meta.filter(pet=>pet.id!==target.id),{...target,scale}]);await publish();status=t('缩放已更新')}
   else if(message.type==='ui-visible'){const target=(await listPets()).find(pet=>pet.id===message.petId);if(!target?.frameCount)throw new Error(t('请先上传 IDLE 动画'));let shown=await moonsprite.storage.get('shownPets')||[];shown=shown.filter(id=>id!==target.id);if(message.value){shown.push(target.id);const preferences=await moonsprite.storage.get('preferences')||{};if(preferences.enabled!==true)await moonsprite.storage.set('preferences',{...preferences,enabled:true})}await moonsprite.storage.set('shownPets',shown);await publish();status=message.value?t('已显示 {name}',{name:target.name}):t('已隐藏 {name}',{name:target.name})}
   else if(message.type==='ui-create'){
    const meta=await readMeta(),name=String(message.name||nameInput.value||'').trim().slice(0,24);if(!name)throw new Error(t('请输入宠物名称。'));if(meta.filter(entry=>entry.id!==BUILT_IN.id).length>=SLOT_COUNT-1)throw new Error(t('宠物数量已达上限。'));
    const entry={id:'custom-'+Date.now().toString(36),name,source:'custom',frameCount:0,frameWidth:1,frameHeight:1,animations:{},idleFrames:[],showFrames:[],mirrored:false};await writeMeta([...meta,entry]);activeId=entry.id;staged=[];nameInput.value='';status=t('已创建 {name}，请上传待机等动画',{name});result={requestId:message.requestId,ok:true,petId:entry.id};
   }else if(message.type==='ui-import'){await importAnimations(message.files||staged,message.petId);staged=[]}
   else if(message.type==='ui-mirror'){
    const target=(await listPets()).find(entry=>entry.id===message.petId);if(!target)throw new Error(t('宠物不存在。'));const meta=await readMeta();await writeMeta([...meta.filter(entry=>entry.id!==target.id),{...target,mirrored:(message.value??message.mirrored)===true}]);await publish();status=t('已更新镜像设置');
   }else if(message.type==='ui-delete'){
    const meta=await readMeta(),target=meta.find(entry=>entry.id===message.petId);if(!target||target.id===BUILT_IN.id)throw new Error(t('此宠物不能删除'));
    await writeMeta(meta.filter(entry=>entry.id!==target.id));if(target.frameCount)await spriteDelete(target.spriteKey||target.id);if(activeId===target.id)activeId=BUILT_IN.id;await publish();status=t('已删除宠物');
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