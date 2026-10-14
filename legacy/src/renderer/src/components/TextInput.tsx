import type { InputHTMLAttributes } from 'react'

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  density?: 'compact' | 'regular'
}

export function TextInput({ className = '', density = 'regular', type = 'text', ...props }: TextInputProps) {
  return <input {...props} type={type} className={`text-input text-input-${density} ${className}`.trim()} />
}
