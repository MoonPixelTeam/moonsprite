const fs=require('fs'),vm=require('vm'),{execFileSync}=require('child_process');const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('legacy/src/renderer/src/core/extension-file-drop.ts','utf8');
const events=[],errors=[];let available=true;
const context=vm.createContext({dispatchExtensionRuntimeEvent:(id,event)=>{if(!available)return false;events.push({id,...event});return true;}});
vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*$/gm,'').replace(/^export /gm,''),{mode:'transform'})+';globalThis.api={set:setExtensionFileDrop,clear:clearExtensionFileDrop,accepts:acceptsExtensionFileDrop,route:routeExtensionFileDrops}',context);
const a=context.api,output=[];
(async()=>{
for(const failure of ['none','replace','remove','recreate','read','oversize','unavailable']){
 a.clear('first');a.clear('second');a.set('first',['.CUSTOM']);a.set('second',['.custom']);events.length=0;errors.length=0;available=failure!=='unavailable';
 const remaining=await a.route(['C:/pet.CUSTOM','C:/art.png'],async()=>{if(failure==='replace')a.set('first',['.custom']);if(failure==='remove')a.clear('first');if(failure==='recreate'){a.clear('first');a.set('first',['.custom']);}if(failure==='read')throw Error('read failed');return new Uint8Array(failure==='oversize'?12*1024*1024+1:[1,2]);},e=>errors.push(e));
 output.push({failure,remaining,events:JSON.parse(JSON.stringify(events)),errors:[...errors]});
 if(remaining.length!==1||remaining[0]!=='C:/art.png'||events.length!==(failure==='none'?1:0)||errors.length!==(failure==='none'?0:1))throw Error('legacy expectation '+failure);
}
const expected=output.map(r=>[r.failure,r.remaining.join(','),r.events.map(e=>e.id+':'+e.files[0].name+':'+e.files[0].bytes.join(',')).join(','),r.errors.length].join('|')).join('\n');
const actual=execFileSync(process.argv[2]||'native/build/Release/extension-locale-filedrop-tests.exe',['--oracle'],{encoding:'utf8'}).trim().replace(/\r/g,'');
if(actual!==expected)throw Error('Native/legacy route mismatch\nexpected:\n'+expected+'\nactual:\n'+actual);
console.log('7 actual legacy/native file-drop routing scenarios match');
})().catch(e=>{console.error(e);process.exitCode=1;});
