// Executes actual legacy composition, onion and content scans through Node TypeScript hooks.
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
  if(url.startsWith('file:')&&url.endsWith('.ts')) {let source=stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'});return {format:'module',source,shortCircuit:true};}
  return nextLoad(url,context);
 }
});

(async()=>{
 const imp=p=>import(pathToFileURL(path.join(legacy,'src/renderer/src/core',p)));
 const {createDocument}=await imp('document-model.ts');
 const {compositeRegion}=await imp('document-composite-region.ts');
 const {compositeAnimationFrameRegion,createOnionSkinDisplayDocument}=await imp('onion-skin.ts');
 const {createDefaultLayerStyles}=await imp('layer-styles.ts');
 const {animationCelSurfaceHasContent,animationCelSurfaceContentSelection}=await imp('animation-cel-content-cache.ts');
 const pack=c=>(c.r|(c.g<<8)|(c.b<<16)|(c.a<<24))>>>0;
 const unpack=p=>({r:p&255,g:(p>>>8)&255,b:(p>>>16)&255,a:p>>>24});
 const words=b=>Array.from({length:b.length/4},(_,i)=>pack({r:b[i*4],g:b[i*4+1],b:b[i*4+2],a:b[i*4+3]}));
 const palette=[{id:0,color:0xff123456},{id:7,color:0xff0000ff},{id:19,color:0x8000ff00},{id:30,color:0x00112233},{id:7,color:0xffff7929}];
 const order=[0,19,7,30];
 const base=()=>({layers:[{id:'top',surface:{format:'indexed',width:3,height:2,offsetX:1,offsetY:1,pixels:[0,7,19,30,999,7]}},{id:'bottom',surface:{format:'rgba',width:5,height:4,offsetX:0,offsetY:0,pixels:Array(20).fill(0x80663311)}}],group:false});
 const cases=[];const add=(name,mutate=()=>{})=>{const c=base();mutate(c);cases.push({name,...c});};
 add('mixed');add('single',c=>c.layers.pop());add('offset',c=>{c.layers.pop();c.layers[0].surface.offsetX=-1;});
 add('opacity',c=>c.layers[0].opacity=.4);add('multiply',c=>c.layers[0].blendMode='multiply');
 add('linked',c=>c.link=true);add('mask',c=>c.layers[0].mask=true);add('group',c=>c.group=true);add('group-mask',c=>{c.group=true;c.groupMask=true;});
 add('clip',c=>c.layers[0].clip=true);add('group-gradient',c=>{c.group=true;c.groupStyle='gradient';});
 for(const effect of ['overlay','gradient','stroke','smart','shadow','glow','map']){add(effect,c=>c.layers[0].style=effect);add('group-'+effect,c=>{c.group=true;c.groupStyle=effect;});}
 add('overflow-stroke',c=>{c.layers.pop();c.layers[0].surface.offsetX=-2;c.layers[0].style='stroke';});
 add('onion',c=>c.onion=true);add('onion-clip',c=>{c.onion=true;c.layers[0].clip=true;});add('onion-style',c=>{c.onion=true;c.layers[0].style='stroke';});
 for(const effect of ['overlay','gradient','stroke','smart','shadow','glow','map']){add('masked-'+effect,c=>{c.layers[0].style=effect;c.layers[0].mask=true;});add('clipped-'+effect,c=>{c.layers[0].style=effect;c.layers[0].clip=true;});add('onion-'+effect,c=>{c.onion=true;c.layers[0].style=effect;});}
 add('onion-group',c=>{c.onion=true;c.group=true;});add('onion-mask',c=>{c.onion=true;c.layers[0].mask=true;});
 add('empty-palette',c=>{c.layers.pop();c.emptyPalette=true;});
 function style(effect){if(!effect)return undefined;const s=createDefaultLayerStyles();if(effect==='overlay'){s.colorOverlay.enabled=true;s.colorOverlay.color=unpack(0xffe09010);}if(effect==='gradient'){s.gradientOverlay.enabled=true;s.gradientOverlay.from=unpack(0xff1010e0);s.gradientOverlay.to=unpack(0xff10e010);}if(effect==='stroke'||effect==='smart'){s.stroke.enabled=true;s.stroke.color=unpack(0xffe020d0);s.stroke.smartHue=effect==='smart';s.stroke.followOpacity=effect==='smart';}if(effect==='shadow'){s.shadow.enabled=true;s.shadow.offsetX=1;s.shadow.offsetY=1;}if(effect==='glow')s.innerGlow.enabled=true;if(effect==='map'){s.gradientMap.enabled=true;s.gradientMap.stops=[{position:0,color:unpack(0xffd02010)},{position:1,color:unpack(0xff10e020)}];}return s;}
 function surface(s){return {...s,pixels:s.format==='indexed'?new Uint32Array(s.pixels):new Uint8ClampedArray(s.pixels.flatMap(p=>[p&255,(p>>>8)&255,(p>>>16)&255,p>>>24]))};}
 const lines=[];
 for(const c of cases){const d=createDocument('runtime',5,4,'indexed');d.palette=(c.emptyPalette?[]:palette).map(e=>({...e,name:'',color:unpack(e.color)}));d.paletteOrder=order;const template=d.layers[0];d.layers=c.layers.map(l=>({...template,id:l.id,name:l.id,...surface(l.surface),opacity:l.opacity??1,blendMode:l.blendMode??'normal',groupId:c.group?'g':null,clippingMask:l.clip??false,layerStyles:style(l.style)})).reverse();
 d.groups=c.group?[{id:'g',name:'g',parentGroupId:null,visible:true,locked:false,opacity:.65,blendMode:'normal',panelOrder:0,layerStyles:style(c.groupStyle)}]:[];
 d.animation={activeFrameId:'a',frames:[{id:'a',duration:100},{id:'b',duration:100}],cels:[],loopSections:[],layerMasks:[]};
 for(const l of c.layers){for(const frame of ['a','b']){const spec={...l.surface,pixels:l.surface.pixels.slice()};if(frame==='b'&&c.onion)spec.offsetX--;const cel={id:l.id+'-'+frame,layerId:l.id,frameId:frame,surface:surface(spec)};if(frame==='b'&&c.link)cel.linkedCelId=l.id+'-a';if(l.mask)d.animation.layerMasks.push({layerId:l.id,frameId:frame,mask:{id:l.id+'-mask-'+frame,visible:true,locked:false,autoLinkAnimationCels:false,moveWithOwner:true,...surface({format:'rgba',width:2,height:2,offsetX:1,offsetY:1,pixels:[0xff000000,0xff808080,0xffffffff,0]})}});d.animation.cels.push(cel);}}
 if(c.groupMask)d.animation.groupMasks=[{groupId:'g',frameId:'a',mask:{id:'gm',visible:true,locked:false,autoLinkAnimationCels:false,moveWithOwner:true,...surface({format:'rgba',width:2,height:2,offsetX:1,offsetY:1,pixels:[0xff000000,0xff808080,0xffffffff,0]})}}];
 const r={x:-2,y:-1,width:9,height:7};let pixels;if(c.onion){const display=createOnionSkinDisplayDocument(d,[{frameId:'b',distance:1,side:'next'}],{previousColor:unpack(0xff5053ef),nextColor:unpack(0xffff7929),previousOpacity:35,nextOpacity:35,scope:'all-layers'},'top','display');pixels=words(compositeRegion(display,r.x,r.y,r.width,r.height));}else pixels=words(compositeAnimationFrameRegion(d,c.link?'b':'a',r.x,r.y,r.width,r.height));
 c.expected=pixels;c.palette=c.emptyPalette?[]:palette;c.order=order;c.region=r;
 lines.push(c);
 }
 fs.mkdirSync(path.dirname(out),{recursive:true});
 // Flat token records keep the C++ oracle reader independent of a JSON library.
 const tokens=[];tokens.push(lines.length);
 for(const c of lines){tokens.push(c.name,c.layers.length,+!!c.group,+!!c.groupMask,c.groupStyle??'none',+!!c.onion,+!!c.link,c.palette.length);for(const e of c.palette)tokens.push(e.id,e.color);tokens.push(c.order.length,...c.order);for(const l of c.layers){const s=l.surface;tokens.push(l.id,s.format,s.width,s.height,s.offsetX,s.offsetY,l.opacity??1,l.blendMode??'normal',+!!l.clip,+!!l.mask,l.style??'none',...s.pixels);}tokens.push(c.region.x,c.region.y,c.region.width,c.region.height,...c.expected);}
 // Same surface with changing palettes must invalidate content summaries.
 const scans=[];for(const values of [[0],[7,0,30,999,19,0],[0xffffffff,0,0,0,0,0]])for(const p of [palette,[],[{id:0,color:0},{id:7,color:0},{id:19,color:0}],[{id:0,color:0xffabcdef}]]){const s=surface({format:'indexed',width:values.length,height:1,offsetX:0,offsetY:0,pixels:values});const pal=p.map(e=>({...e,name:'',color:unpack(e.color)}));const selection=animationCelSurfaceContentSelection(s,pal,values.length,1);scans.push({p,values,visible:animationCelSurfaceHasContent(s,pal),selection});}
 tokens.push(scans.length);for(const c of scans){tokens.push(c.p.length);for(const e of c.p)tokens.push(e.id,e.color);tokens.push(c.values.length,...c.values,+c.visible,+!!c.selection);if(c.selection)tokens.push(c.selection.x,c.selection.y,c.selection.width,c.selection.height,...Array.from({length:c.selection.width*c.selection.height},(_,i)=>c.selection.mask?.[i]??1));}
 fs.writeFileSync(out,tokens.join(' ')+'\n');console.log(`${lines.length} actual legacy composites and ${scans.length} content cases generated`);
})().catch(e=>{console.error(e);process.exitCode=1;});
