#include "sheet_import_preview_model.h"
#include "fixtures/sheet_import_preview_legacy.h"
#include <iostream>
using namespace moon;
void check(bool value){if(!value)throw std::runtime_error("Actual legacy sheet preview mismatch");}
int main(){try{
 const sheet_preview::Point points[]{{8,8},{30,22},{0,8},{8,0},{16,8},{8,16},{18,8},{8,19}};
 for(const auto& c:sheetPreviewOracle){SheetImportOptions o;o.width=o.height=16;o.paddingX=2;o.paddingY=3;sheet_preview::View view;check(view.scale(64,32,720,480)==10);view.zoom=10;const auto p=points[c.mode%8];const auto drag=sheet_preview::begin(o,p,10,view.pan,c.mode==8);auto result=o;
  if(drag.mode==sheet_preview::Mode::Pan){view.pan.x+=c.dx*10;view.pan.y+=c.dy*10;if(c.cancel)view.pan=drag.pan;}else{result=sheet_preview::moved(drag,{p.x+c.dx,p.y+c.dy});if(c.cancel)result=drag.initial;}
  check((std::array<int,6>{result.x,result.y,result.width,result.height,result.paddingX,result.paddingY}==c.fields)&&std::abs(view.pan.x-c.panX)<1e-8&&std::abs(view.pan.y-c.panY)<1e-8);
 }
 for(const auto& c:sheetWheelOracle){sheet_preview::View v;v.wheel(64,32,720,480,{150,170},c.delta<0);check(std::abs(*v.zoom-c.zoom)<1e-8&&std::abs(v.pan.x-c.panX)<1e-8&&std::abs(v.pan.y-c.panY)<1e-8);v.fit();check(!v.zoom&&v.pan.x==0&&v.pan.y==0);}
 // Viewport resize recomputes automatic fit; explicit zoom survives resize.
 sheet_preview::View view;check(view.scale(64,32,720,480)==10&&view.scale(64,32,360,240)==4);view.zoom=3;check(view.scale(64,32,360,240)==3);
 bool rejected=false;SheetImportOptions o;o.x=INT32_MAX;auto d=sheet_preview::begin(o,{double(INT32_MAX)+8,8},10,{},false);try{sheet_preview::moved(d,{double(INT32_MAX)+100,8});}catch(const std::length_error&){rejected=true;}check(rejected);
 std::cout<<sheetPreviewOracle.size()<<" actual legacy drag/cancel cases and anchored zoom passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
