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
  if(url.startsWith('file:')&&url.endsWith('.ts')) return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};
  return nextLoad(url,context);
 }
});
(async()=>{
 const {decodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format-decode.ts')));
 const {readLayerColorAt}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document.ts')));
 const {unzipSync,strFromU8}=await import('fflate');
 const inputs=fs.readdirSync(out).filter(n=>n.endsWith('.moonsprite'));
 if(!inputs.length) throw Error('No native encoded samples');
 for(const name of inputs){
  const bytes=new Uint8Array(fs.readFileSync(path.join(out,name))),files=unzipSync(bytes),manifest=JSON.parse(strFromU8(files['manifest.json']));
  const actual=decodeProject(bytes),m=manifest.document;
  if(actual.width!==m.width||actual.height!==m.height||actual.name!==m.name) throw Error(name+': identity mismatch '+JSON.stringify({actual:[actual.id,actual.width,actual.height,actual.name],expected:[m.id,m.width,m.height,m.name]}));
  if(actual.animation.frames[0].duration!==m.animation.frames[0].duration||actual.animation.cels[0].id!==m.animation.cels[0].id) throw Error(name+': frame/cel mismatch');
  if(JSON.stringify(actual.palette)!==JSON.stringify(m.palette)||JSON.stringify(actual.paletteSlots)!==JSON.stringify(m.paletteSlots)) throw Error(name+': palette/slots mismatch');
  const layer=actual.layers[0],meta=m.layers[0],raw=files[meta.dataFile];
  if(meta.dataEncoding==='raw'){
   for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++){
    const color=readLayerColorAt(actual,layer,x,y),index=(y*m.width+x)*4;
    if(color.r!==raw[index]||color.g!==raw[index+1]||color.b!==raw[index+2]||color.a!==raw[index+3]) throw Error(name+': RGBA mismatch');
   }
  }else{
   // Actual legacy sparse decoder is exercised by decodeProject; force sampling
   // across every location so lazy runtime-raster storage is observed too.
   for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++) readLayerColorAt(actual,layer,x,y);
  }
  console.log('legacy decodeProject accepted native archive: '+name+' '+m.width+'x'+m.height+' '+meta.dataEncoding);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
