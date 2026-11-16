#include "system_screen_color.h"
#include <windows.h>
#include <dwmapi.h>
#include <iostream>
#include <stdexcept>
namespace {
void require(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
LRESULT CALLBACK windowProc(HWND hwnd,UINT message,WPARAM w,LPARAM l){if(message==WM_PAINT){PAINTSTRUCT ps;const auto dc=BeginPaint(hwnd,&ps);for(int y=0;y<64;++y){const auto brush=CreateSolidBrush(y<32?RGB(0xab,0x12,0x34):RGB(7,8,9));RECT row{0,y,64,y+1};FillRect(dc,&row,brush);DeleteObject(brush);}EndPaint(hwnd,&ps);return 0;}return DefWindowProcW(hwnd,message,w,l);}
}
int main(){try{
 WNDCLASSW cls{};cls.lpfnWndProc=windowProc;cls.hInstance=GetModuleHandleW(nullptr);cls.lpszClassName=L"MoonScreenColorTest";require(RegisterClassW(&cls)!=0,"window class");
 struct Window{HWND value;~Window(){if(value)DestroyWindow(value);}} window{CreateWindowExW(WS_EX_TOPMOST|WS_EX_TOOLWINDOW|WS_EX_NOACTIVATE,cls.lpszClassName,L"",WS_POPUP,100,100,64,64,nullptr,nullptr,cls.hInstance,nullptr)};
 require(window.value!=nullptr,"test window");ShowWindow(window.value,SW_SHOWNOACTIVATE);UpdateWindow(window.value);GdiFlush();DwmFlush();
 POINT p{32,32};ClientToScreen(window.value,&p);
 require(moon::sampleScreenColor(p.x,p.y)==0xff090807,"COLORREF low red and opaque alpha");
 const auto region=moon::sampleScreenColorRegion(p.x,p.y,5);require(region.size()==121,"11 by 11 capture");
 for(int y=0;y<11;++y)for(int x=0;x<11;++x)require(region[y*11+x]==(y<5?0xff3412ab:0xff090807),"top-down BGRA row ordering");
 require(moon::sampleScreenColorRegion(p.x,p.y,0)==std::vector<std::uint32_t>{0xff090807},"radius zero");
 require(moon::sampleScreenColorRegion(p.x,p.y,12).size()==625,"maximum radius");
 for(int radius:{-1,13}){bool failed=false;try{moon::sampleScreenColorRegion(p.x,p.y,radius);}catch(const std::out_of_range&){failed=true;}require(failed,"radius boundary");}
 const auto count=GetGuiResources(GetCurrentProcess(),GR_GDIOBJECTS);for(int i=0;i<64;++i)moon::sampleScreenColorRegion(p.x,p.y,5);require(GetGuiResources(GetCurrentProcess(),GR_GDIOBJECTS)==count,"GDI resources restored");
 std::cout<<"Actual window point/region BGRA, boundaries and GDI cleanup passed.\n";
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
