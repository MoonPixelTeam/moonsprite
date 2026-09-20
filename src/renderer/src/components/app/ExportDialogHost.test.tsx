import {createRef} from 'react'
import {act,cleanup,fireEvent,render} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {I18nProvider} from '@/components/I18nProvider'
import {createDocument} from '@/core/document-model'
import {useWorkspace} from '@/store/workspace'
import {ExportDialogHost,type ExportDialogHandle} from './ExportDialogHost'

afterEach(()=>{cleanup();vi.restoreAllMocks();useWorkspace.setState({sessions:[],activeId:null})})
it('offers frame ranges and loop sections after switching a multi-frame export from GIF to PNG',async()=>{
  localStorage.clear()
  useWorkspace.setState({sessions:[],activeId:null})
  const document=createDocument('range UI',2,2,'rgba')
  document.animation!.frames.push({id:'second',duration:100})
  document.animation!.loopSections=[{id:'walk',name:'Walk',startFrameId:document.animation!.frames[0].id,endFrameId:'second',direction:'forward',repeatCount:1}]
  useWorkspace.getState().addSession(document)
  const exportCommand=vi.spyOn(useWorkspace.getState(),'exportActive').mockResolvedValue(true)
  const ref=createRef<ExportDialogHandle>()
  const view=render(<I18nProvider><ExportDialogHost ref={ref} defaultFileDirectories={{saveDirectory:'gallery',exportDirectory:'exports'}} exportScalePresets={[100]}/></I18nProvider>)
  act(()=>ref.current!.open())
  expect(view.getByRole('button',{name:'帧范围'})).toBeTruthy()
  fireEvent.click(view.getByRole('button',{name:'格式'}))
  fireEvent.click(view.getByRole('option',{name:/PNG.*RGBA/i}))
  expect(view.getByRole('button',{name:'帧范围'})).toHaveTextContent('当前帧')
  fireEvent.click(view.getByRole('button',{name:'导出区域'}))
  expect(view.queryByRole('option',{name:'所有帧'})).toBeNull()
  fireEvent.click(view.getByRole('button',{name:'导出区域'}))
  fireEvent.click(view.getByRole('button',{name:'帧范围'}))
  fireEvent.click(view.getByRole('option',{name:/Walk/}))
  expect(view.getByRole('button',{name:'帧范围'})).toHaveTextContent('Walk')
  expect(view.getByRole('button',{name:'导出区域'})).toHaveTextContent('画布')
  await act(async()=>{fireEvent.submit(view.baseElement.querySelector('form.export-modal')!)})
  expect(exportCommand).toHaveBeenCalledWith(expect.objectContaining({format:'png-rgba',target:'frames',gifFrameRange:'loop-section',gifLoopSectionId:'walk'}))
  localStorage.clear()
})
it('owns the form and shares one in-flight export across repeated submissions',async()=>{
  useWorkspace.setState({sessions:[],activeId:null})
  useWorkspace.getState().addSession(createDocument('export owner',4,4,'rgba'))
  let finish!:(value:boolean)=>void
  const operation=new Promise<boolean>(resolve=>{finish=resolve})
  const exportCommand=vi.spyOn(useWorkspace.getState(),'exportActive').mockReturnValue(operation)
  const ref=createRef<ExportDialogHandle>()
  const view=render(<I18nProvider><ExportDialogHost ref={ref} defaultFileDirectories={{saveDirectory:'gallery',exportDirectory:'exports'}} exportScalePresets={[100]}/></I18nProvider>)
  act(()=>ref.current!.open())
  const form=view.baseElement.querySelector<HTMLFormElement>('form.export-modal')!
  expect(form).toBeTruthy()
  fireEvent.submit(form);fireEvent.submit(form)
  expect(exportCommand).toHaveBeenCalledTimes(1)
  await act(async()=>{finish(true);await operation})
  expect(view.baseElement.querySelector('form.export-modal')).toBeNull()
})
