#include <array>
#include "theme_atlas.h"
#include <windows.h>
#include <fstream>
#include <iostream>
#include <stdexcept>
#define CHECK(x) do {if(!(x)) throw std::runtime_error(#x);} while(false)
using namespace moon;
template<class F> void rejects(F f) {bool failed=false;try{f();}catch(const std::exception&){failed=true;}CHECK(failed);}
int wmain(int argc,wchar_t** argv) {
  try {
    CHECK(argc==2);const auto source=std::filesystem::path(argv[1]);
    auto load=[&](const std::filesystem::path& path) {
      try {return loadThemeAtlas(path);}
      catch(const std::exception& e) {throw std::runtime_error(path.u8string()+": "+e.what());}
    };
    auto theme=load(source);
    CHECK(theme.parts.size()==56);CHECK(theme.sheet->width==256 && theme.sheet->height==224);
    const auto& button=theme.assets.patches.at("button.normal");CHECK(button.bitmap->width==13 && button.left==2);
    CHECK(button.bitmap->pixels[0]==0);
    CHECK(button.bitmap->pixels[6*13+6]==theme.sheet->pixels[(4+6)*256+4+6]);
    CHECK(theme.assets.text.at("button.pressed").x==1);CHECK(theme.assets.colors.at("accent")==0xffff7929);
    CHECK(theme.parts[0].connected);CHECK(!theme.parts[16+2].connected);
    const auto asepritePath=source.parent_path().parent_path()/"aseprite-default/theme.xml";
    const auto aseprite=load(asepritePath);
    CHECK(aseprite.parts.size()==345);CHECK(aseprite.sheet->width==304 && aseprite.sheet->height==304);
    const auto& originalButton=aseprite.assets.patches.at("button.normal");
    CHECK(originalButton.bitmap->width==14 && originalButton.bitmap->height==16);
    CHECK(originalButton.left==4 && originalButton.bottom==6);
    CHECK(originalButton.bitmap->pixels[6*14+6]==aseprite.sheet->pixels[6*304+48+6]);
    CHECK(aseprite.assets.patches.count("tool.pencil")==1);
    const auto dir=std::filesystem::current_path()/(L"图集测试-"+std::to_wstring(GetCurrentProcessId()));
    CHECK(std::filesystem::create_directory(dir));std::filesystem::copy_file(source.parent_path()/"sheet.png",dir/L"sheet.png");
    const auto target=dir/L"theme.xml";
    std::ifstream in(source);const std::string xml((std::istreambuf_iterator<char>(in)),{});
    auto write=[&](const std::string& data){std::ofstream out(target,std::ios::binary);out<<data;CHECK(bool(out));};
    write(xml);CHECK(loadThemeAtlas(target).parts.size()==56);
    auto changed=xml;auto position=changed.find("x=\"4\"");CHECK(position!=std::string::npos);
    changed.replace(position,5,"x=\"255\"");write(changed);rejects([&]{loadThemeAtlas(target);});
    changed=xml;position=changed.find("id=\"button_hot\"");CHECK(position!=std::string::npos);
    changed.replace(position,15,"id=\"button_normal\"");write(changed);rejects([&]{loadThemeAtlas(target);});
    changed=xml;position=changed.find("part=\"panel\"");CHECK(position!=std::string::npos);
    changed.replace(position,12,"part=\"missing\"");write(changed);rejects([&]{loadThemeAtlas(target);});
    changed=xml;position=changed.find("<theme ");changed.insert(position,"<!DOCTYPE theme [<!ENTITY example SYSTEM 'file:///missing'>]>\n");
    write(changed);rejects([&]{loadThemeAtlas(target);});
    write(xml.substr(0,xml.size()/2));rejects([&]{loadThemeAtlas(target);});
    write(xml);CHECK(loadThemeAtlas(target).assets.patches.at("button.normal").bitmap->pixels==button.bitmap->pixels);
    // The default UI must use external slices, and reloading the same path must
    // read replaced PNG pixels rather than retaining the previous image.
    const auto darkPath=source.parent_path().parent_path()/"moonsprite-dark/theme.xml";
    const auto dark=load(darkPath);
    for(const auto* slot:{"button.normal","canvas_frame","tab_active","panel_tab_active","panel_tab_inactive","document_frame","color_well","panel"})
      CHECK(dark.assets.patches.count(slot)==1);
    for(const auto& part:dark.parts)CHECK(part.id!="button_normal" && part.id!="button_hot" && part.id!="button_selected" && part.id!="button_disabled" && part.id!="button_focused");
    CHECK(dark.assets.patches.at("button.normal").bitmap->pixels==dark.assets.patches.at("icon_button.normal").bitmap->pixels);
    const auto& iconButton=dark.assets.patches.at("icon_button.normal");
    CHECK(iconButton.bitmap->width==11 && iconButton.bitmap->height==12);
    CHECK(iconButton.left==2 && iconButton.right==2 && iconButton.top==2 && iconButton.bottom==3);
    CHECK(iconButton.bitmap->pixels[2*11+2]==0xff352620);
    const auto& hotIconButton=dark.assets.patches.at("icon_button.hover");
    CHECK(hotIconButton.bitmap->pixels[2*11+2]==0xff443229);
    CHECK(!dark.assets.patches.count("close_button.normal"));
    for(const auto& part:dark.parts) CHECK(part.id!="dialog_close_normal" && part.id!="dialog_close_hot" && part.id!="tool_pencil" && part.id!="tool_eraser");
    const auto& inputNormal=dark.assets.patches.at("entry.normal");
    CHECK(inputNormal.bitmap->width==5 && inputNormal.bitmap->height==14);
    CHECK(!dark.assets.patches.count("entry.focus"));
    CHECK(dark.assets.patches.at("slider.normal").bitmap->width==9);
    CHECK(!dark.assets.patches.count("slider.focus"));
    CHECK(dark.assets.patches.at("slider.fill").bitmap->width==3);
    CHECK(dark.assets.patches.at("slider.fill").bitmap->height==12);
    const auto sliderReference=importSkinPng(darkPath.parent_path()/"slider-reference.png",256).bitmap;
    CHECK(sliderReference->width==119 && sliderReference->height==35);
    const int trackColumns[]{0,1,2,115,98,115,116,117,118};
    const auto bitmap=dark.assets.patches.at("slider.normal").bitmap;
    for(int y=0;y<18;++y) for(int x=0;x<9;++x) {
      const int sourceY=y-2;
      CHECK(bitmap->pixels[y*9+x]==(sourceY<0?0:sliderReference->pixels[sourceY*119+trackColumns[x]]));
    }
    // Latest slider keeps both inner track edges; discarded icon regions are really clear.
    CHECK(dark.assets.patches.at("slider.normal").bitmap->pixels[5*9+3]==0xff674f42);
    CHECK(dark.assets.patches.at("slider.normal").bitmap->pixels[5*9+5]==0xff674f42);
    for(const auto rect:{std::array<int,4>{0,16,16,16},std::array<int,4>{20,16,16,16},std::array<int,4>{32,36,11,12},std::array<int,4>{48,36,11,12}})
      for(int y=rect[1];y<rect[1]+rect[3];++y) for(int x=rect[0];x<rect[0]+rect[2];++x) CHECK((dark.sheet->pixels[y*dark.sheet->width+x]>>24)==0);
    std::ifstream darkIn(darkPath);write(std::string((std::istreambuf_iterator<char>(darkIn)),{}));
    std::filesystem::copy_file(darkPath.parent_path()/"sheet.png",dir/L"sheet.png",std::filesystem::copy_options::overwrite_existing);
    const auto before=loadThemeAtlas(target).assets.patches.at("button.normal").bitmap->pixels;
    CHECK(before==dark.assets.patches.at("button.normal").bitmap->pixels);
    std::filesystem::copy_file(asepritePath.parent_path()/"sheet.png",dir/L"sheet.png",std::filesystem::copy_options::overwrite_existing);
    // The expanded default atlas cannot be replaced by the smaller Aseprite sheet.
    rejects([&]{loadThemeAtlas(target);});
    CHECK(std::filesystem::remove(target));CHECK(std::filesystem::remove(dir/L"sheet.png"));CHECK(std::filesystem::remove(dir));
    std::cout<<"Theme atlas, crop, XML validation and reload checks passed\n";return 0;
  } catch(const std::exception& e) {std::cerr<<e.what()<<'\n';return 1;}
}
