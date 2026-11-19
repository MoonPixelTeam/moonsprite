#include "extension_js_session.h"
#include "extension_form_state.h"
#include <iostream>
#include <thread>
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
 // Reuse legacy extension-assets.test.ts values and quota expectations.
 {
  const auto database=root/("assets-"+std::to_string(GetTickCount64())+".sqlite");
  auto asset=[&](const std::string& owner,const std::string& method,std::u16string key,std::optional<std::u16string> value={}){return startAssetRequest(database,owner,method,std::move(key),std::move(value));};
  const std::u16string preview(400000,u'x');asset("pet","assets.set",u"sprite",preview).get();check(asset("pet","assets.get",u"sprite").get()==preview,"Legacy large asset roundtrip");check(!asset("other","assets.get",u"sprite").get(),"Asset namespaces leaked");
  auto rejects=[&](const std::string& method,std::u16string key,std::optional<std::u16string> value,const std::string& message){bool rejected=false;try{asset("pet",method,std::move(key),std::move(value)).get();}catch(const std::exception& error){rejected=std::string(error.what()).find(message)!=std::string::npos;}check(rejected,"Asset validation/quota error mismatch");};
  rejects("assets.set",u"sprite",std::u16string(8u*1024u*1024u+1,u'x'),"8 MiB");check(asset("pet","assets.get",u"sprite").get()==preview,"Failed asset write changed prior value");
  rejects("assets.set",u"",u"x","扩展素材键无效");rejects("assets.get",std::u16string(161,u'a'),{},"扩展素材键无效");rejects("assets.set",u"bad",{},"扩展素材必须是字符串");
  std::u16string unusual{char16_t(0xd800),u'\0',char16_t(0xdc00),u'月'};asset("pet","assets.set",u"unicode",unusual).get();check(asset("pet","assets.get",u"unicode").get()==unusual,"Asset UTF-16/NUL preservation");
  asset("pet","assets.set",u"empty",u"").get();check(asset("pet","assets.get",u"empty").get()==std::u16string{},"Empty asset became null");asset("pet","assets.remove",u"sprite").get();check(!asset("pet","assets.get",u"sprite").get(),"Asset removal failed");
  const std::u16string large(8u*1024u*1024u,u'x');std::vector<std::future<AssetResult>> concurrent;
  for(int i=0;i<8;++i)concurrent.push_back(asset("quota","assets.set",std::u16string(1,char16_t(u'0'+i)),large));for(auto& future:concurrent)future.get();
  bool quota=false;try{asset("quota","assets.set",u"overflow",u"x").get();}catch(const std::exception& error){quota=std::string(error.what()).find("64 MiB")!=std::string::npos;}check(quota&&!asset("quota","assets.get",u"overflow").get(),"Aggregate quota failed atomically");
  asset("quota","assets.set",u"0",large).get();asset("quota","assets.remove",u"0").get();asset("quota","assets.set",u"overflow",u"ok").get();check(asset("quota","assets.get",u"overflow").get()==u"ok","Quota replacement/release failed");
 }
 // Execute the actual legacy window bootstrap and documented ui-form example
 // through authenticated runtime open, not a direct call to the presenter.
 {
  struct ViewState {FormState form;JsFormCallbacks callbacks;bool closed=false;};
  struct View final:JsFormPresentation {std::shared_ptr<ViewState> state;explicit View(std::shared_ptr<ViewState> value):state(std::move(value)){}void receive(const WindowValue& value)override{state->form.receive(value,state->form.generation());}void failure(const std::string& error)override{state->form.loadFailed(winrt::to_hstring(error).c_str());}void pump()override{}void close()override{state->closed=true;state->form.close();}};
  std::shared_ptr<ViewState> view;int opened=0;
  auto forms=RuntimeDirectory::parseManifest(JsonObject::Parse(LR"({"schemaVersion":2,"id":"js-form","name":"JS Form","version":"1","apiVersion":"1.0.0","runtime":{"entry":"runtime.html","permissions":["runtime","windows"],"resources":{"form":"form.html","data":"form-data.bin"}}})"),root,"js-form");
  std::ofstream(root/"form-data.bin",std::ios::binary)<<"ABC";
  const std::string formSource=R"HTML(<script>
let name='Moon';
const draw=requestId=>moonsprite.window.postMessage({type:'ui-state',nodes:[{id:'name',type:'input',value:name},{id:'save',type:'button',action:{type:'save'}},{id:'close',type:'button',action:{type:'close'}}],...(requestId?{result:{requestId}}:{})});
moonsprite.window.onMessage(async message=>{if(message.type==='close'){await moonsprite.window.close();return;}if(message.type==='host-ping'){await moonsprite.window.postMessage({type:'pong'});return;}if(message.type==='save'){const preview='x'.repeat(400000)+'\ud800\u0000🌙';await moonsprite.assets.set('preview',preview);if(await moonsprite.assets.get('preview')!==preview)throw Error('asset bridge string');await moonsprite.assets.remove('preview');if(await moonsprite.assets.get('preview')!==null)throw Error('asset bridge removal');name=message.values.name;await moonsprite.storage.set('profile',{name,id:moonsprite.window.id,tiny:5e-324});const data=await moonsprite.resources.read('data');if(data.join(',')!=='65,66,67')throw Error('window resource bytes');await moonsprite.window.postMessage({type:'saved'});await draw(message.requestId);}});draw();
</script>)HTML";
  std::ofstream(root/"form.html")<<formSource;
  std::vector<std::string> formLogs;JsSession formSession(host,forms,"en-US",{},{},{},[&](const auto& line){formLogs.push_back(line);},[&](const auto&,const auto&,JsFormCallbacks callbacks){++opened;view=std::make_shared<ViewState>();view->callbacks=std::move(callbacks);return std::make_unique<View>(view);});
  formSession.start(R"(<script>moonsprite.on('activate',()=>moonsprite.windows.open({windowId:'profile',resourceId:'form',options:{presentation:'dialog',component:'form'}}));moonsprite.on('window-message',event=>{if(event.message.type==='saved')moonsprite.windows.postMessage({windowId:'profile',message:{type:'host-ping'}});if(event.message.type==='pong')console.log('pong');});</script>)",project);
  auto tick=[&]{for(int i=0;i<300;++i){formSession.pump(std::chrono::steady_clock::now()+std::chrono::milliseconds(20));std::this_thread::sleep_for(std::chrono::milliseconds(1));}};tick();
  check(view&&view->form.loaded()&&view->form.loadError().empty(),"Real window bootstrap initial ui-state failed");
  check(view->form.edit(L"name",JsonValue::CreateStringValue(L"原生 Moon")),"Native form draft missing");view->callbacks.send(*view->form.click(L"save"));tick();
  auto profile=storage.get(u"js-form",u"profile").GetObject();check(profile.GetNamedString(L"name")==L"原生 Moon"&&profile.GetNamedString(L"id")==L"profile"&&profile.GetNamedNumber(L"tiny")==5e-324&&!view->form.busy()&&view->form.drafts().Size()==0,"Window JS storage/action/result/draft roundtrip failed");
  check(std::find(formLogs.begin(),formLogs.end(),"pong")!=formLogs.end(),"Runtime/window message directions not connected");
  // Queued window messages must be discarded when retry replaces the VM.
  auto stale=view->callbacks;stale.send(JsonObject::Parse(LR"({"type":"host-ping"})"));
  // Retry replaces the window VM; old queued work cannot update its generation.
  view->form.retry();view->callbacks.restart();tick();check(view->form.loaded()&&view->form.effectiveValue(L"name").GetString()==L"Moon","Window retry did not reset JS model");
  view->callbacks.send(*view->form.click(L"close"));tick();check(view->closed,"window.close did not retire presenter");
  formSession.stop();
  {JsEngine window("quoted\"月");window.evaluate("if(moonsprite.window.id!==\"quoted\\\"月\")throw Error('window identity quoting');","identity.js");}
 }
 std::cout<<"QuickJS native runtime, actual legacy bootstrap, authenticated session lifecycle passed\n";return 0;
 }catch(const std::exception& error){std::cerr<<error.what()<<'\n';return 1;}catch(const winrt::hresult_error& error){std::cerr<<winrt::to_string(error.message())<<'\n';return 1;}}
