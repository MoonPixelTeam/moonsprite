// Run unchanged legacy raster-image.ts in a real installed Chromium browser.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../..'),{chromium}=require(path.join(root,'legacy/node_modules/playwright'));
const source=stripTypeScriptTypes(fs.readFileSync(path.join(root,'legacy/src/renderer/src/core/raster-image.ts'),'utf8').replace(/^import .*$/gm,'').replace(/export /g,''));
const old=fs.readFileSync(path.join(root,'native/tests/fixtures/palette_image_legacy.h'),'utf8');
const cases=[...old.matchAll(/\{"([^" ]+)",\{([^}]*)\},(?:true|false),/g)].map(m=>({extension:m[1],bytes:m[2].split(',').filter(Boolean).map(Number)}));
function crc(b){let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function chunk(type,data){const out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);out.write(type,4);data.copy(out,8);out.writeUInt32BE(crc(out.subarray(4,-4)),out.length-4);return out;}
for(const [w,h] of [[1,1],[7,3],[513,5],[1025,3],[3,1025],[999,333],[670,100],[1072,160]]){
 const header=Buffer.alloc(13);header.writeUInt32BE(w);header.writeUInt32BE(h,4);header[8]=8;header[9]=6;
 const raw=Buffer.alloc((w*4+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const at=y*(w*4+1)+1+x*4;raw[at]=(x%17)*13;raw[at+1]=(y%7)*31;raw[at+2]=((x+y)%11)*19;raw[at+3]=[0,1,17,63,127,128,200,254,255][(x+y)%9];}
 cases.push({extension:'png',bytes:[...Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))])]});
}
(async()=>{
 const executables=[process.env.MOONSPRITE_PREVIEW_BROWSER,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
 const executablePath=executables.find(p=>fs.existsSync(p));if(!executablePath)throw new Error('No installed Chromium browser; no automatic download');
 // Native preview is CPU raster; Chromium GPU nearest sampling is device dependent.
 const browser=await chromium.launch({executablePath,headless:true,args:['--disable-gpu']});try{
 const page=await browser.newPage();const results=await page.evaluate(async({source,cases})=>{
  (0,eval)(source+'\nglobalThis.previewOracle=createRasterImagePreview;globalThis.previewMime=rasterImageMimeType;globalThis.tr=(x)=>x;');
  const results=[];for(const c of cases){try{const value=await globalThis.previewOracle(new Uint8Array(c.bytes),globalThis.previewMime('fixture.'+c.extension));const bitmap=await createImageBitmap(new Blob([value.preview],{type:'image/png'}));const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const pixels=context.getImageData(0,0,bitmap.width,bitmap.height).data;let hash=14695981039346656037n;for(let i=0;i<pixels.length;i+=4){const p=(pixels[i]|(pixels[i+1]<<8)|(pixels[i+2]<<16)|(pixels[i+3]<<24))>>>0;hash=BigInt.asUintN(64,(hash^BigInt(p))*1099511628211n);}results.push({ok:true,width:value.width,height:value.height,pw:bitmap.width,ph:bitmap.height,hash:hash.toString(),pixels:Array.from(pixels)});bitmap.close();}catch(e){results.push({ok:false});}}return results;
 },{source,cases});
 fs.writeFileSync(path.join(root,'native/build/recent-preview-browser-debug.json'),JSON.stringify(results));
 let out='#pragma once\n// Generated from actual legacy createRasterImagePreview in installed Chromium.\nstruct LegacyPreviewFixture {const char* extension;std::vector<std::uint8_t> bytes;bool accepted;int width,height,previewWidth,previewHeight;std::uint64_t hash;};\ninline const std::vector<LegacyPreviewFixture> legacyPreviewFixtures={\n';
 for(let i=0;i<cases.length;i++){const r=results[i],c=cases[i];out+='{"'+c.extension+'",{'+c.bytes.join(',')+'},'+r.ok+','+[r.width??0,r.height??0,r.pw??0,r.ph??0].join(',')+','+(r.hash??0)+'ull},\n';}
 out+='};\n';fs.writeFileSync(path.join(root,'native/tests/fixtures/recent_preview_legacy.h'),out);console.log(cases.length+' actual browser preview cases; accepted='+results.filter(x=>x.ok).length+' browser='+await browser.version());
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
