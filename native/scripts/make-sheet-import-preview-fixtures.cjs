// Executes unchanged legacy TSX event handlers; mocks React/DOM transport only.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {pathToFileURL,fileURLToPath}=require('url');const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]),legacy=path.join(root,'legacy');
registerHooks({resolve(s,c,n){let p;if(s.startsWith('@/'))p=path.join(legacy,'src/renderer/src',s.slice(2));else if(s.startsWith('@shared/'))p=path.join(legacy,'src/shared',s.slice(8));else if(s.startsWith('.')&&c.parentURL?.startsWith('file:'))p=path.resolve(path.dirname(fileURLToPath(c.parentURL)),s);if(p)for(const f of [p,p+'.ts'])if(fs.existsSync(f)&&fs.statSync(f).isFile())return {url:pathToFileURL(f).href,shortCircuit:true};return n(s,c);},load(u,c,n){if(u.startsWith('file:')&&u.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(u),'utf8'),{mode:'transform'}),shortCircuit:true};return n(u,c);}});
(async()=>{
 const {transformWithOxc}=await import(pathToFileURL(path.join(legacy,'node_modules/vite/dist/node/index.js')));
 const geometry=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/preview-geometry.ts')));
 let state=[],cursor=0,effects=[],pending=[],options,changes=0,canvasElement,tree;
 const hooks={useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useRef(v){const i=cursor++;return state[i]??(state[i]={current:v});},useEffect(fn,deps){const i=cursor++;if(!effects[i]||deps.some((d,j)=>d!==effects[i].deps[j]))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()};});}};
 const jsx=(type,props)=>({type,props});const listeners={};const canvas={getBoundingClientRect:()=>({left:0,top:0,width:720,height:480}),getContext:()=>null,focus(){},setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){},addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k]};
 global.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){this.fn();}disconnect(){}};global.window={devicePixelRatio:1,moonSprite:{getResourceInfo:async()=>({freeBytes:2**40})}};
 const mocks={react:hooks,'react/jsx-runtime':{jsx,jsxs:jsx},'@/core/preview-geometry':geometry,'@/core/resource-policy':{checkResourceLimit:()=>({allowed:true})},'@/core/sprite-sheet-import':{spriteSheetImportSourceSize:s=>({width:s.width,height:s.height}),compositeSpriteSheetRegion:()=>new Promise(()=>{}),spriteSheetImportPlan:()=>({tiles:[]})},'@/core/file-preferences':{loadEditorPreferences:()=>({checkerboard:{size:8}})},'../animation-tween-preview':{drawTweenCheckerboard(){}},'../I18nProvider':{useI18n:()=>({t:k=>k})}};
 const source='legacy/src/renderer/src/components/dialogs/SpriteSheetImportPreview.tsx';const transformed=await transformWithOxc(fs.readFileSync(path.join(root,source),'utf8'),source,{jsx:{runtime:'automatic'},target:'es2022'});
 const code=transformed.code.replace(/^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/gm,(_,names,name)=>`const {${names.replace(/\s+as\s+/g,':')}}=require(${JSON.stringify(name)});`).replace('export function SpriteSheetImportPreview','function SpriteSheetImportPreview')+'\nexports.component=SpriteSheetImportPreview;';
 const module={exports:{}};new Function('require','exports','module',code)(name=>mocks[name]??{},module.exports,module);const component=module.exports.component;
 function render(){cursor=0;pending=[];tree=component({source:{width:64,height:32},revision:0,options,disabled:false,onChange:n=>{options=n;changes++;}});canvasElement=tree.props.children[0];canvasElement.props.ref.current=canvas;for(const effect of pending)effect();}
 const fields=o=>[o.x,o.y,o.width,o.height,o.paddingX,o.paddingY];const cases=[];
 // Document-space down points select each real precedence branch at zoom10.
 const points=[[8,8],[30,22],[0,8],[8,0],[16,8],[8,16],[18,8],[8,19]];
 for(let mode=0;mode<9;mode++)for(const dx of [-30,-3,2,25])for(const dy of [-20,1,9])for(const cancel of [false,true]){
  for(const effect of effects)effect?.cleanup?.();state=[];effects=[];options={layout:'rows',x:0,y:0,width:16,height:16,paddingX:2,paddingY:3,partialTiles:false};changes=0;render();render();
  const p=points[mode%8],down={preventDefault(){},currentTarget:canvas,pointerId:1,button:mode===8?1:0,clientX:40+p[0]*10,clientY:80+p[1]*10};canvasElement.props.onPointerDown(down);render();
  canvasElement.props.onPointerMove({...down,clientX:down.clientX+dx*10,clientY:down.clientY+dy*10});render();
  if(cancel)canvasElement.props.onPointerCancel();else canvasElement.props.onPointerUp();render();
  const view=state[2];cases.push({mode,dx,dy,cancel,fields:fields(options),pan:[view?.pan.x??0,view?.pan.y??0],changes});
 }
 // Actual anchored wheel handler and fit callback, independent of settings.
 for(const delta of [-100,100]){state=[];effects=[];options={x:0,y:0,width:16,height:16,paddingX:0,paddingY:0};render();render();listeners.wheel({preventDefault(){},deltaY:delta,clientX:150,clientY:170});render();const v=state[2];assert(v&&v.zoom>0);cases.push({wheel:delta,zoom:v.zoom,pan:[v.pan.x,v.pan.y]});tree.props.children[1].props.children[1].props.onClick();render();assert.equal(state[2],null);}
 let out='#pragma once\n#include <array>\n#include <vector>\n// Actual SpriteSheetImportPreview.tsx callbacks; hook/DOM transport only.\nstruct SheetPreviewOracle {int mode,dx,dy;bool cancel;std::array<int,6> fields;double panX,panY;};\ninline const std::vector<SheetPreviewOracle> sheetPreviewOracle{\n';
 for(const c of cases.filter(c=>!c.wheel))out+=` {${c.mode},${c.dx},${c.dy},${c.cancel},{${c.fields}},${c.pan[0]},${c.pan[1]}},\n`;
 out+='};\nstruct SheetWheelOracle {int delta;double zoom,panX,panY;};\ninline const std::vector<SheetWheelOracle> sheetWheelOracle{\n';for(const c of cases.filter(c=>c.wheel))out+=` {${c.wheel},${c.zoom},${c.pan[0]},${c.pan[1]}},\n`;out+='};\n';fs.writeFileSync(output,out);console.log(`${cases.length-2} actual TSX drag/cancel cases and 2 anchored wheel cases`);
})().catch(e=>{console.error(e);process.exitCode=1;});
