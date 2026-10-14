import assert from 'node:assert/strict'
import test from 'node:test'
import { allowsTauriIpc } from './csp-policy.mjs'

test('accepts ipc.localhost only as an exact connect-src URL host', () => {
  assert.equal(allowsTauriIpc("default-src 'self'; connect-src 'self' http://ipc.localhost ws:"), true)
  assert.equal(allowsTauriIpc("connect-src 'self' http://evil.test/http://ipc.localhost"), false)
  assert.equal(allowsTauriIpc("connect-src 'self' http://ipc.localhost.evil.test"), false)
  assert.equal(allowsTauriIpc("script-src http://ipc.localhost"), false)
})
