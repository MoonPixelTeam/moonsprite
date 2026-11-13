#pragma once
#include "new_document_clipboard.h"

namespace moon::new_document {
// Windows adapter. Pure DIB parsing and dimension policy stay in the core.
// Reads metadata only and never changes clipboard contents.
std::optional<Size> readSystemSize();
}
