#include "document.h"
#include "pixel_clipboard.h"
#include <iostream>
#include <stdexcept>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
using namespace moon;
int main(){try{
 SelectionClipboard source;source.width=3;source.height=2;source.originX=-40;source.originY=88;source.pixels={0xff112233,0xff445566,0x00112233,0x80123456,0xff999999,0xffabcdef};source.mask={1,0,1,1,2,1};
 const auto d=Document::fromClipboardRaster(source);const Document defaults(3,2);
 CHECK(d.width()==3&&d.height()==2&&d.name()==U"粘贴的图像"&&d.dirty()&&d.historySize()==0&&!d.selection()&&!d.floating());
 CHECK(d.pixels()==std::vector<Pixel>({0xff112233,0,0x00112233,0x80123456,0,0xffabcdef}));
 CHECK(d.palette().entries.size()==2&&d.palette().slots==defaults.palette().slots&&d.palette().nextId==defaults.palette().nextId);
 for(std::size_t i=0;i<2;++i)CHECK(d.palette().entries[i].id==defaults.palette().entries[i].id&&d.palette().entries[i].color==defaults.palette().entries[i].color);
 auto noMask=source;noMask.mask.clear();CHECK(Document::fromClipboardRaster(noMask).pixels()==source.pixels);
 for(int variant=0;variant<4;++variant){auto invalid=source;if(variant==0)invalid.mask.pop_back();if(variant==1)invalid.pixels.pop_back();if(variant==2)invalid.width=1025;if(variant==3)invalid.width=0;bool rejected=false;try{Document::fromClipboardRaster(invalid);}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);}
 PixelClipboard structured;SelectionClipboard baseline;baseline.width=baseline.height=1;baseline.pixels={0xff0000ff};
 structured.exchangeSystemImageReaderForSmoke([baseline]{return std::optional<SelectionClipboard>{baseline};});structured.captureStructuredCopyBaseline();CHECK(structured.preferStructuredCopy(baseline));auto changed=baseline;changed.pixels[0]=0xff00ff00;CHECK(!structured.preferStructuredCopy(changed));CHECK(structured.preferStructuredCopy({}));auto masked=baseline;masked.mask={1};CHECK(structured.preferStructuredCopy(masked));masked.mask={0};CHECK(!structured.preferStructuredCopy(masked));structured.exchangeSystemImageReaderForSmoke([]()->std::optional<SelectionClipboard>{throw std::runtime_error("busy");});structured.captureStructuredCopyBaseline();CHECK(structured.preferStructuredCopy({})&&!structured.preferStructuredCopy(baseline));
 const std::optional<SelectionClipboard> internal=source;auto system=noMask;system.pixels[0]=0xffabcdef;
 CHECK(PixelClipboard::readNewDocumentSource(internal,[system]{return std::optional<SelectionClipboard>{system};})->pixels[0]==0xffabcdef);
 CHECK(PixelClipboard::readNewDocumentSource(internal,[]{return std::optional<SelectionClipboard>{};})->pixels==source.pixels);
 auto transparent=system;for(auto& p:transparent.pixels)p&=0xffffff;CHECK(PixelClipboard::readNewDocumentSource(internal,[transparent]{return std::optional<SelectionClipboard>{transparent};})->pixels==source.pixels);
 CHECK(PixelClipboard::readNewDocumentSource(internal,[]()->std::optional<SelectionClipboard>{throw std::runtime_error("busy");})->pixels==source.pixels);
 CHECK(!PixelClipboard::readNewDocumentSource({},[]{return std::optional<SelectionClipboard>{};}));
 bool rejected=false;try{PixelClipboard::readNewDocumentSource(internal,[]()->std::optional<SelectionClipboard>{throw PixelClipboard::ImageNotAdmitted("limit");});}catch(const PixelClipboard::ImageNotAdmitted&){rejected=true;}CHECK(rejected);
 {
  SelectionClipboard remembered;remembered.width=2;remembered.height=1;remembered.originX=3;remembered.originY=-2;remembered.pixels={0xff123456,0xffabcdef};
  auto same=remembered;same.originX.reset();same.originY.reset();same.mask={1,1};int probes=0;
  auto sameResult=PixelClipboard::readSelectionSource(remembered,[&]{++probes;return std::optional<SelectionClipboard>{same};});
  CHECK(probes==1&&sameResult&&sameResult->originX==3&&sameResult->originY==-2&&sameResult->mask.empty());
  auto different=same;different.pixels[0]=0xff987654;auto live=PixelClipboard::readSelectionSource(remembered,[&]{++probes;return std::optional<SelectionClipboard>{different};});
  CHECK(probes==2&&live&&live->pixels==different.pixels&&!live->originX&&!live->originY);
  auto masked=same;masked.pixels[1]=0x00abcdef;masked.mask={1,0};auto maskResult=PixelClipboard::readSelectionSource(remembered,[masked]{return std::optional<SelectionClipboard>{masked};});CHECK(maskResult&&maskResult->pixels==masked.pixels&&maskResult->mask==masked.mask&&!maskResult->originX);
  auto fallback=[&](PixelClipboard::ImageReader reader){auto result=PixelClipboard::readSelectionSource(remembered,reader);CHECK(result&&result->pixels==remembered.pixels&&result->originX==3&&result->originY==-2);};
  fallback([]{return std::optional<SelectionClipboard>{};});auto invisible=same;invisible.pixels={0x00030201,0x00040506};invisible.mask={0,0};fallback([invisible]{return std::optional<SelectionClipboard>{invisible};});fallback([]()->std::optional<SelectionClipboard>{throw std::runtime_error("busy");});
  CHECK(!PixelClipboard::readSelectionSource({},[]{return std::optional<SelectionClipboard>{};}));CHECK(!PixelClipboard::readSelectionSource({},[invisible]{return std::optional<SelectionClipboard>{invisible};}));CHECK(!PixelClipboard::readSelectionSource({},[]()->std::optional<SelectionClipboard>{throw std::runtime_error("busy");}));
 }
 {
  auto placement=[](int w,int h,int left,int top,int right,int bottom,std::optional<int> ox,std::optional<int> oy,int expectedX,int expectedY){SelectionClipboard clip;clip.width=w;clip.height=h;clip.originX=ox;clip.originY=oy;const auto p=PixelClipboard::resolvePlacement(clip,20,20,left,top,right,bottom);CHECK(p.x==expectedX&&p.y==expectedY);};
  placement(3,3,0,0,8,8,{},{},3,3);placement(3,3,0,0,8,8,1,2,1,2);placement(3,3,0,0,8,8,100,100,3,3);placement(19,2,30,0,34,8,{},{},19,3);placement(19,2,-15,0,-10,8,{},{},-18,3);placement(30,2,0,0,20,20,{},{},0,9);placement(2,30,0,0,20,20,{},{},9,0);placement(3,3,0,0,8,8,1,{},3,3);
 }
 std::cout<<"Clipboard new-document legacy fixtures passed without changing system clipboard\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
