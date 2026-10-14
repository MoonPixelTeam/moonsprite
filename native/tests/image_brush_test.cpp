#include "document.h"
#include <cstdio>
using namespace moon;
int check=0;void require(bool v){++check;if(!v)throw std::runtime_error("image brush regression");}
int main(){try{
 PatternBrush b;b.width=2;b.height=1;b.coverage={255,255};b.colors={0x800000ff,0xff00ff00};Document d(6,3);d.beginStroke({2,1},0xff112233);d.commitStroke();d.markSaved();auto before=d.pixels();auto h=d.historySize();d.beginStroke({2,1},0xffffffff,{1,50,BrushShape::Round},&b);require(d.pixels()[7]==0x400000ff && d.pixels()[8]==0x8000ff00);d.updateStroke({3,1});require(d.pixels()[8]==0x400000ff && d.pixels()[9]==0x8000ff00);d.updateStroke({2,1});require(d.pixels()[8]==0x8000ff00);d.cancelStroke();require(d.pixels()==before && d.historySize()==h && !d.dirty());d.beginStroke({2,1},0xffffffff,{},&b);require(d.commitStroke());d.undo();require(d.pixels()==before);d.redo();require(d.pixels()[7]==b.colors[0]);
 d.undo();d.previewSelection(SelectionMask{2,1,1,1,{}});d.beginStroke({2,1},0xffffffff,{},&b);require(d.pixels()[7]==0 && d.pixels()[8]==b.colors[1]);d.cancelStroke();d.previewSelection({});d.symmetryAxes.vertical=true;d.beginStroke({1,1},0xffffffff,{},&b);require(d.pixels()[6]==b.colors[0] && d.pixels()[11]==b.colors[0]);d.cancelStroke();d.symmetryAxes={};
 d.beginStroke({2,1},0,{1,50,BrushShape::Round},&b);auto erased=d.pixels()[8];d.updateStroke({2,1});require(d.pixels()[8]==erased);d.cancelStroke();
 auto rotated=prepareImageBrushStamp(b,1,90);require(rotated.width==1 && rotated.height==2 && rotated.samples.size()==2);d.addLinkedFrame();auto owner=d.timeline().resolveSurface(d.cel().id).source->id;h=d.historySize();d.beginStroke({2,1},0xffffffff,{},&b);require(d.commitStroke() && d.historySize()==h+1 && d.timeline().resolveSurface(d.cel().id).source->id==owner);d.undo();require(d.pixels()==before);
 return 0;
}catch(const std::exception& e){std::fprintf(stderr,"%s check=%d\n",e.what(),check);return 1;}}

