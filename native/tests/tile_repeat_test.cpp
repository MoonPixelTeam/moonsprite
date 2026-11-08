#include "tile_repeat.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
#include "fixtures/tile_repeat_legacy.h"
int main(){try{for(const auto& c:repeatCases){const auto m=repeat::Mode(c.mode);const auto got=repeat::map({c.x,c.y},c.w,c.h,m,c.outside);if(bool(got)!=c.valid||(got&&(got->local.x!=c.lx||got->local.y!=c.ly||got->offset.x!=c.ox||got->offset.y!=c.oy)))throw std::runtime_error("mapped point");if(std::abs(repeat::fit(c.vw,c.vh,c.w,c.h,m,c.angle)-c.zoom)>1e-12)throw std::runtime_error("fit zoom");const auto offsets=repeat::offsets(m);if(offsets.size()!=(repeat::includesX(m)?3:1)*(repeat::includesY(m)?3:1))throw std::runtime_error("fixed copy count");}for(const auto& c:repeatSelectionCases)if(!selectionEqual(repeat::wrapSelection(c.input,c.w,c.h,repeat::Mode(c.mode)),c.expected))throw std::runtime_error("folded selection");std::cout<<"1024 legacy geometry cases passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
