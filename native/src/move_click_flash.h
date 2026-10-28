#pragma once
#include "timeline_model.h"
#include "grid_snap.h"
#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <tuple>
namespace moon {
inline int moveFlashEdge(double value){const double shifted=value-.5,nearest=std::floor(shifted+.5),tolerance=std::max(1e-9,std::abs(shifted)*std::numeric_limits<double>::epsilon()*4);return int(std::ceil(std::abs(shifted-nearest)<=tolerance?nearest:shifted));}
struct MoveFlashGeometry {int left=0,top=0,right=1,bottom=1,width=1,height=1;double scale=1,phaseX=0,phaseY=0;bool minify=false;};
inline MoveFlashGeometry moveFlashGeometry(GridRect region,double originX,double originY,double scale){MoveFlashGeometry g;g.scale=scale;g.left=moveFlashEdge(originX+region.x*scale);g.top=moveFlashEdge(originY+region.y*scale);g.right=std::max(g.left+1,moveFlashEdge(originX+(region.x+region.width)*scale));g.bottom=std::max(g.top+1,moveFlashEdge(originY+(region.y+region.height)*scale));g.minify=scale<1;g.width=g.minify?g.right-g.left:int(region.width);g.height=g.minify?g.bottom-g.top:int(region.height);g.phaseX=g.minify?originX+region.x*scale-g.left:0;g.phaseY=g.minify?originY+region.y*scale-g.top:0;return g;}
struct MoveFlashRaster {std::vector<timeline::Pixel> pixels;std::size_t visitedPixels=0;};
inline MoveFlashRaster buildMoveFlashRaster(const timeline::Surface& s,GridRect region,const MoveFlashGeometry& g){if(g.width<1||g.height<1||std::uint64_t(g.width)*g.height>64*1024*1024)throw std::length_error("Move flash exceeds surface budget");MoveFlashRaster out;out.pixels.resize(std::size_t(g.width)*g.height);std::vector<int> columns(int(region.width));for(int x=0;x<int(region.width);++x)columns[x]=g.minify?std::clamp(moveFlashEdge(g.phaseX+x*g.scale),0,g.width-1):x;std::vector<int> opaque(g.height);const int localX=int(region.x)-s.offsetX,localY=int(region.y)-s.offsetY;
 for(int y=0;y<int(region.height);++y){const int row=g.minify?std::clamp(moveFlashEdge(g.phaseY+y*g.scale),0,g.height-1):y;if(g.minify&&opaque[row]==g.width)continue;const int sy=localY+y;if(sy<0||sy>=s.height)continue;const int first=std::max(0,-localX),last=std::min(int(region.width),s.width-localX);out.visitedPixels+=std::max(0,last-first);for(int x=first;x<last;++x){auto& target=out.pixels[std::size_t(row)*g.width+columns[x]];if((target>>24)==255)continue;const auto p=s.pixels[std::size_t(sy)*s.width+localX+x],alpha=p>>24;if(!alpha||(target>>24)>=alpha)continue;if(alpha==255)++opaque[row];const timeline::Pixel value=(p&255)*.2126+((p>>8)&255)*.7152+((p>>16)&255)*.0722>145?0:0xffffff;target=(alpha<<24)|value;}}return out;}
template<class Surface> class MoveClickFlashCache {
 struct Key {std::string content;std::uint64_t revision;int sx,sy,sw,sh,rx,ry,rw,rh,w,h;double scale,px,py;bool operator==(const Key& b)const{return std::tie(content,revision,sx,sy,sw,sh,rx,ry,rw,rh,w,h,scale,px,py)==std::tie(b.content,b.revision,b.sx,b.sy,b.sw,b.sh,b.rx,b.ry,b.rw,b.rh,b.w,b.h,b.scale,b.px,b.py);}};
 struct Entry {Key key;std::weak_ptr<const void> storage;Surface surface;std::size_t bytes=0;};std::vector<Entry> entries_;std::size_t bytes_=0,maxBytes_,maxEntries_;std::uint64_t builds_=0,hits_=0;
 public:explicit MoveClickFlashCache(std::size_t bytes=16*1024*1024,std::size_t count=8):maxBytes_(bytes),maxEntries_(std::max<std::size_t>(1,count)){}void clear(){entries_.clear();bytes_=0;}std::size_t size()const{return entries_.size();}std::size_t bytes()const{return bytes_;}std::uint64_t builds()const{return builds_;}std::uint64_t hits()const{return hits_;}
 template<class Build> Surface acquire(const std::string& content,const timeline::Surface& s,const timeline::Timeline::StorageStamp& stamp,GridRect region,const MoveFlashGeometry& g,Build build){
 Key key{content,stamp.revision,s.offsetX,s.offsetY,s.width,s.height,int(region.x),int(region.y),int(region.width),int(region.height),g.width,g.height,g.minify?g.scale:0,g.phaseX,g.phaseY};auto it=std::find_if(entries_.begin(),entries_.end(),[&](const Entry& e){return e.key==key;});Surface surface;
 if(it!=entries_.end()){auto old=std::move(*it);bytes_-=old.bytes;entries_.erase(it);if(stamp.owner&&old.storage.lock()==stamp.owner){surface=std::move(old.surface);++hits_;}}
 if(!surface){surface=build();++builds_;}const auto bytes=std::size_t(g.width)*g.height*4;entries_.push_back({std::move(key),stamp.owner,surface,bytes});bytes_+=bytes;while(entries_.size()>1&&(bytes_>maxBytes_||entries_.size()>maxEntries_)){bytes_-=entries_.front().bytes;entries_.erase(entries_.begin());}return surface;
 }
};
}
