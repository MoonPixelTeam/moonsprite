#pragma once
#include <filesystem>
#include <cstdint>
#include <string>
#include <vector>
namespace moon::project {
struct BackupPolicy {bool enabled=true;int versions=10,days=30;std::filesystem::path directory;};
struct BackupRecord {std::filesystem::path path;std::uint64_t modifiedMs=0,size=0;};
BackupPolicy normalizeBackupPolicy(BackupPolicy);
std::string backupPathHash(const std::filesystem::path&);
std::filesystem::path backupProjectDirectory(const std::filesystem::path&);
std::vector<BackupRecord> listProjectBackups(const std::filesystem::path& project,const std::filesystem::path& root);
void createCommittedProjectBackup(const std::filesystem::path& project,const BackupPolicy&);
void scheduleNativeBackupPrune(BackupPolicy);
struct BackupCandidate {BackupRecord record;std::string projectKey;};
std::vector<std::filesystem::path> planBackupPrune(std::vector<BackupCandidate>,std::uint64_t nowMs,int versions,int days);
}
