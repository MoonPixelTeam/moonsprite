"""Copy legacy cursor definitions/artwork without changing shapes or hotspots."""
from pathlib import Path
import re
import shutil
import struct
import zlib
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[2]
source = root / 'legacy/src/renderer/src'
target = root / 'native/assets/cursors'
target.mkdir(parents=True, exist_ok=True)
text = (source / 'platform/cursor-theme.ts').read_text(encoding='utf-8')
imports = dict(re.findall(r"import (\w+) from '@/([^']+)'", text))
table = text.split('export const CURSOR_ICON_LIBRARY:')[1].split('] as const')[0]
entries = re.findall(r"variable: '--cursor-([^']+)', source: (\w+),[^\n]*?hotspot: \[(\d+), (\d+)\]", table)
assert entries

def svg_png(path, destination):
    # Both legacy SVGs consist exclusively of axis-aligned, filled polygons.
    svg = ET.parse(path).getroot()
    width, height = int(svg.attrib['width']), int(svg.attrib['height'])
    _, _, vw, vh = map(float, svg.attrib['viewBox'].split())
    pixels = bytearray(width * height * 4)
    for element in svg:
        assert element.tag.endswith('path')
        color = element.attrib['fill'].replace('white', '#ffffff')
        rgba = bytes.fromhex(color[1:]) + b'\xff'
        tokens = re.findall(r'[MmHhVvZz]|-?\d+(?:\.\d+)?', element.attrib['d'])
        assert ''.join(tokens) == re.sub(r'[ ,]', '', element.attrib['d'])
        points, polygons, x, y, i = [], [], 0, 0, 0
        while i < len(tokens):
            command = tokens[i]; i += 1
            if command in 'Zz':
                polygons.append(points); x, y = points[0]; points = []; continue
            value = float(tokens[i]); i += 1
            if command in 'Mm':
                other = float(tokens[i]); i += 1
                x, y = (value, other) if command == 'M' else (x+value, y+other)
            elif command in 'Hh': x = value if command == 'H' else x+value
            elif command in 'Vv': y = value if command == 'V' else y+value
            points.append((x, y))
        for polygon in polygons:
            # Rectangular subpaths; fail on other shapes instead of approximating.
            xs = sorted(set(p[0] for p in polygon)); ys = sorted(set(p[1] for p in polygon))
            assert len(xs) == len(ys) == 2 and len(polygon) == 4
            for py in range(height):
                for px in range(width):
                    if xs[0] <= (px+.5)*vw/width < xs[1] and ys[0] <= (py+.5)*vh/height < ys[1]:
                        offset = (py*width+px)*4; pixels[offset:offset+4] = rgba
    def chunk(kind, data):
        return struct.pack('>I', len(data))+kind+data+struct.pack('>I', zlib.crc32(kind+data))
    rows = b''.join(b'\0'+pixels[y*width*4:(y+1)*width*4] for y in range(height))
    destination.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>2I5B',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))

lines = ['# id filename hotspot-x hotspot-y; coordinates in source pixels']
copied = set()
for name, variable, x, y in entries:
    path = source / imports[variable]
    filename = path.stem+'.png'
    if filename not in copied:
        if path.suffix == '.svg':
            shutil.copy2(path, target / path.name)
            svg_png(path, target / filename)
        else: shutil.copy2(path, target / filename)
        copied.add(filename)
    lines.append(f'{name} {filename} {x} {y}')
(target/'cursors.txt').write_text('\n'.join(lines)+'\n', encoding='utf-8')
print(f'Imported {len(entries)} cursor definitions, {len(copied)} images')
