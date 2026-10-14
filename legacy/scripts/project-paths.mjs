import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const lines = text => text.trim() ? text.trim().split(/\r?\n/) : []
export const projectGit = (args, root = projectRoot, options = {}) => execFileSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options }).trim()
export const gitRoot = (root = projectRoot) => projectGit(['rev-parse', '--show-toplevel'], root)
export const projectPrefix = (root = projectRoot) => {
  const prefix = relative(gitRoot(root), resolve(root)).replaceAll('\\', '/')
  return prefix ? `${prefix}/` : ''
}

export function mapRepositoryFiles(files, prefix) {
  return [...new Set(files.map(file => file.replaceAll('\\', '/')).flatMap(file => {
    if (file.startsWith('.github/')) return [file]
    if (!prefix) return [file]
    return file.startsWith(prefix) ? [file.slice(prefix.length)] : []
  }))]
}

export function changedProjectFiles(revision = 'HEAD', root = projectRoot) {
  const repository = gitRoot(root)
  return mapRepositoryFiles(lines(projectGit(['diff', '--no-renames', '--name-only', revision], repository)), projectPrefix(root))
}

export function workingProjectFiles(root = projectRoot) {
  const files = [...new Set([...changedProjectFiles('HEAD', root), ...lines(projectGit(['ls-files', '--others', '--exclude-standard'], root))])]
  const prefix = projectPrefix(root)
  if (!prefix) return files
  // During the one-time uncommitted directory move, unchanged files appear as
  // untracked. Compare Git blobs using Git's own clean filters, not timestamps
  // or a broad path exclusion, so edited high-risk files remain visible.
  const tree = projectGit(['ls-tree', '--full-tree', '-r', '-z', 'HEAD'], root).split('\0').filter(Boolean)
  const blobs = new Map(tree.map(entry => { const [meta, path] = entry.split('\t'); return [path, meta.split(' ')[2]] }))
  if (blobs.has(`${prefix}package.json`) || !blobs.has('package.json')) return files
  for (const path of blobs.keys()) {
    if (path === '.gitattributes' || path.startsWith('.github/')) continue
    if (!existsSync(resolve(root, path)) && !files.includes(path)) files.push(path)
  }
  const candidates = files.filter(file => !file.startsWith('.github/') && blobs.has(file) && existsSync(resolve(root, file)))
  if (!candidates.length) return files
  const hashes = lines(projectGit(['hash-object', '--stdin-paths'], root, { input: candidates.map(file => resolve(root, file).replaceAll('\\', '/')).join('\n') + '\n', maxBuffer: 16 * 1024 * 1024 }))
  const unchanged = new Set(candidates.filter((file, i) => hashes[i] === blobs.get(file)))
  return files.filter(file => !unchanged.has(file))
}

export function readProjectHeadFile(file, root = projectRoot) {
  const prefix = projectPrefix(root)
  const paths = prefix ? [`${prefix}${file}`, file] : [file]
  for (const path of paths) {
    const result = execFileSync('git', ['ls-tree', 'HEAD', '--', path], { cwd: gitRoot(root), encoding: 'utf8' })
    if (result.trim()) return projectGit(['show', `HEAD:${path}`], root)
  }
  return null
}
