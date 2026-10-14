#pragma once
#include "recovery_codec.h"
#include <string>
#include <vector>
namespace moon::recovery {
enum class CatalogStatus { Unloaded, Loading, Ready, Failed };
// UI-thread model. Platform owns discovery; document commands own restoration.
// No modal decisions, file reads/deletes, or document mutations occur here.
class RecoveryCatalog {
public:
 bool beginLoad(bool startupOnly=false);
 bool loaded(std::vector<project::RecoveryRecord> records);
 bool loadFailed(std::string error);
 bool markDiscarded(const std::string& id);
 CatalogStatus status() const { return status_; }
 const std::vector<project::RecoveryRecord>& rows() const { return records_; }
 std::size_t count() const { return records_.size(); }
 bool visible() const { return !records_.empty(); }
 const std::string& error() const { return error_; }
 const project::RecoveryRecord* find(const std::string& id) const;
private:
 CatalogStatus status_=CatalogStatus::Unloaded;
 bool startupAttempted_=false;
 std::vector<project::RecoveryRecord> records_;
 std::string error_;
};
}
