#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>
#include "extension_session_host.h"
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
struct Server {
 SOCKET listener=INVALID_SOCKET;unsigned short port=0;std::thread thread;std::atomic<int> count{0};
 Server(){listener=socket(AF_INET,SOCK_STREAM,IPPROTO_TCP);sockaddr_in address{};address.sin_family=AF_INET;address.sin_addr.s_addr=htonl(INADDR_LOOPBACK);check(bind(listener,reinterpret_cast<sockaddr*>(&address),sizeof(address))==0,"bind");int length=sizeof(address);getsockname(listener,reinterpret_cast<sockaddr*>(&address),&length);port=ntohs(address.sin_port);listen(listener,8);
  thread=std::thread([this]{for(;;){auto peer=accept(listener,nullptr,nullptr);if(peer==INVALID_SOCKET)break;++count;std::string request;char buffer[4096];while(request.find("\r\n\r\n")==std::string::npos){auto n=recv(peer,buffer,sizeof(buffer),0);if(n<=0)break;request.append(buffer,n);}std::string body="hello";int status=200;
   if(request.find("/large ")!=std::string::npos)body.assign(2*1024*1024+1,'x');
   if(request.find("/exact ")!=std::string::npos)body.assign(2*1024*1024,'y');
   if(request.find("/missing ")!=std::string::npos){status=404;body="missing";}
   if(request.find("/timeout ")!=std::string::npos)std::this_thread::sleep_for(std::chrono::seconds(16));
   if(request.find("/slow ")!=std::string::npos)std::this_thread::sleep_for(std::chrono::milliseconds(300));
   if(request.find("/post ")!=std::string::npos){const auto start=request.find("\r\n\r\n")+4;while(request.size()-start<7){auto n=recv(peer,buffer,sizeof(buffer),0);if(n<=0)break;request.append(buffer,n);}body=request.substr(start);}
   if(request.find("Cookie:")!=std::string::npos)body="cookie leaked";
   const auto message="HTTP/1.1 "+std::to_string(status)+" Test\r\nContent-Length: "+std::to_string(body.size())+"\r\nX-Test: native\r\nSet-Cookie: secret=1\r\nConnection: close\r\n\r\n"+body;
   std::size_t sent=0;while(sent<message.size()){auto n=send(peer,message.data()+sent,int(std::min<std::size_t>(65536,message.size()-sent)),0);if(n<=0)break;sent+=n;}closesocket(peer);
  }});
 }
 ~Server(){closesocket(listener);thread.join();}
};
int main(int argc,char** argv){WSADATA data;WSAStartup(MAKEWORD(2,2),&data);winrt::init_apartment(winrt::apartment_type::multi_threaded);try{
 {auto cancelled=std::make_shared<std::atomic<bool>>(false);std::vector<std::uint8_t> input(65539);for(std::size_t i=0;i<input.size();++i)input[i]=std::uint8_t(i);auto encoded=networkBytes(input,cancelled);check(encoded.Size()==input.size(),"network byte count");for(std::uint32_t i=0;i<encoded.Size();++i)check(encoded.GetNumberAt(i)==input[i],"network exact bytes");check(encoded.GetAt(0)==encoded.GetAt(256),"network repeated bytes reuse JSON scalar");encoded.SetAt(0,JsonValue::CreateNumberValue(7));check(encoded.GetNumberAt(256)==0,"network shared scalar independent array replacement");cancelled->store(true);bool rejected=false;try{networkBytes(input,cancelled);}catch(const std::runtime_error&){rejected=true;}check(rejected,"network encoding pre-cancelled");rejected=false;try{networkBytes({},cancelled);}catch(const std::runtime_error&){rejected=true;}check(rejected,"empty encoding respects cancellation");}
 // Saturate all workers deterministically; queued cancellation cannot wait
 // for an unrelated HTTP request and never invokes the canceled callback.
 {detail::NetworkQueue queue;auto release=std::make_shared<std::promise<void>>();auto gate=release->get_future().share();std::atomic<int> running{0},maximum{0},entered{0},executed{0};std::vector<NetworkTask> blockers;
  struct Release{std::shared_ptr<std::promise<void>> value;~Release(){value->set_value();}}releaseOnExit{release};
  for(int i=0;i<detail::NetworkQueue::workerCount;++i)blockers.push_back(queue.submit(L"held",[&](const auto&){const auto n=++running;int old=maximum;while(old<n&&!maximum.compare_exchange_weak(old,n)){}++entered;gate.wait();--running;return std::wstring(L"held");}));
  const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(entered!=detail::NetworkQueue::workerCount){check(std::chrono::steady_clock::now()<until,"network pool workers started");std::this_thread::yield();}
  for(int i=0;i<128;++i){auto task=queue.submit(L"cancel",[&](const auto&){++executed;return std::wstring{};});task.cancel();task.cancel();check(task.response.wait_for(std::chrono::seconds(0))==std::future_status::ready,"queued network cancellation completes immediately");bool rejected=false;try{task.response.get();}catch(const std::runtime_error&){rejected=true;}check(rejected,"queued network cancellation rejects future");}
  check(!executed&&maximum==detail::NetworkQueue::workerCount,"bounded workers and canceled callbacks absent");
  auto failure=queue.submit(L"failure",[](const auto&)->std::wstring{throw std::runtime_error("worker failure");});auto recovered=queue.submit(L"next",[](const auto&){return std::wstring(L"recovered");});
  release->set_value();releaseOnExit.value=std::make_shared<std::promise<void>>();for(auto& task:blockers)check(task.response.get()==L"held","pool held response");bool rejected=false;try{failure.response.get();}catch(const std::runtime_error&){rejected=true;}check(rejected&&recovered.response.get()==L"recovered","pool continues after worker failure");
 }
 {auto queue=std::make_unique<detail::NetworkQueue>();auto release=std::make_shared<std::promise<void>>();auto gate=release->get_future().share();std::atomic<int> entered{0};std::vector<NetworkTask> held;
  struct Release{std::shared_ptr<std::promise<void>> value;~Release(){value->set_value();}}releaseOnExit{release};
  for(int i=0;i<detail::NetworkQueue::workerCount;++i)held.push_back(queue->submit(L"shutdown",[&](const auto&){++entered;gate.wait();return std::wstring{};}));const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(5);while(entered!=detail::NetworkQueue::workerCount){check(std::chrono::steady_clock::now()<until,"shutdown workers started");std::this_thread::yield();}
  auto queued=queue->submit(L"queued",[](const auto&){return std::wstring{};});queue.reset();check(queued.response.wait_for(std::chrono::seconds(0))==std::future_status::ready,"pool shutdown rejects pending without joining running workers");bool rejected=false;try{queued.response.get();}catch(const std::runtime_error&){rejected=true;}check(rejected,"shutdown pending rejection");queued.cancel();release->set_value();releaseOnExit.value=std::make_shared<std::promise<void>>();for(auto& task:held)task.response.get();
 }
 Server server;Storage storage(std::filesystem::path(argv[1])/("network-"+std::to_string(GetCurrentProcessId())+".json"));FileDropRouter drops;RuntimeRegistry registry;SessionHost host(storage,drops,registry);
 auto session=host.open({"net",true,false},{"network"},"en-US",[](const auto&){});auto denied=host.open({"denied",true,false},{},"en-US",[](const auto&){});
 auto raw=[&](const std::string& path,const std::string& extra=""){JsonObject request,params;request.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-request"));request.Insert(L"requestId",JsonValue::CreateStringValue(L"network-id"));request.Insert(L"method",JsonValue::CreateStringValue(L"network.fetch"));params.Insert(L"url",JsonValue::CreateStringValue(winrt::to_hstring("http://127.0.0.1:"+std::to_string(server.port)+path)));if(!extra.empty()){auto fields=JsonObject::Parse(winrt::to_hstring(extra));for(const auto& field:fields)params.Insert(field.Key(),field.Value());}request.Insert(L"params",params);return request;};
 auto receive=[&](const auto& token){const auto deadline=std::chrono::steady_clock::now()+std::chrono::seconds(25);for(;;){auto responses=host.pollResponses(token);if(!responses.empty()){check(responses.size()==1,"response count");return responses.front();}check(std::chrono::steady_clock::now()<deadline,"response deadline");std::this_thread::sleep_for(std::chrono::milliseconds(2));}};
 auto fetch=[&](const std::string& path,const std::string& extra=""){check(!host.request(session,raw(path,extra)),"network blocked instead of deferred");return receive(session);};
 check(!host.request(denied,raw("/"))->GetNamedBoolean(L"ok")&&server.count==0,"permission before IO");
 auto response=fetch("/");check(response.GetNamedBoolean(L"ok")&&response.GetNamedString(L"requestId")==L"network-id","GET envelope");auto result=response.GetNamedObject(L"result");check(result.GetNamedNumber(L"status")==200&&result.GetNamedBoolean(L"ok")&&result.GetNamedArray(L"bytes").Size()==5,"GET bytes/status");auto headers=result.GetNamedObject(L"headers");check(headers.GetNamedString(L"x-test")==L"native"&&!headers.HasKey(L"set-cookie"),"fetch response headers");
 result=fetch("/missing").GetNamedObject(L"result");check(result.GetNamedNumber(L"status")==404&&!result.GetNamedBoolean(L"ok"),"HTTP errors must return response");
 result=fetch("/post",R"({"method":"POST","body":"payload"})").GetNamedObject(L"result");check(result.GetNamedArray(L"bytes").Size()==7&&result.GetNamedArray(L"bytes").GetNumberAt(0)=='p',"POST body");
 check(!fetch("/",R"({"body":""})").GetNamedBoolean(L"ok"),"GET body rejected");check(!fetch("/",R"({"url":"file:///C:/test"})").GetNamedBoolean(L"ok"),"protocol gate");check(!fetch("/",R"({"url":5})").GetNamedBoolean(L"ok"),"url type gate");
 check(!fetch("/large").GetNamedBoolean(L"ok"),"response limit");check(fetch("/exact").GetNamedObject(L"result").GetNamedArray(L"bytes").Size()==2*1024*1024,"exact limit");
 const auto timeoutStart=std::chrono::steady_clock::now();check(!fetch("/timeout").GetNamedBoolean(L"ok"),"timeout failure");check(std::chrono::steady_clock::now()-timeoutStart>=std::chrono::seconds(14)&&std::chrono::steady_clock::now()-timeoutStart<std::chrono::seconds(18),"15 second timeout");
 const auto previousRequests=server.count.load();check(!host.request(session,raw("/slow")),"slow response not deferred");
 const auto arrivalDeadline=std::chrono::steady_clock::now()+std::chrono::seconds(3);while(server.count==previousRequests){check(std::chrono::steady_clock::now()<arrivalDeadline,"slow request never arrived");std::this_thread::sleep_for(std::chrono::milliseconds(2));}
 const auto before=std::chrono::steady_clock::now();host.close(session);check(std::chrono::steady_clock::now()-before<std::chrono::milliseconds(100),"close joined worker");auto replacement=host.open({"net",true,false},{"network"},"en-US",[](const auto&){});std::this_thread::sleep_for(std::chrono::milliseconds(400));check(host.pollResponses(session).empty()&&host.pollResponses(replacement).empty(),"stale response reached replacement");session=replacement;
 check(fetch("/").GetNamedObject(L"result").GetNamedArray(L"bytes").Size()==5,"cookie persisted across requests");
 auto peer=host.open({"peer",true,false},{"network"},"en-US",[](const auto&){});check(!host.request(session,raw("/"))&&!host.request(peer,raw("/missing")),"concurrent requests not deferred");check(receive(session).GetNamedObject(L"result").GetNamedNumber(L"status")==200&&receive(peer).GetNamedObject(L"result").GetNamedNumber(L"status")==404,"cross-extension response isolation");

 std::cout<<"Actual HTTP GET/POST/status/headers/2MiB/permission/session cancellation passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message())<<'\n';return 1;}}
