#include "editor.h"
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
 services.active=[this]()->std::optional<extension::ProjectSummary>{if(!documentOpen_)return {};return summary(currentDocument());};
 services.activate=[this](const winrt::hstring& id){ensureProjects();for(std::size_t i=0;i<projects_.size();++i)if(workspaceText(std::to_string(projectDocument(i).identity()))==id){activateProject(i);return;}throw std::invalid_argument("工程不存在。");};
 services.layers=[this]{std::vector<extension::LayerSummary> result;if(documentOpen_)for(auto it=currentDocument().timeline().state().layers.rbegin();it!=currentDocument().timeline().state().layers.rend();++it)result.push_back({workspaceText(it->id),workspaceText(utf8Text(it->name)),workspaceText(it->blendMode),it->visible,it->opacity});return result;};
 services.frames=[this]{std::vector<extension::FrameSummary> result;if(documentOpen_)for(const auto& frame:currentDocument().timeline().state().frames)result.push_back({workspaceText(frame.id),frame.duration});return result;};
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
  if(id=="selection")useSelectionTool();
  else if(id=="line")useShapeTool(currentTools().shapeKind==ShapeKind::Curve?ShapeKind::Curve:ShapeKind::Line);
  else if(id=="fill"&&currentTools().rememberGradientTool)useGradientTool();
  else runToolCommand("tool."+id);
 };
 services.colors=[this]()->std::optional<extension::RuntimeColors>{if(!documentOpen_)return {};auto unpack=[](Pixel value){return extension::RuntimeColor{int(value&255),int((value>>8)&255),int((value>>16)&255),int(value>>24)};};return extension::RuntimeColors{unpack(currentDocument().palette().primary),unpack(currentDocument().palette().secondary)};};
 auto color=[this](extension::RuntimeColor value,bool secondary){setSharedColor(Pixel(value.r)|(Pixel(value.g)<<8)|(Pixel(value.b)<<16)|(Pixel(value.a)<<24),secondary);refresh();};
 services.setPrimary=[color](auto value){color(value,false);};services.setSecondary=[color](auto value){color(value,true);};
 services.undo=[this]{requestHistoryAction(workspace::HistoryAction::Undo);};
 services.redo=[this]{requestHistoryAction(workspace::HistoryAction::Redo);};
 services.history=[this](bool redo,std::function<bool()> permitted){requestHistoryAction(redo?workspace::HistoryAction::Redo:workspace::HistoryAction::Undo,0,std::move(permitted));};
 return services;
}

