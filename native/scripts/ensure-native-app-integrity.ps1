param([Parameter(Mandatory=$true)][string]$ExecutablePath)
$ErrorActionPreference = 'Stop'

# This is a desktop deliverable, not a sandbox helper. A Low-labelled image
# starts at Low even from Explorer and cannot write normal user settings.
# Only correct this product's output; never relabel the checkout or user data.
$nativeRoot = Split-Path $PSScriptRoot -Parent
$buildRoot = [IO.Path]::GetFullPath((Join-Path $nativeRoot 'build')) + [IO.Path]::DirectorySeparatorChar
$target = [IO.Path]::GetFullPath($ExecutablePath)
if (!$target.StartsWith($buildRoot,[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($target) -ne 'moonsprite-native.exe' -or
    !(Test-Path -LiteralPath $target -PathType Leaf)) {
  throw 'Integrity correction only supports the native/build MoonSprite executable.'
}

# Setting a mandatory label needs WRITE_OWNER. A user-owned checkout can grant
# only Modify to its owner, so temporarily grant this one right to the owner.
# Restore the complete original DACL even if relabelling fails. No elevation,
# ownership transfer, directory permission change or persistent access grant.
$accessSection = [Security.AccessControl.AccessControlSections]::Access
$acl = Get-Acl -LiteralPath $target
$originalAccess = $acl.GetSecurityDescriptorSddlForm($accessSection)
$user = [Security.Principal.WindowsIdentity]::GetCurrent().User
$rule = [Security.AccessControl.FileSystemAccessRule]::new(
  $user,[Security.AccessControl.FileSystemRights]::TakeOwnership,
  [Security.AccessControl.AccessControlType]::Allow)
try {
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $target -AclObject $acl
  & "$env:WINDIR/System32/icacls.exe" $target /setintegritylevel M
  if ($LASTEXITCODE -ne 0) {
    throw 'Cannot set desktop executable integrity to Medium. Build from a normal user terminal.'
  }
} finally {
  $restore = Get-Acl -LiteralPath $target
  $restore.SetSecurityDescriptorSddlForm($originalAccess,$accessSection)
  Set-Acl -LiteralPath $target -AclObject $restore
}
