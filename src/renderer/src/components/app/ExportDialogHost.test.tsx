import {createRef} from 'react'
import {act,cleanup,fireEvent,render} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {I18nProvider} from '@/components/I18nProvider'
import {createDocument} from '@/core/document-model'
import {useWorkspace} from '@/store/workspace'
import {ExportDialogHost,type ExportDialogHandle} from './ExportDialogHost'

afterEach(()=>{cleanup();vi.restoreAllMocks();useWorkspace.setState({sessions:[],activeId:null})})
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
