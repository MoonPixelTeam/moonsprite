#pragma once
#include "project_reader.h"
#include <cstdint>
namespace moon::project {
struct RecoveryRecord {std::string id,name,updatedAt;};
// Legacy platform_recovery.rs stores <safe-id>.json beside <safe-id>.moonsprite.
// Metadata is UTF-8 JSON; project archive bytes remain the existing project codec.
std::string encodeRecoveryRecord(const RecoveryRecord& record);
RecoveryRecord decodeRecoveryRecord(const std::string& utf8,std::size_t maxBytes=1024*1024);
bool isSafeRecoveryId(const std::string& id);
}
