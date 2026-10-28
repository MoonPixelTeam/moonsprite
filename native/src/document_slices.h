#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <set>
#include <string>
#include <vector>
namespace moon {
struct SliceRect {int x=0,y=0,width=1,height=1;bool operator==(const SliceRect& b)const{return x==b.x&&y==b.y&&width==b.width&&height==b.height;}bool operator!=(const SliceRect& b)const{return !(*this==b);}};
struct DocumentSlice {std::string id;std::u32string name;SliceRect rect;bool operator==(const DocumentSlice& b)const{return id==b.id&&name==b.name&&rect==b.rect;}};
struct SliceState {std::vector<DocumentSlice> items;std::vector<std::string> selected;};
inline int sliceRound(double n,int fallback=0){if(!std::isfinite(n))return fallback;return int(std::clamp(std::floor(n+.5),double(std::numeric_limits<int>::min()),double(std::numeric_limits<int>::max())));}
inline std::u32string sanitizeSliceName(std::u32string value,std::u32string fallback=U"Slice") {auto space=[](char32_t c){return c==32||(c>=9&&c<=13)||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;};while(!value.empty()&&space(value.front()))value.erase(value.begin());while(!value.empty()&&space(value.back()))value.pop_back();value.erase(std::remove_if(value.begin(),value.end(),[](char32_t c){return c<32||c==U'<'||c==U'>'||c==U':'||c==U'"'||c==U'/'||c==U'\\'||c==U'|'||c==U'?'||c==U'*';}),value.end());return value.empty()?fallback:value;}
inline SliceRect clampSliceRect(SliceRect r,int width,int height){width=std::max(1,width);height=std::max(1,height);r.x=std::clamp(r.x,0,width-1);r.y=std::clamp(r.y,0,height-1);r.width=std::clamp(r.width,1,width-r.x);r.height=std::clamp(r.height,1,height-r.y);return r;}
inline std::vector<DocumentSlice> normalizeDocumentSlices(std::vector<DocumentSlice> values,int w,int h){std::set<std::string> seen;std::vector<DocumentSlice> out;for(auto s:values){const auto first=s.id.find_first_not_of(" \t\r\n");if(first==std::string::npos)continue;const auto last=s.id.find_last_not_of(" \t\r\n");s.id=s.id.substr(first,last-first+1);if(s.rect.width<1||s.rect.height<1||!seen.insert(s.id).second)continue;s.rect=clampSliceRect(s.rect,w,h);const auto n=std::to_string(out.size()+1);s.name=sanitizeSliceName(std::move(s.name),U"Slice "+std::u32string(n.begin(),n.end()));out.push_back(std::move(s));}return out;}
inline const DocumentSlice* sliceAtPoint(const std::vector<DocumentSlice>& values,int x,int y){for(auto it=values.rbegin();it!=values.rend();++it){const auto& r=it->rect;if(x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height)return &*it;}return nullptr;}
inline std::vector<SliceRect> moveSliceRects(const std::vector<SliceRect>& values,int dx,int dy,int w,int h){if(values.empty())return {};int left=values[0].x,top=values[0].y,right=left+values[0].width,bottom=top+values[0].height;for(const auto& r:values){left=std::min(left,r.x);top=std::min(top,r.y);right=std::max(right,r.x+r.width);bottom=std::max(bottom,r.y+r.height);}dx=std::clamp(dx,-left,w-right);dy=std::clamp(dy,-top,h-bottom);auto out=values;for(auto& r:out){r.x+=dx;r.y+=dy;}return out;}
struct AutoSliceSettings {int width=16,height=16,gapX=0,gapY=0,startX=0,startY=0;};
inline std::uint64_t autoSliceCount(int w,int h,AutoSliceSettings s){const std::int64_t sw=std::max(1,s.width),sh=std::max(1,s.height),gx=std::max(0,s.gapX),gy=std::max(0,s.gapY),sx=std::max(0,s.startX),sy=std::max(0,s.startY);if(sx+sw>w||sy+sh>h)return 0;return std::uint64_t((w-sx+gx)/(sw+gx))*std::uint64_t((h-sy+gy)/(sh+gy));}
inline std::vector<SliceRect> autoSliceRects(int w,int h,AutoSliceSettings s,std::uint64_t limit=10000){const auto count=autoSliceCount(w,h,s);if(!count||count>limit)return {};s.width=std::max(1,s.width);s.height=std::max(1,s.height);s.gapX=std::max(0,s.gapX);s.gapY=std::max(0,s.gapY);s.startX=std::max(0,s.startX);s.startY=std::max(0,s.startY);std::vector<SliceRect> out;out.reserve(std::size_t(count));for(std::int64_t y=s.startY;y+s.height<=h;y+=std::int64_t(s.height)+s.gapY)for(std::int64_t x=s.startX;x+s.width<=w;x+=std::int64_t(s.width)+s.gapX)out.push_back({int(x),int(y),s.width,s.height});return out;}
}
