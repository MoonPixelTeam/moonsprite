#pragma once
#include "local_history_persistence.h"
#include <exception>
namespace moon {struct HistoryStackChange;class Document;}
namespace moon::local_history {
// Owner-thread coordinator for settled stack events, capture failure policy,
// debounce/pressure scheduling, and immutable writer generations.
class LocalHistoryRecording final {
public:
 using Failure=std::function<void(std::exception_ptr)>;
 LocalHistoryRecording(std::shared_ptr<JournalSession>,JournalWriter&,Failure={});
 LocalHistoryRecording(std::shared_ptr<JournalSession>,JournalWriterRegistry&,std::string identity,Failure={});
 LocalHistoryRecording(const LocalHistoryRecording&)=delete;
 LocalHistoryRecording& operator=(const LocalHistoryRecording&)=delete;
 bool active()const{return bool(session_);}
 const std::shared_ptr<JournalSession>& session()const{return session_;}
 std::exception_ptr captureFailure()const{return captureFailure_;}
 void disable();
 void resume(std::shared_ptr<JournalSession>);
 bool record(const JournalSession::Change&,std::string shape,const JournalSession::Dependencies&,double nowMilliseconds);
 bool recordSettled(const HistoryStackChange&,const Document&,JournalSession::Dependencies,double nowMilliseconds,project::Limits limits={});
 std::optional<JournalWriter::Acknowledgement> poll(double nowMilliseconds,JournalGeneration metadata,const JournalWriter::Success& success={});
 std::optional<JournalWriter::Acknowledgement> flush(JournalGeneration metadata,const JournalWriter::Success& success={});
 std::optional<double> deadline()const{return timer_.deadline();}
private:
 std::shared_ptr<JournalSession> session_;
 JournalWriter* writer_=nullptr;
 JournalWriterRegistry* registry_=nullptr;
 std::string identity_;
 Failure failure_;
 PersistTimer timer_;
 std::exception_ptr captureFailure_;
 template<class F> bool recordImpl(F&&);
};
}
