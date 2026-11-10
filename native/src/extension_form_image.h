#pragma once
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <cstdint>
#include <vector>
#include <string>
namespace moon::extension {
struct FormImage {int width=0,height=0;std::vector<std::uint32_t> pixels;};
// The display box follows ExtensionDialogForm (default48, clamp16..512).
double formImageExtent(const winrt::Windows::Data::Json::JsonObject&,const wchar_t*);
FormImage decodeFormImage(const std::wstring&);
}
