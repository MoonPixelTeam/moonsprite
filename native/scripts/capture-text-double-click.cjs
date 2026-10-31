// Browser evidence for legacy TextAreaInput's textarea double-click selection.
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../../legacy/node_modules/playwright');
const samples=['one  two,three! four','foo_bar a.b','你好世界 测试','x..y?!z',"can't 3.14",'word   '];
const literal=text=>'U"'+[...text].map(c=>{const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):(n>0xffff?'\\U'+n.toString(16).padStart(8,'0'):'\\u'+n.toString(16).padStart(4,'0'));}).join('')+'"';
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextAreaInput.tsx'),'utf8');
 if(!source.includes('<textarea ref={ref} {...props}'))throw Error('Legacy input changed; inspect before capture');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<textarea style="font:20px monospace;width:800px;height:80px;padding:0;border:0"></textarea>');
  const rows=[];
  for(const text of samples)for(let index=0;index<[...text].length;index++)for(const percent of [20,80]){
   await page.locator('textarea').fill(text);const box=await page.locator('textarea').boundingBox();
   const x=await page.evaluate(({text,index,percent})=>{const c=document.createElement('canvas').getContext('2d');c.font=getComputedStyle(document.querySelector('textarea')).font;return c.measureText([...text].slice(0,index).join('')).width+c.measureText([...text][index]).width*percent/100;},{text,index,percent});
   await page.mouse.dblclick(box.x+x,box.y+10);
   const result=await page.locator('textarea').evaluate(el=>[ [...el.value.slice(0,el.selectionStart)].length,[...el.value.slice(0,el.selectionEnd)].length]);
   rows.push(` {${literal(text)},${index},${percent},${result[0]},${result[1]}},`);
  }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/text_double_click_browser.h'),`#pragma once\n// Captured from Windows Edge ${await browser.version()}; regenerate with capture-text-double-click.cjs.\nnamespace moon {\nstruct TextDoubleClickBrowserCase{const char32_t* text;int index,percent,start,end;};\ninline const TextDoubleClickBrowserCase textDoubleClickBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
  console.log(`Captured ${rows.length} double-click cases.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
