// Evaluate the unchanged self-contained preference section from the legacy file.
const fs=require('fs'),vm=require('vm'),crypto=require('crypto');
const {stripTypeScriptTypes}=require('node:module');
const source='legacy/src/renderer/src/core/file-preferences.ts';
const full=fs.readFileSync(source,'utf8');
const section=full.slice(full.indexOf('export const QUICK_COMMAND_IDS ='),full.indexOf('export interface CheckerboardPreferences'));
const context=vm.createContext({});
vm.runInContext(stripTypeScriptTypes(section.replace(/^export /gm,''),{mode:'transform'})+'\nglobalThis.api={parseQuickCommandBars,parseQuickCommandPreferences,DEFAULT_QUICK_COMMAND_BARS,QUICK_COMMAND_IDS,PREVIOUS_DEFAULT_QUICK_COMMAND_GROUPS,EARLIER_DEFAULT_QUICK_COMMAND_GROUPS,RECENT_DEFAULT_QUICK_COMMAND_GROUPS,createQuickCommandPreferences};',context);
const a=context.api;
const inputs=['','null','{}','[null,3]','[{}]',JSON.stringify([{id:'custom',name:'  custom  ',edge:'bad',position:4,expanded:1,commands:[{id:'copy',enabled:true},{id:'copy',enabled:false},{id:'bogus',enabled:true}]}])];
for(const groups of [a.PREVIOUS_DEFAULT_QUICK_COMMAND_GROUPS,a.EARLIER_DEFAULT_QUICK_COMMAND_GROUPS,a.RECENT_DEFAULT_QUICK_COMMAND_GROUPS])inputs.push(JSON.stringify(a.DEFAULT_QUICK_COMMAND_BARS.map((b,i)=>({...b,name:'Custom '+i,commands:a.createQuickCommandPreferences(groups[i])}))));
inputs.push(JSON.stringify([{id:'quick-command-bar-2',name:'Quick Command Bar 1',commands:[]},{id:'quick-command-bar-2',name:'duplicate'},{id:'extra',name:'快捷指令栏 2',edge:'none',commands:a.createQuickCommandPreferences(['undo','redo','resetView','rotateViewClockwise90','rotateViewCounterClockwise90'])}]));
inputs.push(JSON.stringify([null,null,null,null,{}]));
inputs.push(JSON.stringify([{id:' z ',name:'\ufeff😀'.repeat(30)+'\u3000',edge:'left',position:-1,expanded:true,commands:a.QUICK_COMMAND_IDS.map(id=>({id,enabled:false}))}]));
let seed=71291;function random(){return seed=(Math.imul(seed,1664525)+1013904223)>>>0;}
for(let n=0;n<100;n++)inputs.push(JSON.stringify(Array.from({length:random()%8},(_,i)=>({id:random()%3?'id'+(random()%5):'',name:random()%2?'  My '+i+'  ':null,edge:['top','right','bottom','left','none','invalid'][random()%6],position:(random()%400-150)/100,expanded:random()%2===0,commands:Array.from({length:random()%45},()=>({id:[...a.QUICK_COMMAND_IDS,'unknown'][random()%39],enabled:random()%3===0?true:random()%2}))}))));
const literal=s=>'R"QC('+s+')QC"';
const rows=inputs.map(input=>'{'+literal(input)+','+literal(JSON.stringify(a.parseQuickCommandBars(input)))+'}');
const commandInputs=['','null','{}','[]','[false,{}, {"id":"copy","enabled":true},{"id":"copy","enabled":false}]',JSON.stringify(a.QUICK_COMMAND_IDS.map(id=>({id,enabled:false})))];
fs.writeFileSync('native/tests/fixtures/quick_command_legacy.h','// Unchanged legacy preference section SHA256 '+crypto.createHash('sha256').update(full).digest('hex')+'\n#pragma once\nstruct QuickOracle {const char* input;const char* expected;};\ninline const QuickOracle quickBarOracle[]={\n'+rows.join(',\n')+'\n};\ninline const QuickOracle quickCommandOracle[]={\n'+commandInputs.map(input=>'{'+literal(input)+','+literal(JSON.stringify(a.parseQuickCommandPreferences(input)))+'}').join(',\n')+'\n};\n');
console.log(inputs.length+' bar / '+commandInputs.length+' command cases');

const dialog=fs.readFileSync('legacy/src/renderer/src/components/dialogs/PreferencesDialog.tsx','utf8');
const reorderSource=dialog.slice(dialog.indexOf('function reorderPreferenceItems<'),dialog.indexOf('\n}',dialog.indexOf('function reorderPreferenceItems<'))+2);
vm.runInContext(stripTypeScriptTypes(reorderSource,{mode:'transform'})+'\nglobalThis.reorder=reorderPreferenceItems;',context);
const reorderCases=[];
for(const source of ['cut','copy','paste','unknown'])for(const target of ['cut','copy','paste','unknown'])for(const after of [false,true]){const items=[{id:'cut',enabled:true},{id:'copy',enabled:false},{id:'paste',enabled:true}];const next=context.reorder(items,source,target,after,item=>item.id);reorderCases.push('{"'+source+'","'+target+'",'+after+','+literal(JSON.stringify(next))+'}');}
fs.appendFileSync('native/tests/fixtures/quick_command_legacy.h','struct ReorderOracle {const char* source;const char* target;bool after;const char* expected;};\ninline const ReorderOracle reorderOracle[]={\n'+reorderCases.join(',\n')+'\n};\n');
console.log(reorderCases.length+' unchanged legacy reorder cases');
