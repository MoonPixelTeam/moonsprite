// Executes actual legacy composition, onion and content scans through Node TypeScript hooks.
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
  if(url.startsWith('file:')&&url.endsWith('.ts')) {let source=stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'});return {format:'module',source,shortCircuit:true};}
  return nextLoad(url,context);
 }
});

(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const model=await imp('document-model.ts');
 const tool=await imp('tools-pixel-edit.ts');
 const state=await imp('tools-pixel-edit-state.ts');
 const {beginPixelEdit}=await imp('history.ts');
 const {packColor:pack,unpackColor:unpack}=await imp('raster.ts');
 const formats=['rgba32','rgb24','rgb565','rgb555','rgb332','rgba4444','rgba5551','argb1555'];
 const palettes=[
  {entries:[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0x8000ff00},{id:30,color:0x00112233}],order:[0,19,7,30]},
  {entries:[{id:0,color:0xff123456},{id:7,color:0xff0000ff},{id:19,color:0x8000ff00},{id:7,color:0xffff7929},{id:30,color:0xff777777}],order:[0,19,7,7,999]},
  {entries:[],order:[]},
  {entries:[{id:0,color:0},{id:7,color:0xff000000},{id:19,color:0xff000002},{id:30,color:0x8000ff00}],order:[19,7]}
 ];
 const tokens=[],contexts=3*formats.length*3*palettes.length;tokens.push(contexts);
 let paintCount=0,selectionCount=0,writeCount=0;
 const words=l=>Array.from({length:6},(_,i)=>model.readLayerPacked(null,l,i));
 function raw(l,values){l.pixels=l.format==='indexed'?new Uint32Array(values):new Uint8ClampedArray(values.flatMap(p=>[p&255,(p>>>8)&255,(p>>>16)&255,p>>>24]));}
 for(const [modeIndex,mode] of ['rgba','indexed','grayscale'].entries())for(const [precision,format] of formats.entries())for(const storage of [0,1,2])for(const palette of palettes){
  const d=model.createDocument('pixel oracle',3,2,mode);d.pixelFormat=format;
  d.palette=palette.entries.map(e=>({...e,name:'',color:unpack(e.color)}));d.paletteOrder=palette.order.slice();
  const l=storage===2?model.createLayerMask(d.activeLayerId,3,2):d.layers[0];
  Object.assign(l,{width:3,height:2,offsetX:-2,offsetY:3,format:storage===1?'indexed':'rgba'});
  tokens.push(modeIndex,precision,+(storage===1),+(storage===2),palette.entries.length);for(const e of palette.entries)tokens.push(e.id,e.color);tokens.push(palette.order.length,...palette.order);
  const values=storage===1?[0,7,19,30,999,0xffffffff]:[0x00112233,0xff0000ff,0x8000ff00,0x01030201,0xffffffff,0x12345678];
  raw(l,values);tokens.push(...values);for(let i=0;i<6;i++)tokens.push(model.readLayerPacked(d,l,i),pack(model.readLayerColor(d,l,i)));
  for(const [x,y] of [[-2,3],[0,4],[-3,3],[1,4],[-2,2],[-2,5]]){const v=model.readLayerPackedAt(d,l,x,y);tokens.push(x,y,+(v!==null),v??0);}
  const colors=[0,0x00112233,0xff0000ff,0x8000ff00,0xff000001,0x01030201,0xffae491e,0xffffffff];
  const packed=[...values,0,7,19,30,999,0xffffffff];tokens.push(colors.length);
  for(const color of colors){raw(l,values);model.writeLayerColor(d,l,1,unpack(color));tokens.push(color,model.readLayerPacked(d,l,1));writeCount++;}
  tokens.push(packed.length);for(const value of packed){raw(l,values);model.writeLayerPacked(d,l,1,value);tokens.push(value,model.readLayerPacked(d,l,1));
   raw(l,values);model.writeLayerPackedRun(d,l,1,5,value);tokens.push(...words(l));writeCount++;}
  // Exercise real state WeakMaps and split-tail inheritance, without cloning
  // their precedence into the expected implementation.
  const setups=['none','before','baseline','tail-before','parent-before','parent-baseline','tail-baseline','zero'];
  tokens.push(setups.length*colors.length*4);
  for(const setup of setups)for(const color of colors)for(const flags of [0,1,2,3]){
   const parent=beginPixelEdit(l.id);let edit=parent;const current=values[1];
   if(setup==='before')edit.before.set(1,values[2]);
   if(setup==='baseline'){edit.before.set(1,values[2]);state.brushPaintBaselineByEdit.set(edit,new Map([[1,values[3]]]));}
   if(setup.startsWith('tail')||setup.startsWith('parent')){parent.before.set(1,values[2]);edit=state.beginBrushTailEdit(parent);edit.before.set(1,values[4]);
    if(setup==='tail-before')parent.before.clear();
    if(setup==='parent-baseline'||setup==='tail-baseline')state.brushPaintBaselineByEdit.set(parent,new Map([[1,values[3]]]));
    if(setup==='tail-baseline')state.brushPaintBaselineByEdit.set(edit,new Map([[1,values[5]]]));}
   if(setup==='zero')edit.before.set(1,0);
   raw(l,values);const original=state.brushOriginalValue(edit,1);
   const expected=tool.paintLayerValue(d,l,edit,1,unpack(color),!!(flags&1),!!(flags&2));
   tokens.push(current,+(original!==undefined),original??0,color,flags,expected);paintCount++;
  }
  tokens.push(values.length*values.length*3);
  for(const destination of values)for(const value of values)for(const before of [undefined,0,values[2]]){
   raw(l,values);const edit=beginPixelEdit(l.id);if(before!==undefined)edit.before.set(1,before);
   const actualCurrent=model.readLayerPacked(d,l,1);
   tokens.push(destination,value,actualCurrent,+(before!==undefined),before??0,tool.compositeSelectionPixelOver(d,l,destination,value),tool.compositeSelectionPixelForEdit(d,l,edit,1,value));selectionCount++;
  }
 }
 // Same 65,536 alpha pairs and PRNG as legacy tools-pixel-edit.test.ts.
 const d=model.createDocument('alpha oracle',1,1,'rgba'),l=d.layers[0];let seed=123456789;
 const rgb=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed&0xffffff;};tokens.push(65536);
 for(let a=0;a<256;a++)for(let b=0;b<256;b++){const value=((a<<24)|rgb())>>>0,destination=((b<<24)|rgb())>>>0;tokens.push(destination,value,tool.compositeSelectionPixelOver(d,l,destination,value));}
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,tokens.join(' ')+'\n');
 console.log(`${contexts} contexts, ${writeCount} writes/runs, ${paintCount} brush baselines, ${selectionCount} selection edits and 65536 alpha pairs generated from actual legacy modules`);
})().catch(e=>{console.error(e);process.exitCode=1;});
