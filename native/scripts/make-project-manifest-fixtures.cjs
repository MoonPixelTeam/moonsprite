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
 const {createDocument}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-model.ts')));
 const {encodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format-encode.ts')));
 const {unzipSync,zipSync,strFromU8,strToU8}=await import('fflate');
 const doc=createDocument('原生兼容样本',2,2,'rgba');
 const encoded=encodeProject(doc,{includePreview:false});
 fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'valid.moonsprite'),encoded);
 const files=unzipSync(encoded),manifest=JSON.parse(strFromU8(files['manifest.json']));
 function variant(name,mutate) {const copy=structuredClone(manifest),resources={...files};mutate(copy,resources);resources['manifest.json']=strToU8(JSON.stringify(copy));fs.writeFileSync(path.join(out,name+'.moonsprite'),zipSync(resources));}
 variant('future',m=>{m.schemaVersion=22;m.document.schemaVersion=22;});
 variant('unknown',m=>{m.document.futureCreativeSetting={mode:'preserve me'};});
 variant('broken-reference',m=>{m.document.animation.cels[0].frameId='absent';});
 variant('duplicate-frame',m=>{m.document.animation.frames.push({...m.document.animation.frames[0]});});
 variant('rgba',(_,r)=>{for(const key of Object.keys(r))if(key.endsWith('.rgba'))r[key]=new Uint8Array([10,20,30,255,90,80,70,0,1,2,3,128,255,254,253,252]);});
 variant('unknown-resource',(_,r)=>{r['unmigrated/custom.bin']=new Uint8Array([1,2,3]);});
 const invalid={...files,'manifest.json':strToU8('{broken json')};fs.writeFileSync(path.join(out,'syntax.moonsprite'),zipSync(invalid));
 console.log('Generated project manifest fixtures through legacy encodeProject');
})().catch(e=>{console.error(e);process.exitCode=1;});
