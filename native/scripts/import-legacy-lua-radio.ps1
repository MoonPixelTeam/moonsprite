# Rasterize LuaScriptDialog's CSS indicator, not a replacement icon design.
# Sources: legacy/src/renderer/src/styles.css .lua-script-radio-row > button/i.
Add-Type -AssemblyName System.Drawing
$theme=Join-Path (Split-Path $PSScriptRoot -Parent) 'assets/themes/moonsprite-dark'
$sheetPath=Join-Path $theme 'sheet.png'
$old=[Drawing.Bitmap]::new($sheetPath)
$sheet=[Drawing.Bitmap]::new($old.Width,[Math]::Max($old.Height,788))
for($y=0;$y -lt $old.Height;$y++){for($x=0;$x -lt $old.Width;$x++){$sheet.SetPixel($x,$y,$old.GetPixel($x,$y))}}
$old.Dispose()
# Native theme colors replace CSS variables; preserve 10px box, 1px border,
# and selected 2px inset shadow (4x4 accent centre). Button shell is 3x3 sliced.
$colors=@{deep='10141b';strong='596271';accent='2979ff';border='414d64';normal='202635';hover='20242d'}
function PaintPixel($x,$y,$color){$sheet.SetPixel($x,$y,[Drawing.ColorTranslator]::FromHtml('#'+$color))}
foreach($selected in @($false,$true)){
 $left=if($selected){12}else{0}
 for($y=0;$y -lt 10;$y++){for($x=0;$x -lt 10;$x++){
  $edge=($x -eq 0 -or $y -eq 0 -or $x -eq 9 -or $y -eq 9)
  $centre=($x -ge 3 -and $x -lt 7 -and $y -ge 3 -and $y -lt 7)
  $color=if($selected -and ($edge -or $centre)){$colors.accent}elseif($edge){$colors.strong}else{$colors.deep}
  PaintPixel ($left+$x) (776+$y) $color
 }}
}
foreach($hover in @($false,$true)){
 $left=if($hover){30}else{26}
 for($y=0;$y -lt 3;$y++){for($x=0;$x -lt 3;$x++){
  $color=if($x -ne 1 -or $y -ne 1){$colors.border}elseif($hover){$colors.hover}else{$colors.normal}
  PaintPixel ($left+$x) (776+$y) $color
 }}
}
$sheet.Save($sheetPath,[Drawing.Imaging.ImageFormat]::Png);$sheet.Dispose()
