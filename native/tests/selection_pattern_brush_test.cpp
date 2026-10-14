#include "document.h"
#include "selection_pattern_brush.h"
#include <iostream>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int main(){try{using namespace moon;Document d(4,2);d.beginStroke({1,0},0x80332211);d.commitStroke();d.beginStroke({2,0},0xff665544);d.commitStroke();auto before=d.historySize();auto captured=createSelectionPatternBrush(d.pixels(),4,2,SelectionMask{1,0,2,2,{1,0,1,1}});CHECK(captured&&captured->sourceX==1&&captured->sourceY==0&&captured->colors==std::vector<std::uint32_t>({0x80332211,0,0,0}));CHECK(d.historySize()==before);CHECK(!createSelectionPatternBrush(d.pixels(),4,2,SelectionMask{0,1,4,1,{}}));bool large=false;try{createSelectionPatternBrush(std::vector<std::uint32_t>(65),65,1,SelectionMask{0,0,65,1,{}});}catch(const std::invalid_argument&){large=true;}CHECK(large);std::cout<<"selection pattern brush passed\n";return 0;}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
