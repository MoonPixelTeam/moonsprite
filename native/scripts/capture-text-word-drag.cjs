// Capture word-granularity selection from the browser textarea used by legacy.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../../legacy/node_modules/playwright');
const samples=[['one two three four',5],['one  two,three! four',6],['你好世界 测试',2],['x..y?!z',3],['foo_bar a.b',8]];
const literal=text=>'U"'+[...text].map(c=>{const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):(n>0xffff?'\\U'+n.toString(16).padStart(8,'0'):'\\u'+n.toString(16).padStart(4,'0'));}).join('')+'"';
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextAreaInput.tsx'),'utf8');
 if(!source.includes('<textarea ref={ref} {...props}'))throw Error('Legacy textarea changed; inspect before capture');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();await page.setContent('<textarea style="font:20px monospace;width:800px;height:80px;padding:0;border:0"></textarea>');const input=page.locator('textarea'),rows=[];
  for(const [text,start] of samples)for(let target=0;target<[...text].length;target++)for(const percent of [20,80]){
   const vias=[-1];if(target===0||target===[...text].length-1)vias.push(target===0?[...text].length-1:0);
   for(const via of vias){
    await input.fill(text);const box=await input.boundingBox();
    const x=async(index,fraction)=>box.x+await page.evaluate(({text,index,fraction})=>{const c=document.createElement('canvas').getContext('2d');c.font=getComputedStyle(document.querySelector('textarea')).font;return c.measureText([...text].slice(0,index).join('')).width+c.measureText([...text][index]).width*fraction/100;},{text,index,fraction});
    const origin=await x(start,20);await page.mouse.click(origin,box.y+10);await page.mouse.move(origin,box.y+10);await page.mouse.down({clickCount:2});
    if(via>=0)await page.mouse.move(await x(via,20),box.y+10,{steps:3});
    await page.mouse.move(await x(target,percent),box.y+10,{steps:3});await page.mouse.up();
    const result=await input.evaluate(el=>[[...el.value.slice(0,el.selectionStart)].length,[...el.value.slice(0,el.selectionEnd)].length]);
    await page.keyboard.press('Shift+ArrowRight');const shifted=await input.evaluate(el=>[[...el.value.slice(0,el.selectionStart)].length,[...el.value.slice(0,el.selectionEnd)].length]);
    rows.push(` {${literal(text)},${start},${via},${target},${percent},${result[0]},${result[1]},${shifted[0]},${shifted[1]}},`);
   }
  }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/text_word_drag_browser.h'),`#pragma once\n// Captured from Windows Edge ${await browser.version()}; regenerate with capture-text-word-drag.cjs.\nnamespace moon {\nstruct TextWordDragBrowserCase{const char32_t* text;int origin,via,target,percent,start,end,shiftStart,shiftEnd;};\ninline const TextWordDragBrowserCase textWordDragBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);console.log(`Captured ${rows.length} word-drag cases.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
