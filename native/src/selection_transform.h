#pragma once
#include "selection_model.h"
#include <array>
#include <map>
#include <memory>
#include <string>
namespace moon {
// Legacy selection.ts / canvas-input-resize.ts edge-coordinate geometry.
struct TransformPoint {double x=0,y=0;};
struct SelectionTransform {double x=0,y=0,width=1,height=1,angle=0;bool flipHorizontal=false,flipVertical=false;std::optional<double> flipOriginX,flipOriginY;double shearX=0,shearY=0;std::optional<std::array<TransformPoint,4>> quad;std::shared_ptr<const std::array<double,9>> legacyShear;};
// Direct native adaptation of selection.ts solveSelectionQuadLinearSystem /
// selectionQuadHomography (clockwise nw,ne,se,sw); cache per immutable frame.
inline std::optional<std::array<double,8>> selectionHomography(const std::array<TransformPoint,4>& from,const std::array<TransformPoint,4>& to){
 double m[8][9]{};for(int i=0;i<4;++i){auto a=from[i],b=to[i];const double x[9]{a.x,a.y,1,0,0,0,-a.x*b.x,-a.y*b.x,b.x},y[9]{0,0,0,a.x,a.y,1,-a.x*b.y,-a.y*b.y,b.y};for(int k=0;k<9;++k){m[i*2][k]=x[k];m[i*2+1][k]=y[k];}}
 for(int col=0;col<8;++col){int pivot=col;for(int row=col+1;row<8;++row)if(std::abs(m[row][col])>std::abs(m[pivot][col]))pivot=row;if(!std::isfinite(m[pivot][col]) || std::abs(m[pivot][col])<1e-10)return {};if(pivot!=col)for(int k=0;k<9;++k)std::swap(m[pivot][k],m[col][k]);const double divisor=m[col][col];for(int k=col;k<9;++k)m[col][k]/=divisor;for(int row=0;row<8;++row)if(row!=col){const double factor=m[row][col];if(std::abs(factor)<1e-14)continue;for(int k=col;k<9;++k)m[row][k]-=factor*m[col][k];}}
 std::array<double,8> out;for(int i=0;i<8;++i){out[i]=m[i][8];if(!std::isfinite(out[i]))return {};}return out;
}
inline bool selectionQuadConvex(const std::array<TransformPoint,4>& q){double sign=0;for(int i=0;i<4;++i){auto a=q[i],b=q[(i+1)%4],c=q[(i+2)%4];const double cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);if(std::abs(cross)<1e-9)return false;if(sign && sign*cross<0)return false;sign=cross;}return true;}
inline TransformPoint selectionQuadMap(const std::array<TransformPoint,4>& q,TransformPoint p,bool inverse){
 static thread_local std::optional<std::array<TransformPoint,4>> key;static thread_local std::optional<std::array<double,8>> forward,backward;
 bool same=bool(key);if(key)for(int i=0;i<4;++i)same=same && (*key)[i].x==q[i].x && (*key)[i].y==q[i].y;
 if(!same){const std::array<TransformPoint,4> unit{{{0,0},{1,0},{1,1},{0,1}}};key=q;forward=selectionHomography(unit,q);backward=selectionHomography(q,unit);}
 const auto& matrix=inverse?backward:forward;if(!matrix)return {1e100,1e100};const auto& a=*matrix;const double denominator=a[6]*p.x+a[7]*p.y+1;if(std::abs(denominator)<1e-10)return {1e100,1e100};return {(a[0]*p.x+a[1]*p.y+a[2])/denominator,(a[3]*p.x+a[4]*p.y+a[5])/denominator};
}
inline double transformSnap(double value){const double rounded=std::floor(value+.5);return std::abs(value-rounded)<1e-9?rounded:value;}
inline TransformPoint transformPoint(const SelectionTransform& t,double u,double v){if(t.quad)return selectionQuadMap(*t.quad,{u,v},false);const double radians=t.angle*3.141592653589793/180,c=transformSnap(std::cos(radians)),s=transformSnap(std::sin(radians)),cx=t.x+t.width/2,cy=t.y+t.height/2,x=(u-.5)*t.width+t.shearX*(v-.5),y=(v-.5)*t.height+t.shearY*(u-.5);return {transformSnap(cx+x*c-y*s),transformSnap(cy+x*s+y*c)};}
inline TransformPoint transformLocalPoint(const SelectionTransform& t,TransformPoint p){if(t.quad){auto uv=selectionQuadMap(*t.quad,p,true);return {t.x+uv.x*t.width,t.y+uv.y*t.height};}const double radians=t.angle*3.141592653589793/180,c=transformSnap(std::cos(radians)),s=transformSnap(std::sin(radians)),cx=t.x+t.width/2,cy=t.y+t.height/2,dx=(p.x-cx)*c+(p.y-cy)*s,dy=-(p.x-cx)*s+(p.y-cy)*c,det=t.width*t.height-t.shearX*t.shearY;if(std::abs(det)<1e-9)return {1e100,1e100};return {t.x+(.5+(dx*t.height-dy*t.shearX)/det)*t.width,t.y+(.5+(dy*t.width-dx*t.shearY)/det)*t.height};}

