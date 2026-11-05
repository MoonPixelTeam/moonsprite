#pragma once
#include "project_reader.h"
namespace moon::project {
// The existing project/recovery ZIP writer, also used by local-history records.
Bytes encodeResourceArchive(const std::map<std::string,Bytes>& files,Limits limits={},int compressionLevel=0,const std::map<std::string,int>& fileCompression={});
}
