$ErrorActionPreference = 'Stop'
$clsid = '{1A7C2847-2CD7-4D31-98F0-4D844840E2B7}'
$handler = '{E357FCCD-A995-4576-B01F-234630154E96}'

Remove-Item -LiteralPath "HKCU:\Software\Classes\.moonsprite\ShellEx\$handler" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "HKCU:\Software\Classes\SystemFileAssociations\.moonsprite" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "HKCU:\Software\Classes\MoonSprite.Project\ShellEx\$handler" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "HKCU:\Software\Classes\CLSID\$clsid" -Recurse -Force -ErrorAction SilentlyContinue

Add-Type -Namespace MoonSprite -Name ShellNotify -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("shell32.dll")]
public static extern void SHChangeNotify(uint eventId, uint flags, System.IntPtr item1, System.IntPtr item2);
'@
[MoonSprite.ShellNotify]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Host 'MoonSprite thumbnail provider unregistered.'
