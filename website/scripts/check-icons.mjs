import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const icons = join(root, 'src/assets/icons')
const provenance = JSON.parse(readFileSync(join(icons, 'provenance.json'), 'utf8'))
const read = (file) => readFileSync(file, 'utf8')
const paths = (svg) => [...svg.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map((match) => match[1])
for (const [name, entry] of Object.entries(provenance)) {
  const svg = read(join(icons, `${name}.svg`))
  if (entry.kind === 'reference') {
    const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
    assert.equal(hash(join(root, '..', entry.source)), entry.sourceHash, `${name}: supplied pixel reference`)
    assert.equal(hash(join(icons, `${name}.svg`)), entry.svgHash, `${name}: extracted pixel copy`)
    assert.ok(svg.includes('viewBox="0 0 11 11"'))
    continue
  }
  const source = read(join(root, '..', entry.source))
  assert.ok(svg.includes('shape-rendering="crispEdges"'), name)
  if (entry.kind === 'file') assert.equal(svg, source, `${name}: original SVG copy`)
  else {
    assert.ok(entry.size <= 11, `${name}: source fits 11px canvas`)
    const pattern = new RegExp(`^  ${entry.kind}: '([^']*)'`, 'gm')
    const expected = [...source.matchAll(pattern)].map((match) => match[1])
    assert.deepEqual(paths(svg), expected, `${name}: unchanged desktop paths including translucent pixels`)
    assert.ok(svg.includes(`viewBox="0 0 ${entry.size} ${entry.size}"`), name)
  }
}
function inspect(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    if (entry.isDirectory()) { inspect(file); continue }
    if (/\.css$/.test(entry.name)) {
      assert.ok(!/content:\s*['"][↓↑←→✕▢✓✔⚠✦★]/.test(read(file)), `${file}: CSS glyph icon`)
      assert.ok(!/\.faq-toggle::(?:before|after)/.test(read(file)), `${file}: hand-drawn FAQ icon`)
    }
    if (!/\.tsx?$/.test(entry.name)) continue
    const source = read(file)
    assert.ok(!/>[↓↑←→✕▢✓✔⚠✦★]/.test(source), `${file}: character icon bypasses library`)
    assert.ok(!/from\s+['"](?:lucide-react|@phosphor-icons\/react|@radix-ui\/react-icons)/.test(source), `${file}: third-party icons`)
    if (relative(root, file).replaceAll('\\', '/') !== 'src/ui/icons.tsx') {
      assert.ok(!/<(?:svg|path)\b/.test(source), `${file}: inline icon bypasses local SVG library`)
    }
  }
}
assert.deepEqual(readdirSync(icons).filter((name) => name.endsWith('.svg')).sort(), Object.keys(provenance).map((name) => `${name}.svg`).sort(), 'every SVG copy has verified provenance')
inspect(join(root, 'src'))
assert.equal(JSON.parse(read(join(root, 'package.json'))).dependencies['lucide-react'], undefined)
const renderer = read(join(root, 'src/ui/icons.tsx'))
assert.ok(renderer.includes('width={22} height={22} viewBox="0 0 11 11"'))
console.log(`${Object.keys(provenance).length} MoonSprite SVG copies verified; no legacy icon library or inline icon paths`)
