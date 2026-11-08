// Execute actual legacy creation/clipboard/sprite-sheet functions; only transport and input pattern are native-test adapters.
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
 const model=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-model.ts')));
 const {spriteSheetImportPlan,buildImportedSpriteSheet}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/sprite-sheet-import.ts')));
 const hash=bytes=>{let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619)>>>0;}return h;};
 const layouts=['horizontal','vertical','rows','columns'],rows=[];
 for(const [sw,sh] of [[1025,3],[3,1031],[32768,1],[1,32768],[2049,7]])for(let layout=0;layout<4;++layout)for(const partial of [false,true])for(const negative of [false,true]){
  const source=model.createDocument('Sheet source',sw,sh,'rgba',false),bytes=source.layers[0].pixels;
  for(let y=0;y<sh;++y)for(let x=0;x<sw;++x){const i=(y*sw+x)*4;bytes[i]=(x*17+y*3)&255;bytes[i+1]=(x*5+y*29)&255;bytes[i+2]=(x*11+y*7)&255;bytes[i+3]=[0,1,127,255][(x+y)%4];}
  source.animation.frames[0].duration=73;source.animation.frames.push({id:'frame-2',duration:137});source.animation.cels.push({...source.animation.cels[0],id:'cel-2',frameId:'frame-2',linkedCelId:source.animation.cels[0].id});source.animation.loop=false;
  const selection=sw===2049?{x:3,y:1,width:2044,height:5,mask:Uint8Array.from({length:2044*5},(_,i)=>i%3===1?0:1)}:undefined;
  const size=selection??source,options={layout:layouts[layout],x:negative?-1:0,y:negative?-1:0,width:Math.ceil(size.width/2),height:Math.ceil(size.height/2),paddingX:negative?1:0,paddingY:negative?1:0,partialTiles:partial,selection};
  const plan=spriteSheetImportPlan(source,options);if(!plan.count)continue;
  const result=await buildImportedSpriteSheet(source,options),hashes=result.animation.cels.map(c=>hash(c.surface.pixels));
  if(!rows.length)fs.writeFileSync(path.join(root,'native/build/large-sheet-import-legacy-case0.rgba'),result.animation.cels[0].surface.pixels);
  if(result.animation.loop!==false||result.animation.frames.some((f,i)=>f.duration!==(i?137:73)))throw Error('Unexpected legacy timing');
  rows.push(` {${[sw,sh,layout,options.x,options.y,options.width,options.height,options.paddingX,options.paddingY,Number(partial),Number(!!selection),plan.columns,plan.rows].join(',')},{${hashes.map(h=>h+'u').join(',')}}}`);
 }
 const plans=[];
 for(const [sw,sh,width,height,x,y,paddingX,paddingY,partial]of [[32768,1,32768,1,0,0,0,0,false],[1,32768,1,32768,0,0,0,0,false],[64,64,262144,1,0,0,0,0,true],[64,64,262145,1,0,0,0,0,true],[8192,8193,8192,8193,0,0,0,0,false],[100000,100000,1,1,0,0,0,0,false],[64,64,0,1,0,0,0,0,false],[64,64,2,2,0,0,-1,0,false],[2147483647,1,1,1,-262144,0,0,0,false],[8,8,16,16,0,0,0,0,false]])for(let layout=0;layout<4;++layout){
  const options={layout:layouts[layout],width,height,x,y,paddingX,paddingY,partialTiles:partial};let p;try{p=spriteSheetImportPlan({width:sw,height:sh},options);}catch{}
  plans.push(` {${[sw,sh,layout,x,y,width,height,paddingX,paddingY,Number(partial),p?1:0,p?.columns??0,p?.rows??0,p?.count??0].join(',')}}`);
 }
 const sources=['legacy/src/renderer/src/core/sprite-sheet-import.ts','legacy/src/renderer/src/store/workspace-sprite-sheet-import.ts','legacy/src/renderer/src/core/resource-policy.ts'];const snapshots=sources.map(p=>'// '+p+' SHA256 '+require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')).join('\n');
 fs.writeFileSync(output,'// Actual legacy buildImportedSpriteSheet / spriteSheetImportPlan results.\n'+snapshots+'\n#pragma once\n#include <vector>\n#include <cstdint>\nstruct LargeSheetImportOracle {int sw,sh,layout,x,y,width,height,px,py,partial,selection,columns,rows;std::vector<std::uint32_t> hashes;};\ninline const std::vector<LargeSheetImportOracle> largeSheetImportOracle={\n'+rows.join(',\n')+'\n};\nstruct SheetImportPlanOracle {int sw,sh,layout,x,y,width,height,px,py,partial,valid;std::int64_t columns,rows,count;};\ninline constexpr SheetImportPlanOracle sheetImportPlanOracle[]={\n'+plans.join(',\n')+'\n};\n');console.log(rows.length+' actual build cases, '+plans.length+' actual plan cases -> '+output);
})().catch(e=>{console.error(e);process.exitCode=1;});
