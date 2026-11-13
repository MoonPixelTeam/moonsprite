#pragma once
#include "atomic_write.h"
#include <vector>
namespace moon::io {
// One process-wide CREATE_NEW sequence shared by image, project and recovery
// writers. Same-directory temp, flush and replacement semantics are unchanged.
void commitAtomicBytes(const std::filesystem::path&,const std::vector<std::uint8_t>&,AtomicWritePolicy={});
}
