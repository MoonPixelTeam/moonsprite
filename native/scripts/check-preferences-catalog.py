"""Audit native component rows against actual legacy preference entry labels."""
from pathlib import Path
import json
import re

native = Path(__file__).resolve().parents[1]
legacy = native.parent / 'legacy/src/renderer/src'
source = (legacy / 'components/dialogs/PreferencesDialog.tsx').read_text(encoding='utf-8')
catalog = (native / 'src/preferences_catalog.h').read_text(encoding='utf-8')
translations = {}
for name in ['zh-CN.ts', 'tablet.ts', 'release-beta7.ts', 'release-beta8.ts', 'release-beta9.ts']:
    for match in re.finditer(r"[\"']([\w.-]+)[\"']\s*:\s*([\"'])(.*?)\2", (legacy / 'locales' / name).read_text(encoding='utf-8')):
        translations[match[1]] = match[3]
body = source[source.index("{section === 'general'"):]
labels = set()
for match in re.finditer(r"toggle\(t\('([^']+)'|<(?:FormField|PreferenceToggle)\b[\s\S]*?label=\{t\('([^']+)'|<ColorValueControl\b[\s\S]*?roleLabel=\{t\('([^']+)'", body):
    labels.add(next(value for value in match.groups() if value))
missing = [key for key in labels if 'U' + json.dumps(translations.get(key, key), ensure_ascii=False) not in catalog]
assert not missing, f'Missing legacy controls: {missing}'
rows = re.findall(r'^  \{"([^"]+)",(\d+),', catalog, re.M)
assert len(rows) == len({key for key, section in rows}), 'Duplicate preference IDs'
assert {int(section) for key, section in rows} == set(range(14)), 'Missing preference category'
formats_source = (legacy / 'core/pixel-format.ts').read_text(encoding='utf-8')
formats = re.search(r'PIXEL_FORMATS[^=]*=\s*\[([^\]]+)\]', formats_source).group(1)
format_row = next(line for line in catalog.splitlines() if '"colorLayers.pixelFormat.Select"' in line)
for value in re.findall(r"'([^']+)'", formats):
    assert f'U"{value.upper()}"' in format_row, f'Missing pixel format: {value}'
right_click_row = next(line for line in catalog.splitlines() if '"editing.tablet.rightClickAction.Select"' in line)
for key in ['background', 'foreground', 'eraser', 'hand', 'rectangle', 'lasso', 'select-layer-move']:
    assert 'U' + json.dumps(translations[f'preferences.tablet.rightClick.{key}'], ensure_ascii=False) in right_click_row, f'Missing right-click action: {key}'
for key in ['appearance.checkerboard.lightColor', 'appearance.checkerboard.darkColor', 'tablet.assistPanel', 'tablet.gestureUndoEnabled', 'tablet.rotationSnapEnabled', 'tablet.longPressEyedropper', 'extensions.uninstall', 'extensions.script.delete']:
    assert any(key == row[0] for row in rows), f'Missing delegated preference: {key}'
for bar in range(4):
    commands = re.findall(r"id: '([^']+)'[^\n]*?label: '([^']+)'", (legacy / 'components/app/quick-command-registry.ts').read_text(encoding='utf-8'))
    for command, label in commands:
        assert any(key == f'quickCommands.bar{bar}.command.{command}' for key, section in rows), 'Missing quick command row'
print(f'Preferences catalog: {len(rows)} component rows, 14 categories, {len(labels)} static labels and all quick command entries verified.')
