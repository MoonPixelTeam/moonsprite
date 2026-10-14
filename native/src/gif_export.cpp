#include "gif_export.h"
#include "layer_compositor.h"
#include <algorithm>
#include <functional>
#include <unordered_map>
#include <stdexcept>
namespace moon {namespace {
constexpr std::size_t maxFrames=10000,maxPixels=64*1024*1024;
void append(std::vector<std::string>& out,const std::vector<std::string>& next){if(out.size()+next.size()>maxFrames)throw std::runtime_error("GIF expanded sequence exceeds native export budget");out.insert(out.end(),next.begin(),next.end());}
void pingPong(std::vector<std::string>& out){auto copy=out;if(copy.size()>2)for(int i=int(copy.size())-2;i>0;--i){if(out.size()==maxFrames)throw std::runtime_error("GIF expanded sequence exceeds native export budget");out.push_back(copy[i]);}}
void u16(std::vector<std::uint8_t>& out,int n){out.push_back(std::uint8_t(n));out.push_back(std::uint8_t(n>>8));}
void ascii(std::vector<std::uint8_t>& out,const char* text){while(*text)out.push_back(std::uint8_t(*text++));}
std::vector<std::uint8_t> lzw(const std::vector<std::uint8_t>& indices){
 int size=9,next=258,bits=0;std::uint32_t buffer=0;std::unordered_map<unsigned,int> dict;std::vector<std::uint8_t> out;
 auto write=[&](int code){buffer|=std::uint32_t(code)<<bits;bits+=size;while(bits>=8){out.push_back(std::uint8_t(buffer));buffer>>=8;bits-=8;}};
 write(256);if(!indices.empty()){int prefix=indices[0];for(std::size_t i=1;i<indices.size();++i){const auto suffix=indices[i];const unsigned key=(unsigned(prefix)<<8)|suffix;auto it=dict.find(key);if(it!=dict.end()){prefix=it->second;continue;}write(prefix);if(next<4096){dict.emplace(key,next++);if(next>(1<<size) && size<12)++size;}else{write(256);dict.clear();size=9;next=258;}prefix=suffix;}write(prefix);}write(257);if(bits)out.push_back(std::uint8_t(buffer));return out;
}
}
std::vector<std::string> gifExportFrameIds(const timeline::State& state,const GifExportOptions& options){
 if(state.frames.empty())throw std::invalid_argument("No GIF frames");const timeline::LoopSection* root=nullptr;for(const auto& s:state.loopSections)if(s.id==options.loopSectionId)root=&s;
 int start=std::clamp(options.frameStart-1,0,int(state.frames.size())-1),end=std::max(start,std::clamp(options.frameEnd-1,0,int(state.frames.size())-1));auto range=root?timeline::loopRange(state,*root):timeline::LoopRange{};if(range.start>=0 && range.end>=0){start=range.start;end=range.end;}else root=nullptr;
 std::function<std::vector<std::string>(const timeline::LoopSection*,int,int)> expand=[&](const timeline::LoopSection* section,int left,int right){
  struct Nested {const timeline::LoopSection* section;timeline::LoopRange range;};std::vector<Nested> candidates,nested;
  for(const auto& c:state.loopSections){auto r=timeline::loopRange(state,c);if((!section || c.id!=section->id) && r.start>=left && r.end<=right && r.start>=0 && (r.start!=left || r.end!=right))candidates.push_back({&c,r});}
  for(const auto& c:candidates){bool contained=false;for(const auto& o:candidates)if(o.section->id!=c.section->id && o.range.start<=c.range.start && o.range.end>=c.range.end && (o.range.start!=c.range.start || o.range.end!=c.range.end))contained=true;if(!contained)nested.push_back(c);}
  const bool reverse=section && (section->direction=="reverse" || section->direction=="ping-pong-reverse");std::vector<std::string> sequence;
  for(int index=reverse?right:left;reverse?index>=left:index<=right;index+=reverse?-1:1){const Nested* hit=nullptr;for(const auto& c:nested)if(index==(reverse?c.range.end:c.range.start))hit=&c;if(hit){append(sequence,expand(hit->section,hit->range.start,hit->range.end));index=reverse?hit->range.start:hit->range.end;}else{if(sequence.size()==maxFrames)throw std::runtime_error("GIF expanded sequence exceeds native export budget");sequence.push_back(state.frames[index].id);}}
  if(section && (section->direction=="ping-pong" || section->direction=="ping-pong-reverse"))pingPong(sequence);const int count=section && section->repeatCount?std::clamp(*section->repeatCount,1,9999):1;auto once=sequence;for(int i=1;i<count;++i)append(sequence,once);return sequence;
 };
 auto ids=expand(root,start,end);if(options.direction==GifDirection::Reverse || options.direction==GifDirection::ReversePingPong)std::reverse(ids.begin(),ids.end());if(options.direction==GifDirection::ForwardPingPong || options.direction==GifDirection::ReversePingPong)pingPong(ids);return ids;
}
GifExport encodeAnimationGif(const Document& d,GifExportOptions options){
 if(d.active())throw std::runtime_error("Commit or cancel the active operation before exporting");GifExport out;out.frameIds=gifExportFrameIds(d.timeline().state(),options);int left=0,top=0,width=d.width(),height=d.height();
 // document-export.worker.ts trims GIF against the union of ALL animation
 // frames, even when the requested export range contains only some frames.
 if(options.trim){int l=width,t=height,r=-1,b=-1;for(const auto& frame:d.timeline().state().frames){auto pixels=compositeNormalRegion(d.timeline(),frame.id,{0,0,width,height});for(int y=0;y<height;++y)for(int x=0;x<width;++x)if(pixels[std::size_t(y)*width+x]>>24){l=std::min(l,x);t=std::min(t,y);r=std::max(r,x);b=std::max(b,y);}}if(r>=0){left=l;top=t;width=r-l+1;height=b-t+1;}}
 const int scale=std::clamp(options.scalePercent,1,6400);out.width=std::max(1,int(std::floor(width*scale/100.0+.5)));out.height=std::max(1,int(std::floor(height*scale/100.0+.5)));const auto count=std::uint64_t(out.width)*out.height;if(out.width>65535 || out.height>65535 || count*out.frameIds.size()>maxPixels)throw std::runtime_error("GIF exceeds native export pixel budget");
 std::vector<std::vector<Pixel>> frames;std::vector<int> durations;for(const auto& id:out.frameIds){auto source=compositeNormalRegion(d.timeline(),id,{left,top,width,height});std::vector<Pixel> pixels(static_cast<std::size_t>(count));for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x)pixels[std::size_t(y)*out.width+x]=source[std::size_t(std::uint64_t(y)*height/out.height)*width+std::uint64_t(x)*width/out.width];frames.push_back(std::move(pixels));for(const auto& frame:d.timeline().state().frames)if(frame.id==id)durations.push_back(frame.duration);}
 std::unordered_map<Pixel,int> exact;std::vector<Pixel> colors;bool overflow=false;for(const auto& frame:frames)for(auto pixel:frame){if((pixel>>24)<128)continue;auto rgb=pixel&0xffffff;if(!exact.count(rgb)){if(exact.size()==255){overflow=true;break;}exact.emplace(rgb,int(exact.size())+1);colors.push_back(rgb);}}
 std::vector<std::uint8_t> palette(768);if(overflow){int i=1;for(int r=0;r<6;++r)for(int g=0;g<6;++g)for(int b=0;b<6;++b){palette[i*3]=r*51;palette[i*3+1]=g*51;palette[i*3+2]=b*51;++i;}}else for(std::size_t i=0;i<colors.size();++i)for(int c=0;c<3;++c)palette[(i+1)*3+c]=std::uint8_t(colors[i]>>(c*8));
 auto& bytes=out.bytes;ascii(bytes,"GIF89a");u16(bytes,out.width);u16(bytes,out.height);bytes.insert(bytes.end(),{0xf7,0,0});bytes.insert(bytes.end(),palette.begin(),palette.end());bool loop=d.animationLoop();for(const auto& section:d.timeline().state().loopSections)if(section.id==options.loopSectionId){auto r=timeline::loopRange(d.timeline().state(),section);if(r.start>=0 && r.end>=0)loop=!section.repeatCount;}
 if(loop){bytes.insert(bytes.end(),{0x21,0xff,0x0b});ascii(bytes,"NETSCAPE2.0");bytes.insert(bytes.end(),{3,1,0,0,0});}
 for(std::size_t f=0;f<frames.size();++f){std::vector<std::uint8_t> indices(static_cast<std::size_t>(count));for(std::size_t i=0;i<count;++i){auto pixel=frames[f][i];if((pixel>>24)<128)continue;if(overflow){auto q=[&](int c){return std::min(5,int(std::floor(((pixel>>(c*8))&255)/51.0+.5)));};indices[i]=std::uint8_t(1+q(0)*36+q(1)*6+q(2));}else indices[i]=std::uint8_t(exact.at(pixel&0xffffff));}bytes.insert(bytes.end(),{0x21,0xf9,4,9});u16(bytes,std::clamp(int(std::floor(durations[f]/10.0+.5)),1,65535));bytes.insert(bytes.end(),{0,0,0x2c});u16(bytes,0);u16(bytes,0);u16(bytes,out.width);u16(bytes,out.height);bytes.insert(bytes.end(),{0,8});auto compressed=lzw(indices);for(std::size_t i=0;i<compressed.size();i+=255){auto n=std::min<std::size_t>(255,compressed.size()-i);bytes.push_back(std::uint8_t(n));bytes.insert(bytes.end(),compressed.begin()+i,compressed.begin()+i+n);}bytes.push_back(0);}bytes.push_back(0x3b);return out;
}
}

