#pragma once
// home-sections.ts / home-file-display.ts, with independent native settings codec.
#include <windows.h>
#include <icu.h>
#include <algorithm>
#include <array>
#include <filesystem>
#include <iomanip>
#include <set>
#include <sstream>
#include <string>
#include <stdexcept>
#include <vector>
namespace moon::home {
struct Section {std::string id,kind,name,directory;};
inline std::wstring wide(const std::string& s){return std::filesystem::u8path(s).wstring();}
inline std::string utf8(const std::wstring& s){return std::filesystem::path(s).u8string();}
inline bool space(wchar_t c){return c==0x20||c==9||c==10||c==11||c==12||c==13||c==0xa0||c==0xfeff||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000;}
inline std::string trim(const std::string& s){auto v=wide(s);auto a=std::find_if_not(v.begin(),v.end(),space),b=std::find_if_not(v.rbegin(),v.rend(),space).base();return a<b?utf8(std::wstring(a,b)):std::string{};}
inline std::string normalizeDirectory(const std::string& s){auto v=trim(s);auto end=v.find_last_not_of("/\\");if(end==std::string::npos)return v;v.resize(end+1);if(v.size()==2&&((v[0]>='A'&&v[0]<='Z')||(v[0]>='a'&&v[0]<='z'))&&v[1]==':')v+='\\';return v;}
struct SystemCasing {HMODULE module=LoadLibraryExW(L"icu.dll",nullptr,LOAD_LIBRARY_SEARCH_SYSTEM32);decltype(&u_strToLower) lower=module?reinterpret_cast<decltype(&u_strToLower)>(GetProcAddress(module,"u_strToLower")):nullptr;~SystemCasing(){if(module)FreeLibrary(module);}};
inline std::string key(const std::string& s){static const SystemCasing casing;if(!casing.lower)throw std::runtime_error("System Unicode casing is unavailable");auto v=wide(normalizeDirectory(s));for(auto& c:v)if(c==L'\\')c=L'/';if(v.empty())return {};UErrorCode error=U_ZERO_ERROR;const auto n=casing.lower(nullptr,0,reinterpret_cast<const UChar*>(v.data()),int(v.size()),"",&error);if(error!=U_BUFFER_OVERFLOW_ERROR&&U_FAILURE(error))throw std::runtime_error("Cannot normalize folder identity");std::wstring lower(n,L'\0');error=U_ZERO_ERROR;casing.lower(reinterpret_cast<UChar*>(lower.data()),n,reinterpret_cast<const UChar*>(v.data()),int(v.size()),"",&error);if(U_FAILURE(error))throw std::runtime_error("Cannot normalize folder identity");return utf8(lower);}

inline std::string escape(const std::string& s){static const char hex[]="0123456789ABCDEF";std::string out;for(unsigned char c:s){if((c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||std::string("-_.!~*'()").find(char(c))!=std::string::npos)out+=char(c);else{out+='%';out+=hex[c>>4];out+=hex[c&15];}}return out;}
inline Section folder(const std::string& path){auto directory=normalizeDirectory(path),name=directory;auto end=name.find_last_not_of("/\\");if(end!=std::string::npos){name.resize(end+1);auto start=name.find_last_of("/\\");if(start!=std::string::npos)name.erase(0,start+1);}return {"folder:"+escape(key(directory)),"folder",name,directory};}
inline std::vector<Section> normalize(const std::vector<Section>& input){std::vector<Section> out;std::set<std::string> builtins,folders;for(auto v:input){if(v.kind=="recent"||v.kind=="gallery"||v.kind=="recovery"){if(builtins.insert(v.kind).second)out.push_back({v.kind,v.kind,{},{}});}else if(v.kind=="folder"){auto f=folder(v.directory);if(f.directory.empty()||!folders.insert(key(f.directory)).second)continue;if(!trim(v.name).empty())f.name=trim(v.name);out.push_back(std::move(f));}}for(auto kind:{"recent","gallery","recovery"})if(!builtins.count(kind))out.push_back({kind,kind,{},{}});return out;}
inline std::vector<Section> reorder(const std::vector<Section>& values,const std::string& source,const std::string& target,bool after){if(source==target)return values;auto a=std::find_if(values.begin(),values.end(),[&](const auto& v){return v.id==source;}),b=std::find_if(values.begin(),values.end(),[&](const auto& v){return v.id==target;});if(a==values.end()||b==values.end())return values;auto out=values;auto moved=*a;out.erase(out.begin()+(a-values.begin()));auto at=std::find_if(out.begin(),out.end(),[&](const auto& v){return v.id==target;});out.insert(at+(after?1:0),moved);return out;}
inline std::string encode(const std::vector<Section>& sections){std::ostringstream out;out<<"moon-home-sections-v1\n";for(const auto& s:normalize(sections))out<<std::quoted(s.kind)<<' '<<std::quoted(s.name)<<' '<<std::quoted(s.directory)<<'\n';return out.str();}
inline std::vector<Section> decode(const std::string& text){std::istringstream in(text);std::string tag;std::getline(in,tag);std::vector<Section> out;if(tag=="moon-home-sections-v1"){Section s;while(in>>std::quoted(s.kind)>>std::quoted(s.name)>>std::quoted(s.directory))out.push_back(s);}return normalize(out);}
inline const std::array<std::string,6> formats={"project","png","jpg","webp","bmp","gif"};
inline std::string format(const std::string& path){auto p=path;std::transform(p.begin(),p.end(),p.begin(),[](unsigned char c){return char(std::tolower(c));});if(p.size()>=15&&p.compare(p.size()-15,15,".moonsprite.bak")==0)return "project";auto dot=p.find_last_of('.'),slash=p.find_last_of("/\\");if(dot==std::string::npos||(slash!=std::string::npos&&dot<slash))return {};auto ext=p.substr(dot+1);if(ext=="moonsprite"||ext=="ase"||ext=="aseprite"||ext=="psd")return "project";if(ext=="jpeg")return "jpg";return std::find(formats.begin()+1,formats.end(),ext)!=formats.end()?ext:std::string{};}
inline bool matches(const std::string& path,unsigned mask){auto f=format(path);auto it=std::find(formats.begin(),formats.end(),f);return it!=formats.end()&&(mask&(1u<<std::size_t(it-formats.begin())));}
}
