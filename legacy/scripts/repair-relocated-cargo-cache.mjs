import { readdir, readFile, mkdir, copyFile, writeFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// Cargo build-script outputs contain absolute paths. Preserve compiled artifacts
// after a directory move by rebasing only generated metadata, with backups.
export async function repairRelocatedCargoCache(projectRoot) {
  const root = resolve(projectRoot)
  const changes = []
  const backupRoot = join(root, 'output', 'cargo-path-repair', `${Date.now()}-${process.pid}`)
  for (const target of ['src-tauri/target', 'src-tauri/thumbnail-provider/target', 'target/desktop-dev']) {
    const targetRoot = resolve(root, target)
    let profiles
    try { profiles = await readdir(targetRoot, { withFileTypes: true }) } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    for (const profile of profiles.filter(entry => entry.isDirectory())) {
      const buildRoot = join(targetRoot, profile.name, 'build')
      let builds
      try { builds = await readdir(buildRoot, { withFileTypes: true }) } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      for (const build of builds.filter(entry => entry.isDirectory())) {
        const directory = join(buildRoot, build.name)
        let priorOut
        try { priorOut = (await readFile(join(directory, 'root-output'), 'utf8')).trim() } catch (error) {
          if (error.code === 'ENOENT') continue
          throw error
        }
        const currentOut = join(directory, 'out')
        if (priorOut === currentOut) continue
        const suffix = `${profile.name}/build/${build.name}/out`
        const normalized = priorOut.replaceAll('\\', '/')
        if (!normalized.endsWith(`/${suffix}`)) continue
        const oldTarget = priorOut.slice(0, priorOut.length - suffix.length - 1)
        const files = [join(directory, 'output'), join(directory, 'root-output')]
        try {
          for (const name of await readdir(currentOut)) {
            if (name.endsWith('permission-files')) files.push(join(currentOut, name))
          }
        } catch (error) { if (error.code !== 'ENOENT') throw error }
        for (const file of files) {
          let before
          try { before = await readFile(file, 'utf8') } catch (error) {
            if (error.code === 'ENOENT') continue
            throw error
          }
          const after = before
            .replaceAll(JSON.stringify(oldTarget).slice(1, -1), JSON.stringify(targetRoot).slice(1, -1))
            .replaceAll(oldTarget, targetRoot)
          if (after === before) continue
          const backup = join(backupRoot, relative(root, file))
          await mkdir(resolve(backup, '..'), { recursive: true })
          await copyFile(file, backup)
          await writeFile(file, after)
          changes.push(relative(root, file))
        }
      }
    }
  }
  if (changes.length) {
    await writeFile(join(backupRoot, 'manifest.json'), JSON.stringify({ root, changes }, null, 2))
  }
  return { changes, backupRoot: changes.length ? backupRoot : null }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await repairRelocatedCargoCache(resolve(fileURLToPath(new URL('..', import.meta.url))))
  if (result.changes.length) console.log(`[MoonSprite] Repaired ${result.changes.length} relocated Cargo metadata files; originals: ${result.backupRoot}`)
}
