const FORM_INPUT_SELECTOR = [
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([disabled])',
  'textarea:not([disabled])'
].join(',')

const isAvailable = (element: HTMLInputElement | HTMLTextAreaElement): boolean => (
  element.tabIndex >= 0
  && !element.hidden
  && !element.matches('[data-shortcut-capture]')
  && !element.closest('[hidden], [aria-hidden="true"], .shortcut-list')
)

export const adjacentFormInput = (
  target: EventTarget | null,
  backwards: boolean
): HTMLInputElement | HTMLTextAreaElement | null => {
  if (!(target instanceof HTMLElement)) return null
  const scope = target.closest<HTMLElement>('form, [role="dialog"], .modal')
  if (!scope) return null
  const fields = Array.from(scope.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(FORM_INPUT_SELECTOR)).filter(isAvailable)
  if (fields.length < 2) return null
  const currentIndex = fields.indexOf(target as HTMLInputElement | HTMLTextAreaElement)
  if (currentIndex < 0) return null
  const offset = backwards ? -1 : 1
  return fields[(currentIndex + offset + fields.length) % fields.length]
}
