"""Adapt upstream libvpx's generated VS project for long, Unicode Windows paths.

The pinned upstream checkout is never modified. Response files avoid cmd.exe's
argument limit; relative NASM inputs avoid its Windows Unicode path limitation.
"""
import pathlib
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

native = pathlib.Path(__file__).resolve().parents[1]
build = native / 'build/libvpx'
source = native / '.cache/libvpx-1.15.2'
helpers = native / 'build/libvpx-tools'
bash, make = sys.argv[1:]
helpers.mkdir(parents=True, exist_ok=True)

def run(command):
    subprocess.run([bash, '-c', command], cwd=build, check=True)

for name, variable in [('files', 'CODEC_SRCS'), ('asm-includes', 'ASM_INCLUDES')]:
    run(f'{make} target=libs --eval=\'moon-dump: ; $(file > vpx-{name}.txt,$({variable}))\' moon-dump')
excluded = set((build / 'vpx-asm-includes.txt').read_text(encoding='utf-8').split())
files = []
for item in (build / 'vpx-files.txt').read_text(encoding='utf-8').split():
    if item in excluded:
        continue
    path = item if (build / item).exists() else '../../.cache/libvpx-1.15.2/' + item
    if path not in files:
        files.append(path)
if len(files) < 400:
    raise RuntimeError('Incomplete upstream codec source list')
(build / 'vpx-project-files.txt').write_text(' '.join(files) + '\n', encoding='utf-8')

generator = (source / 'build/make/gen_msvs_vcxproj.sh').read_text(encoding='utf-8')
anchor = 'self=$0'
if generator.count(anchor) != 1:
    raise RuntimeError('Upstream generator changed')
generator = generator.replace(anchor, '''if [ "$1" = '--files-from' ]; then
  files_from="$2"; shift 2
  read -r -a response_files < "$files_from"
  set -- "$@" "${response_files[@]}"
fi
''' + anchor)
(helpers / 'gen_msvs_vcxproj.sh').write_text(generator, encoding='utf-8', newline='\n')
common = (source / 'build/make/msvs_common.sh').read_text(encoding='utf-8')
anchor = 'files=$(fix_path "${array_ref[@]}")'
if common.count(anchor) != 1:
    raise RuntimeError('Upstream path conversion changed')
common = common.replace(anchor, '''files=$(for ((offset=0; offset<${#array_ref[@]}; offset+=32)); do
  fix_path "${array_ref[@]:offset:32}" || exit $?
done)''')
(helpers / 'msvs_common.sh').write_text(common, encoding='utf-8', newline='\n')
run('bash ../libvpx-tools/gen_msvs_vcxproj.sh --files-from vpx-project-files.txt '
    '--lib --target=x86_64-win64-vs17 --static-crt --name=vpx '
    '--proj-guid=DCE19DAF-69AC-46DB-B14A-39F0FAA5DB74 --module-def=vpx.def '
    '--ver=17 --src-path-bare=../../.cache/libvpx-1.15.2 --out=vpx.vcxproj '
    '--as=nasm -I. -I../../.cache/libvpx-1.15.2')
project = build / 'vpx.vcxproj'
xml = project.read_text(encoding='utf-8')
for path, replacement in [(source, '../../.cache/libvpx-1.15.2'), (build, '.')]:
    xml = xml.replace(str(path), replacement.replace('/', '\\'))
    xml = xml.replace(path.as_posix(), replacement)
xml = re.sub(r'&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)', '&amp;', xml)
xml = xml.replace('%(FullPath)', '%(Identity)')
ns = 'http://schemas.microsoft.com/developer/msbuild/2003'
ET.register_namespace('', ns)
root = ET.fromstring(xml)
seen = set()
for group in root.findall(f'{{{ns}}}ItemGroup'):
    for element in list(group):
        include = element.get('Include')
        if include is None:
            continue
        key = (element.tag, include.lower())
        if key in seen:
            group.remove(element)
        else:
            seen.add(key)
ET.ElementTree(root).write(project, encoding='utf-8', xml_declaration=True)
print(f'Prepared pinned libvpx project with {len(files)} source entries')
