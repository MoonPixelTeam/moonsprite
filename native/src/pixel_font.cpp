#include "pixel_font.h"
#include "ui/graphics.h"
#include "ui_scale.h"
#include <fstream>
#include <filesystem>
#include <sstream>
#include <stdexcept>
#include <intrin.h>
#include <algorithm>
#include <cstdint>
#include <chrono>
#include <iostream>
namespace moon {
PixelFont::PixelFont(const std::string& path) {
  std::ifstream file(std::filesystem::u8path(path));
  if (!file) throw std::runtime_error("Cannot load Fusion font: " + path);
  std::string line;
  char32_t code=0; Glyph glyph; int bitmapRow=-1; bool sizeFound=false;
  while (std::getline(file,line)) {
    if(!line.empty() && line.back()=='\r') line.pop_back();
    if(line=="FONTBOUNDINGBOX 10 10 0 -1") sizeFound=true;
    if(line.rfind("STARTCHAR ",0)==0) {glyph=Glyph{};bitmapRow=-1;}
    else if(line.rfind("ENCODING ",0)==0) code=char32_t(std::stoul(line.substr(9)));
    else if(line.rfind("DWIDTH ",0)==0) glyph.advance=std::stoi(line.substr(7));
    else if(line.rfind("BBX ",0)==0) {
      std::istringstream box(line.substr(4));
      if(!(box>>glyph.width>>glyph.height>>glyph.x>>glyph.y) || glyph.width<0 || glyph.width>32 || glyph.height<0 || glyph.height>32)
        throw std::runtime_error("Invalid Fusion glyph metrics");
    }
    else if(line=="BITMAP") bitmapRow=0;
    else if(line=="ENDCHAR") {
      // Immutable BDF metrics: reduce the bitmap once, rather than on every
      // menu/button/layout query. Whitespace keeps an empty ink rectangle.
      unsigned columns=0;int top=glyph.height,bottom=0;
      for(int y=0;y<int(glyph.rows.size());++y)if(const auto row=glyph.rows[y]){columns|=row;top=std::min(top,y);bottom=y+1;}
      if(columns){unsigned long first=0,last=0;_BitScanForward(&first,columns);_BitScanReverse(&last,columns);
        glyph.ink={glyph.x+glyph.width-1-int(last),9-glyph.height-glyph.y+top,int(last-first+1),bottom-top};
      }
      if(bitmapRow!=glyph.height || glyph.advance<1 || glyph.advance>32 || !glyphs_.emplace(code,glyph).second)
        throw std::runtime_error("Invalid Fusion glyph");
      bitmapRow=-1;
    } else if(bitmapRow>=0) {
      const auto bytes=(glyph.width+7)/8;
      if(bitmapRow>=glyph.height || line.size()!=std::size_t(bytes*2)) throw std::runtime_error("Invalid Fusion bitmap row");
      const unsigned value=std::stoul(line,nullptr,16);
      glyph.rows.push_back(value>>(bytes*8-glyph.width)); ++bitmapRow;
    }
  }
  if (!sizeFound || !glyphs_.count(65534)) throw std::runtime_error("Fusion 10px font or missing-glyph marker unavailable");
}
void PixelFont::draw(ui::Graphics& g,const std::u32string& text,int x,int y,gfx::Color color) const {
  for(char32_t c:text) {
    const auto it=glyphs_.find(c);
    const auto& glyph=it==glyphs_.end()?glyphs_.at(65534):it->second;
    if(gfx::geta(color)!=255) {
      // laf's color filter rounds translucent overlaps differently from the
      // original rectangles. Keep that uncommon path pixel-exact.
      // Adjacent opaque mask pixels on one row have disjoint coverage;
      // one horizontal fill preserves alpha blending without a call per pixel.
      for(int j=0;j<glyph.height;++j)for(int i=0;i<glyph.width;){
        if(!(glyph.rows[j] & (1u << (glyph.width-1-i)))){++i;continue;}
        const int first=i++;
        while(i<glyph.width && (glyph.rows[j] & (1u << (glyph.width-1-i))))++i;
        g.fillRect(color,gfx::Rect(x+glyph.x+first,y+9-glyph.height-glyph.y+j,i-first,1));
      }
    } else if(glyph.width>0 && glyph.height>0) {
      auto& surface=rasterGlyphs_[it==glyphs_.end()?65534:c];
      if(!surface) {
        surface=os::instance()->makeRgbaSurface(glyph.width,glyph.height);surface->clear();
        for(int j=0;j<glyph.height;++j) for(int i=0;i<glyph.width;++i)
          if(glyph.rows[j] & (1u << (glyph.width-1-i))) surface->putPixel(gfx::rgba(255,255,255),i,j);
        surface->setImmutable();
      }
      // Reuse MIT UI/laf's nearest-neighbor, foreground-colored bitmap path.
      g.drawColoredRgbaSurface(surface.get(),color,x+glyph.x,y+9-glyph.height-glyph.y);
    }
    x+=glyph.advance;
  }
}
void PixelFont::smokeRasterEquivalent() const {
  auto reference=[&](const std::u32string& value){gfx::Rect ink;int pen=0;for(auto c:value){const auto it=glyphs_.find(c);const auto& glyph=it==glyphs_.end()?glyphs_.at(65534):it->second;for(int y=0;y<glyph.height;++y)for(int x=0;x<glyph.width;++x)if(glyph.rows[y]&(1u<<(glyph.width-1-x))){const gfx::Rect pixel(pen+glyph.x+x,9-glyph.height-glyph.y+y,1,1);ink=ink.isEmpty()?pixel:ink.createUnion(pixel);}pen+=glyph.advance;}return ink;};
  for(const auto& item:glyphs_){const std::u32string value{U' ',item.first,U'A'};if(inkBounds(value)!=reference(value))throw std::runtime_error("Fusion ink bounds differ for glyph "+std::to_string(item.first));}
  for(const auto& value:{std::u32string{},std::u32string{U"   "},std::u32string{U"未命名 图层 Ag09\U0001ffff"}})if(inkBounds(value)!=reference(value))throw std::runtime_error("Fusion text ink bounds differ");
  const std::u32string sample=U"未命名 颜色板 图层 恢复 Aa09%";std::uint64_t checksum=0;
  auto timing=[&](bool old){const auto start=std::chrono::steady_clock::now();for(int i=0;i<20000;++i)checksum+=(old?reference(sample):inkBounds(sample)).w;return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();};
  const auto oldMs=timing(true),newMs=timing(false);std::cout<<"Fusion ink bounds 20000: reference_ms="<<oldMs<<" optimized_ms="<<newMs<<" glyphs="<<glyphs_.size()<<" checksum="<<checksum<<'\n';
  // Benchmark the immediately preceding row-reduction implementation too.
  const auto rowStart=std::chrono::steady_clock::now();
  for(int i=0;i<20000;++i){gfx::Rect ink;int pen=0;for(auto c:sample){const auto it=glyphs_.find(c);const auto& glyph=it==glyphs_.end()?glyphs_.at(65534):it->second;unsigned columns=0;int top=glyph.height,bottom=0;for(int y=0;y<glyph.height;++y)if(const auto row=glyph.rows[y]){columns|=row;top=std::min(top,y);bottom=y+1;}if(columns){unsigned long first=0,last=0;_BitScanForward(&first,columns);_BitScanReverse(&last,columns);const gfx::Rect r(pen+glyph.x+glyph.width-1-int(last),9-glyph.height-glyph.y+top,int(last-first+1),bottom-top);ink=ink.isEmpty()?r:ink.createUnion(r);}pen+=glyph.advance;}checksum+=ink.w;}
  std::cout<<"Fusion ink row reduction 20000: previous_ms="<<std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-rowStart).count()<<" cached_ms="<<newMs<<" checksum="<<checksum<<'\n';
  const std::u32string text=U"Aa09% 未命名 颜色板 图层 恢复\U0001ffff";
  for(int scale:{1,2}) for(const auto color:{gfx::rgba(220,180,140),gfx::rgba(100,170,250,128),gfx::rgba(100,170,250,1),gfx::rgba(100,170,250,254)}) for(bool narrow:{false,true}) {
    const int w=(measure(text)+20)*scale,h=24*scale;
    auto before=os::instance()->makeRgbaSurface(w,h),after=os::instance()->makeRgbaSurface(w,h);
    before->clear();after->clear();
    {
      ui::Graphics a(nullptr,before,3,5),b(nullptr,after,3,5);
      a.fillRect(gfx::rgba(20,25,35),gfx::Rect(-3,-5,w,h));b.fillRect(gfx::rgba(20,25,35),gfx::Rect(-3,-5,w,h));
      a.clipRect(gfx::Rect(1,1,w-8,h-8));b.clipRect(gfx::Rect(1,1,w-8,h-8));
      if(narrow){const gfx::Rect clip(7,9,37,11);a.clipRect(clip);b.clipRect(clip);}
      std::unique_ptr<UiPaintScale> sa,sb;
      if(scale==2){sa=std::make_unique<UiPaintScale>(a);sb=std::make_unique<UiPaintScale>(b);}
      int x=2;const int y=4;
      for(const auto code:text) {
        const auto it=glyphs_.find(code);const auto& glyph=it==glyphs_.end()?glyphs_.at(65534):it->second;
        for(int j=0;j<glyph.height;++j) for(int i=0;i<glyph.width;++i)
          if(glyph.rows[j] & (1u<<(glyph.width-1-i)))a.fillRect(color,gfx::Rect(x+glyph.x+i,y+9-glyph.height-glyph.y+j,1,1));
        x+=glyph.advance;
      }
      draw(b,text,2,4,color);
    }
    for(int y=0;y<h;++y) for(int x=0;x<w;++x)
      if(before->getPixel(x,y)!=after->getPixel(x,y))throw std::runtime_error("Fusion raster glyph differs: scale="+std::to_string(scale)+" color="+std::to_string(color)+" at="+std::to_string(x)+","+std::to_string(y)+" old="+std::to_string(before->getPixel(x,y))+" new="+std::to_string(after->getPixel(x,y)));
  }
}
int PixelFont::measure(const std::u32string& text) const {
  int width=0;
  for(auto c:text) {const auto it=glyphs_.find(c);width+=it==glyphs_.end()?10:it->second.advance;}
  return width;
}
gfx::Rect PixelFont::inkBounds(const std::u32string& text) const {
  gfx::Rect ink;int pen=0;
  for(auto c:text) {
    const auto it=glyphs_.find(c);
    const auto& glyph=it==glyphs_.end()?glyphs_.at(65534):it->second;
    if(!glyph.ink.isEmpty()){
      const auto bounds=gfx::Rect(glyph.ink).offset(pen,0);
      ink=ink.isEmpty()?bounds:ink.createUnion(bounds);
    }
    pen+=glyph.advance;
  }
  return ink;
}
}
