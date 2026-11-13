#pragma once
// Direct native port of legacy core/isometric.ts. UI/input integration is separate.
#include <algorithm>
#include <array>
#include <charconv>
#include <cmath>
#include <limits>
#include <numeric>
#include <optional>
#include <string>
#include <vector>

namespace moon::iso {
inline constexpr double ISO_LINE_STAIR_STEP=2,ISO_GUIDE_BASE_SPACING=16;
struct Point {double x=0,y=0;};
inline bool operator==(Point a,Point b){return a.x==b.x&&a.y==b.y;}
inline bool operator!=(Point a,Point b){return !(a==b);}
struct Bounds {double left=0,top=0,right=0,bottom=0;};
struct Segment {Point start,end;};
struct LineSegment {Point from,to;};
struct GuideOptions {double spacing=ISO_GUIDE_BASE_SPACING,stairStep=ISO_LINE_STAIR_STEP;Point origin;};
struct PixelPattern {double width=0,height=0;std::vector<Point> pixels;};
enum class Direction {Right,Down,Left,Up,DownRight,DownLeft,UpLeft,UpRight};
struct StrokeState {
 Point anchor,endpoint;
 std::optional<Point> rawAnchor,rawEndpoint,gridVertex;
 std::optional<Direction> direction;
 std::optional<double> directionSamples;
};
struct StrokeAdvance:StrokeState {
 std::optional<Point> initialAnchor,lockedEndpoint;
 std::optional<std::vector<Point>> lockedEndpoints;
};
struct GridOptions {double spacing=ISO_GUIDE_BASE_SPACING;Point origin;};
struct StrokeOptions {bool diagonalOnly=false;std::optional<GridOptions> grid;};
struct GridEdge {std::string key;Point from,to,startVertex,endVertex;};
struct TraceOptions:GridOptions {
 double stairStep=ISO_LINE_STAIR_STEP,hitRadius=.55,sampleStep=.25;
 std::optional<std::string> hoveredEdgeKey;
};
struct TraceResult {std::vector<GridEdge> edges;std::optional<std::string> hoveredEdgeKey;};

namespace detail {
inline double round(double n){if(!std::isfinite(n)||n==0)return n;const auto lower=std::floor(n),value=n-lower<.5?lower:lower+1;return value==0?std::copysign(0.,n):value;}
inline double stairStep(double n){return std::isfinite(n)?std::max(1.,std::min(16.,round(n))):ISO_LINE_STAIR_STEP;}
inline double spacing(double n){return std::isfinite(n)?std::max(1.,round(n)):ISO_GUIDE_BASE_SPACING;}
inline double sign(double n){return n<0?-1:n>0?1:0;}
inline double modulo(double n,double d){return std::fmod(std::fmod(n,d)+d,d);}
inline double gcd(double a,double b){a=std::abs(round(a));b=std::abs(round(b));while(b!=0){const auto next=std::fmod(a,b);a=b;b=next;}return std::max(1.,a);}
inline Point origin(Point p){return {std::isfinite(p.x)?round(p.x):0,std::isfinite(p.y)?round(p.y):0};}
inline Point vector(Direction d,double step){switch(d){
 case Direction::Right:return {1,0};case Direction::Down:return {0,1};case Direction::Left:return {-1,0};case Direction::Up:return {0,-1};
 case Direction::DownRight:return {step,1};case Direction::DownLeft:return {-step,1};case Direction::UpLeft:return {-step,-1};case Direction::UpRight:return {step,-1};
 }return {};}
inline std::optional<Direction> direction(Point from,Point to,double step,bool diagonal=false){
 const auto dx=to.x-from.x,dy=to.y-from.y;if(dx==0&&dy==0)return {};
 const auto length=std::hypot(dx,dy);auto best=diagonal?Direction::DownRight:Direction::Right;
 double bestScore=-std::numeric_limits<double>::infinity();
 for(int i=diagonal?4:0;i<8;++i){const auto d=Direction(i);const auto v=vector(d,step);const auto score=(dx*v.x+dy*v.y)/(length*std::hypot(v.x,v.y));if(score>bestScore){bestScore=score;best=d;}}
 return best;
}
inline Point endpoint(Point from,Point to,Direction d,double step){
 const auto v=vector(d,step);if(v.y==0)return {to.x,from.y};if(v.x==0)return {from.x,to.y};
 const auto count=std::max(1.,round((step*(std::abs(to.x-from.x)+1)+std::abs(to.y-from.y)+1)/(step*step+1)));
 return {from.x+sign(v.x)*(count*step-1),from.y+sign(v.y)*(count-1)};
}
struct EdgeGeometry {Point start,pixelEnd,vertex,vector;};
inline std::optional<EdgeGeometry> edgeGeometry(Point anchor,Direction d,double step,double unit){
 if(int(d)<4)return {};step=stairStep(step);unit=spacing(unit);const auto period=unit/gcd(unit,2);const auto v=vector(d,step);const auto sx=sign(v.x),sy=sign(v.y);
 const Point delta{sx*step*period,sy*period},vertex{anchor.x+delta.x,anchor.y+delta.y};
 return EdgeGeometry{{anchor.x+(sx<0?-1:0),anchor.y+(sx<0?sy:0)},{vertex.x+(sx>0?-1:0),vertex.y+(sx>0?-sy:0)},vertex,delta};
}
// JS template-number spelling is also the lexical tie breaker for edge keys.
inline std::string number(double n){
 if(n==0)return "0";if(std::isnan(n))return "NaN";if(std::isinf(n))return n<0?"-Infinity":"Infinity";
 char buffer[64];const auto encoded=std::to_chars(buffer,buffer+64,std::abs(n),std::chars_format::general);std::string raw(buffer,encoded.ptr);
 const auto e=raw.find('e');const int exponent=e==std::string::npos?0:std::stoi(raw.substr(e+1));const auto mantissa=raw.substr(0,e);const auto dot=mantissa.find('.');std::string digits=mantissa;if(dot!=std::string::npos)digits.erase(dot,1);
 int decimal=int(dot==std::string::npos?mantissa.size():dot)+exponent;while(digits.size()>1&&digits.front()=='0'){digits.erase(digits.begin());--decimal;}while(digits.size()>1&&digits.back()=='0')digits.pop_back();
 std::string out=n<0?"-":"";
 if(std::abs(n)>=1e-6&&std::abs(n)<1e21){if(decimal<=0)return out+"0."+std::string(-decimal,'0')+digits;if(decimal>=int(digits.size()))return out+digits+std::string(decimal-int(digits.size()),'0');return out+digits.substr(0,decimal)+"."+digits.substr(decimal);}
 out+=digits[0];if(digits.size()>1)out+="."+digits.substr(1);const auto scientific=decimal-1;return out+"e"+(scientific>=0?"+":"-")+std::to_string(std::abs(scientific));
}
inline double segmentDistance(Point p,Point a,Point b){
 const auto dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;if(length<=0)return (p.x-a.x)*(p.x-a.x)+(p.y-a.y)*(p.y-a.y);
 const auto t=std::clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/length,0.,1.),nearestX=a.x+dx*t,nearestY=a.y+dy*t,x=p.x-nearestX,y=p.y-nearestY;return x*x+y*y;
}
inline std::optional<GridEdge> edgeAt(Point p,double step,GridOptions grid,double radius,const std::optional<std::string>& preferred){
 step=stairStep(step);const auto unit=spacing(grid.spacing);const auto o=origin(grid.origin);const auto period=unit/gcd(unit,2),width=step*period,center=std::floor((p.x-o.x)/width);
 std::optional<GridEdge> nearest;double nearestDistance=std::numeric_limits<double>::infinity();
 for(double h=center-1;h<=center+1;++h){const auto x=o.x+h*width,baseY=o.y+h*period,vertical=round((p.y-baseY)/unit);
  for(double v=vertical-2;v<=vertical+2;++v)for(int slope:{-1,1}){const Point anchor{x,baseY+v*unit};const auto geometry=*edgeGeometry(anchor,slope>0?Direction::DownRight:Direction::UpRight,step,unit);
   GridEdge edge{number(anchor.x)+":"+number(anchor.y)+":"+std::to_string(slope),geometry.start,geometry.pixelEnd,anchor,geometry.vertex};const auto distance=segmentDistance(p,edge.startVertex,edge.endVertex);if(distance>radius*radius)continue;
   const bool equal=std::abs(distance-nearestDistance)<1e-9,wanted=preferred&&edge.key==*preferred&&(!nearest||nearest->key!=*preferred);
   if(distance>nearestDistance&&!equal)continue;if(equal&&!wanted&&nearest&&edge.key>=nearest->key)continue;nearest=std::move(edge);nearestDistance=distance;
  }
 }return nearest;
}
inline bool valid(Bounds b){return std::isfinite(b.left)&&std::isfinite(b.top)&&std::isfinite(b.right)&&std::isfinite(b.bottom)&&b.right>b.left&&b.bottom>b.top;}
inline std::optional<Segment> clipped(double slope,double intercept,Bounds b){
 std::vector<Point> points;auto include=[&](double x,double y){if(x<b.left-1e-9||x>b.right+1e-9||y<b.top-1e-9||y>b.bottom+1e-9)return;for(auto p:points)if(std::abs(p.x-x)<1e-9&&std::abs(p.y-y)<1e-9)return;points.push_back({x,y});};
 include(b.left,slope*b.left+intercept);include(b.right,slope*b.right+intercept);include((b.top-intercept)/slope,b.top);include((b.bottom-intercept)/slope,b.bottom);if(points.size()<2)return {};
 Segment out{points[0],points[1]};double farthest=-1;for(std::size_t i=0;i<points.size();++i)for(std::size_t j=i+1;j<points.size();++j){const auto dx=points[j].x-points[i].x,dy=points[j].y-points[i].y,d=dx*dx+dy*dy;if(d<=farthest)continue;farthest=d;out={points[i],points[j]};}return out;
}
}

