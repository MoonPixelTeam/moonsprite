#pragma once
#include "extension_request_host.h"
#include "clip/clip.h"

namespace moon::extension {
// Bind these callbacks on the editor event thread. The status callback owns
// presentation; no extension-controlled owner is read from request parameters.
inline HostServices nativeHostServices(std::function<void(const winrt::hstring&)> status,
 std::function<bool(std::string&)> read=clip::get_text,
 std::function<bool(const std::string&)> write=clip::set_text){
 return {std::move(status),[read=std::move(read)]{
  std::string value;if(!read(value))throw std::runtime_error("无法读取系统文本剪贴板。");
  return winrt::to_hstring(value);
 },[write=std::move(write)](const winrt::hstring& value){
  if(!write(winrt::to_string(value)))throw std::runtime_error("无法写入系统文本剪贴板。");
 }};
}
inline DiagnosticServices nativeDiagnosticServices(std::shared_ptr<diagnostics::Recorder> recorder,
 std::string extensionId,std::function<void(const winrt::hstring&)> status){
 return recorderDiagnosticServices(std::move(recorder),std::move(extensionId),std::move(status),
  [](const std::string& level,const winrt::hstring& message){
   const auto line=winrt::to_hstring("["+level+"] ")+message+L"\n";
   OutputDebugStringW(line.c_str());
  });
}
}
