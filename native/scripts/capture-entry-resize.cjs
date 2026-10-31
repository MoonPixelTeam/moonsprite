const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../../legacy/node_modules/playwright');
const literal=text=>'U"'+[...text].map(c=>{const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):'\\u'+n.toString(16).padStart(4,'0');}).join('')+'"';
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextInput.tsx'),'utf8');
 if(!source.includes('<input {...props} type={type}'))throw Error('Legacy input changed');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const rows=[];
  for(const text of ['abcdefghijklmnopqrstuvwxyz'.repeat(3),'中文测试'.repeat(15),'short',''])
   for(const [anchor,caret] of [[text.length,text.length],[0,text.length],[text.length,0]])for(const readonly of [false,true]){
    await page.setContent('<input style="font:20px monospace;width:90px;padding:0;border:0">');
    const input=page.locator('input');
    await input.evaluate((el,{text,anchor,caret,readonly})=>{el.value=text;el.readOnly=readonly;el.focus();el.setSelectionRange(Math.min(anchor,caret),Math.max(anchor,caret),anchor>caret?'backward':'forward');},{text,anchor,caret,readonly});
    const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await frame();const before=await input.evaluate(el=>el.scrollLeft);
    await input.evaluate(el=>el.style.width='2000px');await frame();
    const after=await input.evaluate(el=>({scroll:el.scrollLeft,start:el.selectionStart,end:el.selectionEnd,backward:el.selectionDirection==='backward',text:el.value}));
    if(after.text!==text||after.scroll!==0||after.start!==Math.min(anchor,caret)||after.end!==Math.max(anchor,caret))throw Error('Unexpected legacy resize result');
    rows.push(` {${literal(text)},${anchor},${caret},${readonly},${before},${after.scroll},${after.start},${after.end},${after.backward}},`);
   }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/entry_resize_browser.h'),`#pragma once\n// Actual Edge ${await browser.version()} input resize observations.\n// Regenerate: node native/scripts/capture-entry-resize.cjs\nnamespace moon {\nstruct EntryResizeBrowserCase {const char32_t* text;int anchor,caret;bool readOnly;int narrowScroll,wideScroll,start,end;bool backward;};\ninline const EntryResizeBrowserCase entryResizeBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
  console.log(`Captured ${rows.length} single-line resize observations.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
