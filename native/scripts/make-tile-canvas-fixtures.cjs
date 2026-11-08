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
  if(url.endsWith('/store/document-file-service.ts'))return {format:'module',source:'export async function openDocumentFile(){throw new Error("File picker outside resource oracle");}',shortCircuit:true};
  if(url.startsWith('file:')&&url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};
  return nextLoad(url,context);
 }
});
(async()=>{
 const load=name=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core/'+name+'.ts')));
 const model=await load('document-model'),anim=await load('animation'),tiles=await load('tilemap'),free=await load('free-tile');
 const composite=await load('document-composite');const rows=[],trims=[],hash=bytes=>{let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619)>>>0;}return h;};
 const geometries=[[9,7,2,-1],[3,2,-1,-1],[4,4,0,0],[6,4,0,0],[2,3,11,-9],[3,7,-8,3],[7,2,1,0],[1025,1,-3,0]];
 const initialInstances=()=>[-3,-1,0,3,6].map((x,i)=>({id:'i'+i,sourceId:'source',x,y:i%3-1,rotation:i%4,flipHorizontal:i%2===0,visible:i!==2,locked:i===4}));
 const snapshot=d=>d.animation.frames.map(frame=>{
  const c=anim.resolveAnimationCel(d.animation,d.animation.cels.find(c=>c.frameId===frame.id)),s=c.surface;
  const payload=c.tilemap?c.tilemap.cells.map(c=>c?(c.rotation??0)*4+(c.flipHorizontal?1:0)+(c.flipVertical?2:0):-1):c.freeTiles.instances.flatMap(i=>[Number(i.id.slice(1)),i.x,i.y]);
  return `{${s.width},${s.height},${s.offsetX},${s.offsetY},${hash(s.pixels)}u,{${payload.join(',')}}}`;
 });
 for(let kind=0;kind<2;++kind)for(let linked=0;linked<2;++linked)for(let active=0;active<2;++active)for(let shape=0;shape<geometries.length;++shape)for(let trim=0;trim<2;++trim){
  const d=model.createDocument('Canvas resource',6,4,'rgba',false),l=d.layers[0],c=d.animation.cels[0];
  const set=tiles.createBlankTileset('set','Source',2,3,'tile',1);tiles.writeTilesetTilePixels(set,'tile',new Uint8ClampedArray([255,0,0,255,0,255,0,128,0,0,255,255,99,88,77,0,33,66,99,255,1,2,3,127]));d.tilesets=[set];l.kind=kind?'free-tile':'tilemap';
  if(!kind){l.tilemapTilesetId=set.id;c.tilemap={tileWidth:2,tileHeight:3,columns:3,rows:2,cells:Array.from({length:6},(_,i)=>i===1?null:{tilesetId:set.id,tileId:'tile',rotation:i%4,flipHorizontal:i%2===0,flipVertical:i===3})};c.surface=tiles.renderTilemapSurface(c.tilemap,d.tilesets,'rgba',-1,1);}
  else{l.freeTileSetId='free';l.freeTileSources=[{id:'source',name:'Source',tilesetId:set.id,visible:true,locked:false,opacity:1,blendMode:'normal',offsetX:-1,offsetY:1}];c.freeTiles={instances:initialInstances()};c.surface=free.renderFreeTileSurface(c.freeTiles,free.freeTileSourceRefs(l.freeTileSources,d.tilesets),'rgba',6,4,-1,1);}
  c.id='c0';d.animation.frames[0].id='f0';c.frameId='f0';d.animation.activeFrameId='f0';d.animation.frames.push({id:'f1',duration:137,disabled:true});
  const second={...c,id:'c1',frameId:'f1',surface:{...c.surface,offsetX:1,offsetY:-2,pixels:c.surface.pixels.slice()},tilemap:c.tilemap?{...c.tilemap,cells:c.tilemap.cells.slice()}:undefined,freeTiles:c.freeTiles?{instances:initialInstances()}:undefined};
  if(linked)second.linkedCelId='c0';d.animation.cels.push(second);anim.refreshActiveAnimationFrame(d);if(active){d.animation.activeFrameId='f1';anim.refreshActiveAnimationFrame(d);}
  if(shape===0&&trim===0)for(const all of [0,1]){const copy=structuredClone(d),b=all?composite.documentAnimationVisibleContentBounds(copy):composite.documentVisibleContentBounds(copy);if(b){model.resizeDocumentAt(copy,b.width,b.height,-b.x,-b.y,true);anim.resizeAnimationCelsAt(copy,-b.x,-b.y,true,6,4);}trims.push(` {${kind},${linked},${active},${b?.width??0},${b?.height??0},${b?-b.x:0},${b?-b.y:0},${all},{${snapshot(d).join(',')}},{${snapshot(copy).join(',')}}}`);}
  const before=snapshot(d),[w,h,dx,dy]=geometries[shape];model.resizeDocumentAt(d,w,h,dx,dy,!!trim);anim.resizeAnimationCelsAt(d,dx,dy,!!trim,6,4);const after=snapshot(d);
  rows.push(` {${kind},${linked},${active},${w},${h},${dx},${dy},${trim},{${before.join(',')}},{${after.join(',')}}}`);
 }
 const sources=['document-model','animation','tilemap','free-tile','document-composite-region','document-animation-content-bounds'].map(n=>'legacy/src/renderer/src/core/'+n+'.ts');
 const evidence=sources.map(s=>'// '+s+' SHA256 '+require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,s))).digest('hex')).join('\n');
 fs.writeFileSync(output,'// Actual legacy resizeDocumentAt + resizeAnimationCelsAt; no product function rewritten.\n'+evidence+'\n#pragma once\n#include <vector>\n#include <cstdint>\nstruct TileCanvasSurfaceOracle{int width,height,x,y;std::uint32_t hash;std::vector<int> payload;};\nstruct TileCanvasOracle{int kind,linked,active,width,height,dx,dy,trim;std::vector<TileCanvasSurfaceOracle> before,after;};\ninline const TileCanvasOracle tileCanvasOracle[]={\n'+rows.join(',\n')+'\n};\ninline const TileCanvasOracle tileTrimOracle[]={\n'+trims.join(',\n')+'\n};\n');
 console.log(rows.length+' canvas + '+trims.length+' current/all-frame trim actual legacy resource cases -> '+output);
})().catch(e=>{console.error(e);process.exitCode=1;});
