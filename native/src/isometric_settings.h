#pragma once
#include "isometric.h"
#include <cstdint>
namespace moon::iso {
// file-preferences.ts DEFAULT_ISO_VIEW_PREFERENCES; independent style colors.
struct Settings {
 double stairStep=2,originX=0,originY=0,unitSize=16,thickness=1;
 bool pixel=false,forceLineAlignment=true,snapToGrid=false;
 std::uint32_t solidColor=0xa014ff39,pixelColor=0x1a14ff39;
 std::uint32_t color()const{return pixel?pixelColor:solidColor;}
};
inline Settings normalize(Settings s){
 auto bounded=[](double n,double fallback,double low,double high){return std::isfinite(n)?std::clamp(detail::round(n),low,high):fallback;};
 s.stairStep=bounded(s.stairStep,2,1,16);s.unitSize=bounded(s.unitSize,16,1,256);s.thickness=bounded(s.thickness,1,1,8);
 s.originX=std::isfinite(s.originX)?std::trunc(s.originX):0;s.originY=std::isfinite(s.originY)?std::trunc(s.originY):0;return s;
}
inline bool operator==(const Settings& a,const Settings& b){return a.stairStep==b.stairStep&&a.originX==b.originX&&a.originY==b.originY&&a.unitSize==b.unitSize&&a.thickness==b.thickness&&a.pixel==b.pixel&&a.forceLineAlignment==b.forceLineAlignment&&a.snapToGrid==b.snapToGrid&&a.solidColor==b.solidColor&&a.pixelColor==b.pixelColor;}
inline bool operator!=(const Settings& a,const Settings& b){return !(a==b);}
}
