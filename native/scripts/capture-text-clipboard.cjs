// Capture the browser clipboard commands provided by legacy TextAreaInput.
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('../../legacy/node_modules/playwright');
const literal=text=>'U"'+[...text].map(c=>{const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):(n>0xffff?'\\U'+n.toString(16).padStart(8,'0'):'\\u'+n.toString(16).padStart(4,'0'));}).join('')+'"';
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextAreaInput.tsx'),'utf8');
 if(!source.includes('<textarea ref={ref} {...props}'))throw Error('Legacy textarea changed; inspect before capture');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage();await page.route('https://moon-clipboard.test/**',route=>route.fulfill({body:'<textarea></textarea>',contentType:'text/html'}));
  await page.goto('https://moon-clipboard.test/');
  const rows=[];
  const commands=[['Control+c','ui::kKeyC',false,true],['Control+x','ui::kKeyX',false,true],['Control+v','ui::kKeyV',false,true],['Control+Insert','ui::kKeyInsert',false,true],['Shift+Insert','ui::kKeyInsert',true,false],['Shift+Delete','ui::kKeyDel',true,false]];
  for(const text of ['abc def','A😀中B','ab\ncd'])for(const [a,c] of [[0,0],[1,1],[0,3],[3,0]])for(const seed of ['sentinel\n副本','','一\r\n二\r三'])for(const [key,scan,shift,ctrl] of commands){
   await page.evaluate(async args=>{await navigator.clipboard.writeText(args.seed);const el=document.querySelector('textarea');el.value=args.text;el.focus();const offset=n=>[...args.text].slice(0,n).join('').length;el.setSelectionRange(Math.min(offset(args.a),offset(args.c)),Math.max(offset(args.a),offset(args.c)),args.a>args.c?'backward':'forward');},{text,a,c,seed});
   await page.keyboard.press(key);
   const result=await page.evaluate(async()=>{const el=document.querySelector('textarea');return {text:el.value,start:[...el.value.slice(0,el.selectionStart)].length,end:[...el.value.slice(0,el.selectionEnd)].length,clipboard:await navigator.clipboard.readText()};});
   rows.push(` {${literal(text)},${a},${c},${literal(seed)},${scan},${shift},${ctrl},${literal(result.text)},${result.start},${result.end},${literal(result.clipboard)}},`);
  }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/text_clipboard_browser.h'),`#pragma once\n// Actual Edge ${await browser.version()} textarea clipboard commands.\n// Regenerate: node native/scripts/capture-text-clipboard.cjs\nnamespace moon {\nstruct TextClipboardBrowserCase {const char32_t* before;int anchor,caret;const char32_t* seed;ui::KeyScancode key;bool shift,ctrl;const char32_t* after;int start,end;const char32_t* clipboard;};\ninline const TextClipboardBrowserCase textClipboardBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
  console.log(`Captured ${rows.length} browser clipboard cases.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