inline SelectionMask transformBounds(const SelectionTransform& t){double l=1e100,r=-1e100,top=l,bottom=r;for(auto uv:std::array<TransformPoint,4>{{{0,0},{1,0},{1,1},{0,1}}}){auto p=transformPoint(t,uv.x,uv.y);l=std::min(l,p.x);r=std::max(r,p.x);top=std::min(top,p.y);bottom=std::max(bottom,p.y);}const int x=int(std::floor(l)),y=int(std::floor(top));return {x,y,int(std::ceil(r))-x,int(std::ceil(bottom))-y,{}};}
// Legacy canonical south/east-edge shear geometry is retained only for the
// symmetry shear adapter. Existing non-symmetry sampling stays unchanged.
inline TransformPoint legacySymmetryTransformPoint(const SelectionTransform& t,double u,double v){
 if(!t.legacyShear)return transformPoint(t,u,v);const auto& g=*t.legacyShear;const double rad=g[4]*3.141592653589793/180,c=transformSnap(std::cos(rad)),sn=transformSnap(std::sin(rad)),cx=g[0]+g[2]/2,cy=g[1]+g[3]/2,x=(u-.5)*g[2]+g[5]*v,y=(v-.5)*g[3]+g[6]*u;return {transformSnap(cx+x*c-y*sn),transformSnap(cy+x*sn+y*c)};
}
inline SelectionMask legacySymmetryTransformBounds(const SelectionTransform& t){if(!t.legacyShear)return transformBounds(t);double l=1e100,top=l,r=-l,bottom=r;for(auto uv:std::array<TransformPoint,4>{{{0,0},{1,0},{1,1},{0,1}}}){const auto p=legacySymmetryTransformPoint(t,uv.x,uv.y);l=std::min(l,p.x);r=std::max(r,p.x);top=std::min(top,p.y);bottom=std::max(bottom,p.y);}const int x=int(std::floor(l)),y=int(std::floor(top));return {x,y,int(std::ceil(r))-x,int(std::ceil(bottom))-y,{}};}
// selection.ts rotatedRectSelection / rotatedEllipseSelection: sample document pixel centers.
inline std::optional<SelectionMask> rotatedMarqueeSelection(const SelectionTransform& target,int cw,int ch,bool ellipse,int cornerRadius=0){auto bounds=transformBounds(target);const int left=std::max(0,bounds.x),top=std::max(0,bounds.y),right=std::min(cw,bounds.x+bounds.width),bottom=std::min(ch,bounds.y+bounds.height);if(left>=right || top>=bottom)return {};SelectionMask mask{left,top,right-left,bottom-top,{}};mask.mask.resize(std::size_t(mask.width)*mask.height);const int radius=std::min(std::max(0,cornerRadius),int(std::floor(std::min(target.width,target.height)/2)));for(int y=top;y<bottom;++y)for(int x=left;x<right;++x){const auto local=transformLocalPoint(target,{x+.5,y+.5});const double px=local.x-target.x,py=local.y-target.y,dx=px-target.width/2,dy=py-target.height/2;bool contains=ellipse?dx*dx/(target.width*target.width/4)+dy*dy/(target.height*target.height/4)<=1:std::abs(dx)<target.width/2-1e-9 && std::abs(dy)<target.height/2-1e-9;if(contains && radius && !ellipse && !(px>=radius && px<=target.width-radius) && !(py>=radius && py<=target.height-radius)){const double cx=px<radius?radius:target.width-radius,cy=py<radius?radius:target.height-radius;contains=(px-cx)*(px-cx)+(py-cy)*(py-cy)<=radius*radius+1e-9;}mask.mask[std::size_t(y-top)*mask.width+x-left]=contains;}const double angle=std::fmod(std::fmod(target.angle,360)+360,360);if(!ellipse && !radius && target.width>2 && target.height>2 && std::abs(std::fmod(angle,90))>1e-9){std::vector<std::size_t> tips;for(int y=0;y<mask.height;++y)for(int x=0;x<mask.width;++x){const auto i=std::size_t(y)*mask.width+x;if(!mask.mask[i])continue;const int neighbors=(x>0 && mask.mask[i-1])+(x+1<mask.width && mask.mask[i+1])+(y>0 && mask.mask[i-mask.width])+(y+1<mask.height && mask.mask[i+mask.width]);if(neighbors<=1)tips.push_back(i);}for(auto i:tips)mask.mask[i]=0;}return trimSelection(std::move(mask));}
// canvas-input-resize.ts resizeRotatedMarqueeBounds after releasing Alt.
inline SelectionTransform resizeRotatedMarquee(const SelectionTransform& start,TransformPoint delta,int sx,int sy,bool proportional){const double radians=start.angle*3.141592653589793/180,c=std::cos(radians),s=std::sin(radians),dx=delta.x*c+delta.y*s,dy=-delta.x*s+delta.y*c;auto parity=[](double size,double value,int sign){return std::max(std::fmod(size,2)==0?2.0:1.0,size+std::floor(value*sign+.5)*2);};auto out=start;out.width=parity(start.width,dx,sx);out.height=parity(start.height,dy,sy);if(proportional){if(std::abs(dx)>=std::abs(dy))out.height=out.width;else out.width=out.height;auto match=[](double value,double original){const double minimum=std::fmod(original,2)==0?2.0:1.0;value=std::max(minimum,value);if(std::fmod(std::abs(value-original),2)!=0)value+=value>minimum?-1:1;return value;};out.width=match(out.width,start.width);out.height=match(out.height,start.height);}out.x=start.x+(start.width-out.width)/2;out.y=start.y+(start.height-out.height)/2;return out;}
inline std::optional<std::size_t> transformSourceOffset(const SelectionClipboard& source,const SelectionTransform& t,int x,int y){auto p=transformLocalPoint(t,{x+.5,y+.5});double u=(p.x-t.x)/t.width,v=(p.y-t.y)/t.height;if(u<-1e-9 || u>1+1e-9 || v<-1e-9 || v>1+1e-9)return {};if(t.flipHorizontal && (!t.flipOriginX || *t.flipOriginX>t.x+1e-9))u=1-u;if(t.flipVertical && (!t.flipOriginY || *t.flipOriginY>t.y+1e-9))v=1-v;const int sx=std::clamp(int(std::floor(u*source.width)),0,source.width-1),sy=std::clamp(int(std::floor(v*source.height)),0,source.height-1);const auto offset=std::size_t(sy)*source.width+sx;return source.mask[offset]==1?std::optional<std::size_t>{offset}:std::optional<std::size_t>{};}
struct TransformCell {int x,y;std::uint32_t value;std::size_t sourceOffset=std::size_t(-1);};
// Fast path preserves thin contours by forward mapping, then fills enclosed inverse candidates.
// Metadata/order opt-in is used only by symmetry; existing callers retain their
// coordinate-sorted output and existing inverse sampler unchanged.
inline std::optional<std::size_t> legacyRotationSourceOffset(const SelectionClipboard& source,const SelectionTransform& t,int x,int y){
 const auto g=t.legacyShear?*t.legacyShear:std::array<double,9>{t.x,t.y,t.width,t.height,t.angle,0,0,t.flipOriginX.value_or(INFINITY),t.flipOriginY.value_or(INFINITY)};const double radians=g[4]*3.141592653589793/180,c=transformSnap(std::cos(-radians)),sn=transformSnap(std::sin(-radians)),cx=g[0]+g[2]/2,cy=g[1]+g[3]/2,dx=x+.5-cx,dy=y+.5-cy;double px=cx+dx*c-dy*sn,py=cy+dx*sn+dy*c;if(g[5]!=0)px-=g[5]*((py-g[1])/g[3]);else if(g[6]!=0)py-=g[6]*((px-g[0])/g[2]);double u=(px-g[0])/g[2],v=(py-g[1])/g[3];if(u<-1e-9||u>1+1e-9||v<-1e-9||v>1+1e-9)return {};if(t.flipHorizontal&&(!std::isfinite(g[7])||g[7]>g[0]+1e-9))u=1-u;if(t.flipVertical&&(!std::isfinite(g[8])||g[8]>g[1]+1e-9))v=1-v;const int sx=std::clamp(int(std::floor(u*source.width)),0,source.width-1),sy=std::clamp(int(std::floor(v*source.height)),0,source.height-1);const auto offset=std::size_t(sy)*source.width+sx;return source.mask[offset]==1?std::optional<std::size_t>{offset}:std::nullopt;
}
inline std::vector<TransformCell> fastSelectionTransformCells(const SelectionClipboard& source,const SelectionTransform& t,int cw,int ch,bool geometryOnly=false,bool clip=true,bool legacyOrder=false){
 const auto bounds=legacyOrder?legacySymmetryTransformBounds(t):transformBounds(t);const int l=clip?std::max(0,bounds.x):bounds.x,top=clip?std::max(0,bounds.y):bounds.y,r=clip?std::min(cw,bounds.x+bounds.width):bounds.x+bounds.width,bottom=clip?std::min(ch,bounds.y+bounds.height):bounds.y+bounds.height;
 using Key=std::pair<int,int>;std::map<Key,TransformCell> cells,candidates;std::vector<Key> order;const double angle=std::fmod(std::fmod(t.angle,360)+360,360);const bool preserving=!t.quad&&t.shearX==0&&t.shearY==0&&angle!=0&&!t.flipHorizontal&&!t.flipVertical&&t.width==source.width&&t.height==source.height;auto valid=[&](std::size_t i){return source.mask[i]==1&&(geometryOnly||source.pixels[i]>>24);};
 if(preserving)for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){const auto i=std::size_t(y)*source.width+x;if(!valid(i))continue;auto p=(legacyOrder?legacySymmetryTransformPoint:transformPoint)(t,(x+.5)/source.width,(y+.5)/source.height);const int dx=int(std::floor(p.x)),dy=int(std::floor(p.y));if(dx>=l&&dx<r&&dy>=top&&dy<bottom){const Key key{dx,dy};if(cells.emplace(key,TransformCell{dx,dy,source.pixels[i],i}).second&&legacyOrder)order.push_back(key);}}
 for(int y=top;y<bottom;++y)for(int x=l;x<r;++x){auto i=legacyOrder?legacyRotationSourceOffset(source,t,x,y):transformSourceOffset(source,t,x,y);if(!i||!valid(*i))continue;const Key key{x,y};const TransformCell cell{x,y,source.pixels[*i],*i};if(preserving){if(!cells.count(key))candidates[key]=cell;}else{cells[key]=cell;if(legacyOrder)order.push_back(key);}}
 if(preserving)for(;;){std::vector<Key> additions;for(const auto& entry:candidates){const auto p=entry.first;int count=0;for(auto d:std::array<Key,4>{{{-1,0},{1,0},{0,-1},{0,1}}})count+=cells.count({p.first+d.first,p.second+d.second})!=0;if(count>=2)additions.push_back(p);}if(additions.empty())break;if(legacyOrder)std::sort(additions.begin(),additions.end(),[](Key a,Key b){return a.second<b.second||(a.second==b.second&&a.first<b.first);});for(auto p:additions){cells[p]=candidates[p];candidates.erase(p);if(legacyOrder)order.push_back(p);}}
 std::vector<TransformCell> out;out.reserve(cells.size());if(legacyOrder){for(auto p:order)out.push_back(cells.at(p));}else for(const auto& entry:cells)out.push_back(entry.second);return out;
}
inline std::optional<SelectionMask> transformedSelectionMask(const SelectionClipboard& source,const SelectionTransform& t){const auto bounds=transformBounds(t);SelectionMask mask=bounds;mask.mask.resize(std::size_t(bounds.width)*bounds.height);for(auto cell:fastSelectionTransformCells(source,t,0,0,true,false))mask.mask[std::size_t(cell.y-bounds.y)*bounds.width+cell.x-bounds.x]=1;return trimSelection(std::move(mask));}


