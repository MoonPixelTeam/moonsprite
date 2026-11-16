#pragma once
#include <cmath>
#include <algorithm>
#include <memory>
#include <optional>

#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>
namespace moon {
// legacy types-document.ts / store/canvas-references.ts. Source strings are
// immutable and shared by placement history, just as JavaScript strings are.
struct ReferencePlacement {
 double x=0,y=0,width=1,height=1,angle=0;
 bool flipX=false,flipY=false;
 std::optional<double> opacity;
};
struct CanvasReference:ReferencePlacement {
 std::string id,name;
 std::shared_ptr<const std::string> src;
 bool locked=false;
 std::optional<bool> floating;
 std::optional<ReferencePlacement> initial;
};
using CanvasReferences=std::vector<CanvasReference>;
struct ReferencePatch {
 std::optional<double> x,y,width,height,angle,opacity;
 std::optional<bool> flipX,flipY,locked,floating;
 std::optional<ReferencePlacement> initial;
};
inline bool validReferencePlacement(const ReferencePlacement& p){return std::isfinite(p.x)&&std::isfinite(p.y)&&std::isfinite(p.width)&&std::isfinite(p.height)&&std::isfinite(p.angle)&&p.width>0&&p.height>0&&(!p.opacity||(std::isfinite(*p.opacity)&&*p.opacity>=0&&*p.opacity<=1));}
inline void validateCanvasReference(const CanvasReference& r){
 auto word=[](unsigned char c){return (c>='A'&&c<='Z')||(c>='a'&&c<='z')||(c>='0'&&c<='9')||c=='_';};
 bool valid=!r.id.empty()&&std::all_of(r.id.begin(),r.id.end(),[&](unsigned char c){return word(c)||c=='-';});
 if(!r.src)valid=false;
 else{const auto& source=*r.src;const auto separator=source.find(";base64,",11);valid=valid&&source.compare(0,11,"data:image/")==0&&separator!=std::string::npos&&separator>11;
  if(valid){valid=std::all_of(source.begin()+11,source.begin()+separator,[&](unsigned char c){return word(c)||c=='.'||c=='+'||c=='-';});const auto first=separator+8;auto last=source.size();int padding=0;while(last>first&&source[last-1]=='='){--last;++padding;}valid=valid&&last>first&&padding<=2&&std::all_of(source.begin()+first,source.begin()+last,[&](unsigned char c){return (word(c)&&c!='_')||c=='+'||c=='/';});}
 }
 if(!validReferencePlacement(r)||!valid||(r.initial&&!validReferencePlacement(*r.initial)))throw std::invalid_argument("Invalid canvas reference");
}
inline void validateCanvasReferences(const CanvasReferences& values){std::unordered_set<std::string> ids;for(const auto& r:values){validateCanvasReference(r);if(!ids.insert(r.id).second)throw std::invalid_argument("Duplicate canvas reference");}}
inline bool sameReference(const CanvasReference& a,const CanvasReference& b){return a.src&&b.src&&*a.src==*b.src&&a.name==b.name&&a.x==b.x&&a.y==b.y&&a.width==b.width&&a.height==b.height&&a.angle==b.angle&&a.flipX==b.flipX&&a.flipY==b.flipY&&a.opacity.value_or(1)==b.opacity.value_or(1)&&a.locked==b.locked&&a.floating==b.floating;}
inline ReferencePlacement referencePlacement(const CanvasReference& r){ReferencePlacement p=r;p.opacity=p.opacity.value_or(1);return p;}
inline std::size_t referenceStringLength(const std::string& s){std::size_t n=0;for(unsigned char c:s)if((c&0xc0)!=0x80)n+=c>=0xf0?2:1;return n;}
}
