#include "palette_clipboard.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int main(){try{
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":10,"g":30,"b":80,"a":255}])oracle");
check(parsed && parsed->colors==std::vector<timeline::Pixel>{0xff501e0au},"legacy colors 0");
check(parsed->columns==0 && parsed->slots.empty(),"V1 has no invented layout");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"a":127.5,"b":1e2,"g":-20.8,"r":300.4,"extra":true}])oracle");
check(parsed && parsed->colors==std::vector<timeline::Pixel>{0x806400ffu},"legacy colors 1");
check(parsed->columns==0 && parsed->slots.empty(),"V1 has no invented layout");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255},{"r":10,"g":30,"b":80,"a":255}],"layout":{"columns":3,"slots":[0,null,null,null,null,1]}})oracle");
check(parsed && parsed->colors==std::vector<timeline::Pixel>{0xff501e0au,0xff501e0au},"legacy colors 2");
check(parsed->columns==3 && parsed->slots==std::vector<std::optional<std::size_t>>{0,{},{},{},{},1},"legacy sparse layout 2");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":0.5,"g":1.49,"b":254.5,"a":0}])oracle");
check(parsed && parsed->colors==std::vector<timeline::Pixel>{0xff0101u},"legacy colors 3");
check(parsed->columns==0 && parsed->slots.empty(),"V1 has no invented layout");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":-0.5,"g":1,"b":2,"a":3}])oracle");
check(parsed && parsed->colors==std::vector<timeline::Pixel>{0x3020100u},"legacy colors 4");
check(parsed->columns==0 && parsed->slots.empty(),"V1 has no invented layout");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":10,"g":30,"b":80,"a":255}] trailing)oracle");
check(!parsed,"legacy reject 5");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:junk {"r":10,"g":30,"b":80,"a":255})oracle");
check(!parsed,"legacy reject 6");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[])oracle");
check(!parsed,"legacy reject 7");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":1,"g":2,"b":3}])oracle");
check(!parsed,"legacy reject 8");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":"1","g":2,"b":3,"a":4}])oracle");
check(!parsed,"legacy reject 9");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":true,"g":2,"b":3,"a":4}])oracle");
check(!parsed,"legacy reject 10");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[null])oracle");
check(!parsed,"legacy reject 11");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:[{"r":1e400,"g":2,"b":3,"a":4}])oracle");
check(!parsed,"legacy reject 12");}
{auto parsed=parsePaletteClipboard(R"oracle(other text)oracle");
check(!parsed,"legacy reject 13");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255}],"layout":{"columns":0,"slots":[0]}})oracle");
check(!parsed,"legacy reject 14");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255}],"layout":{"columns":2,"slots":[0]}})oracle");
check(!parsed,"legacy reject 15");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255}],"layout":{"columns":1,"slots":[1]}})oracle");
check(!parsed,"legacy reject 16");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255}],"layout":{"columns":1,"slots":[-1]}})oracle");
check(!parsed,"legacy reject 17");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255}],"layout":{"columns":1.2,"slots":[0]}})oracle");
check(!parsed,"legacy reject 18");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255}],"layout":{"columns":1,"slots":[0.5]}})oracle");
check(!parsed,"legacy reject 19");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[{"r":10,"g":30,"b":80,"a":255}]})oracle");
check(!parsed,"legacy reject 20");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V2:{"colors":[],"layout":{"columns":1,"slots":[null]}})oracle");
check(!parsed,"legacy reject 21");}
{auto parsed=parsePaletteClipboard(R"oracle(MOONSPRITE_PALETTE_V1:  [ {"r":10,"g":30,"b":80,"a":255} ] 
)oracle");
check(parsed && parsed->colors==std::vector<timeline::Pixel>{0xff501e0au},"legacy colors 22");
check(parsed->columns==0 && parsed->slots.empty(),"V1 has no invented layout");}
std::cout<<"Palette clipboard: 23 actual legacy parser cases passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<"\n";return 1;}}
