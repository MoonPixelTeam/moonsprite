import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  availableMonitors: vi.fn(),
  getCurrentWindow: vi.fn(),
  invoke: vi.fn()
}))

vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }))

vi.mock('@tauri-apps/api/dpi', () => ({
  PhysicalPosition: class PhysicalPosition {
    constructor(public x: number, public y: number) {}
  },
  PhysicalSize: class PhysicalSize {
    constructor(public width: number, public height: number) {}
  }
}))

vi.mock('@tauri-apps/api/window', () => ({
  availableMonitors: mocks.availableMonitors,
  getCurrentWindow: mocks.getCurrentWindow
}))

import { applyAppWindowLayout, initializeAppWindow, readAppWindowLayout, settleAppWindowCursorAfterMaximize, startAppWindowDragging, toggleAppWindowMaximized } from './app-window'

const createWindow = () => ({
  isMaximized: vi.fn(async () => false),
  outerPosition: vi.fn(async () => ({ x: 10, y: 20 })),
  innerSize: vi.fn(async () => ({ width: 800, height: 600 })),
  unmaximize: vi.fn(async () => {}),
  maximize: vi.fn(async () => {}),
  setSize: vi.fn(async () => {}),
  setPosition: vi.fn(async () => {}),
  center: vi.fn(async () => {}),
  show: vi.fn(async () => {}),
  onMoved: vi.fn(async () => vi.fn()),
  onResized: vi.fn(async () => vi.fn()),
  minimize: vi.fn(async () => {}),
  toggleMaximize: vi.fn(async () => {}),
  setCursorIcon: vi.fn(async () => {}),
  close: vi.fn(async () => {})
})

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, '__TAURI_INTERNALS__', { value: {}, configurable: true })
  mocks.availableMonitors.mockResolvedValue([{
    workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } }
  }])
  mocks.invoke.mockResolvedValue(true)
})

describe('app window platform adapter', () => {
  it('reads native geometry without leaking Tauri APIs into App', async () => {
    const appWindow = createWindow()
    appWindow.isMaximized.mockResolvedValue(true)
    mocks.getCurrentWindow.mockReturnValue(appWindow)

    await expect(readAppWindowLayout()).resolves.toEqual({ x: 10, y: 20, width: 800, height: 600, maximized: true })
  })





  it('initializes observers and returns one cleanup boundary', async () => {
    const appWindow = createWindow()
    const removeMoved = vi.fn()
    const removeResized = vi.fn()
    appWindow.onMoved.mockResolvedValue(removeMoved)
    appWindow.onResized.mockResolvedValue(removeResized)
    mocks.getCurrentWindow.mockReturnValue(appWindow)

    const onGeometryChanged = vi.fn()
    const dispose = await initializeAppWindow(null, onGeometryChanged)

    expect(appWindow.show).toHaveBeenCalledTimes(1)
    expect(appWindow.onMoved).toHaveBeenCalledWith(onGeometryChanged)
    expect(appWindow.onResized).toHaveBeenCalledWith(onGeometryChanged)
    dispose()
    expect(removeMoved).toHaveBeenCalledTimes(1)
    expect(removeResized).toHaveBeenCalledTimes(1)
  })

  it('restores saved geometry before revealing the native window', async () => {
    const appWindow = createWindow()
    mocks.getCurrentWindow.mockReturnValue(appWindow)

    await initializeAppWindow({ x: 80, y: 60, width: 1180, height: 760, maximized: false }, vi.fn())

    expect(appWindow.setSize).toHaveBeenCalledWith(expect.objectContaining({ width: 1180, height: 760 }))
    expect(appWindow.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 80, y: 60 }))
    expect(appWindow.setSize.mock.invocationCallOrder[0]).toBeLessThan(appWindow.show.mock.invocationCallOrder[0])
    expect(appWindow.setPosition.mock.invocationCallOrder[0]).toBeLessThan(appWindow.show.mock.invocationCallOrder[0])
  })

  it('routes guarded titlebar dragging through the native command', async () => {
    mocks.getCurrentWindow.mockReturnValue(createWindow())

    await expect(startAppWindowDragging()).resolves.toBe(true)

    expect(mocks.invoke).toHaveBeenCalledWith('start_window_drag_if_primary_pressed')
  })

  it('restores the default native cursor after maximize state changes', async () => {
    const appWindow = createWindow()
    appWindow.isMaximized.mockResolvedValue(true)
    mocks.getCurrentWindow.mockReturnValue(appWindow)

    await expect(toggleAppWindowMaximized()).resolves.toBe(true)

    expect(appWindow.toggleMaximize).toHaveBeenCalledTimes(1)
    expect(appWindow.setCursorIcon).toHaveBeenCalledWith('default')

    await expect(settleAppWindowCursorAfterMaximize()).resolves.toBe(true)
    expect(appWindow.setCursorIcon).toHaveBeenCalledTimes(2)
    await expect(settleAppWindowCursorAfterMaximize()).resolves.toBe(false)
    expect(appWindow.setCursorIcon).toHaveBeenCalledTimes(2)
  })
})
