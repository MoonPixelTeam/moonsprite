// Capture the browser-owned behavior behind legacy TextAreaInput's textarea.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../legacy/node_modules/playwright');
const samples = ['one  two,three! four', 'A\nB', '你好世界 测试', 'A😀 B', 'foo_bar a.b', 'a\tb', 'a\n\nb', 'a-b / x', "e\u0301 next", "a.b a:b a·b a\u2027b", "can't l'amour 3.14 1,000", 'http://a.b a@b.com', 'x..y?!z', ' \n one\n', '\n\n', 'one \n two'];
const keys = ['Control+ArrowLeft', 'Control+ArrowRight', 'Control+Backspace', 'Control+Delete'];
const literal = text => 'U"' + [...text].map(c => {
  const n=c.codePointAt(0);
  if(n<128)return JSON.stringify(c).slice(1,-1);
  return n > 0xffff ? '\\U'+n.toString(16).padStart(8,'0') : '\\u'+n.toString(16).padStart(4,'0');
}).join('') + '"';
const keyCode = key => key.includes('ArrowLeft') ? 'ui::kKeyLeft' : key.includes('ArrowRight') ? 'ui::kKeyRight' : key.includes('Backspace') ? 'ui::kKeyBackspace' : 'ui::kKeyDel';
(async () => {
  const legacyInput = fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextAreaInput.tsx'),'utf8');
  if (!legacyInput.includes('<textarea ref={ref} {...props}')) throw Error('Legacy textarea adapter changed; inspect before capture');
  const browser = await chromium.launch({channel:'msedge',headless:true});
  const rows=[];
  try {
    const page=await browser.newPage();
    await page.setContent('<textarea></textarea>');
    async function capture(text, anchor, caret, key) {
      const utf16 = offset => [...text].slice(0,offset).join('').length;
      await page.locator('textarea').evaluate((el,args)=>{
        el.value=args.text;el.focus();el.setSelectionRange(Math.min(args.a,args.c),Math.max(args.a,args.c),args.a>args.c?'backward':'forward');
      },{text,a:utf16(anchor),c:utf16(caret)});
      await page.keyboard.press(key);
      const result=await page.locator('textarea').evaluate(el=>({start:[...el.value.slice(0,el.selectionStart)].length,end:[...el.value.slice(0,el.selectionEnd)].length,text:el.value}));
      rows.push(` {${literal(text)},${anchor},${caret},${keyCode(key)},${key.includes('Shift')},${result.start},${result.end},${literal(result.text)}},`);
    }
    for (const text of samples) for(let i=0;i<=[...text].length;i++) for(const key of keys) await capture(text,i,i,key);
    for (const [a,c] of [[0,3],[3,0],[1,7],[7,1]]) for(const key of [...keys,'Control+Shift+ArrowLeft','Control+Shift+ArrowRight']) await capture('one two three',a,c,key);
    const header=`#pragma once\n// Captured from Edge ${await browser.version()} on Windows; legacy TextAreaInput uses textarea.\n// Regenerate with: node native/scripts/capture-text-word-navigation.cjs\nnamespace moon {\nstruct TextWordBrowserCase {const char32_t* before;int anchor,caret;ui::KeyScancode key;bool shift;int start,end;const char32_t* after;};\ninline const TextWordBrowserCase textWordBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`;
    fs.writeFileSync(path.join(__dirname,'../tests/fixtures/text_word_navigation_browser.h'),header);
    console.log(`Captured ${rows.length} browser key cases.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
