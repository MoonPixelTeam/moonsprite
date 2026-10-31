const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../../legacy/node_modules/playwright');
const literal=text=>'U"'+[...text].map(c=>{const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):'\\u'+n.toString(16).padStart(4,'0');}).join('')+'"';
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextInput.tsx'),'utf8');
 if(!source.includes('<input {...props} type={type}'))throw Error('Legacy input changed');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),rows=[];
  for(const text of ['abcdefghijklmnopqrstuvwxyz'.repeat(3),'中文测试'.repeat(15)])for(const width of [90,180]){
   await page.setContent(`<input style="font:20px monospace;width:${width}px;padding:0;border:0">`);
   const input=page.locator('input');await input.evaluate((e,t)=>{e.value=t;e.focus();e.setSelectionRange(0,0);},text);
   await page.keyboard.press('Home');await input.evaluate(e=>e.scrollLeft=0);
   const box=await input.boundingBox(),y=box.y+box.height/2;
   await page.mouse.move(box.x+1,y);await page.mouse.down();await page.mouse.move(box.x+box.width+30,y,{steps:5});
   await page.waitForTimeout(1500);const right=await input.evaluate(e=>[e.selectionStart,e.selectionEnd]);
   await page.mouse.move(box.x-30,y,{steps:5});await page.waitForTimeout(1500);
   const left=await input.evaluate(e=>[e.selectionStart,e.selectionEnd]);await page.mouse.up();
   if(right[0]!==0||right[1]!==text.length||left[0]!==0||left[1]!==0)throw Error('Unexpected browser edge-drag range: '+JSON.stringify({width,right,left}));
   rows.push(` {${literal(text)},${width},${right[0]},${right[1]},${left[0]},${left[1]}},`);
  }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/entry_edge_drag_browser.h'),`#pragma once\n// Actual Edge ${await browser.version()} single-line edge-drag endpoints.\n// Regenerate: node native/scripts/capture-entry-edge-drag.cjs\nnamespace moon {\nstruct EntryEdgeDragBrowserCase {const char32_t* text;int width,rightStart,rightEnd,leftStart,leftEnd;};\ninline const EntryEdgeDragBrowserCase entryEdgeDragBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
  console.log(`Captured ${rows.length} browser edge-drag endpoint cases.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
