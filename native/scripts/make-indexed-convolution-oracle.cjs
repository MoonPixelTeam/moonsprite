// Executes actual legacy indexed convolution kernels and preview transactions via Node's TypeScript loader.
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
 globalThis.localStorage={getItem:()=>null};
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src',p)));
 const model=await imp('core/document-model.ts'),anim=await imp('core/animation.ts'),{packColor,unpackColor}=await imp('core/raster.ts');
 const {CONVOLUTION_PRESETS,convolveLayer}=await imp('core/convolution-matrix.ts');
 const {createConvolutionPreview}=await imp('store/workspace-convolution-preview.ts');
 const base=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0x800908a0},{id:41,color:0x40408020},{id:53,color:0xff800080},{id:65,color:0xff00ff00},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const cases=[];let transactions=0;
 for(const palette of ['normal','opaque-zero','duplicate','transparent-first','transparent-last','empty'])for(const orderKind of ['all','subset','empty'])for(const layout of ['dense','negative','offcanvas','tiny','blank','dense-blank','dense-transparent'])for(const preset of CONVOLUTION_PRESETS)for(let variant=0;variant<2;variant++){
  const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xffabcdef;if(palette==='duplicate')entries.push({id:7,color:0xff00ff00});if(palette==='transparent-first'){entries.find(e=>e.id===7).color=0x00123456;entries.push({id:7,color:0xff00ff00});}if(palette==='transparent-last')entries.push({id:7,color:0x00123456});if(palette==='empty')entries.length=0;
  const order=orderKind==='all'?base.map(e=>e.id):orderKind==='subset'?[77,41,65,7]:[];
  const w=7,h=5,tiny=layout==='tiny'||layout==='blank',sw=tiny?1:layout.startsWith('dense')?w:4,sh=tiny?1:layout.startsWith('dense')?h:3,ox=layout==='negative'?-2:layout==='offcanvas'||layout==='blank'?9:tiny?2:0,oy=layout==='negative'?-1:layout==='offcanvas'||layout==='blank'?8:tiny?2:0;
  const initial=Array.from({length:sw*sh},(_,i)=>layout==='blank'||layout==='dense-blank'?0:layout==='dense-transparent'?99:[7,0,19,41,99,53,404,65,30,77][i%10]);
  const d=model.createDocument('indexed convolution',w,h,'indexed',false),source=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));d.paletteOrder=[...order];d.nextColorId=100;
  Object.assign(source,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:new Uint32Array(initial)});model.setLayerStorageOrigin(source,{x:5,y:-3});anim.syncActiveAnimationLayer(d,source.id);
  const index=CONVOLUTION_PRESETS.indexOf(preset),channels=variant&&index%3===0?{r:true,g:false,b:false,a:index%2===0}:variant&&index%7===0?{r:false,g:false,b:false,a:false}:{...preset.channels};
  const options={presetId:preset.id,channels,tiled:!!variant};
  const selection=variant?{x:-1,y:0,width:6,height:5,mask:new Uint8Array(Array.from({length:30},(_,i)=>i%3===0?0:i%5===0?2:1))}:null;
  const snapshot=layer=>({width:layer.width,height:layer.height,ox:layer.offsetX,oy:layer.offsetY,sx:model.getLayerStorageOrigin(layer).x,sy:model.getLayerStorageOrigin(layer).y,pixels:Array.from(layer.pixels)});
  const before=snapshot(source),result=await convolveLayer(d,source,options,selection,()=>false),expected=result?snapshot(result):before;
  if(cases.length%97===0){
   const history=[],session={document:d,selection,selectedLayerIds:[source.id],activeLayerMaskId:null,history:{push:e=>history.push(e)},revision:0,contentRevision:0};
   const context={get:()=>({sessions:[session],activeId:d.id}),set:()=>{},recording:{recordDocumentOperation:()=>{}}};
   let handle=createConvolutionPreview(context);await handle.update(options);if(JSON.stringify(snapshot(source))!==JSON.stringify(expected))throw Error('preview');await handle.update(options);if(JSON.stringify(snapshot(source))!==JSON.stringify(expected))throw Error('repeat');handle.cancel();if(JSON.stringify(snapshot(source))!==JSON.stringify(before))throw Error('cancel');
   handle=createConvolutionPreview(context);await handle.apply(options);handle.cancel();if(history.length!==(result?1:0))throw Error('history');if(result){history[0].undo();if(JSON.stringify(snapshot(source))!==JSON.stringify(before))throw Error('undo');history[0].redo();if(JSON.stringify(snapshot(source))!==JSON.stringify(expected))throw Error('redo');}transactions++;
  }
  if(d.palette.length!==entries.length||d.nextColorId!==100)throw Error('palette allocation');
  cases.push({name:`${palette}-${orderKind}-${layout}-${preset.id}-${variant}`,w,h,sw,sh,ox,oy,initial,entries:entries.map(e=>({...e,name:String(e.id)})),order,options,selection:selection?{...selection,mask:Array.from(selection.mask)}:null,produced:!!result,expected});
 }
 fs.writeFileSync(out,JSON.stringify({cases,transactions}));console.log(cases.length+' actual legacy indexed convolution results; '+transactions+' preview/history transactions');
})().catch(e=>{console.error(e);process.exitCode=1;});
