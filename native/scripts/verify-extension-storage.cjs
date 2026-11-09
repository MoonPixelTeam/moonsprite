const fs=require('fs'),vm=require('vm'),{execFileSync}=require('child_process');const {stripTypeScriptTypes}=require('node:module');
const source=fs.readFileSync('legacy/src/renderer/src/core/extension-runtime.ts','utf8');const context=vm.createContext({TextEncoder});
vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*$/gm,'').replace(/^export /gm,''),{mode:'transform'})+';globalThis.api=extensionStorage',context);
const map=new Map(),storage={get length(){return map.size},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
const one=context.api('one',storage),two=context.api('two',storage),quota=context.api('quota',storage),key=context.api('key',storage),unicode=context.api('unicode',storage);const rows=[];
one.set('value',{count:1});two.set('value',{count:2});rows.push(`namespaces|${one.get('value').count}|${two.get('value').count}`);
const max='x'.repeat(256*1024-2);for(const k of ['a','b','c','d'])quota.set(k,max);let over=0;try{quota.set('e',0)}catch{over=1}quota.set('a',max);quota.remove('d');quota.set('e',0);rows.push(`quota|${over}|${quota.list().length}|${quota.get('e')}`);
let invalid=0;for(const k of ['', 'a'.repeat(161),'a\nb','汉'.repeat(54)])try{key.set(k,0)}catch{invalid++}rows.push(`invalid|${invalid}`);unicode.set('😀',0);unicode.set('\ue000',0);rows.push(`sort|${Number(unicode.list()[0]==='😀')}`);
const actual=execFileSync('native/build/Release/extension-storage-tests.exe',['native/build/extension-storage-test-owned','--oracle'],{encoding:'utf8'}).trim().replace(/\r/g,'');if(actual!==rows.join('\n'))throw Error('Legacy/native storage mismatch\n'+actual+'\n'+rows.join('\n'));console.log('Actual legacy/native storage namespace, quota, key rejection and UTF16 sorting match');
