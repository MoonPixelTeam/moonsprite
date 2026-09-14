import { useEffect, useMemo, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ExtensionPetAnimationState, StoredExtensionPet } from '@shared/types-extensions'
import { extensionPetIdentityFromLocation, listenForExtensionPetConfiguration, reportExtensionPetPosition, startExtensionPetDragging } from '@/platform/extension-pet-window'

const dataUrl = (bytes: Uint8Array): string => URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'image/png' }))

const animationFor = (pet: StoredExtensionPet, state: ExtensionPetAnimationState) =>
  pet.animations.find((animation) => animation.state === state) ?? pet.animations.find((animation) => animation.state === 'idle') ?? null

export function PetWindow() {
  const [identity, setIdentity] = useState(extensionPetIdentityFromLocation)
  const [pet, setPet] = useState<StoredExtensionPet | null>(null)
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null)
  const [spriteImage, setSpriteImage] = useState<HTMLImageElement | null>(null)
  const [columns, setColumns] = useState(1)
  const [sheetSize, setSheetSize] = useState({ width: 1, height: 1 })
  const [state, setState] = useState<ExtensionPetAnimationState>('show')
  const [frameOffset, setFrameOffset] = useState(0)
  const pointerDownAt = useRef<{ x: number; y: number; dragging: boolean } | null>(null)

  useEffect(() => {
    let active = true
    let currentUrl: string | null = null
    void (async () => {
      const listing = await window.moonSprite.listExtensions()
      const extension = listing.extensions.find((candidate) => candidate.id === identity.extensionId && candidate.enabled)
      const found = extension?.pets?.find((candidate) => candidate.id === identity.petId) ?? null
      if (!found) return
      const bytes = await window.moonSprite.readExtensionPetSprite(identity.extensionId, identity.petId)
      currentUrl = dataUrl(bytes)
      const image = new Image()
      image.onload = () => {
        if (!active) return
        setColumns(Math.max(1, Math.floor(image.naturalWidth / found.frameWidth)))
        setSheetSize({ width: image.naturalWidth, height: image.naturalHeight })
        setPet(found)
        setSpriteImage(image)
        setSpriteUrl(currentUrl)
      }
      image.src = currentUrl
    })().catch(() => undefined)
    return () => { active = false; if (currentUrl) URL.revokeObjectURL(currentUrl) }
  }, [identity])

  useEffect(() => {
    let remove: (() => void) | undefined
    void listenForExtensionPetConfiguration((configuration) => {
      setIdentity((current) => current.extensionId === configuration.extensionId && current.petId === configuration.petId
        ? current
        : { extensionId: configuration.extensionId, petId: configuration.petId })
      if (configuration.summary.animationState) setState(configuration.summary.animationState)
    }).then((unlisten) => { remove = unlisten })
    return () => remove?.()
  }, [])

  useEffect(() => {
    let remove: (() => void) | undefined
    void getCurrentWindow().onMoved(() => {
      void reportExtensionPetPosition(identity.extensionId, identity.petId).catch(() => undefined)
    }).then((unlisten) => { remove = unlisten })
    return () => remove?.()
  }, [identity.extensionId, identity.petId])

  const animation = pet ? animationFor(pet, state) : null
  useEffect(() => {
    if (!animation) return
    setFrameOffset(0)
    const timer = window.setInterval(() => setFrameOffset((current) => (current + 1) % animation.frames.length), Math.max(16, Math.round(1000 / animation.fps)))
    return () => window.clearInterval(timer)
  }, [animation])
  useEffect(() => {
    if (!animation || state === 'idle') return
    const duration = state === 'show'
      ? Math.max(16, Math.round(animation.frames.length * 1000 / animation.fps))
      : 1_500
    const timer = window.setTimeout(() => setState('idle'), duration)
    return () => window.clearTimeout(timer)
  }, [animation, state])

  const currentFrame = animation?.frames[frameOffset] ?? 0
  useEffect(() => {
    if (!pet || !spriteImage) return
    const canvas = document.createElement('canvas')
    canvas.width = pet.frameWidth
    canvas.height = pet.frameHeight
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    context.drawImage(spriteImage, (currentFrame % columns) * pet.frameWidth, Math.floor(currentFrame / columns) * pet.frameHeight, pet.frameWidth, pet.frameHeight, 0, 0, pet.frameWidth, pet.frameHeight)
    const alpha = context.getImageData(0, 0, pet.frameWidth, pet.frameHeight).data
    const spans: { x: number; y: number; width: number }[] = []
    for (let y = 0; y < pet.frameHeight; y++) {
      let start = -1
      for (let x = 0; x <= pet.frameWidth; x++) {
        const opaque = x < pet.frameWidth && alpha[(y * pet.frameWidth + x) * 4 + 3] >= 16
        if (opaque && start < 0) start = x
        if (!opaque && start >= 0) {
          spans.push({ x: start, y, width: x - start })
          start = -1
        }
      }
    }
    void window.moonSprite.setExtensionPetHitRegion(pet.frameWidth, pet.frameHeight, spans).catch(() => undefined)
  }, [columns, currentFrame, pet, spriteImage])
  const position = useMemo(() => pet ? {
    width: '100%',
    height: '100%',
    backgroundImage: spriteUrl ? `url(${spriteUrl})` : undefined,
    backgroundSize: spriteUrl ? `${sheetSize.width * (window.innerWidth / pet.frameWidth)}px ${sheetSize.height * (window.innerHeight / pet.frameHeight)}px` : undefined,
    backgroundPosition: `${-(currentFrame % columns) * window.innerWidth}px ${-Math.floor(currentFrame / columns) * window.innerHeight}px`
  } : null, [columns, currentFrame, pet, sheetSize, spriteUrl])

  if (!pet || !position) return null
  const beginPointer = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    pointerDownAt.current = { x: event.clientX, y: event.clientY, dragging: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const continuePointer = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const start = pointerDownAt.current
    if (!start || start.dragging || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return
    start.dragging = true
    setState('drag')
    void startExtensionPetDragging().catch(() => undefined)
  }
  const finishPointer = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    const start = pointerDownAt.current
    pointerDownAt.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (start && !start.dragging) {
      setState('inspect')
      void window.moonSprite.reportExtensionPetInspection(identity.extensionId, identity.petId).catch(() => undefined)
    }
    void reportExtensionPetPosition(identity.extensionId, identity.petId).catch(() => undefined)
  }
  return <main className="extension-pet-window" onContextMenu={(event) => event.preventDefault()}>
    <button type="button" className="extension-pet-sprite" aria-label={pet.name} onContextMenu={(event) => event.preventDefault()} onPointerDown={beginPointer} onPointerMove={continuePointer} onPointerUp={finishPointer} style={position} />
  </main>
}
