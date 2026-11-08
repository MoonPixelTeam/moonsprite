#include "image_scale_detection.h"
#include "image_resize.h"
#include <array>
#include <numeric>
namespace moon {namespace {
constexpr int maxScale=512;
struct Detection {
 bool sawBoundary=false;double totalBoundaries=0,runEvidenceWeight=0;int scannedRows=0;
 std::vector<std::uint32_t> horizontal,vertical,values,lengths,longest,previous,row;
 std::array<double,maxScale+1> votes{};
 Detection(int w,int h):horizontal(w),vertical(h),values(w),lengths(w),longest(w),row(w){}
 void evidence(int length,int direction){if(length<1)return;const double weight=std::min(length,32)*direction;runEvidenceWeight+=weight;if(length<=maxScale&&length>1)votes[length]+=weight;for(int divisor=2;divisor*divisor<=length;++divisor)if(length%divisor==0){if(divisor<=maxScale)votes[divisor]+=weight;const int paired=length/divisor;if(paired!=divisor&&paired<=maxScale)votes[paired]+=weight;}}
 void scan(const std::vector<timeline::Pixel>& pixels,int width,int rows,int startY){
  for(int localY=0;localY<rows;++localY){checkImageResizeCancellation();const int globalY=startY+localY;std::uint32_t left=0;int run=0,horizontalLongest=0;
   for(int x=0;x<width;++x){const auto raw=pixels[std::size_t(localY)*width+x],value=(raw>>24)?raw:0;row[x]=value;
    if(x>0&&value!=left){evidence(run,1);horizontalLongest=std::max(horizontalLongest,run);run=0;sawBoundary=true;++totalBoundaries;++horizontal[x];}
    if(!previous.empty()&&value!=previous[x]){sawBoundary=true;++totalBoundaries;++vertical[globalY];}
    if(scannedRows==0){values[x]=value;lengths[x]=1;}else if(value==values[x])++lengths[x];else{evidence(lengths[x],1);longest[x]=std::max(longest[x],lengths[x]);values[x]=value;lengths[x]=1;}
    ++run;left=value;
   }
   evidence(run,1);horizontalLongest=std::max(horizontalLongest,run);evidence(horizontalLongest,-1);if(previous.empty())previous.resize(width);previous.swap(row);++scannedRows;
  }
 }
 int result(int width,int height){
  if(!sawBoundary||totalBoundaries==0)return 0;
  for(std::size_t x=0;x<lengths.size();++x){evidence(lengths[x],1);evidence(std::max(longest[x],lengths[x]),-1);}
  int best=0;double bestScore=0;const int maximum=std::min(maxScale,std::max(width,height)-1);
  for(int factor=2;factor<=maximum;++factor){checkImageResizeCancellation();std::vector<double> hr(factor),vr(factor);
   for(int x=1;x<width;++x)if(horizontal[x])hr[x%factor]+=horizontal[x];for(int y=1;y<height;++y)if(vertical[y])vr[y%factor]+=vertical[y];int hp=0,vp=0;
   for(int residue=1;residue<factor;++residue){if(hr[residue]>hr[hp])hp=residue;if(vr[residue]>vr[vp])vp=residue;}
   int hc=0,vc=0;for(int x=1;x<width;++x)if(horizontal[x]&&x%factor==hp)++hc;for(int y=1;y<height;++y)if(vertical[y]&&y%factor==vp)++vc;if(std::max(hc,vc)<2)continue;
   const double support=(hr[hp]+vr[vp])/totalBoundaries,random=1./factor,score=(support-random)/(1-random);if(support<.8||score<.7)continue;
   if(score>bestScore+1e-6||(std::abs(score-bestScore)<=1e-6&&factor>(best?best:1))){best=factor;bestScore=score;}
  }
  int runFactor=0;if(runEvidenceWeight>=24)for(int factor=2;factor<=maxScale;++factor)if(votes[factor]/runEvidenceWeight>=.68)runFactor=factor;
  if(runFactor&&(!best||runFactor%best==0))return runFactor;if(best)return best;if(runFactor)return runFactor;
  int exact=std::gcd(width,height);for(int x=1;x<width&&exact>1;++x)if(horizontal[x])exact=std::gcd(exact,x);for(int y=1;y<height&&exact>1;++y)if(vertical[y])exact=std::gcd(exact,y);return exact>1?exact:0;
 }
};
}
int detectRepeatedPixelScale(const std::vector<timeline::Pixel>& pixels,int width,int height){if(width<1||height<1||pixels.size()<std::uint64_t(width)*height)return 0;Detection state(width,height);state.scan(pixels,width,height,0);return state.result(width,height);}
int detectDocumentPixelScale(const timeline::Timeline& timeline,const std::string& frame,int width,int height,const std::function<bool()>& cancelled){
 if(width<1||height<1)return 0;Detection state(width,height);for(int y=0;y<height;y+=64){if(cancelled&&cancelled())throw ImageResizeCancelled{};const int rows=std::min(64,height-y);auto pixels=compositeNormalRegion(timeline,frame,{0,y,width,rows});state.scan(pixels,width,rows,y);}if(cancelled&&cancelled())throw ImageResizeCancelled{};return state.result(width,height);
}
}
