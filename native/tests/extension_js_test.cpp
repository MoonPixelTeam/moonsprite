#include "extension_js_session.h"
#include <iostream>
using namespace moon::extension;using namespace winrt::Windows::Data::Json;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int main(){winrt::init_apartment();try{
 auto root=std::filesystem::current_path()/"extension-js-test-owned";std::filesystem::create_directories(root);std::ofstream(root/"test-owned.marker")<<"QuickJS runtime fixture";
 Storage storage(root/("storage-"+std::to_string(GetTickCount64())+".json"));FileDropRouter drops;RuntimeRegistry registry;auto host=std::make_shared<SessionHost>(storage,drops,registry);
 auto manifest=JsonObject::Parse(LR"({"schemaVersion":2,"id":"js-fixture","name":"JS fixture","version":"1.0.0","apiVersion":"1.0.0","commands":[{"id":"go","name":"Go","runtimeEvent":"go"}],"runtime":{"entry":"runtime.html","permissions":["runtime","commands","storage","ui","events","io","resources"]}})");auto candidate=RuntimeDirectory::parseManifest(manifest,root,"js-fixture");
 std::vector<std::string> notices;HostServices services;services.notify=[&](const auto& message){notices.push_back(winrt::to_string(message));};RuntimeEvent project;project.type="project";project.payload="null";
 const std::string html=R"HTML(<!doctype html><!-- <script>throw 1</script> --><script type="application/json">{"a":1}</script><script src="blocked.js">throw 2</script><script data-note=">">
 const api=moonsprite;let count=0;
 api.on('activate',async()=>{await api.storage.set({key:'exact',value:{text:'月🌙',small:5e-324,large:9007199254740991,minus:-0}});const v=await api.storage.get({key:'exact'});if(v.text!=='月🌙'||v.small!==5e-324)throw Error('roundtrip');await api.ui.notify({message:'ready'});});
 api.on('command',async event=>{await api.storage.set({key:'command',value:++count});await api.ui.notify({message:event.event});});
 api.on('locale-changed',event=>api.storage.set({key:'locale',value:event.locale}));
 api.on('files-dropped',event=>api.ui.notify({message:event.files[0].name+':'+event.files[0].bytes.join(',')}));
 api.on('deactivate',()=>console.log('stopped'));
 setTimeout(()=>api.ui.notify({message:'timer'}),0);
 </script>)HTML";
 JsSession session(host,candidate,"zh-CN",{},services,{});registry.command("js-fixture","go","queued");session.start(html,project);
 auto pump=[&]{for(int i=0;i<30;++i)session.pump(std::chrono::steady_clock::now()+std::chrono::milliseconds(20));};pump();
 check(session.active()&&session.error().empty(),"Real VM session stopped");check(std::find(notices.begin(),notices.end(),"ready")!=notices.end(),"Bootstrap Promise/storage roundtrip failed");check(std::find(notices.begin(),notices.end(),"timer")!=notices.end(),"Native timer failed");check(std::find(notices.begin(),notices.end(),"queued")!=notices.end(),"Preload command not delivered");
 auto exact=storage.get(u"js-fixture",u"exact").GetObject();check(exact.GetNamedString(L"text")==L"月🌙"&&exact.GetNamedNumber(L"large")==9007199254740991.,"JS serialized storage not preserved");registry.command("js-fixture","go","next");pump();check(storage.get(u"js-fixture",u"command").GetNumber()==2,"Persistent command callback state lost");host->localeChanged("ja-JP");pump();check(storage.get(u"js-fixture",u"locale").GetString()==L"ja-JP","Locale event not delivered");registry.filesDropped("js-fixture","a.custom",{0,255});pump();check(std::find(notices.begin(),notices.end(),"a.custom:0,255")!=notices.end(),"Files event bytes not delivered");session.stop();check(!registry.command("js-fixture","go","late"),"Stopped VM still registered");
 // Separate runtime/context, denied permission rejects Promise without native effect.
 auto other=RuntimeDirectory::parseManifest(JsonObject::Parse(LR"({"schemaVersion":2,"id":"isolated","name":"Other","version":"1","apiVersion":"1.0.0","runtime":{"entry":"runtime.html","permissions":["runtime"]}})"),root,"isolated");std::vector<std::string> logs;JsSession isolated(host,other,"en-US",{},services,{},[&](const auto& line){logs.push_back(line);});isolated.start(R"(<script>if(typeof count!=='undefined')throw Error('global leak');moonsprite.storage.list().then(()=>console.error('bad')).catch(()=>console.log('denied'));</script>)",project);for(int i=0;i<10;++i)isolated.pump(std::chrono::steady_clock::now()+std::chrono::milliseconds(20));check(logs==std::vector<std::string>{"denied"},"Permission rejection/isolation failed");
 {JsEngine engine;bool interrupted=false;auto start=std::chrono::steady_clock::now();try{engine.evaluate("while(true){}","loop.js");}catch(...){interrupted=true;}check(interrupted&&std::chrono::steady_clock::now()-start<std::chrono::seconds(2),"Infinite JS was not interrupted");}
 {JsEngine engine;engine.evaluate("Promise.reject(Error('unhandled-marker'));","reject.js");bool failed=false;try{engine.pump(std::chrono::steady_clock::now()+std::chrono::milliseconds(20));}catch(const std::exception& error){failed=std::string(error.what()).find("unhandled-marker")!=std::string::npos;}check(failed,"Unhandled Promise rejection was silent");}
 {JsEngine engine;engine.evaluate("setInterval(()=>console.log('tick'),0);Promise.resolve().then(()=>console.log('promise'));","jobs.js");engine.pump(std::chrono::steady_clock::now()+std::chrono::milliseconds(20));check(!engine.takeMessages().empty(),"Jobs/timers failed");}
 check(runtimeScripts(R"(<div title="<script>throw 1</script>"></div><style>a{content:'<script>throw 2</script>'}</style><textarea><script>throw 3</script></textarea><script>let a=1</script>)").size()==1,"HTML raw text/quoted attributes executed script");
 check(runtimeScripts("<script>let a=1</script><SCRIPT type='module'>export const b=2</SCRIPT>").size()==2,"Inline/module source extraction");
 std::cout<<"QuickJS native runtime, actual legacy bootstrap, authenticated session lifecycle passed\n";return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}catch(const winrt::hresult_error& error){std::cerr<<winrt::to_string(error.message())<<'\n';return 1;}}
