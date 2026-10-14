import { spawn } from 'node:child_process'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { repairRelocatedCargoCache } from './repair-relocated-cargo-cache.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const result = await repairRelocatedCargoCache(root)
if (result.changes.length) console.log(`[MoonSprite] Repaired ${result.changes.length} relocated Cargo metadata files; originals: ${result.backupRoot}`)
// Keep moved/sandbox-labelled legacy caches intact. New development artifacts
// live separately from packaging and native-rewrite artifacts.
const target = process.env.CARGO_TARGET_DIR || join(root, 'target', 'desktop-dev')
const child = spawn(process.execPath, [resolve(root, 'node_modules/@tauri-apps/cli/tauri.js'), 'dev', '--config', 'src-tauri/tauri.dev.conf.json'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, CARGO_TARGET_DIR: target }
})
child.on('error', error => { console.error(`[MoonSprite] Development startup failed: ${error.message}`); process.exitCode = 1 })
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
