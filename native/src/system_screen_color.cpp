#include "system_screen_color.h"
#include <windows.h>
#include <algorithm>
#include <limits>
#include <stdexcept>
namespace moon {
namespace {
struct ScreenDC {HDC value=GetDC(nullptr);~ScreenDC(){if(value)ReleaseDC(nullptr,value);}};
int subtract(int value,int radius){return int(std::max<long long>(std::numeric_limits<int>::min(),static_cast<long long>(value)-radius));}
}
std::optional<std::uint32_t> sampleScreenColor(int x,int y){
 ScreenDC screen;if(!screen.value)return {};
 const auto value=GetPixel(screen.value,x,y);if(value==CLR_INVALID)return {};
 return (value&0x00ffffffu)|0xff000000u;
}
std::vector<std::uint32_t> sampleScreenColorRegion(int x,int y,int radius){
 if(radius<0||radius>12)throw std::out_of_range("Screen color sample radius is out of range");
 ScreenDC screen;if(!screen.value)return {};
 struct MemoryDC{HDC value;~MemoryDC(){if(value)DeleteDC(value);}} memory{CreateCompatibleDC(screen.value)};
 if(!memory.value)return {};
 const int diameter=radius*2+1;BITMAPINFO info{};info.bmiHeader.biSize=sizeof(BITMAPINFOHEADER);info.bmiHeader.biWidth=diameter;info.bmiHeader.biHeight=-diameter;info.bmiHeader.biPlanes=1;info.bmiHeader.biBitCount=32;info.bmiHeader.biCompression=BI_RGB;
 void* bits=nullptr;struct Bitmap{HBITMAP value;~Bitmap(){if(value)DeleteObject(value);}} bitmap{CreateDIBSection(screen.value,&info,DIB_RGB_COLORS,&bits,nullptr,0)};
 if(!bitmap.value||!bits)return {};
 const auto previous=SelectObject(memory.value,bitmap.value);
 if(!previous||previous==HGDI_ERROR)return {};
 struct Selection{HDC dc;HGDIOBJ previous;~Selection(){SelectObject(dc,previous);}} selection{memory.value,previous};
 const bool copied=BitBlt(memory.value,0,0,diameter,diameter,screen.value,subtract(x,radius),subtract(y,radius),SRCCOPY)!=0;
 GdiFlush();std::vector<std::uint32_t> result;
 if(copied){const auto bytes=static_cast<const unsigned char*>(bits);result.reserve(diameter*diameter);for(int i=0;i<diameter*diameter;++i)result.push_back(bytes[i*4+2]|(std::uint32_t(bytes[i*4+1])<<8)|(std::uint32_t(bytes[i*4])<<16)|0xff000000u);}
 return result;
}
}
