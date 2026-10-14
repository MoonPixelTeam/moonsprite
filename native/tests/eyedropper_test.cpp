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
 EyedropperGesture drag;drag.begin(true,false);drag.sample(0x800000ff);require(drag.secondary() && !drag.finish(true));
 drag.begin(true,true,true);require(!drag.secondary() && drag.temporary());drag.sample(1);drag.sample(2);require(drag.finish(true)==2 && !drag.active());
 drag.begin(false,true);drag.sample(0);require(!drag.finish());
}
