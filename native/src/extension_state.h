#pragma once
#include "extension_manifest_commands.h"
#include <charconv>
namespace moon::extension {
struct ExtensionState {
 std::map<std::string,bool> enabled;
 std::set<std::string> seededBuiltin;
 std::map<std::string,std::map<std::string,std::pair<std::uint32_t,std::uint64_t>>> builtinRevisions;
 static ExtensionState parse(const std::string& bytes){
  using namespace winrt::Windows::Data::Json;
  // WinRT stores JSON numbers as double. Quote numeric tokens before parsing
  // so serde's u32/u64 fields never pass through floating point. Strings are
  // copied verbatim, including escaped quotes and digits inside names.
  std::string quoted;bool inString=false,escaped=false;
  for(std::size_t i=0;i<bytes.size();){char c=bytes[i];if(inString){quoted+=c;++i;if(escaped)escaped=false;else if(c=='\\')escaped=true;else if(c=='"')inString=false;continue;}if(c=='"'){inString=true;quoted+=c;++i;continue;}
   if(c=='-'||(c>='0'&&c<='9')){const auto start=i;if(c=='-')++i;if(i==bytes.size())throw std::invalid_argument("Invalid state number");if(bytes[i]=='0')++i;else {if(bytes[i]<'1'||bytes[i]>'9')throw std::invalid_argument("Invalid state number");while(i<bytes.size()&&bytes[i]>='0'&&bytes[i]<='9')++i;}
    if(i<bytes.size()&&bytes[i]=='.'){++i;auto begin=i;while(i<bytes.size()&&bytes[i]>='0'&&bytes[i]<='9')++i;if(begin==i)throw std::invalid_argument("Invalid state fraction");}
    if(i<bytes.size()&&(bytes[i]=='e'||bytes[i]=='E')){++i;if(i<bytes.size()&&(bytes[i]=='+'||bytes[i]=='-'))++i;auto begin=i;while(i<bytes.size()&&bytes[i]>='0'&&bytes[i]<='9')++i;if(begin==i)throw std::invalid_argument("Invalid state exponent");}
    quoted+='"';quoted+=bytes.substr(start,i-start);quoted+='"';continue;
   }quoted+=c;++i;
  }
  auto root=JsonObject::Parse(winrt::to_hstring(quoted));ExtensionState state;
  if(root.HasKey(L"enabled"))for(auto item:root.GetNamedObject(L"enabled"))state.enabled.emplace(winrt::to_string(item.Key()),item.Value().GetBoolean());
  if(root.HasKey(L"seededBuiltin"))for(auto item:root.GetNamedArray(L"seededBuiltin"))state.seededBuiltin.insert(winrt::to_string(item.GetString()));
  // A numeric token must be distinguishable from an actual JSON string.
  // Reparse a second shape with numbers replaced by null: strings retain type.
  std::string shape;inString=false;escaped=false;for(std::size_t i=0;i<bytes.size();){char c=bytes[i];if(inString){shape+=c;++i;if(escaped)escaped=false;else if(c=='\\')escaped=true;else if(c=='"')inString=false;}else if(c=='"'){inString=true;shape+=c;++i;}else if(c=='-'||(c>='0'&&c<='9')){shape+="null";while(i<bytes.size()&&(bytes[i]=='-'||bytes[i]=='+'||bytes[i]=='.'||bytes[i]=='e'||bytes[i]=='E'||(bytes[i]>='0'&&bytes[i]<='9')))++i;}else {shape+=c;++i;}}
  auto types=JsonObject::Parse(winrt::to_hstring(shape));
  if(types.HasKey(L"seededBuiltin"))for(auto item:types.GetNamedArray(L"seededBuiltin"))item.GetString();
  auto integer=[](const IJsonValue& value,const IJsonValue& type,std::uint64_t max){if(type.ValueType()!=JsonValueType::Null||value.ValueType()!=JsonValueType::String)throw std::invalid_argument("Revision must be an unsigned integer");auto token=winrt::to_string(value.GetString());if(token.empty()||!std::all_of(token.begin(),token.end(),[](char c){return c>='0'&&c<='9';}))throw std::invalid_argument("Revision must be an unsigned integer");std::uint64_t result=0;auto parsed=std::from_chars(token.data(),token.data()+token.size(),result);if(parsed.ec!=std::errc{}||parsed.ptr!=token.data()+token.size()||result>max)throw std::invalid_argument("Revision integer overflow");return result;};
  if(root.HasKey(L"builtinRevisions"))for(auto extension:root.GetNamedObject(L"builtinRevisions")){auto& output=state.builtinRevisions[winrt::to_string(extension.Key())];auto type=types.GetNamedObject(L"builtinRevisions").GetNamedObject(extension.Key());for(auto item:extension.Value().GetObject()){auto pair=item.Value().GetArray(),kind=type.GetNamedArray(item.Key());if(pair.Size()!=2)throw std::invalid_argument("Invalid revision tuple");output.emplace(winrt::to_string(item.Key()),std::make_pair(std::uint32_t(integer(pair.GetAt(0),kind.GetAt(0),UINT32_MAX)),integer(pair.GetAt(1),kind.GetAt(1),UINT64_MAX)));}}
  return state;
 }
 std::string encode()const{
  using namespace winrt::Windows::Data::Json;auto quote=[](const std::string& value){return winrt::to_string(JsonValue::CreateStringValue(winrt::to_hstring(value)).Stringify());};
  std::string out="{\"enabled\":{";bool first=true;for(auto& item:enabled){if(!first)out+=',';first=false;out+=quote(item.first)+":"+(item.second?"true":"false");}out+="},\"seededBuiltin\":[";first=true;for(auto& item:seededBuiltin){if(!first)out+=',';first=false;out+=quote(item);}out+="],\"builtinRevisions\":{";first=true;for(auto& extension:builtinRevisions){if(!first)out+=',';first=false;out+=quote(extension.first)+":{";bool entryFirst=true;for(auto& item:extension.second){if(!entryFirst)out+=',';entryFirst=false;out+=quote(item.first)+":["+std::to_string(item.second.first)+","+std::to_string(item.second.second)+"]";}out+='}';}return out+"}}";
 }
};
}
