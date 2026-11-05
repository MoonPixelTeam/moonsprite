#include "local_history_recording.h"
#include "history_change.h"
#include "document.h"
#include <utility>
namespace moon::local_history {
LocalHistoryRecording::LocalHistoryRecording(std::shared_ptr<JournalSession> session,JournalWriter& writer,Failure failure)
 :session_(std::move(session)),writer_(&writer),failure_(std::move(failure)){if(!session_)throw std::invalid_argument("Missing local history session");}
LocalHistoryRecording::LocalHistoryRecording(std::shared_ptr<JournalSession> session,JournalWriterRegistry& registry,std::string identity,Failure failure)
 :session_(std::move(session)),registry_(&registry),identity_(std::move(identity)),failure_(std::move(failure)){
 if(!session_)throw std::invalid_argument("Missing local history session");
 if(identity_.empty())throw std::invalid_argument("Missing local history identity");
}
void LocalHistoryRecording::disable(){timer_.cancel();session_.reset();captureFailure_=nullptr;}
void LocalHistoryRecording::resume(std::shared_ptr<JournalSession> session){if(!session)throw std::invalid_argument("Missing local history session");timer_.cancel();captureFailure_=nullptr;session_=std::move(session);}
template<class F>bool LocalHistoryRecording::recordImpl(F&& capture){
 if(!session_)return false;
 try{capture();return true;}
 catch(...){captureFailure_=std::current_exception();timer_.cancel();session_.reset();if(failure_)try{failure_(captureFailure_);}catch(...){}return false;}
}
bool LocalHistoryRecording::record(const JournalSession::Change& change,std::string shape,const JournalSession::Dependencies& dependencies,double now){
 if(!session_)return false;
 return recordImpl([&]{session_->record(change,std::move(shape),dependencies);timer_.schedule(now,session_->pressured());});
}
bool LocalHistoryRecording::recordSettled(const HistoryStackChange& change,const Document& document,JournalSession::Dependencies dependencies,double now,project::Limits limits){
 if(!session_)return false;
 return recordImpl([&]{session_->recordSettled(change,document,std::move(dependencies),limits);timer_.schedule(now,session_->pressured());});
}
std::optional<JournalWriter::Acknowledgement> LocalHistoryRecording::poll(double now,JournalGeneration metadata,const JournalWriter::Success& success){
 if(registry_)registry_->poll(success);else writer_->poll(success);
 if(!session_||!timer_.takeDue(now))return {};
 return registry_?registry_->enqueueSession(identity_,session_,std::move(metadata)):writer_->enqueueSession(session_,std::move(metadata));
}
std::optional<JournalWriter::Acknowledgement> LocalHistoryRecording::flush(JournalGeneration metadata,const JournalWriter::Success& success){
 timer_.cancel();if(registry_)registry_->poll(success);else writer_->poll(success);
 if(!session_)return {};
 return registry_?registry_->enqueueSession(identity_,session_,std::move(metadata)):writer_->enqueueSession(session_,std::move(metadata));
}
}
