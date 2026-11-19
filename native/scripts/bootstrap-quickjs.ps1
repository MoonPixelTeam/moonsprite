$ErrorActionPreference='Stop'
$nativeRoot=Split-Path $PSScriptRoot -Parent
$commit='6a9fe9af5ca0bf7c49ae697edef44864272317d1'
$archive=Join-Path $nativeRoot '.cache/quickjs-ng-6a9fe9af.zip'
$destination=Join-Path $nativeRoot '.cache/quickjs-ng-source'
if(!(Test-Path -LiteralPath $archive)){Invoke-WebRequest -Uri "https://codeload.github.com/quickjs-ng/quickjs/zip/$commit" -OutFile $archive}
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne 'BAE12D2C4DAAE37AFEB7EAB563B9CFAA8BFC4B6CDA70A1CF2D494116F634814D'){throw 'QuickJS source hash mismatch; existing cache preserved'}
if(!(Test-Path -LiteralPath (Join-Path $destination "quickjs-$commit/CMakeLists.txt"))){Expand-Archive -LiteralPath $archive -DestinationPath $destination}
Write-Output 'Pinned QuickJS-ng 0.11.0 source ready (MIT); no libc/OS modules enabled.'
