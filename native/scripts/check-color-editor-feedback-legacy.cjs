// Execute the actual legacy copy/feedback functions with deterministic browser
// services; expected timing and clipboard values are checked independently.
const fs = require('fs'), path = require('path'), vm = require('vm');
const assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const control = read('legacy/src/renderer/src/components/ColorValueControl.tsx');
const colors = read('legacy/src/renderer/src/core/color-values.ts');
const raster = read('legacy/src/renderer/src/core/raster.ts');
const clamp = raster.match(/^export const clampByte = .*$/m)[0];
const hex = colors.slice(colors.indexOf('export const rgbaHex ='), colors.indexOf('export const parseRgbaHex ='));
const clipboard = control.slice(control.indexOf('const copyHexToClipboard ='), control.indexOf('const colorGradient ='));
const feedback = control.slice(control.indexOf('  const copySwatch ='), control.indexOf('  const roleTitle ='));
const source = stripTypeScriptTypes((clamp + '\n' + hex + clipboard + feedback).replaceAll('export ', ''));
const copied = [], timers = new Map(), removed = [];
let copiedKind = null, sequence = 0, selected = null, clipboardCalls = 0;
const context = vm.createContext({
  navigator: { clipboard: { writeText: async value => { copied.push(value); } } },
  document: {
    createElement: () => ({ value: '', style: {}, setAttribute() {}, select() { selected = this.value; }, remove() { removed.push(this.value); } }),
    body: { appendChild() {} },
    execCommand: kind => { assert.equal(kind, 'copy'); ++clipboardCalls; return false; }
  },
  window: {
    clearTimeout: id => timers.delete(id),
    setTimeout: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id; }
  },
  copyFeedbackTimeoutRef: { current: null },
  setCopiedSwatch: kind => { copiedKind = kind; }
});
vm.runInContext(source, context);
const copy = (kind, color) => { context.kind = kind; context.color = color; return vm.runInContext('copySwatch(kind,color)', context); };
const color = { r: 17, g: 34, b: 51, a: 255 };
(async () => {
  await copy('previous', color);
  assert.equal(copied.at(-1), '#112233'); assert.equal(copiedKind, 'previous');
  assert.equal(timers.size, 1); assert.equal([...timers.values()][0].delay, 900);
  const first = context.copyFeedbackTimeoutRef.current;
  await copy('current', { ...color, a: 128 });
  assert.equal(copied.at(-1), '#11223380'); assert.equal(copiedKind, 'current');
  assert.equal(timers.size, 1); assert.equal(timers.has(first), false);
  [...timers.values()][0].callback(); timers.clear();
  assert.equal(copiedKind, null); assert.equal(context.copyFeedbackTimeoutRef.current, null);
  let finish;
  context.navigator.clipboard.writeText = value => new Promise(resolve => { finish = () => { copied.push(value); resolve(); }; });
  const pending = copy('previous', color);
  assert.equal(copiedKind, null); assert.equal(timers.size, 0);
  finish(); await pending; assert.equal(copiedKind, 'previous');
  context.navigator.clipboard.writeText = async () => { throw Error('Clipboard unavailable'); };
  await copy('current', { ...color, a: 0 });
  assert.equal(selected, '#11223300'); assert.equal(removed.at(-1), selected); assert.equal(clipboardCalls, 1); assert.equal(copiedKind, 'current');
  context.navigator.clipboard = undefined;
  await copy('previous', color);
  assert.equal(selected, '#112233'); assert.equal(clipboardCalls, 2); assert.equal(copiedKind, 'previous');
  context.document.execCommand = () => { throw Error('Copy failed'); };
  const timer = context.copyFeedbackTimeoutRef.current;
  await assert.rejects(copy('current', color), /Copy failed/);
  assert.equal(copiedKind, 'previous'); assert.equal(context.copyFeedbackTimeoutRef.current, timer); assert.equal(removed.length, 3);
  console.log('7 actual legacy clipboard/feedback scenarios passed (HEX, 900ms restart/expiry, deferred completion, fallback and failure).');
})().catch(error => { console.error(error); process.exitCode = 1; });