// resizeTransformedSelectionBounds: pointer motion in the rotated local frame.
// selection.ts shearTransformedSelection: transform axes about the chosen
// pivot, then decompose back to the same rotated/sheared rectangle.
inline SelectionTransform shearSelectionTransform(const SelectionTransform& start,TransformPoint pointerDelta,char edge,TransformPoint pivot,bool legacySymmetry=false){
 auto point=[&](double u,double v){return legacySymmetry?legacySymmetryTransformPoint(start,u,v):transformPoint(start,u,v);};auto a=point(0,0),b=point(1,0),d=point(0,1);
 const TransformPoint h{b.x-a.x,b.y-a.y},v{d.x-a.x,d.y-a.y};const bool horizontal=edge=='n' || edge=='s';const auto direction=horizontal?h:v;const double length=std::hypot(direction.x,direction.y),det=h.x*v.y-h.y*v.x;if(length<1e-9 || std::abs(det)<1e-9)return start;
 auto coordinate=[&](TransformPoint p){return horizontal?(h.x*(p.y-a.y)-h.y*(p.x-a.x))/det:((p.x-a.x)*v.y-(p.y-a.y)*v.x)/det;};
 const double origin=coordinate(pivot),edgeAt=edge=='n' || edge=='w'?0:1,distance=edgeAt-origin;if(std::abs(distance)<1e-9)return start;const double amount=std::floor((pointerDelta.x*direction.x+pointerDelta.y*direction.y)/length+.5);
 auto shift=[&](TransformPoint p){const double displacement=amount*(coordinate(p)-origin)/distance;return TransformPoint{p.x+displacement*direction.x/length,p.y+displacement*direction.y/length};};
 const auto na=shift(a),nb=shift(b),nd=shift(d);const TransformPoint nh{nb.x-na.x,nb.y-na.y},nv{nd.x-na.x,nd.y-na.y};double c,s,w,height,shear;
 if(horizontal){w=std::hypot(nh.x,nh.y);c=nh.x/w;s=nh.y/w;height=-s*nv.x+c*nv.y;shear=c*nv.x+s*nv.y;}else{height=std::hypot(nv.x,nv.y);c=nv.y/height;s=-nv.x/height;w=c*nh.x+s*nh.y;shear=-s*nh.x+c*nh.y;}
 if(w<1 || height<1)return start;auto result=start;result.width=w;result.height=height;result.angle=std::atan2(s,c)*180/3.141592653589793;result.shearX=horizontal?shear:0;result.shearY=horizontal?0:shear;
 const double cx=na.x+(nh.x+nv.x)/2,cy=na.y+(nh.y+nv.y)/2;result.x=cx-w/2;result.y=cy-height/2;if(legacySymmetry){const double legacyX=transformSnap(na.x+c*w/2-s*height/2-w/2),legacyY=transformSnap(na.y+s*w/2+c*height/2-height/2),lw=transformSnap(w),lh=transformSnap(height),la=transformSnap(result.angle),amount=transformSnap(shear);const auto previous=start.legacyShear?*start.legacyShear:std::array<double,9>{start.x,start.y,start.width,start.height,start.angle,0,0,start.flipOriginX.value_or(INFINITY),start.flipOriginY.value_or(INFINITY)};auto remap=[](double axis,double oldX,double oldSize,double newX,double newSize){return !std::isfinite(axis)?double(INFINITY):axis<=oldX+1e-9?newX:axis>=oldX+oldSize-1e-9?newX+newSize:newX+(axis-oldX)/oldSize*newSize;};result.legacyShear=std::make_shared<const std::array<double,9>>(std::array<double,9>{legacyX,legacyY,lw,lh,la,horizontal?amount:0,horizontal?0:amount,remap(previous[7],previous[0],previous[2],legacyX,lw),remap(previous[8],previous[1],previous[3],legacyY,lh)});}return result;
}
inline SelectionTransform resizeSelectionTransform(const SelectionTransform& start,TransformPoint delta,const std::string& handle,bool proportional,bool integerScale,bool fromCenter,std::optional<TransformPoint> pivot={}){
 const double radians=start.angle*3.141592653589793/180,c=std::cos(radians),s=std::sin(radians),dx=delta.x*c+delta.y*s,dy=-delta.x*s+delta.y*c;
 const bool west=handle.find('w')!=std::string::npos,east=handle.find('e')!=std::string::npos,north=handle.find('n')!=std::string::npos,south=handle.find('s')!=std::string::npos,horizontal=west||east,vertical=north||south;
 const double hx=west?0:east?start.width:start.width/2,hy=north?0:south?start.height:start.height/2;double l=0,r=start.width,top=0,b=start.height;bool crossX=false,crossY=false;SelectionTransform out=start;
 if(fromCenter && pivot){const auto local=transformLocalPoint(start,*pivot);const double px=local.x-start.x,py=local.y-start.y;auto axis=[](double at,double motion,double anchor,bool affected){return !affected || std::abs(at-anchor)<1e-9?1.0:(at+motion-anchor)/(at-anchor);};const double sx=axis(hx,dx,px,horizontal),sy=axis(hy,dy,py,vertical);double mx=std::abs(sx),my=std::abs(sy);if(proportional)mx=my=horizontal&&!vertical?mx:vertical&&!horizontal?my:std::max(mx,my);if(integerScale){if(horizontal || proportional)mx=std::max(1.0,std::floor(mx+.5));if(vertical || proportional)my=std::max(1.0,std::floor(my+.5));}out.width=horizontal || proportional?std::max(1.0,std::floor(start.width*mx+.5)):start.width;out.height=vertical || proportional?std::max(1.0,std::floor(start.height*my+.5)):start.height;const double signX=sx<0?-1:1,signY=sy<0?-1:1,ox=(start.width/2-px)*signX*out.width/start.width,oy=(start.height/2-py)*signY*out.height/start.height;out.x=pivot->x+ox*c-oy*s-out.width/2;out.y=pivot->y+ox*s+oy*c-out.height/2;out.flipHorizontal=signX<0?!start.flipHorizontal:start.flipHorizontal;out.flipVertical=signY<0?!start.flipVertical:start.flipVertical;if(out.flipHorizontal)out.flipOriginX=signX<0?out.x+out.width/2:start.flipOriginX && *start.flipOriginX<=start.x+start.width/2?out.x:out.x+out.width;else out.flipOriginX.reset();if(out.flipVertical)out.flipOriginY=signY<0?out.y+out.height/2:start.flipOriginY && *start.flipOriginY<=start.y+start.height/2?out.y:out.y+out.height;else out.flipOriginY.reset();return out;}
 if(fromCenter){const double sx=horizontal?(hx+dx-start.width/2)/(hx-start.width/2):1,sy=vertical?(hy+dy-start.height/2)/(hy-start.height/2):1;double mx=std::abs(sx),my=std::abs(sy);const bool driven=horizontal&&!vertical?true:vertical&&!horizontal?false:mx>=my;if(proportional)mx=my=driven?mx:my;if(integerScale){if(horizontal || proportional)mx=std::max(1.0,std::floor(mx+.5));if(vertical || proportional)my=std::max(1.0,std::floor(my+.5));}out.width=std::max(1.0,std::floor(start.width*mx+.5));out.height=std::max(1.0,std::floor(start.height*my+.5));out.x=start.x+(start.width-out.width)/2;out.y=start.y+(start.height-out.height)/2;if(sx<0){out.flipHorizontal=!start.flipHorizontal;out.flipOriginX=out.x+out.width/2;}if(sy<0){out.flipVertical=!start.flipVertical;out.flipOriginY=out.y+out.height/2;}return out;}
 if(west){crossX=hx+dx>start.width;l=crossX?start.width:std::min(start.width-1,hx+dx);r=crossX?std::max(start.width+1,hx+dx):start.width;}else if(east){crossX=hx+dx<0;l=crossX?std::min(-1.0,hx+dx):0;r=crossX?0:std::max(1.0,hx+dx);}
 if(north){crossY=hy+dy>start.height;top=crossY?start.height:std::min(start.height-1,hy+dy);b=crossY?std::max(start.height+1,hy+dy):start.height;}else if(south){crossY=hy+dy<0;top=crossY?std::min(-1.0,hy+dy):0;b=crossY?0:std::max(1.0,hy+dy);}
 double w=r-l,h=b-top;if(proportional || integerScale){const bool driven=horizontal&&!vertical?true:vertical&&!horizontal?false:w/start.width>=h/start.height;if(proportional){if(driven)h=std::max(1.0,std::floor(w*start.height/start.width+.5));else w=std::max(1.0,std::floor(h*start.width/start.height+.5));}if(integerScale){if(proportional){const double scale=std::max(1.0,std::floor((driven?(r-l+1)/start.width:(b-top+1)/start.height)+.5));w=start.width*scale;h=start.height*scale;}else{if(horizontal)w=start.width*std::max(1.0,std::floor((r-l+1)/start.width+.5));if(vertical)h=start.height*std::max(1.0,std::floor((b-top+1)/start.height+.5));}}
 if(west)l=crossX?start.width:start.width-w;else if(east)l=crossX?-w:0;else l=std::floor((l+r)/2-w/2+.5);r=l+w;if(north)top=crossY?start.height:start.height-h;else if(south)top=crossY?-h:0;else top=std::floor((top+b)/2-h/2+.5);b=top+h;}
 const double shiftX=l+w/2-start.width/2,shiftY=top+h/2-start.height/2;out.x=start.x+start.width/2+shiftX*c-shiftY*s-w/2;out.y=start.y+start.height/2+shiftX*s+shiftY*c-h/2;out.width=w;out.height=h;out.flipHorizontal=crossX?!start.flipHorizontal:start.flipHorizontal;out.flipVertical=crossY?!start.flipVertical:start.flipVertical;
 if(out.flipHorizontal){const double localOrigin=crossX?hx+dx:start.flipOriginX && *start.flipOriginX<=start.x+start.width/2?0:start.width;out.flipOriginX=localOrigin<=l+w/2?out.x:out.x+w;}else out.flipOriginX.reset();if(out.flipVertical){const double localOrigin=crossY?hy+dy:start.flipOriginY && *start.flipOriginY<=start.y+start.height/2?0:start.height;out.flipOriginY=localOrigin<=top+h/2?out.y:out.y+h;}else out.flipOriginY.reset();return out;
}
// legacy canvas-input-hit-test.ts resize points first, compact outside-corner rotation.
inline std::string selectionTransformHit(const SelectionTransform& t,TransformPoint point,double scale){if(t.quad){const auto local=selectionQuadMap(*t.quad,point,true);const char* ids[]{"nw","ne","se","sw"};std::string nearest;double nearestDistance=1e100;for(int i=0;i<4;++i){const bool quadrant=i==0?local.x<.5 && local.y<.5:i==1?local.x>.5 && local.y<.5:i==2?local.x>.5 && local.y>.5:local.x<.5 && local.y>.5;if(!quadrant)continue;const auto h=(*t.quad)[i];const bool outward=(i==0?local.x<=0 && local.y<=0:i==1?local.x>=1 && local.y<=0:i==2?local.x>=1 && local.y>=1:local.x<=0 && local.y>=1);const double distance=std::hypot(point.x-h.x,point.y-h.y);if(distance<=(outward?5:18)*scale && distance<nearestDistance){nearest=ids[i];nearestDistance=distance;}}return nearest;}
 auto p=transformLocalPoint(t,point);const double l=t.x,r=l+t.width,top=t.y,b=top+t.height;struct Handle{const char* id;double x,y;};const std::array<Handle,4> corners{{{"nw",l,top},{"ne",r,top},{"sw",l,b},{"se",r,b}}};for(auto h:corners){const bool outward=(h.id[0]=='n'?p.y<=h.y:p.y>=h.y) && (h.id[1]=='w'?p.x<=h.x:p.x>=h.x);const double radius=(outward?5:18)*scale;if(std::abs(p.x-h.x)<=radius && std::abs(p.y-h.y)<=radius)return h.id;}
 if(t.quad)return {};
 std::string best;double distance=1e100;for(auto h:std::array<Handle,4>{{{"n",(l+r)/2,top},{"s",(l+r)/2,b},{"w",l,(top+b)/2},{"e",r,(top+b)/2}}}){const double dx=p.x-h.x,dy=p.y-h.y;if(std::abs(dx)<=12*scale && std::abs(dy)<=12*scale && dx*dx+dy*dy<distance){distance=dx*dx+dy*dy;best=h.id;}}if(!best.empty())return best;
 const double inner=12*scale,outer=28*scale,cx=(l+r)/2,cy=(top+b)/2;
 if(p.y<top-inner && p.y>=top-outer && std::abs(p.x-cx)<=outer)return "shear-n";
 if(p.y>b+inner && p.y<=b+outer && std::abs(p.x-cx)<=outer)return "shear-s";
 if(p.x<l-inner && p.x>=l-outer && std::abs(p.y-cy)<=outer)return "shear-w";
 if(p.x>r+inner && p.x<=r+outer && std::abs(p.y-cy)<=outer)return "shear-e";
 if(p.x>=l && p.x<=r && p.y>=top && p.y<=b)return {};for(auto h:corners){const double dx=p.x-h.x,dy=p.y-h.y;if(std::abs(dx)<=28*scale && std::abs(dy)<=28*scale && dx*dx+dy*dy<distance){distance=dx*dx+dy*dy;best=std::string("rotate-")+h.id;}}return best;
}
// legacy rotsprite-source.ts bounded 32-tile EPX source cache, 2-pixel halo.
class SelectionRotSpriteSource {
 struct Tile {int x,y,width;std::vector<std::uint32_t> pixels;};
 std::shared_ptr<const SelectionClipboard> source_;int left_,top_;std::map<int,Tile> tiles_;std::vector<int> recency_;
public:
 int width,height;
 SelectionRotSpriteSource(const SelectionClipboard& source):source_(std::make_shared<const SelectionClipboard>(source)),left_(source.width),top_(source.height),width(0),height(0){int r=-1,b=-1;for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x){auto i=y*source.width+x;if(source.mask[i]==1 && source.pixels[i]>>24){left_=std::min(left_,x);top_=std::min(top_,y);r=std::max(r,x);b=std::max(b,y);}}width=std::max(0,r-left_+1);height=std::max(0,b-top_+1);}
 int left()const{return left_;}int top()const{return top_;}
 bool selectedAt(int x,int y)const{return source_->mask[(top_+y)*source_->width+left_+x]==1;}
 std::uint32_t sample(int x,int y){if(x<0 || y<0 || x>=width*8 || y>=height*8)return 0;const int tx=x/256,ty=y/256,key=ty*((width+31)/32)+tx;auto it=tiles_.find(key);if(it==tiles_.end()){const int l=std::max(0,tx*32-2),t=std::max(0,ty*32-2),w=std::min(width,(tx+1)*32+2)-l,h=std::min(height,(ty+1)*32+2)-t;Tile tile{l*8,t*8,w,{}};int sw=w,sh=h;tile.pixels.resize(w*h);for(int row=0;row<h;++row)for(int col=0;col<w;++col){auto i=(top_+t+row)*source_->width+left_+l+col;tile.pixels[row*w+col]=source_->mask[i]==1?source_->pixels[i]:0;}for(int pass=0;pass<3;++pass){std::vector<std::uint32_t> next(sw*sh*4);for(int row=0;row<sh;++row)for(int col=0;col<sw;++col){const auto p=tile.pixels[row*sw+col],a=tile.pixels[std::max(0,row-1)*sw+col],b=tile.pixels[row*sw+std::min(sw-1,col+1)],c=tile.pixels[row*sw+std::max(0,col-1)],d=tile.pixels[std::min(sh-1,row+1)*sw+col];const auto out=row*2*sw*2+col*2;next[out]=c==a && c!=d && a!=b?a:p;next[out+1]=a==b && a!=c && b!=d?b:p;next[out+sw*2]=d==c && d!=b && c!=a?c:p;next[out+sw*2+1]=b==d && b!=a && d!=c?d:p;}tile.pixels=std::move(next);sw*=2;sh*=2;}tile.width=sw;if(tiles_.size()>=32){tiles_.erase(recency_.front());recency_.erase(recency_.begin());}it=tiles_.emplace(key,std::move(tile)).first;}recency_.erase(std::remove(recency_.begin(),recency_.end(),key),recency_.end());recency_.push_back(key);const auto& tile=it->second;return tile.pixels[(y-tile.y)*tile.width+x-tile.x];}
};
// Direct port of legacy fixed-point two-stage RotSprite scan converter.
inline std::vector<TransformCell> rotSpriteSelectionCells(const SelectionClipboard& source,const SelectionTransform& target,int cw,int ch,SelectionRotSpriteSource& sampler,bool legacyOrder=false){
 if(target.quad)return fastSelectionTransformCells(source,target,cw,ch,false,true,legacyOrder);
 const double normalized=std::fmod(std::fmod(target.angle,360)+360,360);if(target.shearX==0 && target.shearY==0 && (std::abs(std::fmod(normalized,90))<1e-9 || std::abs(std::fmod(normalized,90)-90)<1e-9))return fastSelectionTransformCells(source,target,cw,ch,false,true,legacyOrder);
 const double contentWidth=sampler.width,contentHeight=sampler.height;if(!contentWidth || !contentHeight)return {};
 const bool pureRotation=target.shearX==0 && target.shearY==0 && !target.flipHorizontal && !target.flipVertical && target.width==source.width && target.height==source.height;
 const auto center=(legacyOrder?legacySymmetryTransformPoint:transformPoint)(target,(sampler.left()+contentWidth/2)/source.width,(sampler.top()+contentHeight/2)/source.height);
 std::array<TransformPoint,4> points;const std::array<TransformPoint,4> uv{{{0,0},{1,0},{1,1},{0,1}}};for(int i=0;i<4;++i){double u=(sampler.left()+uv[i].x*contentWidth)/source.width,v=(sampler.top()+uv[i].y*contentHeight)/source.height;if(target.flipHorizontal && (legacyOrder&&target.legacyShear?(!std::isfinite((*target.legacyShear)[7])||(*target.legacyShear)[7]>(*target.legacyShear)[0]+1e-9):(!target.flipOriginX||*target.flipOriginX>target.x+1e-9)))u=1-u;if(target.flipVertical && (legacyOrder&&target.legacyShear?(!std::isfinite((*target.legacyShear)[8])||(*target.legacyShear)[8]>(*target.legacyShear)[1]+1e-9):(!target.flipOriginY||*target.flipOriginY>target.y+1e-9)))v=1-v;points[i]=(legacyOrder?legacySymmetryTransformPoint:transformPoint)(target,u,v);}
 double l=1e100,t=l,r=-l,b=r;for(auto p:points){l=std::min(l,p.x);t=std::min(t,p.y);r=std::max(r,p.x);b=std::max(b,p.y);}const SelectionMask workingBounds{int(std::floor(l)),int(std::floor(t)),int(std::ceil(r)-std::floor(l)),int(std::ceil(b)-std::floor(t)),{}};if(workingBounds.width<1 || workingBounds.height<1)return {};
 const double FIXED_ONE=65536,FIXED_HALF=32768;auto fixedMul=[&](double a,double b){return std::floor(a*b/FIXED_ONE);};auto fixedDiv=[&](double a,double b){return b==0?0.0:std::trunc(a*FIXED_ONE/b);};auto fixedFloor=[&](double v){return std::floor(v/FIXED_ONE);};auto fixedRound=[&](double v){return std::floor((v+FIXED_HALF)/FIXED_ONE);};auto fixedRoundDown=[&](double v){return std::floor((v-FIXED_HALF)/FIXED_ONE);};
 const double enlargedWidth=contentWidth*8,enlargedHeight=contentHeight*8,highWidth=workingBounds.width*8.0,highHeight=workingBounds.height*8.0,downsampleX=workingBounds.width>1?fixedDiv(highWidth-1,workingBounds.width-1):0,downsampleY=workingBounds.height>1?fixedDiv(highHeight-1,workingBounds.height-1):0;
 const double firstX=std::max(0,-workingBounds.x),lastX=std::min(workingBounds.width,cw-workingBounds.x),firstY=std::max(0,-workingBounds.y),lastY=std::min(workingBounds.height,ch-workingBounds.y);if(firstX>=lastX || firstY>=lastY)return {};double outputY=firstY;
 std::vector<TransformCell> cells;auto selectedAt=[&](int x,int y){return sampler.selectedAt(x,y);};auto isOpaqueValue=[](std::uint32_t value){return (value>>24)!=0;};
 std::array<double,4> cornersX,cornersY,cornerX,cornerY,cornerSourceX,cornerSourceY;
 const double radians=target.angle*3.141592653589793/180,fixedCosine=std::floor(std::cos(radians)*FIXED_ONE+.5),fixedSine=std::floor(std::sin(radians)*FIXED_ONE+.5),sourceWidthFixed=contentWidth*8*FIXED_ONE,sourceHeightFixed=contentHeight*8*FIXED_ONE,pivotXFixed=sourceWidthFixed/2,pivotYFixed=sourceHeightFixed/2,originXFixed=(center.x-workingBounds.x)*8*FIXED_ONE,originYFixed=(center.y-workingBounds.y)*8*FIXED_ONE,topLeftX=originXFixed-fixedMul(pivotXFixed,fixedCosine)+fixedMul(pivotYFixed,fixedSine),topLeftY=originYFixed-fixedMul(pivotXFixed,fixedSine)-fixedMul(pivotYFixed,fixedCosine);
 if(pureRotation){cornersX={topLeftX,topLeftX+fixedMul(sourceWidthFixed,fixedCosine),topLeftX+fixedMul(sourceWidthFixed,fixedCosine)-fixedMul(sourceHeightFixed,fixedSine),topLeftX-fixedMul(sourceHeightFixed,fixedSine)};cornersY={topLeftY,topLeftY+fixedMul(sourceWidthFixed,fixedSine),topLeftY+fixedMul(sourceWidthFixed,fixedSine)+fixedMul(sourceHeightFixed,fixedCosine),topLeftY+fixedMul(sourceHeightFixed,fixedCosine)};}else for(int i=0;i<4;++i){cornersX[i]=std::floor((points[i].x-workingBounds.x)*8*FIXED_ONE+.5);cornersY[i]=std::floor((points[i].y-workingBounds.y)*8*FIXED_ONE+.5);}
 int topIndex=0;for(int i=1;i<4;++i)if(cornersY[i]<cornersY[topIndex])topIndex=i;const int nextIndex=(topIndex+1)&3,previousIndex=(topIndex+3)&3,rightIndex=(cornersX[nextIndex]-cornersX[topIndex])*(cornersY[previousIndex]-cornersY[topIndex])>(cornersX[previousIndex]-cornersX[topIndex])*(cornersY[nextIndex]-cornersY[topIndex])?1:-1;int cornerIndex=topIndex;for(int i=0;i<4;++i){cornerX[i]=cornersX[cornerIndex];cornerY[i]=cornersY[cornerIndex];cornerSourceY[i]=cornerIndex<2?0:enlargedHeight*FIXED_ONE-1;cornerSourceX[i]=cornerIndex==0 || cornerIndex==3?0:enlargedWidth*FIXED_ONE-1;cornerIndex=(cornerIndex+rightIndex+4)&3;}
  double clipRight = highWidth * FIXED_ONE - 1;
  double topY = cornerY[0];
  double rightY = cornerY[1];
  double bottomY = cornerY[2];
  double leftY = cornerY[3];
  double topX = cornerX[0];
  double rightX = cornerX[1];
  double bottomX = cornerX[2];
  double leftX = cornerX[3];
  if ((leftX > clipRight && topX > clipRight && bottomX > clipRight)
    || (rightX < 0 && topX < 0 && bottomX < 0)) {
    return {};
  }

  double bottomScanline = fixedRound(bottomY);
  bottomScanline = std::min(highHeight, bottomScanline);
  double scanlineY = std::max(0.0, fixedRound(topY));
  if (scanlineY >= bottomScanline) {
    return {};
  }

  double extra = scanlineY * FIXED_ONE + FIXED_HALF - topY;
  double leftBmpDx = fixedDiv(leftX - topX, leftY - topY);
  double leftBmpX = topX + fixedMul(extra, leftBmpDx);
  double leftSourceDx = fixedDiv(cornerSourceX[3] - cornerSourceX[0], leftY - topY);
  double leftSourceX = cornerSourceX[0] + fixedMul(extra, leftSourceDx);
  double leftSourceDy = fixedDiv(cornerSourceY[3] - cornerSourceY[0], leftY - topY);
  double leftSourceY = cornerSourceY[0] + fixedMul(extra, leftSourceDy);
  double leftBottomScanline = std::min(highHeight, fixedRound(leftY));

  double rightBmpDx = fixedDiv(rightX - topX, rightY - topY);
  double rightBmpX = topX + fixedMul(extra, rightBmpDx);
  double rightBottomScanline = fixedRound(rightY);
  double sourceDx = (cornersY[3] - cornersY[0]) * FIXED_ONE * (FIXED_ONE * enlargedWidth) / ((cornersX[1] - cornersX[0]) * (cornersY[3] - cornersY[0]) - (cornersX[3] - cornersX[0]) * (cornersY[1] - cornersY[0]));
  double sourceDy = (cornersY[1] - cornersY[0]) * FIXED_ONE * (FIXED_ONE * enlargedHeight) / ((cornersX[3] - cornersX[0]) * (cornersY[1] - cornersY[0]) - (cornersX[1] - cornersX[0]) * (cornersY[3] - cornersY[0]));

  auto drawScanline = [&](double y,double left,double right,double sourceStartX,double sourceStartY) {
    while (outputY < lastY && fixedFloor(outputY * downsampleY) < y) outputY++;
    if (outputY >= lastY || fixedFloor(outputY * downsampleY) != y) return;
    double leftPixel = std::max(0.0, fixedFloor(left));
    double rightPixel = std::min(highWidth - 1, fixedFloor(right));
    double startX = sourceStartX + fixedMul((leftPixel * FIXED_ONE) - left, sourceDx);
    double startY = sourceStartY + fixedMul((leftPixel * FIXED_ONE) - left, sourceDy);
    double begin = downsampleX > 0 ? std::max(firstX, std::ceil(leftPixel * FIXED_ONE / downsampleX)) : firstX;
    for (double x = begin; x < lastX; x++) {
      double highX = fixedFloor(x * downsampleX);
      if (highX > rightPixel) break;
      double sourcePixelX = fixedFloor(startX + (highX - leftPixel) * sourceDx);
      double sourcePixelY = fixedFloor(startY + (highX - leftPixel) * sourceDy);
      if (sourcePixelX < 0 || sourcePixelY < 0 || sourcePixelX >= enlargedWidth || sourcePixelY >= enlargedHeight) continue;
      double localX = std::floor(sourcePixelX / 8);
      double localY = std::floor(sourcePixelY / 8);
      if (!selectedAt(localX, localY)) continue;
      auto value = sampler.sample(int(sourcePixelX),int(sourcePixelY));
      if (!isOpaqueValue(value)) continue;
      cells.push_back({workingBounds.x+int(x),workingBounds.y+int(outputY),value,std::size_t(sampler.top()+int(localY))*source.width+sampler.left()+int(localX)});
    }
  };

  while (scanlineY < bottomScanline) {
    if (scanlineY >= leftBottomScanline) {
      extra = scanlineY * FIXED_ONE + FIXED_HALF - leftY;
      leftBmpDx = fixedDiv(bottomX - leftX, bottomY - leftY);
      leftBmpX = leftX + fixedMul(extra, leftBmpDx);
      leftSourceDx = fixedDiv(cornerSourceX[2] - cornerSourceX[3], bottomY - leftY);
      leftSourceX = cornerSourceX[3] + fixedMul(extra, leftSourceDx);
      leftSourceDy = fixedDiv(cornerSourceY[2] - cornerSourceY[3], bottomY - leftY);
      leftSourceY = cornerSourceY[3] + fixedMul(extra, leftSourceDy);
      leftBottomScanline = std::min(highHeight, fixedRound(bottomY));
    }
    if (scanlineY >= rightBottomScanline) {
      extra = scanlineY * FIXED_ONE + FIXED_HALF - rightY;
      rightBmpDx = fixedDiv(bottomX - rightX, bottomY - rightY);
      rightBmpX = rightX + fixedMul(extra, rightBmpDx);
      rightBottomScanline = bottomScanline;
    }

    double leftRounded = std::max(0.0, fixedRound(leftBmpX)) * FIXED_ONE;
    double rightRounded = std::min(clipRight, fixedRoundDown(rightBmpX) * FIXED_ONE);
    if (leftRounded <= rightRounded) {
      double roundedSourceX = leftSourceX + fixedMul(leftRounded - leftBmpX + FIXED_HALF - 1, sourceDx);
      double roundedSourceY = leftSourceY + fixedMul(leftRounded - leftBmpX + FIXED_HALF - 1, sourceDy);
      bool skipScanline = false;
      auto sourceXOutside = [&](double value){return fixedFloor(value) < 0 || fixedFloor(value) >= enlargedWidth;};
      auto sourceYOutside = [&](double value){return fixedFloor(value) < 0 || fixedFloor(value) >= enlargedHeight;};

      // Match Aseprite's rounding-error correction. Depending on the
      // direction of the source delta, an out-of-range left sample can be
      // brought back into the sprite by shortening the destination span.
      if (sourceXOutside(roundedSourceX)) {
        if ((roundedSourceX < 0 && sourceDx <= 0) || (roundedSourceX > 0 && sourceDx >= 0)) skipScanline = true;
        else {
          do {
            roundedSourceX += sourceDx;
            leftRounded += FIXED_ONE;
            if (leftRounded > rightRounded) {
              skipScanline = true;
              break;
            }
          } while (sourceXOutside(roundedSourceX));
        }
      }
      if (!skipScanline && sourceXOutside(roundedSourceX + std::floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDx)) {
        double rightSourceX = roundedSourceX + std::floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDx;
        if ((rightSourceX < 0 && sourceDx <= 0) || (rightSourceX > 0 && sourceDx >= 0)) {
          do {
            rightRounded -= FIXED_ONE;
            if (leftRounded > rightRounded) {
              skipScanline = true;
              break;
            }
          } while (sourceXOutside(roundedSourceX + std::floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDx));
        } else skipScanline = true;
      }
      if (!skipScanline && sourceYOutside(roundedSourceY)) {
        if ((roundedSourceY < 0 && sourceDy <= 0) || (roundedSourceY > 0 && sourceDy >= 0)) skipScanline = true;
        else {
          do {
            roundedSourceY += sourceDy;
            leftRounded += FIXED_ONE;
            if (leftRounded > rightRounded) {
              skipScanline = true;
              break;
            }
          } while (sourceYOutside(roundedSourceY));
        }
      }
      if (!skipScanline && sourceYOutside(roundedSourceY + std::floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDy)) {
        double rightSourceY = roundedSourceY + std::floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDy;
        if ((rightSourceY < 0 && sourceDy <= 0) || (rightSourceY > 0 && sourceDy >= 0)) {
          do {
            rightRounded -= FIXED_ONE;
            if (leftRounded > rightRounded) {
              skipScanline = true;
              break;
            }
          } while (sourceYOutside(roundedSourceY + std::floor((rightRounded - leftRounded) / FIXED_ONE) * sourceDy));
        } else skipScanline = true;
      }
      if (!skipScanline) drawScanline(scanlineY, leftRounded, rightRounded, roundedSourceX, roundedSourceY);
    }
    scanlineY += 1;
    leftBmpX += leftBmpDx;
    leftSourceX += leftSourceDx;
    leftSourceY += leftSourceDy;
    rightBmpX += rightBmpDx;
  }

 return cells;
}
}
