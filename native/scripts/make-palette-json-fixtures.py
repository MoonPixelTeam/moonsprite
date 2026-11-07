"""Run actual legacy serde JSON palette functions, using lockfile versions offline."""
from pathlib import Path
import hashlib
import json
import subprocess
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/"legacy/src-tauri/src/platform_palette.rs"
OWNED=ROOT/"native/build/palette-json-oracle-owned"
OUTPUT=ROOT/"native/tests/fixtures/palette_json_legacy.h"
(OWNED/"src").mkdir(parents=True,exist_ok=True)
source=SOURCE.read_text(encoding="utf-8")
def region(a,b):return source[source.index(a):source.index(b,source.index(a))]
legacy=region("#[derive(Debug, Clone, Serialize, Deserialize)]","#[derive(Debug, Serialize)]\n#[serde(rename_all = \"camelCase\")]\npub(crate) struct PaletteListing")
legacy+=region("fn parse_palette_color(","fn palette_color_hex(")
legacy+=region("fn valid_palette_id(","fn palette_slug(")
legacy+=region("fn validate_palette_layout(","fn read_palette(")
legacy+=region("struct ImportedPalette {","fn imported_palette_name(")
legacy+=region("fn linear_imported_palette(","fn text_imported_colors(")
driver=r"""
use serde::{Serialize,Deserialize};
const MAX_IMPORTED_PALETTE_COLORS:usize=65536;const IMPORTED_PALETTE_COLUMNS:u32=16;
fn main(){let input=std::fs::read(std::env::args().nth(1).unwrap()).unwrap();let cases:Vec<String>=serde_json::from_slice(&input).unwrap();let direct=std::env::args().nth(2).is_some();let output:Vec<_>=cases.iter().map(|s|{
let result=if direct {serde_json::from_slice::<PaletteDiskFile>(s.as_bytes()).map_err(|e|e.to_string()).and_then(|f|stored_palette_from_file(f,String::new(),false,"oracle")).map(|p|ImportedPalette{name:p.name,colors:p.colors,columns:p.columns.unwrap_or(0),slots:p.slots.unwrap_or_default(),names:p.names})}else{json_imported_palette(s.as_bytes(),"Fallback".to_string(),"oracle")};
match result{Ok(p)=>serde_json::json!({"name":p.name,"colors":p.colors,"columns":p.columns,"slots":p.slots,"names":p.names}),Err(_)=>serde_json::Value::Null}}).collect();println!("{}",serde_json::to_string(&output).unwrap());}
"""
(OWNED/"Cargo.toml").write_text('[package]\nname="palette-json-legacy-oracle"\nversion="0.1.0"\nedition="2021"\n[workspace]\n[dependencies]\nserde={version="=1.0.229",features=["derive"]}\nserde_json="=1.0.151"\n',encoding="utf-8")
(OWNED/"src/main.rs").write_text(driver+legacy,encoding="utf-8")
cases=[]
def add(value):cases.append(json.dumps(value,ensure_ascii=True,separators=(",",":")))
for value in [None,True,{},[],[None,False,"bad"],{"colors":False,"palette":["112233"],"swatches":["445566"]}]:add(value)
channels=[-1,0,.001,.5,1,1.5,17,127.5,255,255.1,256,None,"1",False]
for value in channels:
 for index in range(4):
  rgba=[17,34,51,128];rgba[index]=value;add([rgba])
for value in channels:
 add([{ "r":value,"g":.5,"b":1,"a":.5}])
for obj in [{"r":None,"R":17,"g":34,"b":51},{"R":17,"G":34,"B":51},{"r":17,"b":34,"a":51},{"g":17,"b":34,"a":51},{"r":17,"g":34,"b":51,"a":"bad"}]:add([obj])
for a in [[0,0,0],[1,.5,0],[1,.5,0,2],[1,.5,0,-1],[17,34,51,128,"ignored"],[17,34],[17,34,51,True],[17,34,51,None],[17,34,51,128,False]]:add([a])
base={"schemaVersion":2,"id":"oracle","name":"Native","colors":["11223300","445566FF"],"columns":2,"slots":[1,0],"names":["one","two"]}
add(base)
for key,values in {"schemaVersion":[0,1,2,3,2.0,2e0,-1,4294967296,"2",None],"id":["",96*"a",97*"a","bad/path",None,17],"name":[""," \u0085 ",None,17,"  Kept  "],"columns":[None,0,1,2,2.0,2.5,256,257,-1,"2"],"slots":[None,[],[0,1],[1,0],[0,0],[0,None],[0,2],[0.0,1.0],[0.5,1],[-1,0],[18446744073709551616,0],[0,1,None]],"names":[None,[],["short"],["one","two","long"],[1],False]}.items():
 for value in values:
  p=base.copy();p[key]=value;add(p)
 p=base.copy();del p[key];add(p)
