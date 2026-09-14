import { useEffect, useMemo, useRef, useState } from 'react'
import type { StoredExtension } from '@shared/types-extensions'
import type { DocumentSession } from '@/store/workspace'
import { listExtensionPetContributions } from '@/core/pet-contributions'
import { loadPetPosition, loadPetPreferences, savePetPosition } from '@/core/pet-preferences'
import { listenForExtensionPetInspection, listenForExtensionPetPosition, observeAppWindowForExtensionPet, readAppWindowForExtensionPet } from '@/platform/extension-pet-window'

const CALLOUT_GAP = 8

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value))

const petCalloutPosition = (petX: number, petY: number, petWidth: number, petHeight: number, calloutWidth: number, calloutHeight: number): { left: number; top: number } => {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const centeredLeft = clamp(petX + (petWidth - calloutWidth) / 2, CALLOUT_GAP, Math.max(CALLOUT_GAP, viewportWidth - calloutWidth - CALLOUT_GAP))
  const aboveTop = petY - calloutHeight - CALLOUT_GAP
  if (aboveTop >= CALLOUT_GAP) return { left: centeredLeft, top: aboveTop }
  const sideTop = clamp(petY + (petHeight - calloutHeight) / 2, CALLOUT_GAP, Math.max(CALLOUT_GAP, viewportHeight - calloutHeight - CALLOUT_GAP))
  if (petX + petWidth + CALLOUT_GAP + calloutWidth <= viewportWidth - CALLOUT_GAP) return { left: petX + petWidth + CALLOUT_GAP, top: sideTop }
  if (petX - CALLOUT_GAP - calloutWidth >= CALLOUT_GAP) return { left: petX - CALLOUT_GAP - calloutWidth, top: sideTop }
  return { left: centeredLeft, top: clamp(petY + petHeight + CALLOUT_GAP, CALLOUT_GAP, Math.max(CALLOUT_GAP, viewportHeight - calloutHeight - CALLOUT_GAP)) }
}

