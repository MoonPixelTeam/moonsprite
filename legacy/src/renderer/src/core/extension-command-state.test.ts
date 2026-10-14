import { describe, expect, it } from 'vitest'
import {
  clearExtensionCommandState,
  setExtensionMenuItems, extensionMenuItems,
  extensionCommandState,
  extensionCommandStateRevision,
  isExtensionCommandChecked,
  isExtensionCommandVisible,
  setExtensionCommandState,
  subscribeExtensionCommandState
} from './extension-command-state'

describe('extension command state', () => {
  it('defaults to unchecked and visible', () => {
    expect(isExtensionCommandChecked('com.example.pets', 'unknown')).toBe(false)
    expect(isExtensionCommandVisible('com.example.pets', 'unknown')).toBe(true)
    expect(extensionCommandState('com.example.pets', 'unknown')).toEqual({})
  })

  it('marks a command checked and notifies subscribers once per change', () => {
    const seen: number[] = []
    const unsubscribe = subscribeExtensionCommandState(() => seen.push(extensionCommandStateRevision()))
    setExtensionCommandState('com.example.pets', 'nailong', { checked: true })
    expect(isExtensionCommandChecked('com.example.pets', 'nailong')).toBe(true)
    expect(seen).toHaveLength(1)
    // A repeated identical value must not churn the menu.
    setExtensionCommandState('com.example.pets', 'nailong', { checked: true })
    expect(seen).toHaveLength(1)
    setExtensionCommandState('com.example.pets', 'nailong', { checked: false })
    expect(seen).toHaveLength(2)
    unsubscribe()
    setExtensionCommandState('com.example.pets', 'nailong', { checked: true })
    expect(seen).toHaveLength(2)
  })

  it('keeps fields a partial update does not mention', () => {
    setExtensionCommandState('com.example.partial', 'pet', { checked: true, visible: true })
    setExtensionCommandState('com.example.partial', 'pet', { visible: false })
    expect(extensionCommandState('com.example.partial', 'pet')).toEqual({ checked: true, visible: false })
    expect(isExtensionCommandChecked('com.example.partial', 'pet')).toBe(true)
    expect(isExtensionCommandVisible('com.example.partial', 'pet')).toBe(false)
  })

  it('scopes state to the owning extension', () => {
    setExtensionCommandState('com.example.one', 'shared-id', { checked: true })
    expect(isExtensionCommandChecked('com.example.one', 'shared-id')).toBe(true)
    expect(isExtensionCommandChecked('com.example.two', 'shared-id')).toBe(false)
  })

  it('drops every command state of an extension that stopped running', () => {
    setExtensionCommandState('com.example.doomed', 'a', { checked: true })
    setExtensionCommandState('com.example.doomed', 'b', { visible: false })
    setExtensionCommandState('com.example.kept', 'a', { checked: true })
    clearExtensionCommandState('com.example.doomed')
    expect(extensionCommandState('com.example.doomed', 'a')).toEqual({})
    expect(isExtensionCommandVisible('com.example.doomed', 'b')).toBe(true)
    // A different extension id that merely shares a prefix must survive.
    expect(isExtensionCommandChecked('com.example.kept', 'a')).toBe(true)
  })
})

it('replaces dynamic menu options atomically and clears them only for their owner', () => {
 const item={id:'custom',name:'Custom',event:'toggle',checked:true}
 setExtensionMenuItems('first','menu',[item]);setExtensionMenuItems('second','menu',[item])
 expect(()=>setExtensionMenuItems('first','menu',[item,item])).toThrow()
 expect(extensionMenuItems('first','menu')).toEqual([item])
 setExtensionMenuItems('first','menu',[])
 expect(extensionMenuItems('first','menu')).toEqual([])
 expect(extensionMenuItems('second','menu')).toEqual([item])
 clearExtensionCommandState('second')
 expect(extensionMenuItems('second','menu')).toEqual([])
})
