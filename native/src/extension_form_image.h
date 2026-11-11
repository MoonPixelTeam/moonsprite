#pragma once
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <cstdint>
#include <vector>
#include <string>
#include <future>
#include <memory>
#include <atomic>
namespace moon::extension {
// Shared across independent hosts, prompts and detached decoders.
inline constexpr std::size_t formImageMemoryLimit=512ull*1024*1024;
class FormImageMemory {
 std::size_t bytes_;
 public:
 explicit FormImageMemory(std::size_t bytes):bytes_(bytes){}
 ~FormImageMemory();
 FormImageMemory(const FormImageMemory&)=delete;
 FormImageMemory& operator=(const FormImageMemory&)=delete;
 void shrink(std::size_t bytes);
};
std::shared_ptr<FormImageMemory> reserveFormImageMemory(std::size_t,const std::shared_ptr<std::atomic<bool>>& cancelled={});
std::size_t formImageMemoryUsed();
struct FormImage {std::shared_ptr<FormImageMemory> memory;int width=0,height=0;std::vector<std::uint32_t> pixels;};
// The display box follows ExtensionDialogForm (default48, clamp16..512).
double formImageExtent(const winrt::Windows::Data::Json::JsonObject&,const wchar_t*);
// Promise-backed future destruction never joins a decoder on the UI thread.
struct FormImageTask{std::future<FormImage> result;std::shared_ptr<std::atomic<bool>> cancelled;void cancel(){if(cancelled)cancelled->store(true);} };
FormImageTask startFormImage(std::wstring);
FormImage decodeFormImage(const std::wstring&);
}
