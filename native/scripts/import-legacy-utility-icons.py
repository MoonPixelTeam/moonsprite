"""Extract exact legacy utility paths, then reuse the tool SVG rasterizer."""
from pathlib import Path
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[2]
source = root / 'legacy/src/renderer/src/components/PixelUtilityIcon.tsx'
target = root / 'native/assets/utility-icons'
target.mkdir(parents=True, exist_ok=True)
text = source.read_text(encoding='utf-8')
for name in ['properties', 'lock', 'unlock', 'undo', 'redo', 'dither', 'image', 'checkboxUnchecked', 'more', 'close', 'plus', 'eye', 'eyeOff', 'delete', 'right', 'check', 'copy', 'link', 'onion', 'newFolder', 'gradientMap', 'tilemap', 'freeTile', 'linkedLayer', 'convertTo', 'mergeDown', 'mergeVisible', 'clippingMask', 'layerMask', 'layerStyle', 'paste', 'clearRecords', 'info', 'swap', 'move']:
    match = re.search(r"\b" + name + r":\s*'([^']+)'", text)
    if not match:
        raise SystemExit(f'Legacy icon missing: {name}')
    translucent = re.search(r"\b" + name + r":\s*'([^']+)'", text.split('const utilityIconTranslucentPaths', 1)[1])
    extra = f'<path fill="#D8DEEA" fill-opacity=".42" d="{translucent[1]}"/>' if translucent else ''
    size = 5 if name in ['close', 'right'] else 7 if name == 'check' else 6 if name in ['undo', 'redo'] else 11
    # Legacy currentColor resolves to the native theme's default text color.
    (target / f'{name}.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<path fill="#D8DEEA" d="{match[1]}"/>{extra}</svg>\n', encoding='utf-8')
# Preserve the exact 5px shape masks from editor-tools; format conversion only.
shape_source = root / 'legacy/src/renderer/src/components/app/editor-tools.tsx'
shape_text = shape_source.read_text(encoding='utf-8').split('const pixelMasks =', 1)[1]
for shape in ['round', 'square', 'line']:
    rows = re.search(r"\b" + shape + r": \[([^]]+)\]", shape_text)
    mask = re.findall(r"'([01]+)'", rows[1])
    paths = ''.join(f'M{x} {y}h1v1H{x}z' for y,row in enumerate(mask) for x,cell in enumerate(row) if cell == '1')
    (target / f'brush-{shape}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 5 {len(mask)}"><path fill="#D8DEEA" d="{paths}"/></svg>\n', encoding='utf-8')
playback_source = root / 'legacy/src/renderer/src/components/PlaybackPixelIcon.tsx'
playback_text = playback_source.read_text(encoding='utf-8')
for name in ['first', 'previous', 'play', 'next', 'last']:
    paths = re.search(r"\b" + name + r":\s*'([^']+)'", playback_text)[1]
    (target / f'playback-{name}.svg').write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 11 11"><path fill="#D8DEEA" d="{paths}"/></svg>\n', encoding='utf-8')
import shutil
for name in ['ink-simple', 'pressure-dynamics', 'symmetry-horizontal', 'symmetry-vertical', 'symmetry-diagonal-up', 'symmetry-diagonal-down', 'symmetry-rotational', 'animation-auto-link-off', 'animation-auto-link-on']:
    shutil.copy2(root / 'legacy/src/renderer/src/assets/pixel-icons' / f'{name}.svg', target / f'{name}.svg')
subprocess.run([sys.executable, str(root / 'native/scripts/import-legacy-tool-icons.py'),
                '--source', str(target), '--target', str(target), '--pattern', '*.svg'], check=True)