void Editor::smokeExtensionWorkspace(){
 using namespace winrt::Windows::Data::Json;
 auto require=[](bool value,const char* error){if(!value)throw std::runtime_error(error);};
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;
 projects_.clear();replaceDocumentForSmoke(Document::withBuiltinPalette(4,3,U"扩展工程一"));ensureProjects();
 currentDocument().beginStroke({0,0},0xff123456);currentDocument().commitStroke();
 useSelectionTool(1);currentTools().selectionMode=2;currentTools().gradientDither=7;currentTools().wandOptions.tolerance=73;currentTools().brushProfiles[0].size=17;currentTools().smoothStrength=63;
 PatternBrush sessionImage;sessionImage.width=2;sessionImage.height=1;sessionImage.colors={0xffffffff,0x80000000};sessionImage.coverage={255,128};sessionImage.selectionColorMapping=true;currentTools().pencilImageBrush=sessionImage;currentTools().pencilImageBrushId="missing-local-resource";
 auto* firstTools=&currentTools();require(firstTools==&projects_.front()->tools,"Active tools are not session-owned before store");
 const auto first=std::to_string(currentDocument().identity());const auto firstHistory=currentDocument().historyPosition();
 const auto toolRoot=assets_.parent_path()/("session-tools-check-"+std::to_string(GetCurrentProcessId()));std::filesystem::create_directories(toolRoot);workspacePresetTestDirectory_=toolRoot;
 {std::ofstream(toolRoot/"brush-profiles.txt")<<"9 42 1 6 75 2";std::ofstream(toolRoot/"smooth-brush-v1.txt")<<"smooth-v1 81 -27 12 1";std::ofstream(toolRoot/"airbrush-options.txt")<<"3 2 45 18 20 64";std::ofstream(toolRoot/"ink-modes.txt")<<"ink-v1 1 1 1 1 1 1 1 1 1";std::ofstream(toolRoot/"magic-eraser-options.txt")<<"1 37 1 7";}
 addProject(Document::withBuiltinPalette(7,5,U"扩展工程二"));
 require(currentDocument().palette().primary==sharedPrimary_&&currentDocument().palette().secondary==sharedSecondary_,"New project shared color inheritance");
 require(activeRailTool()=="pencil","New project did not start with pencil");
 require(&currentTools()==&projects_.back()->tools&&&currentTools()!=firstTools,"New session shares tool ownership");
 firstTools->smoothAngle=-71;require(firstTools->gradientDither==7&&firstTools->pencilImageBrush&&firstTools->pencilImageBrush->colors==sessionImage.colors,"Inactive tool resources lost ownership");
 require(currentTools().brushProfiles[0].size==9&&currentTools().brushProfiles[0].opacity==42&&currentTools().smoothStrength==81&&currentTools().smoothBrush.size==12&&currentTools().smoothAngle==-27&&currentTools().airbrushSettings.scatterRadius==18&&currentTools().syncInkAcrossTools&&currentTools().wandOptions.tolerance==37,"New project did not load persisted tool configuration");
 {std::ofstream(toolRoot/"brush-profiles.txt")<<"broken";std::ofstream(toolRoot/"smooth-brush-v1.txt")<<"broken";}loadSessionToolPreferences(true);require(currentTools().brushProfiles[0].size==1&&currentTools().smoothStrength==50&&currentTools().smoothBrush.size==1,"Invalid preferences inherited previous project values");workspacePresetTestDirectory_.reset();
 useShapeTool(ShapeKind::Ellipse);currentTools().gradientDither=3;currentTools().shapeRadius=19;currentTools().wandOptions.tolerance=22;currentTools().brushProfiles[0].size=5;currentTools().smoothStrength=31;
 currentDocument().addLayer();currentDocument().setLayerOpacity(.375);currentDocument().setLayerVisible(false);currentDocument().addFrame();currentDocument().setFrameDuration(170);const auto second=std::to_string(currentDocument().identity());
 const auto history=currentDocument().historyPosition(),revision=currentDocument().contentRevision();
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
 require(layers.Size()==currentDocument().timeline().state().layers.size()&&layers.GetObjectAt(0).GetNamedString(L"id")==workspaceText(currentDocument().timeline().state().layers.back().id)&&frames.Size()==2&&frames.GetObjectAt(1).GetNamedNumber(L"index")==1&&frames.GetObjectAt(1).GetNamedNumber(L"duration")==currentDocument().timeline().state().frames[1].duration,"Real layer/frame order and values");
 require(layers.GetObjectAt(layers.Size()-1).GetNamedNumber(L"opacity")==.375&&!layers.GetObjectAt(layers.Size()-1).GetNamedBoolean(L"visible")&&frames.GetObjectAt(1).GetNamedNumber(L"duration")==170,"Layer properties/frame duration lost");
 require(currentDocument().historyPosition()==history&&currentDocument().contentRevision()==revision,"Queries mutated document");
 auto activate=[&](const std::string& id){JsonObject params;params.Insert(L"projectId",JsonValue::CreateStringValue(workspaceText(id)));return call("workspace.activateProject",params);};
 require(activate(first).GetNamedBoolean(L"ok")&&std::to_string(currentDocument().identity())==first&&currentDocument().historyPosition()==firstHistory,"Real project activation/history");
 require(activeRailTool()=="selection.ellipse"&&currentTools().selectionMode==2&&currentTools().gradientDither==7&&currentTools().wandOptions.tolerance==73&&currentTools().brushProfiles[0].size==17&&currentTools().smoothStrength==63,"First project tool configuration was not restored");
 require(currentTools().pencilImageBrush&&currentTools().pencilImageBrush->colors==sessionImage.colors&&currentTools().pencilImageBrushId=="missing-local-resource"&&currentTools().pencilImageBrush->paintColors.size()==2,"Project image snapshot was reloaded or lost");
 require(&currentTools()==firstTools&&currentTools().smoothAngle==-71,"Inactive tool mutation was overwritten by restore");
 // Temporary resources stay with their owner without saving/reloading image files.
 {auto previous=currentTools();beginTemporaryBrushCapture();finishTemporaryBrushCapture(SelectionMask{0,0,1,1,{}});
  require(currentTools().temporaryBrushActive&&currentTools().pencilImageBrush,"Session temporary brush fixture");
  const auto temporaryPixels=currentTools().pencilImageBrush->colors;
  require(activate(second).GetNamedBoolean(L"ok")&&!currentTools().temporaryBrushActive,"Temporary brush leaked to another session");
  require(firstTools->temporaryBrushActive&&firstTools->pencilImageBrush->colors==temporaryPixels,"Inactive temporary pixels were cleared");
  require(activate(first).GetNamedBoolean(L"ok")&&currentTools().temporaryBrushActive&&currentTools().pencilImageBrush->colors==temporaryPixels,"Temporary brush round trip changed pixels");
  exitTemporaryBrushCapture();currentTools()=std::move(previous);refresh();}
 require(result("workspace.getActiveProject").GetObject().GetNamedString(L"id")==workspaceText(first),"Live active snapshot");
 require(result("document.undo").ValueType()==JsonValueType::Null&&currentDocument().historyPosition()+1==firstHistory,"Real undo");
 require(result("document.redo").ValueType()==JsonValueType::Null&&currentDocument().historyPosition()==firstHistory&&currentDocument().pixels()[0]==0xff123456,"Real redo pixels");
 // These authenticated requests exercise the production application action,
 // including gesture deferral and revocation after switching to another tab.
 currentPlayback().playing=true;result("document.undo");require(!currentPlayback().playing&&currentDocument().historyPosition()+1==firstHistory,"Runtime undo did not stop playback");result("document.redo");
 currentDocument().beginStroke({1,1},0xffabcdef);const auto beforeGesture=currentDocument().historyPosition();
 result("document.undo");require(currentDocument().strokeActive()&&currentDocument().historyPosition()==beforeGesture&&historyCommands_.pending(),"Runtime undo cancelled a live gesture");
 currentDocument().commitStroke();applyDeferredHistoryPosition();require(currentDocument().historyPosition()==beforeGesture&&!historyCommands_.pending()&&!currentDocument().pixels()[5],"Deferred runtime undo missed committed gesture");
 result("document.redo");require(currentDocument().pixels()[5]==0xffabcdef,"Runtime redo lost deferred stroke");result("document.undo");
 currentDocument().beginStroke({2,1},0xff445566);result("document.undo");
 require(activate(second).GetNamedBoolean(L"ok"),"Switch with deferred runtime undo");const auto otherHistory=currentDocument().historyPosition();applyDeferredHistoryPosition();
 require(currentDocument().historyPosition()==otherHistory&&!historyCommands_.pending(),"Deferred runtime undo reached another project");
 require(activate(first).GetNamedBoolean(L"ok")&&currentDocument().historyPosition()==firstHistory,"Stale runtime undo survived reactivation");
 require(!activate("missing").GetNamedBoolean(L"ok")&&std::to_string(currentDocument().identity())==first,"Invalid activation changed session");
 require(activate(second).GetNamedBoolean(L"ok")&&currentDocument().historyPosition()==history,"Other session history changed");
 require(activeRailTool()=="shape.ellipse"&&currentTools().shapeRadius==19&&currentTools().gradientDither==3&&currentTools().wandOptions.tolerance==22&&currentTools().brushProfiles[0].size==5&&currentTools().smoothStrength==31,"Second project tool configuration was not restored");
 // Shared roles reach inactive documents without changing locked palettes/history.
 paletteLocked_=true;const auto colorHistory=currentDocument().historyPosition();
 auto setColor=[&](const char* method,Pixel value){JsonObject params;params.Insert(L"color",extension::colorSnapshot({int(value&255),int((value>>8)&255),int((value>>16)&255),int(value>>24)}));return call(method,params);};
 require(setColor("colors.setPrimary",0x80443322).GetNamedBoolean(L"ok")&&setColor("colors.setSecondary",0x99665544).GetNamedBoolean(L"ok"),"Runtime shared color request");
 require(currentDocument().palette().primary==0x80443322&&projectDocument(0).palette().primary==0x80443322&&projectDocument(0).palette().secondary==0x99665544&&currentDocument().historyPosition()==colorHistory,"Shared color inactive propagation/history");
 require(result("colors.get").GetObject().GetNamedObject(L"primary").GetNamedNumber(L"a")==128,"Runtime color channel order");
 const auto inactiveSecondary=projectDocument(0).palette().secondary;currentDocument().selectSecondaryPalette(currentDocument().palette().entries.front().id);rememberSelectedColor(true);require(projectDocument(0).palette().secondary==inactiveSecondary&&sharedSecondary_==currentDocument().palette().secondary,"Secondary swatch propagated to inactive project");setSharedColor(0x99665544,true);
 currentDocument().selectPalette(currentDocument().palette().entries.front().id);const auto previousPrimaryId=currentDocument().palette().primaryId;
 swapSharedColors();require(currentDocument().palette().primary==0x99665544&&projectDocument(0).palette().secondary==0x80443322&&currentDocument().palette().secondaryId==previousPrimaryId,"Shared role swap/selection identity");
 const auto preferencePath=assets_.parent_path()/("shared-color-check-"+std::to_string(GetCurrentProcessId())+".json");colorRolesOverride_=preferencePath;flushColorRoles();require(std::filesystem::exists(preferencePath)&&!colorRolesDirty_,"Shared role disk flush");
 sharedPrimary_=0;sharedSecondary_=0;initializeColorRoles();require(sharedPrimary_==0x99665544&&sharedSecondary_==0x80443322&&projectDocument(0).palette().primary==sharedPrimary_,"Shared role reopen");
 {std::ofstream out(preferencePath);out<<R"({"primary":{"r":-4,"g":1.5,"b":"bad","a":999},"secondary":null})";}initializeColorRoles();require(sharedPrimary_==0xffff0200&&sharedSecondary_==0xfff8f4f1,"Shared role channel normalization/defaults");
 {std::ofstream out(preferencePath);out<<"broken";}initializeColorRoles();require(sharedPrimary_==0xffff7929&&sharedSecondary_==0xfff8f4f1,"Shared role corrupt fallback");
 PatternBrush brush;brush.selectionColorMapping=true;brush.width=3;brush.height=1;brush.colors={0xffffffff,0x80000000,0};brush.coverage={255,128,0};currentTools().pencilImageBrush=brush;
 setSharedColor(0x80123456,false);require(currentTools().pencilImageBrush->paintColors==std::vector<Pixel>({0x80123456,0x80000000|Pixel(sharedSecondary_&0xffffff),0})&&currentTools().pencilImageBrush->colors==brush.colors,"Selection brush color/alpha remap");brush.selectionColorMapping=false;currentTools().pencilImageBrush=brush;setSharedColor(0xff112233,false);require(currentTools().pencilImageBrush->paintColors.empty(),"Regular image brush was recolored");currentTools().pencilImageBrush.reset();flushColorRoles();require(!colorRolesDirty_,"Shared role recovery after corrupt read");
 colorRolesOverride_=preferencePath/"blocked.json";setSharedColor(0xff010203,false);flushColorRoles();require(colorRolesDirty_&&status_==U"共享颜色偏好保存失败","Preference failure lost pending value");colorRolesOverride_=preferencePath;flushColorRoles();require(!colorRolesDirty_,"Preference same-instance recovery");
 colorRolesOverride_.clear();
 // Unlocked palette synchronization must update every document independently.
 paletteLocked_=false;syncPaletteColors_=true;applyWorkspacePreferences();
 const auto activeLayer=currentDocument().layer().id;currentDocument().selectLayer(currentDocument().timeline().state().layers.back().id);currentDocument().selectPalette(currentDocument().palette().entries.front().id);const auto synchronizedColor=currentDocument().palette().primary;
 auto& inactive=*projects_.front()->value;inactive.selectPalette(inactive.palette().entries.front().id);const auto inactiveHistory=inactive.historyPosition();const auto synchronizedHistory=currentDocument().historyPosition();
 setSharedColor(0xffabc123,false);require(currentDocument().paletteEntry(currentDocument().palette().primaryId)->color==0xffabc123&&inactive.paletteEntry(inactive.palette().primaryId)->color==0xffabc123&&currentDocument().historyPosition()==synchronizedHistory+1&&inactive.historyPosition()==inactiveHistory+1,"Shared unlocked synchronized palette transaction");
 currentDocument().undo();inactive.undo();require(currentDocument().palette().primary==synchronizedColor,"Shared synchronized undo");currentDocument().selectLayer(activeLayer);paletteLocked_=true;syncPaletteColors_=false;applyWorkspacePreferences();
 // Exercise all public runtime tool categories through authenticated requests.
 currentDocument().selectLayer(currentDocument().timeline().state().layers.back().id);
 const auto toolHistory=currentDocument().historyPosition(),toolRevision=currentDocument().contentRevision();
 auto setTool=[&](const char* id){JsonObject params;params.Insert(L"tool",JsonValue::CreateStringValue(workspaceText(id)));return call("tools.setActive",params);};
 for(const auto* id:extension::runtimeToolIds){require(setTool(id).GetNamedBoolean(L"ok"),"Runtime tool request failed");if(result("tools.getActive").GetString()!=workspaceText(id))throw std::runtime_error(std::string("Runtime tool did not reach editor: ")+id+" -> "+activeRailTool());}
 setTool("pencil");currentDocument().selectLayer(currentDocument().timeline().state().layers.front().id);setTool("airbrush");require(result("tools.getActive").GetString()==L"pencil","Unavailable hidden-layer tool was selected");currentDocument().selectLayer(currentDocument().timeline().state().layers.back().id);
 require(currentDocument().historyPosition()==toolHistory&&currentDocument().contentRevision()==toolRevision,"Tool selection changed content/history");
 useSelectionTool(1);setTool("selection");require(activeRailTool()=="selection.ellipse","Same tool reset selection subtype");
 setTool("pencil");currentDocument().beginStroke({0,0},0xffabcdef);setTool("eraser");require(currentDocument().strokeActive()&&result("tools.getActive").GetString()==L"pencil","Runtime tool cancelled live drawing");currentDocument().cancelStroke();
 homeOpen_=true;paletteFocused_=true;setTool("eraser");require(homeOpen_&&paletteFocused_&&result("tools.getActive").GetString()==L"eraser","Home/focus swallowed runtime tool selection");homeOpen_=false;paletteFocused_=false;
 require(!setTool("invalid").GetNamedBoolean(L"ok")&&result("tools.getActive").GetString()==L"eraser","Invalid runtime tool changed editor");
 homeOpen_=true;require(result("document.getSummary").GetObject().GetNamedString(L"id")==workspaceText(second),"Home lost active project");
 currentDocument().beginStroke({1,0},0xff445566);result("document.undo");require(historyCommands_.pending(),"Authorized runtime history did not queue");const auto revokedHistory=currentDocument().historyPosition();
 auto replacement=host.open({"workspace-check",true,false},{"workspace.read"},"zh-CN",[](const auto&){});
 currentDocument().cancelStroke();applyDeferredHistoryPosition();require(currentDocument().historyPosition()==revokedHistory&&!historyCommands_.pending(),"Revoked extension session applied queued history");
 JsonObject stale;stale.Insert(L"type",JsonValue::CreateStringValue(L"moonsprite-extension-request"));stale.Insert(L"requestId",JsonValue::CreateStringValue(L"stale"));stale.Insert(L"method",JsonValue::CreateStringValue(L"document.undo"));
 require(!host.request(token,stale)&&currentDocument().historyPosition()==history,"Stale session mutated editor");
 token=replacement;host.setWorkspaceServices(token,extensionWorkspaceServices());require(!setTool("pencil").GetNamedBoolean(L"ok")&&activeRailTool()=="eraser","Missing tools permission changed editor");require(!call("document.undo").GetNamedBoolean(L"ok")&&currentDocument().historyPosition()==history,"Read-only session mutated history");
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
 host.close(token);replaceDocumentForSmoke(Document());refresh();
}
}
