// Execute the actual legacy TSX component with hook/element transport adapters.
// This checks its state and callbacks, not DOM layout or NumberInput internals.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,next){let target;if(specifier.startsWith('@/'))target=path.join(legacy,'src/renderer/src',specifier.slice(2));else if(specifier.startsWith('@shared/'))target=path.join(legacy,'src/shared',specifier.slice(8));else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);if(target)for(const p of [target,target+'.ts',path.join(target,'index.ts')])if(fs.existsSync(p)&&fs.statSync(p).isFile())return {url:pathToFileURL(p).href,shortCircuit:true};return next(specifier,context);},
 load(url,context,next){if(url.endsWith('/store/document-file-service.ts'))return {format:'module',source:'export async function openDocumentFile(){throw new Error("File chooser is outside this selection oracle");}',shortCircuit:true};if(url.startsWith('file:')&&url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};return next(url,context);}
});
(async()=>{
 const core=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/sprite-sheet-import.ts')));
 const model=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/document-model.ts')));
 const {cloneSelection}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/selection.ts')));
 const storage=new Map();global.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 global.window={moonSprite:{getResourceInfo:async()=>({freeBytes:2**40})}};
 const {sessionFromDocument}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/store/workspace-session.ts')));
 const {createSpriteSheetImportCommands}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/store/workspace-sprite-sheet-import.ts')));
 const {transformWithOxc}=await import(pathToFileURL(path.join(legacy,'node_modules/vite/dist/node/index.js')));
 let states=[],cursor=0,calls=[],succeed=true,closed=0;
 const hooks={useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef(value){const i=cursor++;return states[i]??(states[i]={current:value});},useMemo(fn){return fn();},useEffect(){}};
 const jsx=(type,props)=>({type,props});
 const mocks={react:hooks,'react-dom':{createPortal:x=>x},'react/jsx-runtime':{jsx,jsxs:jsx},'@/core/sprite-sheet-import':core,'@/core/selection':{cloneSelection},'@/store/workspace':{useWorkspace:{getState:()=>({importSpriteSheet:async(id,o)=>{calls.push({id,o});return succeed;},message:'expected rejection'})}},'../I18nProvider':{useI18n:()=>({t:k=>k})}};
 global.document={body:{}};
 const source='legacy/src/renderer/src/components/dialogs/SpriteSheetImportDialog.tsx';
 const transformed=await transformWithOxc(fs.readFileSync(path.join(root,source),'utf8'),path.join(root,source),{jsx:{runtime:'automatic'},target:'es2022'});
 fs.writeFileSync(path.join(root,'native/build/sheet-import-dialog-transformed.js'),transformed.code);
 const code=transformed.code.replace(/^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];?/gm,(_,names,name)=>`const {${names.replace(/\s+as\s+/g,':')}}=require(${JSON.stringify(name)});`).replace(/^import\s*["'][^"']+["'];?/gm,'').replace('export function SpriteSheetImportDialog','function SpriteSheetImportDialog')+'\nexports.SpriteSheetImportDialog=SpriteSheetImportDialog;';
 fs.writeFileSync(path.join(root,'native/build/sheet-import-dialog-adapted.js'),code);
 const exports={};new Function('require','exports',code)(name=>mocks[name]??new Proxy({},{get:(_,key)=>String(key)}),exports);
 const render=(session,fromSelection=false,fresh=false)=>{if(fresh)states=[];cursor=0;return exports.SpriteSheetImportDialog({session,fromSelection,onChoose:async()=>{},onClose:()=>++closed});};
 const nodes=tree=>{const all=[];const visit=n=>{if(Array.isArray(n)){n.forEach(visit);return;}if(!n||typeof n!=='object')return;all.push(n);visit(n.props?.children);};visit(tree);return all;};
 const number=(tree,key)=>nodes(tree).find(n=>n.type==='NumberInput'&&n.props['aria-label']==='spriteSheetImport.'+key).props;
 const checkbox=(tree,key)=>nodes(tree).find(n=>n.type==='CheckboxField'&&n.props.label==='spriteSheetImport.'+key).props;
 const values=tree=>['x','y','width','height'].map(k=>number(tree,k).value);
 const submit=async tree=>{nodes(tree).find(n=>n.type==='ModalShell').props.onSubmit({preventDefault(){}});for(let i=0;i<4;++i)await Promise.resolve();};
 const defaults=[],counts=[],selections=[];
 for(const [gx,gy,gw,gh]of [[0,0,16,16],[-3,5,7,9],[262144,-262144,262144,1]])for(const [sw,sh]of [[2,1],[17,8],[64,32]])for(const selected of [false,true]){
  const session={document:{id:'defaults',width:64,height:32},view:{grid:{x:gx,y:gy,width:gw,height:gh}},selection:{x:10,y:8,width:sw,height:sh,mask:undefined}};
  const tree=render(session,selected,true);defaults.push(` {${[gx,gy,gw,gh,sw,sh,Number(selected),...values(tree)].join(',')}}`);
 }
 const a={document:{id:'a',width:64,height:32},view:{grid:{x:-3,y:5,width:7,height:9}}};
 let tree=render(a,false,true);number(tree,'width').onValueChange(8);tree=render(a);checkbox(tree,'padding').onChange(true);tree=render(a);number(tree,'paddingX').onValueChange(3);tree=render(a);number(tree,'paddingY').onValueChange(2);tree=render(a);checkbox(tree,'partialTiles').onChange(true);tree=render(a);await submit(tree);
 assert.equal(closed,1);assert.equal(calls.at(-1).o.paddingX,3);
 a.view.grid={x:1,y:2,width:4,height:4};tree=render(a,false,true);assert.deepEqual(values(tree),[-3,5,8,9]);assert.equal(number(tree,'paddingX').value,3);
 // Disabled padding is effective zero but remembered raw gaps re-enable on reopen.
 checkbox(tree,'padding').onChange(false);tree=render(a);assert.equal(nodes(tree).some(n=>n.type==='NumberInput'&&n.props['aria-label']==='spriteSheetImport.paddingX'),false);number(tree,'columns').onValueChange(4);tree=render(a);assert.equal(number(tree,'width').value,16);await submit(tree);assert.equal(calls.at(-1).o.paddingX,0);tree=render(a,false,true);assert.equal(checkbox(tree,'padding').checked,true);assert.equal(number(tree,'paddingX').value,3);assert.equal(number(tree,'width').value,16);
 // Failed, cancelled and selected drafts never replace successful ordinary memory.
 number(tree,'width').onValueChange(5);tree=render(a);succeed=false;await submit(tree);succeed=true;tree=render(a,false,true);assert.equal(number(tree,'width').value,16);
 number(tree,'width').onValueChange(6);tree=render(a);nodes(tree).find(n=>n.type==='Button'&&n.props.children==='common.cancel').props.onClick();tree=render(a,false,true);assert.equal(number(tree,'width').value,16);
 a.selection={x:10,y:8,width:2,height:1,mask:new Uint8Array([1,0])};tree=render(a,true,true);assert.deepEqual(values(tree),[0,0,2,1]);a.selection.mask[0]=0;a.selection=null;await submit(tree);assert.deepEqual([...calls.at(-1).o.selection.mask],[1,0]);tree=render(a,false,true);assert.equal(number(tree,'width').value,16);
 const b={document:{id:'b',width:64,height:32},view:{grid:{x:2,y:3,width:11,height:13}}};assert.deepEqual(values(render(b,false,true)),[2,3,11,13]);assert.deepEqual(values(render({...b,document:{...a.document}},false,true)),[2,3,11,13]);
 for(const extent of [1,32,32768])for(const origin of [-262144,-3,0,7,262144])for(const gap of [0,1,262144])for(const count of [1,2,9999,10000])counts.push(` {${[extent,origin,gap,count,core.spriteSheetFrameSizeFromCount(extent,origin,gap,count)].join(',')}}`);
 const hash=bytes=>{let h=2166136261;for(const b of bytes){h^=b;h=Math.imul(h,16777619)>>>0;}return h;};
 for(let layout=0;layout<4;++layout)for(let mutation=0;mutation<3;++mutation)for(let maskKind=0;maskKind<3;++maskKind){
  const source=model.createDocument('Frozen selection',6,2,'rgba',false);for(let i=0;i<12;++i)source.layers[0].pixels.set([i+1,i*3,i*7,i===4?0:255],i*4);
  const mask=maskKind===0?[1,0,1,0,1,1]:maskKind===1?[1,0]:undefined;
  const snapshot={x:maskKind===2?-1:1,y:0,width:3,height:2,mask:mask?new Uint8Array(mask):undefined};
  const session={document:source,view:{grid:{x:2,y:1,width:2,height:1}},selection:snapshot};let view=render(session,true,true);
  nodes(view).find(n=>n.type==='ThemedSelect').props.onChange(['horizontal','vertical','rows','columns'][layout]);view=render(session,true);number(view,'width').onValueChange(1);view=render(session,true);number(view,'height').onValueChange(1);view=render(session,true);
  snapshot.mask?.fill(0);snapshot.x=4;snapshot.width=1;session.selection=mutation===0?null:mutation===1?{x:0,y:0,width:1,height:1}:snapshot;
  await submit(view);const o=calls.at(-1).o;assert.deepEqual(o.selection.mask?[...o.selection.mask]:undefined,mask);assert.equal(o.selection.x,maskKind===2?-1:1);assert.equal(o.selection.width,3);const result=await core.buildImportedSpriteSheet(source,o);
  const real=sessionFromDocument(source);real.selection=cloneSelection(session.selection);real.selectionPivot=mutation===0?null:{x:-2.5,y:3.75};const beforeSelection=cloneSelection(real.selection),beforePivot=real.selectionPivot?{...real.selectionPivot}:null;
  const state={sessions:[real],activeId:source.id,message:null,commitFloatingPaste(){}};
  const commands=createSpriteSheetImportCommands({get:()=>state,set:patch=>Object.assign(state,patch),recording:{recordDocumentOperation(){}}});
  assert.equal(await commands.importSpriteSheet(source.id,o),true,state.message);assert.equal(real.selection,null);assert.equal(real.selectionPivot,null);assert.equal(real.history.position,1);
  assert.deepEqual(source.animation.cels.map(c=>hash(c.surface.pixels)),result.animation.cels.map(c=>hash(c.surface.pixels)));
  real.history.undo();assert.deepEqual(real.selection,beforeSelection);assert.deepEqual(real.selectionPivot,beforePivot);assert.equal(source.width,6);assert.equal(source.height,2);real.history.redo();assert.equal(real.selection,null);assert.equal(real.selectionPivot,null);
  selections.push(` {${layout},${mutation},${maskKind},{${result.animation.cels.map(c=>hash(c.surface.pixels)+'u').join(',')}}}`);
 }
 const snapshots=[source,'legacy/src/renderer/src/core/sprite-sheet-import.ts','legacy/src/renderer/src/core/selection.ts'].map(p=>'// '+p+' SHA256 '+require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')).join('\n');
 fs.writeFileSync(output,'// Actual legacy component hook/callback and count results.\n'+snapshots+'\n#pragma once\n#include <vector>\n#include <cstdint>\nstruct SheetImportDefaultOracle {int gx,gy,gw,gh,sw,sh,selected,x,y,width,height;};\ninline constexpr SheetImportDefaultOracle sheetImportDefaultOracle[]={\n'+defaults.join(',\n')+'\n};\nstruct SheetImportCountOracle {int extent,origin,gap,count,size;};\ninline constexpr SheetImportCountOracle sheetImportCountOracle[]={\n'+counts.join(',\n')+'\n};\nstruct SheetImportSelectionOracle {int layout,mutation,maskKind;std::vector<std::uint32_t> hashes;};\ninline const std::vector<SheetImportSelectionOracle> sheetImportSelectionOracle={\n'+selections.join(',\n')+'\n};\n');
 console.log(`${defaults.length} actual component defaults, ${counts.length} count inversions; success/failure/cancel/padding/selection/document-identity lifecycle verified`);
 console.log(`${selections.length} actual TSX frozen-selection submissions + actual workspace commands/history and builder pixels after source selection removal/replacement/mask mutation`);
})().catch(e=>{console.error(e);process.exitCode=1;});
