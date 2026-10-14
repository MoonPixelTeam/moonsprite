import { expect, it } from 'vitest'
import { localizeExtension } from './extension-localization'

it('localizes manifest presentation fields without changing identifiers, settings, or source data', () => {
  const source = {name:'宠物',description:'说明',translations:{'en-US':{'宠物':'Pets','说明':'Description','开关':'Toggle'}},settingsUi:{storageKey:'宠物',controls:[{id:'开关',label:'开关',defaultValue:'宠物',options:[{value:'开关',label:'开关'}]}]}}
  const result=localizeExtension(source,'en-US')
  expect(result.name).toBe('Pets')
  expect(result.description).toBe('Description')
  expect(result.settingsUi.controls[0]).toEqual({id:'开关',label:'Toggle',defaultValue:'宠物',options:[{value:'开关',label:'Toggle'}]})
  expect(result.settingsUi.storageKey).toBe('宠物')
  expect(source.name).toBe('宠物')
  expect(localizeExtension(source,'ja-JP')).toBe(source)
})
