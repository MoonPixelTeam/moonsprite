#include "document.h"
#include <stdexcept>
using namespace moon;
void require(bool v){if(!v)throw std::runtime_error("color adjustment regression");}
int main(){
 ColorAdjustment a;a.brightness=20;a.contrast=10;require(ColorAdjustmentSampler(a)(0x8c786450)==0x8caa947e); // corrected against legacy formula below
 a={};a.kind=ColorAdjustmentKind::Invert;require(ColorAdjustmentSampler(a)(0x801e140a)==0x80e1ebf5);require(ColorAdjustmentSampler(a)(0x001e140a)==0x001e140a);
 a.kind=ColorAdjustmentKind::HueSaturation;a.hue=120;require(ColorAdjustmentSampler(a)(0x800000ff)==0x8000ff00);a.colorize=true;a.hue=0;a.saturation=0;require(ColorAdjustmentSampler(a)(0x805ab428)==0x806e6e6e);
 Document d(3,1);d.beginStroke({0,0},0x801e140a);d.commitStroke();d.beginStroke({2,0},0xff0000ff);d.commitStroke();d.markSaved();auto pixels=d.pixels();auto h=d.historySize();d.previewSelection(SelectionMask{0,0,2,1,{1,0}});a={};a.kind=ColorAdjustmentKind::Invert;require(d.beginColorAdjustment());d.updateColorAdjustment(a);require(d.pixels()==pixels && d.displayPixels()[0]==0x80e1ebf5 && d.displayPixels()[2]==pixels[2] && !d.dirty());d.cancelColorAdjustment();require(d.pixels()==pixels && d.historySize()==h);d.beginColorAdjustment();d.updateColorAdjustment(a);require(d.commitColorAdjustment() && d.historySize()==h+1);d.undo();require(d.pixels()==pixels);d.redo();require(d.pixels()[0]==0x80e1ebf5);
 Document linked(2,1);linked.beginStroke({0,0},0xff123456);linked.commitStroke();linked.addLinkedFrame();auto source=linked.timeline().resolveSurface(linked.cel().id).source->id;h=linked.historySize();linked.beginColorAdjustment();linked.updateColorAdjustment(a);require(linked.commitColorAdjustment() && linked.historySize()==h+1 && linked.timeline().resolveSurface(linked.cel().id).source->id==source);linked.undo();require(linked.pixels()[0]==0xff123456);
 Document multi(1,1);multi.beginStroke({0,0},0xff112233);multi.commitStroke();auto first=multi.layer().id;multi.addLayer();multi.beginStroke({0,0},0xff445566);multi.commitStroke();auto second=multi.layer().id;h=multi.historySize();multi.beginColorAdjustment({first,second});multi.updateColorAdjustment(a);require(multi.commitColorAdjustment() && multi.historySize()==h+1 && multi.layer().id==second);multi.undo();require(multi.pixels()[0]==0xff445566);multi.selectLayer(first);require(multi.pixels()[0]==0xff112233);
}
