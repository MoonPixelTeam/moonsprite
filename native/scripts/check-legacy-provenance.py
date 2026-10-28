"""Check provenance coverage, not semantic equivalence. --strict rejects gaps."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parents[2]
native = root / 'native'
data = json.loads((native / 'docs/legacy-provenance.json').read_text(encoding='utf-8'))
actual = set()
for directory in ['src', 'tests', 'scripts', 'docs/requirements-baseline/tools']:
    for path in (native / directory).rglob('*'):
        if path.suffix in {'.h', '.cpp', '.py', '.ps1', '.mjs', '.cjs'}:
            actual.add(path.relative_to(native).as_posix())
actual.update(p.name for p in native.glob('*.bat'))
for path in (native / 'tests/fixtures/pattern-extra-formats').glob('*'):
    if path.is_file(): actual.add(path.relative_to(native).as_posix())
actual.add('CMakeLists.txt')
recorded = [entry['file'] for entry in data['files']]
errors = []
if len(recorded) != len(set(recorded)): errors.append('Duplicate file registration')
if actual != set(recorded): errors.append(f'Unregistered: {actual-set(recorded)}; missing: {set(recorded)-actual}')
for entry in data['files']:
    if not entry['scope'] or not entry['classification']: errors.append(f"Missing classification: {entry['file']}")
    if entry['classification'].startswith('legacy-') and not entry['sources']: errors.append(f"Missing legacy source: {entry['file']}")
for path, digest in data['sourceSnapshots'].items():
    source = root / path
    if not source.is_file() or hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        errors.append(f'Legacy evidence changed; re-audit required: {path}')
if errors: raise SystemExit('\n'.join(errors))
partial = [e['file'] for e in data['files'] if e['classification'] == 'legacy-partial']
print(f'Provenance coverage: {len(actual)} files; evidence snapshots verified.')
print('Legacy alignment: INCOMPLETE; partial files: ' + ', '.join(partial))
if '--strict' in sys.argv:
    raise SystemExit(1 if partial or not data['allLegacyAligned'] else 0)
