#include "document.h"
#include "pattern_brush_import.h"
#include <iostream>
#include <stdexcept>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int wmain(int argc,wchar_t** argv){try{
 using namespace moon;auto rgba=createPatternBrushFromRgba(2,1,{1,2,3,0,4,5,6,128});CHECK(rgba.colors==std::vector<std::uint32_t>({0x00030201,0x80060504}));CHECK(rgba.coverage==std::vector<std::uint8_t>({0,128}));CHECK(rgba.intrinsicSize);
 bool bad=false;try{createPatternBrushFromRgba(65,1,{});}catch(const std::invalid_argument&){bad=true;}CHECK(bad);
 CHECK(argc==2);auto imported=importPatternBrush(argv[1]);CHECK(!imported.name.empty()&&imported.id.rfind("import:",0)==0);CHECK(imported.brush.width>0&&imported.brush.height>0);
 auto& b=imported.brush;for(std::size_t i=0;i<b.colors.size();++i)CHECK(b.coverage[i]==b.colors[i]>>24);
 PatternFillOptions options;options.brushes={b};Document d(b.width,b.height);CHECK(d.fillPatternPixels({0,0},0,options));for(std::size_t i=0;i<b.colors.size();++i)CHECK(d.pixels()[i]==((b.colors[i]>>24)?b.colors[i]:0));d.undo();CHECK(!d.canUndo());d.redo();
 bad=false;try{importPatternBrush(L"not-present.png");}catch(const std::runtime_error&){bad=true;}CHECK(bad);
 std::cout<<"pattern image import checks passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
