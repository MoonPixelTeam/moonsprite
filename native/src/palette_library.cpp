#include "palette_library.h"
#include "palette_import.h"
#include "image_export.h"
#include <windows.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <fstream>
#include <algorithm>
#include <chrono>
#include <cmath>
#include <set>
#include <iomanip>
#include <sstream>
namespace moon {namespace {
using namespace winrt::Windows::Data::Json;
struct Apartment {HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);~Apartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
bool validId(const std::string& id){return !id.empty()&&id.size()<=96&&std::all_of(id.begin(),id.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='-'||c=='_';});}
bool rustSpace(wchar_t c){return (c>=9&&c<=13)||c==32||c==0x85||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000;}
std::string trimmedName(const std::string& text){const auto wide=winrt::to_hstring(text);const std::wstring s(wide);const auto first=std::find_if_not(s.begin(),s.end(),rustSpace),last=std::find_if_not(s.rbegin(),s.rend(),rustSpace).base();return first<last?winrt::to_string(std::wstring(first,last)):std::string{};}
bool present(JsonObject root,const wchar_t* key){return root.HasKey(key)&&root.GetNamedValue(key).ValueType()!=JsonValueType::Null;}
int integer(IJsonValue v,int maximum){if(v.ValueType()!=JsonValueType::Number)throw std::runtime_error("Invalid palette integer");auto n=v.GetNumber();if(!std::isfinite(n)||n<0||n>maximum||n!=std::floor(n))throw std::runtime_error("Invalid palette integer");return int(n);}
std::string read(const std::filesystem::path& path){const auto bytes=readPaletteImportBytes(path);return {bytes.begin(),bytes.end()};}
std::set<std::string> builtinIds(const std::filesystem::path& directory){
 // Legacy reserves DEFAULT_PALETTES file stems independently of whether a
 // same-id user file is readable. Native keeps these resources in assets.
 std::set<std::string> ids;if(directory.empty()||!std::filesystem::exists(directory))return ids;
 for(const auto& entry:std::filesystem::directory_iterator(directory))if(entry.is_regular_file()&&nativePalettePath(entry.path())){auto name=entry.path().filename().u8string();name.resize(name.size()-13);ids.insert(std::move(name));}return ids;
}
void validateLayout(const StoredPalette& p){if(p.columns){if(p.columns<1||p.columns>256||p.slots.size()>1048576||p.slots.size()%p.columns)throw std::runtime_error("Invalid palette layout");std::vector<bool> seen(p.colors.size());for(auto cell:p.slots)if(cell){if(*cell>=seen.size()||seen[*cell])throw std::runtime_error("Invalid palette slot reference");seen[*cell]=true;}if(std::find(seen.begin(),seen.end(),false)!=seen.end())throw std::runtime_error("Palette color missing from layout");}}
void validate(const StoredPalette& p){if(!validId(p.id)||trimmedName(p.name).empty())throw std::runtime_error("Invalid palette identity");validateLayout(p);}
}
StoredPalette decodeStoredPalette(const std::string& text){if(text.size()>64u*1024*1024)throw std::runtime_error("Palette exceeds 64 MiB");try{Apartment apartment;if(!paletteJsonNativeLexicalShape(text))throw std::runtime_error("Invalid native palette JSON fields");auto root=JsonObject::Parse(winrt::to_hstring(text));StoredPalette p;int version=integer(root.GetNamedValue(L"schemaVersion"),2);if(version<1)throw std::runtime_error("Unsupported palette schema");p.id=winrt::to_string(root.GetNamedString(L"id"));p.name=winrt::to_string(root.GetNamedString(L"name"));for(auto v:root.GetNamedArray(L"colors")){auto s=winrt::to_string(v.GetString());if(!s.empty()&&s[0]=='#')s.erase(s.begin());if(s.size()!=6&&s.size()!=8)throw std::runtime_error("Invalid palette color");const bool alpha=s.size()==8;if(s.front()=='+')s.erase(s.begin());if(s.find_first_not_of("0123456789abcdefABCDEF")!=std::string::npos)throw std::runtime_error("Invalid palette color");auto n=std::stoul(s,nullptr,16);if(!alpha)n=(n<<8)|255;p.colors.push_back(((n>>24)&255)|((n>>8)&0xff00)|((n<<8)&0xff0000)|((n<<24)&0xff000000));}
 if(version==1){if(present(root,L"columns")||present(root,L"slots"))throw std::runtime_error("Schema1 cannot contain layout");}else{p.columns=integer(root.GetNamedValue(L"columns"),256);if(!p.columns)throw std::runtime_error("Invalid palette columns");const auto layout=root.GetNamedArray(L"slots");if(layout.Size()>1048576)throw std::runtime_error("Invalid palette slot count");p.slots.reserve(layout.Size());for(auto v:layout){if(v.ValueType()==JsonValueType::Null)p.slots.push_back({});else p.slots.push_back(std::size_t(integer(v,1048575)));}}
 if(present(root,L"names")){p.names.emplace();for(auto v:root.GetNamedArray(L"names"))p.names->push_back(winrt::to_string(v.GetString()));}validate(p);return p;}catch(const winrt::hresult_error& e){throw std::runtime_error(winrt::to_string(e.message()));}}
