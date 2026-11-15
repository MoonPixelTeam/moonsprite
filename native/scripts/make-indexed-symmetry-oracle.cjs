// Uses actual legacy selection/clipboard/history functions via Node's TypeScript loader.
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
 const model=await imp('document-model.ts'),history=await imp('history.ts'),capture=await imp('tools-selection-transform-source.ts'),apply=await imp('tools-selection-transform-apply.ts'),sym=await imp('symmetry.ts'),sel=await imp('selection.ts'),raster=await imp('tools-selection-transform-raster.ts');
 const {unpackColor}=await imp('raster.ts');
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x4000ff00},{id:65,color:0xff800080},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const groups=[{vertical:true},{horizontal:true,vertical:true},{rotational:true},{horizontal:true,vertical:true,diagonalDown:true},{diagonalUp:true,diagonalDown:true}];
 const kinds=['translation','scale','flip','rotation','orthogonal','rotsprite','shear-n','shear-s','shear-w','shear-e'];
 const cases=[];
 const serialized=s=>s?{...s,mask:s.mask?Array.from(s.mask):null}:null;
 function run(spec={}){
  const {layout='dense',special='normal',kind='translation',copy=false,group=0,centerKind=0,updated=false,large=false,masked=true}=spec;
  const w=large?300:12,h=large?230:10,sw=layout==='dense'?w:4,sh=layout==='dense'?h:3,ox=layout==='negative'?-1:layout==='dense'?0:2,oy=layout==='negative'?-1:layout==='dense'?0:1;
  const axes={...sym.DEFAULT_SYMMETRY_AXES,...groups[group]},center=centerKind===0?{x:6,y:5}:centerKind===1?{x:6.5,y:4}:centerKind===2?{x:4,y:5.5}:{x:-.25,y:4.25};
  const pe=entries.map(e=>({...e}));if(special==='opaque-zero')pe[0].color=0xff0000ff;if(special==='duplicate')pe.push({id:7,color:0xff00ff00});if(special==='transparent-first'){pe.find(e=>e.id===7).color=0x00123456;pe.push({id:7,color:0xff00ff00});}if(special==='transparent-last')pe.push({id:7,color:0x00123456});
  const d=model.createDocument('indexed symmetry',w,h,'indexed',false),l=d.layers[0];const order=[77,53,41,7,19,0];d.palette=pe.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=order;
  l.width=sw;l.height=sh;l.offsetX=ox;l.offsetY=oy;l.pixels=new Uint32Array(Array.from({length:sw*sh},(_,i)=>[0,7,19,30,41,99,53,65,404][i%9]));model.setLayerStorageOrigin(l,{x:5,y:-3});
  const initial=Array.from(l.pixels),canvas=()=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0);
  const snapshot=()=>({pixels:canvas(),display:canvas().map(v=>pe.reduce((found,e)=>e.id===v?e:found,{color:0}).color),geometry:{width:l.width,height:l.height,x:l.offsetX,y:l.offsetY,originX:model.getLayerStorageOrigin(l).x,originY:model.getLayerStorageOrigin(l).y}});
  const seed={x:1,y:1,width:4,height:3,...(masked?{mask:new Uint8Array([1,0,1,1,0,1,1,0,1,1,0,1])}:{})};
  const selection=sym.symmetrySelection(seed,w,h,axes,center);if(!selection)throw Error('empty selection');const before=snapshot(),initialEntries=pe.map(e=>({...e}));
  let start={x:selection.x,y:selection.y};for(let y=selection.y;y<selection.y+selection.height;y++)for(let x=selection.x;x<selection.x+selection.width;x++)if(sel.selectionContains(selection,x,y))start={x,y};
  const delta={x:2,y:-1},mapped=sym.symmetrySelectionDragDelta(selection,start,delta,w,h,axes,center,true);
  const source=capture.captureSelectionTransform(d,selection,l,{preserveOutsideCanvas:true,cacheOpaqueOffsets:!large});if(!source)throw Error('capture');
  let target={x:selection.x+1,y:selection.y-1,width:selection.width,height:selection.height},angle=0,shear,pointer,pivot;const opt=kind==='rotsprite'||(kind==='shear-e'&&group%2===1);
  if(kind==='translation')target={...target,x:selection.x+mapped.x,y:selection.y+mapped.y};
  if(kind==='scale'){target.width+=2;target.height+=1;}
  if(kind==='flip'){target.flipHorizontal=true;target.flipVertical=true;}
  if(kind==='rotation'||kind==='rotsprite')angle=37;
  if(kind==='orthogonal')angle=90;
  let shearStart=null;
  if(kind.startsWith('shear')){
   const edge=kind.slice(-1);angle=group%2?23:0;shearStart={...target,angle};pointer=edge==='n'||edge==='s'?{x:3,y:1}:{x:-1,y:3};pivot={x:target.x+target.width/2,y:target.y+target.height/2};const rad=angle*Math.PI/180;
   const direction=edge==='n'||edge==='s'?{x:Math.cos(rad),y:Math.sin(rad)}:{x:-Math.sin(rad),y:Math.cos(rad)};const amount=Math.round(pointer.x*direction.x+pointer.y*direction.y);
   const result=sel.shearTransformedSelection(target,angle,undefined,edge,amount,pivot);target=result.target;angle=result.angle;shear=result.shear;
  }
  const updatedEntries=updated?pe.map(e=>({...e,color:e.id===7?(special==='transparent-first'?0xff00ff00:0x00123456):e.id===99&&special!=='transparent-first'?0xffffffff:e.color})):null;
  if(updatedEntries){raster.selectionTransformCells(d,source,target,angle,shear,l,undefined,false,opt);pe.splice(0,pe.length,...updatedEntries);d.palette=pe.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));}
  const edit=apply.applySelectionTransform(d,source,target,angle,copy,shear,axes,center,l,start,undefined,false,opt),after=snapshot();
  const transformed=sym.transformSymmetrySelection(selection,target,w,h,angle,shear,axes,center,false,start);
  const entry=edit?history.commitPixelEdit(d,edit,'symmetry'):null;entry?.undo();const undo=snapshot();entry?.redo();const redo=snapshot();
  cases.push({name:`symmetry-${cases.length}`,layout,special,kind,copy,large,masked,w,h,sw,sh,ox,oy,axes,center,start,delta,mapped,entries:initialEntries,order,initial,selection:serialized(selection),target,angle,shear:shear??null,shearStart,pointer,pivot,opt,updatedEntries,before,after,undo,redo,transformed:serialized(transformed),changed:!!entry});
 }
 for(const layout of ['dense','sparse','negative'])for(const special of ['normal','opaque-zero','duplicate','transparent-first','transparent-last'])for(const kind of kinds)for(const copy of [false,true])run({layout,special,kind,copy,group:kinds.indexOf(kind)%5,centerKind:kinds.indexOf(kind)%4});
 for(const group of [0,1,2,3,4])for(const centerKind of [0,1,2,3])for(const kind of kinds)run({group,centerKind,kind,copy:group%2===0,masked:group%2===0});
 for(const kind of kinds)for(const special of ['normal','transparent-first'])run({kind,special,updated:true,group:3,centerKind:1});
 for(const kind of kinds)for(const copy of [false,true])run({kind,copy,large:true,layout:'sparse',special:'transparent-first',group:3,centerKind:1});
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy indexed symmetry transactions generated`);
})().catch(error=>{console.error(error);process.exitCode=1;});
