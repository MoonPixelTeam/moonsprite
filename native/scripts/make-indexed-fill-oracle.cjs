// Uses actual legacy fill/history functions via Node's TypeScript loader.
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
 const fill=await imp('tools-fill.ts'),{unpackColor}=await imp('raster.ts');
 const {createCompositePointSampler}=await imp('document-composite-sampling.ts');
 const {createDefaultLayerStyles}=await imp('layer-styles.ts');
 const {shareLinkedRasterContent}=await imp('linked-layers.ts');
 function style(effect){if(!effect||effect==='none')return undefined;const s=createDefaultLayerStyles();if(effect==='stroke'){s.stroke.enabled=true;s.stroke.color=unpackColor(0xff0000ff);}if(effect==='shadow'){s.shadow.enabled=true;s.shadow.color=unpackColor(0xff0000ff);s.shadow.offsetX=1;s.shadow.offsetY=0;}if(effect==='gradient'){s.gradientOverlay.enabled=true;s.gradientOverlay.from=unpackColor(0xffff0000);s.gradientOverlay.to=unpackColor(0xff0000ff);}return s;}
 const entries=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0xffff0000},{id:41,color:0x800000ff},{id:53,color:0x400000ff},{id:65,color:0xff800080},{id:77,color:0x8000ff00},{id:89,color:0xffffffff}];
 const orders=[entries.map(e=>e.id),[19,7,41,53,65,77,89],[],[77,53,41,7,19]];
 const sources=[0xff0000ff,0x800000ff,0,0x00123456,0x010000ff];
 const variants=[{name:'solid'}, {name:'wood',texture:'wood'}, {name:'mask',width:2,height:2,coverage:[255,0,128,200],intrinsicSize:true}, {name:'colored',width:2,height:1,coverage:[255,255],colors:[0x800000ff,0xff00ff00],intrinsicSize:true}, {name:'regular',width:2,height:1,coverage:[255,255],colors:[0x800000ff,0xff00ff00],intrinsicSize:true,mode:'regular'}];
 const cases=[];
 function run(spec){
  const {w=8,h=6,sw=w,sh=h,ox=0,oy=0,palette=0,color=sources[0],variant=variants[0],contiguous=true,tolerance=0,connectivity=4,gap=0,selection=null,operation='bucket',seed=[1,2],symmetric=false,visible=false,layout='mixed',absent=false,group=false,effect='none',groupEffect='none'}=spec;
  const d=model.createDocument('indexed fill',w,h,'indexed',false),l=d.layers[0];d.palette=entries.map(e=>({id:e.id,name:'',color:unpackColor(e.color)}));d.paletteOrder=orders[palette];
  l.width=sw;l.height=sh;l.offsetX=ox;l.offsetY=oy;
  l.pixels=new Uint32Array(Array.from({length:sw*sh},(_,i)=>layout==='uniform'?41:layout==='zero'?0:layout==='one'?7:[0,7,19,30,41,99][(i%sw+Math.floor(i/sw))%6]));
  model.setLayerStorageOrigin(l,{x:5,y:-3});
  if(layout==='ring'){l.pixels.fill(0);for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++)if((x===1||x===sw-2||y===1||y===sh-2)&&!(x===3&&y===1))l.pixels[y*sw+x]=7;}
  if(visible){const top=model.createLayer('visible',w,h,'indexed');top.pixels=new Uint32Array(Array.from({length:w*h},(_,i)=>i%w===3?7:0));d.layers.unshift(top);}
  if(layout==='live'){l.pixels.fill(0);l.pixels[0]=7;l.pixels[l.pixels.length-1]=7;}
  l.layerStyles=style(effect);if(group){l.groupId='fill-group';d.groups=[{id:'fill-group',name:'fill-group',visible:true,locked:false,opacity:.65,blendMode:'normal',layerStyles:style(groupEffect)}];}
  const initial=Array.from(l.pixels),canvas=()=>Array.from({length:w*h},(_,i)=>model.readLayerPackedAt(d,l,i%w,Math.floor(i/w))??0),before=canvas();
  const peer=model.createLayer('linked fill',sw,sh,'indexed');peer.offsetX=ox;peer.offsetY=oy;model.setLayerStorageOrigin(peer,{x:5,y:-3});shareLinkedRasterContent(peer,l);
  const linkedGeometry=()=>{shareLinkedRasterContent(peer,l);const origin=model.getLayerStorageOrigin(peer);return {width:peer.width,height:peer.height,x:peer.offsetX,y:peer.offsetY,originX:origin.x,originY:origin.y};};
  const image=variant.coverage?{...variant,id:'fill-pattern',sourceX:0,sourceY:0,coverage:new Uint8Array(variant.coverage),colors:variant.colors?new Uint32Array(variant.colors):undefined}:null;
  const settings={randomDensity:100,randomCount:0,randomSpacing:0,randomOverlap:true,regularCount:0,regularSpacingX:0,regularSpacingY:0,regularOverlap:false,regularRowOffset:0};
  const axes={horizontal:symmetric,vertical:false,diagonalUp:false,diagonalDown:false};
  const options={connectivity,sourceColorAt:visible?createCompositePointSampler(d):undefined};
  const selectionValue=selection?{...selection,mask:selection.mask?new Uint8Array(selection.mask):undefined}:null;
  const edit=operation==='selection'?fill.fillSelectionOrCanvas(d,l,unpackColor(color),selectionValue):fill.floodFillSymmetric(d,l,...seed,unpackColor(color),selectionValue,contiguous,image,1,undefined,variant.texture??'solid',1,0,image?'pattern-source':'paint',axes,undefined,tolerance,gap,undefined,options,variant.mode??'default',settings);
  const after=canvas(),linkedAfter=linkedGeometry(),entry=edit?history.commitPixelEdit(d,edit,'fill'):null;entry?.undo();const undo=canvas(),linkedUndo=linkedGeometry();entry?.redo();const redo=canvas(),linkedRedo=linkedGeometry();
  cases.push({name:spec.name??`${operation}-${cases.length}`,w,h,sw,sh,ox,oy,palette,entries,order:orders[palette],initial,before,color,variant,contiguous,tolerance,connectivity,gap,selection,operation,seed,symmetric,visible,absent,group,effect,groupEffect,after,undo,redo,linkedAfter,linkedUndo,linkedRedo,changed:!!entry,runCount:edit?.runs?.length??0,dense:!!edit?.denseRegion,points:edit?.points?.count??0});
 }
 // Exact IDs versus equal colors, hidden and unknown IDs, alpha and empty order.
 for(let palette=0;palette<4;palette++)for(const color of sources)for(const tolerance of [0,1,128,255])for(const contiguous of [false,true])for(const connectivity of [4,8])run({palette,color,tolerance,contiguous,connectivity});
 for(let palette=0;palette<4;palette++)for(const color of sources)for(const variant of variants.slice(1))for(const gap of [0,2])run({palette,color,variant,gap,layout:'ring',seed:[3,3]});
 for(let palette=0;palette<4;palette++)for(const color of sources)for(const operation of ['selection','bucket'])for(const masked of [false,true])run({palette,color,operation,contiguous:false,selection:{x:1,y:1,width:6,height:4,...(masked?{mask:Array.from({length:24},(_,i)=>i%5?1:0)}:{})}});
 for(let palette=0;palette<4;palette++)for(const color of sources)for(const visible of [false,true])for(const symmetric of [false,true])run({palette,color,visible,symmetric,tolerance:1,layout:'zero',seed:[1,2]});
 for(const kind of ['cropped','negative','placeholder-zero','placeholder-nonzero','absent'])for(let palette=0;palette<4;palette++)for(const color of sources)for(const operation of ['selection','bucket']){
  const placeholder=kind.startsWith('placeholder');run({name:`${kind}-${palette}-${color}-${operation}`,sw:kind==='absent'?8:placeholder?1:4,sh:kind==='absent'?6:placeholder?1:3,ox:kind==='negative'?-2:kind==='absent'?0:2,oy:kind==='negative'?-1:kind==='absent'?0:1,palette,color,operation,layout:kind==='absent'||kind==='placeholder-zero'?'zero':kind==='placeholder-nonzero'?'one':'mixed',tolerance:1,absent:kind==='absent',seed:[1,2]});
 }
 // Preserve compact and dense threshold branches of the real legacy engine.
 for(const operation of ['selection','bucket'])for(const layout of ['zero','uniform','ring'])for(const color of [0xff0000ff,0x800000ff])run({name:`large-${operation}-${layout}-${color}`,w:512,h:512,operation,layout,color,seed:[256,256],gap:layout==='ring'?2:0});
 // Live source colors inside fixed initial bounds, styled neighbours and
 // fixed group geometry. Include closure and deferred image layout separately.
 for(const geometry of ['full','cropped','negative'])for(const group of [false,true])for(const effect of ['none','stroke','shadow','gradient'])for(const contiguous of [false,true])for(const variant of variants)for(const gap of [0,2]){
  run({name:`live-${geometry}-${group}-${effect}-${contiguous}-${variant.name}-${gap}`,sw:geometry==='full'?8:4,sh:geometry==='full'?6:3,ox:geometry==='negative'?-1:geometry==='cropped'?2:0,oy:geometry==='negative'?-1:geometry==='cropped'?1:0,group,effect:group?'none':effect,groupEffect:group?effect:'none',visible:true,symmetric:true,layout:'live',seed:[2,2],tolerance:1,color:0xff0000ff,contiguous,variant,gap});
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({cases}));console.log(`${cases.length} actual legacy indexed fill transactions`);
})().catch(error=>{console.error(error);process.exitCode=1;});
