#include "atomic_write.h"
#include <iostream>
#include <stdexcept>
#include <vector>

using namespace moon::io;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
// Models native-operation outcomes, not another implementation of the commit
// protocol. The production writeAtomicBytes drives every ordering decision.
struct Operations {
 using Handle=int;
 std::string failure;
 bool open=false,created=false,removed=false,replaced=false;
 std::size_t writes=0;
 std::vector<std::string> calls;
 void operation(const char* name){calls.push_back(name);if(failure==name)throw std::system_error(std::error_code(112,std::system_category()));}
 Handle create(const std::filesystem::path&){operation("create");open=created=true;return 7;}
 std::size_t write(Handle file,const std::uint8_t*,std::size_t count){check(open&&file==7,"Write without owned handle");operation("write");++writes;return failure=="short"?count-1:count;}
 void flush(Handle){check(open,"Flush after close");operation("flush");}
 void close(Handle)noexcept{open=false;calls.push_back("close");}
 void replace(const std::filesystem::path&,const std::filesystem::path&){check(!open,"Replace before close");operation("replace");replaced=true;}
 void remove(const std::filesystem::path&)noexcept{removed=true;calls.push_back("remove");}
};
int main(){try{
 const std::filesystem::path target=std::filesystem::u8path("测试/owner.moonsprite"),temporary=std::filesystem::u8path("测试/owner.private.tmp");
 const std::vector<std::uint8_t> bytes(1024*1024+3,31);
 for(const auto& failure:{std::string("create"),std::string("write"),std::string("short"),std::string("flush"),std::string("replace")}){
  Operations ops;ops.failure=failure;AtomicWritePolicy policy;policy.domain="payload";policy.processId=19;
  bool rejected=false;
  try{writeAtomicBytes(ops,target,temporary,bytes.data(),bytes.size(),policy);}
  catch(const AtomicWriteError& error){
   rejected=true;check(error.code().value()==(failure=="short"?29:112),"Cleanup changed native failure code");
   const auto expected=failure=="create"?AtomicWriteStage::Create:failure=="flush"?AtomicWriteStage::Flush:failure=="replace"?AtomicWriteStage::Replace:AtomicWriteStage::Write;
   check(error.stage==expected,"Wrong failing phase");const std::string text=error.what();
   check(text.find("stage=payload")!=std::string::npos&&text.find(target.u8string())!=std::string::npos&&text.find(temporary.u8string())!=std::string::npos&&text.find("pid=19")!=std::string::npos,"Failure lost UTF-8 ownership context");
  }
  check(rejected&&!ops.open&&!ops.replaced,"Failed write committed or leaked handle");
  check(ops.removed==(failure!="create"),"CREATE_NEW failure removed someone else's temporary");
  check(std::count(ops.calls.begin(),ops.calls.end(),"close")==int(failure!="create"),"Failed write closed twice or lost ownership");
 }
 for(const auto& failure:{std::string("verify"),std::string("backup"),std::string("checkpoint")}){
  Operations ops;AtomicWritePolicy policy;
  policy.afterChunk=[&](std::size_t){if(failure=="checkpoint")throw std::runtime_error(failure);};
  policy.beforeReplace=[&](const auto&){check(!ops.open,"Validation must inspect closed temporary");ops.operation("verify");if(failure=="verify")throw std::runtime_error(failure);ops.operation("backup");throw std::runtime_error(failure);};
  bool rejected=false;try{writeAtomicBytes(ops,target,temporary,bytes.data(),bytes.size(),policy);}catch(const std::runtime_error& error){rejected=error.what()==failure;}
  check(rejected&&!ops.open&&ops.removed&&!ops.replaced,"Validation/backup failure replaced old target or lost exception");
 }
 Operations ops;AtomicWritePolicy policy;std::vector<std::size_t> chunks;
 policy.afterChunk=[&](auto offset){chunks.push_back(offset);};
 policy.beforeReplace=[&](const auto& path){check(path==temporary&&!ops.open,"Verification ownership");ops.operation("verify");ops.operation("backup");};
 writeAtomicBytes(ops,target,temporary,bytes.data(),bytes.size(),policy);
 check(ops.calls==std::vector<std::string>{"create","write","write","flush","close","verify","backup","replace"}&&chunks==std::vector<std::size_t>{1024*1024,bytes.size()},"Commit/chunk order changed");
 check(ops.replaced&&!ops.removed&&!ops.open,"Successful replacement was cleaned up");
 Operations empty;writeAtomicBytes(empty,target,temporary,nullptr,0);check(empty.calls==std::vector<std::string>{"create","flush","close","replace"},"Empty binary file changed protocol");
 std::cout<<"Atomic create/write/disk-full/short-write/flush/validation/backup/replace failures preserve target ownership, codes and cleanup; bounded writes and success ordering passed without UI or platform IO\n";
 return 0;
}catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}}
