#include "outline_samples.h"

namespace moon {
namespace {
int direction(int x,int y){return y<0?(x<0?0:x>0?2:1):y>0?(x<0?5:x>0?7:6):x<0?3:x>0?4:-1;}
bool kernel(int x,int y,int r,int kind){if(!x&&!y)return false;if(kind==2)return !y&&std::abs(x)<=r;if(kind==3)return !x&&std::abs(y)<=r;if(kind==0)return x*x+y*y<=r*r;return std::max(std::abs(x),std::abs(y))<=r;}
}
std::vector<OutlineSample> outlineSamples(const timeline::Surface& surface,int width,int height,const std::optional<SelectionMask>& selection,const OutlineSampling& settings){
 raster::validate(surface);if(width<1||height<1||!std::isfinite(settings.thickness))throw std::invalid_argument("Invalid outline geometry");
 if(selection&&(selection->width<1||selection->height<1||(!selection->mask.empty()&&std::uint64_t(selection->width)*selection->height!=selection->mask.size())))throw std::invalid_argument("Invalid outline selection");
 const int radius=int(std::clamp(std::floor(settings.thickness+.5),1.,64.));
 std::int64_t l=width,t=height,r=0,b=0;
 if(selection){l=selection->x;t=selection->y;r=l+selection->width;b=t+selection->height;}
 else{for(int y=0;y<surface.height;++y)for(int x=0;x<surface.width;++x)if(surface.pixels[std::size_t(y)*surface.width+x]>>24){const auto wx=std::int64_t(surface.offsetX)+x,wy=std::int64_t(surface.offsetY)+y;l=std::min(l,wx);t=std::min(t,wy);r=std::max(r,wx+1);b=std::max(b,wy+1);}if(r<=l||b<=t)return {};}
 const int left=int(std::clamp<std::int64_t>(l-radius,0,width)),top=int(std::clamp<std::int64_t>(t-radius,0,height)),right=int(std::clamp<std::int64_t>(r+radius,0,width)),bottom=int(std::clamp<std::int64_t>(b+radius,0,height));if(right<=left||bottom<=top)return {};
 auto read=[&](int x,int y){return raster::readWorld(surface,x,y);};
 auto source=[&](int x,int y){if(x<left||y<top||x>=right||y>=bottom||(selection&&!selectionContains(selection,x,y)))return false;const auto color=read(x,y);return settings.sourceColor?(color>>24)&&color==*settings.sourceColor:(color>>24)&&color!=settings.background;};
 auto allowed=[&](int x,int y){const auto d=direction(x,y);return d>=0&&(settings.directions&(1u<<d));};
 struct Boundary{int x,y;timeline::Pixel color;};std::vector<Boundary> boundary;
 for(int y=top;y<bottom;++y)for(int x=left;x<right;++x){if(!source(x,y))continue;bool edge=false;for(int dy=-1;dy<=1&&!edge;++dy)for(int dx=-1;dx<=1;++dx)if((dx||dy)&&!source(x+dx,y+dy)){edge=true;break;}if(edge)boundary.push_back({x,y,read(x,y)});}
 struct Candidate{timeline::Pixel color;int distance,rank;};std::unordered_map<std::size_t,Candidate> clipped,unclipped;std::vector<std::size_t> clippedOrder,unclippedOrder;
 auto add=[](auto& map,auto& order,std::size_t index,timeline::Pixel color,int distance,int rank){auto found=map.find(index);if(found!=map.end()&&(found->second.distance<distance||(found->second.distance==distance&&found->second.rank<=rank)))return;if(found==map.end())order.push_back(index);map[index]={color,distance,rank};};
 std::vector<OutlineSample> result;std::unordered_map<std::size_t,bool> seen;
 if(settings.position!=0){for(const auto& s:boundary)for(int dy=-radius;dy<=radius;++dy)for(int dx=-radius;dx<=radius;++dx){if(!kernel(dx,dy,radius,settings.kernel)||!allowed(dx,dy))continue;const auto x=s.x+dx,y=s.y+dy;if(x<0||y<0||x>=width||y>=height||source(x,y)||(!settings.sourceColor&&(read(x,y)>>24)))continue;const auto index=std::size_t(y)*width+x;const auto distance=dx*dx+dy*dy,rank=(-dy+radius)*(radius*2+1)+(-dx+radius);add(unclipped,unclippedOrder,index,s.color,distance,rank);if(selection&&selectionContains(selection,x,y))add(clipped,clippedOrder,index,s.color,distance,rank);}
 const bool clip=selection&&!clipped.empty();const auto& candidates=clip?clipped:unclipped;for(auto index:clip?clippedOrder:unclippedOrder){result.push_back({index,candidates.at(index).color});seen[index]=true;}}
 if(settings.position!=1){const int inner=radius-1;for(const auto& s:boundary){bool edge=false;for(int dy=-1;dy<=1&&!edge;++dy)for(int dx=-1;dx<=1;++dx)if((dx||dy)&&!source(s.x+dx,s.y+dy)&&kernel(dx,dy,1,settings.kernel)&&allowed(dx,dy)){edge=true;break;}if(!edge)continue;for(int dy=-inner;dy<=inner;++dy)for(int dx=-inner;dx<=inner;++dx){if((dx||dy)&&(!kernel(dx,dy,inner,settings.kernel)||!allowed(-dx,-dy)))continue;const auto x=s.x+dx,y=s.y+dy;if(x<left||y<top||x>=right||y>=bottom||!source(x,y))continue;const auto index=std::size_t(y)*width+x;if(seen.emplace(index,true).second)result.push_back({index,read(x,y)});}}}
 return result;
}
std::vector<OutlineSample> outlineBoundarySamples(const timeline::Surface& surface,int width,int height,const std::optional<SelectionMask>& selection,const OutlineSampling& settings){
 raster::validate(surface);if(!selection)return {};if(width<1||height<1||!std::isfinite(settings.thickness)||selection->width<1||selection->height<1||(!selection->mask.empty()&&std::uint64_t(selection->width)*selection->height!=selection->mask.size()))throw std::invalid_argument("Invalid outline boundary geometry");
 const int radius=int(std::clamp(std::floor(settings.thickness+.5),1.,64.));
 const int left=std::max(0,selection->x),top=std::max(0,selection->y),right=int(std::min<std::int64_t>(width,std::int64_t(selection->x)+selection->width)),bottom=int(std::min<std::int64_t>(height,std::int64_t(selection->y)+selection->height));std::vector<OutlineSample> result;
 for(int y=top;y<bottom;++y)for(int x=left;x<right;++x){if(!selectionContains(selection,x,y))continue;bool outside=false;for(int dy=-radius;dy<=radius&&!outside;++dy)for(int dx=-radius;dx<=radius;++dx){if(!kernel(dx,dy,radius,settings.kernel))continue;const int d=direction(dx,dy);if(d<0||!(settings.directions&(1u<<d)))continue;if(!selectionContains(selection,x+dx,y+dy)){outside=true;break;}}if(outside)result.push_back({std::size_t(y)*width+x,raster::readWorld(surface,x,y)});}
 return result;
}
timeline::Pixel outlineStrokeColor(timeline::Pixel color,timeline::Pixel reference,bool smartHue,double darkness,bool followOpacity){
 if((!smartHue&&!followOpacity)||!(reference>>24))return color;
 const auto alpha=followOpacity?timeline::Pixel(std::floor((color>>24)*double(reference>>24)/255.+.5)):color>>24;
 if(!smartHue)return (color&0xffffff)|(alpha<<24);
 if(!std::isfinite(darkness))darkness=45;const double multiplier=1-std::clamp(std::floor(darkness+.5),0.,100.)/100.;auto result=alpha<<24;for(int shift:{0,8,16})result|=timeline::Pixel(std::floor(((reference>>shift)&255)*multiplier+.5))<<shift;return result;
}

}
