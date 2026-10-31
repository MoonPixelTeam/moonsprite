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
   ['ABCD',1,3,['blur','focus','type:X','key:Control+z','key:Control+y']],
   ['ABCD',3,1,['blur','focus','type:X','key:Control+z','key:Control+y']],
   ['',0,0,['type:ab','blur','focus','type:c','key:Control+z','key:Control+z']],
   ['ABCD',2,2,['blur','focus','type:X','key:Control+z','key:Control+y']],
  ];
  // Bare text and decimal input navigation uses the same browser control.
  // This matrix deliberately uses simple BMP text: complex shaping/IME is separate.
  const navigationKeys=['ArrowLeft','ArrowRight','Shift+ArrowLeft','Shift+ArrowRight','Home','End','Shift+Home','Shift+End','Control+Home','Control+End','Control+Shift+Home','Control+Shift+End','Control+a'];
  const navigationRanges=[['ABCD',1,3],['ABCD',3,1],['ABCD',0,0],['ABCD',4,4],['ABCD',2,2],['中文测试',1,3],['中文测试',3,1],['',0,0]];
  for(const [initial,a,c] of navigationRanges)for(const readonly of [false,true])for(const key of navigationKeys)
   scenarios.push([initial,a,c,[...(readonly?['readonly:true']:[]),'key:'+key]]);
  const wordSamples=['abc def ghi','  abc  def  ','foo.bar:baz','hello, world!','中文测试内容','你好 世界',''];
  for(const initial of wordSamples){
   const ranges=[[0,0],[initial.length,initial.length],[Math.floor(initial.length/2),Math.floor(initial.length/2)]];
   if(initial.length>=4)ranges.push([1,initial.length-1],[initial.length-1,1]);
   for(const [a,c] of ranges){
    for(const readonly of [false,true])for(const key of ['Control+ArrowLeft','Control+ArrowRight','Control+Shift+ArrowLeft','Control+Shift+ArrowRight'])
     scenarios.push([initial,a,c,[...(readonly?['readonly:true']:[]),'key:'+key]]);
    for(const key of ['Control+Backspace','Control+Delete'])
     scenarios.push([initial,a,c,['key:'+key,'key:Control+z','key:Control+y']]);
   }
  }
  for(const initial of ['abc def ghi','  abc  def  ','foo.bar:baz','中文测试内容','']){
   const ranges=[[0,0],[initial.length,initial.length],[Math.floor(initial.length/2),Math.floor(initial.length/2)]];
   if(initial.length>=4)ranges.push([1,initial.length-1],[initial.length-1,1]);
   for(const [a,c] of ranges)for(const readonly of [false,true])for(const key of ['Control+Shift+Backspace','Control+Shift+Delete','Alt+Backspace','Alt+Delete'])
    scenarios.push([initial,a,c,[...(readonly?['readonly:true']:[]),'key:'+key,'key:Control+z','key:Control+y']]);
  }
  for(const key of ['Control+Shift+Backspace','Control+Shift+Delete','Alt+Backspace','Alt+Delete']){
   scenarios.push(['',0,0,['type:abc','key:'+key,'type:d','key:Control+z','key:Control+y']]);
   scenarios.push(['',0,0,['type:abc','key:Control+z','key:'+key,'key:Control+y']]);
  }
  for(const [a,c] of [[0,0],[4,4],[1,3],[3,1]])for(const index of [0,2,4]){
   scenarios.push(['ABCD',a,c,['shiftclick:'+index,'type:X','key:Control+z','key:Control+y']]);
   scenarios.push(['ABCD',a,c,['click:'+index,'type:X','key:Control+z','key:Control+y']]);
  }
  for(const action of ['drag:0,4','drag:4,0','shiftdrag:1,4','shiftdrag:3,0'])
   scenarios.push(['ABCD',2,2,[action,'type:X','key:Control+z','key:Control+y']]);
  for(const action of ['click:2','shiftclick:2','click:0','drag:2,0'])
   scenarios.push(['',0,0,['type:ab',action,'type:c','key:Control+z','key:Control+z']]);
  for(const initial of ['abc def','foo.bar!','中文测试','a  b'])for(let i=0;i<initial.length;i++)for(const side of [0.25,0.75])
   scenarios.push([initial,0,0,['double:'+(i+side),'type:X','key:Control+z','key:Control+y']]);
  for(const action of ['worddrag:1.25,8.25','worddrag:8.25,1.25','worddrag:1.25,5.25','worddrag:5.25,1.25'])
   scenarios.push(['abc def ghi',0,0,[action,'type:X','key:Control+z','key:Control+y']]);
  for(const initial of ['ABCD','中文测试'])for(const [a,c] of [[1,3],[3,1]])for(const readonly of [false,true])for(let i=0;i<initial.length;i++)for(const side of [0.25,0.75])for(const kind of ['click','shiftclick'])
   scenarios.push([initial,a,c,[...(readonly?['readonly:true']:[]),kind+':'+(i+side),...(!readonly?['type:X','key:Control+z','key:Control+y']:[])]]);
  for(const action of ['drag:0.25,2.75','drag:3.75,1.25','worddrag:1.25,6.75','worddrag:8.25,2.75'])
   scenarios.push(['abc def ghi',0,0,[action,'type:X','key:Control+z','key:Control+y']]);
  for(const interrupt of ['blur','key:ArrowRight','type:X'])
   scenarios.push(['ABCD',0,0,['press:1','move:3',interrupt,'move:0','release:0','focus','type:Y','key:Control+z']]);
  for(const initial of ['ABCD','中文测试',''])for(const [a,c] of [[0,0],[initial.length,initial.length],[1,3],[3,1]])for(const readonly of [false,true])
   for(const key of ['ArrowUp','ArrowDown','Shift+ArrowUp','Shift+ArrowDown','Control+ArrowUp','Control+ArrowDown','Control+Shift+ArrowUp','Control+Shift+ArrowDown','PageUp','PageDown','Shift+PageUp','Shift+PageDown'])
    scenarios.push([initial,Math.min(a,initial.length),Math.min(c,initial.length),[...(readonly?['readonly:true']:[]),'key:'+key]]);
  for(const key of ['ArrowUp','ArrowDown','PageUp','PageDown'])
   scenarios.push(['',0,0,['type:ab','key:'+key,'type:c','key:Control+z','key:Control+z','key:Control+y']]);
  const rows=[],records=[];
  for(let scenario=0;scenario<scenarios.length;scenario++){
   const [initial,a,c,actions]=scenarios[scenario];
   await page.evaluate(({initial,a,c})=>{document.body.innerHTML='<input type="text"><button>other</button>';const el=document.querySelector('input');el.style.cssText='font:20px monospace;padding:0;border:0;width:500px';el.value=initial;el.focus();el.setSelectionRange(Math.min(a,c),Math.max(a,c),a>c?'backward':'forward');},{initial,a,c});
   for(const action of actions){
    const at=action.indexOf(':'),kind=at<0?action:action.slice(0,at),arg=at<0?'':action.slice(at+1);
    if(kind==='type')await page.keyboard.type(arg);
    else if(kind==='key')await page.keyboard.press(arg);
    else if(kind==='paste'){await page.evaluate(t=>navigator.clipboard.writeText(t),arg);await page.keyboard.press('Control+v');}
    else if(['click','shiftclick','drag','shiftdrag','double','worddrag','press','move','release'].includes(kind)){
     const points=await page.locator('input').evaluate((el,arg)=>{const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=getComputedStyle(el).font;const r=el.getBoundingClientRect();return arg.split(',').map(x=>({x:r.x+ctx.measureText(el.value.slice(0,Math.floor(Number(x)))).width+(Number(x)%1)*ctx.measureText(el.value.slice(Math.floor(Number(x)),Math.floor(Number(x))+1)).width+0.1,y:r.y+r.height/2}));},arg);
     if(kind==='press'){await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();}
     else if(kind==='move')await page.mouse.move(points[0].x,points[0].y);
     else if(kind==='release'){await page.mouse.move(points[0].x,points[0].y);await page.mouse.up();}
     else {
     if(kind.startsWith('shift'))await page.keyboard.down('Shift');
     await page.mouse.move(points[0].x,points[0].y);
     if(kind==='double'||kind==='worddrag'){await page.mouse.down();await page.mouse.up();await page.mouse.down({clickCount:2});}else await page.mouse.down();
     if(points.length>1)await page.mouse.move(points[1].x,points[1].y,{steps:4});
     await page.mouse.up({clickCount:kind==='double'||kind==='worddrag'?2:1});if(kind.startsWith('shift'))await page.keyboard.up('Shift');
     }
    }
    else if(kind==='readonly')await page.locator('input').evaluate((el,x)=>el.readOnly=x==='true',arg);
    else if(kind==='set')await page.locator('input').evaluate((el,x)=>el.value=x,arg);
    else if(kind==='select')await page.locator('input').evaluate((el,x)=>{const [a,c]=x.split(',').map(Number);el.setSelectionRange(Math.min(a,c),Math.max(a,c),a>c?'backward':'forward');},arg);
    else if(kind==='blur')await page.locator('button').focus();
    else if(kind==='focus')await page.locator('input').focus();
    const result=await page.locator('input').evaluate(el=>({text:el.value,start:el.selectionStart,end:el.selectionEnd,backward:el.selectionDirection==='backward',undo:document.queryCommandEnabled('undo'),redo:document.queryCommandEnabled('redo')}));
    records.push({scenario,action,...result});rows.push(` {${scenario},${literal(initial)},${a},${c},${literal(action)},${literal(result.text)},${result.start},${result.end},${result.backward},${result.undo},${result.redo},${![11,13].includes(scenario)}},`);
   }
  }
  fs.writeFileSync(path.join(__dirname,'../tests/fixtures/entry_history_browser.h'),`#pragma once\n// Actual Edge ${await browser.version()} input local edit history.\n// Regenerate: node native/scripts/capture-entry-history.cjs\nnamespace moon {\nstruct EntryHistoryBrowserCase {int scenario;const char32_t* initial;int anchor,caret;const char32_t* action;const char32_t* text;int start,end;bool backward,undo,redo,compare;};\ninline const EntryHistoryBrowserCase entryHistoryBrowserCases[]{\n${rows.join('\n')}\n};\n}\n`);
  console.log(`Captured ${rows.length} input history/navigation observations (${records.filter(r=>![11,13].includes(r.scenario)).length} normative).`);
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
