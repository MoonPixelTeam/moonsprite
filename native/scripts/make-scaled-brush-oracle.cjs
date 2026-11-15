// Uses actual legacy brush/history functions via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,nextResolve) {
  let target;
  if(specifier.startsWith('@/')) target=path.join(legacy,'src/renderer/src',specifier.slice(2));
  else if(specifier.startsWith('@shared/')) target=path.join(legacy,'src/shared',specifier.slice(8));
  else if(specifier.startsWith('.') && context.parentURL?.startsWith('file:')) target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);
  if(target) {for(const candidate of [target,target+'.ts',path.join(target,'index.ts')]) if(fs.existsSync(candidate)&&fs.statSync(candidate).isFile()) return {url:pathToFileURL(candidate).href,shortCircuit:true};}
  try{return nextResolve(specifier,context);}catch(error) {
   if(specifier.startsWith('.')||specifier.startsWith('node:')||specifier.startsWith('file:')) throw error;
   const store=path.join(legacy,'node_modules/.pnpm'),name=specifier.split('/')[0];
   const matches=fs.readdirSync(store).filter(n=>n.startsWith(name+'@'));
   if(matches.length!==1) throw error;
   const full=path.join(store,matches[0],'node_modules',specifier);
   return {url:pathToFileURL(require.resolve(full)).href,shortCircuit:true};
  }
 },
 load(url,context,nextLoad) {
  if(url.startsWith('file:')&&url.endsWith('.ts')) {
   // Node strips explicit type imports; legacy's bundler also erases these
   // two interface imports. This changes no executable legacy statement.
   const input=fs.readFileSync(fileURLToPath(url),'utf8').replace('import { BrushGradientSample,','import { type BrushGradientSample,').replace(', BrushGradientSample,',', type BrushGradientSample,').replace(/, BrushMaskPoint(?=[, }])/g,', type BrushMaskPoint');
   return {format:'module',source:stripTypeScriptTypes(input,{mode:'transform'}),shortCircuit:true};
  }
  return nextLoad(url,context);
 }
});


