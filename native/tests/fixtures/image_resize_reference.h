#pragma once
// Frozen pre-optimization sampling loops from dev 980f5e84; differential oracle.
namespace moon::resize_reference {
inline std::vector<std::uint32_t> resizeImagePixels(const std::vector<std::uint32_t>& pixels,int sw,int sh,int tw,int th,ImageInterpolation method,double scaleX=0,double scaleY=0,double originX=0,double originY=0){
 if(sw<1||sh<1||tw<1||th<1||pixels.size()!=std::size_t(sw)*sh)throw std::invalid_argument("Invalid resize surface");
 std::vector<std::uint32_t> out(std::size_t(tw)*th);const double sx=scaleX?scaleX:double(tw)/sw,sy=scaleY?scaleY:double(th)/sh;
 auto at=[&](int x,int y){return pixels[std::size_t(std::clamp(y,0,sh-1))*sw+std::clamp(x,0,sw-1)];};
 for(int y=0;y<th;++y)for(int x=0;x<tw;++x){
  if(method==ImageInterpolation::Nearest){out[std::size_t(y)*tw+x]=at(int(std::floor((x+.5)/sx+originX)),int(std::floor((y+.5)/sy+originY)));continue;}
  const double u=(x+.5)/sx+originX-.5,v=(y+.5)/sy+originY-.5;const int l=int(std::floor(u)),t=int(std::floor(v));const double fx=u-l,fy=v-t;
  const auto a=at(l,t),b=at(l+1,t),c=at(l,t+1),d=at(l+1,t+1);std::uint32_t value=0;
  for(int channel=0;channel<4;++channel){const int shift=channel*8;const double top=((a>>shift)&255)*(1-fx)+((b>>shift)&255)*fx,bottom=((c>>shift)&255)*(1-fx)+((d>>shift)&255)*fx;value|=std::uint32_t(std::floor(top*(1-fy)+bottom*fy+.5))<<shift;}
  out[std::size_t(y)*tw+x]=value;
 }return out;
}
inline std::vector<std::uint32_t> resizeFreeTileImagePixels(const std::vector<std::uint32_t>& source,int sw,int sh,int tw,int th,ImageInterpolation method){
 if(sw<1||sh<1||tw<1||th<1||source.size()!=std::size_t(sw)*sh)throw std::invalid_argument("Invalid free tile resize surface");
 std::vector<std::uint32_t> out(std::size_t(tw)*th);
 if(method==ImageInterpolation::Nearest){for(int y=0;y<th;++y)for(int x=0;x<tw;++x)out[std::size_t(y)*tw+x]=source[std::size_t(std::min(sh-1,int(std::floor((y+.5)*sh/th))))*sw+std::min(sw-1,int(std::floor((x+.5)*sw/tw)))];return out;}
 auto sample=[&](int x,int y,int channel){const auto p=source[std::size_t(std::clamp(y,0,sh-1))*sw+std::clamp(x,0,sw-1)];const double alpha=(p>>24)/255.;return channel==3?alpha:((p>>(channel*8))&255)*alpha;};
 for(int y=0;y<th;++y)for(int x=0;x<tw;++x){const double u=(x+.5)*sw/tw-.5,v=(y+.5)*sh/th-.5;const int l=int(std::floor(u)),t=int(std::floor(v));const double fx=u-l,fy=v-t;
  auto channel=[&](int n){const auto a=sample(l,t,n),b=sample(l+1,t,n),c=sample(l,t+1,n),d=sample(l+1,t+1,n);const double top=a+(b-a)*fx,bottom=c+(d-c)*fx;return top+(bottom-top)*fy;};
  const double alpha=channel(3);std::uint32_t p=std::uint32_t(std::clamp(std::floor(alpha*255+.5),0.,255.))<<24;for(int n=0;n<3;++n)if(alpha>0)p|=std::uint32_t(std::clamp(std::floor(channel(n)/alpha+.5),0.,255.))<<(n*8);out[std::size_t(y)*tw+x]=p;
 }return out;
}
}
