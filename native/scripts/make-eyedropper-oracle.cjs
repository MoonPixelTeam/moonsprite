// Execute the real legacy point, raw-region, composite-region and mask readers.
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
 const model=await imp('document-model.ts'),eye=await imp('eyedropper-source.ts'),composite=await imp('document-composite.ts'),sampling=await imp('document-composite-sampling.ts'),raster=await imp('raster.ts'),styles=await imp('layer-styles.ts'),adjustments=await imp('adjustments.ts');
 const w=7,h=6,region={x:-2,y:-2,width:11,height:10},cases=[],masks=[];
 const pack=c=>raster.packColor(c)>>>0,words=bytes=>Array.from(new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4));
 for(const format of ['rgba','indexed','mixed'])for(let palette=0;palette<7;++palette)for(let layout=0;layout<4;++layout)for(let appearance=0;appearance<10;++appearance){
  const indexed=format!=='rgba',d=model.createDocument('eyedropper oracle',w,h,indexed?'indexed':'rgba',false),l=d.layers[0];
  const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0x8000ff00},{id:41,color:0x00123456}];
  if(palette===1)entries[0].color=0xffff0000;
  if(palette===2)entries.push({id:7,color:0xff00ff00});
  if(palette===3)entries.push({id:7,color:0x00123456});
  if(palette===4)entries[1].color=0x00123456;
  if(palette===5)entries.length=0;
  if(palette===6){entries[1].color=0;entries.push({id:7,color:0xff0000ff});}
  const order=palette===3?[]:palette===4?[19]:[7,19];d.palette=entries.map(e=>({id:e.id,name:'',color:raster.unpackColor(e.color)}));d.paletteOrder=order;d.nextColorId=100;
  const sw=[7,3,9,1][layout],sh=[6,4,8,1][layout],ox=[0,2,-1,3][layout],oy=[0,1,-1,2][layout];
  const initial=Array.from({length:sw*sh},(_,i)=>indexed?[0,7,19,41,4000000000][i%5]:[0,0xff0000ff,0x8000ff00,0x00123456,0xffabcdef][i%5]);
  Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:indexed?new Uint32Array(initial):new Uint8ClampedArray(new Uint32Array(initial).buffer)});model.setLayerStorageOrigin(l,{x:71,y:-37});
  if(appearance===1){l.visible=false;l.locked=true;}
  if(appearance===2){l.opacity=.5;l.blendMode='multiply';}
  if(appearance===3||appearance===4){l.layerStyles=styles.createDefaultLayerStyles();if(appearance===3){l.layerStyles.stroke.enabled=true;l.layerStyles.stroke.color=raster.unpackColor(0xffff0000);}else{l.layerStyles.shadow.enabled=true;l.layerStyles.shadow.color=raster.unpackColor(0xff0000ff);l.layerStyles.shadow.offsetX=1;l.layerStyles.shadow.offsetY=0;}}
  let mask=null;
  if(appearance===5){mask=model.createLayerMask(l.id,3,3);Object.assign(mask,{offsetX:1,offsetY:1,pixels:new Uint8ClampedArray(new Uint32Array([0,0xff000000,0xff808080,0xffffffff,0xff000000,0,0xff808080,0xffffffff,0]).buffer)});d.animation.layerMasks.push({layerId:l.id,frameId:d.animation.activeFrameId,mask});}
  let peer=null,background=false;
  if(appearance>=6){peer=model.createLayer('peer',w,h,format==='indexed'?'indexed':'rgba');peer.pixels=peer.format==='indexed'?new Uint32Array(w*h).fill(19):new Uint8ClampedArray(new Uint32Array(w*h).fill(0xff886644).buffer);if(appearance===8){peer.background={mode:'canvas'};background=true;}if(appearance===9)l.background={mode:'canvas'};d.layers.unshift(peer);}
  if(appearance===7){const group={id:'sample-group',name:'group',visible:true,locked:false,opacity:.5,blendMode:'normal',parentGroupId:null};d.groups.push(group);l.groupId=group.id;}
  // useCanvasRenderEngine cursor sampler chooses normal fast path and excludes
  // background layers only when the active layer is not a background itself.
  const sd=!l.background&&background?{...d,layers:d.layers.filter(layer=>!layer.background)}:d;
  const point=sampling.createNormalCompositePointSampler(sd)??sampling.createCompositePointSampler(sd);
  const current=[],visible=[];
  for(let y=region.y;y<region.y+region.height;++y)for(let x=region.x;x<region.x+region.width;++x){current.push(pack(eye.sampleEyedropperColor(d,x,y,point,'current-layer')));visible.push(pack(eye.sampleEyedropperColor(d,x,y,point,'composite')));}
  cases.push({name:`${format}-${palette}-${layout}-${appearance}`,format,w,h,sw,sh,ox,oy,initial,entries,order,appearance,peer:peer?{format:peer.format,initial:words(peer.pixels)}:null,mask:mask?words(mask.pixels):null,region,current,visible,currentRegion:words(eye.renderEyedropperLayerRegion(d,region.x,region.y,region.width,region.height)),compositeRegion:words(composite.compositeRegion(d,region.x,region.y,region.width,region.height))});
  if(appearance===0){
   // workspace-commands-layer-adjustment mutates the displayed legacy document
   // during preview. Native must sample its existing preview timeline/palette.
   adjustments.applyColorAdjustmentDirect(d,l,{kind:'brightness-contrast',brightness:15,contrast:10},null,l.pixels.slice());
   const previewSampler=sampling.createNormalCompositePointSampler(d)??sampling.createCompositePointSampler(d),current=[],visible=[];
   for(let y=region.y;y<region.y+region.height;++y)for(let x=region.x;x<region.x+region.width;++x){current.push(pack(eye.sampleEyedropperColor(d,x,y,previewSampler,'current-layer')));visible.push(pack(eye.sampleEyedropperColor(d,x,y,previewSampler,'composite')));}
   cases.at(-1).preview={current,visible,currentRegion:words(eye.renderEyedropperLayerRegion(d,region.x,region.y,region.width,region.height)),compositeRegion:words(composite.compositeRegion(d,region.x,region.y,region.width,region.height))};
  }
 }
 for(const group of [false,true])for(let layout=0;layout<3;++layout){const d=model.createDocument('mask sample',w,h,'rgba',false),sw=[7,3,9][layout],sh=[6,4,8][layout],ox=[0,2,-1][layout],oy=[0,1,-1][layout],mask=model.createLayerMask(d.layers[0].id,sw,sh),initial=Array.from({length:sw*sh},(_,i)=>[0,0xff000000,0xff808080,0xffffffff][i%4]);Object.assign(mask,{offsetX:ox,offsetY:oy,pixels:new Uint8ClampedArray(new Uint32Array(initial).buffer)});model.setLayerStorageOrigin(mask,{x:71,y:-37});const point=[];for(let y=region.y;y<region.y+region.height;++y)for(let x=region.x;x<region.x+region.width;++x)point.push(x<0||y<0||x>=w||y>=h?0:pack(model.readLayerMaskDisplayColorAt(mask,x,y)));masks.push({group,w,h,sw,sh,ox,oy,initial,region,point,pixels:words(model.renderLayerMaskRegion(mask,region.x,region.y,region.width,region.height))});}
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases,masks}));console.log(`${cases.length} actual legacy eyedropper cases and ${masks.length} mask cases`);
})().catch(error=>{console.error(error);process.exitCode=1;});
