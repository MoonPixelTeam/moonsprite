#include "system_atomic_file.h"
#include "atomic_file.h"
#include <windows.h>
#include <atomic>

namespace moon::io {
namespace {
[[noreturn]] void failed(){const auto code=GetLastError();throw std::system_error(std::error_code(int(code),std::system_category()));}
struct WindowsFileOperations {
 using Handle=HANDLE;
 Handle create(const std::filesystem::path& path){auto file=CreateFileW(path.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);if(file==INVALID_HANDLE_VALUE)failed();return file;}
 std::size_t write(Handle file,const std::uint8_t* bytes,std::size_t count){DWORD written=0;if(!WriteFile(file,bytes,DWORD(count),&written,nullptr))failed();return written;}
 void flush(Handle file){if(!FlushFileBuffers(file))failed();}
 void close(Handle file)noexcept{CloseHandle(file);}
 void replace(const std::filesystem::path& temporary,const std::filesystem::path& target){if(!MoveFileExW(temporary.c_str(),target.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))failed();}
 void remove(const std::filesystem::path& path)noexcept{DeleteFileW(path.c_str());}
};
}
void commitAtomicBytes(const std::filesystem::path& target,const std::vector<std::uint8_t>& bytes,AtomicWritePolicy policy){
 static std::atomic<std::uint64_t> serial{0};
 auto temporary=target;temporary+=L"."+std::to_wstring(GetCurrentProcessId())+L"."+std::to_wstring(GetTickCount64())+L"."+std::to_wstring(++serial)+L".tmp";
 policy.processId=GetCurrentProcessId();WindowsFileOperations ops;
 writeAtomicBytes(ops,target,temporary,bytes.data(),bytes.size(),policy);
}
}
namespace moon {
void writeBinaryFileAtomic(const std::filesystem::path& path,const std::vector<std::uint8_t>& bytes){
 if(path.empty())throw std::invalid_argument("Empty binary output path");
 io::commitAtomicBytes(path,bytes);
}
}
