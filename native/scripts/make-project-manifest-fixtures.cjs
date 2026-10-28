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

 const {decodeProject}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/project-format-decode.ts')));
 function inlineMask(m,r){const cel=m.document.animation.cels[0];cel.mask={id:'inline-mask',width:2,height:2,offsetX:-1.75,offsetY:1.9,dataFile:'masks/inline.u8',locked:true,autoLinkAnimationCels:true};r[cel.mask.dataFile]=new Uint8Array([0,128,255,64]);return cel.mask;}
 function maskVariant(name,mutate,verify,rejected=false){const m=structuredClone(manifest),r={...files};mutate(m,r);r['manifest.json']=strToU8(JSON.stringify(m));const encoded=zipSync(r);let decoded,error;try{decoded=decodeProject(encoded);}catch(e){error=e;}if(rejected){if(!error)throw new Error('Legacy accepted invalid mask fixture '+name);}else{if(error)throw error;if(verify&&!verify(decoded))throw new Error('Legacy mask oracle mismatch '+name);}fs.writeFileSync(path.join(out,name+'.moonsprite'),encoded);}
 maskVariant('inline-mask-u8',(m,r)=>inlineMask(m,r),d=>{const x=d.animation.layerMasks[0].mask;return x.id==='inline-mask'&&x.offsetX===-1&&x.offsetY===1&&x.locked&&x.autoLinkAnimationCels&&x.pixels[4]===128;});
 maskVariant('inline-mask-rgba',(m,r)=>{const mask=inlineMask(m,r);delete r[mask.dataFile];mask.offsetX=mask.offsetY=0;mask.dataFile='masks/inline.rgba';r[mask.dataFile]=new Uint8Array([12,34,56,0,128,128,128,255,0,0,0,255,255,255,255,255]);},d=>d.animation.layerMasks[0].mask.pixels[0]===0&&d.animation.layerMasks[0].mask.pixels[1]===0&&d.animation.layerMasks[0].mask.pixels[2]===0);
 function linkedInline(m,r){const root=inlineMask(m,r),animation=m.document.animation,first=animation.cels[0],second={...first,id:first.id+'-second',frameId:animation.frames[0].id+'-second',linkedCelId:first.id,mask:{...root,id:'inline-alias',linkedMaskId:root.id,dataFile:'masks/alias.u8'}};animation.frames.push({...animation.frames[0],id:second.frameId});animation.cels.push(second);r[second.mask.dataFile]=new Uint8Array([255,255,255,255]);return second;}
 maskVariant('inline-mask-linked',(m,r)=>linkedInline(m,r),d=>d.animation.layerMasks.length===2&&d.animation.layerMasks[1].mask.linkedMaskId==='inline-mask'&&d.animation.cels[1].linkedCelId===d.animation.cels[0].id);
 maskVariant('inline-mask-priority',(m,r)=>{const inline=inlineMask(m,r),a=m.document.animation,cel=a.cels[0];r[inline.dataFile]=new Uint8Array([1,2,3]);inline.linkedMaskId='missing-ignored';const winner={...inline,id:'winner',linkedMaskId:'group-root',dataFile:'masks/winner.u8'};r[winner.dataFile]=new Uint8Array([0,64,128,255]);a.layerMasks=[{layerId:cel.layerId,frameId:cel.frameId,mask:winner},{layerId:cel.layerId,frameId:cel.frameId,mask:{...inline,id:'duplicate-slot-ignored'}}];m.document.groups=[{id:'group',name:'group',visible:true,locked:false,opacity:1,blendMode:'normal'}];a.groupMasks=[{groupId:'group',frameId:cel.frameId,mask:{...winner,id:'group-root',linkedMaskId:null,dataFile:'masks/group.u8'}}];r['masks/group.u8']=new Uint8Array([255,128,64,0]);},d=>d.animation.layerMasks.length===1&&d.animation.layerMasks[0].mask.id==='winner'&&d.animation.layerMasks[0].mask.linkedMaskId==='group-root'&&d.animation.groupMasks.length===1);
 maskVariant('inline-mask-missing-shadow',(m,r)=>{const inline=inlineMask(m,r),cel=m.document.animation.cels[0];delete r[inline.dataFile];m.document.animation.layerMasks=[{layerId:cel.layerId,frameId:cel.frameId,mask:{...inline,id:'winner',dataFile:'masks/winner.u8'}}];r['masks/winner.u8']=new Uint8Array([0,64,128,255]);},d=>d.animation.layerMasks[0].mask.id==='winner');
 maskVariant('inline-mask-bad-rgba',(m,r)=>{const x=inlineMask(m,r);r[x.dataFile]=new Uint8Array([255,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255]);},null,true);
 maskVariant('inline-mask-bad-alpha',(m,r)=>{const x=inlineMask(m,r);r[x.dataFile]=new Uint8Array([128,128,128,128,0,0,0,255,0,0,0,255,0,0,0,255]);},null,true);
 maskVariant('inline-mask-missing-resource',(m,r)=>{const x=inlineMask(m,r);delete r[x.dataFile];},null,true);
 maskVariant('inline-mask-duplicate-id',(m,r)=>{const alias=linkedInline(m,r);alias.mask.id='inline-mask';delete alias.mask.linkedMaskId;},null,true);
 maskVariant('inline-mask-broken-link',(m,r)=>{inlineMask(m,r).linkedMaskId='missing';},null,true);
 maskVariant('inline-mask-cycle',(m,r)=>{const alias=linkedInline(m,r);m.document.animation.cels[0].mask.linkedMaskId=alias.mask.id;},null,true);
 maskVariant('inline-mask-schema20',(m,r)=>{inlineMask(m,r);m.schemaVersion=m.document.schemaVersion=20;},d=>d.schemaVersion===21);

 console.log('Generated project manifest fixtures through legacy encodeProject');
})().catch(e=>{console.error(e);process.exitCode=1;});
