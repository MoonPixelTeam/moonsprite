// Executes the actual private legacy helpers, extracted without rewriting them.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../..');
const service=fs.readFileSync(path.join(root,'legacy/src/renderer/src/store/local-history-service.ts'),'utf8');
const preferences=fs.readFileSync(path.join(root,'legacy/src/renderer/src/core/file-preferences.ts'),'utf8');
const extract=(text,start,end)=>{const begin=text.indexOf(start);if(begin<0)throw Error('Missing legacy helper '+start);const finish=text.indexOf(end,begin);if(finish<0)throw Error('Missing legacy helper end '+start);return text.slice(begin,finish);};
const keySource=extract(service,'const historyId =','/**\n * Saving');
const clampSource=service.match(/^const clampPosition = .*$/m)?.[0];if(!clampSource)throw Error('Missing clampPosition');
const windowSource=extract(service,'  const retainedHistoryOffset =','  const entries: HistoryEntry[]');
const fingerprintSource=extract(service,'const documentFingerprint =','const clampPosition =');
const limitSource=extract(preferences,'export function parseLocalHistoryLimit','export function parseHistoryLimit').replace('export ','');
const context={result:{},DEFAULT_EDITOR_PREFERENCES:{localHistoryLimit:50}};
vm.runInNewContext(stripTypeScriptTypes(keySource+'\n'+clampSource+'\n'+fingerprintSource+'\n'+limitSource+`
Object.assign(result,{historyId,documentFingerprint,parseLocalHistoryLimit,window:(totalEntries,rawPosition,limit)=>{
const manifest={labels:Array(totalEntries)},position=clampPosition(rawPosition,manifest.labels);
const restoredStack={entryLimit:limit};
${windowSource}
return {begin:retainedHistoryOffset,end:retainedHistoryEnd,position:Math.max(0,position-retainedHistoryOffset)};
}});`),context);
const {historyId,documentFingerprint,parseLocalHistoryLimit,window}=context.result;
const documents=[
 {filePath:'D:/Art/Test.moonsprite',sourceFilePath:'D:/source.png',id:'runtime-a'},
 {filePath:'d:/art/test.moonsprite',sourceFilePath:'other',id:'runtime-b'},
 {filePath:'',sourceFilePath:'D:\\中文目录\\动画😀.PNG',id:'runtime-c'},
 {filePath:'',sourceFilePath:'',id:'Temporary-ID'},
 {filePath:'  \t\uFEFFD:/图像/İIΣΟΣ𐐀.MOONSPRITE\u3000\r\n',sourceFilePath:'',id:'x'},
 {filePath:'\u00a0\u2007\u202f  ',sourceFilePath:'must-not-use',id:'must-not-use'},
 {filePath:'D:/a/b',sourceFilePath:'',id:'x'},
 {filePath:'D:\\a\\b',sourceFilePath:'',id:'x'},
 {filePath:'D:/a/../b',sourceFilePath:'',id:'x'},
 {filePath:'',sourceFilePath:'',id:''},
 {filePath:'D:/é.png',sourceFilePath:'',id:'x'},
 {filePath:'D:/e\u0301.png',sourceFilePath:'',id:'x'},
 {filePath:'D:/folder\u0000tail',sourceFilePath:'',id:'x'},
];
const locale=new Intl.DateTimeFormat().resolvedOptions().locale;
const keys=documents.map(document=>({...document,locale,expected:historyId(document)}));
const steps=[null,'',' ','50','0','-5','1.49','1.5','199.5','300','Infinity','NaN','0x20','0b11','1e2','１２','\u20092.5\uFEFF'].map(text=>({text,expected:parseLocalHistoryLimit(text)}));
const windows=[];
for(const total of [0,1,2,5,8,50,200])for(const position of [-3,0,1,2,total/2,total,total+5])for(const limit of [1,2,3,10,50,Infinity])windows.push({total,position,limit:Number.isFinite(limit)?limit:null,expected:window(total,position,limit)});
const documentsForFingerprint=[
 {updatedAt:'2026-11-03T01:02:03.456Z',width:1024,height:512,colorMode:'rgba',layers:[{id:'layer-1',width:2,height:3,offsetX:-10,offsetY:20,format:'rgba'}],animation:{activeFrameId:'frame-2'}},
 {updatedAt:'中文\\\"\n/\u2028\u2029',width:1,height:1,colorMode:'indexed',layers:[{id:'café/😀',width:1,height:1,offsetX:0,offsetY:0,format:'indexed'},{id:'\\tab\tcontrol\u0000',width:5,height:6,offsetX:-1,offsetY:-2,format:'rgba'}]},
];
const fingerprints=documentsForFingerprint.map(document=>({...document,expected:documentFingerprint(document)}));
const output=path.resolve(process.argv[2]);fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify({keys,steps,windows,fingerprints},null,2));
console.log(`Actual legacy policy fixtures: ${keys.length} identities, ${steps.length} settings, ${windows.length} restore windows (${locale})`);
