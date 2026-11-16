// Execute the actual legacy RAF/async functions with controlled platform ports.
const fs=require('fs'),path=require('path'),vm=require('vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const source=fs.readFileSync(path.join(root,'legacy/src/renderer/src/components/ColorValueControl.tsx'),'utf8');
const functions=source.slice(source.indexOf('  const setGlobalSampling ='),source.indexOf('  const toggleEditor ='));
const same=source.match(/^const sameColor = .*$/m)[0];
const pack=c=>((c.a<<24)|(c.b<<16)|(c.g<<8)|c.r)>>>0;
const color=p=>({r:p&255,g:(p>>>8)&255,b:(p>>>16)&255,a:p>>>24});
let c,requests,colors,lens,frames,finishes,enabled,rows=[];
function reset(){
 requests=[];colors=[];lens=null;frames=new Map;finishes=0;enabled=true;let id=0;
 const ref=current=>({current});
 c=vm.createContext({globalSamplingRef:ref(false),globalSampleSequenceRef:ref(0),globalSamplingEpochRef:ref(0),globalSampleFrameRef:ref(null),globalSampleQueueRef:ref({pending:null,running:false}),globalPointerRef:ref(null),globalMagnifierSettingsRef:ref({eyedropperMagnifierEnabled:true}),globalMagnifierRef:ref(null),workingColorRef:ref(color(0)),GLOBAL_EYEDROPPER_MAGNIFIER_RADIUS:5,
  document:{documentElement:{dataset:{}}},loadEditorPreferences:()=>({eyedropperMagnifierEnabled:enabled}),setGlobalMagnifierSettings:()=>{},
  setGlobalMagnifier:value=>{lens=value;c.globalMagnifierRef.current=value?{style:{set left(v){lens.clientX=parseFloat(v)},set top(v){lens.clientY=parseFloat(v)}}}:null;},
  applyEditorColor:value=>{c.workingColorRef.current=value;colors.push(pack(value));},
  sampleColorPickerAtClientPoint:(x,y)=>x>=60&&x<=90?{color:x===81?null:color((0xff322800|x)>>>0)}:null,
  globalMagnifierHiddenAt:(x,y)=>x>=60&&x<=90,
  sampleCanvasColorAtClientPoint:(x,y)=>x>=100&&x<=110?color(0x80332211):null,
  canvasColorGridAt:(x,y,center)=>Array.from({length:121},()=>center),fallbackUiColorAt:(x,y)=>x===200?color(0xffaabbcc):null,
  eyedropperMagnifierPosition:(point)=>({left:point.x,top:point.y}),
  window:{innerWidth:1280,innerHeight:960,requestAnimationFrame:callback=>{frames.set(++id,callback);return id},cancelAnimationFrame:id=>frames.delete(id),moonSprite:{sampleWindowColorRegion:(x,y)=>new Promise(resolve=>requests.push({resolve,region:true})),sampleWindowColor:(x,y)=>new Promise(resolve=>requests.push({resolve,region:false}))}}
 });
 vm.runInContext(stripTypeScriptTypes(same+'\n'+functions),c);
}
async function drain(){for(let i=0;i<8;++i)await Promise.resolve();}
function snapshot(){return `${colors.length}${colors.map(p=>','+p).join('')} ${lens?1:0} ${lens?lens.clientX:0} ${lens?lens.clientY:0} ${lens?pack(lens.pixels[60]):0} ${requests.length} ${finishes}`;}
async function step(command){const [op,...args]=command.split(' ').map((v,i)=>i?parseFloat(v):v);
 if(op==='N')reset();
 if(op==='B'){enabled=!!args[1];c.workingColorRef.current=color(args[0]);vm.runInContext('setGlobalSampling(true)',c);}
 if(op==='Q')vm.runInContext(`queueGlobalColorSample(${args[0]},${args[1]})`,c);
 if(op==='F'){const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback(0);}
 if(op==='D'){const r=requests[args[0]];r.resolve(r.region?Array.from({length:121},()=>color(args[1])):color(args[1]));}
 if(op==='U'){c.releaseX=args[0];c.releaseY=args[1];c.finished=()=>++finishes;vm.runInContext('setGlobalSampling(false); { const sequence=++globalSampleSequenceRef.current; void sampleGlobalColor(releaseX,releaseY,sequence,false,false).finally(()=>{if(sequence===globalSampleSequenceRef.current)finished()}) }',c);}
 if(op==='C'){vm.runInContext('setGlobalSampling(false)',c);++finishes;}
 await drain();rows.push(`${command} | ${snapshot()}`);
}
(async()=>{
 const scenarios=[
 ['N','B 4278387201 1','Q 300 300','F','Q 400 300','F','D 0 4278190120','Q 500 300','F','D 1 4278190130','U 550 300','D 3 4278781959','D 2 4278190179'],
 ['N','B 4278387201 0','Q 30 30','F','Q 60 30','Q 80 30','F','D 0 4278190335','Q 80 30','F','U 90 30'],
 ['N','B 0 1','Q 81 20','F','Q 105 20','F','C'],
 ['N','B 0 0','Q 300 20','F','C','D 0 4288252023']
 ];
 for(const scenario of scenarios)for(const command of scenario)await step(command);
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,rows.join('\n')+'\n');console.log(`${rows.length} actual legacy asynchronous snapshots generated.`);
})().catch(error=>{console.error(error);process.exitCode=1});
