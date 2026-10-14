Add-Type -AssemblyName System.Drawing
$root=Split-Path $PSScriptRoot -Parent
$theme=Join-Path $root 'assets/themes/moonsprite-dark'
$old=[Drawing.Bitmap]::new((Join-Path $theme 'sheet.png'))
$sheet=[Drawing.Bitmap]::new(512,256)
for($y=0;$y -lt $old.Height;$y++){for($x=0;$x -lt $old.Width;$x++){$sheet.SetPixel($x,$y,$old.GetPixel($x,$y))}}
$old.Dispose()
[xml]$xml=Get-Content -Raw (Join-Path $theme 'theme.xml')
$records=@()
if($xml.theme.parts.part | Where-Object {$_.id -eq "timeline.frame"}){throw "Atlas already consolidated; do not overwrite user edits."}
function AddPart($id,$x,$y,$w,$h,$b,$source){
 $part=$xml.CreateElement('part');$part.SetAttribute('id',$id);$part.SetAttribute('x',"$x");$part.SetAttribute('y',"$y")
 if($b -ge 0){foreach($axis in @('w','h')){$n=if($axis -eq 'w'){$w}else{$h};$part.SetAttribute($axis+'1',"$b");$part.SetAttribute($axis+'2',"$($n-2*$b)");$part.SetAttribute($axis+'3',"$b")}}else{$part.SetAttribute('w',"$w");$part.SetAttribute('h',"$h")}
 [void]$xml.theme.parts.AppendChild($part);$style=$xml.CreateElement('style');$style.SetAttribute('id',$id);$layer=$xml.CreateElement($(if($b -ge 0){'background-border'}else{'icon'}));$layer.SetAttribute('part',$id);[void]$style.AppendChild($layer);[void]$xml.theme.styles.AppendChild($style)
 $script:records+=@{id=$id;x=$x;y=$y;w=$w;h=$h;source=$source}
}
$patterns=@(@('timeline.frame',9,3,'202635'),@('timeline.button',7,2,'202635'),@('timeline.row',3,0,'292B30'),@('timeline.grid',3,1,'292B30'),@('timeline.line',1,0,'000000'),@('timeline.dot',7,-1,'000000'),@('menu_bar',3,0,'171A21'),@('menu_item',3,0,'171A21'),@('menu_item_hover',3,0,'202635'),@('workspace.background',3,0,'171A21'),@('workspace.panel',3,0,'202635'),@('workspace.separator',1,0,'414D64'))
$x=128
foreach($p in $patterns){$id=$p[0];$n=$p[1];$b=$p[2];for($y=0;$y -lt $n;$y++){for($i=0;$i -lt $n;$i++){
 $v=$p[3];$dist=[Math]::Min([Math]::Min($i,$y),[Math]::Min($n-$i-1,$n-$y-1))
 if($b -gt 0 -and $dist -lt $b){$v=if($dist -eq 1){'424F67'}else{'000000'}}
 if($id -eq 'timeline.dot'){$c=[Drawing.Color]::Transparent;if(($i -ge 1 -and $i -le 5) -or ($y -ge 1 -and $y -le 5)){$c=[Drawing.ColorTranslator]::FromHtml('#919BA9')}}else{$c=[Drawing.ColorTranslator]::FromHtml('#'+$v)}
 $sheet.SetPixel($x+$i,$y,$c)
 }}
 AddPart $id $x 0 $n $n $b 'User timeline reference 857e9d16 / approved existing rendering, exact pixel extraction of existing appearance'
 $x+=12
}
$x=128;$y=20
foreach($dir in @('tool-icons','utility-icons','color-picker')){foreach($file in Get-ChildItem (Join-Path $root ('assets/'+$dir)) -Filter '*.png' | Sort-Object Name){
 $img=[Drawing.Bitmap]::new($file.FullName);if($x+$img.Width -gt 512){$x=128;$y+=16}
 for($j=0;$j -lt $img.Height;$j++){for($i=0;$i -lt $img.Width;$i++){$sheet.SetPixel($x+$i,$y+$j,$img.GetPixel($i,$j))}}
 AddPart ('icon.'+$file.BaseName) $x $y $img.Width $img.Height -1 ('native/assets/'+$dir+'/'+$file.Name)
 $x+=16;$img.Dispose()
}}
$sheet.Save((Join-Path $theme 'sheet.png'),[Drawing.Imaging.ImageFormat]::Png);$sheet.Dispose();$xml.Save((Join-Path $theme 'theme.xml'))
$records | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $theme 'sheet-regions.json')
