"""Pack unchanged Fusion ASCII glyphs for laf metrics (OFL, see assets/fonts).
Application text paints the original full BDF directly, including CJK.
"""
from pathlib import Path
import struct
import zlib
root=Path(__file__).resolve().parents[1]
lines=(root/'assets/fonts/fusion-pixel-10px-monospaced-zh_hans.bdf').read_text().splitlines()
glyphs={}; bitmap=False
for line in lines:
    if line.startswith('STARTCHAR '): rows=[]; bitmap=False
    elif line.startswith('ENCODING '): cp=int(line.split()[1])
    elif line.startswith('DWIDTH '): advance=int(line.split()[1])
    elif line.startswith('BBX '): width,height,ox,oy=map(int,line.split()[1:])
    elif line=='BITMAP': bitmap=True
    elif line=='ENDCHAR': glyphs[cp]=(advance,width,height,ox,oy,rows);bitmap=False
    elif bitmap: rows.append(int(line,16))
assert len(glyphs)==25314
for c in '新建画笔橡皮撤销重做取消丢弃': assert ord(c) in glyphs
w,h=16*11+1,6*11+1
pixels=bytearray([255,0,255,255]*(w*h))
for index,cp in enumerate(range(32,127)):
    advance,width,height,ox,oy,rows=glyphs[cp]
    x,y=1+(index%16)*11,1+(index//16)*11
    for j in range(10):
        for i in range(advance):
            p=((y+j)*w+x+i)*4; pixels[p:p+4]=b'\0\0\0\0'
    for j,row in enumerate(rows):
        for i in range(width):
            if row & (1 << (((width+7)//8)*8-1-i)):
                dx,dy=ox+i,9-height-oy+j
                assert 0<=dx<advance and 0<=dy<10
                p=((y+dy)*w+x+dx)*4; pixels[p:p+4]=b'\xff\xff\xff\xff'
def chunk(tag,data):
    return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
raw=b''.join(b'\0'+pixels[y*w*4:(y+1)*w*4] for y in range(h))
(root/'assets/fusion-ascii.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
print('Fusion: 25,314 original glyphs, 10px em, ASCII atlas has no resampling')
