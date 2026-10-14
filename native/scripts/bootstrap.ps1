$ErrorActionPreference = 'Stop'
$nativeRoot = Split-Path $PSScriptRoot -Parent
$cache = Join-Path $nativeRoot '.cache'
New-Item -ItemType Directory -Force $cache | Out-Null
function Pinned-Git($url, $name, $commit) {
  $path = Join-Path $cache $name
  if (!(Test-Path -LiteralPath $path)) {
    & git clone --filter=blob:none --no-checkout $url $path | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Cannot fetch $name; no automatic retry" }
    & git -C $path checkout --detach $commit | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Cannot checkout $name" }
  }
  $actual = & git -C $path rev-parse HEAD
  if ($actual -ne $commit) { throw "$name differs from the lock; existing cache left untouched" }
  return $path
}
function Checked-Zip($url, $name, $hash, $destination) {
  $zip = Join-Path $cache $name
  if (!(Test-Path -LiteralPath $zip)) { Invoke-WebRequest -Uri $url -OutFile $zip }
  if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $hash) { throw "Hash mismatch: $name" }
  if (!(Test-Path -LiteralPath $destination)) { Expand-Archive -LiteralPath $zip -DestinationPath $destination }
}
$laf = Pinned-Git 'https://github.com/aseprite/laf.git' 'laf' '500768cccc6447e3b7816bedbfcb378a5c5222e5'
$ase = Pinned-Git 'https://github.com/aseprite/aseprite.git' 'aseprite' '14fe117e853bd642672e72018166239506060cd4'
& git -C $laf submodule update --init --depth 1 clip
if ($LASTEXITCODE -ne 0) { throw 'clip fetch failed' }
& git -C $ase submodule update --init --depth 1 src/observable third_party/fmt
if ($LASTEXITCODE -ne 0) { throw 'UI dependency fetch failed' }
Checked-Zip 'https://github.com/aseprite/skia/releases/download/m124-08a5439a6b/Skia-Windows-Release-x64.zip' 'skia-m124.zip' '5A371A4B2819BB4EB96E36CD75FA623585E1D5477E253A970302B6F2471B6934' (Join-Path $cache 'skia-m124')
$zlib = Join-Path $cache 'zlib'
if (!(Test-Path -LiteralPath $zlib)) {
  $extract = Join-Path $cache 'zlib-extract'
  Checked-Zip 'https://codeload.github.com/aseprite/zlib/zip/51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf' 'zlib.zip' '8BE92F276C1280AA4F46A878008C7BF295B6CA8DA0EB27B41E3666D894F0D32C' $extract
  $source = [IO.Path]::GetFullPath((Join-Path $extract 'zlib-51b7f2abdade71cd9bb0e7a373ef2610ec6f9daf'))
  $target = [IO.Path]::GetFullPath($zlib)
  $scope = [IO.Path]::GetFullPath($cache) + [IO.Path]::DirectorySeparatorChar
  if (!$source.StartsWith($scope) -or !$target.StartsWith($scope)) { throw 'Move outside dependency cache' }
  Move-Item -LiteralPath $source -Destination $target
}
Write-Host 'Pinned dependencies ready. Only MIT src/ui is compiled from the Aseprite checkout.'
