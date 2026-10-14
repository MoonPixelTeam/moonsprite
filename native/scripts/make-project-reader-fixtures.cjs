// Invoke actual legacy sparse encoder and fflate, rather than copy an encoder into tests.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
function legacyDependency(name) {
  try {return require(path.join(root,'legacy/node_modules',name));}
  catch(error) {
    if(error.code!=='MODULE_NOT_FOUND') throw error;
    const store=path.join(root,'legacy/node_modules/.pnpm');
    const matches=fs.readdirSync(store).filter(entry=>entry.startsWith(name+'@'));
    if(matches.length!==1) throw error;
    return require(path.join(store,matches[0],'node_modules',name));
  }
}
const {stripTypeScriptTypes}=require('node:module');
const {zipSync,strToU8}=legacyDependency('fflate');
const source=fs.readFileSync(path.join(root,'legacy/src/renderer/src/core/project-format-raster.ts'),'utf8');
const start=source.indexOf('const tileContainsContent =');
const end=source.indexOf('export const encodeRuntimeRasterData =');
if(start<0 || end<start) throw Error('Legacy encoder source changed; review fixture extraction');
const code=`const SPARSE_TILE_SIZE=64,SPARSE_TILE_HEADER_BYTES=24,SPARSE_TILE_ENTRY_BYTES=16,SPARSE_TILE_MAGIC=0x3154534d;
const toU8=(array:any)=>new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
${source.slice(start,end)};`;
const context={exports:{},Uint8Array,Uint8ClampedArray,Uint32Array,DataView};
vm.runInNewContext(stripTypeScriptTypes(code.replace('export const encodeSparseRasterData', 'const encodeSparseRasterData'))+';exports.encodeSparseRasterData=encodeSparseRasterData;',context);
const encode=context.exports.encodeSparseRasterData;
const raw=new Uint8ClampedArray([10,20,30,255,90,80,70,0,1,2,3,128,255,254,253,252]);
const large=new Uint8ClampedArray(130*66*4);
large.set([3,4,5,255],(65*130+129)*4); // Partial edge tile, beyond the first tile row/column.
large.set([90,80,70,0],(64*130+128)*4); // Hidden RGB must survive.
const sparse=encode(large,'rgba',130,66),empty=encode(new Uint8ClampedArray(64*64*4),'rgba',64,64);
if(sparse.encoding!=='sparse-tiles-v1'||empty.encoding!=='sparse-tiles-v1') throw Error('Expected sparse encoder fixtures');
const manifest=strToU8(JSON.stringify({app:'MoonSprite',schemaVersion:21,document:{schemaVersion:21,width:130,height:66,colorMode:'rgba'}}));
const files={'manifest.json':manifest,'layers/raw.rgba':raw,'cels/edge.rgba.tiles':sparse.data,'cels/empty.rgba.tiles':empty.data};
fs.mkdirSync(out,{recursive:true});
for(const level of [0,6]) fs.writeFileSync(path.join(out,`legacy-${level}.zip`),zipSync(files,{level}));
fs.writeFileSync(path.join(out,'edge.tiles'),sparse.data);
fs.writeFileSync(path.join(out,'empty.tiles'),empty.data);
console.log('Generated stored/deflated ZIP and sparse fixtures from legacy encoder');
