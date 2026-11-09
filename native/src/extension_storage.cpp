#include "extension_storage.h"
#include "atomic_file.h"
#include "javascript_text.h"
#include <algorithm>
#include <fstream>
#include <stdexcept>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::extension {
using namespace winrt::Windows::Data::Json;
namespace {
winrt::hstring wide(const std::u16string& s){return {reinterpret_cast<const wchar_t*>(s.data()),std::uint32_t(s.size())};}
std::u16string units(const winrt::hstring& s){return {reinterpret_cast<const char16_t*>(s.data()),s.size()};}
std::size_t utf8Bytes(const std::u16string& s){std::size_t n=0;for(std::size_t i=0;i<s.size();++i){const auto c=s[i];if(c<128)++n;else if(c<2048)n+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<s.size()&&s[i+1]>=0xdc00&&s[i+1]<=0xdfff){n+=4;++i;}else n+=3;}return n;}
bool starts(const std::u16string& s,const std::u16string& prefix){return s.size()>=prefix.size()&&s.compare(0,prefix.size(),prefix)==0;}
}
std::u16string Storage::prefix(const std::u16string& id){return u"moonsprite.extension-runtime.v1."+id+u".";}
void Storage::validateKey(const std::u16string& key){if(key.empty()||utf8Bytes(key)>160||std::any_of(key.begin(),key.end(),[](char16_t c){return c<32;}))throw std::invalid_argument("扩展存储键无效。");}
Storage::Storage(std::filesystem::path path):path_(std::move(path)){
 std::error_code ec;if(!std::filesystem::exists(path_,ec)){if(ec)throw std::runtime_error("Cannot inspect extension storage");return;}
 std::ifstream input(path_,std::ios::binary);if(!input)throw std::runtime_error("Cannot read extension storage");const std::string json((std::istreambuf_iterator<char>(input)),{});if(input.bad())throw std::runtime_error("Cannot finish reading extension storage");
 const auto rows=JsonArray::Parse(winrt::to_hstring(json));for(const auto& value:rows){const auto row=value.GetArray();if(row.Size()!=2)throw std::runtime_error("Invalid extension storage entry");auto key=units(row.GetStringAt(0));auto bytes=winrt::to_string(row.GetStringAt(1));if(std::any_of(values_.begin(),values_.end(),[&](const auto& p){return p.first==key;}))throw std::runtime_error("Duplicate extension storage entry");values_.push_back({std::move(key),std::move(bytes)});}
}
void Storage::publish(std::vector<std::pair<std::u16string,std::string>> next){
 JsonArray rows;for(const auto& p:next){JsonArray row;row.Append(JsonValue::CreateStringValue(wide(p.first)));row.Append(JsonValue::CreateStringValue(winrt::to_hstring(p.second)));rows.Append(row);}
 const auto json=javascriptJsonUtf8(rows.Stringify().c_str());if(!path_.parent_path().empty())std::filesystem::create_directories(path_.parent_path());writeBinaryFileAtomic(path_,{json.begin(),json.end()});values_.swap(next);
}
IJsonValue Storage::get(const std::u16string& extension,const std::u16string& key)const{
 validateKey(key);const auto name=prefix(extension)+key;for(const auto& p:values_)if(p.first==name){try{return JsonValue::Parse(winrt::to_hstring(p.second));}catch(...){return JsonValue::CreateNullValue();}}return JsonValue::CreateNullValue();
}
void Storage::setEncoded(const std::u16string& extension,const std::u16string& key,const std::string& json){
 validateKey(key);if(json.size()>256u*1024u)throw std::length_error("扩展存储值超过大小限制。");JsonValue::Parse(winrt::to_hstring(json));
 const auto scope=prefix(extension),name=scope+key;std::size_t total=json.size();for(const auto& p:values_)if(starts(p.first,scope)&&p.first!=name){if(p.second.size()>1024u*1024u-total)throw std::length_error("扩展存储空间超过 1 MiB 限制。");total+=p.second.size();}
 auto next=values_;auto it=std::find_if(next.begin(),next.end(),[&](const auto& p){return p.first==name;});if(it==next.end())next.push_back({name,json});else it->second=json;publish(std::move(next));
}
void Storage::remove(const std::u16string& extension,const std::u16string& key){validateKey(key);const auto name=prefix(extension)+key;auto next=values_;next.erase(std::remove_if(next.begin(),next.end(),[&](const auto& p){return p.first==name;}),next.end());if(next.size()!=values_.size())publish(std::move(next));}
std::vector<std::u16string> Storage::list(const std::u16string& extension)const{const auto scope=prefix(extension);std::vector<std::u16string> keys;for(const auto& p:values_)if(starts(p.first,scope))keys.push_back(p.first.substr(scope.size()));std::sort(keys.begin(),keys.end());return keys;}
}
