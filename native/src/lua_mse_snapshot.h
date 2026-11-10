#pragma once
#include "document.h"
#include "pattern_brush_library.h"
#include <winrt/Windows.Data.Json.h>
namespace moon::script {
// Caller supplies actual persisted panel state and discovered local brushes.
// No filesystem reads or application preference defaults inside serialization.
std::string buildMseSnapshot(const Document&,const std::vector<StoredPatternBrush>&,
                            const winrt::Windows::Data::Json::JsonArray& panels);
}