std::string encodeStoredPalette(const StoredPalette& p){validate(p);if(!p.columns)throw std::runtime_error("Saving requires schema2 layout");Apartment apartment;JsonObject root;root.SetNamedValue(L"schemaVersion",JsonValue::CreateNumberValue(2));root.SetNamedValue(L"id",JsonValue::CreateStringValue(winrt::to_hstring(p.id)));root.SetNamedValue(L"name",JsonValue::CreateStringValue(winrt::to_hstring(p.name)));JsonArray colors,slots,names;for(auto c:p.colors){std::ostringstream out;out<<'#'<<std::uppercase<<std::hex<<std::setfill('0');for(int shift:{0,8,16,24})out<<std::setw(2)<<((c>>shift)&255);colors.Append(JsonValue::CreateStringValue(winrt::to_hstring(out.str())));}root.SetNamedValue(L"colors",colors);root.SetNamedValue(L"columns",JsonValue::CreateNumberValue(p.columns));for(auto cell:p.slots)slots.Append(cell?JsonValue::CreateNumberValue(double(*cell)):JsonValue::CreateNullValue());root.SetNamedValue(L"slots",slots);if(p.names){for(auto& name:*p.names)names.Append(JsonValue::CreateStringValue(winrt::to_hstring(name)));root.SetNamedValue(L"names",names);}return winrt::to_string(root.Stringify());}
std::vector<StoredPalette> PaletteLibrary::list()const{
 std::vector<StoredPalette> out;std::set<std::string> ids;const auto reserved=builtinIds(builtins_);
 for(bool builtin:{true,false}){auto directory=builtin?builtins_:directory_;if(directory.empty()||!std::filesystem::exists(directory))continue;std::vector<std::filesystem::path> paths;for(auto& file:std::filesystem::directory_iterator(directory))if(file.is_regular_file())paths.push_back(file.path());std::sort(paths.begin(),paths.end());
  for(bool native:{true,false}){if(builtin&&!native)continue;for(auto& path:paths){if(nativePalettePath(path)!=native||(!native&&!supportedPaletteImportPath(path)))continue;try{auto p=native?decodeStoredPalette(read(path)):decodeImportedPalette(readPaletteImportBytes(path),path);p.path=path;p.builtIn=builtin;if(!native)p.id=externalPaletteId(path);if(!builtin&&reserved.count(p.id))continue;if(ids.insert(p.id).second)out.push_back(std::move(p));}catch(const std::exception& error){if(builtin)throw std::runtime_error("Cannot load built-in palette "+path.u8string()+": "+error.what());/* legacy isolates malformed user files */}}}
 }
 std::sort(out.begin(),out.end(),[](auto& a,auto& b){if(a.builtIn!=b.builtIn)return a.builtIn>b.builtIn;return a.name==b.name?a.id<b.id:a.name<b.name;});return out;
}
StoredPalette PaletteLibrary::save(StoredPalette p,const std::string& currentId)const{p.name=trimmedName(p.name);if(p.name.empty())throw std::runtime_error("Palette name must not be empty");if(p.colors.empty()||p.colors.size()>65536)throw std::runtime_error("Palette must contain 1..65536 colors");if(!p.columns)throw std::runtime_error("Saving requires schema2 layout");validateLayout(p);const auto reserved=builtinIds(builtins_);std::filesystem::create_directories(directory_);if(!currentId.empty()){if(!validId(currentId)||reserved.count(currentId))throw std::runtime_error("Invalid or built-in palette id");p.id=currentId;p.path=directory_/(currentId+".palette.json");}else{std::string slug;bool separator=false;for(wchar_t c:std::wstring(winrt::to_hstring(p.name))){if((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')){slug+=char(std::tolower(c));separator=false;}else if((c=='-'||c=='_'||rustSpace(c))&&!slug.empty()&&!separator){slug+='-';separator=true;}}while(!slug.empty()&&slug.back()=='-')slug.pop_back();if(slug.empty())slug="palette-"+std::to_string(std::chrono::system_clock::now().time_since_epoch().count());if(slug.size()>86)slug.resize(86);p.id=slug;for(int suffix=2;reserved.count(p.id)||std::filesystem::exists(directory_/(p.id+".palette.json"));++suffix)p.id=slug+"-"+std::to_string(suffix);p.path=directory_/(p.id+".palette.json");}p.builtIn=false;auto text=encodeStoredPalette(p);writeExportBytesAtomic(p.path,{text.begin(),text.end()});return p;}
StoredPalette PaletteLibrary::importFile(const std::filesystem::path& path)const{return save(decodeImportedPalette(readPaletteImportBytes(path),path));}
void PaletteLibrary::remove(const std::string& id)const{
 if(!validId(id)||builtinIds(builtins_).count(id))throw std::runtime_error("Invalid or built-in palette id");
 // Legacy resolves identity to the canonical native path before considering
 // external files. Decoding/listing must not prevent removal of a broken file.
 auto target=directory_/(id+".palette.json");
 if(!std::filesystem::exists(target)){
  target.clear();if(std::filesystem::exists(directory_))for(const auto& entry:std::filesystem::directory_iterator(directory_))if(entry.is_regular_file()&&!nativePalettePath(entry.path())&&supportedPaletteImportPath(entry.path())&&externalPaletteId(entry.path())==id){target=entry.path();break;}
 }
 if(target.empty()||std::filesystem::is_directory(std::filesystem::symlink_status(target))||!std::filesystem::remove(target))throw std::runtime_error("Palette no longer exists or cannot be deleted");
}
}
