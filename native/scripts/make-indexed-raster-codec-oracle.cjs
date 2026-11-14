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

// Exact bytes and decoder transfer views from unchanged legacy modules.
(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const {encodeSparseRasterData,encodeRuntimeRasterData}=await imp('project-format-raster.ts');
 const {createDocument}=await imp('document-model.ts');
 const {encodeProject}=await imp('project-format-encode.ts');
 const {decodeProject}=await imp('project-format-decode.ts');
 const {historyDocumentTransferView,historyDocumentBytes}=await imp('local-history-delta.ts');
 const {zipSync,unzipSync,strFromU8,strToU8}=await import('fflate');
 const hex=b=>Buffer.from(b.buffer,b.byteOffset,b.byteLength).toString('hex');
 const packed=p=>new Uint8ClampedArray(p.flatMap(v=>[v&255,(v>>>8)&255,(v>>>16)&255,v>>>24]));
 const array=(p,f)=>f==='indexed'?new Uint32Array(p):packed(p);
 fs.mkdirSync(out,{recursive:true});const codecs=[],histories=[];
 const dimensions=[[1,1],[2,3],[6,1],[7,1],[63,65],[64,64],[65,63],[65,65],[130,66],[129,129]];
 for(const format of ['rgba','indexed'])for(const [w,h] of dimensions)for(let pattern=0;pattern<7;pattern++){
  const words=Array(w*h).fill(0);
  if(pattern===1)words[words.length-1]=format==='indexed'?19:0x00112233;
  if(pattern===2)words.fill(0xffffffff);
  if(pattern===3)for(let i=0;i<words.length;i+=67)words[i]=(i*1234567+1)>>>0;
  if(pattern===4){words[0]=7;words[words.length-1]=0x80000000;}
  if(pattern===5)for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x>=64&&y>=64)words[y*w+x]=0x01020304;
  if(pattern===6){words[Math.min(words.length-1,64)]=0x000000ff;words[words.length-1]=0xffffffff;}
  const pixels=array(words,format),encoded=encodeSparseRasterData(pixels,format,w,h);
  const runtime=encodeRuntimeRasterData({kind:'sparse-tiles-v1',format,width:w,height:h,tileSize:64,data:new Uint8Array(0),tileOffsets:new Int32Array(Math.ceil(w/64)*Math.ceil(h/64)),visibleBounds:null});
  codecs.push({format,width:w,height:h,words,encoding:encoded.encoding,hex:hex(encoded.data),emptyHex:hex(runtime.data)});
 }
 for(const mode of ['rgba','grayscale','indexed'])for(const layout of ['raw','sparse','empty'])for(const level of [0,6])for(const pad of [0,1,2,3]){
  const w=layout==='raw'?3:130,h=layout==='raw'?2:66,d=createDocument('history raster',w,h,mode,false);
  d.palette=[{id:0,name:'clear',color:{r:0,g:0,b:0,a:0}},{id:7,name:'ink',color:{r:32,g:64,b:96,a:255}},{id:19,name:'half',color:{r:80,g:90,b:100,a:128}}];d.paletteOrder=[0,7,19];d.paletteSlots=[0,7,19];d.nextColorId=20;
  const format=mode==='indexed'?'indexed':'rgba',words=Array(w*h).fill(0);if(layout!=='empty'){words[0]=format==='indexed'?7:0xff604020;words[words.length-1]=format==='indexed'?19:0x80645a50;}
  const pixels=array(words,format);d.layers[0].pixels=pixels;d.animation.cels[0].surface.pixels=pixels;
  d.animation.frames.push({id:'frame-two',duration:100});const first=d.animation.cels[0];d.animation.cels.push({...first,id:'cel-two',frameId:'frame-two',surface:{...first.surface,pixels}});
  const files=unzipSync(encodeProject(d,{includePreview:false})),m=JSON.parse(strFromU8(files['manifest.json']));
  const name='raw'+('x'.repeat(pad))+'.bin',encoded=layout==='raw'?{data:new Uint8Array(pixels.buffer),encoding:'raw'}:encodeSparseRasterData(pixels,format,w,h);
  for(const s of [m.document.layers[0],...m.document.animation.cels]){s.dataFile=name;s.dataEncoding=encoded.encoding;}
  const archive=zipSync({[name]:encoded.data,'manifest.json':strToU8(JSON.stringify(m))},{level});
  const decoded=historyDocumentTransferView(decodeProject(archive));
  const surfaces=[...decoded.layers,...decoded.animation.cels.filter(c=>c.surface).map(c=>c.surface)];
  const fragment={layers:[],surfaces:surfaces.map(s=>({pixels:s.pixels,...(s.runtimeRaster?{runtimeRaster:s.runtimeRaster}:{})}))};
  const file=`history-${mode}-${layout}-${level}-${pad}.moonsprite`;fs.writeFileSync(path.join(out,file),archive);
  const spec=s=>({pixelType:s.pixels.constructor.name,pixelHex:hex(s.pixels),runtime:s.runtimeRaster?{format:s.runtimeRaster.format,width:s.runtimeRaster.width,height:s.runtimeRaster.height,tileSize:s.runtimeRaster.tileSize,data:hex(s.runtimeRaster.data),tileOffsets:hex(s.runtimeRaster.tileOffsets),visibleBounds:s.runtimeRaster.visibleBounds}:null});
  histories.push({file,cost:historyDocumentBytes(fragment),surfaces:surfaces.map(spec),samePixels:surfaces.flatMap(a=>surfaces.map(b=>a.pixels===b.pixels)),sameRuntime:surfaces.flatMap(a=>surfaces.map(b=>!!a.runtimeRaster&&a.runtimeRaster===b.runtimeRaster))});
 }
 // One file with two typed interpretations must retain distinct decode keys.
 for(const level of [0,6]){
  const d=createDocument('mixed history',2,2,'rgba',false);const words=[0,7,19,0xffffffff],pixels=packed(words);d.layers[0].pixels=pixels;d.animation.cels[0].surface.pixels=pixels;
  const files=unzipSync(encodeProject(d,{includePreview:false})),m=JSON.parse(strFromU8(files['manifest.json'])),a=m.document.animation;
  a.frames.push({id:'frame-two',duration:100});a.cels.push({...a.cels[0],id:'mixed-two',frameId:'frame-two',format:'indexed'});
  for(const s of [m.document.layers[0],...a.cels]){s.width=2;s.height=2;s.dataFile='mixed.bin';s.dataEncoding='raw';}
  const archive=zipSync({'mixed.bin':new Uint8Array(pixels.buffer),'manifest.json':strToU8(JSON.stringify(m))},{level});const decoded=historyDocumentTransferView(decodeProject(archive));const surfaces=[...decoded.layers,...decoded.animation.cels.map(c=>c.surface)],fragment={layers:[],surfaces:surfaces.map(s=>({pixels:s.pixels}))};const file=`history-mixed-${level}.moonsprite`;fs.writeFileSync(path.join(out,file),archive);
  histories.push({file,cost:historyDocumentBytes(fragment),surfaces:surfaces.map(s=>({pixelType:s.pixels.constructor.name,pixelHex:hex(s.pixels),runtime:null})),samePixels:surfaces.flatMap(a=>surfaces.map(b=>a.pixels===b.pixels)),sameRuntime:surfaces.flatMap(a=>surfaces.map(b=>false))});
 }
 fs.writeFileSync(path.join(out,'oracle.json'),JSON.stringify({codecs,histories}));
 console.log(`${codecs.length} legacy raster encodings; ${histories.length} decoder storage/cost cases`);
})().catch(error=>{console.error(error);process.exitCode=1;});
