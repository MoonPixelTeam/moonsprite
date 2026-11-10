#include "lua_script_runtime.h"
#include <iostream>
using namespace moon::script;
using namespace winrt::Windows::Data::Json;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
template<class Work>void reject(Work work){bool rejected=false;try{work();}catch(...){rejected=true;}check(rejected,"Expected failed request");}
int main(int argc,char** argv){try{winrt::init_apartment();check(argc==2,"Fixture root required");
 auto root=std::filesystem::path(argv[1])/("worker-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root/"scripts");
 auto write=[&](const char* name,const char* source){std::ofstream file(root/"scripts"/name);file<<source;};
 const std::string context=R"({"documentId":"doc","documentName":"Test","documentWidth":2,"documentHeight":2,"documentFilePath":"","colorMode":"rgba","layerId":"layer","layerName":"Layer","layerWidth":2,"layerHeight":2,"layerOffsetX":0,"layerOffsetY":0,"layerOpacity":255,"layerVisible":true,"layerLocked":false,"layerFormat":"rgba","layerGroupId":null,"layerStackIndex":1,"frameNumber":1,"pixels":[0,0,0,0],"selection":null,"transparentColor":0,"foreground":4294967295,"background":4278190080})";
 write("draw.lua","app.transaction('draw',function() app.activeImage:drawPixel(0,0,app.pixelColor.rgba(10,20,30,255)) end)");
 write("error.lua","error('worker-script-error')");write("budget.lua","while true do end");
 write("dialog.lua","local count=0; local dlg=Dialog('Worker'); dlg:button{id='apply',text='Apply',onclick=function() count=count+1; app.transaction('callback',function() app.activeImage:drawPixel(0,0,app.pixelColor.rgba(count,0,0,255)) end) end}; dlg:show{wait=false}");
 auto extension=root/"extensions"/"com.example";std::filesystem::create_directories(extension);
 {std::ofstream manifest(extension/"manifest.json");manifest<<R"({"schemaVersion":1,"id":"com.example","name":"Example","version":"1","entry":"main.lua","commands":[{"id":"run","name":"Run","entry":"command.lua"}]})";}
 {std::ofstream main(extension/"main.lua");main<<"print('extension-main')";std::ofstream command(extension/"command.lua");command<<"print('extension-command')";}
 Runtime runtime(root);
 auto listed=runtime.list();auto catalog=JsonObject::Parse(winrt::to_hstring(listed.get()));bool mainListed=false,commandListed=false;
 for(const auto& value:catalog.GetNamedArray(L"scripts")){auto entry=value.GetObject();const auto id=entry.GetNamedString(L"id");mainListed|=id==L"extension:com.example";commandListed|=id==L"extension:com.example:run";}
 check(mainListed&&commandListed&&std::filesystem::exists(root/"scripts"/"moon-phase.lua"),"Worker listing lost extension/seed");
 write("remove-owned.lua","print('temporary fixture')");auto removed=runtime.remove("remove-owned.lua");auto afterRemove=runtime.list();check(removed.get()=="null"&&!std::filesystem::exists(root/"scripts"/"remove-owned.lua"),"Worker removal failed");
 for(const auto& value:JsonObject::Parse(winrt::to_hstring(afterRemove.get())).GetNamedArray(L"scripts"))check(value.GetObject().GetNamedString(L"id")!=L"remove-owned.lua","FIFO listing preceded removal");
 reject([&]{runtime.remove("extension:com.example").get();});reject([&]{runtime.remove("../outside.lua").get();});check(!runtime.list().get().empty(),"Directory failure killed worker");
 auto draw=runtime.start("draw.lua",context);auto failure=runtime.start("error.lua",context);auto again=runtime.start("draw.lua",context);
 auto output=JsonObject::Parse(winrt::to_hstring(draw.get()));check(output.GetNamedBoolean(L"finished")&&output.GetNamedArray(L"batches").Size()==1,"Real worker transaction missing");reject([&]{failure.get();});check(!again.get().empty(),"Request failure killed worker");
 reject([&]{runtime.start("../draw.lua",context).get();});reject([&]{runtime.start("draw.lua","{").get();});reject([&]{runtime.start("budget.lua",context).get();});
 for(const auto& id:{"extension:com.example","extension:com.example:run"}){
  auto result=JsonObject::Parse(winrt::to_hstring(runtime.start(id,context).get()));check(result.GetNamedArray(L"output").Size()==1,"Extension source not executed");}
 moon::extension::RuntimeDirectory::setEnabled(root/"extensions","com.example",false);
 reject([&]{runtime.start("extension:com.example:run",context).get();});
 auto initial=JsonObject::Parse(winrt::to_hstring(runtime.start("dialog.lua",context).get()));check(!initial.GetNamedBoolean(L"finished"),"Dialog session lost");const auto session=winrt::to_string(initial.GetNamedString(L"sessionId"));auto dialog=initial.GetNamedArray(L"dialogs").GetObjectAt(0);JsonObject action;action.Insert(L"dialogId",dialog.GetNamedValue(L"id"));action.Insert(L"controlId",JsonValue::CreateStringValue(L"apply"));action.Insert(L"event",JsonValue::CreateStringValue(L"click"));action.Insert(L"values",JsonObject{});
 for(int count=1;count<=2;++count){auto result=JsonObject::Parse(winrt::to_hstring(runtime.dispatch(session,winrt::to_string(action.Stringify()),context).get()));auto change=result.GetNamedArray(L"batches").GetObjectAt(0).GetNamedArray(L"changes").GetObjectAt(0);check(change.GetNamedNumber(L"after")==double(0xff000000u+count),"Callback VM state/rebase lost");}
 check(runtime.close(session).get()=="null","Session close response");reject([&]{runtime.dispatch(session,winrt::to_string(action.Stringify()),context).get();});
 auto builtin=JsonObject::Parse(winrt::to_hstring(runtime.start("moon-phase.lua",context).get()));check(builtin.GetNamedArray(L"createdDocuments").Size()==1,"Original seeded example did not execute");
 auto pending=runtime.start("draw.lua",context);auto pendingList=runtime.list();runtime.shutdown();check(!pending.get().empty()&&!pendingList.get().empty(),"Shutdown dropped accepted request");runtime.shutdown();reject([&]{runtime.start("draw.lua",context);});reject([&]{runtime.list();});reject([&]{runtime.remove("draw.lua");});
 std::future<std::string> drained;{Runtime closing(root);drained=closing.start("draw.lua",context);}check(!drained.get().empty(),"Destructor discarded accepted request");
 std::cout<<"Lua worker source/session/budget/shutdown contracts passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what();return 1;}catch(const winrt::hresult_error& e){std::cerr<<winrt::to_string(e.message());return 1;}}
