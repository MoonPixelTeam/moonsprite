#pragma once
#include "document.h"
#include "project_backup.h"
#include <filesystem>
namespace moon::project {
// Same-directory temporary, flush, verify, and atomic replacement. The active
// document is marked saved only after the filesystem commit succeeds.
void saveDocumentAtomic(Document& document,const std::filesystem::path& path,BackupPolicy backup={false,10,30,{}});
}
