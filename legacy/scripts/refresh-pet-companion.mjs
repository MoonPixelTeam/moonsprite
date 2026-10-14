import { readFileSync, writeFileSync } from 'node:fs'
import vm from 'node:vm'
import { unzipSync, zipSync, strFromU8 } from 'fflate'
import { createLocalizationSource, catalogs } from './pet-companion-localization.mjs'
const path='src-tauri/resources/bundled-extensions/pet-companion.msext'
const files=unzipSync(readFileSync(path))
const oldManifest=JSON.parse(strFromU8(files['manifest.json']))
const oldManager=strFromU8(files['ui/manager.html'])
const match=oldManager.match(/BUILT_IN=(\{[^\n]+\}),SLOT_COUNT=(\d+);/)
if(!match)throw Error('Cannot preserve bundled pet metadata')
const builtInPet=JSON.parse(match[1])
const context=vm.createContext({builtInPet,PET_SLOT_COUNT:Number(match[2]),BUILT_IN_PET_ID:builtInPet.id,petName:builtInPet.name,extensionId:oldManifest.id,basename:value=>value,sourcePath:'bundled',createLocalizationSource,catalogs})
const source=readFileSync('scripts/export-pet-package.mjs','utf8')
vm.runInContext(source.slice(source.indexOf('const localizationSource ='),source.indexOf('const sprite =')),context)
const pages=vm.runInContext('({manifest,runtimePage,petWindowPage,managerPage})',context)
for(const [name,key] of [['runtime/index.html','runtimePage'],['ui/pet.html','petWindowPage'],['ui/manager.html','managerPage']])files[name]=new TextEncoder().encode(pages[key])
files['manifest.json']=new TextEncoder().encode(JSON.stringify({...pages.manifest,version:oldManifest.version},null,2))
writeFileSync(path,zipSync(files,{level:9}))
console.log('Updated bundled extension; original pet sprite and metadata preserved.')
