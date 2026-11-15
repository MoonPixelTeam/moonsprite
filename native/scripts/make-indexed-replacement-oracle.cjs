// Executes actual legacy indexed replacement and history helpers via Node's TypeScript loader.
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
 const model=await imp('document-model.ts'),animation=await imp('animation.ts'),tools=await imp('tools-fill.ts'),history=await imp('history.ts'),{packColor,unpackColor}=await imp('raster.ts');
 const base=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800908a0},{id:53,color:0x40408020},{id:65,color:0xff800080},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const cases=[];
 for(const palette of ['normal','opaque-zero','duplicate','transparent-first','empty'])for(const layout of ['dense','negative','offcanvas','large','scattered'])for(const orderKind of ['all','hidden','empty'])for(const masked of [false,true])for(const pair of [[0xffff0000,0xff0000ff],[0xffff0000,0x600908a0],[0xff0000ff,0],[0,0xffffffff],[0x00123456,0xff800080],[0xffff0000,0xffff0000],[0xff00ff00,0xff888888]]){
  const entries=base.map(e=>({...e}));if(palette==='opaque-zero')entries[0].color=0xff0000ff;if(palette==='duplicate')entries.push({id:7,color:0xff00ff00});if(palette==='transparent-first')entries.unshift({id:19,color:0x00123456});if(palette==='empty')entries.length=0;
  const order=orderKind==='all'?base.map(e=>e.id):orderKind==='hidden'?[7,41,53,65,77]:[];
  const w=40,h=30,sw=layout==='large'||layout==='scattered'?40:18,sh=layout==='large'||layout==='scattered'?30:5,ox=layout==='negative'?-3:layout==='offcanvas'?44:0,oy=layout==='negative'?-2:layout==='offcanvas'?35:0;
  const doc=model.createDocument('indexed replacement',w,h,'indexed',false),layer=doc.layers[0];doc.palette=entries.map(e=>({id:e.id,name:String(e.id),color:unpackColor(e.color)}));doc.paletteOrder=[...order];doc.nextColorId=100;
  layer.width=sw;layer.height=sh;layer.offsetX=ox;layer.offsetY=oy;
  const initial=Array.from({length:sw*sh},(_,i)=>layout==='large'?(i%4===0?30:19):layout==='scattered'?(i%4===0?19:7):[7,0,41,99,19,53,404,65,30,77][i%10]);
  layer.pixels=new Uint32Array(initial);model.setLayerStorageOrigin(layer,{x:5,y:-3});animation.syncActiveAnimationLayer(doc,layer.id);
  const selection=masked?{x:-2,y:-1,width:36,height:24,mask:new Uint8Array(Array.from({length:36*24},(_,i)=>i%3?1:0))}:null;
  const snapshot=()=>({pixels:Array.from(layer.pixels),entries:doc.palette.map(e=>({id:e.id,name:e.name,color:packColor(e.color)})),order:[...doc.paletteOrder],nextId:doc.nextColorId});
  const edit=tools.replaceLayerColor(doc,layer,unpackColor(pair[0]),unpackColor(pair[1]),selection),expected=snapshot();
  const committed=edit&&history.commitPixelEdit(doc,edit,'replacement');if(committed)committed.undo();const undo=snapshot();if(committed)committed.redo();const redo=snapshot();
  // Test sparse/dense history against a different current visible order too.
  const replayOrder=[77,65,53,41,7];doc.paletteOrder=[...replayOrder];if(committed)committed.undo();const changedUndo=snapshot();if(committed)committed.redo();const changedRedo=snapshot();
  layer.pixels=new Uint32Array(initial);doc.paletteOrder=[...order];const previewEdit=tools.replaceLayerColor(doc,layer,unpackColor(pair[0]),unpackColor(pair[1]),selection);history.revertPixelEdit(doc,previewEdit);const cancelled=snapshot();
  cases.push({name:`${palette}-${layout}-${orderKind}-${masked}-${pair[0]}-${pair[1]}`,w,h,sw,sh,ox,oy,entries:entries.map(e=>({...e,name:String(e.id)})),order,initial,selection:selection?{...selection,mask:Array.from(selection.mask)}:null,source:pair[0],replacement:pair[1],committed:!!committed,expected,undo,redo,replayOrder,changedUndo,changedRedo,cancelled});
 }
 fs.writeFileSync(out,JSON.stringify({cases}));console.log(cases.length+' actual legacy indexed replacement transactions');
})().catch(e=>{console.error(e);process.exitCode=1;});
