#include "editor.h"
#include "editor_implementation.h"
#include "extension_session_host.h"

namespace moon::editor {
namespace {
winrt::hstring workspaceText(const std::string& value){return winrt::to_hstring(value);}
extension::ProjectSummary summary(const Document& value){
 return {workspaceText(std::to_string(value.identity())),workspaceText(utf8Text(value.name())),L"rgba",value.width(),value.height(),value.timeline().state().layers.size(),value.timeline().state().frames.size(),value.dirty(),value.contentRevision()};
}
}
// Event-thread services use live session state on every call. The owning host
// must be destroyed before Editor; no document or pixel snapshot is retained.
extension::WorkspaceServices Editor::extensionWorkspaceServices(){
 extension::WorkspaceServices services;
 services.projects=[this]{std::vector<extension::ProjectSummary> result;if(!documentOpen_)return result;ensureProjects();result.reserve(projects_.size());for(std::size_t i=0;i<projects_.size();++i)result.push_back(summary(projectDocument(i)));return result;};
 services.active=[this]()->std::optional<extension::ProjectSummary>{if(!documentOpen_)return {};return summary(document);};
 services.activate=[this](const winrt::hstring& id){ensureProjects();for(std::size_t i=0;i<projects_.size();++i)if(workspaceText(std::to_string(projectDocument(i).identity()))==id){activateProject(i);return;}throw std::invalid_argument("工程不存在。");};
 services.layers=[this]{std::vector<extension::LayerSummary> result;if(documentOpen_)for(auto it=document.timeline().state().layers.rbegin();it!=document.timeline().state().layers.rend();++it)result.push_back({workspaceText(it->id),workspaceText(utf8Text(it->name)),workspaceText(it->blendMode),it->visible,it->opacity});return result;};
 services.frames=[this]{std::vector<extension::FrameSummary> result;if(documentOpen_)for(const auto& frame:document.timeline().state().frames)result.push_back({workspaceText(frame.id),frame.duration});return result;};
 services.undo=[this]{if(documentOpen_){document.undo();refresh();}};
 services.redo=[this]{if(documentOpen_){document.redo();refresh();}};
 return services;
}

void Editor::smokeExtensionWorkspace(){
 using namespace winrt::Windows::Data::Json;
 auto require=[](bool value,const char* error){if(!value)throw std::runtime_error(error);};
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;
 projects_.clear();document=Document::withBuiltinPalette(4,3,U"扩展工程一");ensureProjects();
 document.beginStroke({0,0},0xff123456);document.commitStroke();
 const auto first=std::to_string(document.identity());const auto firstHistory=document.historyPosition();
 addProject(Document::withBuiltinPalette(7,5,U"扩展工程二"));
 document.addLayer();document.setLayerOpacity(.375);document.setLayerVisible(false);document.addFrame();document.setFrameDuration(170);const auto second=std::to_string(document.identity());
 const auto history=document.historyPosition(),revision=document.contentRevision();
 extension::Storage storage(assets_.parent_path()/("extension-workspace-unused-"+std::to_string(GetCurrentProcessId())+".json"));
 extension::FileDropRouter drops;extension::RuntimeRegistry registry;extension::SessionHost host(storage,drops,registry);
 auto token=host.open({"workspace-check",true,false},{"workspace.read","workspace.write","document.read","document.write"},"zh-CN",[](const auto&){});
 host.setWorkspaceServices(token,extensionWorkspaceServices());
 auto call=[&](const char* method,JsonObject params=JsonObject{}){JsonObject request;request.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-request"));request.Insert(L"requestId",JsonValue::CreateStringValue(L"workspace"));request.Insert(L"method",JsonValue::CreateStringValue(workspaceText(method)));request.Insert(L"params",params);auto reply=host.request(token,request);require(bool(reply),"Missing workspace reply");return *reply;};
 auto result=[&](const char* method){auto reply=call(method);require(reply.GetNamedBoolean(L"ok"),"Workspace query failed");return reply.GetNamedValue(L"result");};
 const auto list=result("workspace.listProjects").GetArray();
 require(list.Size()==2&&list.GetObjectAt(0).GetNamedString(L"id")==workspaceText(first)&&list.GetObjectAt(1).GetNamedString(L"id")==workspaceText(second),"Real session order/identity");
 require(list.GetObjectAt(0).GetNamedNumber(L"width")==4&&list.GetObjectAt(1).GetNamedNumber(L"height")==5&&list.GetObjectAt(0).GetNamedString(L"name")==L"扩展工程一","Real session summaries");
 auto layers=result("document.getLayers").GetArray(),frames=result("document.getFrames").GetArray();
 require(layers.Size()==document.timeline().state().layers.size()&&layers.GetObjectAt(0).GetNamedString(L"id")==workspaceText(document.timeline().state().layers.back().id)&&frames.Size()==2&&frames.GetObjectAt(1).GetNamedNumber(L"index")==1&&frames.GetObjectAt(1).GetNamedNumber(L"duration")==document.timeline().state().frames[1].duration,"Real layer/frame order and values");
 require(layers.GetObjectAt(layers.Size()-1).GetNamedNumber(L"opacity")==.375&&!layers.GetObjectAt(layers.Size()-1).GetNamedBoolean(L"visible")&&frames.GetObjectAt(1).GetNamedNumber(L"duration")==170,"Layer properties/frame duration lost");
 require(document.historyPosition()==history&&document.contentRevision()==revision,"Queries mutated document");
 auto activate=[&](const std::string& id){JsonObject params;params.Insert(L"projectId",JsonValue::CreateStringValue(workspaceText(id)));return call("workspace.activateProject",params);};
 require(activate(first).GetNamedBoolean(L"ok")&&std::to_string(document.identity())==first&&document.historyPosition()==firstHistory,"Real project activation/history");
 require(result("workspace.getActiveProject").GetObject().GetNamedString(L"id")==workspaceText(first),"Live active snapshot");
 require(result("document.undo").ValueType()==JsonValueType::Null&&document.historyPosition()+1==firstHistory,"Real undo");
 require(result("document.redo").ValueType()==JsonValueType::Null&&document.historyPosition()==firstHistory&&document.pixels()[0]==0xff123456,"Real redo pixels");
 require(!activate("missing").GetNamedBoolean(L"ok")&&std::to_string(document.identity())==first,"Invalid activation changed session");
 require(activate(second).GetNamedBoolean(L"ok")&&document.historyPosition()==history,"Other session history changed");
 homeOpen_=true;require(result("document.getSummary").GetObject().GetNamedString(L"id")==workspaceText(second),"Home lost active project");
 auto replacement=host.open({"workspace-check",true,false},{"workspace.read"},"zh-CN",[](const auto&){});
 JsonObject stale;stale.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-request"));stale.Insert(L"requestId",JsonValue::CreateStringValue(L"stale"));stale.Insert(L"method",JsonValue::CreateStringValue(L"document.undo"));
 require(!host.request(token,stale)&&document.historyPosition()==history,"Stale session mutated editor");
 token=replacement;host.setWorkspaceServices(token,extensionWorkspaceServices());require(!call("document.undo").GetNamedBoolean(L"ok")&&document.historyPosition()==history,"Read-only session mutated history");
 host.close(token);token=host.open({"workspace-check",true,false},{"workspace.read","document.read","document.write"},"zh-CN",[](const auto&){});host.setWorkspaceServices(token,extensionWorkspaceServices());
 documentOpen_=false;projects_.clear();require(result("workspace.listProjects").GetArray().Size()==0&&result("workspace.getActiveProject").ValueType()==JsonValueType::Null&&!call("document.getFrames").GetNamedBoolean(L"ok")&&!call("document.undo").GetNamedBoolean(L"ok"),"Empty workspace contract");
 host.close(token);document=Document();refresh();
}
}
