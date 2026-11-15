// Executes actual legacy indexed outline kernels and PixelEdit history via Node's TypeScript loader.
const fs=require('fs'),path=require('path'),{pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,nextResolve) {
  // Bundler asset URL imports are inert in these non-export command tests.
  if(specifier.startsWith("@/assets/")&&specifier.endsWith("?url"))return {url:"data:text/javascript,export default "+encodeURIComponent(JSON.stringify(pathToFileURL(path.join(legacy,"src/renderer/src",specifier.slice(2,-4))).href)),shortCircuit:true};
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
 globalThis.localStorage={getItem:()=>null,setItem:()=>{}};
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src',p)));
 const model=await imp('core/document-model.ts'),anim=await imp('core/animation.ts'),{unpackColor,packColor}=await imp('core/raster.ts');
 const {outlineSelection,outlineSelectionBoundary,outlinePixelSamples}=await imp('core/tools-outline.ts'),history=await imp('core/history.ts');
 const base=[{id:0,color:0},{id:7,color:0xff0000ff},{id:19,color:0xffff0000},{id:30,color:0x800908a0},{id:41,color:0x40408020},{id:53,color:0xff800080},{id:65,color:0xff00ff00},{id:77,color:0xffffffff},{id:99,color:0x00123456}];
 const names=['nw','n','ne','w','e','sw','s','se'],kernels=['round','square','horizontal','vertical'],positions=['inside','outside','both'];
 const snapshot=l=>({width:l.width,height:l.height,ox:l.offsetX,oy:l.offsetY,sx:model.getLayerStorageOrigin(l).x,sy:model.getLayerStorageOrigin(l).y,pixels:Array.from(l.pixels)});
 const cases=[];
 function generate(palette,orderKind,layout,kernel,position,variant,boundary,size=7,replay=false){
  const entries=base.map(e=>({...e,name:String(e.id)}));if(palette==='opaque-zero')entries[0].color=0xffabcdef;if(palette==='duplicate')entries.push({id:7,name:'duplicate',color:0xff00ff00});if(palette==='transparent-first'){entries.find(e=>e.id===7).color=0x00123456;entries.push({id:7,name:'duplicate',color:0xff00ff00});}if(palette==='transparent-last')entries.push({id:7,name:'duplicate',color:0x00123456});if(palette==='empty')entries.length=0;
  const order=orderKind==='all'?base.map(e=>e.id):orderKind==='subset'?[77,41,65,7]:[];
  const w=size,h=size,tiny=layout==='tiny'||layout==='blank',sw=tiny?1:layout==='negative'||layout==='offcanvas'?5:w,sh=sw,ox=layout==='negative'?-1:layout==='offcanvas'||layout==='blank'?9:tiny?3:0,oy=layout==='negative'?1:layout==='offcanvas'||layout==='blank'?8:tiny?3:0;
  const initial=Array.from({length:sw*sh},(_,i)=>{const x=i%sw,y=Math.floor(i/sw);if(layout==='blank'||layout==='dense-blank')return 0;if(size>7)return x%4===y%4?7:(x+y)%13===0?99:0;if(layout==='interior')return x>0&&y>0&&x<6&&y<6?x>=2&&y>=2&&x<=4&&y<=4?19:7:0;return x===y?[7,19,30,41,65,77,53][x%7]:(x+y)%5===0?99:(x+y)%11===0?404:0;});
  const d=model.createDocument('indexed outline',w,h,'indexed',false),l=d.layers[0];d.palette=entries.map(e=>({...e,color:unpackColor(e.color)}));d.paletteOrder=order;d.nextColorId=100;Object.assign(l,{width:sw,height:sh,offsetX:ox,offsetY:oy,pixels:new Uint32Array(initial)});model.setLayerStorageOrigin(l,{x:5,y:-3});anim.syncActiveAnimationLayer(d,l.id);
  const options={thickness:[1,2.5,64][variant],position,kernel,directions:[90,255,41][variant],background:variant===1?0xff0000ff:0,color:[0xff17a352,0x8052a317,0x00654321][variant],smartHue:variant===1,darkness:63,followOpacity:variant===1};
  const selection=boundary||variant===2?{x:variant===2?-1:1,y:0,width:w,height:h,mask:new Uint8Array(Array.from({length:w*h},(_,i)=>i%11===0?2:i%3===0?0:1))}:variant===1?{x:1,y:1,width:w-2,height:h-2}:null;
  const directions=Object.fromEntries(names.map((n,i)=>[n,!!(options.directions&(1<<i))]));
  const edit=boundary?outlineSelectionBoundary(d,l,selection,unpackColor(options.color),options.thickness,directions,kernels[kernel],options.smartHue,options.darkness,options.followOpacity):outlineSelection(d,l,selection,unpackColor(options.color),options.thickness,positions[position],directions,kernels[kernel],options.smartHue,options.darkness,unpackColor(options.background),options.followOpacity);
  const expected=snapshot(l),entry=edit&&history.commitPixelEdit(d,edit,'outline',true);let undo=expected,redo=expected,dense=false;
  if(entry){dense=history.getCommittedPixelChanges(entry).regionPatches.length>0;if(replay)d.paletteOrder=[77,19];entry.undo();undo=snapshot(l);entry.redo();redo=snapshot(l);}
  cases.push({name:`${palette}-${orderKind}-${layout}-${kernel}-${position}-${variant}-${boundary}-${size}-${replay}`,w,h,sw,sh,ox,oy,initial,entries,order,options,selection:selection?{...selection,mask:selection.mask?Array.from(selection.mask):[]}:null,boundary,produced:!!entry,expected,undo,redo,dense,replayOrder:replay?[77,19]:null});
 }
 for(const p of ['normal','opaque-zero','duplicate','transparent-first','transparent-last','empty'])for(const o of ['all','subset','empty'])for(const l of ['dense','negative','offcanvas','tiny','blank','dense-blank','interior'])for(let k=0;k<4;k++)for(let pos=0;pos<3;pos++)for(let v=0;v<3;v++)generate(p,o,l,k,pos,v,false);
 for(const p of ['normal','opaque-zero','transparent-first','empty'])for(const l of ['dense','negative','tiny','blank'])for(let k=0;k<4;k++)for(let v=0;v<3;v++)generate(p,'all',l,k,0,v,true);
 for(const size of [7,67])for(const boundary of [false,true])generate('normal','all','dense',1,2,1,boundary,size,true);
 fs.writeFileSync(out,JSON.stringify({cases}));console.log(cases.length+' actual legacy indexed outline results and PixelEdit histories');
})().catch(e=>{console.error(e);process.exitCode=1;});
