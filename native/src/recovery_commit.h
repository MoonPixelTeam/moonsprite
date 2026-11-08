#pragma once
#include "recovery_codec.h"
#include <filesystem>
#include <optional>
namespace moon::project {
// GAP-015 native pending metadata is usable only for an exactly matching payload.
std::optional<RecoveryRecord> readPendingRecoveryRecord(const std::filesystem::path& payload,const std::string& id);
}
