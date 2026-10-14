#include "pixel_font.h"
#include "ui/graphics.h"
#include "ui_scale.h"
#include <fstream>
#include <filesystem>
#include <sstream>
#include <stdexcept>
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
      for(int j=0;j<glyph.height;++j) for(int i=0;i<glyph.width;++i)
        if(glyph.rows[j] & (1u << (glyph.width-1-i))) g.fillRect(color,gfx::Rect(x+glyph.x+i,y+9-glyph.height-glyph.y+j,1,1));
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
  const std::u32string text=U"Aa09% 未命名 颜色板 图层 恢复\U0001ffff";
  for(int scale:{1,2}) for(const auto color:{gfx::rgba(220,180,140),gfx::rgba(100,170,250,128)}) {
    const int w=(measure(text)+20)*scale,h=24*scale;
    auto before=os::instance()->makeRgbaSurface(w,h),after=os::instance()->makeRgbaSurface(w,h);
    before->clear();after->clear();
    {
      ui::Graphics a(nullptr,before,3,5),b(nullptr,after,3,5);
      a.fillRect(gfx::rgba(20,25,35),gfx::Rect(-3,-5,w,h));b.fillRect(gfx::rgba(20,25,35),gfx::Rect(-3,-5,w,h));
      a.clipRect(gfx::Rect(1,1,w-8,h-8));b.clipRect(gfx::Rect(1,1,w-8,h-8));
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
    for(int y=0;y<glyph.height;++y) for(int x=0;x<glyph.width;++x)
      if(glyph.rows[y] & (1u << (glyph.width-1-x))) {
        const gfx::Rect pixel(pen+glyph.x+x,9-glyph.height-glyph.y+y,1,1);
        ink=ink.isEmpty()?pixel:ink.createUnion(pixel);
      }
    pen+=glyph.advance;
  }
  return ink;
}
}
