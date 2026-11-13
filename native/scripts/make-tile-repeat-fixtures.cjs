const fs=require('fs'),vm=require('vm');const {stripTypeScriptTypes}=require('node:module');
const text=fs.readFileSync('legacy/src/renderer/src/core/tilemap.ts','utf8');
const body=text.slice(text.indexOf('export const normalizeTileRepeatMode'),text.indexOf('export const tileRepeatPreviewPlacements'));
const fit=text.slice(text.indexOf('export const tileRepeatFitZoom'),text.indexOf('export const cloneTilemapCell'));
const ctx=vm.createContext({});vm.runInContext('const positiveModulo=(value,size)=>((value%size)+size)%size;'+stripTypeScriptTypes((body+fit).replace(/^export /gm,''),{mode:'transform'})+';globalThis.api={wrap:wrapSelectionMaskForTileRepeat,map:tileRepeatMappedPointForCopies,fit:tileRepeatFitZoom};',ctx);
let seed=3491;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const rows=[];const masks=[];
const selection=s=>s?'SelectionMask{'+[s.x,s.y,s.width,s.height].join(',')+',{'+Array.from(s.mask||[]).join(',')+'}}':'std::nullopt';
for(let n=0;n<512;n++){const mode=['off','x','y','both'][n%4],w=1+rand()%19,h=1+rand()%13,x=(rand()%180-90)/2,y=(rand()%160-80)/2,outside=!!(n%3),v=ctx.api.map({x,y},w,h,mode,outside),angle=(n%17)*22.5,vw=20+rand()%800,vh=20+rand()%600;rows.push('{'+[w,h,n%4,x,y,outside?'true':'false',v?'true':'false',v?.local.x||0,v?.local.y||0,v?.offset.x||0,v?.offset.y||0,vw,vh,angle,ctx.api.fit(vw,vh,w,h,mode,angle)].join(',')+'}');const s={x:rand()%40-20,y:rand()%30-15,width:1+rand()%30,height:1+rand()%20};if(n%2)s.mask=Uint8Array.from({length:s.width*s.height},()=>rand()%3?1:0);masks.push('{'+[w,h,n%4,selection(s),selection(ctx.api.wrap(s,w,h,mode))].join(',')+'}');}
fs.writeFileSync('native/tests/fixtures/tile_repeat_legacy.h','#pragma once\nstruct RepeatCase{int w,h,mode;double x,y;bool outside,valid;double lx,ly;int ox,oy;double vw,vh,angle,zoom;};\ninline const RepeatCase repeatCases[]={\n'+rows.join(',\n')+'\n};\nstruct RepeatSelectionCase{int w,h,mode;std::optional<SelectionMask> input,expected;};\ninline const RepeatSelectionCase repeatSelectionCases[]={\n'+masks.join(',\n')+'\n};\n');console.log(rows.length+' mapping/fit and '+masks.length+' selection legacy cases');

const cellLine=text.slice(text.indexOf('export const tilemapCellLineIndices'),text.indexOf('export const beginTilemapEdit'));
vm.runInContext(stripTypeScriptTypes(cellLine.replace(/^export /gm,''),{mode:'transform'})+';globalThis.cellLine=tilemapCellLineIndices;',ctx);
const cellRows=[];
for(let n=0;n<256;n++){const columns=1+rand()%13,rows=1+rand()%11,from=rand()%(columns*rows),to=rand()%(columns*rows),mode=['off','x','y','both'][n%4];const expected=ctx.cellLine({columns,rows,cells:Array(columns*rows).fill(null)},from,to,mode);cellRows.push('{'+[columns,rows,from,to,n%4,'{'+expected.join(',')+'}'].join(',')+'}');}
fs.appendFileSync('native/tests/fixtures/tile_repeat_legacy.h','struct RepeatCellLineCase{int columns,rows,from,to,mode;std::vector<int> expected;};\ninline const RepeatCellLineCase repeatCellLineCases[]={\n'+cellRows.join(',\n')+'\n};\n');
console.log(cellRows.length+' actual legacy wrapped cell paths');

// Execute the actual legacy line generators and wrapping/splitting functions.
const selectionText=fs.readFileSync('legacy/src/renderer/src/core/selection.ts','utf8');
const pixelLine=fs.readFileSync('legacy/src/renderer/src/core/pixel-line.ts','utf8');
const raster=selectionText.slice(selectionText.indexOf('export const forEachRasterLinePoint'),selectionText.indexOf('/** Aseprite\'s continuous line rasterizer'));
const repeatLine=text.slice(text.indexOf('export const nearestTileRepeatEquivalent'),text.indexOf('export const tileRepeatFitZoom'));
vm.runInContext(stripTypeScriptTypes((pixelLine+raster+repeatLine).replace(/^export /gm,''),{mode:'transform'})+';globalThis.lineApi={nearest:nearestTileRepeatEquivalent,segments:tileRepeatLineSegments,raster:rasterLinePoints,balanced:balancedStairLinePoints};',ctx);
const point=p=>'{'+[p.x,p.y].join(',')+'}',vector=(v,encode)=>'{'+v.map(encode).join(',')+'}';
const nearestRows=[];
const nearest=(w,h,mode,p,r)=>nearestRows.push('{'+[w,h,['off','x','y','both'].indexOf(mode),point(p),point(r),point(ctx.lineApi.nearest(p,r,w,h,mode))].join(',')+'}');
for(let n=0;n<512;n++)nearest(1+rand()%19,1+rand()%13,['off','x','y','both'][n%4],{x:(rand()%401-200)/2,y:(rand()%401-200)/2},{x:(rand()%401-200)/2,y:(rand()%401-200)/2});
for(const mode of ['off','x','y','both'])for(const [w,h] of [[8,6],[0,6],[8,0],[-8,-6]])for(const tie of [-2.5,-1.5,-.5,.5,1.5,2.5])nearest(w,h,mode,{x:3,y:-2},{x:3+tie*w,y:-2-tie*h});
const lineRows=[];
for(let n=0;n<256;n++){
 const w=2+rand()%7,h=2+rand()%7,mode=['off','x','y','both'][n%4],balanced=!!(n%8>=4),from={x:rand()%(w*5)-w*2,y:rand()%(h*5)-h*2},to={x:rand()%(w*5)-w*2,y:rand()%(h*5)-h*2};
 const algorithm=balanced?'balanced':'raster',points=ctx.lineApi[algorithm](from,to),segments=ctx.lineApi.segments(from,to,w,h,mode,algorithm),paint=segments.flatMap(s=>ctx.lineApi[algorithm](s.from,s.to));
 lineRows.push('{'+[w,h,n%4,balanced?'true':'false',point(from),point(to),vector(points,point),vector(segments,s=>'{'+[point(s.from),point(s.to),s.fromProgress,s.toProgress].join(',')+'}'),vector(paint,point)].join(',')+'}');
}
fs.appendFileSync('native/tests/fixtures/tile_repeat_legacy.h','struct RepeatNearestCase{int w,h,mode;repeat::Point point,reference,expected;};\ninline const RepeatNearestCase repeatNearestCases[]={\n'+nearestRows.join(',\n')+'\n};\nstruct RepeatLineCase{int w,h,mode;bool balanced;repeat::Point from,to;std::vector<repeat::Point> points;std::vector<repeat::LineSegment> segments;std::vector<repeat::Point> paint;};\ninline const RepeatLineCase repeatLineCases[]={\n'+lineRows.join(',\n')+'\n};\n');
console.log(nearestRows.length+' nearest equivalents and '+lineRows.length+' actual legacy split line paths');
