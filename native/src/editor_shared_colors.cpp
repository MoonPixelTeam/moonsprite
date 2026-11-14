#include "editor.h"
#include "selection_pattern_brush.h"
#include "atomic_file.h"
#include <winrt/Windows.Data.Json.h>

namespace moon::editor {
void Editor::initializeColorRoles(){
 using namespace winrt::Windows::Data::Json;
 const auto path=colorRolesOverride_.empty()?palettePreferencePath().parent_path()/"color-roles-v1.json":colorRolesOverride_;
 sharedPrimary_=0xffff7929;sharedSecondary_=0xfff8f4f1;
 try{if(std::filesystem::exists(path)){
  if(std::filesystem::file_size(path)>65536)throw std::runtime_error("Color preferences exceed limit");
  std::ifstream in(path,std::ios::binary);if(!in)throw std::runtime_error("Cannot read color preferences");std::string encoded((std::istreambuf_iterator<char>(in)),{});
  auto root=JsonObject::Parse(winrt::to_hstring(encoded));
  auto read=[&](const wchar_t* name,Pixel fallback){if(!root.HasKey(name)||root.GetNamedValue(name).ValueType()!=JsonValueType::Object)return fallback;auto object=root.GetNamedObject(name);const wchar_t* keys[]={L"r",L"g",L"b",L"a"};Pixel result=0;for(int i=0;i<4;++i){double value=(fallback>>(i*8))&255;if(object.HasKey(keys[i])&&object.GetNamedValue(keys[i]).ValueType()==JsonValueType::Number){auto n=object.GetNamedNumber(keys[i]);if(std::isfinite(n))value=std::clamp(std::floor(n+.5),0.,255.);}result|=Pixel(value)<<(i*8);}return result;};
  sharedPrimary_=read(L"primary",sharedPrimary_);sharedSecondary_=read(L"secondary",sharedSecondary_);
 }}catch(...){/* Legacy readStoredJson falls back without changing documents. */}
 if(!colorRolesReady_)colorRolesTimer_.Tick.connect([this]{colorRolesTimer_.stop();flushColorRoles();});
 colorRolesReady_=true;colorRolesDirty_=false;
 currentDocument().setPaletteRole(sharedPrimary_,false,true);currentDocument().setPaletteRole(sharedSecondary_,true,true);
 for(auto& slot:projects_)if(slot->value&&slot->value!=activeDocument_){slot->value->setPaletteRole(sharedPrimary_,false,true);slot->value->setPaletteRole(sharedSecondary_,true,true);}
}
void Editor::flushColorRoles(){
 if(!colorRolesDirty_||!colorRolesReady_)return;colorRolesTimer_.stop();
 if(smoke_&&colorRolesOverride_.empty()){colorRolesDirty_=false;return;}
 try{using namespace winrt::Windows::Data::Json;auto encoded=[](Pixel value){JsonObject object;const wchar_t* keys[]={L"r",L"g",L"b",L"a"};for(int i=0;i<4;++i)object.Insert(keys[i],JsonValue::CreateNumberValue((value>>(i*8))&255));return object;};JsonObject root;root.Insert(L"primary",encoded(sharedPrimary_));root.Insert(L"secondary",encoded(sharedSecondary_));const auto bytes=winrt::to_string(root.Stringify());const auto path=colorRolesOverride_.empty()?palettePreferencePath().parent_path()/"color-roles-v1.json":colorRolesOverride_;std::filesystem::create_directories(path.parent_path());writeBinaryFileAtomic(path,{bytes.begin(),bytes.end()});colorRolesDirty_=false;
 }catch(...){status_=U"共享颜色偏好保存失败";}
}
void Editor::setSharedColor(Pixel color,bool secondary){
 (secondary?sharedSecondary_:sharedPrimary_)=color;colorRolesReady_=true;
 if(documentOpen_)currentDocument().setPaletteRole(color,secondary,paletteLocked_);
 for(auto& slot:projects_)if(slot->value&&slot->value!=activeDocument_)slot->value->setPaletteRole(color,secondary,paletteLocked_);
 remapSelectionPatternBrush(currentTools().pencilImageBrush,currentDocument().palette().primary,currentDocument().palette().secondary);for(auto& slot:projects_)if(slot->value&&slot->value!=activeDocument_&&(slot->tools.temporaryBrushCapture||slot->tools.temporaryBrushActive))remapSelectionPatternBrush(slot->tools.pencilImageBrush,slot->value->palette().primary,slot->value->palette().secondary);
 colorRolesDirty_=true;colorRolesTimer_.stop();colorRolesTimer_.start();
}
void Editor::rememberSelectedColor(bool secondary){
 if(!documentOpen_)return;
 if(secondary){sharedSecondary_=currentDocument().palette().secondary;colorRolesDirty_=true;colorRolesTimer_.stop();colorRolesTimer_.start();}
 else if(currentDocument().palette().primaryId!=EmptyPaletteSlot)setSharedColor(currentDocument().palette().primary,false);
}
void Editor::swapSharedColors(){
 std::swap(sharedPrimary_,sharedSecondary_);
 auto apply=[&](Document& value){value.swapPaletteRoles(sharedPrimary_,sharedSecondary_);};
 if(documentOpen_)apply(currentDocument());for(auto& slot:projects_)if(slot->value&&slot->value!=activeDocument_)apply(*slot->value);
 remapSelectionPatternBrush(currentTools().pencilImageBrush,currentDocument().palette().primary,currentDocument().palette().secondary);for(auto& slot:projects_)if(slot->value&&slot->value!=activeDocument_&&(slot->tools.temporaryBrushCapture||slot->tools.temporaryBrushActive))remapSelectionPatternBrush(slot->tools.pencilImageBrush,slot->value->palette().primary,slot->value->palette().secondary);
 colorRolesDirty_=true;colorRolesTimer_.stop();colorRolesTimer_.start();
}
}
