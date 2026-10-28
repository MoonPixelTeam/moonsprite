#pragma once
#include "selection_tools.h"
#include <functional>
namespace moon {
struct AirbrushSettings {int particleRadius=1;BrushShape shape=BrushShape::Round;int angle=0,scatterRadius=12,density=8,intervalMs=50;};
// legacy core/airbrush.ts: two independent samples per particle; JS Math.round.
template<class Random,class Emit> void generateAirbrushParticles(SelectionPoint center,const AirbrushSettings& settings,Random random,Emit emit){
 const int density=std::max(1,settings.density);const double radius=std::max(0,settings.scatterRadius);
 for(int i=0;i<density;++i){const double angle=random()*3.14159265358979323846*2,distance=std::sqrt(random())*radius;emit(SelectionPoint{int(std::floor(center.x+std::cos(angle)*distance+.5)),int(std::floor(center.y+std::sin(angle)*distance+.5))});}
}
// legacy canvas-airbrush-clock.ts: bounded catch-up, measured spray cost, no debt.
template<class Spray,class Now> double advanceAirbrushClock(double deadline,double frameAt,int interval,Spray spray,Now now){const double step=std::max(16,interval),started=now();int batches=0;while(frameAt>=deadline&&batches<4){spray();deadline+=step;++batches;if(now()-started>=4)break;}if(batches>0&&deadline<=now())deadline=now()+step;return deadline;}
}
