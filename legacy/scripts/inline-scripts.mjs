import { JSDOM } from 'jsdom'

// Parse using HTML rules, without executing scripts or loading resources.
export const extractInlineScripts = (html) => [...JSDOM.fragment(html).querySelectorAll('script:not([src])')]
  .map((script) => script.textContent)
