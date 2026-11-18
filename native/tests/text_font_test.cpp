#include "text_font_service.h"
#include <chrono>
#include <algorithm>
#include <windows.h>
#include <iostream>
#include <fstream>
#include <iomanip>
#include <map>
#include <stdexcept>
#define CHECK(...) do{if(!(__VA_ARGS__))throw std::runtime_error(#__VA_ARGS__);}while(false)
using namespace moon;
int wmain(int argc,wchar_t** argv){try{
 CHECK(argc==3);const std::filesystem::path bundled=std::filesystem::path(argv[1]),base=std::filesystem::path(argv[2]);const auto run=base/("text-font-test-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));std::filesystem::create_directories(run);const auto library=run/"Font",settings=run/"preferences"/"fonts.txt";TextFontService fonts(library,bundled,settings);auto options=fonts.catalog();CHECK(options.size()>=4);CHECK(options[0].family==defaultTextFontFamily&&options[0].builtIn&&!options[0].imported);CHECK(options[1].family=="Silkscreen"&&options[2].family=="Tiny5");auto provider=fonts.provider();for(const auto* family:{defaultTextFontFamily,"Silkscreen","Tiny5"}){auto g=provider(family,10,U'A',192);CHECK(g&&g->width>0&&g->height>0&&g->alpha.size()==std::size_t(g->width)*g->height);for(auto alpha:g->alpha)CHECK(alpha==0||alpha==255);auto smooth=provider(family,10,U'A',1);CHECK(smooth&&smooth->width>0);}CHECK(!provider(defaultTextFontFamily,10,U' ',192));CHECK(!fonts.systemFamilies().empty());bool protectedBuiltin=false;try{fonts.erase(defaultTextFontFamily);}catch(const std::exception&){protectedBuiltin=true;}CHECK(protectedBuiltin);
 fonts.recordSize(17);fonts.recordUsage("Tiny5");CHECK(fonts.catalog().front().family=="Tiny5");TextFontService restored(library,bundled,settings);CHECK(restored.lastSize()==17&&restored.catalog().front().family=="Tiny5");const auto local=run/"fixture.ttf";std::filesystem::copy_file(bundled/"moonsprite-builtin-silkscreen-regular.ttf",local);auto imported=restored.importFile(local);CHECK(imported.imported&&!imported.builtIn&&std::filesystem::is_regular_file(imported.file));CHECK(restored.importFile(local).file==imported.file);auto present=[&]{auto catalog=restored.catalog();return std::any_of(catalog.begin(),catalog.end(),[&](const auto& option){return option.id==imported.id;});};
 auto blocked=CreateFileW(imported.file.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);CHECK(blocked!=INVALID_HANDLE_VALUE);bool failed=false;try{restored.erase(imported.id);}catch(const std::exception&){failed=true;}CloseHandle(blocked);CHECK(failed&&present()&&std::filesystem::exists(imported.file));
 std::filesystem::remove(imported.file);failed=false;try{restored.erase(imported.id);}catch(const std::exception&){failed=true;}CHECK(failed&&present());
 std::filesystem::copy_file(local,imported.file);restored.erase(imported.id);CHECK(!std::filesystem::exists(imported.file)&&!present());
 // list_fonts sorts by family/id before uniqueOptions chooses the first.
 {const auto collisionLibrary=run/"collision-library";TextFontService collision(collisionLibrary,bundled,run/"collision-preferences"/"fonts.txt");
  const auto late=run/"zzz-silkscreen.ttf";std::filesystem::copy_file(local,late);const auto lateFont=collision.importFile(late);
  auto selected=[&](TextFontService& service){const auto list=service.catalog();auto found=std::find_if(list.begin(),list.end(),[](const auto& f){return f.family=="Silkscreen";});CHECK(found!=list.end());return *found;};
  CHECK(selected(collision).builtIn&&selected(collision).id!=lateFont.id);
  const auto early=run/"aaa-silkscreen.ttf";std::filesystem::copy_file(local,early);const auto earlyFont=collision.importFile(early);CHECK(selected(collision).id==earlyFont.id&&selected(collision).imported);
  TextFontService collisionReload(collisionLibrary,bundled,run/"collision-preferences"/"fonts.txt");CHECK(selected(collisionReload).id==earlyFont.id);collisionReload.erase(earlyFont.id);CHECK(selected(collisionReload).builtIn);
 }
 // Real system-font imports reuse persistent bytes and collection face.
 const auto systemFamily=fonts.systemFamilies().front();const auto system=restored.importSystem(systemFamily);CHECK(system.imported&&std::filesystem::is_regular_file(system.file));
 auto fontFileCount=[&]{std::size_t count=0;for(const auto& entry:std::filesystem::directory_iterator(library))if(entry.is_regular_file())++count;return count;};
 const auto fileCount=fontFileCount();const auto repeated=restored.importSystem(systemFamily);CHECK(repeated.id==system.id&&repeated.file==system.file&&repeated.faceIndex==system.faceIndex&&fontFileCount()==fileCount);
 TextFontService reopened(library,bundled,settings);const auto persisted=reopened.importSystem(systemFamily);CHECK(persisted.id==system.id&&persisted.faceIndex==system.faceIndex&&fontFileCount()==fileCount);
 reopened.erase(persisted.id);CHECK(!std::filesystem::exists(system.file));const auto reimported=reopened.importSystem(systemFamily);CHECK(std::filesystem::is_regular_file(reimported.file)&&reimported.faceIndex==system.faceIndex);
 // Legacy usage keys trim ECMAScript whitespace and lowercase Unicode.
 reopened.recordUsage(u8"\u00a0\u00c9COLE\u3000");reopened.recordUsage(u8"\u00e9cole");
 std::ifstream preferenceFile(settings);std::string header;std::getline(preferenceFile,header);int lastSize=0;preferenceFile>>lastSize;std::map<std::string,int> counts;std::string key;int count=0;while(preferenceFile>>std::quoted(key)>>count)counts[key]=count;
 CHECK(counts[u8"\u00e9cole"]==2&&counts.count(u8"\u00a0\u00c9COLE\u3000")==0);preferenceFile.close();
 TextFontService unicodeReload(library,bundled,settings);unicodeReload.recordUsage(u8"\u00c9cole");
 std::ifstream reloadedPreferences(settings);std::getline(reloadedPreferences,header);reloadedPreferences>>lastSize;counts.clear();while(reloadedPreferences>>std::quoted(key)>>count)counts[key]=count;CHECK(counts[u8"\u00e9cole"]==3);
 std::cout<<"Native font decoding/threshold/import/preferences fixtures passed; scratch: "<<run.u8string()<<"\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