inline Point snapIsoPointToGridVertex(Point p,double step=ISO_LINE_STAIR_STEP,double unit=ISO_GUIDE_BASE_SPACING,Point origin={}){
 step=detail::stairStep(step);unit=detail::spacing(unit);origin=detail::origin(origin);const auto period=unit/detail::gcd(unit,2),width=step*period,localX=p.x-origin.x,localY=p.y-origin.y,center=detail::round(localX/width);
 std::optional<Point> nearest;double nearestDistance=std::numeric_limits<double>::infinity();
 for(double h=center-2;h<=center+2;++h){const auto stair=h*period,x=origin.x+stair*step,vertical=detail::round((localY-stair)/unit);for(int offset=-1;offset<=1;++offset){const auto y=origin.y+stair+(vertical+offset)*unit,d=(p.x-x)*(p.x-x)+(p.y-y)*(p.y-y);if(d>=nearestDistance)continue;nearest=Point{x,y};nearestDistance=d;}}
 return nearest.value_or(Point{detail::round(p.x),detail::round(p.y)});
}
inline double isoGuideSpacingForZoom(double zoom,double unit=ISO_GUIDE_BASE_SPACING){const auto safeZoom=std::isfinite(zoom)&&zoom>0?zoom:1;auto spacing=detail::spacing(unit);while(spacing*safeZoom<8&&spacing<8192)spacing*=2;return spacing;}
inline PixelPattern isoGuidePixelPattern(double step=ISO_LINE_STAIR_STEP,double unit=ISO_GUIDE_BASE_SPACING){
 step=detail::stairStep(step);unit=detail::spacing(unit);PixelPattern out{step*unit,unit,{}};for(double x=0;x<out.width;++x){const auto stair=std::floor(x/step),a=detail::modulo(stair,unit),b=detail::modulo(-stair,unit);out.pixels.push_back({x,a});if(b!=a)out.pixels.push_back({x,b});}return out;
}
inline std::vector<Segment> isoGuideSegments(double width,double height,Bounds b,GuideOptions options={}){
 if(!std::isfinite(width)||!std::isfinite(height)||width<=0||height<=0||!detail::valid(b))return {};b={std::clamp(b.left,0.,width),std::clamp(b.top,0.,height),std::clamp(b.right,0.,width),std::clamp(b.bottom,0.,height)};if(!detail::valid(b))return {};
 const auto unit=detail::spacing(options.spacing),step=detail::stairStep(options.stairStep);const Point o{std::isfinite(options.origin.x)?options.origin.x:0,std::isfinite(options.origin.y)?options.origin.y:0};std::vector<Segment> out;
 for(double slope:{1/step,-1/step}){const auto base=o.y-slope*o.x;const std::array<double,4> intercepts{b.top-slope*b.left,b.top-slope*b.right,b.bottom-slope*b.left,b.bottom-slope*b.right};const auto first=base+std::floor((*std::min_element(intercepts.begin(),intercepts.end())-base)/unit)*unit,last=base+std::ceil((*std::max_element(intercepts.begin(),intercepts.end())-base)/unit)*unit;
  for(double intercept=first;intercept<=last;intercept+=unit)if(auto segment=detail::clipped(slope,intercept,b))out.push_back(*segment);
 }return out;
}
inline std::vector<Segment> isoGuideSegments(double width,double height,Bounds b,double spacing){return isoGuideSegments(width,height,b,GuideOptions{spacing});}
inline Point isoLineEndpoint(Point from,Point to,double step=ISO_LINE_STAIR_STEP){step=detail::stairStep(step);const auto d=detail::direction(from,to,step);return d?detail::endpoint(from,to,*d,step):to;}
inline LineSegment isoGridLineSegment(Point from,Point to,double step=ISO_LINE_STAIR_STEP){
 step=detail::stairStep(step);const auto d=detail::direction(from,to,step,true);if(!d)return {from,to};const auto v=detail::vector(*d,step);const Point start{from.x+(v.x<0?-1:0),from.y+(v.x<0?detail::sign(v.y):0)};
 const auto count=std::max(1.,detail::round(((to.x-from.x)*v.x+(to.y-from.y)*v.y)/(v.x*v.x+v.y*v.y)));return {start,{start.x+detail::sign(v.x)*(count*step-1),start.y+detail::sign(v.y)*(count-1)}};
}
inline Point isoGridLineEndpoint(Point from,Point to,double step=ISO_LINE_STAIR_STEP){return isoGridLineSegment(from,to,step).to;}
inline TraceResult traceIsoGridPointerEdges(Point from,Point to,TraceOptions options){
 const auto step=detail::stairStep(options.stairStep),radius=std::isfinite(options.hitRadius)?std::max(.05,options.hitRadius):.55,sample=std::isfinite(options.sampleStep)?std::max(.05,options.sampleStep):.25,dx=to.x-from.x,dy=to.y-from.y,count=std::max(1.,std::ceil(std::hypot(dx,dy)/sample));TraceResult out{{},options.hoveredEdgeKey};
 for(double i=0;i<=count;++i){const auto t=i/count;auto edge=detail::edgeAt({from.x+dx*t,from.y+dy*t},step,options,radius,out.hoveredEdgeKey);const auto next=edge?std::optional<std::string>(edge->key):std::nullopt;if(edge&&next!=out.hoveredEdgeKey)out.edges.push_back(std::move(*edge));out.hoveredEdgeKey=next;}return out;
}
inline StrokeAdvance advanceIsoGridAlignedStrokeSegment(const StrokeState& state,Point target,double step,GridOptions grid){
 step=detail::stairStep(step);auto vertex=state.gridVertex.value_or(state.anchor),anchor=state.anchor,rawAnchor=vertex;const auto candidate=detail::direction(vertex,target,step,true);const auto extent=std::max(std::abs(state.endpoint.x-state.anchor.x),std::abs(state.endpoint.y-state.anchor.y));const auto previous=state.directionSamples.value_or(0);
 const auto active=state.direction&&extent>0?detail::edgeGeometry(vertex,*state.direction,step,grid.spacing):std::nullopt;
 const auto progress=active?((target.x-vertex.x)*active->vector.x+(target.y-vertex.y)*active->vector.y)/(active->vector.x*active->vector.x+active->vector.y*active->vector.y):-std::numeric_limits<double>::infinity();
 auto direction=state.direction&&extent>0&&progress>=1?state.direction:candidate?candidate:extent>0?state.direction:std::nullopt;
 double samples=direction?direction==state.direction?(candidate==state.direction?std::max(1.,previous)+1:std::max(1.,previous)):1:0;std::vector<Point> locked;std::optional<Point> initial;
 auto finish=[&](Point end){StrokeAdvance out;out.anchor=anchor;out.endpoint=end;out.rawAnchor=rawAnchor;out.rawEndpoint=target;out.gridVertex=vertex;out.direction=direction;out.directionSamples=samples;out.initialAnchor=initial;if(!locked.empty()){out.lockedEndpoint=locked.back();out.lockedEndpoints=locked;}return out;};
 if(!direction)return finish(anchor);
 for(int edge=0;edge<16384;++edge){const auto g=detail::edgeGeometry(vertex,*direction,step,grid.spacing);if(!g)return finish(anchor);if(!initial)initial=g->start;anchor=g->start;const auto length=g->vector.x*g->vector.x+g->vector.y*g->vector.y,p=length>0?((target.x-vertex.x)*g->vector.x+(target.y-vertex.y)*g->vector.y)/length:0;if(!std::isfinite(p)||p<1)return finish(g->pixelEnd);
  if(anchor!=g->pixelEnd)locked.push_back(g->pixelEnd);const auto next=g->vertex;const auto nextDirection=detail::direction(next,target,step,true);
  if(!nextDirection){vertex=next;rawAnchor=vertex;anchor=g->pixelEnd;direction.reset();samples=0;return finish(g->pixelEnd);}
  vertex=next;rawAnchor=vertex;direction=nextDirection;samples=1;const auto nextGeometry=detail::edgeGeometry(vertex,*direction,step,grid.spacing);if(!nextGeometry)return finish(g->pixelEnd);if(g->pixelEnd!=nextGeometry->start)locked.push_back(nextGeometry->start);anchor=nextGeometry->start;
 }return finish(anchor);
}
inline StrokeAdvance advanceIsoAlignedStrokeSegment(const StrokeState& state,Point target,double step=ISO_LINE_STAIR_STEP,StrokeOptions options={}){
 step=detail::stairStep(step);if(options.grid)return advanceIsoGridAlignedStrokeSegment(state,target,step,*options.grid);const auto rawAnchor=state.rawAnchor.value_or(state.anchor),rawEndpoint=state.rawEndpoint.value_or(rawAnchor);const auto candidate=detail::direction(rawAnchor,target,step,options.diagonalOnly);
 StrokeAdvance out;out.anchor=state.anchor;out.rawAnchor=rawAnchor;out.rawEndpoint=target;
 if(!candidate){out.endpoint=state.anchor;out.direction=state.direction;out.directionSamples=state.directionSamples.value_or(0);return out;}
 const auto extent=std::max(std::abs(state.endpoint.x-state.anchor.x),std::abs(state.endpoint.y-state.anchor.y)),samples=candidate==state.direction?state.directionSamples.value_or(1)+1:1,required=std::max(2.,std::min(4.,step+1));const bool established=extent>step&&state.directionSamples.value_or(0)>=required;
 const Point aligned{state.anchor.x+target.x-rawAnchor.x,state.anchor.y+target.y-rawAnchor.y};
 if(!state.direction||candidate==state.direction||state.anchor==state.endpoint||!established){out.endpoint=detail::endpoint(state.anchor,aligned,*candidate,step);out.direction=candidate;out.directionSamples=samples;return out;}
 const auto locked=state.endpoint,nextRaw=rawEndpoint;const auto nextDirection=detail::direction(nextRaw,target,step,options.diagonalOnly).value_or(*candidate);const Point nextAligned{locked.x+target.x-nextRaw.x,locked.y+target.y-nextRaw.y};out.anchor=locked;out.endpoint=detail::endpoint(locked,nextAligned,nextDirection,step);out.rawAnchor=nextRaw;out.direction=nextDirection;out.directionSamples=1;out.lockedEndpoint=locked;return out;
}
template<class Sample> void updateIsoAlignedStrokePath(std::vector<Sample>& path,const StrokeAdvance& advanced,const Sample& target){
 if(path.empty())return;const auto start=path.front(),end=path.back(),anchor=path.size()>1?path[path.size()-2]:start;auto at=[](Sample sample,Point p){sample.x=p.x;sample.y=p.y;return sample;};
 const auto locked=advanced.lockedEndpoints.value_or(advanced.lockedEndpoint?std::vector<Point>{*advanced.lockedEndpoint}:std::vector<Point>{});const bool changed=advanced.anchor!=Point{double(anchor.x),double(anchor.y)};
 if(!locked.empty()){if(path.size()==1){path[0]=at(start,advanced.initialAnchor.value_or(Point{double(start.x),double(start.y)}));path.push_back(at(end,locked[0]));}else path.back()=at(end,locked[0]);for(std::size_t i=1;i<locked.size();++i)path.push_back(at(end,locked[i]));path.push_back(target);return;}
 if(path.size()==1){path[0]=at(start,advanced.anchor);path.push_back(target);return;}
 if(changed&&path.size()>2&&Point{double(anchor.x),double(anchor.y)}==Point{double(end.x),double(end.y)}){path.back()=at(end,advanced.anchor);path.push_back(target);return;}
 if(changed)path[path.size()-2]=at(anchor,advanced.anchor);path.back()=target;
}
}
