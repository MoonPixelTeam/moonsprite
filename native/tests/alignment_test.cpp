#include "alignment.h"
#include "editor_preferences.h"
#include <iostream>
#include <stdexcept>
#define CHECK(...) do{if(!(__VA_ARGS__))throw std::runtime_error(#__VA_ARGS__);}while(false)
using namespace moon;
int main(){try{
 auto r=resolveAlignment({{1,20,4,4}},{},{12,0},32,100,{},false,true,2);CHECK(r.offset.x==13&&r.offset.y==0);CHECK(r.guides[0].axis=='x'&&r.guides[0].position==16&&r.guides[0].smart);
 r=resolveAlignment({{0,0,4,4}},{{10,40,4,4},{40,9,6,6}},{5,4},100,100,{},false,true,2);CHECK(r.offset.x==6&&r.offset.y==5);
 r=resolveAlignment({{1,2,3,2}},{},{7,4},64,64,{2,3,8,6},true,false,1);CHECK(r.offset.x==6&&r.offset.y==5);
 r=resolveAlignment({{0,0,4,4}},{{10,10,4,4}},{5,0},64,64,{},false,true,6,'x');CHECK(r.offset.x==6&&r.offset.y==0);for(auto g:r.guides)CHECK(g.axis=='x');
 CHECK(alignmentThresholdForZoom(6,16)==1&&alignmentThresholdForZoom(6,-2)==3&&alignmentThresholdForZoom(6,0)==0);
 r=resolveAlignment({{20,20,3,3}},{{27,40,4,4}},{6,0},0,0,{},false,true,1);CHECK(r.offset.x==7);
 r=resolveAlignment({{0,20,2,2}},{{5,40,2,2}},{4,0},0,0,{0,0,4,4},true,true,1);CHECK(r.offset.x==4);CHECK(!r.guides.empty()&&!r.guides.front().smart);
 r=resolveAlignment({{0,20,2,2}},{{5,40,2,2}},{3,0},0,0,{0,0,4,4},true,true,1);CHECK(r.offset.x==3);
 r=resolveAlignment({{0,20,2,2}},{{6,40,2,2}},{3,0},0,0,{0,0,4,4},true,true,1);CHECK(r.offset.x==4);CHECK(r.guides.front().smart);
 timeline::State s;s.groups.push_back({"hidden",U"隐藏",{},false});timeline::Layer hidden{"hidden-child",U"隐藏"};hidden.groupId="hidden";s.layers={hidden,{"shown",U"显示"},{"moving",U"移动"}};s.frames.push_back({"f"});
 for(auto l:s.layers){timeline::Cel c;c.id=l.id;c.layerId=l.id;c.frameId="f";c.surface=timeline::Surface{3,1,-9,4,{},{},{0,0xff000000,0}};s.cels.push_back(c);}timeline::Timeline t(s);auto targets=alignmentLayerTargets(t,"f",{"moving"});CHECK(targets.size()==1&&targets[0].x==-8&&targets[0].width==1);
 AlignmentBoundsCache cache;auto cached=alignmentLayerTargets(t,"f",{"moving"},&cache);CHECK(cache.entries.size()==1&&cached[0].x==-8);alignmentLayerTargets(t,"f",{"moving"},&cache);CHECK(cache.entries.size()==1);t.setPixel("shown",0,0xff000000);cached=alignmentLayerTargets(t,"f",{"moving"},&cache);CHECK(cached[0].x==-9&&cached[0].width==2);
 preferences::RuntimeSettings p;CHECK(!p.flag("tools.smartAlignmentEnabled")&&!p.flag("tools.alignmentGuidesVisible")&&p.index("tools.alignmentThreshold.Number")==6);p.set("tools.alignmentThreshold.Number","99");CHECK(p.index("tools.alignmentThreshold.Number")==32);p.set("tools.smartAlignmentEnabled","true");std::istringstream saved(p.encode());CHECK(preferences::RuntimeSettings::decode(saved).flag("tools.smartAlignmentEnabled"));
 std::cout<<"Legacy alignment fixtures passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
