// Execute actual legacy geometry; only module/type syntax is removed.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(root, 'legacy/src/renderer/src', name), 'utf8');
const context = vm.createContext({});
const evaluate = source => vm.runInContext(stripTypeScriptTypes(source.replace(/^import .*\r?\n/gm, '').replace(/^export /gm, ''), { mode: 'transform' }), context);
evaluate(read('core/canvas-input-resize.ts'));
const view = read('core/view-geometry.ts');
evaluate(view.slice(view.indexOf('export function rotateViewportPoint('), view.indexOf('export function mirrorViewportPoint(')));
evaluate(read('components/canvas-reference-geometry.ts'));
const hit = read('core/canvas-input-hit-test.ts');
evaluate(hit.slice(hit.indexOf('export const SELECTION_RESIZE_HIT_RADIUS'), hit.indexOf('export const selectionPivotHit')));
evaluate(hit.slice(hit.indexOf('export const selectionResizeHit ='), hit.indexOf('export const selectionInteractionHit =')));
const output = vm.runInContext(`(() => {
 const rows = [];
 for (const angle of [0, 37, 90, -145]) for (const flipX of [false, true]) for (const flipY of [false, true]) {
  const start = {x:-20.5,y:10.25,width:31,height:17,angle,flipX,flipY};
  const prefix = [start.x,start.y,start.width,start.height,angle,+flipX,+flipY];
  for (const handle of ['nw','n','ne','w','e','sw','s','se']) for (const dx of [-76,-.5,0,8,79]) for (const dy of [-51,0,9.25]) for (const integer of [false,true]) for (const center of [false,true]) {
   const r=resizeReferenceBounds(start,{x:dx,y:dy},handle,integer,center);
   rows.push(['R',...prefix,dx,dy,handle,+integer,+center,r.x,r.y,r.width,r.height,+(flipX!==Boolean(r.flipHorizontal)),+(flipY!==Boolean(r.flipVertical))]);
  }
  for(let y=-40;y<70;y+=7.25) for(let x=-55;x<50;x+=6.75) {
   const p={x,y},r=referenceSourcePoint(start,p,7,5);
   rows.push(['S',...prefix,x,y,r?r.x:-1,r?r.y:-1]);
   const local=unrotateViewportPoint(p,{x:start.x+start.width/2,y:start.y+start.height/2},angle);
   for(const scale of [.25,1,2]) {
    const h=selectionResizeHit(start,local,12*scale,18*scale,5*scale)??selectionRotationHit(start,local,scale);
    rows.push(['H',...prefix,x,y,scale,h??'-']);
   }
  }
 }
 return rows.map(r=>r.join(' ')).join('\\n')+'\\n';
})()`, context);
if (!process.argv[2]) throw new Error('Expected output path');
fs.writeFileSync(path.resolve(process.argv[2]), output);
console.log(`Actual legacy canvas reference oracle: ${output.trim().split('\n').length} cases`);
