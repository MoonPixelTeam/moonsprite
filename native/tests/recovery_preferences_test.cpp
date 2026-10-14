#include "recovery_preferences.h"
#include <windows.h>
#include <fstream>
#include <iostream>
#include <limits>
#include <string>
using namespace moon::recovery;
void check(bool v){if(!v)throw std::runtime_error("preferences contract failed");}
int main(){try{
 const auto dir=std::filesystem::temp_directory_path()/("moon-prefs-test-"+std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directory(dir);const auto path=dir/"settings.txt";
 auto p=loadPreferences(path);check(p.enabled&&p.minutes==5&&p.retentionDays==7);
 {std::ofstream f(path);f<<"enabled=false\nminutes=0.1\nretentionDays=9.5\n";}p=loadPreferences(path);check(!p.enabled&&p.minutes==.5&&p.retentionDays==10);
 {std::ofstream f(path);f<<"minutes=nan\nretentionDays=junk\n";}p=loadPreferences(path);check(p.enabled&&p.minutes==5&&p.retentionDays==7);
 savePreferencesAtomic(path,{false,99,999});p=loadPreferences(path);check(!p.enabled&&p.minutes==60&&p.retentionDays==365);
 HANDLE h=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);check(h!=INVALID_HANDLE_VALUE);bool rejected=false;try{savePreferencesAtomic(path,{true,1,2});}catch(...){rejected=true;}CloseHandle(h);check(rejected);p=loadPreferences(path);check(!p.enabled&&p.minutes==60);
 check(!retentionStale(0,86400000,1)&&retentionStale(0,86400001,1)&&!retentionStale(10,9,7));
 std::filesystem::remove(path);check(std::filesystem::is_empty(dir));std::filesystem::remove(dir);std::cout<<"recovery preferences passed\n";
 return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
