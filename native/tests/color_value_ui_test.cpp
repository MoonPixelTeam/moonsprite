#include "color_value_ui.h"
#include "native_color_editor_palette.h"
#include "color_picker_model.h"
#include <fstream>
#include <iomanip>
#include <sstream>
#include <stdexcept>
#include <iostream>
int main(int argc,char** argv) {
  using namespace moon;
  auto check=[](bool ok){if(!ok) throw std::runtime_error("Legacy color display contract mismatch");};
  check(displayColorRoleHex(0xff563412)==U"#123456");
  check(displayColorRoleHex(0x80563412)==U"#12345680");
  check(displayColorRoleHex(0)==U"#00000000");
  check(displayColorRoleHex(0xffffffff)==U"#FFFFFF");
  check(colorRoleTextColor(0xffffffff)==0xff0d0a09);
  check(colorRoleTextColor(0xff000000)==0xffffffff);
  check(colorRoleTextColor(0x7f000000)==0xff0d0a09);
  check(colorRoleTextColor(0x80000000)==0xffffffff);
  check(colorRoleTextColor(0xff007600)==0xffffffff);
  check(colorRoleTextColor(0xff00ff00)==0xff0d0a09);
  if(argc>1){
    std::ifstream input(argv[1]);check(bool(input));std::string line;int count=0;
    auto entries=[](std::istream& in){std::size_t size;in>>size;std::vector<ColorEditorPaletteEntry> result;for(std::size_t i=0;i<size;++i){int id;std::string name;std::uint32_t color;in>>id>>std::quoted(name)>>color;result.push_back({id,std::u32string(name.begin(),name.end()),color});}return result;};
    while(std::getline(input,line)){std::istringstream row(line);char type;row>>type;
      if(type=='P'){const auto source=entries(row);std::size_t n;row>>n;std::vector<int> order(n);for(auto& id:order)row>>id;bool active;row>>active;const auto expected=entries(row);check((active?colorEditorPalette(source,order):std::vector<ColorEditorPaletteEntry>{})==expected);}
      else if(type=='S'){const auto left=entries(row),right=entries(row);bool expected;row>>expected;check((left==right)==expected);}
      else if(type=='H'){int alpha,valid;std::string cps;std::uint32_t expected;row>>alpha>>std::quoted(cps)>>valid>>expected;std::istringstream points(cps);std::u32string text;unsigned point;while(points>>point)text.push_back(char32_t(point));std::uint32_t result=0xdeadbeef;check(pickerParseRgbaHex(text,result,alpha)==bool(valid));check(result==(valid?expected:0xdeadbeef));}
      else check(false);check(bool(row));++count;
    }
    check(count>300);std::cout<<count<<" actual legacy palette/equality/paste oracle cases passed\n";
  }
  std::cout<<"Legacy color role HEX/contrast checks passed\n";
}
