// Execute the actual legacy layout module; strip TypeScript only.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(__dirname,'../..');let sequence=0;
const context=vm.createContext({crypto:{randomUUID:()=>String(++sequence)}});
const source=fs.readFileSync(path.join(root,'legacy/src/renderer/src/core/document-pane-layout.ts'),'utf8');
vm.runInContext(stripTypeScriptTypes(source.replace(/^export /gm,''),{mode:'transform'}),context);
const output=vm.runInContext(String.raw`(()=>{
 const encode=n=>!n?'#':n.kind==='leaf'?'L('+n.id+','+n.documentId+')':'S('+n.id+','+n.orientation+','+n.ratio.toPrecision(17)+','+encode(n.first)+','+encode(n.second)+')';
 const rows=[];let n=createDocumentPaneLayout('a');
 const add=(op,args,action)=>{n=action();rows.push(op+' '+args.join(' ')+'|'+encode(n));};
 rows.push('C a|'+encode(n));
 for(let i=0;i<120;++i){
  const ids=documentPaneLeafIds(n),target=ids[i%ids.length],document='d'+i,direction=['left','right','top','bottom'][i%4];
  add('I',[target,document,direction],()=>insertDocumentPane(n,target,document,direction));
  if(i%3===0){const leaves=documentPaneLeafIds(n);add('M',[leaves[0],document,direction],()=>moveDocumentPane(n,leaves[0],document,direction));}
  if(i%4===0){const ratio=[-.7,.21,1.5,.6][i%4];add('Z',[n.id,ratio],()=>resizeDocumentPane(n,n.id,ratio));}
  if(i%5===0){const id=documentPaneLeafIds(n)[1];add('R',[id,'r'+i],()=>replaceDocumentPaneDocument(n,id,'r'+i));}
  if(i%2===0&&documentPaneLeafIds(n).length>3){const id=documentPaneLeafIds(n)[0];add('D',[id],()=>removeDocumentPane(n,id));}
  add('I',['missing',document,direction],()=>insertDocumentPane(n,'missing',document,direction));
 }
 return rows.join('\n')+'\n';
})()`,context);
fs.writeFileSync(process.argv[2],output);console.log(output.trim().split('\n').length+' actual legacy layout transitions');
