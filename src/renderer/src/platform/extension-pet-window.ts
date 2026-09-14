import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ExtensionPetProjectSummary } from '@shared/types-platform'

export interface ExtensionPetConfiguration {
  extensionId: string
  petId: string
  summary: ExtensionPetProjectSummary
}

export interface ExtensionPetPositionEvent {
  extensionId: string
  petId: string
  x: number
  y: number
}

export interface ExtensionPetInspectionEvent {
  extensionId: string
  petId: string
  x: number
  y: number
}

export const isExtensionPetWindow = (): boolean => new URLSearchParams(window.location.search).has('moonpet')

export const extensionPetIdentityFromLocation = (): Pick<ExtensionPetConfiguration, 'extensionId' | 'petId'> => {
  const search = new URLSearchParams(window.location.search)
  return { extensionId: search.get('extensionId') ?? '', petId: search.get('petId') ?? '' }
}

export const listenForExtensionPetConfiguration = async (callback: (configuration: ExtensionPetConfiguration) => void): Promise<() => void> =>
  listen<ExtensionPetConfiguration>('pet:config', (event) => callback(event.payload))

export const listenForExtensionPetPosition = async (callback: (position: ExtensionPetPositionEvent) => void): Promise<() => void> =>
  listen<ExtensionPetPositionEvent>('pet:position', (event) => callback(event.payload))

export const listenForExtensionPetInspection = async (callback: (inspection: ExtensionPetInspectionEvent) => void): Promise<() => void> =>
  listen<ExtensionPetInspectionEvent>('pet:inspect', (event) => callback(event.payload))

export const startExtensionPetDragging = async (): Promise<void> => {
  await invoke<boolean>('start_extension_pet_drag_if_primary_pressed')
}

export const reportExtensionPetPosition = async (extensionId: string, petId: string): Promise<void> => {
  await invoke('report_extension_pet_position', { extensionId, petId })
}

export const observeAppWindowForExtensionPet = async (callback: () => void): Promise<() => void> => {
  const appWindow = getCurrentWindow()
  const [removeMoved, removeResized, removeFocus] = await Promise.all([
    appWindow.onMoved(callback),
    appWindow.onResized(callback),
    appWindow.onFocusChanged(() => { window.setTimeout(callback, 80) })
  ])
  return () => { removeMoved(); removeResized(); removeFocus() }
}

export const readAppWindowForExtensionPet = async () => {
  const appWindow = getCurrentWindow()
  const [position, size] = await Promise.all([appWindow.outerPosition(), appWindow.innerSize()])
  return { position, size }
}