(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const model=await imp('document-model.ts'),history=await imp('history.ts');
 const {paintBrush,paintLine,brushMaskOffsets}=await imp('tools-brush.ts');
 const {brushStampDimensions:dimensions}=await imp('tools-pixel-edit.ts');
 const {unpackColor}=await imp('raster.ts');
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x400000ff},{id:65,color:0xff800080},{id:77,color:0x8000ff00},{id:89,color:0xffffffff}];
 const orders=[entries.map(e=>e.id),[19,7,41,53,65,77,89],[]];
 const images=[{name:'mask',width:3,height:2,intrinsicSize:false,coverage:[0,64,128,192,255,96]}, {name:'colored',width:2,height:3,intrinsicSize:false,coverage:[255,255,255,255,255,255],colors:[0,0x800000ff,0xff0000ff,0xffff0000,0xff00ff00,0x00123456]}, {name:'mapped',width:2,height:2,intrinsicSize:false,coverage:[255,255,255,255],colors:[0xff112233,0xff223344,0xff334455,0xff445566],paintColors:[0xffff0000,0x800000ff,0xff0000ff,0]}, {name:'intrinsic',width:3,height:2,intrinsicSize:true,coverage:[0,64,128,192,255,96]}];
 const cases=[],stamps=[];
 function imageFor(v){return {...v,id:'fixture',sourceX:2,sourceY:-1,coverage:new Uint8Array(v.coverage),colors:v.colors?new Uint32Array(v.colors):undefined,paintColors:v.paintColors?new Uint32Array(v.paintColors):undefined};}
 for(const variant of images)for(const mode of ['paint','pattern-source','pattern-target'])for(const angle of [0,37,90,-30.5])for(const size of [1,5,6]){
  const image=imageFor(variant),samples=[];
  // Repeat phases after more than four distinct keys to exercise legacy FIFO.
  for(const p of [{x:3,y:4},{x:-2,y:3},{x:4,y:-1},{x:5,y:5},{x:8,y:7},{x:3,y:4}]){
   const dim=dimensions(size,image,angle),points=brushMaskOffsets(size,'square','solid',1,p.x-Math.floor(dim.width/2),p.y-Math.floor(dim.height/2),image,undefined,0,mode,1,2,undefined,angle,true);
   const direct=brushMaskOffsets(size,'square','solid',1,p.x-Math.floor(dim.width/2),p.y-Math.floor(dim.height/2),imageFor(variant),undefined,0,mode,1,2,undefined,angle,true);
   const encode=values=>values.map(q=>({x:q.x,y:q.y,coverage:q.coverage,color:q.color===undefined?null:((q.color.a<<24)|(q.color.b<<16)|(q.color.g<<8)|q.color.r)>>>0}));
   samples.push({...p,width:dim.width,height:dim.height,points:encode(points),direct:encode(direct)});
  }
  stamps.push({variant,mode,angle,size,samples});
 }
 function run({format='indexed',variant=images[0],mode='paint',ink=0,opacity=50,color=0xff0000ff,angle=37,dynamic=false,palette=0,selection=false,symmetric=0,vary=false}){
  const w=20,h=16,d=model.createDocument('scaled modes',w,h,format,false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  const seed=Array.from({length:w*h},(_,i)=>format==='indexed'?[0,7,19,30,41,99][i%6]:[0,0xff0000ff,0xffff0000,0x800000ff,0x60112233,0x00123456][i%6]);
  const install=values=>{if(format==='indexed')l.pixels=new Uint32Array(values);else{l.pixels=new Uint8ClampedArray(values.length*4);for(let i=0;i<values.length;i++)for(let channel=0;channel<4;channel++)l.pixels[i*4+channel]=(values[i]>>>(channel*8))&255;}};
  const pixels=()=>Array.from({length:w*h},(_,i)=>model.readLayerPacked(d,l,i));install(seed);
  const initial=pixels(),image=imageFor(variant),firstSize=5,patternOrigin={x:4-Math.floor((variant.intrinsicSize?variant.width:firstSize)/2),y:4-Math.floor((variant.intrinsicSize?variant.height:firstSize)/2)};
  const select=selection?{x:2,y:2,width:13,height:11,mask:new Uint8Array(Array.from({length:143},(_,i)=>i%5?1:0))}:null;
  const axes={horizontal:!!(symmetric&1),vertical:!!(symmetric&2),rotational:!!(symmetric&16)},center={x:w/2,y:h/2};
  const samples=[{x:4,y:4,size:vary?3:5,angle,opacity},{x:7,y:4,size:vary?6:5,angle:vary?90:angle,opacity},{x:6,y:7,size:vary?4:5,angle:vary?-30:angle,opacity},{x:4,y:4,size:vary?3:5,angle,opacity}];
  const edit=history.beginPixelEdit(l.id),states=[];
  const stamp=(e,p)=>paintBrush(d,l,e,p.x,p.y,p.size,unpackColor(color),'square',select,'solid',1,image,undefined,0,mode,patternOrigin,axes,center,undefined,p.opacity/100,undefined,false,undefined,'off',undefined,p.angle,true,['simple','copy-alpha-color','lock-alpha'][ink]);
  stamp(edit,samples[0]);states.push(pixels());
  for(let i=1;i<samples.length;i++){
   const a=samples[i-1],b=samples[i];paintLine(d,l,edit,a.x,a.y,b.x,b.y,firstSize,unpackColor(color),select,'square','solid',1,image,undefined,0,mode,patternOrigin,'raster',axes,center,undefined,{fromSize:a.size,toSize:b.size,fromAngle:a.angle,toAngle:b.angle,fromOpacityScale:a.opacity/100,toOpacityScale:b.opacity/100},'off',undefined,true,['simple','copy-alpha-color','lock-alpha'][ink]);states.push(pixels());
  }
  const after=pixels(),entry=history.commitPixelEdit(d,edit,'scaled');entry?.undo();const undo=pixels();entry?.redo();const redo=pixels();history.revertPixelEdit(d,edit);const cancel=pixels();
  install(initial);const pe=history.beginPixelEdit(l.id),a=samples[0],b=samples[1];stamp(pe,a);paintLine(d,l,pe,a.x,a.y,b.x,b.y,firstSize,unpackColor(color),select,'square','solid',1,image,undefined,0,mode,patternOrigin,'raster',axes,center,undefined,{fromSize:a.size,toSize:a.size,fromAngle:a.angle,toAngle:a.angle,fromOpacityScale:a.opacity/100,toOpacityScale:a.opacity/100},'off',undefined,true,['simple','copy-alpha-color','lock-alpha'][ink]);const preview=pixels();
  cases.push({name:`scaled-${cases.length}`,w,h,format,variant,mode,ink,opacity,color,angle,dynamic,palette,entries,order:orders[palette],initial,selection:select?{...select,mask:Array.from(select.mask)}:null,symmetric,firstSize,samples,states,after,undo,redo,cancel,preview,changed:!!entry,vary});
 }
 for(const format of ['rgba','indexed'])for(const variant of images)for(const mode of ['paint','pattern-source','pattern-target'])for(let ink=0;ink<3;ink++)for(const color of [0xff0000ff,0])for(const dynamic of [false,true])run({format,variant,mode,ink,color,dynamic});
 for(const format of ['rgba','indexed'])for(const variant of images.slice(0,3))for(const mode of ['paint','pattern-source','pattern-target'])for(let ink=0;ink<3;ink++)for(const opacity of [0,100])run({format,variant,mode,ink,opacity,dynamic:true,vary:true,selection:true,symmetric:3});
 for(const palette of [1,2])for(const variant of images.slice(0,3))for(const mode of ['paint','pattern-source','pattern-target'])for(let ink=0;ink<3;ink++)run({variant,mode,ink,palette,dynamic:true,vary:true,angle:-30.5,symmetric:16});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases,stamps}));console.log(`${cases.length} actual legacy scaled brush transactions; ${stamps.length} stamp sequences`);
})().catch(error=>{console.error(error);process.exitCode=1;});
