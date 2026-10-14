"""Losslessly rasterize legacy's rectilinear normal tool SVGs at their viewBox grid.
Original SVGs are copied unchanged for provenance; no external image library.
"""
from pathlib import Path
import re
import argparse
import shutil
import struct
import zlib
import xml.etree.ElementTree as ET

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path, default=root / 'legacy/src/renderer/src/assets/tool-icons')
parser.add_argument('--target', type=Path, default=root / 'native/assets/tool-icons')
parser.add_argument('--pattern', default='*-normal.svg')
args = parser.parse_args()
source, target = args.source, args.target
target.mkdir(parents=True, exist_ok=True)

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

for path in sorted(source.glob(args.pattern)):
    svg = ET.parse(path).getroot()
    ox, oy, width, height = map(int, svg.attrib['viewBox'].split())
    assert ox == oy == 0
    pixels = bytearray(width * height * 4)
    gradients = {}
    for definition in svg.findall('{http://www.w3.org/2000/svg}defs'):
        for gradient in definition:
            gradients[gradient.attrib['id']] = gradient
    for element in svg:
        if element.tag.endswith('defs'): continue
        assert element.tag.endswith('path')
        color = element.attrib['fill'].lstrip('#')
        gradient = gradients.get(color[5:-1]) if color.startswith('url(#') else None
        if gradient is not None: color = 'ffffff'
        dynamic_fill = color == 'var(--gradient-stop-color)'
        if dynamic_fill: color = 'ffffff'
        if color == 'currentColor': color = 'D8DEEA'
        if len(color) == 3:
            color = ''.join(c * 2 for c in color)
        rgb = bytes.fromhex(color)
        alpha = round(float(element.attrib.get('fill-opacity', '1')) * 255)
        tokens = re.findall(r'[MmHhVvZz]|-?\d+(?:\.\d+)?', element.attrib['d'])
        assert ''.join(tokens) == re.sub(r'[ ,]', '', element.attrib['d']), path
        points, x, y, i = [], 0, 0, 0
        while i < len(tokens):
            command = tokens[i]
            i += 1
            if command in 'Zz':
                xs = sorted(set(p[0] for p in points))
                ys = sorted(set(p[1] for p in points))
                assert len(points) >= 4 and all(a[0] == b[0] or a[1] == b[1] for a,b in zip(points,points[1:]+points[:1])), path
                def contains(px, py):
                    # Exact pixel-center coverage for legacy orthogonal paths,
                    # including concave conversion/menu glyphs; no smoothing.
                    inside = False
                    for a,b in zip(points,points[1:]+points[:1]):
                        if (a[1] > py) != (b[1] > py) and px < a[0] + (py-a[1])*(b[0]-a[0])/(b[1]-a[1]):
                            inside = not inside
                    return inside
                for py in range(height):
                    for px in range(width):
                        if contains(px + .5, py + .5):
                            pixel_alpha = 0 if dynamic_fill else alpha
                            if gradient is not None:
                                attrs = gradient.attrib
                                if gradient.tag.endswith('linearGradient'):
                                    t = (px + .5 - float(attrs['x1'])) / (float(attrs['x2']) - float(attrs['x1']))
                                else:
                                    t = ((px + .5 - float(attrs['cx'])) ** 2 + (py + .5 - float(attrs['cy'])) ** 2) ** .5 / float(attrs['r'])
                                pixel_alpha = round(255 * (1 - min(1, max(0, t))))
                            at = (py * width + px) * 4
                            old = pixels[at + 3]
                            combined = pixel_alpha + old * (255 - pixel_alpha) / 255
                            for channel in range(3):
                                pixels[at + channel] = round((rgb[channel] * pixel_alpha + pixels[at + channel] * old * (255 - pixel_alpha) / 255) / combined) if combined else 0
                            pixels[at + 3] = round(combined)
                x, y = points[0]
                points = []
                continue
            value = float(tokens[i])
            i += 1
            if command in 'Mm':
                other = float(tokens[i]); i += 1
                x, y = (value, other) if command == 'M' else (x + value, y + other)
            elif command in 'Hh': x = value if command == 'H' else x + value
            elif command in 'Vv': y = value if command == 'V' else y + value
            points.append((x, y))
        assert not points, path
    for suffix, opacity in [('', 1), ('-disabled', .4)]:
        output = bytearray(pixels)
        for at in range(3, len(output), 4): output[at] = round(output[at] * opacity)
        rows = b''.join(b'\0' + output[y * width * 4:(y + 1) * width * 4] for y in range(height))
        (target / (path.stem + suffix + '.png')).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>2I5B', width, height, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
    if path.resolve() != (target / path.name).resolve(): shutil.copy2(path, target / path.name)
print('Imported', len(list(source.glob(args.pattern))), 'legacy tool icons')
