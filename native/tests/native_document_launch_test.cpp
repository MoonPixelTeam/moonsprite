#include "native_document_launch.h"
#include <fstream>
#include <iostream>
#include <chrono>
using namespace moon::document_launch;
static void check(bool condition,const char* message){if(!condition)throw std::runtime_error(message);}
int wmain(int argc,wchar_t** argv){try{
 if(argc>=3&&std::wstring(argv[1])==L"--child"){
  Instance instance(argv[2]);check(!instance.primary(),"Child unexpectedly became a new instance");std::vector<std::string> paths;for(int i=3;i<argc;++i)paths.push_back(std::filesystem::path(argv[i]).u8string());instance.forward(paths);return 0;
 }
 const auto root=std::filesystem::absolute(argc>1?std::filesystem::path(argv[1]):std::filesystem::path(L"native-launch-test-owned"))/std::to_wstring(GetCurrentProcessId());std::filesystem::create_directories(root);
 const auto first=root/L"文件 space.PNG",second=root/L"backup.moonsprite.BAK",text=root/L"ignored.txt",missing=root/L"missing.png",dir=root/L"directory.png";std::filesystem::create_directories(dir);
 for(const auto& path:{first,second,text}){std::ofstream out(path,std::ios::binary);out<<'x';}
 check(supported({first.u8string(),text.u8string(),second.u8string(),missing.u8string(),dir.u8string()})==std::vector<std::string>{first.u8string(),second.u8string()},"Supported-file and existence filter");
 check(supported({"--theme",first.u8string(),"--cursors",dir.u8string(),second.u8string()})==std::vector<std::string>{second.u8string()},"Native option operands must not become documents");
 check(!automation({"--theme",first.u8string(),second.u8string()})&&automation({"--timeline-gif-drop-check"}),"Automation must not contact the user instance");
 const auto scope=L"MoonSprite.Native.Files.Test."+std::to_wstring(GetCurrentProcessId());Instance owner(scope);check(owner.primary(),"First instance owns endpoint");
 std::wstring executable(32768,0);executable.resize(GetModuleFileNameW(nullptr,executable.data(),DWORD(executable.size())));
 auto child=[&](bool files){
  auto command=L"\""+executable+L"\" --child "+scope+(files?L" \""+first.wstring()+L"\" \""+second.wstring()+L"\" \""+text.wstring()+L"\"":L"");
  STARTUPINFOW startup{};startup.cb=sizeof(startup);PROCESS_INFORMATION process{};check(CreateProcessW(executable.c_str(),command.data(),nullptr,nullptr,FALSE,CREATE_NO_WINDOW,nullptr,nullptr,&startup,&process)!=FALSE,"Start secondary process");CloseHandle(process.hThread);
  const auto deadline=GetTickCount64()+10000;bool done=false;
  while(GetTickCount64()<deadline){const auto wait=MsgWaitForMultipleObjects(1,&process.hProcess,FALSE,100,QS_ALLINPUT);if(wait==WAIT_OBJECT_0){done=true;break;}MSG message;while(PeekMessageW(&message,nullptr,0,0,PM_REMOVE)){TranslateMessage(&message);DispatchMessageW(&message);}}
  if(!done){TerminateProcess(process.hProcess,2);WaitForSingleObject(process.hProcess,2000);}DWORD code=1;GetExitCodeProcess(process.hProcess,&code);CloseHandle(process.hProcess);check(done&&code==0,"Secondary process did not deliver files");
 };
 child(true);check(owner.pending(),"Second instance delivery queue");int activations=0,opens=0;
 owner.pump([&]{++activations;},[&](const auto& paths){++opens;check(paths==std::vector<std::string>{first.u8string(),second.u8string()},"UTF16 cross-process payload and receiver filter");return false;});
 check(owner.pending()&&activations==1&&opens==1,"Busy editor retains delivery");
 owner.pump([&]{++activations;},[&](const auto&){++opens;owner.pump([]{},[](const auto&){throw std::runtime_error("Reentrant document dispatch");return true;});return true;});
 check(!owner.pending()&&activations==1&&opens==2,"Deliver once after modal is ready");
 child(false);owner.pump([&]{++activations;},[&](const auto&){++opens;return true;});check(!owner.pending()&&activations==2&&opens==2,"Empty second launch only activates window");
 wchar_t malformed[]{L'a',0,0,L'b',0,0};COPYDATASTRUCT bad{0x4d53464c,sizeof(malformed),malformed};check(!SendMessageW(owner.handle(),WM_COPYDATA,0,reinterpret_cast<LPARAM>(&bad))&&!owner.pending(),"Reject malformed trailing payload");
 std::cout<<"native-document-launch: passed\n";return 0;
}catch(const std::exception& e){if(argc>=3&&std::wstring(argv[1])==L"--child"){std::wstring executable(32768,0);executable.resize(GetModuleFileNameW(nullptr,executable.data(),DWORD(executable.size())));std::ofstream(std::filesystem::path(executable).parent_path()/"native-launch-child-error.txt")<<e.what();}std::cerr<<e.what()<<'\n';return 1;}}
