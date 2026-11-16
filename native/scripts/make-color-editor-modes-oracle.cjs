// Execute the real legacy defaults, normalizer and generic preference reorder.
const fs=require('fs'),path=require('path'),vm=require('vm');
const {stripTypeScriptTypes}=require('node:module');
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);
const preferences=fs.readFileSync(path.join(root,'legacy/src/renderer/src/core/file-preferences.ts'),'utf8');
const dialog=fs.readFileSync(path.join(root,'legacy/src/renderer/src/components/dialogs/PreferencesDialog.tsx'),'utf8');
const defaults=preferences.slice(preferences.indexOf('export const DEFAULT_COLOR_EDITOR_MODES:'),preferences.indexOf('export type OnionSkinScope'));
const parser=preferences.slice(preferences.indexOf('export function parseColorEditorModes('),preferences.indexOf('export function parseOnionSkinPreferences('));
const reorder=dialog.slice(dialog.indexOf('function reorderPreferenceItems<'),dialog.indexOf('function PreferenceGroup('));
const code=stripTypeScriptTypes((defaults+parser+reorder).replaceAll('export ',''));
const context=vm.createContext({});vm.runInContext(code,context);
const parse=value=>vm.runInContext(`parseColorEditorModes(${JSON.stringify(value)})`,context);
const encode=items=>items.map(item=>`${item.mode} ${item.enabled?'true':'false'} `).join('');
const ids=['hsv','rgb','lab','gray','palette','hsl','cmyk'];
const cases=[[],[{mode:'bad'}],[{mode:'rgb',enabled:false},{mode:'rgb',enabled:true}],ids.map(mode=>({mode,enabled:false})),['rgb','hsv','hsl','gray','lab','cmyk'].map(mode=>({mode,enabled:true})),[{mode:'hsl',enabled:null},{mode:'cmyk',enabled:0},{mode:'rgb',enabled:'false'}]];
function permutations(items,prefix=[]){if(!items.length){cases.push(prefix.map((mode,i)=>({mode,enabled:i%3!==0})));return;}for(let i=0;i<items.length;++i)permutations(items.filter((_,at)=>at!==i),[...prefix,items[i]]);}
permutations(ids);
const lines=[];
for(const items of cases){const typed=items.map(item=>({mode:item.mode,enabled:item.enabled!==false}));lines.push(['N',encode(typed),encode(parse(JSON.stringify(items)))].map(JSON.stringify).join(' '));}
// Invalid JSON falls back to defaults in legacy; native has a separate line codec.
for(const invalid of [null,'','bad','{}','null','5'])if(encode(parse(invalid))!==encode(parse('[]')))throw Error('Unexpected legacy fallback');
const initial=ids.map((mode,i)=>({mode,enabled:i%2===0}));
for(const source of [...ids,'bad'])for(const target of [...ids,'bad'])for(const after of [false,true]){
 context.items=initial;context.source=source;context.target=target;context.after=after;
 const expected=vm.runInContext('reorderPreferenceItems(items,source,target,after,item=>item.mode)',context);
 lines.push(['R',source,target,after?'true':'false',encode(expected)].map(JSON.stringify).join(' '));
}
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,lines.join('\n')+'\n');
console.log(`${cases.length} actual legacy mode normalization cases, 128 reorder cases`);
