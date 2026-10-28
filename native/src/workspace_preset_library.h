#pragma once
#include "image_export.h"
#include <filesystem>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <algorithm>
#include <chrono>
#include <cctype>
namespace moon {
// legacy src-tauri platform_workspaces.rs: names/IDs, initial/current, atomic disk.
struct WorkspacePreset {std::string id,name,layout,initial;bool builtIn=false;};
class WorkspacePresetLibrary {
 std::filesystem::path directory_;std::string baseline_;
 static bool validId(const std::string& id){return !id.empty()&&id.size()<=96&&std::all_of(id.begin(),id.end(),[](unsigned char c){return (c>='a'&&c<='z')||(c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='-'||c=='_';});}
 std::filesystem::path path(const std::string& id)const{if(!validId(id))throw std::invalid_argument("工作区 ID 无效。");return directory_/(id+".workspace.native");}
 static void bytes(const std::filesystem::path& file,const std::string& text){std::filesystem::create_directories(file.parent_path());writeExportBytesAtomic(file,{text.begin(),text.end()});}
public:
 WorkspacePresetLibrary(std::filesystem::path directory,std::string baseline):directory_(std::move(directory)),baseline_(std::move(baseline)){}
 const std::filesystem::path& directory()const{return directory_;}
 static std::string cleanName(std::string name){auto text=std::filesystem::u8path(name).u32string();auto space=[](char32_t c){return c==U' '||c==U'\t'||c==U'\r'||c==U'\n'||c==0x85||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000;};while(!text.empty()&&space(text.front()))text.erase(text.begin());while(!text.empty()&&space(text.back()))text.pop_back();if(text.empty()||text.size()>96)throw std::invalid_argument("工作区名称必须为 1 到 96 个字符。");return std::filesystem::path(text).u8string();}
 WorkspacePreset read(const std::string& id)const{const auto file=path(id);if(!std::filesystem::exists(file)&&id=="builtin-default")return {id,"默认工作区",baseline_,baseline_,true};if(std::filesystem::file_size(file)>600*1024)throw std::runtime_error("工作区布局过大。");std::ifstream in(file,std::ios::binary);std::string header;WorkspacePreset value;value.id=id;value.builtIn=id=="builtin-default";if(!std::getline(in,header)||header!="moonsprite-workspace-preset-v1"||!(in>>std::quoted(value.name)>>std::quoted(value.layout)>>std::quoted(value.initial))||!(in>>std::ws).eof()||value.layout.empty()||value.initial.empty()||value.layout.size()>256*1024||value.initial.size()>256*1024)throw std::runtime_error("工作区信息无效或版本不兼容。");value.name=cleanName(value.name);if(value.builtIn)value.initial=baseline_;return value;}
 std::vector<WorkspacePreset> list()const{std::vector<WorkspacePreset> result;try{result.push_back(read("builtin-default"));}catch(const std::exception&){result.push_back({"builtin-default","默认工作区",baseline_,baseline_,true});}if(std::filesystem::exists(directory_))for(const auto& entry:std::filesystem::directory_iterator(directory_)){const auto filename=entry.path().filename().u8string(),suffix=std::string(".workspace.native");if(!entry.is_regular_file()||filename.size()<=suffix.size()||filename.substr(filename.size()-suffix.size())!=suffix)continue;const auto id=filename.substr(0,filename.size()-suffix.size());if(id=="builtin-default")continue;try{result.push_back(read(id));}catch(const std::exception&){}}std::sort(result.begin()+1,result.end(),[](const auto& a,const auto& b){return a.name==b.name?a.id<b.id:a.name<b.name;});return result;}
 WorkspacePreset save(std::string id,std::string name,const std::string& layout){name=cleanName(std::move(name));if(layout.empty()||layout.size()>256*1024)throw std::invalid_argument("工作区布局无效或过大。");if(id.empty()){for(unsigned char c:name){if(std::isalnum(c)&&c<128)id+=char(std::tolower(c));else if((c=='-'||c=='_'||std::isspace(c))&&!id.empty()&&id.back()!='-')id+='-';}while(!id.empty()&&id.back()=='-')id.pop_back();if(id.empty())id="workspace-"+std::to_string(std::chrono::high_resolution_clock::now().time_since_epoch().count());const auto base=id;for(int suffix=2;std::filesystem::exists(path(id));++suffix)id=base.substr(0,90)+"-"+std::to_string(suffix);}
 const auto file=path(id);const auto initial=id=="builtin-default"?baseline_:std::filesystem::exists(file)?read(id).initial:layout;std::ostringstream out;out<<"moonsprite-workspace-preset-v1\n"<<std::quoted(name)<<'\n'<<std::quoted(layout)<<'\n'<<std::quoted(initial)<<'\n';bytes(file,out.str());return read(id);}
 void remove(const std::string& id){if(id=="builtin-default")throw std::invalid_argument("内置工作区不能删除。");if(!std::filesystem::remove(path(id)))throw std::runtime_error("工作区文件不存在。");}
 void remember(const std::string& id){if(!validId(id))throw std::invalid_argument("工作区 ID 无效。");bytes(directory_/"active.txt",id+"\n");}
 std::string remembered()const{const auto file=directory_/"active.txt";if(!std::filesystem::exists(file))return {};if(std::filesystem::file_size(file)>128)throw std::runtime_error("工作区记录无效。");std::ifstream in(file);std::string id;if(!(in>>id)||!validId(id)||!(in>>std::ws).eof())throw std::runtime_error("工作区记录无效。");return id;}
};
}
