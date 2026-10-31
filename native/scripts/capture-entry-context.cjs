// Capture right-click selection behavior of legacy's browser single-line input.
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../../legacy/node_modules/playwright');
const literal=text=>'U"'+[...text].map(c=>{const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):'\\u'+n.toString(16).padStart(4,'0');}).join('')+'"';
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextInput.tsx'),'utf8');
 if(!source.includes('<input {...props} type={type}'))throw Error('Legacy input changed; inspect before capture');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<input type="text" style="font:20px monospace;line-height:24px;padding:0;border:0;width:800px;height:120px">');
  const rows=[];
  for(const text of ['abcd ef','one two three','你好世界'])for(const [anchor,caret] of [[0,0],[1,3],[3,1]])for(let index=0;index<text.length;++index)for(const percent of [20,80]){
   await page.locator('input').evaluate((el,a)=>{el.value=a.text;el.focus();el.setSelectionRange(Math.min(a.anchor,a.caret),Math.max(a.anchor,a.caret),a.anchor>a.caret?'backward':'forward');},{text,anchor,caret});
   const box=await page.locator('input').boundingBox();
   const x=await page.evaluate(a=>{const g=document.createElement('canvas').getContext('2d');g.font=getComputedStyle(document.querySelector('input')).font;return g.measureText(a.text.slice(0,a.index)).width+g.measureText(a.text[a.index]).width*a.percent/100;},{text,index,percent});
   await page.mouse.move(box.x+x,box.y+10);await page.mouse.down({button:'right'});
   const down=await page.locator('input').evaluate(el=>[el.selectionStart,el.selectionEnd]);
   await page.mouse.up({button:'right'});await page.keyboard.press('Escape');
   const up=await page.locator('input').evaluate(el=>[el.selectionStart,el.selectionEnd,el.selectionDirection]);
   rows.push(` {${literal(text)},${anchor},${caret},${index},${percent},${down[0]},${down[1]},${up[0]},${up[1]},ui::kKeyNil,false,${up[2]==='backward'}},`);
  }
  for(const text of ['abcd ef','one two three','你好世界'])for(const [anchor,caret] of [[0,0],[1,3],[3,1]])for(const [key,scan,shift] of [['ContextMenu','ui::kKeyMenu',false],['Shift+F10','ui::kKeyF10',true]]){
   await page.locator('input').evaluate((el,a)=>{el.value=a.text;el.focus();el.setSelectionRange(Math.min(a.anchor,a.caret),Math.max(a.anchor,a.caret),a.anchor>a.caret?'backward':'forward');},{text,anchor,caret});
   await page.keyboard.press(key);await page.keyboard.press('Escape');
   const result=await page.locator('input').evaluate(el=>[el.selectionStart,el.selectionEnd,el.selectionDirection]);
   rows.push(` {${literal(text)},${anchor},${caret},0,0,${Math.min(anchor,caret)},${Math.max(anchor,caret)},${result[0]},${result[1]},${scan},${shift},${result[2]==='backward'}},`);
  }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/entry_context_browser.h'),`#pragma once\n// Actual Edge ${await browser.version()} single-line input context input / cancellation.\n// Regenerate: node native/scripts/capture-entry-context.cjs\nnamespace moon {\nstruct EntryContextBrowserCase {const char32_t* text;int anchor,caret,index,percent,downStart,downEnd,upStart,upEnd;ui::KeyScancode key=ui::kKeyNil;bool shift=false;bool backward=false;};\ninline const EntryContextBrowserCase entryContextBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
  console.log(`Captured ${rows.length} browser context-input cases.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
