// Uses the actual legacy createDocument/encodeProject via Node's TypeScript loader.
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
// Execute the real legacy codec and slot normalizer; no native-shaped encoder.
(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const {createDocument}=await imp('document-model.ts');
 const {encodeProject}=await imp('project-format-encode.ts');
 const {decodeProject}=await imp('project-format-decode.ts');
 const {encodeSparseRasterData}=await imp('project-format-raster.ts');
 const {readSurfacePackedLocal}=await imp('runtime-raster.ts');
 const {normalizePaletteSlots}=await imp('palette-layout.ts');
 const {zipSync,unzipSync,strFromU8,strToU8}=await import('fflate');
 fs.mkdirSync(out,{recursive:true});const rows=[];
 const packed=s=>Array.from({length:s.width*s.height},(_,i)=>readSurfacePackedLocal(s,i%s.width,Math.floor(i/s.width)));
 const words=b=>Array.from({length:b.byteLength/4},(_,i)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(i*4,true));
 for(const mode of ['rgba','grayscale','indexed'])for(const sparse of [false,true])for(const level of [0,6])for(let layout=0;layout<5;++layout){
  const width=sparse?130:2,height=sparse?66:2,d=createDocument('indexed boundary',width,height,mode);
  d.palette=[{id:0,name:'transparent',color:{r:0,g:0,b:0,a:0}},{id:7,name:'blue',color:{r:41,g:121,b:255,a:255}},{id:19,name:'red',color:{r:255,g:0,b:0,a:255}}];
  d.nextColorId=20;d.paletteColumns=3;
  d.paletteOrder=layout===0?[0,7,19]:layout===1?[19,7,0,19]:layout===2?[7,0,19]:layout===3?[19,0,7]:[7,19,0];
  const sources=[[null,0,null,7,19,null],[19,null,0,19,7,null],[0,0,7,null,null,19],[null,null,null,null,null,null],[]];
  d.paletteSlots=normalizePaletteSlots(d.palette.map(e=>e.id),d.paletteOrder,sources[layout],3);
  const surface=d.animation.cels[0].surface;
  if(mode==='indexed'){surface.pixels[0]=7;surface.pixels[width*height-1]=19;}
  else {surface.pixels.set([41,121,255,255],0);surface.pixels.set([1,2,3,0],surface.pixels.length-4);}
  // Encode authoritative active storage through the same buffer as the layer.
  d.layers[0].pixels=surface.pixels;
  const resources=unzipSync(encodeProject(d,{includePreview:false})),m=JSON.parse(strFromU8(resources['manifest.json']));
  const raw=new Uint8Array(surface.pixels.buffer,surface.pixels.byteOffset,surface.pixels.byteLength);
  const encoded=sparse?encodeSparseRasterData(surface.pixels,surface.format,width,height):{data:raw,encoding:'raw'};
  if(sparse&&encoded.encoding!=='sparse-tiles-v1')throw Error('Expected sparse sample');
  for(const meta of [m.document.layers[0],m.document.animation.cels[0]]){resources[meta.dataFile]=encoded.data;meta.dataEncoding=encoded.encoding;}
  // Raw slot shapes exercise the actual decoder's normalization.
  m.document.paletteSlots=sources[layout];m.document.paletteOrder=d.paletteOrder;
  resources['manifest.json']=strToU8(JSON.stringify(m));const bytes=zipSync(resources,{level}),decoded=decodeProject(bytes);
  const name=`indexed-${mode}-${sparse?1:0}-${level}-${layout}`;
  fs.writeFileSync(path.join(out,name+'.moonsprite'),bytes);
  const actual=packed(decoded.animation.cels[0].surface);
  if(JSON.stringify(actual)!==JSON.stringify(words(raw)))throw Error(name+': legacy changed sample storage');
  rows.push({name,mode,format:surface.format,width,height,columns:decoded.paletteColumns,slots:decoded.paletteSlots,order:decoded.paletteOrder,pixels:actual});
 }
 // One raw file interpreted twice must have distinct format cache entries.
 // The second Cel is inactive and may be linked fallback metadata.
 for(const linked of [false,true])for(const mode of ['rgba','grayscale']){
  const d=createDocument('mixed format',2,2,mode),resources=unzipSync(encodeProject(d,{includePreview:false})),m=JSON.parse(strFromU8(resources['manifest.json']));
  const a=m.document.animation,first=a.cels[0],second={...first,id:'indexed-fallback',frameId:'inactive',format:'indexed'};
  if(linked)second.linkedCelId=first.id;
  a.frames.push({id:'inactive',duration:100});a.cels.push(second);
  for(const meta of [m.document.layers[0],first,second]){meta.dataEncoding='raw';meta.dataFile='mixed.words';}
  for(const key of Object.keys(resources))if(key!=='manifest.json')delete resources[key];
  resources['mixed.words']=new Uint8Array(16);resources['manifest.json']=strToU8(JSON.stringify(m));
  const name=`mixed-${mode}-${linked?1:0}`;const bytes=zipSync(resources);decodeProject(bytes);fs.writeFileSync(path.join(out,name+'.moonsprite'),bytes);
 }
 // Indexed sparse data with an RGBA tag, truncated data, and missing files.
 const base='indexed-indexed-1-0-0',resources=unzipSync(fs.readFileSync(path.join(out,base+'.moonsprite')));
 const m=JSON.parse(strFromU8(resources['manifest.json'])),file=m.document.animation.cels[0].dataFile;
 for(const failure of ['tag','truncated','missing']){
  const r=Object.fromEntries(Object.entries(resources).map(([k,v])=>[k,v.slice()]));
  if(failure==='tag')r[file][6]=1;else if(failure==='truncated')r[file]=r[file].slice(0,-1);else delete r[file];
  const bytes=zipSync(r);let rejected=false;try{decodeProject(bytes);}catch{rejected=true;}if(!rejected)throw Error('Legacy accepted '+failure);
  fs.writeFileSync(path.join(out,'reject-'+failure+'.moonsprite'),bytes);
 }
 fs.writeFileSync(path.join(out,'oracle.json'),JSON.stringify(rows));
 console.log(`Actual legacy indexed boundary: ${rows.length} storage/layout cases, 4 mixed-format cases and 3 corrupt cases`);
})().catch(e=>{console.error(e);process.exitCode=1;});
