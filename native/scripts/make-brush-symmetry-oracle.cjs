// Execute the actual legacy brush, line, perfect-tail and PixelEdit functions.
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
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const model=await imp('document-model.ts'),history=await imp('history.ts'),brushes=await imp('tools-brush.ts');
 const {beginBrushTailEdit}=await imp('tools-pixel-edit-state.ts'),{appendPerfectPixelSegment}=await imp('tools-shapes.ts'),{unpackColor}=await imp('raster.ts');
 const baseEntries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x400000ff},{id:65,color:0xff800080},{id:77,color:0x8000ff00},{id:89,color:0xffffffff},{id:99,color:0x00123456}];
 const variants=[{size:1,shape:'square'},{size:5,shape:'round'},{size:4,shape:'square'},{size:1,shape:'square',width:2,height:2,intrinsicSize:true,coverage:[64,255,128,0]},{size:4,shape:'square',width:2,height:2,intrinsicSize:false,coverage:[255,255,255,255],colors:[0x800000ff,0xff00ff00,0xff0000ff,0x400000ff]}];
 variants.push({size:5,shape:'line'},{size:1,shape:'square',width:2,height:2,intrinsicSize:true,coverage:[255,255,255,255],colors:[0x800000ff,0xff00ff00,0xff0000ff,0x400000ff]});
 const centers=[{x:4.5,y:3.5},{x:.5,y:1},{x:7,y:5.5}],cases=[];
 for(const format of ['indexed','rgba'])for(let axes=0;axes<32;axes++)for(let pivot=0;pivot<3;pivot++)for(let variant=0;variant<variants.length;variant++)for(let ink=0;ink<3;ink++){
  const w=9,h=7,v=variants[variant],entries=baseEntries.map(e=>({...e}));
  if(axes%4===1)entries[0].color=0xff0000ff;
  if(axes%4===2)entries.push({id:7,color:0xff00ff00});
  const order=axes%4===3?[]:[19,7,41,53,65,77,89],color=[0x800000ff,0xff0000ff,0,0x00123456][(axes+ink+pivot)%4],opacity=[35,100,0][(axes+ink+pivot)%3],dither=!v.coverage&&!!(axes&1);
  const selection=(axes&2)?{x:0,y:0,width:w,height:h,mask:Array.from({length:w*h},(_,i)=>[1,0,2,255,1][i%5])}:null;
  const sparse=pivot===2,sw=sparse?4:w,sh=sparse?3:h,ox=sparse?-1:0,oy=sparse?1:0;
  const initial=Array.from({length:sw*sh},(_,i)=>format==='indexed'?[0,7,19,30,41,99,4000000000][i%7]:[0,0xff0000ff,0xffff0000,0x800000ff,0x4000ff00,0x00123456][i%6]);
  const path=pivot===2?[[8,6],[9,6],[10,6],[10,5],[9,5],[8,5],[9,5]]:[[-2,0],[-1,0],[0,0],[0,1],[1,1],[2,1],[1,1]];
  const sym={horizontal:!!(axes&1),vertical:!!(axes&2),diagonalUp:!!(axes&4),diagonalDown:!!(axes&8),rotational:!!(axes&16)},center=centers[pivot];
  const select=selection?{...selection,mask:new Uint8Array(selection.mask)}:null;
  const image=v.coverage?{...v,id:'symmetry-fixture',coverage:new Uint8Array(v.coverage),colors:v.colors?new Uint32Array(v.colors):undefined}:null;
  const settings=dither?{enabled:true,template:'bayer-4',stage:8}:undefined,inkName=['simple','copy-alpha-color','lock-alpha'][ink];
  function make(){const d=model.createDocument('brush symmetry',w,h,format,false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=order;l.width=sw;l.height=sh;l.offsetX=ox;l.offsetY=oy;l.pixels=format==='indexed'?new Uint32Array(initial):new Uint8ClampedArray(new Uint32Array(initial).buffer);model.setLayerStorageOrigin(l,{x:5,y:-3});return {d,l};}
  const canvas=(d,l)=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0);
  function paint(d,l,edit,p){brushes.paintBrush(d,l,edit,p.x,p.y,v.size,unpackColor(color),v.shape,select,'solid',1,image,undefined,0,'paint',undefined,sym,center,undefined,opacity/100,undefined,false,undefined,'off',settings,0,true,inkName);}
  function line(d,l,edit,a,b){brushes.paintLine(d,l,edit,a[0],a[1],b[0],b[1],v.size,unpackColor(color),select,v.shape,'solid',1,image,undefined,0,'paint',undefined,'raster',sym,center,undefined,{fromOpacityScale:opacity/100,toOpacityScale:opacity/100},'off',settings,true,inkName);}
  function finish(d,l,edit,states){const after=canvas(d,l),entry=history.commitPixelEdit(d,edit,'symmetry');entry?.undo();const undo=canvas(d,l);entry?.redo();const redo=canvas(d,l);history.revertPixelEdit(d,edit);return {states,after,undo,redo,cancel:canvas(d,l),changed:!!entry};}
  let {d,l}=make(),before=canvas(d,l),edit=history.beginPixelEdit(l.id),states=[];
  paint(d,l,edit,{x:path[0][0],y:path[0][1]});states.push(canvas(d,l));
  for(let i=1;i<path.length;i++){line(d,l,edit,path[i-1],path[i]);states.push(canvas(d,l));}
  const ordinary=finish(d,l,edit,states);
  ({d,l}=make());edit=history.beginPixelEdit(l.id);line(d,l,edit,path[0],path[2]);const preview=canvas(d,l);
  ({d,l}=make());const parent=history.beginPixelEdit(l.id);let tail=history.beginPixelEdit(l.id),stable=0;
  const points=[{x:path[0][0],y:path[0][1],size:v.size,opacityScale:opacity/100}];states=[];paint(d,l,tail,points[0]);states.push(canvas(d,l));
  for(const [x,y] of path.slice(1)){
   history.revertPixelEdit(d,tail);appendPerfectPixelSegment(points,{x,y,size:v.size,opacityScale:opacity/100});tail=beginBrushTailEdit(parent);
   const end=Math.max(0,points.length-2);for(let i=stable;i<end;i++)paint(d,l,parent,points[i]);stable=end;for(let i=end;i<points.length;i++)paint(d,l,tail,points[i]);states.push(canvas(d,l));
  }
  const perfect=finish(d,l,history.mergePixelEdits(parent,tail),states);
  cases.push({name:`brush-${format}-${axes}-${pivot}-${variant}-${ink}`,w,h,format,axes,ink,center,entries,order,color,opacity,dither,selection,variant:v,sw,sh,ox,oy,initial,path,before,preview,ordinary,perfect});
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy brush symmetry cases, each ordinary and perfect-tail transactions`);
})().catch(error=>{console.error(error);process.exitCode=1;});
