#pragma once
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <optional>
#include <string>
#include <system_error>

namespace moon::io {
enum class AtomicWriteStage {Create,Write,Flush,Replace};
struct AtomicWritePolicy {
 const char* create="Cannot create binary temporary file";
 const char* write="Cannot write binary temporary file";
 const char* flush="Cannot flush binary temporary file";
 const char* replace="Cannot replace binary file";
 const char* domain="binary";
 std::uint64_t processId=0;
 // Existing recovery crash checkpoint and native verification/backup hooks.
 // They run synchronously inside this transaction, never on another owner.
 std::function<void(std::size_t)> afterChunk;
 std::function<void(const std::filesystem::path&)> beforeReplace;
};
class AtomicWriteError:public std::system_error {
 std::string message_;
public:
 AtomicWriteStage stage;
 AtomicWriteError(AtomicWriteStage phase,const std::error_code& code,const char* action,
                 const AtomicWritePolicy& policy,const std::filesystem::path& target,
                 const std::filesystem::path& temporary)
  :std::system_error(code),stage(phase),message_(std::string(action)+" (Windows "+std::to_string(code.value())+
   ") [stage="+policy.domain+"; target="+target.u8string()+"; temporary="+temporary.u8string()+
   "; pid="+std::to_string(policy.processId)+"]"){}
 const char* what()const noexcept override{return message_.c_str();}
};
// Narrow operation injection: the same production commit protocol is exercised
// without constructing Editor or simulating a full/damaged user filesystem.
// Operations capture native errors at the failed call. close/remove never throw.
template<class Operations>
void writeAtomicBytes(Operations& ops,const std::filesystem::path& target,
                      const std::filesystem::path& temporary,const std::uint8_t* bytes,
                      std::size_t size,const AtomicWritePolicy& policy={}) {
 using Handle=typename Operations::Handle;
 auto checked=[&](AtomicWriteStage stage,const char* action,auto&& work)->decltype(auto){
  try{return work();}catch(const std::system_error& failure){throw AtomicWriteError(stage,failure.code(),action,policy,target,temporary);}
 };
 // A rejected CREATE_NEW never authorizes deleting a pre-existing temporary.
 std::optional<Handle> file;
 file=checked(AtomicWriteStage::Create,policy.create,[&]{return ops.create(temporary);});
 try{
  for(std::size_t offset=0;offset<size;){const auto count=std::min<std::size_t>(1024*1024,size-offset);
   checked(AtomicWriteStage::Write,policy.write,[&]{
    const auto written=ops.write(*file,bytes+offset,count);
    if(written!=count)throw std::system_error(std::error_code(29,std::system_category())); // ERROR_WRITE_FAULT
   });
   offset+=count;if(policy.afterChunk)policy.afterChunk(offset);
  }
  checked(AtomicWriteStage::Flush,policy.flush,[&]{ops.flush(*file);});
  ops.close(*file);file.reset();
  if(policy.beforeReplace)policy.beforeReplace(temporary);
  checked(AtomicWriteStage::Replace,policy.replace,[&]{ops.replace(temporary,target);});
 }catch(...){if(file)ops.close(*file);ops.remove(temporary);throw;}
}
}
