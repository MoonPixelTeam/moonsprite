import test from 'node:test'
import assert from 'node:assert/strict'
import { createDecipheriv } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync } from 'fflate'

test('bundled companion contains the Mooncat package without the previous built-in pet', () => {
  const source = JSON.parse(readFileSync('src-tauri/resources/pets/mooncat.mspet', 'utf8'))
  const encrypted = Buffer.from(source.spriteEncrypted.data, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from('MoonSpritePetKey-v1-20260926-123'), Buffer.from(source.spriteEncrypted.iv, 'base64'))
  decipher.setAuthTag(encrypted.subarray(-16))
  const png = Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()])
  const files = unzipSync(readFileSync('src-tauri/resources/bundled-extensions/pet-companion.msext'))
  assert.deepEqual(Buffer.from(files['assets/companion.png']), png)
  for (const path of ['runtime/index.html', 'ui/pet.html', 'ui/manager.html']) {
    const html = strFromU8(files[path])
    assert.match(html, /"id":"builtin","name":"月猫"/)
    assert.ok(!html.includes('奶龙'))
    assert.ok(html.includes(JSON.stringify(source.pet.animations)))
    assert.ok(html.includes(JSON.stringify(source.pet.triggerSlots)))
  }
})
