#pragma once
#include "recovery_codec.h"
#include <filesystem>
#include <optional>
namespace moon::project {
// Read-only selection: committed payload first, otherwise a complete native
// temporary payload whose bytes match the pending descriptor.
std::filesystem::path resolveRecoveryPayload(const std::filesystem::path& directory,const std::string& id);
// GAP-015 native pending metadata is usable only for an exactly matching payload.
std::optional<RecoveryRecord> readPendingRecoveryRecord(const std::filesystem::path& payload,const std::string& id);
}
