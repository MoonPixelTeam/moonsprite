"""Execute unchanged Rust gallery listing against the same native filesystem fixtures."""
from pathlib import Path
import hashlib,os,subprocess,time,sys
ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'legacy/src-tauri/src/platform_gallery.rs'
OWNED=ROOT/'native/build/gallery-oracle-owned'
OWNED.mkdir(parents=True,exist_ok=True)
s=SOURCE.read_text(encoding='utf-8')
functions=s[s.index('fn path_has_extension('):s.index('#[tauri::command]',s.index('fn path_has_extension('))]
folder_mode="--folders" in sys.argv
driver=r'''
use std::{fs,path::Path};
struct GalleryProject {file_path:String,file_name:String,modified_at:u64}
fn main(){let a:Vec<_>=std::env::args().collect();let rows=list_projects_in_directory(Path::new(&a[1]),&["moonsprite"],false,"图库").unwrap();for p in rows{println!("{}\t{}\t{}",p.file_name,p.modified_at,p.file_path);}}
'''
if folder_mode: driver=driver.replace('&["moonsprite"],false','&["moonsprite","ase","aseprite","psd","png","jpg","jpeg","webp","bmp","gif"],true')
(OWNED/'main.rs').write_text(driver+functions,encoding='utf-8')
subprocess.run(['rustc','--edition=2021','-O',str(OWNED/'main.rs'),'-o',str(OWNED/'gallery-oracle.exe')],check=True)
folder=OWNED/str(time.time_ns())
folder.mkdir();(folder/'test-owned.marker').write_text('Gallery oracle owned fixtures',encoding='utf-8')
for index in range(160):
 name=f'{index:03d}-画廊-'+(['a.moonsprite','B.ASE','c.aseprite','d.PSD','e.png','f.JPG','g.jpeg','h.WEBP','i.bmp','j.GIF','k.txt','l.moonsprite.bak'][index%12] if folder_mode else ['a.moonsprite','B.MOONSPRITE','c.MoonSprite','d.png','e.moonsprite.bak'][index%5])
 path=folder/name;path.write_bytes(bytes([index]))
 ns=(1700000000000+(index%7)*1234)*1000000
 os.utime(path,ns=(ns,ns))
try:
 os.symlink(folder/'000-画廊-a.moonsprite',folder/'linked.moonsprite')
 print('Symlink metadata comparison enabled.')
except OSError:
 print('Symlink creation unavailable; regular-file matrix only.')
(folder/'directory.moonsprite').mkdir();(folder/'directory.moonsprite/nested.moonsprite').write_bytes(b'x')
# Both processes receive a relative path, avoiding Windows ANSI argv conversion.
relative=os.path.relpath(folder,ROOT/'native/build')
a=subprocess.check_output([str(OWNED/'gallery-oracle.exe'),relative],cwd=ROOT/'native/build')
b=subprocess.check_output([str(ROOT/('native/build/Release/home-sections-tests.exe' if folder_mode else 'native/build/Release/gallery-projects-tests.exe')),'--list',relative],cwd=ROOT/'native/build')
assert a.replace(b'\r\n',b'\n')==b.replace(b'\r\n',b'\n'),(a[:500],b[:500])
print(('Folder: ' if folder_mode else 'Gallery: ')+'Actual unchanged Rust listing matches native: 160 files, mixed-case extensions, time/name ordering, immediate-only scan.')
print('Source SHA256:',hashlib.sha256(SOURCE.read_bytes()).hexdigest())
