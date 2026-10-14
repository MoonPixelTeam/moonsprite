!define MOONSPRITE_THUMBNAIL_CLSID "{1A7C2847-2CD7-4D31-98F0-4D844840E2B7}"
!define THUMBNAIL_HANDLER_IID "{E357FCCD-A995-4576-B01F-234630154E96}"

!macro NSIS_HOOK_POSTINSTALL
  SetRegView 64
  WriteRegStr HKCU "Software\Classes\CLSID\${MOONSPRITE_THUMBNAIL_CLSID}" "" "MoonSprite Thumbnail Provider"
  WriteRegStr HKCU "Software\Classes\CLSID\${MOONSPRITE_THUMBNAIL_CLSID}\InprocServer32" "" "$INSTDIR\moonsprite_thumbnail.dll"
  WriteRegStr HKCU "Software\Classes\CLSID\${MOONSPRITE_THUMBNAIL_CLSID}\InprocServer32" "ThreadingModel" "Apartment"
  WriteRegStr HKCU "Software\Classes\.moonsprite\ShellEx\${THUMBNAIL_HANDLER_IID}" "" "${MOONSPRITE_THUMBNAIL_CLSID}"
  WriteRegStr HKCU "Software\Classes\.moonsprite" "PerceivedType" "Image"
  WriteRegStr HKCU "Software\Classes\.moonsprite" "Content Type" "image/x-moonsprite"
  WriteRegStr HKCU "Software\Classes\MoonSprite.Project" "PerceivedType" "Image"
  WriteRegStr HKCU "Software\Classes\MoonSprite Project" "PerceivedType" "Image"
  DeleteRegValue HKCU "Software\Classes\.moonsprite" "TypeOverlay"
  DeleteRegValue HKCU "Software\Classes\MoonSprite.Project" "TypeOverlay"
  DeleteRegValue HKCU "Software\Classes\MoonSprite Project" "TypeOverlay"
  WriteRegStr HKCU "Software\Classes\.moonsprite\DefaultIcon" "" "$INSTDIR\moonsprite-file.ico,0"
  WriteRegStr HKCU "Software\Classes\MoonSprite.Project\DefaultIcon" "" "$INSTDIR\moonsprite-file.ico,0"
  WriteRegStr HKCU "Software\Classes\MoonSprite Project\DefaultIcon" "" "$INSTDIR\moonsprite-file.ico,0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.moonsprite" "PerceivedType" "Image"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.moonsprite" "Content Type" "image/x-moonsprite"
  DeleteRegValue HKCU "Software\Classes\SystemFileAssociations\.moonsprite" "TypeOverlay"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.moonsprite\DefaultIcon" "" "$INSTDIR\moonsprite-file.ico,0"
  WriteRegDWORD HKCU "Software\Classes\SystemFileAssociations\.moonsprite" "ImageOptionFlags" 1
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.moonsprite\ShellEx\${THUMBNAIL_HANDLER_IID}" "" "${MOONSPRITE_THUMBNAIL_CLSID}"
  WriteRegStr HKCU "Software\Classes\MoonSprite Project\ShellEx\${THUMBNAIL_HANDLER_IID}" "" "${MOONSPRITE_THUMBNAIL_CLSID}"
  WriteRegStr HKCU "Software\Classes\MoonSprite.Project\ShellEx\${THUMBNAIL_HANDLER_IID}" "" "${MOONSPRITE_THUMBNAIL_CLSID}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  SetRegView 64
  DeleteRegKey HKCU "Software\Classes\.moonsprite\ShellEx\${THUMBNAIL_HANDLER_IID}"
  DeleteRegKey HKCU "Software\Classes\.moonsprite\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\MoonSprite.Project\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\MoonSprite Project\DefaultIcon"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.moonsprite\DefaultIcon"
  DeleteRegValue HKCU "Software\Classes\.moonsprite" "TypeOverlay"
  DeleteRegValue HKCU "Software\Classes\MoonSprite.Project" "TypeOverlay"
  DeleteRegValue HKCU "Software\Classes\MoonSprite Project" "TypeOverlay"
  DeleteRegValue HKCU "Software\Classes\SystemFileAssociations\.moonsprite" "TypeOverlay"
  DeleteRegKey HKCU "Software\Classes\.moonsprite\ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.moonsprite\ShellEx\{8895b1c6-b41f-4c1c-a562-0d564250836f}"
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.moonsprite"
  DeleteRegKey HKCU "Software\Classes\MoonSprite Project\ShellEx\${THUMBNAIL_HANDLER_IID}"
  DeleteRegKey HKCU "Software\Classes\MoonSprite.Project\ShellEx\${THUMBNAIL_HANDLER_IID}"
  DeleteRegKey HKCU "Software\Classes\CLSID\${MOONSPRITE_THUMBNAIL_CLSID}"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
