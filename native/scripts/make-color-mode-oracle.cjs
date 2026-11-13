// Evaluate unchanged legacy functions, keeping only their dependency slices.
// Output is a line-oriented test input; no application or user data is touched.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,'legacy/src/renderer/src/core',name),'utf8');
const bare=source=>stripTypeScriptTypes(source.replace(/^import .*\r?\n/gm,'').replace(/^export /gm,''),{mode:'transform'});
const context=vm.createContext({});
const evaluate=source=>vm.runInContext(bare(source),context);
const raster=read('raster.ts');
evaluate(raster.slice(raster.indexOf('export const TRANSPARENT'),raster.indexOf('export const blendOver')));
evaluate(raster.slice(raster.indexOf('const srgbToLinear'),raster.indexOf('export const applyRelativeLuminance')));
evaluate(read('pixel-format.ts'));
const model=read('document-model.ts');
evaluate(model.slice(model.indexOf('const maskGray'),model.indexOf('export function createLayerMask')));
evaluate(model.slice(model.indexOf('export const isLayerMask'),model.indexOf('\n',model.indexOf('export const isLayerMask'))));
evaluate(model.slice(model.indexOf('export const getPaletteEntry'),model.indexOf('\n',model.indexOf('export const getPaletteEntry'))));
evaluate(model.slice(model.indexOf('const visiblePaletteEntries'),model.indexOf('export function readLayerColor(')));
// Translation affects only the unused fallback name, not its color or ID.
evaluate(model.slice(model.indexOf('const transparentEntry'),model.indexOf('\n',model.indexOf('const transparentEntry'))));
vm.runInContext('const tr=()=>"";',context);
const preferences=read('file-preferences.ts');
const parseStart=preferences.indexOf('export function parsePixelFormat');
evaluate(preferences.slice(parseStart,preferences.indexOf('\n}',parseStart)+2));
const output=vm.runInContext(`(()=>{
 const rows=[];
 const modes=['rgba','indexed','grayscale'];
 const colors=[0,0x00123456,0x7f412111,0x80412111,0xffbf814f,0xffffffff,0xff000000];
 for(let value=0;value<256;++value)colors.push((value|(value<<8)|(value<<16)|(value<<24))>>>0);
 for(let r=0;r<256;r+=17)for(let g=0;g<256;g+=17)for(let b=0;b<256;b+=17)colors.push((r|(g<<8)|(b<<16)|(((r+g+b)%256)<<24))>>>0);
 for(let f=0;f<PIXEL_FORMATS.length;++f)for(const packed of colors){const color=unpackColor(packed);rows.push(['Q',f,packed,packColor(quantizePixelColor(color,PIXEL_FORMATS[f]))]);}
 const palettes=[
  {palette:[],paletteOrder:[]},
  {palette:[{id:0,color:TRANSPARENT},{id:3,color:unpackColor(0xff000000)},{id:7,color:unpackColor(0xff000002)},{id:9,color:unpackColor(0x80000000)},{id:12,color:unpackColor(0x00ffffff)}],paletteOrder:[7,3,7,99,9,12,0]},
  {palette:[{id:1,color:unpackColor(0xff0000ff)},{id:2,color:unpackColor(0xffff0000)},{id:8,color:unpackColor(0xff00ff00)},{id:2,color:unpackColor(0x80ffff00)}],paletteOrder:[2,1,8]},
  {palette:[{id:3,color:unpackColor(0xff000000)},{id:7,color:unpackColor(0xff000002)}],paletteOrder:[3,7]}
 ];
 for(let p=0;p<palettes.length;++p){const document=palettes[p];rows.push(['P',p,document.palette.length,...document.palette.flatMap(e=>[e.id,packColor(e.color)]),document.paletteOrder.length,...document.paletteOrder]);
  for(const packed of [...colors,1,2,3,7,8,9,12,99,0xff000001]){const color=unpackColor(packed);rows.push(['I',p,packed,paletteColorIdForCanvas(document,color)]);
   for(let m=0;m<modes.length;++m)for(const f of [0,2,5])for(let layerKind=0;layerKind<3;++layerKind){document.colorMode=modes[m];document.pixelFormat=PIXEL_FORMATS[f];const layer=layerKind===2?{format:'rgba',ownerKind:'cel',ownerId:'owner'}:{format:layerKind===1?'indexed':'rgba'};
    rows.push(['L',p,m,f,layerKind,packed,packColor(resolveLayerCanvasColor(document,layer,color)),normalizeLayerPackedValue(document,layer,packed)]);
   }
  }
 }
 for(const value of [...PIXEL_FORMATS,'RGBA32','yuv420','',null])rows.push(['F',value||'-',PIXEL_FORMATS.indexOf(parsePixelFormat(value))]);
 return rows.map(row=>row.join(' ')).join('\\n')+'\\n';
})()`,context);
if(!process.argv[2])throw new Error('Expected output path');
const target=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,output);
console.log(`Actual legacy color-mode oracle: ${output.split('\n').length-1} records`);
