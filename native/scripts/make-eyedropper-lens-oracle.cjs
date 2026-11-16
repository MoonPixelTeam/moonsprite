// Execute actual legacy magnifier helpers and the unmodified hook distortion loop.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]),legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,next){
  let target;
  if(specifier.startsWith('@/'))target=path.join(legacy,'src/renderer/src',specifier.slice(2));
  else if(specifier.startsWith('@shared/'))target=path.join(legacy,'src/shared',specifier.slice(8));
  else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if(target)for(const candidate of [target,target+'.ts',path.join(target,'index.ts')])if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile())return {url:pathToFileURL(candidate).href,shortCircuit:true};
  try{return next(specifier,context);}catch(error){
   if(specifier.startsWith('.')||specifier.startsWith('node:')||specifier.startsWith('file:'))throw error;
   const store=path.join(legacy,'node_modules/.pnpm'),name=specifier.split('/')[0],matches=fs.readdirSync(store).filter(n=>n.startsWith(name+'@'));
   if(matches.length!==1)throw error;
   return {url:pathToFileURL(require.resolve(path.join(store,matches[0],'node_modules',specifier))).href,shortCircuit:true};
  }
 },
 load(url,context,next){
  if(url.startsWith('file:')&&url.endsWith('.ts')){
   const input=fs.readFileSync(fileURLToPath(url),'utf8').replace('import { BrushGradientSample,','import { type BrushGradientSample,').replace(', BrushGradientSample,',', type BrushGradientSample,').replace(/, BrushMaskPoint(?=[, }])/g,', type BrushMaskPoint');
   return {format:'module',source:stripTypeScriptTypes(input,{mode:'transform'}),shortCircuit:true};
  }
  return next(url,context);
 }
});
(async()=>{
 const core=path.join(legacy,'src/renderer/src/core');
 const geometry=await import(pathToFileURL(path.join(core,'eyedropper-magnifier.ts')));
 const raster=await import(pathToFileURL(path.join(core,'raster.ts')));
 const hook=fs.readFileSync(path.join(legacy,'src/renderer/src/components/useCanvasEyedropperMagnifier.tsx'),'utf8');
 const begin=hook.indexOf('      const outputWidth = magnifierCanvas.width');
 const end=hook.indexOf('      context.putImageData(',begin);
 if(begin<0||end<begin)throw Error('Actual legacy distortion block not found');
 // Adapter supplies only the DOM canvas dimensions and already checker-composited
 // source. The nested loop, inverse mapping, dispersion and Uint8Clamped writes
 // run verbatim from the hook, without copying formulas into expected results.
 const distort=new Function('magnifierCanvas','size','dpr','magnifierCenter','magnifierTransform','sourceLeft','sourceTop','pixelScale','sourcePixelCount','displayPixels','eyedropperMagnifierContentPoint',hook.slice(begin,end)+'\nreturn distortedPixels;');
 const pixels=Array.from({length:625},(_,i)=>(0xff000000|((i*71%256)<<16)|((i*47%256)<<8)|(i*23%256))>>>0);
 const bytes=new Uint8ClampedArray(new Uint32Array(pixels).buffer),cases=[];
 for(const degrees of [0,90,-90,37.25,180])for(const mx of [false,true])for(const my of [false,true])for(const zoom of [0,2,16,64])for(const point of [{x:11.25,y:7.875},{x:-3.5,y:14.0625}]){
  const startX=Math.floor(point.x)-12,startY=Math.floor(point.y)-12,scale=geometry.eyedropperMagnifierPixelScale(zoom),transform=geometry.eyedropperMagnifierViewTransform(degrees,mx,my),center={x:102,y:102};
  const left=102+(startX-point.x)*scale,top=102+(startY-point.y)*scale;
  for(const distortion of [false,true]){
   let output;
   if(distortion)output=Array.from(new Uint32Array(distort({width:102,height:102},204,.5,center,transform,left,top,scale,25,bytes,geometry.eyedropperMagnifierContentPoint).buffer));
   else{
    output=[];
    for(let y=0;y<102;y++)for(let x=0;x<102;x++){
     const content=geometry.eyedropperMagnifierContentPoint({x:(x+.5)*2,y:(y+.5)*2},center,transform),sx=Math.floor((content.x-left)/scale),sy=Math.floor((content.y-top)/scale);
     output.push(sx<0||sy<0||sx>=25||sy>=25?0:pixels[sy*25+sx]);
    }
   }
   cases.push({degrees,mx,my,zoom,point,startX,startY,distortion,output});
  }
 }
 const placements=[];
 for(const size of [128,192,256,320])for(const bounds of [{width:800,height:700},{width:97,height:61},{width:256,height:256},{width:263,height:263}])for(const p of [{x:2,y:2},{x:799,y:699},{x:100,y:180},{x:400,y:500}])placements.push({size,bounds,point:p,...geometry.eyedropperMagnifierPosition(p,bounds,size)});
 const invalid=[NaN,Infinity,-Infinity,-2,0,1,8,100].map(zoom=>({zoom:Number.isFinite(zoom)?zoom:String(zoom),scale:geometry.eyedropperMagnifierPixelScale(zoom)}));
 const blends=[];for(const bottom of [0,0xffabcdef,0x40112233])for(const top of [0,0x80ffaa33,0xff050607])blends.push({bottom,top,output:raster.packColor(raster.blendOver(raster.unpackColor(bottom),raster.unpackColor(top)))>>>0});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({pixels,cases,placements,invalid,blends}));console.log(`${cases.length} actual legacy magnifier fields (${cases.length*10404} pixels), ${placements.length} placements, invalid zoom and alpha blends`);
})().catch(error=>{console.error(error);process.exitCode=1;});