export function ExtensionPetHost({ extensions, session, homeOpen }: { extensions: readonly StoredExtension[]; session: DocumentSession | null; homeOpen: boolean }) {
  const pets = useMemo(() => listExtensionPetContributions(extensions), [extensions])
  const drawingStartedAt = useRef(Date.now())
  const lastDrawingAt = useRef(Date.now())
  const lastRevision = useRef<number | null>(null)
  const unsavedSince = useRef<number | null>(null)
  const lastDirty = useRef(false)
  const savedAt = useRef(0)
  const openedAt = useRef(Date.now())
  const shownPetIdentity = useRef<string | null>(null)
  const showEndsAt = useRef(0)
  const lastInteractionAt = useRef(Date.now())
  const exportedAt = useRef(0)
  const lastReminder = useRef<{ unsaved: number; break: number }>({ unsaved: 0, break: 0 })
  const lastTimeChime = useRef('')
  const messageSequence = useRef(0)
  const [clock, setClock] = useState(0)
  const [preferenceRevision, setPreferenceRevision] = useState(0)
  const [inspection, setInspection] = useState<{ extensionId: string; petId: string; x: number; y: number } | null>(null)
  const [message, setMessage] = useState<{ id: number; text: string } | null>(null)

  useEffect(() => {
    let interval: number | undefined
    const timeout = window.setTimeout(() => {
      setClock((value) => value + 1)
      interval = window.setInterval(() => setClock((value) => value + 1), 60_000)
    }, 60_000 - Date.now() % 60_000 + 20)
    return () => {
      window.clearTimeout(timeout)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [])
  useEffect(() => {
    const markInteraction = (): void => { lastInteractionAt.current = Date.now() }
    const markExport = (): void => { exportedAt.current = Date.now(); setClock((value) => value + 1) }
    const refreshPreferences = (): void => setPreferenceRevision((value) => value + 1)
    window.addEventListener('pointerdown', markInteraction, true)
    window.addEventListener('keydown', markInteraction, true)
    window.addEventListener('moonsprite:extension-pet-export', markExport)
    window.addEventListener('moonsprite:pets-preferences-changed', refreshPreferences)
    return () => {
      window.removeEventListener('pointerdown', markInteraction, true)
      window.removeEventListener('keydown', markInteraction, true)
      window.removeEventListener('moonsprite:extension-pet-export', markExport)
      window.removeEventListener('moonsprite:pets-preferences-changed', refreshPreferences)
    }
  }, [])
  useEffect(() => {
    if (!session) return
    openedAt.current = Date.now()
    drawingStartedAt.current = openedAt.current
    lastDrawingAt.current = openedAt.current
    lastRevision.current = null
    unsavedSince.current = session.document.dirty ? openedAt.current : null
    lastDirty.current = session.document.dirty
    setMessage(null)
  }, [session?.document.id])
  useEffect(() => {
    if (!session) return
    if (lastRevision.current !== null && lastRevision.current !== session.contentRevision) {
      const now = Date.now()
      if (now - lastDrawingAt.current > 5 * 60_000) drawingStartedAt.current = now
      lastDrawingAt.current = now
    }
    lastRevision.current = session.contentRevision
    if (session.document.dirty && unsavedSince.current === null) unsavedSince.current = Date.now()
    if (!session.document.dirty && lastDirty.current) {
      unsavedSince.current = null
      savedAt.current = Date.now()
    }
    lastDirty.current = session.document.dirty
  }, [session?.contentRevision, session?.document.dirty])

  useEffect(() => {
    let remove: (() => void) | undefined
    void listenForExtensionPetPosition((position) => savePetPosition(position.extensionId, position.petId, position)).then((unlisten) => { remove = unlisten })
    return () => remove?.()
  }, [])
  useEffect(() => {
    let remove: (() => void) | undefined
    void listenForExtensionPetInspection((event) => setInspection(event)).then((unlisten) => { remove = unlisten })
    return () => remove?.()
  }, [])
  useEffect(() => {
    if (!inspection) return
    const timer = window.setTimeout(() => setInspection(null), 8_000)
    return () => window.clearTimeout(timer)
  }, [inspection])
  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 8_000)
    return () => window.clearTimeout(timer)
  }, [message])
  useEffect(() => {
    if (!session || !loadPetPreferences().remindersEnabled) return
    const now = new Date()
    if (now.getMinutes() !== 0 && now.getMinutes() !== 30) return
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`
    if (lastTimeChime.current === key) return
    lastTimeChime.current = key
    const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
    setMessage({ id: ++messageSequence.current, text: `现在是 ${time}。` })
  }, [clock, session?.document.id])

  useEffect(() => {
    const selected = pets[0]
    const preferences = loadPetPreferences()
    if (!selected || !session || homeOpen || !preferences.enabled) {
      shownPetIdentity.current = null
      showEndsAt.current = 0
      void window.moonSprite.hideExtensionPet().catch(() => undefined)
      return
    }
    let active = true
    const sync = async (): Promise<void> => {
      const { position, size } = await readAppWindowForExtensionPet()
      if (!active) return
      const scale = preferences.scale
      const width = selected.pet.frameWidth * scale
      const height = selected.pet.frameHeight * scale
      const relative = loadPetPosition(selected.extensionId, selected.pet.id)
      const maxX = Math.max(0, size.width - width)
      const maxY = Math.max(0, size.height - height)
      const now = Date.now()
      const petIdentity = `${selected.extensionId}:${selected.pet.id}`
      let animationState: 'show' | 'idle' | 'save' | 'export-complete' | 'unsaved-reminder' | 'break-reminder' | 'sleep' = 'idle'
      if (shownPetIdentity.current !== petIdentity) {
        shownPetIdentity.current = petIdentity
        const show = selected.pet.animations.find((animation) => animation.state === 'show')
        showEndsAt.current = now + (show ? Math.max(16, Math.round(show.frames.length * 1000 / show.fps)) : 0)
      }
      if (now < showEndsAt.current) animationState = 'show'
      else if (now - exportedAt.current < 1_500) animationState = 'export-complete'
      else if (now - savedAt.current < 1_500) animationState = 'save'
      else if (now - lastInteractionAt.current >= 5 * 60_000) animationState = 'sleep'
      if (preferences.remindersEnabled && session.document.dirty && unsavedSince.current && now - unsavedSince.current >= preferences.unsavedMinutes * 60_000 && now - lastReminder.current.unsaved >= preferences.unsavedMinutes * 60_000) {
        animationState = 'unsaved-reminder'
        lastReminder.current.unsaved = now
        setMessage({ id: ++messageSequence.current, text: `工程已经 ${preferences.unsavedMinutes} 分钟未保存，记得保存一下，避免丢失进度。` })
      } else if (preferences.remindersEnabled && now - drawingStartedAt.current >= preferences.breakMinutes * 60_000 && now - lastReminder.current.break >= preferences.breakMinutes * 60_000) {
        animationState = 'break-reminder'
        lastReminder.current.break = now
        const hours = Math.max(1, Math.floor((now - drawingStartedAt.current) / 60 / 60_000))
        setMessage({ id: ++messageSequence.current, text: `你已经连续绘制 ${hours} 小时了，休息一下，活动活动眼睛和手腕吧。` })
      }
      await window.moonSprite.showExtensionPet(selected.extensionId, selected.pet.id, {
        x: position.x + Math.round(relative.x * maxX),
        y: position.y + Math.round(relative.y * maxY),
        width,
        height
      }, {
        name: session.document.name,
        width: session.document.width,
        height: session.document.height,
        colorMode: session.document.colorMode,
        layerCount: session.document.layers.length,
        frameCount: session.document.animation?.frames.length ?? 1,
        dirty: session.document.dirty,
        drawingMinutes: Math.floor((Date.now() - drawingStartedAt.current) / 60_000),
        animationState
      })
    }
    void sync().catch(() => undefined)
    let removeWindowListener: (() => void) | undefined
    void observeAppWindowForExtensionPet(sync).then((remove) => { removeWindowListener = remove })
    return () => {
      active = false
      removeWindowListener?.()
    }
  }, [clock, homeOpen, pets, preferenceRevision, session?.contentRevision, session?.document.id, session?.document.dirty, session?.document.layers.length, session?.document.animation?.frames.length])

  if (!session) return null
  const pixelScale = window.devicePixelRatio || 1
  const preferences = loadPetPreferences()
  const activePet = pets[0] ?? null
  const activePetWidth = activePet ? activePet.pet.frameWidth * preferences.scale / pixelScale : 0
  const activePetHeight = activePet ? activePet.pet.frameHeight * preferences.scale / pixelScale : 0
  const activePosition = activePet
    ? loadPetPosition(activePet.extensionId, activePet.pet.id)
    : { x: 0, y: 0 }
  const messagePosition = petCalloutPosition(
    activePosition.x * Math.max(0, window.innerWidth - activePetWidth),
    activePosition.y * Math.max(0, window.innerHeight - activePetHeight),
    activePetWidth,
    activePetHeight,
    220,
    56
  )
  const inspectedPet = inspection ? pets.find((candidate) => candidate.extensionId === inspection.extensionId && candidate.pet.id === inspection.petId) : null
  const informationPosition = inspection && inspectedPet
    ? petCalloutPosition(inspection.x / pixelScale, inspection.y / pixelScale, inspectedPet.pet.frameWidth * preferences.scale / pixelScale, inspectedPet.pet.frameHeight * preferences.scale / pixelScale, 208, 106)
    : null
  return <>
    {message && activePet ? <aside className="extension-pet-message" style={messagePosition}>{message.text}</aside> : null}
    {inspection && inspectedPet && informationPosition ? <section className="extension-pet-project-info" style={informationPosition}>
      <header><strong>{session.document.name}</strong><button type="button" aria-label="关闭宠物工程信息" title="关闭" onClick={() => setInspection(null)}>x</button></header>
      <span>{session.document.width} x {session.document.height} · {session.document.colorMode}</span>
      <span>{session.document.layers.length} 图层 · {session.document.animation?.frames.length ?? 1} 帧</span>
      <span>{session.document.dirty ? '未保存' : '已保存'} · 绘制 {Math.floor((Date.now() - drawingStartedAt.current) / 60_000)} 分钟</span>
      <small>{inspectedPet.pet.name}</small>
    </section> : null}
  </>
}
