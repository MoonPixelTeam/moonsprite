#include "system_clipboard_size.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <chrono>
#include <future>
#include <iostream>
#include <stdexcept>

int main(){try{
 using namespace moon::new_document;
 // Real system read is optional for an empty/non-image clipboard. It may not
 // alter the user's clipboard to make a test image or simulate an error.
 const auto size=readSystemSize();
 if(size&&(size->width<=0||size->height<=0||size->width>16ll*1024*1024/size->height))
  throw std::runtime_error("Invalid system clipboard dimension admission");
 // A null owner can reopen the same null-owned clipboard from another thread;
 // use a distinct hidden Win32 owner to make the contention real.
 const auto owner=CreateWindowExW(0,L"STATIC",L"clipboard-read-only-fixture",WS_POPUP,0,0,1,1,nullptr,nullptr,GetModuleHandleW(nullptr),nullptr);
 if(!owner)throw std::runtime_error("Cannot create read-only clipboard fixture owner");
 struct Window {HWND value;~Window(){DestroyWindow(value);}} window{owner};
 if(!OpenClipboard(owner))throw std::runtime_error("Cannot acquire clipboard for read-only busy fixture");
 struct Close {~Close(){CloseClipboard();}} close;
 auto worker=std::async(std::launch::async,[]{
  if(OpenClipboard(nullptr)){CloseClipboard();throw std::runtime_error("Busy fixture did not exclude another reader thread");}
  return readSystemSize();
 });
 if(worker.wait_for(std::chrono::seconds(5))!=std::future_status::ready)
  throw std::runtime_error("Busy clipboard read did not return promptly");
 if(worker.get())throw std::runtime_error("Busy clipboard should be unavailable");
 std::cout<<"Real metadata read and busy-clipboard unavailable path passed; clipboard contents untouched\n";
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
