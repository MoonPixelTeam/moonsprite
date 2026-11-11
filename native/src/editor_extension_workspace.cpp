#include "editor.h"
#include "editor_implementation.h"
#include "extension_session_host.h"
#include "extension_native_services.h"

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
 services.tool=[this]()->std::optional<winrt::hstring>{
  if(!documentOpen_)return {};auto id=activeRailTool();
  if(id.rfind("selection.",0)==0)id="selection";
  else if(id.rfind("shape.",0)==0)id="shape";
  else if(id.rfind("line.",0)==0)id="line";
  else if(id.rfind("fill.",0)==0)id="fill";
  else if(id.rfind("move.",0)==0)id="move";
  return workspaceText(id);
 };
 services.setTool=[this](const winrt::hstring& value){
  if(!documentOpen_||pending_!=Pending::None||historyGestureBusy())return;
  const auto id=winrt::to_string(value);
  if(!isToolAvailableForSession(id.c_str()))return;
  if(gradientPending_)return;
  // Runtime selects a tool category, preserving the user's shape/selection
  // subtype. Keyboard focus and home visibility must not swallow API calls.
  const auto current=activeRailTool();
  if(current==id||current.rfind(id+".",0)==0)return;
  struct Scope {bool& home;bool& palette;bool oldHome,oldPalette;~Scope(){home=oldHome;palette=oldPalette;}} scope{homeOpen_,paletteFocused_,homeOpen_,paletteFocused_};
  homeOpen_=false;paletteFocused_=false;
  if(id=="selection")useSelectionTool();
  else if(id=="line")useShapeTool(shapeSpec_.kind==ShapeKind::Curve?ShapeKind::Curve:ShapeKind::Line);
  else if(id=="fill"&&rememberGradientTool_)useGradientTool();
  else runShortcutCommand("tool."+id);
 };
 services.colors=[this]()->std::optional<extension::RuntimeColors>{if(!documentOpen_)return {};auto unpack=[](Pixel value){return extension::RuntimeColor{int(value&255),int((value>>8)&255),int((value>>16)&255),int(value>>24)};};return extension::RuntimeColors{unpack(document.palette().primary),unpack(document.palette().secondary)};};
 auto color=[this](extension::RuntimeColor value,bool secondary){setSharedColor(Pixel(value.r)|(Pixel(value.g)<<8)|(Pixel(value.b)<<16)|(Pixel(value.a)<<24),secondary);refresh();};
 services.setPrimary=[color](auto value){color(value,false);};services.setSecondary=[color](auto value){color(value,true);};
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
 require(document.palette().primary==sharedPrimary_&&document.palette().secondary==sharedSecondary_,"New project shared color inheritance");
 document.addLayer();document.setLayerOpacity(.375);document.setLayerVisible(false);document.addFrame();document.setFrameDuration(170);const auto second=std::to_string(document.identity());
 const auto history=document.historyPosition(),revision=document.contentRevision();
 extension::Storage storage(assets_.parent_path()/("extension-workspace-unused-"+std::to_string(GetCurrentProcessId())+".json"));
 extension::FileDropRouter drops;extension::RuntimeRegistry registry;extension::SessionHost host(storage,drops,registry);
 auto token=host.open({"workspace-check",true,false},{"workspace.read","workspace.write","document.read","document.write","tools"},"zh-CN",[](const auto&){});
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
 // Shared roles reach inactive documents without changing locked palettes/history.
 paletteLocked_=true;const auto colorHistory=document.historyPosition();
 auto setColor=[&](const char* method,Pixel value){JsonObject params;params.Insert(L"color",extension::colorSnapshot({int(value&255),int((value>>8)&255),int((value>>16)&255),int(value>>24)}));return call(method,params);};
 require(setColor("colors.setPrimary",0x80443322).GetNamedBoolean(L"ok")&&setColor("colors.setSecondary",0x99665544).GetNamedBoolean(L"ok"),"Runtime shared color request");
 require(document.palette().primary==0x80443322&&projectDocument(0).palette().primary==0x80443322&&projectDocument(0).palette().secondary==0x99665544&&document.historyPosition()==colorHistory,"Shared color inactive propagation/history");
 require(result("colors.get").GetObject().GetNamedObject(L"primary").GetNamedNumber(L"a")==128,"Runtime color channel order");
 const auto inactiveSecondary=projectDocument(0).palette().secondary;document.selectSecondaryPalette(document.palette().entries.front().id);rememberSelectedColor(true);require(projectDocument(0).palette().secondary==inactiveSecondary&&sharedSecondary_==document.palette().secondary,"Secondary swatch propagated to inactive project");setSharedColor(0x99665544,true);
 document.selectPalette(document.palette().entries.front().id);const auto previousPrimaryId=document.palette().primaryId;
 swapSharedColors();require(document.palette().primary==0x99665544&&projectDocument(0).palette().secondary==0x80443322&&document.palette().secondaryId==previousPrimaryId,"Shared role swap/selection identity");
 const auto preferencePath=assets_.parent_path()/("shared-color-check-"+std::to_string(GetCurrentProcessId())+".json");colorRolesOverride_=preferencePath;flushColorRoles();require(std::filesystem::exists(preferencePath)&&!colorRolesDirty_,"Shared role disk flush");
 sharedPrimary_=0;sharedSecondary_=0;initializeColorRoles();require(sharedPrimary_==0x99665544&&sharedSecondary_==0x80443322&&projectDocument(0).palette().primary==sharedPrimary_,"Shared role reopen");
 {std::ofstream out(preferencePath);out<<R"({"primary":{"r":-4,"g":1.5,"b":"bad","a":999},"secondary":null})";}initializeColorRoles();require(sharedPrimary_==0xffff0200&&sharedSecondary_==0xfff8f4f1,"Shared role channel normalization/defaults");
 {std::ofstream out(preferencePath);out<<"broken";}initializeColorRoles();require(sharedPrimary_==0xffff7929&&sharedSecondary_==0xfff8f4f1,"Shared role corrupt fallback");
 PatternBrush brush;brush.selectionColorMapping=true;brush.width=3;brush.height=1;brush.colors={0xffffffff,0x80000000,0};brush.coverage={255,128,0};pencilImageBrush_=brush;
 setSharedColor(0x80123456,false);require(pencilImageBrush_->paintColors==std::vector<Pixel>({0x80123456,0x80000000|Pixel(sharedSecondary_&0xffffff),0})&&pencilImageBrush_->colors==brush.colors,"Selection brush color/alpha remap");brush.selectionColorMapping=false;pencilImageBrush_=brush;setSharedColor(0xff112233,false);require(pencilImageBrush_->paintColors.empty(),"Regular image brush was recolored");pencilImageBrush_.reset();flushColorRoles();require(!colorRolesDirty_,"Shared role recovery after corrupt read");
 colorRolesOverride_=preferencePath/"blocked.json";setSharedColor(0xff010203,false);flushColorRoles();require(colorRolesDirty_&&status_==U"共享颜色偏好保存失败","Preference failure lost pending value");colorRolesOverride_=preferencePath;flushColorRoles();require(!colorRolesDirty_,"Preference same-instance recovery");
 colorRolesOverride_.clear();
 // Unlocked palette synchronization must update every document independently.
 paletteLocked_=false;syncPaletteColors_=true;applyWorkspacePreferences();
 const auto activeLayer=document.layer().id;document.selectLayer(document.timeline().state().layers.back().id);document.selectPalette(document.palette().entries.front().id);const auto synchronizedColor=document.palette().primary;
 auto& inactive=*projects_.front()->stored;inactive.selectPalette(inactive.palette().entries.front().id);const auto inactiveHistory=inactive.historyPosition();const auto synchronizedHistory=document.historyPosition();
 setSharedColor(0xffabc123,false);require(document.paletteEntry(document.palette().primaryId)->color==0xffabc123&&inactive.paletteEntry(inactive.palette().primaryId)->color==0xffabc123&&document.historyPosition()==synchronizedHistory+1&&inactive.historyPosition()==inactiveHistory+1,"Shared unlocked synchronized palette transaction");
 document.undo();inactive.undo();require(document.palette().primary==synchronizedColor,"Shared synchronized undo");document.selectLayer(activeLayer);paletteLocked_=true;syncPaletteColors_=false;applyWorkspacePreferences();
 // Exercise all public runtime tool categories through authenticated requests.
 document.selectLayer(document.timeline().state().layers.back().id);
 const auto toolHistory=document.historyPosition(),toolRevision=document.contentRevision();
 auto setTool=[&](const char* id){JsonObject params;params.Insert(L"tool",JsonValue::CreateStringValue(workspaceText(id)));return call("tools.setActive",params);};
 for(const auto* id:extension::runtimeToolIds){require(setTool(id).GetNamedBoolean(L"ok"),"Runtime tool request failed");if(result("tools.getActive").GetString()!=workspaceText(id))throw std::runtime_error(std::string("Runtime tool did not reach editor: ")+id+" -> "+activeRailTool());}
 setTool("pencil");document.selectLayer(document.timeline().state().layers.front().id);setTool("airbrush");require(result("tools.getActive").GetString()==L"pencil","Unavailable hidden-layer tool was selected");document.selectLayer(document.timeline().state().layers.back().id);
 require(document.historyPosition()==toolHistory&&document.contentRevision()==toolRevision,"Tool selection changed content/history");
 useSelectionTool(1);setTool("selection");require(activeRailTool()=="selection.ellipse","Same tool reset selection subtype");
 setTool("pencil");document.beginStroke({0,0},0xffabcdef);setTool("eraser");require(document.strokeActive()&&result("tools.getActive").GetString()==L"pencil","Runtime tool cancelled live drawing");document.cancelStroke();
 homeOpen_=true;paletteFocused_=true;setTool("eraser");require(homeOpen_&&paletteFocused_&&result("tools.getActive").GetString()==L"eraser","Home/focus swallowed runtime tool selection");homeOpen_=false;paletteFocused_=false;
 require(!setTool("invalid").GetNamedBoolean(L"ok")&&result("tools.getActive").GetString()==L"eraser","Invalid runtime tool changed editor");
 homeOpen_=true;require(result("document.getSummary").GetObject().GetNamedString(L"id")==workspaceText(second),"Home lost active project");
 auto replacement=host.open({"workspace-check",true,false},{"workspace.read"},"zh-CN",[](const auto&){});
 JsonObject stale;stale.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-request"));stale.Insert(L"requestId",JsonValue::CreateStringValue(L"stale"));stale.Insert(L"method",JsonValue::CreateStringValue(L"document.undo"));
 require(!host.request(token,stale)&&document.historyPosition()==history,"Stale session mutated editor");
 token=replacement;host.setWorkspaceServices(token,extensionWorkspaceServices());require(!setTool("pencil").GetNamedBoolean(L"ok")&&activeRailTool()=="eraser","Missing tools permission changed editor");require(!call("document.undo").GetNamedBoolean(L"ok")&&document.historyPosition()==history,"Read-only session mutated history");
 host.close(token);token=host.open({"workspace-check",true,false},{"workspace.read","document.read","document.write","tools"},"zh-CN",[](const auto&){});host.setWorkspaceServices(token,extensionWorkspaceServices());
 documentOpen_=false;projects_.clear();require(result("workspace.listProjects").GetArray().Size()==0&&result("workspace.getActiveProject").ValueType()==JsonValueType::Null&&!call("document.getFrames").GetNamedBoolean(L"ok")&&!call("document.undo").GetNamedBoolean(L"ok"),"Empty workspace contract");
 require(result("tools.getActive").ValueType()==JsonValueType::Null&&setTool("pencil").GetNamedBoolean(L"ok"),"Empty workspace tool contract");
 host.close(token);token=host.open({"native-services",true,false},{"clipboard","notifications","ui","diagnostics"},"zh-CN",[](const auto&){});
 auto status=[this](const winrt::hstring& value){status_=unicodeText(winrt::to_string(value));invalidate();};
 std::string clipboard="Unicode 剪贴板 😀";bool readOk=true,writeOk=true;int reads=0,writes=0;
 auto services=extension::nativeHostServices(status,[&](std::string& value){++reads;value=clipboard;return readOk;},[&](const std::string& value){++writes;if(writeOk)clipboard=value;return writeOk;});
 diagnostics_->mode(1);host.setServices(token,services);host.setDiagnosticServices(token,extension::nativeDiagnosticServices(diagnostics_,"native-services",status));
 require(result("clipboard.readText").GetString()==workspaceText(clipboard),"Native clipboard UTF8 read");
 JsonObject params;params.Insert(L"text",JsonValue::CreateStringValue(L"new 中文 😀"));require(call("clipboard.writeText",params).GetNamedBoolean(L"ok")&&clipboard=="new 中文 😀","Native clipboard UTF8 write");
 readOk=false;writeOk=false;require(!call("clipboard.readText").GetNamedBoolean(L"ok")&&!call("clipboard.writeText",params).GetNamedBoolean(L"ok")&&clipboard=="new 中文 😀","Clipboard failure falsely succeeded");
 params=JsonObject{};params.Insert(L"message",JsonValue::CreateStringValue(std::wstring(510,L'x')));require(call("notifications.show",params).GetNamedBoolean(L"ok")&&status_==std::u32string(500,U'x'),"Notification limit/status binding");
 params.Insert(L"message",JsonValue::CreateStringValue(L"native extension failure"));params.Insert(L"level",JsonValue::CreateStringValue(L"error"));params.Insert(L"extensionId",JsonValue::CreateStringValue(L"spoofed"));require(call("diagnostics.log",params).GetNamedBoolean(L"ok")&&status_==U"native extension failure","Diagnostic error status binding");
 const auto diagnosticJson=diagnostics_->snapshotJson();require(diagnosticJson.find("native-services")!=std::string::npos&&diagnosticJson.find("spoofed")==std::string::npos&&diagnosticJson.find("native extension failure")!=std::string::npos,"Diagnostic authenticated owner");
 // Read the actual system clipboard without replacing any user data.
 std::string actual;if(clip::get_text(actual))require(extension::nativeHostServices(status).readClipboard()==workspaceText(actual),"Actual native clipboard read");
 host.close(token);token=host.open({"native-services",true,false},{},"zh-CN",[](const auto&){});host.setServices(token,services);const auto readCount=reads,writeCount=writes;require(!call("clipboard.readText").GetNamedBoolean(L"ok")&&!call("clipboard.writeText",params).GetNamedBoolean(L"ok")&&reads==readCount&&writes==writeCount,"Denied clipboard touched native services");
 host.close(token);document=Document();refresh();
}
}
