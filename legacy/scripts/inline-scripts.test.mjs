import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { extractInlineScripts } from './inline-scripts.mjs'

test('recognizes browser-accepted script end tags and preserves every script', () => {
  const scripts = extractInlineScripts('<SCRIPT data-label=">">const first = 1;</ScRiPt\t\n bar><script>const second = 2;</script >')
  assert.deepEqual(scripts, ['const first = 1;', 'const second = 2;'])
})

test('syntax errors cannot hide behind unusual script end tags', () => {
  const scripts = extractInlineScripts('<script>const broken = ;</script\t\n bar>')
  assert.equal(scripts.length, 1)
  assert.throws(() => new vm.Script(scripts[0]), SyntaxError)
})

test('ignores comments and external scripts and never executes inline code', () => {
  assert.deepEqual(extractInlineScripts('<!-- <script>ignored</script> --><script src="missing.js">ignored</script><script>throw new Error("must not execute")</script>'), ['throw new Error("must not execute")'])
})
