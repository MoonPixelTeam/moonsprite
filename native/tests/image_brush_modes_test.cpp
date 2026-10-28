
#include "document.h"
#include <memory>
using namespace moon;
void imageBrushModesRegression(){
 auto require=[](bool ok){if(!ok)throw std::runtime_error("Image brush paint-mode regression");};
 PatternBrush image;image.width=2;image.height=1;image.coverage={255,255};image.colors={0x800000ff,0xff00ff00};image.sourceX=1;
 const auto original=std::vector<Pixel>(24,0xffff0000);
 for(auto mode:{PatternPaintMode::Source,PatternPaintMode::Target}){
  auto doc=std::make_unique<Document>(Document::fromImage(8,3,original,U"Pattern modes"));BrushOptions b;b.imagePaintMode=mode;
  const auto preview=doc->brushPreview({3,1},{4,1},0xffffffff,b,&image,0);doc->beginStroke({3,1},0xffffffff,b,&image);doc->updateStroke({4,1});const auto expected=doc->canvasPixels();
  require(expected[10]==(mode==PatternPaintMode::Source?0xff00ff00:0xff7f0080)&&expected[11]==(mode==PatternPaintMode::Source?0xff7f0080:0xff00ff00)&&expected[12]==(mode==PatternPaintMode::Source?0xff00ff00:0xff7f0080));
  auto projected=original;for(auto [i,v]:preview)projected[i]=v;require(projected==expected);doc->cancelStroke();require(doc->canvasPixels()==original&&doc->historyPosition()==0);
  doc->beginStroke({3,1},0xffffffff,b,&image,0,nullptr,false);doc->configureStrokeDynamics(b,&image,0xffffffff,0xff000000,0);doc->updateDynamicStroke({3,1},{3,1,1,100,0,{}},true);doc->updateDynamicStroke({4,1},{4,1,1,100,0,{}});require(doc->canvasPixels()==expected);doc->cancelStroke();require(doc->canvasPixels()==original&&doc->historyPosition()==0);
  doc->beginStroke({3,1},0xffffffff,b,&image);doc->updateStroke({4,1});require(doc->commitStroke()&&doc->historyPosition()==1);doc->undo();require(doc->canvasPixels()==original);doc->redo();require(doc->canvasPixels()==expected);
 }
 auto doc=std::make_unique<Document>(Document::fromImage(8,3,original,U"Paint default"));doc->beginStroke({3,1},0xffffffff,{},&image);require(doc->canvasPixels()[10]==0x800000ff);doc->cancelStroke();
 const auto rotated=prepareImageBrushStamp(image,1,90,PatternPaintMode::Source,3,1,2,1);require(rotated.width==1&&rotated.height==2&&rotated.samples.size()==2&&rotated.samples[0].color==0x800000ff&&rotated.samples[1].color==0xff00ff00);
}
