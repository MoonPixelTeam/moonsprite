// Execute the actual legacy predicate for every combination of its ten flags.
const fs=require('fs'),path=require('path');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const source=path.join(root,'legacy/src/renderer/src/core/eyedropper-quick-select.ts');
(async()=>{
 const module=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(fs.readFileSync(source,'utf8'))).toString('base64'));
 const fields=['enabled','shortcutMatched','repeat','pointerVisible','activeDocument','dragActive','spaceHeld','modifierChordActive','canvasContextBlocked','interactionBlocked'];
 const cases=Array.from({length:1024},(_,bits)=>{
  const context=Object.fromEntries(fields.map((field,i)=>[field,Boolean(bits&(1<<i))]));
  return module.shouldQuickSelectEyedropper(context)?'1':'0';
 }).join('');
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,cases+'\n');
 console.log('1024 actual legacy quick-select contexts');
})().catch(error=>{console.error(error);process.exitCode=1;});
