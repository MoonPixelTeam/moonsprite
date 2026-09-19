import { Children, isValidElement, type ButtonHTMLAttributes, type ReactNode } from 'react'

function textContent(node: ReactNode): string {
  return Children.toArray(node).map((child) => {
    if (typeof child === 'string' || typeof child === 'number') return String(child)
    return isValidElement<{ children?: ReactNode }>(child) ? textContent(child.props.children) : ''
  }).join('')
}

/** Keep shortcut and status columns separate from the shrinkable label. */
export function MenuItemButton({ children, title, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const content: ReactNode[] = []
  const decorations: ReactNode[] = []
  Children.toArray(children).forEach((child) => {
    const separate = isValidElement<{ className?: string }>(child)
      && (child.type === 'kbd' || /\bmenu-(?:check|submenu-arrow)\b/.test(child.props.className ?? ''))
    ;(separate ? decorations : content).push(child)
  })
  const label = textContent(content).trim()
  const hint = title && title !== label ? `${label}\n${title}` : label
  return <button {...props} className={`menu-action ${className}`.trim()} title={hint || undefined}>
    <span className="menu-action-label">{content}</span>
    {decorations}
  </button>
}
