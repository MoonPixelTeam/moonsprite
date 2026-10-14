import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { repairRelocatedCargoCache } from './repair-relocated-cargo-cache.mjs'

test('repairs relocated paths and escaped permission lists, preserves artifacts and backs up originals', async () => {
  const root = await mkdtemp(join(tmpdir(), 'moonsprite-cargo-path-'))
  try {
    const build = join(root, 'src-tauri', 'target', 'debug', 'build', 'tauri-test')
    await mkdir(join(build, 'out'), { recursive: true })
    const oldTarget = 'D:\\old project\\src-tauri\\target'
    const oldOut = `${oldTarget}\\debug\\build\\tauri-test\\out`
    const output = `cargo:permission=${oldOut}\\permission-files\n`
    await writeFile(join(build, 'root-output'), oldOut)
    await writeFile(join(build, 'output'), output)
    await writeFile(join(build, 'out', 'core-permission-files'), JSON.stringify([`${oldOut}\\permissions\\app.toml`]))
    await writeFile(join(build, 'out', 'keep.lib'), 'compiled artifact')
    const result = await repairRelocatedCargoCache(root)
    assert.equal(result.changes.length, 3)
    assert.equal(await readFile(join(build, 'root-output'), 'utf8'), join(build, 'out'))
    assert.equal(await readFile(join(result.backupRoot, 'src-tauri/target/debug/build/tauri-test/output'), 'utf8'), output)
    const permissions = JSON.parse(await readFile(join(build, 'out', 'core-permission-files'), 'utf8'))
    assert.ok(permissions[0].startsWith(join(root, 'src-tauri', 'target')))
    assert.equal(await readFile(join(build, 'out', 'keep.lib'), 'utf8'), 'compiled artifact')
    assert.equal((await repairRelocatedCargoCache(root)).changes.length, 0)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test('missing build caches are a no-op', async () => {
  const root = await mkdtemp(join(tmpdir(), 'moonsprite-cargo-empty-'))
  try { assert.equal((await repairRelocatedCargoCache(root)).changes.length, 0) }
  finally { await rm(root, { recursive: true, force: true }) }
})
