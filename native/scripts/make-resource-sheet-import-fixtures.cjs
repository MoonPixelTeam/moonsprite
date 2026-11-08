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
 const model=await load('document-model'),animation=await load('animation'),tiles=await load('tilemap'),free=await load('free-tile');
 const {buildImportedSpriteSheet}=await load('sprite-sheet-import');
 const assert=require('assert/strict'),storage=new Map();global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};global.window={moonSprite:{getResourceInfo:async()=>({freeBytes:2**40})}};
 const {sessionFromDocument}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/store/workspace-session.ts'))),{createSpriteSheetImportCommands}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/store/workspace-sprite-sheet-import.ts')));
 const hash=bytes=>{let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619)>>>0;}return h;};
 const rows=[],layouts=['horizontal','vertical','rows','columns'];
 for(let kind=0;kind<2;++kind)for(let linked=0;linked<2;++linked)for(let appearance=0;appearance<3;++appearance)for(let selected=0;selected<2;++selected)for(let layout=0;layout<4;++layout){
  const d=model.createDocument('Resource sheet',6,4,'rgba',false),l=d.layers[0],c=d.animation.cels[0];
  const set=tiles.createBlankTileset('sheet-set','Source',2,2,'sheet-tile',1);tiles.writeTilesetTilePixels(set,'sheet-tile',new Uint8ClampedArray([255,0,0,255,0,255,0,128,0,0,255,255,99,88,77,0]));d.tilesets=[set];
  l.kind=kind?'free-tile':'tilemap';l.visible=appearance!==1;c.opacity=appearance===2?.5:1;
  if(!kind){l.tilemapTilesetId=set.id;c.tilemap={tileWidth:2,tileHeight:2,columns:3,rows:2,cells:Array.from({length:6},(_,i)=>i%3===1?null:{tilesetId:set.id,tileId:'sheet-tile',rotation:i%4,flipHorizontal:i%2===0,flipVertical:i===3})};c.surface=tiles.renderTilemapSurface(c.tilemap,d.tilesets,'rgba');}
  else{l.freeTileSetId='sheet-free';l.freeTileSources=[{id:'sheet-source',name:'Source',tilesetId:set.id,visible:true,locked:false,opacity:1,blendMode:'normal',offsetX:-1,offsetY:0}];c.freeTiles={instances:[{id:'one',sourceId:'sheet-source',x:1,y:1},{id:'two',sourceId:'sheet-source',x:4,y:2,flipHorizontal:true,rotation:1,opacity:.5},{id:'hidden',sourceId:'sheet-source',x:2,y:0,visible:false}]};c.surface=free.renderFreeTileSurface(c.freeTiles,free.freeTileSourceRefs(l.freeTileSources,d.tilesets),'rgba',6,4);}
  d.animation.frames[0].duration=73;d.animation.frames.push({id:'frame-2',duration:137});d.animation.cels.push({...c,id:'cel-2',frameId:'frame-2',...(linked?{linkedCelId:c.id}:{surface:{...c.surface,pixels:c.surface.pixels.slice()}})});d.animation.loop=false;animation.refreshActiveAnimationFrame(d);if(linked){d.animation.activeFrameId='frame-2';animation.refreshActiveAnimationFrame(d);}
  const selection=selected?{x:1,y:-1,width:4,height:4,mask:Uint8Array.from({length:16},(_,i)=>i%3===1?0:1)}:undefined;
  const options={layout:layouts[layout],x:-1,y:0,width:2,height:2,paddingX:1,paddingY:0,partialTiles:true,selection};const result=await buildImportedSpriteSheet(d,options);
  if(result.layers.length!==1||result.tilesets.length||result.groups.length||result.layers[0].kind||result.animation.cels.some(c=>c.tilemap||c.freeTiles||c.linkedCelId))throw Error('Legacy did not flatten resources');
  rows.push(` {${kind},${linked},${appearance},${selected},${layout},{${result.animation.cels.map(c=>hash(c.surface.pixels)+'u').join(',')}}}`);
  const originalSets=d.tilesets,originalLayers=d.layers,originalCels=d.animation.cels,originalPalette=d.palette.map(x=>({...x,color:{...x.color}}));const session=sessionFromDocument(d);session.selection=selection;session.selectionPivot={x:2.25,y:-1.5};const state={sessions:[session],activeId:d.id,message:'',commitFloatingPaste(){}};const commands=createSpriteSheetImportCommands({get:()=>state,set:patch=>Object.assign(state,patch),recording:{recordDocumentOperation(){}}});
  assert.equal(await commands.importSpriteSheet(d.id,options),true,state.message);assert.equal(session.history.position,1);assert.equal(d.tilesets.length,0);assert.equal(d.layers[0].kind,undefined);assert.deepEqual(d.animation.cels.map(c=>hash(c.surface.pixels)),result.animation.cels.map(c=>hash(c.surface.pixels)));assert.deepEqual(d.palette,originalPalette);assert.equal(session.selection,null);
  session.history.undo();assert.equal(d.layers[0],originalLayers[0]);assert.equal(d.tilesets[0],originalSets[0]);assert.equal(d.animation.cels[0],originalCels[0]);assert.equal(d.width,6);assert.equal(d.height,4);assert.deepEqual(session.selectionPivot,{x:2.25,y:-1.5});session.history.redo();assert.equal(d.tilesets.length,0);assert.equal(session.selectionPivot,null);
 }
 const sources=['legacy/src/renderer/src/core/sprite-sheet-import.ts','legacy/src/renderer/src/core/tilemap.ts','legacy/src/renderer/src/core/free-tile.ts','legacy/src/renderer/src/core/animation.ts','legacy/src/renderer/src/store/workspace-sprite-sheet-import.ts','legacy/src/renderer/src/store/workspace-document-history.ts'];
 const snapshots=sources.map(p=>'// '+p+' SHA256 '+require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')).join('\n');
 fs.writeFileSync(output,'// Actual legacy special-layer buildImportedSpriteSheet results.\n'+snapshots+'\n#pragma once\n#include <cstdint>\n#include <vector>\nstruct ResourceSheetOracle {int kind,linked,appearance,selected,layout;std::vector<std::uint32_t> hashes;};\ninline const std::vector<ResourceSheetOracle> resourceSheetOracle={\n'+rows.join(',\n')+'\n};\n');console.log(rows.length+' actual legacy resource imports -> '+output);
})().catch(e=>{console.error(e);process.exitCode=1;});
