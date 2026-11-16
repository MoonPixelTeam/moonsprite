#pragma once
#include "canvas_references.h"
#include "selection_transform.h"
namespace moon {
struct ReferenceSourcePoint {int x,y;};
inline TransformPoint referenceUnrotate(const ReferencePlacement& r,TransformPoint p){const double a=r.angle*3.141592653589793/180,c=std::cos(a),s=std::sin(a),x=p.x-r.x-r.width/2,y=p.y-r.y-r.height/2;return {r.x+r.width/2+x*c+y*s,r.y+r.height/2-x*s+y*c};}
inline std::optional<ReferenceSourcePoint> referenceSourcePoint(const ReferencePlacement& r,TransformPoint point,int width,int height){const auto p=referenceUnrotate(r,point);const double x=(p.x-r.x)/r.width,y=(p.y-r.y)/r.height;if(x<0||y<0||x>=1||y>=1)return {};const int sx=int(std::floor(x*width)),sy=int(std::floor(y*height));return ReferenceSourcePoint{r.flipX?width-1-sx:sx,r.flipY?height-1-sy:sy};}
inline ReferencePlacement resizeReferenceBounds(const ReferencePlacement& start,TransformPoint delta,const std::string& handle,bool integerScale,bool center){
 SelectionTransform t;t.x=start.x;t.y=start.y;t.width=start.width;t.height=start.height;t.angle=start.angle;
 auto target=resizeSelectionTransform(t,delta,handle,true,integerScale,false);
 if(center){
  // canvas-input-resize.ts resizeSelectionBounds: centered sizes round before
  // ratio selection, then preserve the original axis parity. Reference bounds
  // have no custom selection pivot or shear.
  const double a=start.angle*3.141592653589793/180,c=std::cos(a),s=std::sin(a);
  const double dx=delta.x*c+delta.y*s,dy=-delta.x*s+delta.y*c;
  const bool west=handle.find('w')!=std::string::npos,east=handle.find('e')!=std::string::npos,north=handle.find('n')!=std::string::npos,south=handle.find('s')!=std::string::npos;
  const bool horizontal=west||east,vertical=north||south;
  const double signedWidth=start.width+2*(west?-dx:east?dx:0),signedHeight=start.height+2*(north?-dy:south?dy:0);
  const double rawWidth=horizontal?std::max(std::fmod(start.width,2)==0?2.:1.,std::abs(std::floor(signedWidth+.5))):start.width;
  const double rawHeight=vertical?std::max(std::fmod(start.height,2)==0?2.:1.,std::abs(std::floor(signedHeight+.5))):start.height;
  const bool driven=horizontal&&!vertical?true:vertical&&!horizontal?false:rawWidth/start.width>=rawHeight/start.height;
  double w=driven?rawWidth:std::max(1.,std::floor(rawHeight*start.width/start.height+.5));
  double h=driven?std::max(1.,std::floor(rawWidth*start.height/start.width+.5)):rawHeight;
  if(integerScale){const double scale=std::max(1.,std::floor((driven?rawWidth/start.width:rawHeight/start.height)+.5));w=start.width*scale;h=start.height*scale;}
  auto parity=[](double value,double original){const double minimum=std::fmod(original,2)==0?2:1;double result=std::max(minimum,std::floor(value+.5));if(std::fmod(std::abs(result-original),2)!=0)result+=result>minimum?-1:1;return result;};
  target.width=parity(w,start.width);target.height=parity(h,start.height);target.x=start.x+(start.width-target.width)/2;target.y=start.y+(start.height-target.height)/2;target.flipHorizontal=horizontal&&signedWidth<0;target.flipVertical=vertical&&signedHeight<0;
 }
 const bool vertical=handle=="n"||handle=="s";const double ratio=start.width/start.height,width=vertical?target.height*ratio:target.width,height=width/ratio;
 const double dx=center?0:(handle.find('w')!=std::string::npos?-1:handle.find('e')!=std::string::npos?1:0)*(target.flipHorizontal?-1:1)*(width-target.width)/2;
 const double dy=center?0:(handle.find('n')!=std::string::npos?-1:handle.find('s')!=std::string::npos?1:0)*(target.flipVertical?-1:1)*(height-target.height)/2;
 const double a=start.angle*3.141592653589793/180;auto result=start;result.x=target.x+target.width/2+dx*std::cos(a)-dy*std::sin(a)-width/2;result.y=target.y+target.height/2+dx*std::sin(a)+dy*std::cos(a)-height/2;result.width=width;result.height=height;result.flipX=start.flipX!=target.flipHorizontal;result.flipY=start.flipY!=target.flipVertical;return result;
}
// CanvasReferences uses resize ?? rotation, never selection's shear branch.
inline std::string referenceTransformHit(const ReferencePlacement& r,TransformPoint point,double scale){
 const auto p=referenceUnrotate(r,point);const double l=r.x,t=r.y,right=l+r.width,b=t+r.height;
 struct Handle{const char* id;double x,y;};const Handle corners[]={{"nw",l,t},{"ne",right,t},{"sw",l,b},{"se",right,b}};
 for(const auto& h:corners){const bool outward=(h.id[0]=='n'?p.y<=h.y:p.y>=h.y)&&(h.id[1]=='w'?p.x<=h.x:p.x>=h.x);const double radius=(outward?5:18)*scale;if(std::abs(p.x-h.x)<=radius&&std::abs(p.y-h.y)<=radius)return h.id;}
 double distance=1e100;std::string best;for(const auto& h:std::array<Handle,4>{{{"n",(l+right)/2,t},{"s",(l+right)/2,b},{"w",l,(t+b)/2},{"e",right,(t+b)/2}}}){const double dx=p.x-h.x,dy=p.y-h.y;if(std::abs(dx)<=12*scale&&std::abs(dy)<=12*scale&&dx*dx+dy*dy<distance){distance=dx*dx+dy*dy;best=h.id;}}
 if(!best.empty()||(p.x>=l&&p.x<=right&&p.y>=t&&p.y<=b))return best;
 distance=1e100;for(const auto& h:std::array<Handle,4>{{{"ne",right,t},{"se",right,b},{"sw",l,b},{"nw",l,t}}}){const double dx=p.x-h.x,dy=p.y-h.y;const double radius=28*std::max(.0001,scale);if(std::abs(dx)<=radius&&std::abs(dy)<=radius&&dx*dx+dy*dy<distance){distance=dx*dx+dy*dy;best=std::string("rotate-")+h.id;}}return best;
}
// Legacy referenceScreenBounds/referenceDocumentBounds, with an injected
// continuous view transform. Floating placements use stage logical pixels.
template<class Forward> ReferencePlacement referenceScreenPlacement(const ReferencePlacement& r,bool floating,double scale,double rotation,bool mirrorX,bool mirrorY,Forward forward){
 if(floating)return r;auto out=r;const auto center=forward(TransformPoint{r.x+r.width/2,r.y+r.height/2});out.width*=scale;out.height*=scale;out.x=center.x-out.width/2;out.y=center.y-out.height/2;out.angle=rotation+((mirrorX!=mirrorY)?-r.angle:r.angle);out.flipX=r.flipX!=mirrorX;out.flipY=r.flipY!=mirrorY;return out;
}
template<class Inverse> ReferencePlacement referenceDocumentPlacement(const ReferencePlacement& r,double scale,double rotation,bool mirrorX,bool mirrorY,Inverse inverse){
 auto out=r;const auto center=inverse(TransformPoint{r.x+r.width/2,r.y+r.height/2});out.width/=scale;out.height/=scale;out.x=center.x-out.width/2;out.y=center.y-out.height/2;out.angle=(r.angle-rotation)*((mirrorX!=mirrorY)?-1:1);out.flipX=r.flipX!=mirrorX;out.flipY=r.flipY!=mirrorY;return out;
}
}
