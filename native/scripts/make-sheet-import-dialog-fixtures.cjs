// Execute the actual legacy TSX component with hook/element transport adapters.
// This checks its state and callbacks, not DOM layout or NumberInput internals.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {pathToFileURL,fileURLToPath}=require('url');
const {registerHooks,stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
const legacy=path.join(root,'legacy');
registerHooks({
 resolve(specifier,context,next){let target;if(specifier.startsWith('@/'))target=path.join(legacy,'src/renderer/src',specifier.slice(2));else if(specifier.startsWith('@shared/'))target=path.join(legacy,'src/shared',specifier.slice(8));else if(specifier.startsWith('.')&&context.parentURL?.startsWith('file:'))target=path.resolve(path.dirname(fileURLToPath(context.parentURL)),specifier);if(target)for(const p of [target,target+'.ts',path.join(target,'index.ts')])if(fs.existsSync(p)&&fs.statSync(p).isFile())return {url:pathToFileURL(p).href,shortCircuit:true};return next(specifier,context);},
 load(url,context,next){if(url.startsWith('file:')&&url.endsWith('.ts'))return {format:'module',source:stripTypeScriptTypes(fs.readFileSync(fileURLToPath(url),'utf8'),{mode:'transform'}),shortCircuit:true};return next(url,context);}
});
(async()=>{
 const core=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/sprite-sheet-import.ts')));
 const {cloneSelection}=await import(pathToFileURL(path.join(legacy,'src/renderer/src/core/selection.ts')));
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
 const defaults=[],counts=[];
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
 const snapshots=[source,'legacy/src/renderer/src/core/sprite-sheet-import.ts','legacy/src/renderer/src/core/selection.ts'].map(p=>'// '+p+' SHA256 '+require('crypto').createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')).join('\n');
 fs.writeFileSync(output,'// Actual legacy component hook/callback and count results.\n'+snapshots+'\n#pragma once\nstruct SheetImportDefaultOracle {int gx,gy,gw,gh,sw,sh,selected,x,y,width,height;};\ninline constexpr SheetImportDefaultOracle sheetImportDefaultOracle[]={\n'+defaults.join(',\n')+'\n};\nstruct SheetImportCountOracle {int extent,origin,gap,count,size;};\ninline constexpr SheetImportCountOracle sheetImportCountOracle[]={\n'+counts.join(',\n')+'\n};\n');
 console.log(`${defaults.length} actual component defaults, ${counts.length} count inversions; success/failure/cancel/padding/selection/document-identity lifecycle verified`);
})().catch(e=>{console.error(e);process.exitCode=1;});
