/*
 * The document titles for the three lazy routes.
 *
 * They cannot be read from the copy: doing so would import the whole docs/FAQ/blog text into
 * the entry chunk and undo the code splitting. Three strings is all App needs.
 */
export const LAZY_PAGE_TITLES = {
  docs: { zh: '文档', en: 'Documentation' },
  faq: { zh: '常见问题', en: 'FAQ' },
  blog: { zh: '博客', en: 'Blog' },
} as const
