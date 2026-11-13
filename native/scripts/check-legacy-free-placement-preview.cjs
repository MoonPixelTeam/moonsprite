// Execute the actual legacy renderer with a recording Canvas adapter. No legacy
// files are modified. The adapter supplies an RGBA32 normal-composite fixture;
// this verifies decisions and colors, not browser antialiasing or other formats.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, 'legacy/src/renderer/src', name), 'utf8');
const bare = code => stripTypeScriptTypes(code.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, ''), { mode: 'transform' });
const context = vm.createContext({ assert });
vm.runInContext('const BLEND_MODES=["normal","multiply"];', context);
vm.runInContext(bare(read('core/free-tile.ts')), context);
const raster = read('core/raster.ts');
vm.runInContext(bare(raster.slice(raster.indexOf('export const clampByte'), raster.indexOf('const blendChannel'))), context);
const source = read('core/free-tile-document.ts');
vm.runInContext(bare(source.slice(source.indexOf('export const freeTileSourceForId'), source.indexOf('export const freeTileSourceOwnerForId'))), context);
vm.runInContext(bare(read('components/canvas-render-free-tile-brush.ts')), context);
vm.runInContext(`
const freeTileSourcesForLayer=(document,layer)=>freeTileSourceRefs(layer.freeTileSources,document.tilesets);
const activeFreeTileCelTarget=document=>document.target;
const freeTileInstanceAtDocumentPoint=(target,x,y)=>freeTileInstanceAtPoint(target.freeTiles,target.sources,x,y,target.surface.offsetX,target.surface.offsetY);
const readTilesetTilePixels=set=>set.pixels;
const resolveLayerCanvasColor=(_document,_layer,color)=>color;
const readLayerColorAt=()=>({r:0,g:0,b:0,a:0});
const deviceAlignedPixelRect=(ox,oy,z,x,y)=>({x:ox+x*z,y:oy+y*z,width:z,height:z});
const layerMaskDisplayColor=color=>color;
const relativeLuminanceColor=color=>color;
const transparencyColorAt=()=>({r:192,g:192,b:192,a:255});
const selectionContains=(s,x,y)=>Boolean(s&&x>=s.x&&y>=s.y&&x<s.x+s.width&&y<s.y+s.height&&(!s.mask||s.mask[(y-s.y)*s.width+x-s.x]===1));
const alignCanvasStrokePath=()=>{};
class CanvasAdaptiveOutline{include(){} stroke(c){c.stroke();}}
let checked=0;
function run(overrides={}){
 const pixels=new Uint8ClampedArray([255,0,0,255,255,0,0,128,0,0,0,0,0,255,0,255,0,0,0,0,0,0,255,255]);
 const set={id:'set',tileWidth:3,tileHeight:2,columns:1,rows:1,tileIds:['tile'],pixels};
 const src={id:'source',tileset:set,visible:false,locked:true,opacity:.25,blendMode:'multiply',offsetX:2,offsetY:-1};
 const instance={id:'instance',sourceId:src.id,x:2,y:4,rotation:1,flipHorizontal:true,locked:true};
 const layer={id:'layer',kind:'free-tile',format:'rgba',freeTileSources:[{...src,tilesetId:set.id}]};
 const target={layer,surface:{offsetX:0,offsetY:0},sources:[src],freeTiles:{instances:[instance]}};
 const document={width:16,height:12,colorMode:'rgba',pixelFormat:'rgba32',layers:[layer],tilesets:[set],target};
 const pointer={visible:true,point:{x:9,y:7},clientX:0,clientY:0};
 const session={freeTileMode:'paint',tool:'pencil',selectedTilesetId:set.id};
 const fills=[],outlines=[];const canvas={fillStyle:'',save(){},restore(){},fillRect(x,y,width,height){fills.push({x,y,width,height,color:this.fillStyle});},beginPath(){},rect(x,y,width,height){outlines.push({x,y,width,height});},stroke(){}};
 const args={currentActiveLayer:layer,currentSession:session,document,session,brushPreviewMode:'full',brushEdgeThickness:1,canRenderToolPreview:true,inputRef:{current:{spaceHeld:false,pointer,sampling:false}},drag:null,drawingBrushPreviewEnabled:true,repeatedDocumentPointsAt:()=>({local:pointer.point}),paintSelectionForDrag:()=>null,repeatCopies:[{x:0,y:0,originX:0,originY:0,fromX:0,fromY:0,toX:16,toY:12}],context:canvas,clipCanvasCopy(){},isolatedLayerMask:null,compositePointReplacementSampler:(_x,_y,pixel)=>blendOver({r:32,g:64,b:128,a:255},pixel),view:{zoom:1,relativeLuminance:false},deviceScale:{x:1,y:1},checkerboard:{},sampleCompositeForPreview(){},activeTheme:{}};
 Object.assign(args,overrides);if(overrides.prepare)overrides.prepare({args,session,pointer,document,set,src,instance});
 renderCanvasFreeTileBrush(args);checked++;return {fills,outlines};
}
const full=run();assert.equal(full.fills.length,8);assert.equal(full.outlines.length,0);
assert.equal(full.fills[1].color,'rgb(255 0 0 / 1)');assert.equal(full.fills[3].color,'rgb(144 32 64 / 1)');
assert.equal(full.fills[1].x,8);assert.equal(full.fills[1].y,6);
for(const mode of ['none','edge','full','full-edge'])for(const drawing of [false,true]){
 const result=run({brushPreviewMode:mode,drag:drawing?{kind:'free-tile-draw',freeTileSourceId:'source'}:null});
 assert.equal(result.fills.length,mode!=='none'&&!drawing&&mode!=='edge'?8:0);
 assert.equal(result.outlines.length,mode==='edge'||mode==='full-edge'?1:0);
}
for(const key of ['spaceHeld','sampling'])assert.equal(run({prepare:({args})=>{args.inputRef.current[key]=true;}}).fills.length,0);
assert.equal(run({canRenderToolPreview:false}).fills.length,0);
assert.equal(run({prepare:({pointer})=>{pointer.visible=false;}}).fills.length,0);
assert.equal(run({prepare:({session})=>{session.selectedTilesetId='missing';}}).fills.length,0);
assert.equal(run({drag:{kind:'move'}}).fills.length,0);
assert.equal(run({drag:{kind:'free-tile-draw',freeTileSourceId:'source'},drawingBrushPreviewEnabled:false,brushPreviewMode:'edge'}).outlines.length,0);
assert.equal(run({brushPreviewMode:'edge',paintSelectionForDrag:()=>({x:0,y:0,width:1,height:1})}).outlines.length,1);
assert.equal(run({brushPreviewMode:'edge',drag:{kind:'free-tile-draw',freeTileSourceId:'source'},paintSelectionForDrag:()=>({x:0,y:0,width:1,height:1})}).outlines.length,0);
assert.equal(run({prepare:({set})=>set.pixels.fill(0)}).outlines.length,1);
const hit=run({prepare:({session,pointer})=>{session.tool='eraser';pointer.point={x:1,y:6};}});
assert.equal(hit.fills.length,0);assert.equal(hit.outlines.length,1);assert.equal(JSON.stringify(hit.outlines[0]),JSON.stringify({x:1,y:6,width:2,height:3}));
assert.equal(run({prepare:({session,pointer,instance})=>{session.tool='eraser';pointer.point={x:1,y:6};instance.visible=false;}}).outlines.length,0);
assert.equal(run({prepare:({session})=>{session.tool='eraser';}}).outlines.length,0);
const repeated=run({repeatCopies:[0,1,2].map(x=>({x,y:0,originX:x*16,originY:0,fromX:0,fromY:0,toX:16,toY:12}))});assert.equal(repeated.fills.length,24);
globalThis.result={checked,opaque:full.fills[1],half:full.fills[3],eraserBounds:hit.outlines[0]};
`, context);
console.log(JSON.stringify(context.result, null, 2));
