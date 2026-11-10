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
struct FormImage {int width=0,height=0;std::vector<std::uint32_t> pixels;};
// The display box follows ExtensionDialogForm (default48, clamp16..512).
double formImageExtent(const winrt::Windows::Data::Json::JsonObject&,const wchar_t*);
// Promise-backed future destruction never joins a decoder on the UI thread.
struct FormImageTask{std::future<FormImage> result;std::shared_ptr<std::atomic<bool>> cancelled;void cancel(){if(cancelled)cancelled->store(true);} };
FormImageTask startFormImage(std::wstring);
FormImage decodeFormImage(const std::wstring&);
}
