#include "local_history_store.h"
#include "atomic_file.h"
#include <fstream>
#include <limits>
namespace moon::local_history {
bool safeHistoryId(const std::string& id){return !id.empty()&&id.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-")==std::string::npos;}
namespace {
std::filesystem::path historyPath(const std::filesystem::path& directory,const std::string& id){if(!safeHistoryId(id))throw std::invalid_argument("无效的本地历史 ID");return directory/std::filesystem::u8path(id+".history");}
}
project::Bytes readHistory(const std::filesystem::path& directory,const std::string& id,std::size_t maximum){
 const auto path=historyPath(directory,id);std::ifstream file(path,std::ios::binary|std::ios::ate);
 if(!file)throw std::runtime_error("Cannot read local history: "+path.u8string());const auto size=file.tellg();
 if(size<0||std::uint64_t(size)>maximum||std::uint64_t(size)>std::uint64_t(std::numeric_limits<std::streamsize>::max()))throw project::Error(project::ErrorKind::Limit,"Local history exceeds read budget");
 project::Bytes bytes{ };bytes.resize(std::size_t(size));file.seekg(0);
 if(!bytes.empty()&&!file.read(reinterpret_cast<char*>(bytes.data()),std::streamsize(bytes.size())))throw std::runtime_error("Incomplete local history read");return bytes;
}
void writeHistory(const std::filesystem::path& directory,const std::string& id,const project::Bytes& bytes,std::size_t maximum){
 const auto path=historyPath(directory,id);if(bytes.size()>maximum)throw project::Error(project::ErrorKind::Limit,"Local history exceeds write budget");
 if(!directory.empty())std::filesystem::create_directories(directory);writeBinaryFileAtomic(path,bytes);
}
}
