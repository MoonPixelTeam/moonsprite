// Execute the unchanged legacy implementation; no handwritten normalization oracle.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const legacy = path.resolve(__dirname, '../../legacy')
const filename = path.join(legacy, 'src/renderer/src/core/layer-panel-state.ts')
const source = fs.readFileSync(filename, 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
const context = {
 readStoredJson: (key, fallback, storage) => JSON.parse(storage.getItem(key) ?? JSON.stringify(fallback)),
 writeStoredJson: (key, value, storage) => { storage.setItem(key, JSON.stringify(value)); return true }
}
vm.runInNewContext(stripTypeScriptTypes(source) + '\nthis.api = { normalizeProjectLayerPanelState, loadLocalLayerPanelState, saveLocalLayerPanelState };', context)
const api = context.api
const cases = []
const values = [null, false, 7, [], {}, { activeLayerId: 42 },
  { activeLayerId: 'missing', selectedLayerIds: ['b', 'b', null, 'a', 3, 'bad'], selectedGroupIds: ['g2', 'g1', 'g2'], selectedGroupId: 'g1', layerSelectionAnchorId: 'b', collapsedGroupIds: ['g1', 'bad', 'g2', 'g1'] },
  { activeLayerId: 'a', selectedLayerIds: [], selectedGroupIds: ['g2'], selectedGroupId: null, layerSelectionAnchorId: 'g1' },
  { activeLayerId: '', selectedLayerIds: ['b'], selectedGroupIds: [], selectedGroupId: 'g1', layerSelectionAnchorId: 'bad' },
  { activeLayerId: 'b', selectedLayerIds: ['a'], selectedGroupIds: ['g1', 'g2'], selectedGroupId: 'g2', layerSelectionAnchorId: '' }]
for (const layers of [[], ['a'], ['a', 'b'], ['b', 'a']]) for (const active of ['', 'a', 'b', 'missing']) for (const value of values) {
  const document = { layers: layers.map(id => ({ id })), groups: [{ id: 'g1' }, { id: 'g2' }], activeLayerId: active }
  cases.push({ layers, groups: ['g1', 'g2'], active, value, expected: api.normalizeProjectLayerPanelState(document, value) })
}
const storage = { value: null, getItem() { return this.value }, setItem(key, value) { this.value = value } }
const document = { layers: [{ id: 'a' }, { id: 'b' }], groups: [{ id: 'g1' }, { id: 'g2' }], activeLayerId: 'a' }
const operations = []
for (let i = 0; i < 105; ++i) {
  document.filePath = `C:\\画作\\Item${i}.moonsprite`
  const state = api.normalizeProjectLayerPanelState(document, values[6 + i % 4])
  api.saveLocalLayerPanelState(document, state, storage, i)
  operations.push({ path: document.filePath, state, now: i })
}
document.filePath = 'c:/画作/ITEM104.moonsprite'
const override = api.normalizeProjectLayerPanelState(document, values[7])
api.saveLocalLayerPanelState(document, override, storage, 200)
operations.push({ path: document.filePath, state: override, now: 200 })
for (const filePath of ['  C:/画作/İIΣΟΣ𐐀.MOONSPRITE　', 'c:/画作/i̇iσος𐐨.moonsprite']) {
 document.filePath = filePath
 const state = api.normalizeProjectLayerPanelState(document, values[6])
 api.saveLocalLayerPanelState(document, state, storage, 201)
 operations.push({ path: filePath, state, now: 201 })
}
const probes = ['c:/画作/i̇iσος𐐨.moonsprite', 'C:/画作/Item0.moonsprite', 'C:/画作/Item5.moonsprite', 'C:/画作/item104.moonsprite', ' C:/画作/ITEM104.moonsprite ', '']
const lookups = probes.map(filePath => ({ path: filePath, expected: api.loadLocalLayerPanelState({ ...document, filePath }, storage) }))
const output = path.resolve(process.argv[2])
fs.mkdirSync(path.dirname(output), { recursive: true })
fs.writeFileSync(output, JSON.stringify({ cases, operations, stored: JSON.parse(storage.value), lookups }))
console.log(`Actual legacy layer-panel oracle: ${cases.length} normalization cases, ${operations.length} storage writes, ${lookups.length} lookups`)
