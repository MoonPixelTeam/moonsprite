// Execute actual ColorValueControl palette/equality/paste logic, with only the
// workspace and clipboard services supplied by the harness.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const control=read('legacy/src/renderer/src/components/ColorValueControl.tsx');
const colors=read('legacy/src/renderer/src/core/color-values.ts');
const palette=control.slice(control.indexOf('const activePaletteEntries ='),control.indexOf('const COLOR_EDITOR_MIN_WIDTH'));
const same=control.match(/^const sameColor = .*$/m)[0];
const parse=colors.slice(colors.indexOf('export const parseRgbaHex ='),colors.indexOf('export const rgbToHsl ='));
const paste=control.slice(control.indexOf('  const applyHex ='),control.indexOf('  commitHexRef.current ='));
let workspace={sessions:[],activeId:'active'},working={r:17,g:34,b:51,a:128},applied=[],clipboard;
const context=vm.createContext({useWorkspace:{getState:()=>workspace},workingColor:working,
  applyEditorColor:color=>applied.push(color),window:{moonSprite:{readClipboardText:async()=>{if(clipboard instanceof Error)throw clipboard;return clipboard;}}}});
vm.runInContext(stripTypeScriptTypes((palette+same+'\n'+parse+paste).replaceAll('export ','')),context);
const pack=c=>((c.a<<24)|(c.b<<16)|(c.g<<8)|c.r)>>>0;
const color=n=>({r:n&255,g:(n>>>8)&255,b:(n>>>16)&255,a:n>>>24});
const rows=entries=>[entries.length,...entries.flatMap(e=>[e.id,JSON.stringify(e.name),pack(e.color)])].join(' ');
const lines=[];let paletteCases=0,equalityCases=0;
function record(entries,order,active=true){
  workspace={activeId:'active',sessions:[{document:{id:active?'active':'inactive',palette:entries,paletteOrder:order}}]};
  const actual=vm.runInContext('activePaletteEntries()',context);
  // Returned entries and their colors are independent of stored objects.
  if(actual.length){const source=entries.findLast(e=>e.id===actual[0].id);assert.notEqual(actual[0],source);assert.notEqual(actual[0].color,source.color);}
  lines.push(`P ${rows(entries)} ${order.length} ${order.join(' ')} ${active?1:0} ${rows(actual)}`);++paletteCases;
  context.left=actual;context.right=actual.map(e=>({...e,color:{...e.color}}));
  assert.equal(vm.runInContext('samePaletteEntries(left,right)',context),true);++equalityCases;
  if(actual.length)for(const mutate of [e=>e.id++,e=>e.name+='changed',e=>e.color.a^=1,e=>e.color.r^=1,e=>e.color.g^=1,e=>e.color.b^=1]){
    context.right=actual.map(e=>({...e,color:{...e.color}}));mutate(context.right[0]);
    lines.push(`S ${rows(actual)} ${rows(context.right)} ${vm.runInContext('samePaletteEntries(left,right)',context)?1:0}`);++equalityCases;
  }
}
record([],[]);record([{id:0,name:'zero',color:color(0x00112233)},{id:4,name:'old',color:color(1)},{id:4,name:'last',color:color(0xffabcdef)}],[4,99,0,4]);
record([{id:0,name:'zero',color:working}],[0],false);
for(let n=0;n<80;++n){const entries=Array.from({length:n%17},(_,i)=>({id:i%11,name:`entry_${n}_${i}`,color:color((n*141041+i*74417)>>>0)}));const order=Array.from({length:n%23},(_,i)=>(i*7+n)%19);record(entries,order);}
(async()=>{
  const texts=['#A1b2C3','11223300',' #456789FF\t','\uFEFF#010203\u3000','#000000','#FFFFFF','',null,'bad','#12345','#12 3456','#112233FFx','0x112233','#1234567','\u200B#123456'];
  for(const alpha of [0,1,128,255])for(const text of texts){
    context.workingColor={...working,a:alpha};clipboard=text;applied=[];await vm.runInContext('pasteHexFromClipboard()',context);
    const cps=Array.from(text??'',c=>c.codePointAt(0)).join(' ');
    lines.push(`H ${alpha} ${JSON.stringify(cps)} ${applied.length} ${applied.length?pack(applied[0]):0}`);
  }
  clipboard=Error('unavailable');applied=[];await vm.runInContext('pasteHexFromClipboard()',context);assert.equal(applied.length,0);
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,lines.join('\n')+'\n');
  console.log(`${paletteCases} actual legacy palettes, ${equalityCases} equality checks, ${texts.length*4} paste cases and clipboard failure passed.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
