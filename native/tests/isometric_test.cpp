#include "isometric.h"
#include "selection_tools.h"
#include <iostream>
#include <stdexcept>
using namespace moon::iso;
struct Sample {double x,y,pressure;int id;};
bool equal(Direction,Direction);
bool equal(const std::string&,const std::string&);
bool equal(const Segment&,const Segment&);
bool equal(const GridEdge&,const GridEdge&);
bool equal(const Sample&,const Sample&);
bool equal(double a,double b){return (std::isnan(a)&&std::isnan(b))||a==b||std::abs(a-b)<1e-9;}
bool equal(Point a,Point b){return equal(a.x,b.x)&&equal(a.y,b.y);}
template<class T> bool equal(const std::optional<T>& a,const std::optional<T>& b);
template<class T> bool equal(const std::vector<T>& a,const std::vector<T>& b){if(a.size()!=b.size())return false;for(std::size_t i=0;i<a.size();++i)if(!equal(a[i],b[i]))return false;return true;}
template<class T> bool equal(const std::optional<T>& a,const std::optional<T>& b){return bool(a)==bool(b)&&(!a||equal(*a,*b));}
bool equal(Direction a,Direction b){return a==b;}
bool equal(const std::string& a,const std::string& b){return a==b;}
bool equal(const LineSegment& a,const LineSegment& b){return equal(a.from,b.from)&&equal(a.to,b.to);}
bool equal(const Segment& a,const Segment& b){return equal(a.start,b.start)&&equal(a.end,b.end);}
bool equal(const PixelPattern& a,const PixelPattern& b){return equal(a.width,b.width)&&equal(a.height,b.height)&&equal(a.pixels,b.pixels);}
bool equal(const GridEdge& a,const GridEdge& b){return a.key==b.key&&equal(a.from,b.from)&&equal(a.to,b.to)&&equal(a.startVertex,b.startVertex)&&equal(a.endVertex,b.endVertex);}
bool equal(const TraceResult& a,const TraceResult& b){return equal(a.edges,b.edges)&&equal(a.hoveredEdgeKey,b.hoveredEdgeKey);}
bool equal(const StrokeAdvance& a,const StrokeAdvance& b){return equal(a.anchor,b.anchor)&&equal(a.endpoint,b.endpoint)&&equal(a.rawAnchor,b.rawAnchor)&&equal(a.rawEndpoint,b.rawEndpoint)&&equal(a.gridVertex,b.gridVertex)&&equal(a.direction,b.direction)&&equal(a.directionSamples,b.directionSamples)&&equal(a.initialAnchor,b.initialAnchor)&&equal(a.lockedEndpoint,b.lockedEndpoint)&&equal(a.lockedEndpoints,b.lockedEndpoints);}
bool equal(const Sample& a,const Sample& b){return equal(a.x,b.x)&&equal(a.y,b.y)&&equal(a.pressure,b.pressure)&&a.id==b.id;}
template<class T,class U> void check(const T& actual,const U& expected,const char* label){if(!equal(actual,expected))throw std::runtime_error(label);}
void checkPath(std::vector<Sample> path,const StrokeAdvance& advanced,Sample target,const std::vector<Sample>& expected,const char* label){updateIsoAlignedStrokePath(path,advanced,target);check(path,expected,label);}
#include "fixtures/isometric_legacy.h"
int main(){try{
 legacyFixtures();
 // Retain the legacy invariant against the rasterizer actually used by native tools.
 for(double step:{1,2,3,4})for(double spacing:{5,8,16}){
  const auto pattern=isoGuidePixelPattern(step,spacing);const Point origin{5,-3};
  const auto start=snapIsoPointToGridVertex({-12,9},step,spacing,origin);
  for(int dx:{-1,1})for(int dy:{-1,1}){
   const Point target{start.x+dx*step*spacing,start.y+dy*spacing};const auto segment=isoGridLineSegment(start,target,step);
   TraceOptions options;options.stairStep=step;options.spacing=spacing;options.origin=origin;
   auto verify=[&](Point a,Point b){for(const auto& p:moon::selectionLine({int(a.x),int(a.y)},{int(b.x),int(b.y)},true)){
    const Point local{detail::modulo(p.x-origin.x,pattern.width),detail::modulo(p.y-origin.y,pattern.height)};
    if(std::find(pattern.pixels.begin(),pattern.pixels.end(),local)==pattern.pixels.end())throw std::runtime_error("raster pixel outside ISO guide");
   }};
   verify(segment.from,segment.to);for(const auto& edge:traceIsoGridPointerEdges(start,target,options).edges)verify(edge.from,edge.to);
  }
 }
 std::cout<<legacyFixtureCount<<" legacy ISO checks and native raster alignment passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
