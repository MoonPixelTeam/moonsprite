import { forwardRef, type TextareaHTMLAttributes } from 'react'

export const TextAreaInput = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextAreaInput({ className = '', ...props }, ref) {
  return <textarea ref={ref} {...props} className={`text-area-input ${className}`.trim()} />
})
