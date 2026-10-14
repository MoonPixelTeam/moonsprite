param([string]$DllPath)

$ErrorActionPreference = 'Stop'
if (-not $DllPath) {
  $portableDll = Join-Path $PSScriptRoot 'moonsprite_thumbnail.dll'
  $developmentDll = Join-Path $PSScriptRoot '..\src-tauri\thumbnail-provider\target\release\moonsprite_thumbnail.dll'
  $DllPath = if (Test-Path -LiteralPath $portableDll) { $portableDll } else { $developmentDll }
}
$resolvedDll = (Resolve-Path -LiteralPath $DllPath).Path
$iconPath = Join-Path $PSScriptRoot 'moonsprite-file.ico'
if (-not (Test-Path -LiteralPath $iconPath)) { throw "Missing file icon: $iconPath" }
$clsid = '{1A7C2847-2CD7-4D31-98F0-4D844840E2B7}'
$handler = '{E357FCCD-A995-4576-B01F-234630154E96}'

New-Item -Path "HKCU:\Software\Classes\CLSID\$clsid\InprocServer32" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\CLSID\$clsid" -Value 'MoonSprite Thumbnail Provider'
Set-Item -Path "HKCU:\Software\Classes\CLSID\$clsid\InprocServer32" -Value $resolvedDll
Set-ItemProperty -Path "HKCU:\Software\Classes\CLSID\$clsid\InprocServer32" -Name ThreadingModel -Value Apartment

New-Item -Path "HKCU:\Software\Classes\.moonsprite" -Force | Out-Null
Set-ItemProperty -Path "HKCU:\Software\Classes\.moonsprite" -Name PerceivedType -Value Image
Set-ItemProperty -Path "HKCU:\Software\Classes\.moonsprite" -Name 'Content Type' -Value 'image/x-moonsprite'
Remove-ItemProperty -Path "HKCU:\Software\Classes\.moonsprite" -Name TypeOverlay -ErrorAction SilentlyContinue
New-Item -Path "HKCU:\Software\Classes\.moonsprite\DefaultIcon" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\.moonsprite\DefaultIcon" -Value "$iconPath,0"

foreach ($progId in @('MoonSprite.Project', 'MoonSprite Project')) {
  New-Item -Path "HKCU:\Software\Classes\$progId" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name PerceivedType -Value Image
  Remove-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name TypeOverlay -ErrorAction SilentlyContinue
  New-Item -Path "HKCU:\Software\Classes\$progId\DefaultIcon" -Force | Out-Null
  Set-Item -Path "HKCU:\Software\Classes\$progId\DefaultIcon" -Value "$iconPath,0"
}

New-Item -Path "HKCU:\Software\Classes\.moonsprite\ShellEx\$handler" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\.moonsprite\ShellEx\$handler" -Value $clsid
New-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.moonsprite\ShellEx\$handler" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.moonsprite\ShellEx\$handler" -Value $clsid
Remove-ItemProperty -Path "HKCU:\Software\Classes\SystemFileAssociations\.moonsprite" -Name TypeOverlay -ErrorAction SilentlyContinue
New-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.moonsprite\DefaultIcon" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\SystemFileAssociations\.moonsprite\DefaultIcon" -Value "$iconPath,0"
New-Item -Path "HKCU:\Software\Classes\MoonSprite.Project\ShellEx\$handler" -Force | Out-Null
Set-Item -Path "HKCU:\Software\Classes\MoonSprite.Project\ShellEx\$handler" -Value $clsid

Add-Type -Namespace MoonSprite -Name ShellNotify -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(uint eventId, uint flags, System.IntPtr item1, System.IntPtr item2);
'@
[MoonSprite.ShellNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Host "MoonSprite thumbnail provider registered: $resolvedDll"
