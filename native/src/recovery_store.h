#pragma once
#include "recovery_codec.h"
#include <filesystem>
namespace moon::project {
std::vector<RecoveryRecord> listRecoveryRecords(const std::filesystem::path& directory);
void writeRecoveryFiles(const std::filesystem::path& directory,const RecoveryRecord& record,const Bytes& data);
void removeOwnedRecovery(const std::filesystem::path& directory,const std::string& id);
}
