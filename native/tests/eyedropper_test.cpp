#include "eyedropper_model.h"
#include <stdexcept>
using namespace moon;
void require(bool value){if(!value)throw std::runtime_error("eyedropper regression");}
int main(){
 timeline::State state;state.layers={{"top",U"top",true,false,.5},{"base",U"base"}};state.frames={{"f",100}};
 timeline::Cel top;top.id="t";top.layerId="top";top.frameId="f";top.surface=timeline::Surface{2,2,1,1,{}, {},{0x800000ff,0,0,0}};
 timeline::Cel base;base.id="b";base.layerId="base";base.frameId="f";base.surface=timeline::Surface{4,4};base.surface->pixels.resize(16);base.surface->pixels[5]=0xffff0000;
 state.cels={top,base};timeline::Timeline stack(state);
 require(sampleEyedropper(stack,"f","top",4,4,1,1,EyedropperSource::CurrentLayer)==0x800000ff);
 require(sampleEyedropper(stack,"f","top",4,4,1,1)==compositeNormalRegion(stack,"f",{1,1,1,1})[0]);
 require(sampleEyedropper(stack,"f","top",4,4,-1,1)==0);
 require(sampleEyedropper(stack,"f","top",4,4,0,0,EyedropperSource::CurrentLayer)==0);
 state.layers[0].visible=false;state.layers[0].locked=true;timeline::Timeline hidden(state);
 require(sampleEyedropper(hidden,"f","top",4,4,1,1,EyedropperSource::CurrentLayer)==0x800000ff);
 // Storage origins address history, while sampling uses world offsets.
 for(bool linked:{false,true})for(bool negative:{false,true}){
  auto sparse=state;sparse.layers[0].visible=false;sparse.layers[0].locked=true;auto& owner=*sparse.cels[0].surface;owner.width=2;owner.height=2;owner.offsetX=negative?-1:1;owner.offsetY=1;owner.storageOriginX=71;owner.storageOriginY=-37;owner.pixels={0x00030201,0x80123456,0xffabcdef,0};
  const auto expectedSurface=owner;
  if(linked){sparse.frames.push_back({"other",100});sparse.cels[0].frameId="other";auto alias=sparse.cels[0];alias.id="alias";alias.frameId="f";alias.surface.reset();alias.linkedCelId="t";sparse.cels.push_back(std::move(alias));}
  timeline::Timeline sample(sparse);const auto original=sample.state().cels.size();
  for(int y=-1;y<=4;++y)for(int x=-1;x<=4;++x){const auto expected=x<0||y<0||x>=4||y>=4?0:raster::readWorld(expectedSurface,x,y);require(sampleEyedropper(sample,"f","top",4,4,x,y,EyedropperSource::CurrentLayer)==expected);}
  require(sample.state().cels.size()==original&&sample.resolveSurface(linked?"alias":"t").surface->pixels==expectedSurface.pixels);
 }
 {auto absent=state;absent.cels.erase(absent.cels.begin());timeline::Timeline sample(absent);require(sampleEyedropper(sample,"f","top",4,4,1,1,EyedropperSource::CurrentLayer)==0);require(sampleEyedropper(sample,"f","top",4,4,1,1)==0xffff0000);require(sample.state().cels.size()==1);}
 {auto extreme=state;extreme.cels[0].surface->offsetX=std::numeric_limits<int>::min();timeline::Timeline sample(extreme);require(sampleEyedropper(sample,"f","top",4,4,1,1,EyedropperSource::CurrentLayer)==0);}
 EyedropperGesture drag;drag.begin(true,false);drag.sample(0x800000ff);require(drag.secondary() && !drag.finish(true));
 drag.begin(true,true,true);require(!drag.secondary() && drag.temporary());drag.sample(1);drag.sample(2);require(drag.finish(true)==2 && !drag.active());
 drag.begin(false,true);drag.sample(0);require(!drag.finish());
}
