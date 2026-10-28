// Legacy document-model.ts maskCoverageFromColor; animation.ts mask resolution; document-composite-mask.ts.
#include "timeline_model.h"
#include "raster_geometry.h"
#include <cmath>
#include <set>
#include <stdexcept>
namespace moon::timeline {
const MaskSlot* directMask(const State& s,const std::string& owner,const std::string& frame){for(const auto& slot:s.masks)if(slot.ownerId==owner&&slot.frameId==frame)return &slot;return nullptr;}
const AttachedMask* resolvedMask(const State& s,const std::string& owner,const std::string& frame){const auto* slot=directMask(s,owner,frame);if(!slot)return nullptr;const auto* m=&slot->mask;std::set<std::string> seen;while(!m->linkedMaskId.empty()){if(!seen.insert(m->id).second)throw std::invalid_argument("Cyclic mask link");const AttachedMask* next=nullptr;for(const auto& v:s.masks)if(v.mask.id==m->linkedMaskId){next=&v.mask;break;}if(!next)throw std::invalid_argument("Missing mask link");m=next;}return m;}
void validateMasks(const State& s){std::set<std::string> ids,slots;std::size_t bytes=0;for(const auto& v:s.masks){if(v.mask.id.empty()||!ids.insert(v.mask.id).second||!slots.insert(v.ownerId+"\n"+v.frameId).second)throw std::invalid_argument("Duplicate mask identity/slot");bool owner=false,frame=false;for(const auto& l:s.layers)if(!v.group&&l.id==v.ownerId)owner=true;for(const auto& g:s.groups)if(v.group&&g.id==v.ownerId)owner=true;for(const auto& f:s.frames)if(f.id==v.frameId)frame=true;if(!owner||!frame)throw std::invalid_argument("Missing mask owner/frame");raster::validate(v.mask.surface);bytes+=v.mask.surface.pixels.size()*4;if(bytes>256*1024*1024)throw std::length_error("Mask memory budget exceeded");}for(const auto& v:s.masks)(void)resolvedMask(s,v.ownerId,v.frameId);}
unsigned maskCoverage(Pixel p){const auto a=p>>24;if(!a)return 255;const auto gray=unsigned(std::floor(((p&255)*2126+((p>>8)&255)*7152+((p>>16)&255)*722)/10000.+.5));return unsigned(std::floor(255+(int(gray)-255)*double(a)/255.+.5));}
Pixel normalizedMaskPixel(Pixel p){if(!(p>>24))return 0;const auto n=maskCoverage(p);return 0xff000000u|n|(n<<8)|(n<<16);}
void applyAttachedMask(const AttachedMask* m,std::vector<Pixel>& pixels,int x,int y,int w,int h){if(!m||!m->visible)return;for(int row=0;row<h;++row)for(int col=0;col<w;++col){auto& p=pixels[std::size_t(row)*w+col];const auto coverage=maskCoverage(raster::readWorld(m->surface,std::int64_t(x)+col,std::int64_t(y)+row));p=(p&0xffffff)|(Pixel(std::floor((p>>24)*coverage/255.+.5))<<24);}}
}
