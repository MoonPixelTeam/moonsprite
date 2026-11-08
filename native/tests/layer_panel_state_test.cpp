#define NOMINMAX
#include "layer_panel_storage.h"
#include "document_snapshot.h"
#include "project_encode.h"
#include "project_import.h"
#include <filesystem>
#include <fstream>
#include <iostream>
using namespace moon;
using namespace moon::paneljson;
static void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
static std::vector<std::string> ids(const JsonObject& o,const wchar_t* key){std::vector<std::string> result;for(const auto& id:o.GetNamedArray(key))result.push_back(winrt::to_string(id.GetString()));return result;}
int wmain(int argc,wchar_t** argv){try{
 winrt::init_apartment(winrt::apartment_type::multi_threaded);check(argc==2,"Expected actual legacy oracle");std::ifstream file(std::filesystem::path(argv[1]),std::ios::binary);check(bool(file),"Missing oracle");const auto oracle=JsonObject::Parse(winrt::to_hstring(std::string(std::istreambuf_iterator<char>(file),{})));
 for(const auto& item:oracle.GetNamedArray(L"cases")){const auto c=item.GetObject();const auto active=winrt::to_string(c.GetNamedString(L"active"));const auto result=normalizeLayerPanelState(ids(c,L"layers"),ids(c,L"groups"),active,decode(c.GetNamedValue(L"value"),active));check(result==decode(c.GetNamedValue(L"expected"),active),"Legacy normalization mismatch");}
 JsonObject store;for(const auto& item:oracle.GetNamedArray(L"operations")){const auto op=item.GetObject();remember(store,winrt::to_string(op.GetNamedString(L"path")),decode(op.GetNamedValue(L"state"),"a"),op.GetNamedNumber(L"now"));}
 const auto expectedEntries=oracle.GetNamedObject(L"stored").GetNamedArray(L"entries"),entries=store.GetNamedArray(L"entries");check(entries.Size()==expectedEntries.Size(),"Legacy storage bound mismatch");for(unsigned i=0;i<entries.Size();++i){const auto a=entries.GetObjectAt(i),b=expectedEntries.GetObjectAt(i);check(a.GetNamedString(L"filePath")==b.GetNamedString(L"filePath")&&a.GetNamedNumber(L"updatedAt")==b.GetNamedNumber(L"updatedAt")&&decode(a.GetNamedValue(L"state"),"a")==decode(b.GetNamedValue(L"state"),"a"),"Legacy bounded storage order/path replacement mismatch");}
 for(const auto& item:oracle.GetNamedArray(L"lookups")){const auto op=item.GetObject();const auto state=storedState(store,winrt::to_string(op.GetNamedString(L"path")));const auto expected=op.GetNamedValue(L"expected");check(bool(state)==(expected.ValueType()!=JsonValueType::Null),"Legacy path lookup mismatch");if(state)check(decode(state,"a")==decode(expected,"a"),"Local state override mismatch");}
 Document d(4,2);d.addLayer();const auto a=d.timeline().state().layers.front().id,b=d.timeline().state().layers.back().id;check(d.createLayerGroup(),"Cannot create fixture group");const auto group=d.timeline().state().groups.front().id;d.markSaved();
 LayerPanelState panel;panel.activeLayerId=b;panel.selectedLayerIds={b,a,b,"bad"};panel.selectedGroupIds={group,group};panel.selectedGroupId=group;panel.layerSelectionAnchorId=a;panel.collapsedGroupIds={group,"bad",group};const auto revision=d.revision(),content=d.contentRevision(),history=d.historySize();d.applyLayerPanelState(panel);panel=d.layerPanelState();
 check(!d.dirty()&&d.revision()==revision&&d.contentRevision()==content&&d.historySize()==history,"Panel navigation changed content/dirty/history");check(panel.selectedLayerIds==std::vector<std::string>{b,a}&&panel.selectedGroupId==group&&panel.collapsedGroupIds==std::vector<std::string>{group},"Mixed selection/focus/collapse lost");
 DocumentSnapshot snapshot(d);while(!snapshot.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(1))){}auto copy=snapshot.finish();check(copy.layerPanelState()==panel,"Worker snapshot lost panel metadata");
 for(const auto bytes:{project::encodeEditableProject(copy).bytes,project::encodeRecoveryProject(copy).bytes,project::encodeHistoryProject(copy).bytes}){
  const auto manifest=project::readProjectManifest(bytes);check(manifest.layerPanelState==panel,"Archive decode lost panel state");auto restored=project::createEditableDocument(project::prepareEditableImport(manifest));check(restored.layerPanelState()==panel&&!restored.dirty()&&restored.historySize()==0,"Open/recovery/history changed panel selection");
  restored.toggleGroupCollapsed(group);auto changed=restored.layerPanelState();check(changed.collapsedGroupIds.empty(),"Cannot expand imported group");const auto reopened=project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(project::encodeEditableProject(restored).bytes)));check(reopened.layerPanelState()==changed,"Source archive retained stale panel JSON");
 }
 DocumentSnapshot stale(d);d.toggleGroupCollapsed(group);check(!stale.matches(d),"Unrevisioned panel change admitted during snapshot");
 check(pathKey("C:\\ÄBC\\图.moonsprite")==pathKey(" c:/äbc/图.moonsprite "),"Unicode/case/separator/trim path identity lost");
 std::cout<<"Actual legacy normalization/storage, archive/recovery/history/snapshot and clean navigation checks passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
