// Run actual legacy magicWandSelection, clearSelection and PixelEdit transactions.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,next){
  let target;
  if(specifier.startsWith('@/'))target=path.join(legacy,'src/renderer/src',specifier.slice(2));
  else if(specifier.startsWith('@shared/'))target=path.join(legacy,'src/shared',specifier.slice(8));
  else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if(target)for(const candidate of [target,target+'.ts',path.join(target,'index.ts')])if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return {url:pathToFileURL(candidate).href,shortCircuit:true};
  try{return next(specifier,context);}catch(error){
   if(specifier.startsWith('.')||specifier.startsWith('node:')||specifier.startsWith('file:'))throw error;
   const store=path.join(legacy,'node_modules/.pnpm'),name=specifier.split('/')[0],matches=fs.readdirSync(store).filter(n=>n.startsWith(name+'@'));
   if(matches.length!==1)throw error;
   return {url:pathToFileURL(require.resolve(path.join(store,matches[0],'node_modules',specifier))).href,shortCircuit:true};
  }
 },
 load(url,context,next){
  if(url.startsWith('file:')&&url.endsWith('.ts')){
   const input=fs.readFileSync(fileURLToPath(url),'utf8').replace('import { BrushGradientSample,','import { type BrushGradientSample,').replace(', BrushGradientSample,',', type BrushGradientSample,').replace(/, BrushMaskPoint(?=[, }])/g,', type BrushMaskPoint');
   return {format:'module',source:stripTypeScriptTypes(input,{mode:'transform'}),shortCircuit:true};
  }
  return next(url,context);
 }
});
(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const model=await imp('document-model.ts'),selection=await imp('selection.ts'),fill=await imp('tools-fill.ts'),history=await imp('history.ts'),{unpackColor}=await imp('raster.ts'),{createCompositePointSampler}=await imp('document-composite-sampling.ts'),{createDefaultLayerStyles}=await imp('layer-styles.ts');
 const cases=[];
 function style(effect){if(!effect)return undefined;const s=createDefaultLayerStyles();if(effect===1){s.stroke.enabled=true;s.stroke.color=unpackColor(0xff0000ff);}if(effect===2){s.shadow.enabled=true;s.shadow.color=unpackColor(0xff0000ff);s.shadow.offsetX=1;s.shadow.offsetY=0;}if(effect===3){s.gradientOverlay.enabled=true;s.gradientOverlay.from=unpackColor(0xffff0000);s.gradientOverlay.to=unpackColor(0xff0000ff);}return s;}
 function run(format,palette,layout,variant,dense=false,effect=0){
  const w=dense?33:13,h=dense?29:11,sw=layout===1?w+4:layout===2?w-4:layout===4?1:w,sh=layout===1?h+6:layout===2?h-3:layout===4?1:h,ox=layout===1?-2:layout===2?2:layout===4?6:0,oy=layout===1?-3:layout===2?1:layout===4?5:0;
  const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x8000ff00},{id:99,color:0x00123456}];if(palette===1)entries[0].color=0xff0000ff;if(palette===2)entries.push({id:7,color:0xff00ff00});if(palette===3)entries.push({id:7,color:0x00123456});if(palette===4)entries[1].color=0x00123456;if(palette===5)entries.length=0;if(palette===6){entries[1].color=0;entries.push({id:7,color:0xff0000ff});}
  const order=palette===3?[]:palette===4?[19,41]:[7,19,41],initial=Array.from({length:sw*sh},(_,i)=>{const x=i%sw,y=Math.floor(i/sw);if(layout===3)return format==='indexed'?99:0x00123456;if(layout===4)return format==='indexed'?7:0xff0000ff;if(dense)return format==='indexed'?[7,30,99,4000000000][i%4]:[0xff0000ff,0xffff0000,0x00123456,0x8000ff00][i%4];if(variant%4===3){const wall=(x===2||y===2||x===sw-3||y===sh-3)&&x>=2&&y>=2&&x<=sw-3&&y<=sh-3&&!(x===5&&y===2);return wall?(format==='indexed'?19:0xffff0000):format==='indexed'?7:0xff0000ff;}return format==='indexed'?[0,7,19,30,41,99,4000000000][(x+y*3)%7]:[0,0xff0000ff,0xffff0000,0xffff0000,0x8000ff00,0x00123456,0x000100ff][(x+y*3)%7];});
  const visible=!!(variant&8)||!!effect,contiguous=!!(variant&4),connectivity=variant&16?8:4,tolerance=[0,1,128,255][variant%4],gap=contiguous&&variant%4===3?2:0;
  const selected=variant%3===1?{x:1,y:1,width:w-2,height:h-2,mask:Array.from({length:(w-2)*(h-2)},(_,i)=>[1,0,2,255,1][i%5])}:variant%3===2?{x:1,y:1,width:w-2,height:h-2}:null;
  const seed=layout===4?[6,5]:variant%4===3?[5,5]:[3,3],peer=visible?Array.from({length:w*h},(_,i)=>i%w===6?(format==='indexed'?19:0xffff0000):0):null;
  function make(){const d=model.createDocument('magic eraser oracle',w,h,format,false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=order;d.nextColorId=100;Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:format==='indexed'?new Uint32Array(initial):new Uint8ClampedArray(new Uint32Array(initial).buffer)});model.setLayerStorageOrigin(l,{x:5,y:-3});l.layerStyles=style(effect);if(peer){const top=model.createLayer('upper',w,h,format);top.pixels=format==='indexed'?new Uint32Array(peer):new Uint8ClampedArray(new Uint32Array(peer).buffer);d.layers.unshift(top);}return {d,l};}
  const canvas=(d,l)=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0),snapshot=l=>Array.from({length:l.width*l.height},(_,i)=>model.readLayerPacked(null,l,i)),selectedValue=selected?{...selected,mask:selected.mask?new Uint8Array(selected.mask):undefined}:null;
  // Exact workspace-magic-eraser command sequence; real core implementations.
  function apply(d,l){if(selectedValue&&!selection.selectionContains(selectedValue,...seed))return null;const matched=selection.magicWandSelection(d,l,...seed,tolerance,contiguous,gap,{connectivity,sourceColorAt:visible?createCompositePointSampler(d):undefined});if(!matched)return null;const target=selectedValue?selection.combineSelection(selectedValue,matched,'intersect'):matched;return target?fill.clearSelection(d,target,l):null;}
  const {d,l}=make(),edit=apply(d,l),after=canvas(d,l),afterStorage=snapshot(l),entry=edit?history.commitPixelEdit(d,edit,'magic eraser',true):null,isDense=!!entry&&history.getCommittedPixelChanges(entry).regionPatches.length>0,replayOrder=variant%3===1?[41,19]:null;
  if(replayOrder)d.paletteOrder=replayOrder;entry?.undo();const undo=canvas(d,l),undoStorage=snapshot(l);entry?.redo();const redo=canvas(d,l),redoStorage=snapshot(l);const cancelled=make(),cancelEdit=apply(cancelled.d,cancelled.l);if(cancelEdit)history.revertPixelEdit(cancelled.d,cancelEdit);
  cases.push({name:`${format}-${palette}-${layout}-${variant}-${dense}-${effect}`,format,w,h,sw,sh,ox,oy,entries,order,initial,visible,contiguous,connectivity,tolerance,gap,selection:selected,seed,peer,effect,after,afterStorage,undo,undoStorage,redo,redoStorage,cancel:canvas(cancelled.d,cancelled.l),cancelStorage:snapshot(cancelled.l),changed:!!entry,dense:isDense,replayOrder});
 }
 for(const format of ['indexed','rgba'])for(let palette=0;palette<7;++palette)for(let layout=0;layout<5;++layout)for(let variant=0;variant<32;++variant)run(format,palette,layout,variant);
 for(const format of ['indexed','rgba'])for(let palette=0;palette<7;++palette)for(let layout=0;layout<3;++layout)for(const variant of [0,3,8])run(format,palette,layout,variant,true);
 for(const format of ['indexed','rgba'])for(let palette=0;palette<7;++palette)for(let effect=1;effect<=3;++effect)for(let layout=0;layout<3;++layout)run(format,palette,layout,8,false,effect);
 const masks=[];
 for(const format of ['indexed','rgba'])for(let layout=0;layout<3;++layout)for(let variant=0;variant<8;++variant){
  const w=13,h=11,sw=layout===1?17:layout===2?7:w,sh=layout===1?15:layout===2?6:h,ox=layout===1?-2:layout===2?2:0,oy=layout===1?-2:layout===2?1:0;
  // Both project decoders canonicalize alpha-zero mask RGB to zero. Exercise
  // admitted scalar mask storage, rather than injecting a pre-decode payload.
  const initial=Array.from({length:sw*sh},(_,i)=>[0,0xff000000,0xff808080,0xffffffff,0][(i%sw+Math.floor(i/sw))%5]);
  function make(){const d=model.createDocument('mask eraser',w,h,format,false),l=model.createLayerMask(d.layers[0].id,sw,sh);Object.assign(l,{offsetX:ox,offsetY:oy,pixels:new Uint8ClampedArray(new Uint32Array(initial).buffer)});model.setLayerStorageOrigin(l,{x:5,y:-3});d.animation.layerMasks.push({layerId:d.layers[0].id,frameId:d.animation.activeFrameId,mask:l});return {d,l};}
  const selected=variant%2?{x:1,y:1,width:11,height:9,mask:new Uint8Array(Array.from({length:99},(_,i)=>[1,0,2,255,1][i%5]))}:null,tolerance=variant&2?255:0,contiguous=!!(variant&4),seed=[3,3],snapshot=l=>Array.from(new Uint32Array(l.pixels.buffer,l.pixels.byteOffset,l.pixels.byteLength/4));
  function apply(d,l){if(selected&&!selection.selectionContains(selected,...seed))return null;const matched=selection.magicWandSelection(d,l,...seed,tolerance,contiguous,0,{connectivity:8});const target=selected?selection.combineSelection(selected,matched,'intersect'):matched;return target?fill.clearSelection(d,target,l):null;}
  const {d,l}=make(),edit=apply(d,l),after=snapshot(l),entry=edit?history.commitPixelEdit(d,edit,'mask'):null;entry?.undo();const undo=snapshot(l);entry?.redo();const redo=snapshot(l);const c=make(),cancelEdit=apply(c.d,c.l);if(cancelEdit)history.revertPixelEdit(c.d,cancelEdit);
  masks.push({name:`mask-${format}-${layout}-${variant}`,format,w,h,sw,sh,ox,oy,initial,selection:selected?{...selected,mask:Array.from(selected.mask)}:null,tolerance,contiguous,connectivity:8,gap:0,visible:true,seed,after,undo,redo,cancel:snapshot(c.l),changed:!!entry});
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases,masks}));console.log(`${cases.length} actual legacy magic erase transactions; ${cases.filter(c=>c.dense).length} dense histories; ${masks.length} mask transactions`);
})().catch(error=>{console.error(error);process.exitCode=1;});
