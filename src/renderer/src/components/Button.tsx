import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quiet' | 'danger'
}

/** Shared command button; appearance and density come from the UI library. */
export function Button({ variant = 'quiet', type = 'button', className = '', ...props }: ButtonProps) {
  return <button {...props} type={type} className={`${variant}-button ${className}`.trim()} />
}

interface FileButtonProps {
  children: ReactNode
  label: string
  accept: string
  multiple?: boolean
  disabled?: boolean
  onFiles: (files: File[]) => void
}

export function FileButton({ children, label, accept, multiple, disabled, onFiles }: FileButtonProps) {
  const input = useRef<HTMLInputElement>(null)
  return <>
    <Button aria-label={label} disabled={disabled} onClick={() => input.current?.click()}>{children}</Button>
    <input ref={input} hidden type="file" aria-label={label} accept={accept} multiple={multiple} disabled={disabled} onChange={event => {
      const files = Array.from(event.target.files || [])
      event.target.value = ''
      if (files.length) onFiles(files)
    }} />
  </>
}