for size in [1,15,16,17,31,32,33]:add({"schemaVersion":1,"id":"v1","name":"V1","colors":["112233"]*size,"columns":None,"slots":None,"names":None})
# Preserve lexical integer distinctions and duplicate fields, which serde typed decode observes.
for field,value in [("schemaVersion","2.0"),("schemaVersion","2e0"),("columns","2.0"),("slots","[0.0,1.0]"),("slots","[18446744073709551616,0]")]:
 raw=json.dumps(base,separators=(",",":"));old=json.dumps(base[field],separators=(",",":"));raw=raw.replace('"'+field+'":'+old,'"'+field+'":'+value);cases.append(raw)
for field in ["schemaVersion","id","name","colors","columns","slots","names"]:
 raw=json.dumps(base,separators=(",",":"));cases.append('{"'+field+'":'+json.dumps(base[field])+','+raw[1:])
for raw in ['{"colors":["112233"],"colors":["445566"]}','[1e999,"112233"]','["\\ud800","112233"]','["+11223","#11223300"]'] :cases.append(raw)
cases.append(json.dumps(base,separators=(",",":")).replace('"schemaVersion"','"schema\\u0056ersion"'))
cases.append('{"schema\\u0056ersion":2,'+json.dumps(base,separators=(",",":"))[1:])
add({"colors":["112233"],"ignored":"emoji \U0001f600 quote \" slash \\"})
cases.extend(['["\\udc00","112233"]','["\\ud800\\ud800","112233"]','["\\ud83d\\ude00","112233"]'])
seed=0x89abcdef
def rand():
 global seed
 seed=(seed*1664525+1013904223)&0xffffffff
 return seed
for i in range(96):
 rgba=[channels[rand()%len(channels)]for _ in range(4)]
 add({["colors","palette","swatches"][i%3]:[rgba,"112233",{"r":rgba[0],"g":rgba[1],"b":rgba[2],"a":rgba[3]}]})
(OWNED/"input.json").write_text(json.dumps(cases),encoding="utf-8")
subprocess.run(["cargo","--config",str(ROOT/"legacy/.cargo/config.toml"),"build","--offline","--release","--manifest-path",str(OWNED/"Cargo.toml")],check=True)
results=json.loads(subprocess.run([str(OWNED/"target/release/palette-json-legacy-oracle.exe"),str(OWNED/"input.json")],capture_output=True,check=True).stdout)
directResults=json.loads(subprocess.run([str(OWNED/"target/release/palette-json-legacy-oracle.exe"),str(OWNED/"input.json"),"direct"],capture_output=True,check=True).stdout)
rows=[]
for text,p in zip(cases+cases,results+directResults):
 encoded='{'+','.join(str(b)for b in text.encode())+'}'
 if p is None:rows.append('{'+encoded+',false,"",{},0,{},false,{}}');continue
 colors=[c['r']|(c['g']<<8)|(c['b']<<16)|(c['a']<<24)for c in p['colors']]
 def string(s):return 'std::string({'+','.join('char('+str(b)+')'for b in s.encode())+'})'
 rows.append('{'+encoded+',true,'+string(p['name'])+',{'+','.join(hex(c)+'u'for c in colors)+'},'+str(p['columns'])+',{'+','.join(str(c)if c is not None else '-1'for c in p['slots'])+'},'+('true'if p['names']is not None else 'false')+',{'+','.join(string(s)for s in p['names']or [])+'}}')
header='#pragma once\n// Generated from actual legacy Rust/serde by make-palette-json-fixtures.py.\n// Source SHA256: '+hashlib.sha256(SOURCE.read_bytes()).hexdigest()+'\nstruct LegacyJsonPaletteFixture{std::vector<std::uint8_t> bytes;bool accepted;std::string name;std::vector<moon::Pixel> colors;int columns;std::vector<int> slots;bool hasNames;std::vector<std::string> names;};\ninline const std::vector<LegacyJsonPaletteFixture> legacyJsonPaletteFixtures={\n'+',\n'.join(rows)+'\n};\n'
header+='inline constexpr std::size_t legacyJsonImportCaseCount='+str(len(cases))+';\n'
OUTPUT.write_text(header,encoding="utf-8",newline="\n")
print(f"Generated {len(cases)} import and {len(cases)} direct legacy JSON cases")
