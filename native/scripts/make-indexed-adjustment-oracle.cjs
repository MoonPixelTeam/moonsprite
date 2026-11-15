// Executes actual legacy indexed adjustment and snapshot helpers via Node's TypeScript loader.
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
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const model=await imp('document-model.ts'),animation=await imp('animation.ts'),adjust=await imp('adjustments.ts'),{packColor,unpackColor}=await imp('raster.ts');
 const snapshots=await import(pathToFileURL(path.join(legacy,'src/renderer/src/store/workspace-history.ts')));
 const base=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800908a0},{id:53,color:0x40408020},{id:65,color:0xff800080},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const ditherNames=['none','bayer-2','bayer-4','bayer-8','checker','diagonal','diagonal-reverse','horizontal','vertical'];
 const specs=[{kind:'curves',invert:true,curvePoints:[{x:0,y:255},{x:255,y:0}],curveRedPoints:[{x:0,y:0},{x:255,y:255}]},{kind:'brightness-contrast',brightness:23,contrast:-37},{kind:'brightness-contrast',brightness:-80,contrast:80},{kind:'brightness-contrast'},
 {kind:'hue-saturation',hue:137,saturation:42,lightness:-20},{kind:'hue-saturation',colorize:true,hue:283,saturation:57,lightness:13},
 ...[true,false].map(preserveLuminosity=>({kind:'color-balance',shadowsCyanRed:35,shadowsMagentaGreen:-17,midtonesYellowBlue:28,highlightsCyanRed:-23,preserveLuminosity})),
 {kind:'curves',curvePoints:[{x:0,y:17},{x:65,y:135},{x:193,y:90},{x:255,y:246}],curveRedPoints:[{x:0,y:255},{x:255,y:0}]},
 ...ditherNames.map((dither,i)=>({kind:'gradient-map',gradientMap:{stops:[{position:0,color:unpackColor(0xff234507)},{position:.41,color:unpackColor(0xffa023dc)},{position:1,color:unpackColor(0xffddba51)}],mode:i%2?'steps':'continuous',dither,reverse:!!(i%3)}}))];
 const cases=[];
 for(const palette of ['normal','opaque-zero','duplicate','transparent-first','transparent-last','empty'])for(const layout of ['dense','negative','offcanvas'])for(const orderKind of ['all','hidden','empty'])for(const masked of [false,true])for(let n=0;n<specs.length;n++){
  const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xff0000ff;if(palette==='duplicate')entries.push({id:7,color:0xff00ff00});if(palette==='transparent-first'){entries.find(e=>e.id===7).color=0x00123456;entries.push({id:7,color:0xff00ff00});}if(palette==='transparent-last')entries.push({id:7,color:0x00123456});if(palette==='empty')entries.length=0;
  const order=orderKind==='all'?base.map(e=>e.id):orderKind==='hidden'?[19,7,41,53,65,77]:[];
  const w=18,h=12,sw=layout==='dense'?w:18,sh=layout==='dense'?h:5,ox=layout==='negative'?-3:layout==='offcanvas'?24:0,oy=layout==='negative'?-2:layout==='offcanvas'?15:0;
  const doc=model.createDocument('indexed adjustments',w,h,'indexed',false),layer=doc.layers[0];doc.palette=entries.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));doc.paletteOrder=[...order];doc.nextColorId=100;
  layer.width=sw;layer.height=sh;layer.offsetX=ox;layer.offsetY=oy;const initial=Array.from({length:sw*sh},(_,i)=>[7,0,41,99,19,53,404,65,30,77][i%10]);layer.pixels=new Uint32Array(initial);model.setLayerStorageOrigin(layer,{x:5,y:-3});animation.syncActiveAnimationLayer(doc,layer.id);
  const selection=masked?{x:-2,y:-1,width:9,height:7,mask:new Uint8Array(Array.from({length:63},(_,i)=>i%3?1:0))}:null;
  const session={document:doc,selection,selectedLayerIds:[layer.id],activeMaskId:null};
  const snapshot=()=>({pixels:Array.from(layer.pixels),entries:doc.palette.map(e=>({id:e.id,name:e.name,color:packColor(e.color)})),order:[...doc.paletteOrder],nextId:doc.nextColorId});
  const before=snapshots.captureAdjustmentSnapshot(session),baseline=snapshot(),histogram=Object.values(adjust.buildCurveHistogram(layer.pixels,'indexed',doc.palette)).map(a=>Array.from(a));
  const apply=()=>{snapshots.prepareAdjustmentSnapshotTargets(session,before);adjust.applyColorAdjustmentDirect(doc,layer,specs[n],selection,before.layers[0].pixels);};
  apply();const expected=snapshot();apply();if(JSON.stringify(snapshot())!==JSON.stringify(expected))throw Error('legacy repeat drift');
  const after=snapshots.captureAdjustmentSnapshot(session);snapshots.restoreAdjustmentSnapshot(session,before);const undo=snapshot();snapshots.restoreAdjustmentSnapshot(session,after);const redo=snapshot();
  cases.push({name:`${palette}-${layout}-${orderKind}-${masked}-${n}`,w,h,sw,sh,ox,oy,entries:baseline.entries,order,initial,selection:selection?{...selection,mask:Array.from(selection.mask)}:null,spec:specs[n],dither:specs[n].gradientMap?ditherNames.indexOf(specs[n].gradientMap.dither):0,histogram,expected,undo,redo});
 }
 fs.writeFileSync(out,JSON.stringify({cases}));console.log(cases.length+' actual legacy indexed adjustment snapshots');
})().catch(e=>{console.error(e);process.exitCode=1;});
