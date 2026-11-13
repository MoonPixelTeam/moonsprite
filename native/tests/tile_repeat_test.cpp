#include "selection_tools.h"
#include <iostream>
#include <stdexcept>
using namespace moon;
#include "fixtures/tile_repeat_legacy.h"
int main(){try{for(const auto& c:repeatCases){const auto m=repeat::Mode(c.mode);const auto got=repeat::map({c.x,c.y},c.w,c.h,m,c.outside);if(bool(got)!=c.valid||(got&&(got->local.x!=c.lx||got->local.y!=c.ly||got->offset.x!=c.ox||got->offset.y!=c.oy)))throw std::runtime_error("mapped point");if(std::abs(repeat::fit(c.vw,c.vh,c.w,c.h,m,c.angle)-c.zoom)>1e-12)throw std::runtime_error("fit zoom");const auto offsets=repeat::offsets(m);if(offsets.size()!=(repeat::includesX(m)?3:1)*(repeat::includesY(m)?3:1))throw std::runtime_error("fixed copy count");}for(const auto& c:repeatSelectionCases)if(!selectionEqual(repeat::wrapSelection(c.input,c.w,c.h,repeat::Mode(c.mode)),c.expected))throw std::runtime_error("folded selection");
auto same=[](repeat::Point a,repeat::Point b){return a.x==b.x&&a.y==b.y;};
for(const auto& c:repeatNearestCases)if(!same(repeat::nearestEquivalent(c.point,c.reference,c.w,c.h,repeat::Mode(c.mode)),c.expected))throw std::runtime_error("nearest legacy equivalent");
for(const auto& c:repeatLineCases){const auto segments=repeat::lineSegments(c.points,c.w,c.h,repeat::Mode(c.mode));if(segments.size()!=c.segments.size())throw std::runtime_error("legacy line segment count");for(std::size_t i=0;i<segments.size();++i){const auto& a=segments[i];const auto& b=c.segments[i];if(!same(a.from,b.from)||!same(a.to,b.to)||a.fromProgress!=b.fromProgress||a.toProgress!=b.toProgress)throw std::runtime_error("legacy line segments");}}
if(!repeat::lineSegments(std::vector<repeat::Point>{},8,6,repeat::Mode::Both).empty())throw std::runtime_error("empty split line");
for(auto mode:{repeat::Mode::X,repeat::Mode::Y,repeat::Mode::Both}){
 const std::vector<SelectionPoint> path{{2,2},{5,2},{5,5},{2,5}};auto distant=path;
 for(auto& p:distant){if(repeat::includesX(mode))p.x+=48;if(repeat::includesY(mode))p.y-=32;}
 if(!selectionEqual(repeatedLassoSelection(distant,16,16,mode),lassoSelection(path,16,16)))throw std::runtime_error("distant lasso");
 SelectionBrushStroke brush;BrushOptions options;const bool x=repeat::includesX(mode);brush.collect(16,16,x?SelectionPoint{15,3}:SelectionPoint{3,15},x?SelectionPoint{17,3}:SelectionPoint{3,17},options,0,mode);
 const std::unordered_set<std::size_t> expected=x?std::unordered_set<std::size_t>{63,48,49}:std::unordered_set<std::size_t>{243,3,19};
 if(brush.visited!=expected||!brush.outsidePreview.empty())throw std::runtime_error("selection brush seam");
}
const auto seam=repeatedLassoSelection({{14,2},{18,2},{18,5},{14,5}},16,16,repeat::Mode::X);
if(!selectionContains(seam,15,3)||!selectionContains(seam,0,3)||selectionContains(seam,8,3))throw std::runtime_error("lasso seam");
SelectionBrushStroke square;BrushOptions squareOptions;squareOptions.size=3;squareOptions.shape=BrushShape::Square;square.collect(16,16,{0,0},{0,0},squareOptions,0,repeat::Mode::X);
if(square.visited.size()!=6||!square.visited.count(15)||square.visited.count(240)||!square.outsidePreview.empty())throw std::runtime_error("nonrepeated axis clipping");
SelectionBrushStroke outside;outside.collect(16,16,{-1,-1},{-1,-1},{});if(outside.outsidePreview.empty()||!outside.visited.empty())throw std::runtime_error("off outside preview");
std::cout<<"1024 geometry, 608 nearest equivalents, 256 split legacy lines and repeated selection gestures passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
