#include "pattern_brush_library.h"
#include <algorithm>
#include <atomic>
#include <chrono>
#include <fstream>
#include <set>
#include <tuple>
#include <windows.h>
#include <roapi.h>
#ifdef GetObject
#undef GetObject
#endif
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <cmath>
#include <exception>
#include <mutex>
#include <unordered_map>
#include <limits>
namespace moon {namespace {
std::recursive_mutex brushOrderMutex;
constexpr const char* orderFile=".brush-order.json";
struct JsonApartment{HRESULT status=RoInitialize(RO_INIT_MULTITHREADED);~JsonApartment(){if(status==S_OK)winrt::clear_factory_cache();if(SUCCEEDED(status))RoUninitialize();}};
// Same native lexical adaptation as palette_import.cpp: the DOM normalizes
// duplicate keys and numeric spellings that serde's typed fields reject.
bool metadataLexicalShape(const std::string& text){
 using namespace winrt::Windows::Data::Json;
 if(!text.empty()&&!MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text.data(),int(text.size()),nullptr,0))return false;
 int depth=0;std::wstring field;std::set<std::wstring> seen;
 for(std::size_t i=0;i<text.size();){const char c=text[i];
  if(c=='"'){const auto start=i++;bool ended=false;while(i<text.size()){if(text[i]=='"'){++i;ended=true;break;}if(text[i]=='\\'){if(++i==text.size())return false;}++i;}if(!ended)return false;
   const auto end=i;while(i<text.size()&&(text[i]==' '||text[i]=='\t'||text[i]=='\r'||text[i]=='\n'))++i;
   if(depth==1&&i<text.size()&&text[i]==':'){field=std::wstring(JsonValue::Parse(winrt::to_hstring(text.substr(start,end-start))).GetString());if(field==L"intrinsicSize"||field==L"sourceX"||field==L"sourceY")if(!seen.insert(field).second)return false;}continue;
  }
  if(c=='{'||c=='['){++depth;++i;continue;}if(c=='}'||c==']'){--depth;++i;continue;}
  if(c=='-'||(c>='0'&&c<='9')){const auto start=i++;while(i<text.size()&&((text[i]>='0'&&text[i]<='9')||text[i]=='.'||text[i]=='e'||text[i]=='E'||text[i]=='+'||text[i]=='-'))++i;
   if(depth==1&&(field==L"sourceX"||field==L"sourceY")){auto token=text.substr(start,i-start);if(token=="-0")return false;std::size_t digit=token[0]=='-'?1:0;if(digit==token.size()||token.find_first_not_of("0123456789",digit)!=std::string::npos)return false;}
   continue;
  }++i;
 }return true;
}
void readMetadata(const std::string& text,StoredPatternBrush& item){
 using namespace winrt::Windows::Data::Json;
 try{if(!metadataLexicalShape(text))return;const auto root=JsonObject::Parse(winrt::to_hstring(text));if(root.GetNamedValue(L"intrinsicSize").ValueType()!=JsonValueType::Boolean)return;
  auto coordinate=[&](const wchar_t* key)->std::optional<int>{if(!root.HasKey(key)||root.GetNamedValue(key).ValueType()==JsonValueType::Null)return {};const auto value=root.GetNamedValue(key);if(value.ValueType()!=JsonValueType::Number)throw std::runtime_error("Invalid brush coordinate");const auto n=value.GetNumber();if(!std::isfinite(n)||n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max()||n!=std::floor(n))throw std::runtime_error("Invalid brush coordinate");return int(n);};
  const auto x=coordinate(L"sourceX"),y=coordinate(L"sourceY");item.sourceX=x;item.sourceY=y;
 }catch(...){item.sourceX.reset();item.sourceY.reset();}
}

bool pngExtension(const std::string& value){if(value.size()<4)return false;const auto at=value.size()-4;return value[at]=='.'&&(value[at+1]=='p'||value[at+1]=='P')&&(value[at+2]=='n'||value[at+2]=='N')&&(value[at+3]=='g'||value[at+3]=='G');}
void atomicBytes(const std::filesystem::path& p,const std::vector<std::uint8_t>& b){
 std::lock_guard<std::recursive_mutex> orderLock(brushOrderMutex);
 static std::atomic<std::uint64_t> nextTemporary{0};
 auto t=p;HANDLE file=INVALID_HANDLE_VALUE;
 for(unsigned attempt=0;attempt<32;++attempt){
  t=p;t+=L".tmp."+std::to_wstring(GetCurrentProcessId())+L"-"+std::to_wstring(std::chrono::high_resolution_clock::now().time_since_epoch().count())+L"-"+std::to_wstring(nextTemporary.fetch_add(1,std::memory_order_relaxed));
  file=CreateFileW(t.c_str(),GENERIC_WRITE,0,nullptr,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,nullptr);
  if(file!=INVALID_HANDLE_VALUE)break;
  const auto error=GetLastError();
  if(error!=ERROR_FILE_EXISTS&&error!=ERROR_ALREADY_EXISTS)throw std::runtime_error("Cannot write brush file (Windows error "+std::to_string(error)+")");
 }
 if(file==INVALID_HANDLE_VALUE)throw std::runtime_error("Cannot reserve unique brush temporary file");
 try{
  const auto* data=b.data();auto remaining=b.size();
  while(remaining){const auto chunk=static_cast<DWORD>(std::min<std::size_t>(remaining,1U<<30));DWORD written=0;
   if(!WriteFile(file,data,chunk,&written,nullptr)||written==0)throw std::runtime_error("Cannot write brush file (Windows error "+std::to_string(GetLastError())+")");
   data+=written;remaining-=written;
  }
  if(!FlushFileBuffers(file))throw std::runtime_error("Cannot flush brush file (Windows error "+std::to_string(GetLastError())+")");
  if(!CloseHandle(file)){file=INVALID_HANDLE_VALUE;throw std::runtime_error("Cannot close brush file (Windows error "+std::to_string(GetLastError())+")");}
  file=INVALID_HANDLE_VALUE;
  if(!MoveFileExW(t.c_str(),p.c_str(),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH))throw std::runtime_error("Cannot replace brush file "+p.u8string()+" (Windows error "+std::to_string(GetLastError())+")");
 }catch(...){if(file!=INVALID_HANDLE_VALUE)CloseHandle(file);std::error_code ignored;std::filesystem::remove(t,ignored);throw;}
}
// Match legacy read_to_string followed by atomic rename while allowing a
// concurrent listing to keep its original file open during replacement.
std::string readOrderBytes(const std::filesystem::path& path){
 HANDLE file=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);
 if(file==INVALID_HANDLE_VALUE)return {};
 struct Close{HANDLE file;~Close(){CloseHandle(file);}} close{file};
 std::string result;char chunk[4096];DWORD count=0;
 while(ReadFile(file,chunk,sizeof(chunk),&count,nullptr)&&count)result.append(chunk,count);
 return result;
}
std::filesystem::path pathFor(const std::filesystem::path& d,const std::string& id){if(!PatternBrushLibrary::safeId(id))throw std::invalid_argument("Invalid brush file ID");for(auto& e:std::filesystem::recursive_directory_iterator(d))if(const auto attributes=GetFileAttributesW(e.path().c_str());attributes!=INVALID_FILE_ATTRIBUTES&&(attributes&FILE_ATTRIBUTE_REPARSE_POINT)!=0)throw std::runtime_error("Linked brush paths are not supported");else if(e.is_regular_file()&&e.path().filename().u8string()==id)return e.path();throw std::runtime_error("Brush file does not exist");}
std::string folderName(std::string value){std::string result;for(unsigned char c:value)if(std::string("/\\:*?\"<>|").find(char(c))==std::string::npos)result+=char(c);auto a=result.find_first_not_of(" \t\r\n"),b=result.find_last_not_of(" \t\r\n");if(a==std::string::npos)throw std::invalid_argument("Brush folder name cannot be empty");result=result.substr(a,b-a+1);if(result=="."||result.find("..")!=std::string::npos||result.back()=='.')throw std::invalid_argument("Invalid brush folder name");return result;}
std::filesystem::path folderPath(const std::filesystem::path& root,const std::string& id,bool allowRoot=false){
 if(id.empty()){if(allowRoot)return root;throw std::invalid_argument("Folder ID cannot be empty");}
 if(id.find("..")!=std::string::npos||id.front()=='/'||id.front()=='\\')throw std::invalid_argument("Invalid brush folder ID");
 auto path=root;std::size_t start=0;while(start<id.size()){auto end=id.find('/',start);auto part=id.substr(start,end==std::string::npos?std::string::npos:end-start);if(part.empty()||part=="."||part.find_first_of("\\:*?\"<>|")!=std::string::npos)throw std::invalid_argument("Invalid brush folder ID");path/=std::filesystem::u8path(part);auto attributes=GetFileAttributesW(path.c_str());if(attributes!=INVALID_FILE_ATTRIBUTES&&(attributes&FILE_ATTRIBUTE_REPARSE_POINT))throw std::invalid_argument("Linked brush folders are not supported");if(end==std::string::npos)break;start=end+1;if(start==id.size())throw std::invalid_argument("Invalid brush folder ID");}
 auto base=std::filesystem::weakly_canonical(root),resolved=std::filesystem::weakly_canonical(path);auto relative=resolved.lexically_relative(base);if(relative.empty()||relative==L"."||*relative.begin()==L"..")throw std::invalid_argument("Brush folder is outside library");return path;
}
StoredPatternBrushFolder describeFolder(const std::filesystem::path& root,const std::filesystem::path& path){return {path.lexically_relative(root).generic_u8string(),path.filename().u8string(),path.u8string()};}

}
PatternBrushLibrary::PatternBrushLibrary(std::filesystem::path d):directory_(std::move(d)){std::filesystem::create_directories(directory_);if(!std::filesystem::is_directory(directory_))throw std::runtime_error("Brush path is not a directory");}
std::string PatternBrushLibrary::cleanName(const std::string& n){std::string r;for(char c:n)if(std::string("/\\:*?\"<>|").find(c)==std::string::npos)r.push_back(c);auto a=r.find_first_not_of(" \t\r\n"),b=r.find_last_not_of(" \t\r\n");return a==std::string::npos?"选区笔刷":r.substr(a,b-a+1);}
bool PatternBrushLibrary::safeId(const std::string& id){return pngExtension(id)&&id.find("..") == std::string::npos&&id.find('/')==std::string::npos&&id.find('\\')==std::string::npos;}
std::string quoteJson(const std::string& value){std::string r="\"";for(unsigned char c:value){if(c=='"'||c=='\\')r+='\\';if(c<32)throw std::invalid_argument("Invalid control character in brush name");r+=char(c);}return r+"\"";}
std::vector<std::string> PatternBrushLibrary::readOrder()const{
 std::lock_guard<std::recursive_mutex> orderLock(brushOrderMutex);JsonApartment apartment;std::vector<std::string> result;
 try{const auto values=winrt::Windows::Data::Json::JsonArray::Parse(winrt::to_hstring(readOrderBytes(directory_/orderFile)));for(const auto& value:values){if(value.ValueType()!=winrt::Windows::Data::Json::JsonValueType::String)return {};result.push_back(winrt::to_string(value.GetString()));}}catch(...){return {};}return result;
}
void PatternBrushLibrary::writeOrder(const std::vector<std::string>& ids)const{std::string text="[";for(auto& id:ids){if(text.size()>1)text+=',';text+=quoteJson(id);}text+=']';atomicBytes(directory_/orderFile,{text.begin(),text.end()});}
PatternBrushListing PatternBrushLibrary::list()const{std::lock_guard<std::recursive_mutex> orderLock(brushOrderMutex);JsonApartment apartment;PatternBrushListing r{directory_,{}};for(auto& e:std::filesystem::recursive_directory_iterator(directory_))if(const auto attributes=GetFileAttributesW(e.path().c_str());attributes!=INVALID_FILE_ATTRIBUTES&&(attributes&FILE_ATTRIBUTE_REPARSE_POINT)!=0)throw std::runtime_error("Linked brush paths are not supported");else if(e.path().filename().wstring().rfind(L".brush-order.json.tmp.",0)==0)continue;else if(e.is_directory()){auto relative=e.path().lexically_relative(directory_).generic_u8string();r.folders.push_back({relative,e.path().filename().u8string(),e.path().u8string()});}else if(pngExtension(e.path().filename().u8string())&&e.is_regular_file()){auto id=e.path().filename().u8string();if(!safeId(id))continue;StoredPatternBrush item{id,e.path().stem().u8string(),e.path().u8string(),true,{},{}};auto meta=e.path();meta.replace_extension(L".meta.json");std::ifstream f(meta);std::string text((std::istreambuf_iterator<char>(f)),{});readMetadata(text,item);item.folderId=e.path().parent_path().lexically_relative(directory_).generic_u8string();if(item.folderId==".")item.folderId.clear();r.brushes.push_back(std::move(item));}std::sort(r.folders.begin(),r.folders.end(),[](auto&a,auto&b){return a.id<b.id;});auto o=readOrder();std::unordered_map<std::string,std::size_t> rank;rank.reserve(o.size());for(std::size_t i=0;i<o.size();++i)rank.emplace(o[i],i);auto position=[&](const std::string& id){const auto found=rank.find(id);return found==rank.end()?std::numeric_limits<std::size_t>::max():found->second;};std::stable_sort(r.brushes.begin(),r.brushes.end(),[&](const auto& a,const auto& b){return std::tuple(position(a.id),a.name,a.id)<std::tuple(position(b.id),b.name,b.id);});return r;}
StoredPatternBrush PatternBrushLibrary::save(std::string n,const std::vector<std::uint8_t>& png,bool intrinsic,std::optional<int> x,std::optional<int> y){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);n=cleanName(n);if(png.size()<8||png[0]!=137||png[1]!=80||png[2]!=78||png[3]!=71)throw std::invalid_argument("Invalid brush PNG payload");auto id=n+"-"+std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count())+".png";auto path=directory_/std::filesystem::u8path(id);auto meta=path;meta.replace_extension(L".meta.json");auto order=readOrder();atomicBytes(path,png);try{std::string metadata=std::string("{\"intrinsicSize\":")+(intrinsic?"true":"false")+",\"sourceX\":"+(x?std::to_string(*x):"null")+",\"sourceY\":"+(y?std::to_string(*y):"null")+"}";atomicBytes(meta,{metadata.begin(),metadata.end()});order.push_back(id);writeOrder(order);}catch(...){std::error_code e;std::filesystem::remove(path,e);std::filesystem::remove(meta,e);throw;}return{id,path.stem().u8string(),path.u8string(),true,x,y};}
void PatternBrushLibrary::remove(const std::string& id){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);auto p=pathFor(directory_,id);auto previous=readOrder();auto o=previous;o.erase(std::remove(o.begin(),o.end(),id),o.end());writeOrder(o);std::error_code e;if(!std::filesystem::remove(p,e)||e){writeOrder(previous);throw std::runtime_error("Cannot delete brush file");}p.replace_extension(L".meta.json");std::filesystem::remove(p,e);}
void PatternBrushLibrary::reorder(const std::vector<std::string>& ids){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);std::set<std::string> remaining;for(const auto& item:list().brushes)remaining.insert(item.id);std::vector<std::string> order;for(const auto& id:ids){if(!safeId(id))throw std::invalid_argument("Invalid brush file ID");if(remaining.erase(id))order.push_back(id);}writeOrder(order);}
StoredPatternBrushFolder PatternBrushLibrary::createFolder(std::string name,const std::string& parent){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);auto path=folderPath(directory_,parent,true);if(!std::filesystem::is_directory(path))throw std::runtime_error("Parent brush folder does not exist");name=folderName(name);auto base=name;int suffix=2;while(std::filesystem::exists(path/std::filesystem::u8path(name)))name=base+"-"+std::to_string(suffix++);path/=std::filesystem::u8path(name);std::filesystem::create_directory(path);return describeFolder(directory_,path);}
StoredPatternBrushFolder PatternBrushLibrary::renameFolder(const std::string& id,std::string name){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);auto source=folderPath(directory_,id);if(!std::filesystem::is_directory(source))throw std::runtime_error("Brush folder does not exist");name=folderName(name);auto target=source.parent_path()/std::filesystem::u8path(name);if(source==target)return describeFolder(directory_,source);if(std::filesystem::exists(target)){if(!std::filesystem::equivalent(source,target))throw std::runtime_error("Brush folder name already exists");auto temp=source.parent_path()/(L".moonsprite-folder-"+std::to_wstring(std::chrono::high_resolution_clock::now().time_since_epoch().count()));std::filesystem::rename(source,temp);try{std::filesystem::rename(temp,target);}catch(...){std::filesystem::rename(temp,source);throw;}}else std::filesystem::rename(source,target);return describeFolder(directory_,target);}
StoredPatternBrush PatternBrushLibrary::move(const std::string& id,const std::string& folder){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);auto source=pathFor(directory_,id),destination=folderPath(directory_,folder,true);if(!std::filesystem::is_directory(destination))throw std::runtime_error("Brush folder does not exist");auto target=destination/source.filename();if(source!=target){if(std::filesystem::exists(target))throw std::runtime_error("Brush already exists in target folder");auto oldMeta=source,newMeta=target;oldMeta.replace_extension(L".meta.json");newMeta.replace_extension(L".meta.json");std::filesystem::rename(source,target);try{if(std::filesystem::exists(oldMeta)){if(std::filesystem::exists(newMeta))throw std::runtime_error("Target brush metadata already exists");std::filesystem::rename(oldMeta,newMeta);}}catch(...){std::filesystem::rename(target,source);throw;}}for(auto& item:list().brushes)if(item.id==id)return item;throw std::runtime_error("Moved brush missing from library");}
void PatternBrushLibrary::removeFolder(const std::string& id){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);auto target=folderPath(directory_,id);if(!std::filesystem::is_directory(target))throw std::runtime_error("Brush folder does not exist");std::set<std::string> deleted;for(auto& entry:std::filesystem::recursive_directory_iterator(target)){auto attributes=GetFileAttributesW(entry.path().c_str());if(attributes!=INVALID_FILE_ATTRIBUTES&&(attributes&FILE_ATTRIBUTE_REPARSE_POINT))throw std::invalid_argument("Linked brush folder content is not supported");if(entry.is_regular_file()&&pngExtension(entry.path().filename().u8string()))deleted.insert(entry.path().filename().u8string());}auto previous=readOrder(),next=previous;next.erase(std::remove_if(next.begin(),next.end(),[&](auto& value){return deleted.count(value);}),next.end());writeOrder(next);try{std::filesystem::remove_all(target);}catch(...){writeOrder(previous);throw;}}

