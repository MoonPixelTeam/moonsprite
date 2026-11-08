// Execute actual legacy ClipboardService latest-size priority and deferred readers.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,nextResolve){
  let target;
  if(specifier.startsWith('@/'))target=path.join(legacy,'src/renderer/src',specifier.slice(2));
  else if(specifier.startsWith('@shared/'))target=path.join(legacy,'src/shared',specifier.slice(8));
  else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if(target)for(const candidate of [target,target+'.ts',path.join(target,'index.ts')])if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return {url:pathToFileURL(candidate).href,shortCircuit:true};
  return nextResolve(specifier,context);
 },
 load(url,context,nextLoad){
  if(url.startsWith('file:')&&url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};
  return nextLoad(url,context);
 }
});

(async()=>{
 const {ClipboardService}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/store/clipboard-service.ts')));
 const rectangles=[[],[[0,0,30,30]],[[4,6,30,30],[40,-2,20,10]]];
 const metadata=mode=>mode===0?null:mode===1?{width:2,height:1}:{width:800,height:500};
 const image=mode=>mode===0?null:{width:2,height:1,data:new Uint8Array(mode===1?[255,0,0,255,0,0,0,0]:mode===2?[0,255,0,255,0,0,0,0]:[1,2,3,0,4,5,6,0])};
 const rows=[];
 for(let layers=0;layers<3;++layers)for(let base=0;base<3;++base)for(let system=0;system<4;++system)for(let baselineImage=0;baselineImage<3;++baselineImage)for(let currentImage=0;currentImage<4;++currentImage)for(const readImage of [false,true]){
  const service=new ClipboardService();if(layers)service.setLayers({layers:rectangles[layers].map(([offsetX,offsetY,width,height])=>({name:'layer',width,height,offsetX,offsetY,visible:true,locked:false,opacity:1,blendMode:'normal',pixels:new Uint8ClampedArray(width*height*4)})),groups:[]});
  if(base){service.captureLayerCopySystemBaselineSize(async()=>base===1?null:metadata(1));service.captureLayerCopySystemBaseline(async()=>image(baselineImage===2?3:baselineImage));}
  let reads=0;const size=await service.latestClipboardSize(async()=>{if(system===3)throw Error('busy');return metadata(system);},readImage?async()=>{++reads;if(currentImage===3)throw Error('unavailable');return image(currentImage);}:undefined);
  rows.push(` {${layers},${base},${system},${baselineImage},${currentImage},${readImage},${size?.width??0},${size?.height??0},${reads}}`);
 }
 const sources=['legacy/src/renderer/src/store/clipboard-service.ts','legacy/src/renderer/src/components/NewDocumentDialog.tsx','legacy/src-tauri/src/platform_clipboard.rs'];const snapshots=sources.map(p=>'// '+p+' SHA256 '+require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')).join('\n');
 fs.writeFileSync(output,'// Generated from actual ClipboardService.latestClipboardSize.\n'+snapshots+'\n#pragma once\nstruct NewClipboardOracle {int layers,baselineMetadata,systemMetadata,baselineImage,currentImage;bool readImage;int width,height,reads;};\ninline constexpr NewClipboardOracle newClipboardOracle[]={\n'+rows.join(',\n')+'\n};\n');console.log(rows.length+' actual legacy size/source/read-count cases -> '+output);
})().catch(e=>{console.error(e);process.exitCode=1;});
