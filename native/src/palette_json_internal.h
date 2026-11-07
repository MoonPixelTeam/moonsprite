#pragma once
#include "palette_library.h"
#include <winrt/Windows.Data.Json.h>
namespace moon {
// Internal DOM adapter. Callers own COM initialization, byte-size admission and
// original JSON lexical validation; schema/layout validation remains shared.
StoredPalette decodeStoredPaletteObject(const winrt::Windows::Data::Json::JsonObject& root);
}
