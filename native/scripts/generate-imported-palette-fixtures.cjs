// Execute the actual legacy extractor and luminance sorter, without the DOM.
const fs = require('fs'), path = require('path'), vm = require('vm');
const { stripTypeScriptTypes } = require('node:module');
const source = fs.readFileSync(path.join(__dirname, '../../legacy/src/renderer/src/core/palette.ts'), 'utf8');
const legacyExports = {};
const raster = { packColor: c => (c.r | c.g << 8 | c.b << 16 | c.a << 24) >>> 0 };
const executable = stripTypeScriptTypes(source.replace(/^import .*$/gm, '').replace(/export /g, ''))
  + '\nObject.assign(exports, {sortPaletteColors, extractPaletteColorsFromRgbaSurfaces});';
vm.runInNewContext(executable,
  { exports: legacyExports, packColor: raster.packColor, require: name => name === './raster' ? raster : {} });
const cases = [];
const add = (surfaces, limit, samples) => {
  const rgba = surfaces.map(values => Uint8ClampedArray.from(values.flatMap(c => [c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24])));
  const result = legacyExports.sortPaletteColors(legacyExports.extractPaletteColorsFromRgbaSurfaces(rgba, limit, samples), 'luminance').map(raster.packColor);
  cases.push({ surfaces, limit, samples, result });
};
add([[0xff000000, 0x80000000, 0x01000000, 0x00ffffff]], 256, 100);
add([[0xffff0000, 0xff00ff00], [0xff0000ff, 0x800000ff, 0xff0000ff]], 3, 100);
add([[], []], 256, 0);
let seed = 0x31415926;
const random = () => seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
for (let index = 0; index < 48; index++) {
  const values = Array.from({ length: 70 + index * 3 }, () => {
    const c = random(); return index % 3 === 0 ? ((c & 0x03030303) + 0x7c7c7c7c) >>> 0 : c;
  });
  add([values.slice(0, 31), values.slice(31)], [1, 2, 3, 7, 16, 256][index % 6], [0, 17, 10000][Math.floor(index / 6) % 3]);
}
// Dense neighboring RGBA colors exercise rounded median-cut representatives.
const cube = [];
for (let r = 0; r < 3; r++) for (let g = 0; g < 3; g++) for (let b = 0; b < 3; b++) for (let a = 254; a < 256; a++) {
  const color = (r | g << 8 | b << 16 | a << 24) >>> 0;
  for (let count = 0; count < 1 + (r + 2 * g + b + a) % 5; count++) cube.push(color);
}
for (const limit of [4, 7, 16, 32, 53]) add([cube], limit, 10000);
add([[0xff101010, 0x80101010, 0x01101010, 0xff111111]], -3, 100);
add([[0xff000000, 0xff00ff00, 0xff0000ff]], 5000, 100);
const array = values => '{' + values.map(c => '0x' + c.toString(16) + 'u').join(',') + '}';
const text = '#pragma once\n// Generated from legacy palette.ts by generate-imported-palette-fixtures.cjs.\n'
  + 'struct ImportedPaletteFixture {std::vector<std::vector<std::uint32_t>> surfaces; int limit; std::size_t samples; std::vector<std::uint32_t> expected;};\n'
  + 'inline const std::vector<ImportedPaletteFixture> importedPaletteFixtures={\n'
  + cases.map(c => '{ {' + c.surfaces.map(array).join(',') + '},' + c.limit + ',' + c.samples + ',' + array(c.result) + '}').join(',\n') + '\n};\n';
fs.writeFileSync(path.join(__dirname, '../tests/fixtures/imported_palette_legacy.h'), text);
console.log('Generated', cases.length, 'legacy extraction/sorting cases');
