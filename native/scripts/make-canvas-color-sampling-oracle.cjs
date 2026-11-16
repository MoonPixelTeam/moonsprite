// Run the complete legacy router with deterministic DOM/hit-test ports.
const fs=require('fs'),path=require('path'),vm=require('vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const file=path.join(root,'legacy/src/renderer/src/core/canvas-color-sampling.ts');
const source=stripTypeScriptTypes(fs.readFileSync(file,'utf8')).replace(/export /g,'');
const rgba=p=>({r:p&255,g:(p>>>8)&255,b:(p>>>16)&255,a:p>>>24});
const pack=c=>((c.a<<24)|(c.b<<16)|(c.g<<8)|c.r)>>>0;
let context,canvases,remove,events,hit,fallback,result,rows=[];
function reset(){
  events=[];remove=new Map();hit=0;fallback=false;
  class Canvas{constructor(){this.classList={contains:name=>name==='stage-canvas'};}}
  canvases=[null,new Canvas(),new Canvas(),new Canvas(),new Canvas()];
  context=vm.createContext({HTMLCanvasElement:Canvas,document:{elementsFromPoint:()=>fallback?[]:[{},canvases[hit]],elementFromPoint:()=>canvases[hit]}});
  vm.runInContext(source,context);
}
function run(command){
  const [op,...a]=command.split(' ');result='-';
  if(op==='N')reset();
  if(op==='A'){
    const [id,key,pixel]=a;context.surface={canvas:canvases[+key],sampleAtClientPoint:(x,y)=>{events.push(`s${id}:${x}:${y}`);return pixel==='null'?null:rgba(+pixel)},setSamplingCursor:value=>events.push(`c${id}:${+value}`)};
    remove.set(+id,vm.runInContext('registerCanvasColorSamplingSurface(surface)',context));
  }
  if(op==='H'){hit=+a[0];fallback=!!+a[1];}
  if(op==='D')remove.get(+a[0])();
  if(op==='B'){context.begin={sourceCanvas:canvases[+a[0]],pointerId:+a[1],onSample:(c,x,y)=>events.push(`a${pack(c)}:${x}:${y}`)};vm.runInContext('beginCanvasColorSampling(begin)',context);}
  if(op==='E')vm.runInContext(a.length?`endCanvasColorSampling(${a[0]})`:'endCanvasColorSampling()',context);
  if(op==='I'){
    context.intent={sourceCanvas:canvases[+a[0]],onSample:(c,x,y,secondary)=>events.push(`i${pack(c)}:${x}:${y}:${+secondary}`)};
    vm.runInContext('setCanvasColorSamplingIntent(intent)',context);
  }
  if(op==='C'){context.owner=canvases[+a[0]];vm.runInContext('clearCanvasColorSamplingIntentFor(owner)',context);}
  if(op==='Z')vm.runInContext('setCanvasColorSamplingIntent(null)',context);
  if(op==='S'){const c=vm.runInContext('sampleCanvasColorAtClientPoint(17,29)',context);result=c?String(pack(c)):'null';}
  if(op==='R')result=String(+vm.runInContext('routeCanvasColorSampling(17,29)',context));
  if(op==='T')result=String(+vm.runInContext(`routeCanvasColorSamplingIntent(17,29,${!!+a[0]})`,context));
  context.canvases=canvases;
  const flags=vm.runInContext('[1,2,3].map(i=>+canvasColorSamplingActiveFor(canvases[i])).join(\'\')+\':\'+(+canvasColorSamplingIntentActive())',context);
  rows.push(`${command} | ${result} ${flags} ${events.join(',')}`);
}
const scenarios=[
  ['N','A 1 1 4278190081','A 2 2 2150834705','H 2 0','S','R','B 1 7','R','H 1 0','R','H 0 0','R','H 2 1','R','E 8','R','E 7','R'],
  ['N','A 1 1 11','I 1','A 2 2 0','A 3 3 null','H 1 0','T 0','H 2 0','T 1','H 3 0','T 0','C 2','T 1','C 1','T 1','S'],
  ['N','A 1 1 1','A 2 2 2','A 3 3 null','B 1 0','H 2 0','R','H 3 0','R','D 3','H 2 0','R','B 2 8','H 1 0','R','D 2','R','E'],
  ['N','A 1 1 1','A 2 2 2','I 1','B 1 4','H 2 0','R','Z','E','I 1','B 1 9','H 2 0','R','E','C 1'],
  ['N','A 1 1 1','A 2 2 2','A 3 2 3','H 2 0','S','D 2','S','H 4 0','S','B 1 1','R','H 2 0','R','D 1','R','E']
];
for(const scenario of scenarios)for(const command of scenario)run(command);
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,rows.join('\n')+'\n');
console.log(`${rows.length} actual legacy canvas router snapshots generated.`);
