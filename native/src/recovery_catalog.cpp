#include "recovery_catalog.h"
#include <algorithm>
#include <utility>
namespace moon::recovery {
bool RecoveryCatalog::beginLoad(bool startupOnly) {
 if(status_==CatalogStatus::Loading || (startupOnly && startupAttempted_)) return false;
 startupAttempted_=true; status_=CatalogStatus::Loading; error_.clear(); return true;
}
bool RecoveryCatalog::loaded(std::vector<project::RecoveryRecord> records) {
 if(status_!=CatalogStatus::Loading) return false;
 // Preserve platform_recovery.rs string ordering, including legacy unit strings.
 std::stable_sort(records.begin(),records.end(),[](const auto& a,const auto& b){return a.updatedAt>b.updatedAt;});
 records_=std::move(records); error_.clear(); status_=CatalogStatus::Ready; return true;
}
bool RecoveryCatalog::loadFailed(std::string error) {
 if(status_!=CatalogStatus::Loading) return false;
 records_.clear(); error_=std::move(error); status_=CatalogStatus::Failed; return true;
}
bool RecoveryCatalog::markDiscarded(const std::string& id) {
 const auto before=records_.size();
 records_.erase(std::remove_if(records_.begin(),records_.end(),[&](const auto& record){return record.id==id;}),records_.end());
 return records_.size()!=before;
}
const project::RecoveryRecord* RecoveryCatalog::find(const std::string& id) const {
 const auto it=std::find_if(records_.begin(),records_.end(),[&](const auto& record){return record.id==id;});
 return it==records_.end()?nullptr:&*it;
}
}
