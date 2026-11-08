// Execute unmodified legacy resize functions; adapters only construct fixtures.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]),legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,next){let target;if(specifier.startsWith('@/'))target=path.join(legacy,'src/renderer/src',specifier.slice(2));else if(specifier.startsWith('@shared/'))target=path.join(legacy,'src/shared',specifier.slice(8));else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);if(target)for(const candidate of [target,target+'.ts',path.join(target,'index.ts')])if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return {url:pathToFileURL(candidate).href,shortCircuit:true};return next(specifier,context);},
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};return next(url,context);}
});
(async()=>{
 const detector=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/image-scale-detection.ts')));
 let seed=71291;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const cases=[],pixelArrays=[];
 for(let n=0;n<180;n++){
  const scale=1+n%12,w=(3+n%9)*scale+n%3,h=(2+n%7)*scale+n%5,words=new Uint32Array(w*h);
  const colors=Array.from({length:16},()=>random());for(let y=0;y<h;y++)for(let x=0;x<w;x++){const sx=Math.floor((x+n%4)/scale),sy=Math.floor((y+n%3)/scale);let p=colors[(sx+sy*3)%colors.length];if(n%5===0&&random()%29===0)p=random();if(n%7===0)p&=0xffffff;words[y*w+x]=p;}
  if(n===0)words.fill(0xffffffff);const expected=detector.detectRepeatedPixelScale(new Uint8ClampedArray(words.buffer),w,h)||0;cases.push(`{${w},${h},${expected},imageScalePixels${n}}`);pixelArrays.push(`inline constexpr std::uint32_t imageScalePixels${n}[]={${Array.from(words,p=>p+'u').join(',')}};`);
 }
 const source='legacy/src/renderer/src/core/image-scale-detection.ts',hash=require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,source))).digest('hex');
 fs.writeFileSync(output,'// Executed unchanged '+source+' SHA256 '+hash+'\n#pragma once\n#include <vector>\n#include <cstdint>\nstruct ImageScaleOracle{int width,height,scale;const std::uint32_t* pixels;};\n'+pixelArrays.join('\n')+'\ninline const ImageScaleOracle imageScaleOracle[]={\n'+cases.join(',\n')+'\n};\n');console.log(cases.length+' actual legacy detection cases');
})().catch(e=>{console.error(e);process.exitCode=1;});
