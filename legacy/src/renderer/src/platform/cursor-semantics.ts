/** Standard CSS cursor semantics resolve through the component library theme.
 * Keep this independent of pointer movement: adapt declarations, not hit tests.
 */
export const CURSOR_SEMANTICS: Readonly<Record<string, string>> = {
  auto: '--cursor-default', default: '--cursor-default',
  'context-menu': '--cursor-default', help: '--cursor-help', pointer: '--cursor-pointer',
  progress: '--cursor-progress', wait: '--cursor-wait',
  cell: '--cursor-crosshair', crosshair: '--cursor-crosshair',
  text: '--cursor-text', 'vertical-text': '--cursor-text',
  alias: '--cursor-copy', copy: '--cursor-copy',
  move: '--cursor-move', 'all-scroll': '--cursor-move',
  'no-drop': '--cursor-unavailable', 'not-allowed': '--cursor-unavailable',
  grab: '--cursor-grab', grabbing: '--cursor-grabbing',
  'e-resize': '--cursor-ew-resize', 'w-resize': '--cursor-ew-resize',
  'ew-resize': '--cursor-ew-resize', 'col-resize': '--cursor-ew-resize',
  'n-resize': '--cursor-ns-resize', 's-resize': '--cursor-ns-resize',
  'ns-resize': '--cursor-ns-resize', 'row-resize': '--cursor-ns-resize',
  'ne-resize': '--cursor-nesw-resize', 'sw-resize': '--cursor-nesw-resize',
  'nesw-resize': '--cursor-nesw-resize',
  'nw-resize': '--cursor-nwse-resize', 'se-resize': '--cursor-nwse-resize',
  'nwse-resize': '--cursor-nwse-resize',
  'zoom-in': '--cursor-zoom', 'zoom-out': '--cursor-zoom'
}

export function themedCursorValue(value: string): string {
  const keyword = value.trim().toLowerCase()
  const variable = Object.hasOwn(CURSOR_SEMANTICS, keyword) ? CURSOR_SEMANTICS[keyword] : undefined
  // Preserve inheritance, intentional hiding, and specialized canvas cursors.
  return variable ? `var(${variable}, ${keyword === 'auto' ? 'default' : keyword})` : value
}

const installations = new WeakMap<Document, () => void>()

export function installCursorSemantics(doc: Document = document): () => void {
  const existing = installations.get(doc)
  if (existing) return existing

  // Browser defaults do not live in document.styleSheets. Supply their common
  // semantics at zero specificity so an explicit tool/drag cursor always wins.
  const baseline = doc.createElement('style')
  baseline.dataset.cursorSemantics = 'true'
  baseline.textContent = `
    :where(html) { cursor: var(--cursor-default, default); }
    :where(a[href], button, summary, [role="button"], input[type="button"], input[type="submit"], input[type="reset"], input[type="checkbox"], input[type="radio"]) { cursor: var(--cursor-pointer, pointer); }
    :where(input, textarea, [contenteditable="true"], [contenteditable=""]) { cursor: var(--cursor-text, text); }
    :where(select, input[type="range"], input[type="color"], input[type="file"]) { cursor: var(--cursor-default, default); }
    :where(:disabled, [aria-disabled="true"]) { cursor: var(--cursor-unavailable, not-allowed); }
    ::-webkit-scrollbar { cursor: var(--cursor-default, default); }
  `
  doc.head.prepend(baseline)

  const adaptStyle = (style: CSSStyleDeclaration): void => {
    const original = style.getPropertyValue('cursor')
    if (!original) return
    const themed = themedCursorValue(original)
    if (original !== themed) style.setProperty('cursor', themed, style.getPropertyPriority('cursor'))
  }
  const adaptElement = (element: Element): void => {
    if ('style' in element) adaptStyle((element as HTMLElement | SVGElement).style)
  }
  const adaptSheets = (): void => {
    const visited = new Set<CSSStyleSheet>()
    const walkRules = (rules: CSSRuleList): void => {
      for (const rule of Array.from(rules)) {
        if ('style' in rule) adaptStyle((rule as CSSStyleRule).style)
        if ('cssRules' in rule) walkRules((rule as CSSGroupingRule).cssRules)
        if ('styleSheet' in rule && (rule as CSSImportRule).styleSheet) walkSheet((rule as CSSImportRule).styleSheet!)
      }
    }
    const walkSheet = (sheet: CSSStyleSheet): void => {
      if (visited.has(sheet)) return
      visited.add(sheet)
      try { walkRules(sheet.cssRules) } catch (error) {
        // External sheets may deny CSSOM access; keep their browser fallback.
        console.warn('MoonSprite could not apply cursor semantics to a stylesheet.', error)
      }
    }
    for (const sheet of Array.from(doc.styleSheets)) walkSheet(sheet)
  }
  adaptSheets()
  doc.querySelectorAll('[style]').forEach(adaptElement)

  const observer = new MutationObserver((records) => {
    const elements = new Set<Element>()
    let sheetsChanged = false
    for (const record of records) {
      if (record.type === 'attributes') {
        elements.add(record.target as Element)
        continue
      }
      const parent = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement
      if (parent?.closest('style')) sheetsChanged = true
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue
        const element = node as Element
        elements.add(element)
        if (element.matches('style, link[rel="stylesheet"]')) sheetsChanged = true
        element.querySelectorAll('[style], style, link[rel="stylesheet"]').forEach((child) => {
          elements.add(child)
          if (child.matches('style, link[rel="stylesheet"]')) sheetsChanged = true
        })
      }
    }
    for (const element of elements) adaptElement(element)
    if (sheetsChanged) adaptSheets()
  })
  observer.observe(doc.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style'] })
  const loaded = (event: Event): void => {
    if ((event.target as Element | null)?.tagName === 'LINK') adaptSheets()
  }
  doc.addEventListener('load', loaded, true)
  const dispose = (): void => {
    observer.disconnect()
    doc.removeEventListener('load', loaded, true)
    baseline.remove()
    installations.delete(doc)
  }
  installations.set(doc, dispose)
  return dispose
}
