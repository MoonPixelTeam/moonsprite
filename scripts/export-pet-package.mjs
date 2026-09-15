import { readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { strFromU8, unzipSync, zipSync } from 'fflate'
import UPNG from 'upng-js'

const [sourcePath, outputPath, petName = '宠物', extensionId = 'moonsprite.pet'] = process.argv.slice(2)
if (!sourcePath || !outputPath) throw new Error('用法：node scripts/export-pet-package.mjs <源.moonsprite> <输出.msext> [名称] [扩展ID]')

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
const cropBounds = (frames) => {
  let left = document.width
  let top = document.height
  let right = -1
  let bottom = -1
  for (const pixels of frames) for (let y = 0; y < document.height; y++) for (let x = 0; x < document.width; x++) {
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

const manifest = {
  schemaVersion: 2,
  apiVersion: '1.0.0',
  id: extensionId,
  name: `${petName} 宠物`,
  version: '1.0.0',
  description: `由 ${basename(sourcePath)} 导出的独立宠物扩展。`,
  settingsUi: {
    storageKey: 'preferences',
    controls: [
      { id: 'enabled', type: 'checkbox', label: '显示宠物', description: `在打开工程时显示${petName}`, defaultValue: true },
      { id: 'scale', type: 'number', label: '像素缩放倍率', description: '仅使用整数倍率，保持像素清晰。', defaultValue: 2, min: 1, max: 4, step: 1 },
      { id: 'remindersEnabled', type: 'checkbox', label: '启用提醒', description: '允许宠物显示报时、休息和保存提醒。', defaultValue: true },
      { id: 'clockEnabled', type: 'checkbox', label: '自动报时', description: '在整点和半点显示当前时间。', defaultValue: true },
      { id: 'unsavedMinutes', type: 'number', label: '未保存提醒', description: '工程持续未保存达到该时长后提醒。', defaultValue: 15, min: 5, max: 120, step: 5, suffix: '分钟' },
      { id: 'breakMinutes', type: 'number', label: '连续绘制提醒', description: '持续绘制达到该时长后提醒休息。', defaultValue: 60, min: 15, max: 180, step: 15, suffix: '分钟' }
    ]
  },
  runtime: {
    entry: 'runtime/index.html',
    permissions: ['runtime', 'commands', 'menus', 'ui', 'windows', 'workspace.read', 'document.read', 'events', 'storage', 'resources', 'notifications', 'diagnostics'],
    resources: { 'pet-window': 'ui/pet.html', sprite: 'assets/companion.png' }
  },
  commands: [
    { id: 'toggle', name: petName, description: `显示或隐藏${petName}`, runtimeEvent: 'toggle' },
    { id: 'settings', name: '宠物设置', description: `设置${petName}及提醒`, opensSettings: true }
  ],
  menuItems: [{ id: 'pet-menu', name: '宠物', description: `${petName}扩展菜单`, menu: 'window', position: 'start', commands: ['toggle', 'settings'] }]
}
const defaults = { enabled: true, scale: 2, remindersEnabled: true, clockEnabled: true, unsavedMinutes: 15, breakMinutes: 60 }
const runtimePage = `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
const defaults=${JSON.stringify(defaults)},frameWidth=${frameWidth},frameHeight=${frameHeight},legacyWindowSize=360;let preferences={...defaults};let project=null;let hadProject=false;let dirtySince=0;let lastRevision=null;let drawingSince=0;let lastDrawingAt=0;let lastBreakNotice=0;let lastUnsavedNotice=0;let lastClockKey='';
const load=async()=>{preferences={...defaults,...(await moonsprite.storage.get({key:'preferences'})||{})}};
const send=message=>moonsprite.windows.postMessage({windowId:'companion',message}).catch(()=>{});
const compactSize=()=>{const scale=Math.max(1,Math.min(4,Math.round(preferences.scale||2)));return{width:frameWidth*scale+36,height:frameHeight*scale+28}};
const compactPosition=async()=>{const size=compactSize(),stored=await moonsprite.storage.get({key:'position'});let position;if(!stored||!Number.isFinite(stored.x)||!Number.isFinite(stored.y)){position={x:720+legacyWindowSize-size.width,y:360+legacyWindowSize-size.height}}else{const oldWidth=stored.layout==='compact'&&Number.isFinite(stored.width)?stored.width:legacyWindowSize,oldHeight=stored.layout==='compact'&&Number.isFinite(stored.height)?stored.height:legacyWindowSize;position={x:stored.x+oldWidth-size.width,y:stored.y+oldHeight-size.height}}const value={...position,...size,layout:'compact'};await moonsprite.storage.set({key:'position',value});return value};
let pendingShow=false;const open=async playShow=>{if(!project||!preferences.enabled)return;pendingShow=playShow;const position=await compactPosition();await moonsprite.windows.open({windowId:'companion',resourceId:'pet-window',options:{x:position.x,y:position.y,width:position.width,height:position.height,transparent:true,focusable:true}})};
const close=()=>moonsprite.windows.close({windowId:'companion'}).catch(()=>{});
moonsprite.on('activate',()=>load());
moonsprite.on('project',async event=>{const next=event.project;if(!next){project=null;hadProject=false;dirtySince=0;drawingSince=0;lastRevision=null;close();return}const first=!hadProject;hadProject=true;project=next;const now=Date.now();if(next.dirty&&!dirtySince)dirtySince=now;if(!next.dirty){dirtySince=0;lastUnsavedNotice=0}if(lastRevision!==null&&next.contentRevision!==lastRevision){if(!lastDrawingAt||now-lastDrawingAt>300000)drawingSince=now;lastDrawingAt=now}lastRevision=next.contentRevision;if(first)await open(true);else send({type:'project',project:next})});
moonsprite.on('document-saved',()=>send({type:'notice',text:'工程已保存',state:'save'}));
moonsprite.on('export-complete',()=>send({type:'notice',text:'导出完成',state:'export-complete'}));
moonsprite.on('settings-changed',async event=>{if(event.key!=='preferences')return;const wasEnabled=preferences.enabled;preferences={...defaults,...event.value};if(!preferences.enabled){close();return}if(!wasEnabled){await open(false);return}send({type:'preferences',preferences})});
moonsprite.on('command',async event=>{if(event.event!=='toggle')return;preferences.enabled=!preferences.enabled;await moonsprite.storage.set({key:'preferences',value:preferences});preferences.enabled?open(false):close()});
moonsprite.on('window-message',event=>{if(event.windowId!=='companion'||event.message?.type!=='ready'||!project)return;send({type:'init',project,preferences,playShow:pendingShow});pendingShow=false});
moonsprite.on('clock',event=>{if(!project||!preferences.enabled||!preferences.remindersEnabled)return;const now=event.timestamp;const date=new Date(now);if(preferences.clockEnabled&&(date.getMinutes()===0||date.getMinutes()===30)){const key=date.toDateString()+date.getHours()+':'+date.getMinutes();if(key!==lastClockKey){lastClockKey=key;send({type:'notice',text:'现在是 '+String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0')})}}const breakMs=preferences.breakMinutes*60000;if(drawingSince&&now-lastDrawingAt<300000&&now-drawingSince>=breakMs&&now-lastBreakNotice>=breakMs){lastBreakNotice=now;send({type:'notice',text:'已经专注绘制一段时间了，休息一下眼睛和手腕吧。',state:'break-reminder'})}const unsavedMs=preferences.unsavedMinutes*60000;if(dirtySince&&now-dirtySince>=unsavedMs&&now-lastUnsavedNotice>=unsavedMs){lastUnsavedNotice=now;send({type:'notice',text:'这份工程已经有一段时间没有保存了，记得保存当前进度。',state:'unsaved-reminder'})}});
</script></body></html>`
const petWindowPage = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent;user-select:none}#pet{position:absolute;right:18px;bottom:14px;padding:0;border:0;background:transparent;image-rendering:pixelated}#pet,#pet *{cursor:var(--cursor-grab,grab)!important}#pet.dragging,#pet.dragging *{cursor:var(--cursor-grabbing,grabbing)!important}canvas{display:block;image-rendering:pixelated}.bubble{position:absolute;right:10px;bottom:180px;width:220px;padding:9px 10px;color:#f5f7fa;background:#151a22ee;border:1px solid #728096;font:12px/17px system-ui,sans-serif}.bubble[hidden]{display:none}.bubble strong{display:block;margin-bottom:4px;color:white}.bubble small{display:block;color:#aeb9c7}.notice{pointer-events:none}</style></head><body><button id="pet" aria-label="${petName}"><canvas></canvas></button><aside id="info" class="bubble" hidden></aside><aside id="notice" class="bubble notice" hidden></aside><script>
const frameWidth=${frameWidth},frameHeight=${frameHeight},expandedSize=360,showFrames=${JSON.stringify(showFrames.map((_, index) => index))},idleFrames=${JSON.stringify(idleFrames.map((_, index) => showFrames.length + index))};const pet=document.querySelector('#pet'),canvas=document.querySelector('canvas'),context=canvas.getContext('2d',{willReadFrequently:true}),info=document.querySelector('#info'),notice=document.querySelector('#notice');let image=null,hitAlpha=null,hitRegionScheduled=false,project=null,preferences=${JSON.stringify(defaults)},animationToken=0,pointer=null,noticeTimer=0,expanded=false,desiredExpanded=false,boundsQueue=Promise.resolve();canvas.width=frameWidth;canvas.height=frameHeight;
const scheduleHitRegion=()=>{if(hitRegionScheduled||!hitAlpha)return;hitRegionScheduled=true;requestAnimationFrame(()=>{hitRegionScheduled=false;updateHitRegion()})};
const compactSize=()=>{const scale=Math.max(1,Math.min(4,Math.round(preferences.scale||2)));return{width:frameWidth*scale+36,height:frameHeight*scale+28}};
const savePosition=bounds=>moonsprite.storage.set('position',{x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height,layout:'compact'});
const setExpanded=(next,force=false)=>{desiredExpanded=next;boundsQueue=boundsQueue.then(async()=>{const targetExpanded=desiredExpanded,target=targetExpanded?{width:expandedSize,height:expandedSize}:compactSize(),current=await moonsprite.window.getBounds();if(force||expanded!==targetExpanded||current.width!==target.width||current.height!==target.height){const bounds={x:current.x+current.width-target.width,y:current.y+current.height-target.height,...target};await moonsprite.window.setBounds(bounds);expanded=targetExpanded;if(!targetExpanded)await savePosition(bounds)}requestAnimationFrame(scheduleHitRegion)}).catch(error=>moonsprite.diagnostics.log(String(error),'error'));return boundsQueue};
const syncBubbleLayout=()=>setExpanded(!info.hidden||!notice.hidden);
const updateScale=()=>{const scale=Math.max(1,Math.min(4,Math.round(preferences.scale||2)));canvas.style.width=frameWidth*scale+'px';canvas.style.height=frameHeight*scale+'px';info.style.bottom=(18+frameHeight*scale+8)+'px';notice.style.bottom=(18+frameHeight*scale+8)+'px';setExpanded(desiredExpanded,true);scheduleHitRegion()};
const draw=frame=>{if(!image)return;context.clearRect(0,0,frameWidth,frameHeight);context.drawImage(image,0,-frame*frameHeight);const pixels=context.getImageData(0,0,frameWidth,frameHeight).data;hitAlpha??=new Uint8Array(frameWidth*frameHeight);for(let index=0;index<hitAlpha.length;index++)hitAlpha[index]=pixels[index*4+3];scheduleHitRegion()};
const play=(frames,repeat)=>{const token=++animationToken;let index=0;const tick=()=>{if(token!==animationToken)return;draw(frames[index]);index++;if(index>=frames.length){if(!repeat){play(idleFrames,true);return}index=0}setTimeout(tick,repeat?125:100)};tick()};
const updateHitRegion=()=>{if(!hitAlpha)return;const viewportWidth=Math.max(1,window.innerWidth),viewportHeight=Math.max(1,window.innerHeight),spans=[],rect=pet.getBoundingClientRect(),scale=rect.width/frameWidth;for(let y=0;y<frameHeight;y++){let start=-1;for(let x=0;x<=frameWidth;x++){const opaque=x<frameWidth&&hitAlpha[y*frameWidth+x]>=16;if(opaque&&start<0)start=x;if(!opaque&&start>=0){const left=Math.max(0,Math.floor(rect.left+start*scale)),right=Math.min(viewportWidth,Math.ceil(rect.left+x*scale)),top=Math.max(0,Math.floor(rect.top+y*scale)),bottom=Math.min(viewportHeight,Math.ceil(rect.top+(y+1)*scale));for(let hitY=top;hitY<bottom;hitY++)spans.push({x:left,y:hitY,width:Math.max(1,right-left)});start=-1}}}for(const bubble of [info,notice])if(!bubble.hidden){const b=bubble.getBoundingClientRect();for(let y=Math.max(0,Math.floor(b.top));y<Math.min(viewportHeight,Math.ceil(b.bottom));y++){const left=Math.max(0,Math.floor(b.left)),right=Math.min(viewportWidth,Math.ceil(b.right));spans.push({x:left,y,width:Math.max(1,right-left)})}}moonsprite.window.setHitRegion(viewportWidth,viewportHeight,spans).catch(()=>{})};
const showInfo=async()=>{if(!project)return;if(!info.hidden){info.hidden=true;await syncBubbleLayout();return}notice.hidden=true;info.innerHTML='<strong>'+project.name+'</strong><small>'+project.width+' × '+project.height+' · '+project.colorMode+'</small><small>图层 '+project.layerCount+' · 帧 '+project.frameCount+'</small><small>'+(project.dirty?'有未保存修改':'已保存')+'</small>';await setExpanded(true);info.hidden=false;scheduleHitRegion()};
const showNotice=async text=>{info.hidden=true;notice.textContent=text;await setExpanded(true);notice.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{notice.hidden=true;syncBubbleLayout()},7000);scheduleHitRegion()};
const beginDrag=async()=>{info.hidden=true;notice.hidden=true;clearTimeout(noticeTimer);await setExpanded(false);pet.classList.add('dragging');try{await moonsprite.window.startDrag();const bounds=await moonsprite.window.getBounds();await savePosition(bounds)}finally{pet.classList.remove('dragging')}};
pet.addEventListener('pointerdown',event=>{if(event.button!==0)return;pointer={x:event.clientX,y:event.clientY,dragged:false};pet.setPointerCapture(event.pointerId)});pet.addEventListener('pointermove',event=>{if(!pointer||pointer.dragged||Math.hypot(event.clientX-pointer.x,event.clientY-pointer.y)<5)return;pointer.dragged=true;beginDrag().catch(error=>moonsprite.diagnostics.log(String(error),'error'))});pet.addEventListener('pointerup',event=>{if(!pointer)return;const dragged=pointer.dragged;pointer=null;if(pet.hasPointerCapture(event.pointerId))pet.releasePointerCapture(event.pointerId);if(!dragged)showInfo().catch(error=>moonsprite.diagnostics.log(String(error),'error'))});addEventListener('contextmenu',event=>event.preventDefault());
addEventListener('resize',scheduleHitRegion);addEventListener('moonsprite:window-focus',event=>{if(event.detail.focused||info.hidden)return;info.hidden=true;syncBubbleLayout()});
moonsprite.window.onMessage(message=>{if(message.type==='init'){project=message.project;preferences={...preferences,...message.preferences};updateScale();message.playShow?play(showFrames,false):play(idleFrames,true)}else if(message.type==='project')project=message.project;else if(message.type==='preferences'){preferences={...preferences,...message.preferences};updateScale();updateHitRegion()}else if(message.type==='notice')showNotice(message.text).catch(error=>moonsprite.diagnostics.log(String(error),'error'))});
Promise.all([moonsprite.resources.read('sprite'),moonsprite.storage.get('preferences')]).then(([bytes,stored])=>{preferences={...preferences,...stored};updateScale();const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'image/png'}));image=new Image();image.onload=()=>{play(idleFrames,true);URL.revokeObjectURL(url);moonsprite.window.postMessage({type:'ready'}).catch(()=>{})};image.src=url});
</script></body></html>`
const sprite = new Uint8Array(UPNG.encode([sheet.buffer], frameWidth, frameHeight * allFrames.length, 0))
writeFileSync(resolve(outputPath), zipSync({ 'manifest.json': new TextEncoder().encode(JSON.stringify(manifest, null, 2)), 'runtime/index.html': new TextEncoder().encode(runtimePage), 'ui/pet.html': new TextEncoder().encode(petWindowPage), 'assets/companion.png': sprite }, { level: 9 }))
console.log(`已生成 ${outputPath}：${frameWidth}x${frameHeight}，已裁剪源画布 (${bounds.left}, ${bounds.top})，SHOW ${showFrames.length} 帧，IDLE ${idleFrames.length} 帧。`)
