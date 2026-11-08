// Uses actual legacy document decoding/compositing via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
// Vite exposes these CommonJS properties as named imports; Node cannot infer
// UPNG's dynamic exports. Bridge its actual dependency without replacing it.
const upngPath=require.resolve('upng-js',{paths:[legacy]});
const upngBridge='data:text/javascript,'+encodeURIComponent(`import {createRequire} from 'node:module';const value=createRequire(${JSON.stringify(pathToFileURL(upngPath).href)})(${JSON.stringify(upngPath)});export const decode=value.decode,toRGBA8=value.toRGBA8;`);
registerHooks({
 resolve(specifier,context,nextResolve) {
  if(specifier==='upng-js')return {url:upngBridge,shortCircuit:true};
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
 const assert=require('node:assert/strict');
 const {decodeDocumentFile}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-files.ts')));
 const {compositeDocument}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-composite.ts')));
 let count=0;
 for(const row of fs.readFileSync(path.join(out,'oracle.tsv'),'utf8').trim().split(/\r?\n/)){
  const [name,w,h,expected]=row.split('\t');if(!/\.(png|gif|ase|aseprite|psd)$/i.test(name))continue;
  const doc=decodeDocumentFile(new Uint8Array(fs.readFileSync(path.join(out,name))),name);
  assert.equal(doc.width,Number(w),name+': width');assert.equal(doc.height,Number(h),name+': height');
  let hash=2166136261;for(const byte of compositeDocument(doc)){hash^=byte;hash=Math.imul(hash,16777619)>>>0;}
  assert.equal(hash,Number(expected),name+': actual legacy composite hash');++count;
 }
 assert.equal(count,32,'Eight raster/GIF sizes plus structured sizes within legacy format limits');
 console.log('Actual legacy decodeDocumentFile/compositeDocument accepted '+count+' native large input fixtures with complete pixel hashes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
