import { resolve } from 'node:path'
import { collectBundleReport, run, runPnpm } from './performance-runtime.mjs'
import { readJson, writeJson } from './performance-audit-store.mjs'

const canvasArguments = (suite, outputPath, repetitions = suite.repetitions ?? 1) => [
  'scripts/canvas-performance.mjs',
  `--size=${suite.sizes.join(',')}`,
  `--scenario=${suite.scenarios.join(',')}`,
  `--repeat=${repetitions}`,
  `--runtime=${suite.runtime ?? 'production'}`,
  `--output-json=${outputPath}`,
]

const buildCanvasRuntime = (runtime) => runPnpm([
  'exec',
  'vite',
  'build',
  '--config',
  'vite.config.ts',
  '--mode',
  runtime === 'profile' ? 'performance-profile' : 'performance-production',
])

async function executeSuite(suite, directory) {
  const outputPath = resolve(directory, `${suite.id}.json`)
  if (suite.kind === 'canvas') {
    run(process.execPath, canvasArguments(suite, outputPath))
    const report = await readJson(outputPath)
    if (suite.runtime === 'profile' && !report.results?.some((result) => result.reactCommitCount > 0 || Object.keys(result.reactByRegion ?? {}).length > 0)) {
      throw new Error('React profiling build did not record any commit samples.')
    }
    return report
  }
  if (suite.kind === 'vitest-benchmark') {
    runPnpm(['exec', 'vitest', 'bench', suite.file, '--run', `--outputJson=${outputPath}`])
    return readJson(outputPath)
  }
  if (suite.kind === 'bundle') {
    const report = collectBundleReport()
    await writeJson(outputPath, report)
    return report
  }
  if (suite.kind === 'desktop') {
    runPnpm(['test:desktop'])
    const report = { schemaVersion: 1, suite: 'desktop', passed: true, createdAt: new Date().toISOString() }
    await writeJson(outputPath, report)
    return report
  }
  const report = { schemaVersion: 1, suite: suite.id, covered: false, createdAt: new Date().toISOString() }
  await writeJson(outputPath, report)
  return report
}

export async function executePerformanceSuites(suites, directory) {
  const canvasRuntimes = [...new Set(suites.filter((suite) => suite.kind === 'canvas').map((suite) => suite.runtime ?? 'production'))]
  for (const runtime of canvasRuntimes) buildCanvasRuntime(runtime)
  if (suites.some((suite) => suite.kind === 'bundle')) runPnpm(['build:web'])
  const reports = {}
  for (const suite of suites) reports[suite.id] = await executeSuite(suite, directory)
  return reports
}

export async function confirmCanvasCandidate(suite, candidate, directory, existingReport) {
  const matching = existingReport.results.filter((result) => result.canvasSize === candidate.target.canvasSize && result.scenario === candidate.target.scenario)
  const missing = Math.max(0, 3 - matching.length)
  if (missing === 0) return existingReport
  const confirmationSuite = {
    ...suite,
    sizes: [candidate.target.canvasSize],
    scenarios: [candidate.target.scenario],
    repetitions: missing,
  }
  const outputPath = resolve(directory, `${suite.id}-confirmation.json`)
  run(process.execPath, canvasArguments(confirmationSuite, outputPath, missing))
  const confirmation = await readJson(outputPath)
  const merged = { ...existingReport, results: [...existingReport.results, ...confirmation.results] }
  await writeJson(resolve(directory, `${suite.id}.json`), merged)
  return merged
}

export async function executeCandidate(candidate, suite, directory) {
  if (suite.kind === 'canvas') buildCanvasRuntime(suite.runtime ?? 'production')
  else if (suite.kind === 'bundle') runPnpm(['build:web'])
  if (suite.kind === 'canvas') {
    const targeted = {
      ...suite,
      sizes: [candidate.target.canvasSize],
      scenarios: [candidate.target.scenario],
      repetitions: 3,
    }
    return executeSuite(targeted, directory)
  }
  return executeSuite(suite, directory)
}
