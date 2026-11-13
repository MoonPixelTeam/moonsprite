#include "timelapse_session.h"
#include "project_file.h"
#include "project_encode.h"
#include "project_import.h"
#include <windows.h>
#include <fstream>
#include <array>
#include "system_atomic_file.h"
namespace moon::project {
void saveDocumentAtomic(Document& document,const std::filesystem::path& path,BackupPolicy backup) {
  if(path.empty()) throw std::invalid_argument("Empty project path");
  if(auto recording=document.recordingSession())recording->flush(document);
  auto encoded=encodeEditableProject(document);
  // The generated archive must pass the same admission gate as a reopened file.
  prepareEditableImport(readProjectManifest(encoded.bytes));
  if(!path.parent_path().empty()) std::filesystem::create_directories(path.parent_path());
  io::AtomicWritePolicy policy;
  policy.create="Cannot create temporary project";policy.write="Cannot write project";
  policy.flush="Cannot flush project";policy.replace="Cannot replace project";policy.domain="project";
  policy.beforeReplace=[&](const std::filesystem::path& temporary){
    std::ifstream file(temporary,std::ios::binary|std::ios::ate);
    if(!file || file.tellg()!=std::streamoff(encoded.bytes->size())) throw std::runtime_error("Saved project size mismatch");
    // The encoded bytes already passed admission. Verify the on-disk bytes
    // exactly in bounded chunks; decoding an identical archive again adds no
    // validation and holds another complete raster document in memory.
    std::array<char,65536> checked{};file.seekg(0);
    for(std::size_t offset=0;offset<encoded.bytes->size();){
      const auto count=std::min(checked.size(),encoded.bytes->size()-offset);
      if(!file.read(checked.data(),std::streamsize(count)) || !std::equal(checked.begin(),checked.begin()+count,reinterpret_cast<const char*>(encoded.bytes->data()+offset)))throw std::runtime_error("Saved project verification failed");
      offset+=count;
    }
    file.close();
    createCommittedProjectBackup(path,backup);
  };
  io::commitAtomicBytes(path,*encoded.bytes,std::move(policy));
  document.acceptSaved(std::move(encoded.projectId),std::move(encoded.bytes));
  if(backup.enabled)try{scheduleNativeBackupPrune(std::move(backup));}catch(const std::exception& e){OutputDebugStringA(e.what());}
}
}
