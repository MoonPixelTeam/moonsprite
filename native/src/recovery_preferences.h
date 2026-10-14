#pragma once
#include <filesystem>
#include <cstdint>
namespace moon::recovery {
struct Preferences {bool enabled=true;double minutes=5;int retentionDays=7;};
Preferences normalizePreferences(Preferences value);
Preferences loadPreferences(const std::filesystem::path& path);
void savePreferencesAtomic(const std::filesystem::path& path,Preferences value);
// Preview only. Never deletes or changes a record; future timestamps are not stale.
bool retentionStale(std::int64_t updatedMs,std::int64_t nowMs,int days);
}
