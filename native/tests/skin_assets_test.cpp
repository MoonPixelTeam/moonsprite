#include "skin_assets.h"
#include <windows.h>
#include <iostream>
#include <fstream>
#include <stdexcept>
#define CHECK(x) do {if(!(x)) throw std::runtime_error(#x);} while(false)
using namespace moon;
template<class F> void rejects(F f) {bool rejected=false;try {f();} catch(const std::exception&) {rejected=true;} CHECK(rejected);}
int wmain(int argc,wchar_t** argv) {
  try {
    CHECK(argc==2);
    auto patch=importSkinPng(std::filesystem::path(argv[1]));
    CHECK(patch.bitmap->width==9 && patch.bitmap->height==9);
    CHECK(patch.bitmap->pixels[0]==0); CHECK(patch.bitmap->pixels[40]==0xff48352c);
    auto invalid=patch;invalid.left=patch.bitmap->width;
    rejects([&]{validatePatch(invalid);});
    const auto dir=std::filesystem::current_path()/(L"MoonSprite-皮肤测试-"+std::to_wstring(GetCurrentProcessId()));
    CHECK(std::filesystem::create_directory(dir));    const auto badPng=dir/L"错误.png";{std::ofstream out(badPng);out<<"invalid PNG";}
    rejects([&]{importSkinPng(badPng);});
    CHECK(std::filesystem::remove(badPng));CHECK(std::filesystem::remove(dir));
    std::cout<<"Skin PNG decoding and patch validation passed\n";return 0;
  } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
