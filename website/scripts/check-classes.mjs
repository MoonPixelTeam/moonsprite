/*
 * Finds class names used in the markup that have no rule in styles.css.
 *
 * This is the check that was missing: the last two rounds shipped screens whose class hooks
 * were never written, so they fell back to default markup and looked broken. A class with
 * no rule is almost always a mistake — either the rule was forgotten or the name is a typo.
 *
 * Run: node scripts/check-classes.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not URL.pathname: the checkout path is not ASCII, and pathname
// percent-encodes it into something readFileSync cannot open.
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const srcDir = join(root, 'src')

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) files.push(...walk(full))
    else if (/\.tsx?$/.test(entry) && !/\.d\.ts$/.test(entry)) files.push(full)
  }
  return files
}

const css = readFileSync(join(srcDir, 'styles.css'), 'utf8')
// Every class the stylesheet mentions, from selectors and from :has()/:not() clauses alike.
const styled = new Set((css.match(/\.([a-zA-Z][\w-]*)/g) ?? []).map((token) => token.slice(1)))

/*
 * Wrappers that deliberately carry no rule of their own. Each is a layout container or a
 * page marker that exists only to be targeted by descendant selectors, so a bare rule for
 * it would be noise. Everything else with no rule is treated as a mistake.
 */
const allowed = new Map([
  ['market', 'page wrapper; its children carry the rules (.market-shelf, .market-browse)'],
  ['market-detail-page', 'page marker for detail-page-only overrides'],
  ['studio-form', 'form wrapper; the fields inside carry the rules'],
  ['studio-publish', 'panel marker; the grid and fieldsets inside carry the rules'],
])

/**
 * Class names written literally in a className, ignoring template interpolations. Covers a
 * plain string, a template literal, and a concatenation such as `"a " + (x ? "b" : "c")`,
 * because all three are how these names actually get written.
 */
function classNamesIn(source) {
  const names = []
  const literals = []
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{([^}]*)\})/g)) {
    literals.push(match[1] ?? match[2] ?? '')
  }
  for (const raw of literals) {
    /*
     * Strip comparisons first. `className={mode === 'register' ? ... }` contains a quoted
     * word that is a right-hand operand, not a class name, and reading it as one produced
     * three false positives before this line existed.
     */
    const withoutComparisons = raw.replace(/[!=]==?\s*(?:'[^']*'|"[^"]*")/g, ' ')
    for (const quoted of withoutComparisons.matchAll(/'([^']*)'|"([^"]*)"|`([^`]*)`/g)) {
      const value = quoted[1] ?? quoted[2] ?? quoted[3] ?? ''
      for (const name of value.split(/\s+/)) if (/^[a-z][\w-]*$/.test(name)) names.push(name)
    }
  }
  return names
}

const missing = new Map()
for (const file of walk(srcDir)) {
  const source = readFileSync(file, 'utf8')
  for (const name of classNamesIn(source)) {
    if (styled.has(name) || allowed.has(name)) continue
    const where = relative(root, file).replace(/\\/g, '/')
    if (!missing.has(name)) missing.set(name, new Set())
    missing.get(name).add(where)
  }
}

if (missing.size === 0) {
  console.log(`every class used in markup has a rule in styles.css (${allowed.size} declared wrappers exempt)`)
  process.exit(0)
}

console.log(`${missing.size} class name(s) used in markup with no rule in styles.css:\n`)
for (const [name, files] of [...missing].sort()) {
  console.log(`  .${name}`)
  for (const file of files) console.log(`      ${file}`)
}
process.exit(1)
