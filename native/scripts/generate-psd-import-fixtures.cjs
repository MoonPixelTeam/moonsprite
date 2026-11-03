// Reproduce legacy core/psd.test.ts with its actual MIT ag-psd dependency.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const {writePsdUint8Array,readPsd,initializeCanvas}=require('../../legacy/node_modules/ag-psd');
initializeCanvas((width,height)=>({width,height}),(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}));
const root=path.resolve(__dirname,'../tests/fixtures/psd-import');fs.mkdirSync(root,{recursive:true});
const image=(width,height,pixels)=>({width,height,data:new Uint8ClampedArray(pixels)});
const mask={left:1,top:1,right:3,bottom:2,defaultColor:255,imageData:image(2,1,[0,0,0,255,255,255,255,255])};
const children=[{name:'底层',imageData:image(3,2,[240,20,30,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])},{name:'Imported group',opacity:.8,blendMode:'screen',children:[{name:'空组',children:[]},{name:'Top',top:1,left:1,hidden:true,transparencyProtected:true,protected:{transparency:true,composite:true,position:true},opacity:.5,blendMode:'multiply',clipping:true,mask,imageData:image(2,1,[10,20,30,255,40,50,60,128])}]}];
for(const compress of [false,true]){
 const bytes=writePsdUint8Array({width:3,height:2,children,imageData:image(3,2,new Array(24).fill(0))},{generateThumbnail:false,compress});
 const parsed=readPsd(Uint8Array.from(bytes),{useImageData:true});if(parsed.children[1].children[1].imageData.data[7]!==128)throw Error('Fixture oracle mismatch');
 fs.writeFileSync(path.join(root,compress?'layered-zip.psd':'layered-rle.psd'),bytes);
}
fs.writeFileSync(path.join(root,'merged.psd'),writePsdUint8Array({width:2,height:1,imageData:image(2,1,[12,34,56,255,90,80,70,255])},{generateThumbnail:false}));
fs.writeFileSync(path.join(root,'group-mask.psd'),writePsdUint8Array({width:3,height:2,children:[{name:'masked',blendMode:'pass through',mask:{left:1,top:0,defaultColor:0,disabled:true,imageData:image(1,1,[128,128,128,255])},children:[{name:'paint',imageData:image(1,1,[200,50,70,255])}]}],imageData:image(3,2,new Array(24).fill(0))},{generateThumbnail:false}));
// Native plane adaptation follows psdReader.ts::readDataRaw/readDataZip.
const u16=n=>{const b=Buffer.alloc(2);b.writeUInt16BE(n);return b;},u32=n=>{const b=Buffer.alloc(4);b.writeUInt32BE(n>>>0);return b;},section=b=>Buffer.concat([u32(b.length),b]);
const raw=([a,b],depth)=>{const data=Buffer.alloc(2*depth/8);[a,b].forEach((n,i)=>depth===16?data.writeUInt16BE(n*257,i*2):data.writeFloatBE(n/255,i*4));return data;};
for(const depth of [8,16,32])for(const compression of [0,2,3]){
 const values=[[10,240],[20,50],[30,60],[128,255]];
 const channel=values.map(v=>{
  let data=depth===8?Buffer.from(v):raw(v,depth);
  if(compression>=2&&depth===32){const rearranged=Buffer.alloc(data.length);for(let x=0;x<2;x++)for(let b=0;b<4;b++)rearranged[b*2+x]=data[x*4+b];data=rearranged;}
  if(compression===3){if(depth===16){for(let x=1;x>=1;x--)data.writeUInt16BE((data.readUInt16BE(x*2)-data.readUInt16BE((x-1)*2))&65535,x*2);}else for(let x=data.length-1;x>=1;x--)data[x]=(data[x]-data[x-1])&255;}
  return Buffer.concat([u16(compression),compression>=2?zlib.deflateSync(data):data]);
 });
 const record=Buffer.concat([u32(0),u32(0),u32(1),u32(2),u16(4),...channel.map((data,i)=>Buffer.concat([u16(i===3?65535:i),u32(data.length)])),Buffer.from('8BIMnorm'),Buffer.from([255,0,0,0]),section(Buffer.concat([u32(0),u32(0),Buffer.from([1,65,0,0])]))]);
 const info=Buffer.concat([u16(1),record,...channel]);
 const bytes=Buffer.concat([Buffer.from('8BPS'),u16(1),Buffer.alloc(6),u16(3),u32(1),u32(2),u16(depth),u16(3),u32(0),u32(0),section(Buffer.concat([section(info),u32(0)])),u16(0),...values.slice(0,3).map(v=>depth===8?Buffer.from(v):raw(v,depth))]);
 const parsed=readPsd(Uint8Array.from(bytes),{useImageData:true});const p=parsed.children[0].imageData.data;const scale=depth===16?257:depth===32?1/255:1;if(Math.abs(p[0]/scale-10)>.01)throw Error('Plane oracle mismatch');
 fs.writeFileSync(path.join(root,`plane-${depth}-${compression}.psd`),bytes);
}
console.log('PSD legacy dependency fixtures generated:',root);
