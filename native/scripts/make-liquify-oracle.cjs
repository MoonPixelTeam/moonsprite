// Run actual legacy liquify, palette normalization, smoothing and PixelEdit replay.
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
 const model=await imp('document-model.ts'),animation=await imp('animation.ts'),history=await imp('history.ts'),liquify=await imp('liquify.ts'),smooth=await imp('smooth-brush.ts'),{unpackColor}=await imp('raster.ts');
 const snapshot=l=>({width:l.width,height:l.height,ox:l.offsetX,oy:l.offsetY,sx:model.getLayerStorageOrigin(l).x,sy:model.getLayerStorageOrigin(l).y,pixels:Array.from({length:l.width*l.height},(_,i)=>model.readLayerPacked(null,l,i))});
 const cases=[],modes=['push','inflate','deflate','twist-clockwise','twist-counter-clockwise'];
 function run(format,palette,shape,variant,strength,mode,size=17,layout=0){
  const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x8000ff00},{id:99,color:0x00123456}];
  if(palette===1)entries[0].color=0xff0000ff;
  if(palette===2)entries.push({id:7,color:0xff00ff00});
  if(palette===3)entries.push({id:7,color:0x00123456});
  if(palette===4)entries[1].color=0x00123456;
  if(palette===5)entries.length=0;
  if(palette===6){entries[1].color=0;entries.push({id:7,color:0xff0000ff});}
  const order=palette===3?[]:palette===4?[19,41]:[7,19,41];
  const w=size,h=size,sw=layout===1?size+4:layout===2?size-5:w,sh=layout===1?size+6:layout===2?size-4:h,ox=layout===1?-2:layout===2?2:0,oy=layout===1?-3:layout===2?1:0;
  const ids=[0,7,19,30,41,99,4000000000],rgba=[0,0xff0000ff,0xffff0000,0x8000ff00,0x00123456,0x40ffffff,0];
  const initial=Array.from({length:sw*sh},(_,i)=>{const x=i%sw+ox,y=Math.floor(i/sw)+oy,mid=Math.floor(size/2);let filled=shape===0?y===mid||x===mid:shape===1?(x+y)%7===0:shape===2?x>2&&x<size-3&&y>2&&y<size-3:shape===3?x===y||x+y===size-1:true;const v=shape===4?(x*3+y*5+variant+500)%7:variant===2?5:1;return filled?(format==='indexed'?ids[v]:rgba[v]):format==='rgba'&&variant===1?0x00123456:0;});
  const selection=variant===2?{x:1,y:1,width:w-2,height:h-2,mask:Array.from({length:(w-2)*(h-2)},(_,i)=>[1,1,0,2,255][i%5])}:null;
  const mask=variant===2?{width:w,height:h,offsetX:0,offsetY:0,pixels:Array.from({length:w*h},(_,i)=>i%w>size*.65?0xff000000:i%7===0?0x00123456:0xff808080)}:null;
  const radius=size>17?24:6,start={x:size*.35+.25,y:size*.4+.25};
  const ops=variant===0?[['move',size*.65+.75,start.y],['move',size*.65+.9,start.y],['hold'],['move',size*.35+.4,start.y]]:variant===1?[['hold'],['move',size*.6+.2,size*.55+.7],['hold'],['move',size*.6+.3,size*.55+.8],['hold'],['move',size*.3+.7,size*.65+.2]]:[['hold'],['move',size*.65+.3,size*.45+.3],['hold'],['move',start.x,start.y],['hold']];
  // Multiple cycles and weak moving impulses exercise stable-source rebasing.
  if(mode!=='push')for(let i=0;i<14;++i)ops.push(['hold']);
  const smoothing=mode==='push'&&variant!==0,smoothingStrength=variant===1?50:100;
  function make(){const d=model.createDocument('liquify oracle',w,h,format,false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));d.paletteOrder=order;d.nextColorId=100;
   Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:format==='indexed'?new Uint32Array(initial):new Uint8ClampedArray(new Uint32Array(initial).buffer)});model.setLayerStorageOrigin(l,{x:5,y:-3});animation.syncActiveAnimationLayer(d,l.id);
   const edit=history.beginPixelEdit(l.id),stroke=liquify.createLiquifyPushStroke(),options={mode,radius,strength,selection:selection?{...selection,mask:new Uint8Array(selection.mask)}:null,mask:mask?{...mask,pixels:new Uint8ClampedArray(new Uint32Array(mask.pixels).buffer),visible:true}:null,pushStroke:stroke};let last=start;
   for(const [kind,x,y]of ops)if(kind==='hold'){liquify.applyLiquifyHoldStep(d,l,edit,last,{...options,strength:Math.max(.1,strength*.1)});}else{const next={x,y};if(mode==='push')liquify.applyLiquifyPushPath(d,l,edit,stroke,last,[next],options);else liquify.applyLiquifyHoldPath(d,l,edit,last,next,options);last=next;}
   return {d,l,edit,options};
  }
  const {d,l,edit,options}=make(),preview=snapshot(l);if(smoothing)smooth.smoothChangedLiquifyPixels(d,l,edit,options.selection,smoothingStrength);const after=snapshot(l),entry=history.commitPixelEdit(d,edit,'liquify',true),dense=!!entry&&history.getCommittedPixelChanges(entry).regionPatches.length>0;
  const replayOrder=variant===2?[41,19]:null;if(replayOrder)d.paletteOrder=replayOrder;entry?.undo();const undo=snapshot(l);entry?.redo();const redo=snapshot(l);
  const cancelled=make();history.revertPixelEdit(cancelled.d,cancelled.edit);const cancel=snapshot(cancelled.l);
  cases.push({name:`${format}-${palette}-${shape}-${variant}-${strength}-${mode}-${size}-${layout}`,format,w,h,sw,sh,ox,oy,entries,order,initial,selection,mask,mode:modes.indexOf(mode),radius,strength,start,ops,smoothing,smoothingStrength,preview,after,undo,redo,cancel,changed:!!entry,dense,replayOrder,expanded:layout===2});
 }
 for(const format of ['indexed','rgba'])for(let palette=0;palette<7;++palette)for(let shape=0;shape<5;++shape)for(let variant=0;variant<3;++variant)for(const strength of [1,45,100])for(const mode of modes)run(format,palette,shape,variant,strength,mode,17,variant===1?1:0);
 for(const format of ['indexed','rgba'])for(const mode of modes)for(let palette=0;palette<7;++palette)run(format,palette,4,0,100,mode,65);
 // Sparse storage requires the existing native reversible geometry adapter.
 for(const format of ['indexed','rgba'])for(const mode of modes)run(format,0,2,0,100,mode,17,2);
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy liquify cases; ${cases.filter(c=>c.dense).length} dense histories`);
})().catch(error=>{console.error(error);process.exitCode=1;});
