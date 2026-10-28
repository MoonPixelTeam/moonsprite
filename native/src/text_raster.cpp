#include "text_raster.h"
#include "selection_transform.h"
#include "raster_geometry.h"
#include <map>
#include <tuple>
#include <stdexcept>
namespace moon {
namespace {
struct Character {TextStyleRun style;std::optional<TextGlyph> glyph;double advance=0,x=0;};
struct Line {std::vector<Character> characters;double width=0,top=0,bottom=0,fontHeight=0,lineSpacing=0,baseline=0;};
Line layoutLine(const TextCelData& d,std::vector<Character> chars){
 Line line;line.characters=std::move(chars);double cursor=0;bool visible=false;line.fontHeight=d.fontSize;line.lineSpacing=d.lineSpacing;
 for(auto& c:line.characters){c.x=d.actualSpacing&&c.glyph?cursor-c.glyph->left:cursor;cursor+=(d.actualSpacing&&c.glyph?c.glyph->width:c.advance)+*c.style.letterSpacing;line.fontHeight=std::max(line.fontHeight,double(*c.style.fontSize));line.lineSpacing=std::max(line.lineSpacing,double(*c.style.lineSpacing));line.width=std::max(line.width,c.x+(c.glyph?c.glyph->left+c.glyph->width:c.advance));if(c.glyph){const auto& g=*c.glyph;if(!visible){line.top=g.top;line.bottom=g.top+g.height-1;visible=true;}else{line.top=std::min(line.top,double(g.top));line.bottom=std::max(line.bottom,double(g.top+g.height-1));}}}
 if(!visible){line.top=-std::ceil(line.fontHeight*.8);line.bottom=std::ceil(line.fontHeight*.2);}return line;
}
void blendGlyph(timeline::Surface& target,const TextGlyph& glyph,int x,int y,std::uint32_t color,bool pixel){
 const int ca=color>>24;for(int gy=0;gy<glyph.height;++gy)for(int gx=0;gx<glyph.width;++gx){const int tx=x+gx,ty=y+gy;if(tx<0||ty<0||tx>=target.width||ty>=target.height)continue;const int coverage=glyph.alpha[std::size_t(gy)*glyph.width+gx];if(!coverage)continue;const int sa=pixel?ca:int(textJsRound(coverage*ca/255.));if(!sa)continue;auto& dest=target.pixels[std::size_t(ty)*target.width+tx];const int da=dest>>24,oa=sa+int(textJsRound(da*(255-sa)/255.));if(!oa)continue;std::uint32_t out=std::uint32_t(oa)<<24;for(int channel=0;channel<3;++channel){const int shift=channel*8;const double c=(((color>>shift)&255)*sa+((dest>>shift)&255)*da*(255-sa)/255.)/oa;out|=std::uint32_t(textJsRound(c))<<shift;}dest=out;}
}
void allocateText(timeline::Surface& out,double width,double height){if(!std::isfinite(width)||!std::isfinite(height)||width<1||height<1||width>2147483647||height>2147483647||width*height>64.*1024*1024)throw std::length_error("Text raster exceeds native pixel budget");out.width=int(width);out.height=int(height);out.pixels.assign(std::size_t(out.width)*out.height,0);}
timeline::Surface rasterBase(const TextCelData& d,int x,int y,const TextGlyphProvider& provider){
 std::u16string text;for(std::size_t i=0;i<d.text.size();++i){if(d.text[i]==u'\r'){text+=u'\n';if(i+1<d.text.size()&&d.text[i+1]==u'\n')++i;}else text+=d.text[i];}
 std::map<std::tuple<std::string,int,char32_t,int>,std::optional<TextGlyph>> cache;std::vector<Line> lines;const int padding=d.boxed&&d.actualSpacing?0:2;const double maxWidth=d.boxed?std::max(1,d.boxWidth-padding*2):0;
 std::size_t start=0;for(;;){auto end=text.find(u'\n',start);if(end==std::u16string::npos)end=text.size();std::vector<Character> chars;
  for(std::size_t i=start;i<end;++i){auto style=textStyleAt(d,int(i));char32_t code=text[i];if(code>=0xd800&&code<=0xdbff&&i+1<end&&text[i+1]>=0xdc00&&text[i+1]<=0xdfff){code=0x10000+((code-0xd800)<<10)+(text[i+1]-0xdc00);++i;}auto key=std::make_tuple(d.fontFamily,*style.fontSize,code,d.smooth?1:192);auto found=cache.find(key);if(found==cache.end())found=cache.emplace(key,provider(d.fontFamily,*style.fontSize,code,d.smooth?1:192)).first;const auto glyph=found->second;double advance=glyph?glyph->advance:*style.fontSize*(code==U' '?.34:.6);if(!d.smooth)advance=std::max(1.,textJsRound(advance));chars.push_back({style,glyph,advance,0});}
  if(!d.boxed||chars.empty())lines.push_back(layoutLine(d,std::move(chars)));else{std::size_t from=0;while(from<chars.size()){std::size_t accepted=from+1;for(std::size_t to=from+1;to<=chars.size();++to){auto candidate=layoutLine(d,{chars.begin()+from,chars.begin()+to});if(candidate.width>maxWidth&&to>from+1)break;accepted=to;if(candidate.width>maxWidth)break;}lines.push_back(layoutLine(d,{chars.begin()+from,chars.begin()+accepted}));from=accepted;}}
  if(end==text.size())break;start=end+1;
 }
 double baseline=padding+std::max(1.,std::ceil(-lines.front().top)),visibleTop=padding,width=0,height=padding;
 for(auto& line:lines){if(d.actualSpacing){line.baseline=visibleTop-line.top;visibleTop=line.baseline+line.bottom+1+line.lineSpacing;}else{line.baseline=baseline;baseline+=std::max(1.,line.fontHeight+line.lineSpacing);}width=std::max(width,line.width);height=std::max(height,line.baseline+line.bottom+1);}
 timeline::Surface out;allocateText(out,d.boxed?d.boxWidth:std::max(1.,std::ceil(width+padding*2)),d.boxed?d.boxHeight:std::max(1.,std::ceil(height+padding)));out.offsetX=x;out.offsetY=y;
 for(const auto& line:lines){const double available=out.width-padding*2;const double align=!d.boxed||d.align==TextCelData::Align::Left?0:d.align==TextCelData::Align::Center?std::max(0.,std::floor((available-line.width)/2)):std::max(0.,available-line.width);for(const auto& c:line.characters)if(c.glyph)blendGlyph(out,*c.glyph,int(textJsRound(padding+align+c.x+c.glyph->left)),int(textJsRound(line.baseline+c.glyph->top)),*c.style.color,!d.smooth);}return out;
}
timeline::Surface transformText(timeline::Surface surface,const TextTransform& operation){
 int left=surface.width,top=surface.height,right=-1,bottom=-1;for(int y=0;y<surface.height;++y)for(int x=0;x<surface.width;++x)if(surface.pixels[std::size_t(y)*surface.width+x]>>24){left=std::min(left,x);top=std::min(top,y);right=std::max(right,x);bottom=std::max(bottom,y);}
 TextRect visible=right>=left?TextRect{double(surface.offsetX+left),double(surface.offsetY+top),double(right-left+1),double(bottom-top+1)}:TextRect{double(surface.offsetX),double(surface.offsetY),double(surface.width),double(surface.height)};
 const double scaleX=operation.target.width/operation.source.width,scaleY=operation.target.height/operation.source.height,sourceCx=operation.source.x+operation.source.width/2,sourceCy=operation.source.y+operation.source.height/2,targetCx=operation.target.x+operation.target.width/2,targetCy=operation.target.y+operation.target.height/2;
 const double radians=operation.angle*3.141592653589793/180,c=std::cos(radians),s=std::sin(radians),dx=(visible.x+visible.width/2-sourceCx)*scaleX,dy=(visible.y+visible.height/2-sourceCy)*scaleY;
 SelectionTransform target;target.width=std::max(1.,textJsRound(visible.width*scaleX));target.height=std::max(1.,textJsRound(visible.height*scaleY));target.x=textJsRound(targetCx+dx*c-dy*s-target.width/2);target.y=textJsRound(targetCy+dx*s+dy*c-target.height/2);target.angle=operation.angle;
 if(operation.shear){auto sh=*operation.shear;if(sh.axis=='x'){target.shearX=(sh.edge=='n'?-1:1)*sh.amount;target.x+=sh.amount*c/2;target.y+=sh.amount*s/2;}else{target.shearY=(sh.edge=='w'?-1:1)*sh.amount;target.x-=sh.amount*s/2;target.y+=sh.amount*c/2;}}
 SelectionClipboard source;source.width=int(visible.width);source.height=int(visible.height);source.pixels.resize(std::size_t(source.width)*source.height);source.mask.assign(source.pixels.size(),1);for(int y=0;y<source.height;++y)for(int x=0;x<source.width;++x)source.pixels[std::size_t(y)*source.width+x]=raster::readWorld(surface,int(visible.x)+x,int(visible.y)+y);
 const auto box=transformBounds(target);timeline::Surface out;allocateText(out,std::max(1,box.width),std::max(1,box.height));out.offsetX=box.x;out.offsetY=box.y;for(auto cell:fastSelectionTransformCells(source,target,0,0,false,false)){const int x=cell.x-out.offsetX,y=cell.y-out.offsetY;if(x>=0&&y>=0&&x<out.width&&y<out.height)out.pixels[std::size_t(y)*out.width+x]=cell.value;}return out;
}
}
timeline::Surface rasterizeText(const TextCelData& raw,int x,int y,const TextGlyphProvider& provider){const auto d=normalizeTextCelData(raw);auto out=rasterBase(d,d.originX.value_or(x),d.originY.value_or(y),provider);for(const auto& transform:d.transforms)out=transformText(std::move(out),transform);return out;}
}