void PatternBrushLibrary::moveGroup(const std::vector<std::string>& ids,const std::string& folder){std::lock_guard<std::recursive_mutex> transactionLock(brushOrderMutex);
 const auto listing=list();const auto destination=folderPath(directory_,folder,true);if(!std::filesystem::is_directory(destination))throw std::runtime_error("Brush folder does not exist");std::vector<StoredPatternBrush> sources;std::set<std::string> seen;
 for(const auto& id:ids){if(!seen.insert(id).second)continue;auto found=std::find_if(listing.brushes.begin(),listing.brushes.end(),[&](const auto& item){return item.id==id;});if(found==listing.brushes.end())throw std::runtime_error("Brush file does not exist");auto source=std::filesystem::u8path(found->filePath),target=destination/source.filename();if(source!=target){auto metadata=target;metadata.replace_extension(L".meta.json");if(std::filesystem::exists(target)||std::filesystem::exists(metadata))throw std::runtime_error("Brush or metadata already exists in target folder");}sources.push_back(*found);}
 std::size_t completed=0;try{for(const auto& item:sources){move(item.id,folder);++completed;}}catch(...){auto failure=std::current_exception();bool restored=true;while(completed){const auto& item=sources[--completed];try{move(item.id,item.folderId);}catch(...){restored=false;}}if(!restored)throw std::runtime_error("Brush move failed; restoring original folder also failed");std::rethrow_exception(failure);}
}

}

namespace moon {
std::string PatternBrushDropPaths::lower(std::string value){
 if(value.empty())return value;auto wide=std::filesystem::u8path(value).wstring();const int count=LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),nullptr,0,nullptr,nullptr,0);if(!count)throw std::runtime_error("Cannot compare dropped file paths");std::wstring result(count,wchar_t(0));if(!LCMapStringEx(LOCALE_NAME_INVARIANT,LCMAP_LOWERCASE,wide.data(),int(wide.size()),result.data(),count,nullptr,nullptr,0))throw std::runtime_error("Cannot compare dropped file paths");return std::filesystem::path(result).u8string();
}
}
