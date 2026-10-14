import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, unlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { changedProjectFiles, mapRepositoryFiles, readProjectHeadFile, workingProjectFiles } from './project-paths.mjs'
import { classifyDevTier } from './dev-validation-policy.mjs'
import { normalizeValidationFiles } from './validation-scope.mjs'

test('legacy paths retain root workflows and exclude native', () => {
  assert.deepEqual(mapRepositoryFiles(['legacy/src/a.ts','native/core/a.cpp','.github/workflows/ci.yml'], 'legacy/'), ['src/a.ts','.github/workflows/ci.yml'])
})

test('flat HEAD, uncommitted relocation and committed legacy retain edits, deletes and budget', () => {
  const root = mkdtempSync(join(tmpdir(), 'moonsprite-paths-'))
  const git = (...args) => execFileSync('git', args, { cwd:root, encoding:'utf8', stdio:['pipe','pipe','pipe'] })
  const write = (file, content) => { const parts=file.split('/'); parts.pop(); mkdirSync(join(root,...parts),{recursive:true}); writeFileSync(join(root,file),content) }
  try {
    git('init'); git('config','user.name','Path test'); git('config','user.email','paths@example.invalid'); git('config','core.autocrlf','false')
    write('package.json','{}\n')
    write('scripts/budget.json','{"budget":1}\n')
    write('src/renderer/src/core/selection.ts','export const a = 1\n')
    write('src/renderer/src/core/project-format.ts','export const b = 1\n')
    write('.github/workflows/ci.yml','name: test\n')
    git('add','.'); git('commit','-m','flat fixture')
    assert.deepEqual(workingProjectFiles(root),[])
    assert.equal(readProjectHeadFile('scripts/budget.json',root),'{"budget":1}')
    mkdirSync(join(root,'legacy'))
    for(const file of ['package.json','scripts','src'])renameSync(join(root,file),join(root,'legacy',file))
    const app=join(root,'legacy')
    assert.deepEqual(workingProjectFiles(app),[],'pure move is not a content change')
    write('legacy/src/renderer/src/core/selection.ts','export const a = 2\n')
    unlinkSync(join(app,'src/renderer/src/core/project-format.ts'))
    write('native/README.md','new implementation\n')
    const changed=workingProjectFiles(app)
    assert.ok(changed.includes('src/renderer/src/core/selection.ts'))
    assert.ok(changed.includes('src/renderer/src/core/project-format.ts'),'deleted high-risk source must not disappear')
    assert.equal(classifyDevTier(changed),'D3')
    assert.deepEqual(normalizeValidationFiles([join(app,'src/renderer/src/core/selection.ts')],app),['src/renderer/src/core/selection.ts'])
    assert.equal(readProjectHeadFile('scripts/budget.json',app),' {"budget":1}'.trim())
    git('add','.'); git('commit','-m','relocated fixture')
    assert.deepEqual(workingProjectFiles(app),[])
    write('native/README.md','only native changes\n')
    assert.deepEqual(changedProjectFiles('HEAD',app),[])
    write('.github/workflows/ci.yml','name: changed\n')
    assert.deepEqual(changedProjectFiles('HEAD',app),['.github/workflows/ci.yml'])
    write('legacy/src/renderer/src/core/selection.ts','export const a = 3\n')
    assert.ok(workingProjectFiles(app).includes('src/renderer/src/core/selection.ts'))
    assert.equal(readProjectHeadFile('scripts/budget.json',app),' {"budget":1}'.trim())
  } finally {
    // Only the unique directory created by this test is ever removed.
    rmSync(root,{recursive:true,force:true})
  }
})
