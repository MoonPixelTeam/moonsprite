const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('../../legacy/node_modules/playwright');
const literal=text=>'U"'+[...text].map(c=>{const n=c.codePointAt(0);return n<128?JSON.stringify(c).slice(1,-1):(n>0xffff?'\\U'+n.toString(16).padStart(8,'0'):'\\u'+n.toString(16).padStart(4,'0'));}).join('')+'"';
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../legacy/src/renderer/src/components/TextInput.tsx'),'utf8');
 if(!source.includes('<input {...props} type={type}'))throw Error('Legacy input changed');
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();
  await page.route('https://moon-entry-history.test/**',route=>route.fulfill({body:'<input type="text"><button>other</button>',contentType:'text/html'}));await page.goto('https://moon-entry-history.test/');
  const scenarios=[
   ['',0,0,['type:abc','key:Control+z','key:Control+y','key:Control+z','type:x','key:Control+y']],
   ['ABCD',1,3,['type:xy','key:Control+z','key:Control+y']],
   ['ABCD',3,1,['type:xy','key:Control+z','key:Control+Shift+z']],
   ['',0,0,['type:ab','key:ArrowLeft','type:x','key:Control+z','key:Control+z','key:Control+y','key:Control+y']],
   ['ABCD',4,4,['key:Backspace','key:Backspace','key:Control+z','key:Control+y']],
   ['ABCD',0,0,['key:Delete','key:Delete','key:Control+z','key:Control+y']],
   ['',0,0,['type:abc','key:Backspace','key:Control+z','key:Control+z','key:Control+y','key:Control+y']],
   ['ABCD',1,3,['key:Delete','key:Control+z','key:Control+y']],
   ['ABCD',1,3,['paste:X','paste:Y','key:Control+z','key:Control+z','key:Control+y','key:Control+y']],
   ['ABCD',1,3,['key:Control+x','key:Control+z','key:Control+y']],
   ['ABCD',1,3,['paste:','key:Control+z','key:Control+y']],
   ['',0,0,['type:ab','readonly:true','key:Control+z','readonly:false','key:Control+z','key:Control+y']],
   ['',0,0,['type:ab','blur','focus','key:Control+z','key:Control+y']],
   ['',0,0,['type:ab','set:other','key:Control+z','key:Control+y']],
   ['',0,0,['type:ab','select:0,1','type:x','key:Control+z','key:Control+z','key:Control+y','key:Control+y']],
   ['ABCD',1,3,['key:Control+c','key:Control+z','key:Control+y']],
   ['abc def',7,7,['key:Control+Backspace','key:Control+z','key:Control+y']],
   ['ABCD',1,3,['key:Delete','key:Delete','key:Control+z','key:Control+z']],
   ['ABCD',1,3,['key:Backspace','key:Backspace','key:Control+z','key:Control+z']],
   ['abc def ghi',11,11,['key:Control+Backspace','key:Control+Backspace','key:Control+z','key:Control+z']],
   ['',0,0,['type:ab','key:Control+c','type:c','key:Control+z']],
   ['',0,0,['type:ab','key:Control+a','type:x','key:Control+z','key:Control+z']],
   ['',0,0,['type:ab','key:Control+z','key:Backspace','key:Control+y']],
   ['',0,0,['type:中文','key:Control+z','key:Control+y']],
   ['',0,0,['type:ab','set:ab','key:Control+z','key:Control+y']],
   ['ABCD',1,2,['type:B','key:Control+z','key:Control+y']],
   ['ABCD',1,3,['paste:BC','key:Control+z','key:Control+y']],
  ];
  const rows=[],records=[];
  for(let scenario=0;scenario<scenarios.length;scenario++){
   const [initial,a,c,actions]=scenarios[scenario];
   await page.evaluate(({initial,a,c})=>{document.body.innerHTML='<input type="text"><button>other</button>';const el=document.querySelector('input');el.value=initial;el.focus();el.setSelectionRange(Math.min(a,c),Math.max(a,c),a>c?'backward':'forward');},{initial,a,c});
   for(const action of actions){
    const at=action.indexOf(':'),kind=at<0?action:action.slice(0,at),arg=at<0?'':action.slice(at+1);
    if(kind==='type')await page.keyboard.type(arg);
    else if(kind==='key')await page.keyboard.press(arg);
    else if(kind==='paste'){await page.evaluate(t=>navigator.clipboard.writeText(t),arg);await page.keyboard.press('Control+v');}
    else if(kind==='readonly')await page.locator('input').evaluate((el,x)=>el.readOnly=x==='true',arg);
    else if(kind==='set')await page.locator('input').evaluate((el,x)=>el.value=x,arg);
    else if(kind==='select')await page.locator('input').evaluate((el,x)=>{const [a,c]=x.split(',').map(Number);el.setSelectionRange(Math.min(a,c),Math.max(a,c),a>c?'backward':'forward');},arg);
    else if(kind==='blur')await page.locator('button').focus();
    else if(kind==='focus')await page.locator('input').focus();
    const result=await page.locator('input').evaluate(el=>({text:el.value,start:el.selectionStart,end:el.selectionEnd,backward:el.selectionDirection==='backward',undo:document.queryCommandEnabled('undo'),redo:document.queryCommandEnabled('redo')}));
    records.push({scenario,action,...result});rows.push(` {${scenario},${literal(initial)},${a},${c},${literal(action)},${literal(result.text)},${result.start},${result.end},${result.backward},${result.undo},${result.redo},${![11,12,13].includes(scenario)}},`);
   }
  }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/entry_history_browser.h'),`#pragma once\n// Actual Edge ${await browser.version()} input local edit history.\n// Regenerate: node native/scripts/capture-entry-history.cjs\nnamespace moon {\nstruct EntryHistoryBrowserCase {int scenario;const char32_t* initial;int anchor,caret;const char32_t* action;const char32_t* text;int start,end;bool backward,undo,redo,compare;};\ninline const EntryHistoryBrowserCase entryHistoryBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
  console.log(`Captured ${rows.length} input history observations.`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
