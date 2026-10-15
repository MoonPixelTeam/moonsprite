#include "layer_quick_actions.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <windows.h>
using namespace moon::layerquick;
void require(bool pass,const char* reason){if(!pass)throw std::runtime_error(reason);}
int main(){try{
 const auto defaults=normalize({});require(defaults.size()==25&&count(defaults)==5,"Legacy five defaults");
 auto actions=parse(R"([null,4,{"id":"deleteLayer","enabled":true},{"id":"deleteLayer","enabled":false},{"id":"not-a-command","enabled":true},{"id":"newLayer","enabled":false}])");
 require(actions.size()==25&&actions[0]==Action{"deleteLayer",true}&&actions[1]==Action{"newLayer",false},"Legacy invalid duplicate fixture");
 auto strict=parse(R"([{"id":"deleteLayer","enabled":1},{"id":"newLayer","enabled":"true"}])");require(!strict[0].enabled&&!strict[1].enabled,"Only literal true");require(parse("{}")==defaults&&parse("invalid")==defaults,"Non-array/malformed fallback");
 auto all=defaults;for(auto& a:all)a.enabled=true;require(count(parse(serialize(all)))==25,"Normalize must preserve over-limit imports");
 auto connected=[](const std::string& id){return id=="newLayer"||id=="deleteLayer";};require(visible(defaults,connected)==Actions{{"newLayer",true}},"Unsupported toolbar hidden without config loss");
 require(!toggle(all,"deleteLayer",true,connected),"Enable limit guard");require(toggle(all,"deleteLayer",false,connected)&&count(all)==24,"Over-limit disable permitted");require(toggle(all,"newTilemapLayer",false,connected)&&!all[1].enabled,"Explicit unsupported disable allowed");require(!toggle(all,"newTilemapLayer",true,connected)&&!all[1].enabled,"Unsupported enable forbidden");
 auto order=defaults;require(reorder(order,"newLayer","deleteLayer",true)&&order[6].id=="newLayer","Reorder after removal target");require(reorder(order,"newLayer","newTilemapLayer",false)&&order.front().id=="newLayer","Reorder before target");require(!reorder(order,"newLayer","newLayer",true)&&!reorder(order,"unknown","newLayer",false),"Reject invalid reorder");
 require(edgeDirection(0,16,0,0,100,100)==-1&&edgeDirection(100,84,0,0,100,100)==1&&edgeDirection(-1,0,0,0,100,100)==0&&edgeDirection(30,50,0,0,100,100)==0,"Legacy edge dimensions inclusive bounds");
 const auto directory=std::filesystem::current_path()/("quick-actions-owned-test-"+std::to_string(GetCurrentProcessId()));std::filesystem::create_directory(directory);const auto path=directory/"preferences.json";save(path,actions);require(load(path)==actions,"Legacy storage reordered roundtrip");std::ifstream before(path,std::ios::binary);const std::string original((std::istreambuf_iterator<char>(before)),{});before.close();
 HANDLE locked=CreateFileW(path.c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);require(locked!=INVALID_HANDLE_VALUE,"Lock fixture");bool failed=false;try{save(path,defaults);}catch(...){failed=true;}CloseHandle(locked);require(failed,"Atomic replacement failure exposed");require(load(path)==actions,"Failed save retained user preferences");std::filesystem::remove(path);std::filesystem::remove(directory);std::cout<<"Layer quick actions passed\n";
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
