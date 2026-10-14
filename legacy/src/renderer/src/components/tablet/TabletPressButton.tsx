import { useEffect, useRef } from 'react'
import { Button } from '@/components/Button'

export function TabletPressButton({ label, active, locked = false, onActive }: { label: string; active: boolean; locked?: boolean; onActive: (active: boolean) => void }) {
  const pressed = useRef(false), action = useRef(onActive)
  action.current = onActive
  useEffect(() => {
    const release = () => { if (pressed.current) { pressed.current = false; action.current(false) } }
    window.addEventListener('blur', release)
    return () => { window.removeEventListener('blur', release); release() }
  }, [])
  const release = () => { if (pressed.current) { pressed.current = false; onActive(false) } }
  return <Button data-tablet-modifier aria-pressed={active} title={label}
    onPointerDown={event => { if (locked || event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pressed.current = true; onActive(true) }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onKeyDown={event => { if (!locked && (event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); pressed.current = true; onActive(true) } }}
    onKeyUp={release} onBlur={release}
    onClick={() => { if (locked) onActive(!active) }}>{label}</Button>
}
