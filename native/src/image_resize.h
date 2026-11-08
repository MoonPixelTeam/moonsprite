#pragma once
#include "selection_model.h"
#include "raster_geometry.h"
#include <cstdint>
#include <stdexcept>
namespace moon {
enum class ImageInterpolation {Nearest,Smooth};
// document-model.ts resizeSurfacePixels: straight RGBA, including hidden RGB.
inline std::vector<std::uint32_t> resizeImagePixels(const std::vector<std::uint32_t>& pixels,int sw,int sh,int tw,int th,ImageInterpolation method,double scaleX=0,double scaleY=0,double originX=0,double originY=0){
 if(sw<1||sh<1||tw<1||th<1||pixels.size()!=std::size_t(sw)*sh)throw std::invalid_argument("Invalid resize surface");
 std::vector<std::uint32_t> out(std::size_t(tw)*th);const double sx=scaleX?scaleX:double(tw)/sw,sy=scaleY?scaleY:double(th)/sh;
 // Reuse legacy's axis-table approach without changing native sampling arithmetic.
 if(method==ImageInterpolation::Nearest){
  std::vector<int> columns(std::min(tw,4096));for(int begin=0;begin<tw;begin+=int(columns.size())){const int end=std::min(tw-begin,int(columns.size()));for(int i=0;i<end;++i){const int x=begin+i;columns[i]=std::clamp(int(std::floor((x+.5)/sx+originX)),0,sw-1);}
  for(int y=0;y<th;++y){const auto* row=pixels.data()+std::size_t(std::clamp(int(std::floor((y+.5)/sy+originY)),0,sh-1))*sw;auto* target=out.data()+std::size_t(y)*tw;for(int i=0;i<end;++i)target[begin+i]=row[columns[i]];}}return out;
 }
 struct Column{int left,right;double fraction;};std::vector<Column> columns(std::min(tw,4096));
 for(int begin=0;begin<tw;begin+=int(columns.size())){const int end=std::min(tw-begin,int(columns.size()));
 for(int i=0;i<end;++i){const int x=begin+i;const double u=(x+.5)/sx+originX-.5;const int l=int(std::floor(u));columns[i]={std::clamp(l,0,sw-1),std::clamp(l+1,0,sw-1),u-l};}
 for(int y=0;y<th;++y){const double v=(y+.5)/sy+originY-.5;const int t=int(std::floor(v));const double fy=v-t;const auto* topRow=pixels.data()+std::size_t(std::clamp(t,0,sh-1))*sw;const auto* bottomRow=pixels.data()+std::size_t(std::clamp(t+1,0,sh-1))*sw;auto* target=out.data()+std::size_t(y)*tw;
  for(int i=0;i<end;++i){const int x=begin+i;const auto& col=columns[i];const double fx=col.fraction;const auto a=topRow[col.left],b=topRow[col.right],c=bottomRow[col.left],d=bottomRow[col.right];std::uint32_t value=0;
   for(int channel=0;channel<4;++channel){const int shift=channel*8;const double top=((a>>shift)&255)*(1-fx)+((b>>shift)&255)*fx,bottom=((c>>shift)&255)*(1-fx)+((d>>shift)&255)*fx;value|=std::uint32_t(std::floor(top*(1-fy)+bottom*fy+.5))<<shift;}target[x]=value;
  }
 }}return out;
}
// Legacy document-model.ts resizeDocumentImage: scale local bounds in world
// coordinates, then sample through the document scale (including fractional edges).
struct ImageResizeSurfacePlan {int x,y,width,height;double scaleX,scaleY;std::size_t bytes;};
inline ImageResizeSurfacePlan planImageResizeSurface(const timeline::Surface& source,int sw,int sh,int tw,int th){
 raster::validate(source);if(sw<1||sh<1||tw<1||th<1)throw std::invalid_argument("Invalid image resize geometry");
 const double sx=double(tw)/sw,sy=double(th)/sh;auto coordinate=[](double n){if(!std::isfinite(n)||n<std::numeric_limits<int>::min()||n>std::numeric_limits<int>::max())throw std::length_error("Image resize coordinate exceeds range");return int(n);};
 const int x=coordinate(std::floor(source.offsetX*sx)),y=coordinate(std::floor(source.offsetY*sy));const int right=coordinate(std::ceil((std::int64_t(source.offsetX)+source.width)*sx)),bottom=coordinate(std::ceil((std::int64_t(source.offsetY)+source.height)*sy));
 const int w=std::max(1,raster::coordinate(std::int64_t(right)-x)),h=std::max(1,raster::coordinate(std::int64_t(bottom)-y));const auto count=std::uint64_t(w)*h;if(count>64*1024*1024)throw std::length_error("Image resize surface exceeds pixel limit");return {x,y,w,h,sx,sy,std::size_t(count)*sizeof(timeline::Pixel)};
}
inline timeline::Surface imageResizedSurface(const timeline::Surface& source,const ImageResizeSurfacePlan& p,ImageInterpolation method,bool mask=false){
 timeline::Surface out;out.offsetX=p.x;out.offsetY=p.y;out.width=p.width;out.height=p.height;out.storageOriginX=out.storageOriginY=0;
 out.pixels=resizeImagePixels(source.pixels,source.width,source.height,p.width,p.height,method,p.scaleX,p.scaleY,double(p.x)/p.scaleX-source.offsetX,double(p.y)/p.scaleY-source.offsetY);
 if(mask)for(auto& pixel:out.pixels)pixel=timeline::normalizedMaskPixel(pixel);return out;
}
// free-tile.ts uses premultiplied bilinear samples; ordinary document surfaces
// deliberately use straight RGBA. Keep their transparent RGB rules separate.
inline std::vector<std::uint32_t> resizeFreeTileImagePixels(const std::vector<std::uint32_t>& source,int sw,int sh,int tw,int th,ImageInterpolation method){
 if(sw<1||sh<1||tw<1||th<1||source.size()!=std::size_t(sw)*sh)throw std::invalid_argument("Invalid free tile resize surface");
 std::vector<std::uint32_t> out(std::size_t(tw)*th);
 if(method==ImageInterpolation::Nearest){std::vector<int> columns(std::min(tw,4096));for(int begin=0;begin<tw;begin+=int(columns.size())){const int end=std::min(tw-begin,int(columns.size()));for(int i=0;i<end;++i){const int x=begin+i;columns[i]=std::min(sw-1,int(std::floor((x+.5)*sw/tw)));}for(int y=0;y<th;++y){const auto* row=source.data()+std::size_t(std::min(sh-1,int(std::floor((y+.5)*sh/th))))*sw;auto* target=out.data()+std::size_t(y)*tw;for(int i=0;i<end;++i)target[begin+i]=row[columns[i]];}}return out;}
 struct Column{int left,right;double fraction;};std::vector<Column> columns(std::min(tw,4096));
 for(int begin=0;begin<tw;begin+=int(columns.size())){const int end=std::min(tw-begin,int(columns.size()));
 for(int i=0;i<end;++i){const int x=begin+i;const double u=(x+.5)*sw/tw-.5;const int l=int(std::floor(u));columns[i]={std::clamp(l,0,sw-1),std::clamp(l+1,0,sw-1),u-l};}
 for(int y=0;y<th;++y){const double v=(y+.5)*sh/th-.5;const int t=int(std::floor(v));const double fy=v-t;const auto* top=source.data()+std::size_t(std::clamp(t,0,sh-1))*sw;const auto* bottom=source.data()+std::size_t(std::clamp(t+1,0,sh-1))*sw;auto* target=out.data()+std::size_t(y)*tw;
  for(int i=0;i<end;++i){const int x=begin+i;const auto& col=columns[i];const double fx=col.fraction;const auto a=top[col.left],b=top[col.right],c=bottom[col.left],d=bottom[col.right];const double aa=(a>>24)/255.,ab=(b>>24)/255.,ac=(c>>24)/255.,ad=(d>>24)/255.;
   auto interpolate=[&](double a,double b,double c,double d){const double upper=a+(b-a)*fx,lower=c+(d-c)*fx;return upper+(lower-upper)*fy;};
   const double alpha=interpolate(aa,ab,ac,ad);std::uint32_t p=std::uint32_t(std::clamp(std::floor(alpha*255+.5),0.,255.))<<24;
   if(alpha>0)for(int n=0;n<3;++n){const int shift=n*8;const double channel=interpolate(((a>>shift)&255)*aa,((b>>shift)&255)*ab,((c>>shift)&255)*ac,((d>>shift)&255)*ad);p|=std::uint32_t(std::clamp(std::floor(channel/alpha+.5),0.,255.))<<shift;}target[x]=p;
  }
 }}return out;
}
inline tiles::Tileset imageResizedTileset(const tiles::Tileset& source,int width,int height,ImageInterpolation method,bool freeTile){
 tiles::sizeCheck(width,height,source.columns,source.rows,true);if(width==source.tileWidth&&height==source.tileHeight)return source;
 tiles::Tileset out{source.id,source.name,width,height,source.columns,source.rows,source.tileIds,source.tileSlots,std::vector<tiles::Pixel>(std::size_t(source.columns)*source.rows*width*height)};
 for(std::size_t i=0;i<source.tileIds.size();++i){const auto tile=tiles::readTile(source,i);const auto pixels=freeTile?resizeFreeTileImagePixels(tile,source.tileWidth,source.tileHeight,width,height,method):resizeImagePixels(tile,source.tileWidth,source.tileHeight,width,height,method);for(int y=0;y<height;++y)std::copy_n(pixels.begin()+std::size_t(y)*width,width,out.pixels.begin()+((i/source.columns*height+y)*source.columns*width+i%source.columns*width));}return out;
}
inline int roundedImageResizeCoordinate(double n){const double value=std::floor(n+.5);if(!std::isfinite(value)||value<std::numeric_limits<int>::min()||value>std::numeric_limits<int>::max())throw std::length_error("Image resize coordinate exceeds range");return int(value);}
inline std::optional<SelectionMask> resizeImageSelection(const std::optional<SelectionMask>& source,int sw,int sh,int tw,int th){
 if(!source)return {};const auto& s=*source;const double sx=double(tw)/sw,sy=double(th)/sh;
 SelectionMask out;out.x=int(std::floor(s.x*sx));out.y=int(std::floor(s.y*sy));out.width=std::max(1,int(std::ceil((s.x+s.width)*sx))-out.x);out.height=std::max(1,int(std::ceil((s.y+s.height)*sy))-out.y);
 if(!s.mask.empty()){out.mask.resize(std::size_t(out.width)*out.height);for(int y=0;y<out.height;++y)for(int x=0;x<out.width;++x){const int px=int(std::floor((out.x+x+.5)/sx))-s.x,py=int(std::floor((out.y+y+.5)/sy))-s.y;if(px>=0&&py>=0&&px<s.width&&py<s.height)out.mask[std::size_t(y)*out.width+x]=s.mask[std::size_t(py)*s.width+px];}}return out;
}
}
