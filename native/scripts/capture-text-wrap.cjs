// Browser-owned wrapping behind legacy TextAreaInput; normalize each fixed-width script.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../legacy/node_modules/playwright');
const samples = ['one two three', 'one  two three', 'one     two', 'abcdefghijk lmn',
  'ab-cd/ef gh', 'a.b,c!d? e', 'a\nbc def\n', '   abc def', 'abc   ', 'a\u00a0b cd',
  '你好世界测试', '你好，世界。测试', '（你好）世界', '你好\n世界测试\n'];
const literal = text => 'U"' + [...text].map(c => {const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):'\\u'+n.toString(16).padStart(4,'0');}).join('')+'"';
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextAreaInput.tsx'),'utf8');
    if(!source.includes('<textarea ref={ref} {...props}'))throw Error('Legacy textarea changed; inspect before capture');
    const page = await browser.newPage();
    await page.setContent('<textarea style="font:10px monospace;line-height:12px;padding:0;border:0;resize:none;overflow:hidden;height:500px"></textarea>');
    const advances = await page.evaluate(() => {const g=document.createElement('canvas').getContext('2d');g.font='10px monospace';return {latin:g.measureText('a').width,cjk:g.measureText('你').width/2};});
    const rows=[];
    for(const text of samples) for(const columns of [5,8,12]) for(let offset=0;offset<=text.length;++offset){
      const ends=[];
      for(const key of ['Home','End']){
        await page.locator('textarea').evaluate((el,a)=>{el.style.width=a.width+'px';el.value=a.text;el.focus();el.setSelectionRange(a.offset,a.offset);},{text,offset,width:advances[/[\u4e00-\u9fff]/.test(text)?'cjk':'latin']*columns+0.01});
        await page.keyboard.press(key);
        ends.push(await page.locator('textarea').evaluate(el=>el.selectionStart));
      }
      rows.push(` {${literal(text)},${columns},${offset},${ends[0]},${ends[1]}},`);
    }
    fs.writeFileSync(path.join(__dirname,'../tests/fixtures/text_wrap_browser.h'),`#pragma once\n// Actual Edge ${await browser.version()} textarea Home/End; normalized Latin/CJK cells.\n// Regenerate: node native/scripts/capture-text-wrap.cjs\nnamespace moon {\nstruct TextWrapBrowserCase {const char32_t* text;int columns,offset,home,end;};\ninline const TextWrapBrowserCase textWrapBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
    console.log(`Captured ${rows.length} browser wrap cases, advances ${JSON.stringify(advances)}.`);
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
