#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <optional>
#include <cstdint>
namespace moon::dynamics {
// Direct legacy core/pressure.ts v6; native enums replace string unions.
enum class Sensor { None, Pressure, Speed };
enum class Curve { Soft, Linear, Hard };
enum class Effect { Size, Strength, Gradient, Angle };
struct Mapping {Sensor sensor=Sensor::None;double outputMin=20,outputMax=100,inputMin=0,inputMax=100;Curve curve=Curve::Linear;bool inverse=false;};
struct Settings {std::array<Mapping,4> effects{};int gradientDither=0;Settings(){effects[2].outputMin=0;effects[3].outputMin=-180;effects[3].outputMax=180;}};
inline double finite(double n,double fallback){return std::isfinite(n)?n:fallback;}
inline int rounded(double n){return int(std::floor(n+.5));}
inline Mapping normalize(Mapping m,int effect){const Mapping fallback=Settings{}.effects[effect];if(int(m.sensor)<0||int(m.sensor)>2)m.sensor=Sensor::None;if(int(m.curve)<0||int(m.curve)>2)m.curve=Curve::Linear;const double lo=effect==3?-180:0,hi=effect==3?180:100,limit=m.sensor==Sensor::Speed?4000:100;m.outputMin=std::clamp(finite(m.outputMin,fallback.outputMin),lo,hi);m.outputMax=std::clamp(finite(m.outputMax,fallback.outputMax),lo,hi);m.inputMin=std::clamp(finite(m.inputMin,0),0.,limit);m.inputMax=std::clamp(finite(m.inputMax,100),0.,limit);if(m.outputMin>m.outputMax)std::swap(m.outputMin,m.outputMax);if(m.inputMin>m.inputMax)std::swap(m.inputMin,m.inputMax);return m;}
inline Settings normalize(Settings s){for(int i=0;i<4;++i)s.effects[i]=normalize(s.effects[i],i);s.gradientDither=std::clamp(s.gradientDither,0,8);return s;}
inline void selectSensor(Settings& s,int effect,Sensor sensor){auto& m=s.effects[effect];if(m.sensor==sensor)return;if(effect==0&&sensor==Sensor::Pressure&&m.sensor==Sensor::None&&m.outputMin==20)m.outputMin=0;m.sensor=sensor;m.inputMin=sensor==Sensor::Pressure?10:sensor==Sensor::Speed?50:0;m.inputMax=sensor==Sensor::Pressure?90:sensor==Sensor::Speed?2400:100;m.curve=Curve::Linear;m=normalize(m,effect);}
struct Input {double pressure=0,speed=0;bool pressureAvailable=false;};
inline double curveValue(Curve curve,double t){return curve==Curve::Soft?std::sqrt(t):curve==Curve::Hard?t*t:t;}
inline std::optional<double> output(const Mapping& m,Input in){if(m.sensor==Sensor::None||(m.sensor==Sensor::Pressure&&(!in.pressureAvailable||!std::isfinite(in.pressure))))return {};const double value=m.sensor==Sensor::Pressure?std::clamp(in.pressure,0.,1.)*100:std::clamp(finite(in.speed,0),0.,4000.);double t=m.inputMax<=m.inputMin?(value>=m.inputMax?1:0):std::clamp((value-m.inputMin)/(m.inputMax-m.inputMin),0.,1.);if(m.inverse)t=1-t;return m.outputMin+(m.outputMax-m.outputMin)*curveValue(m.curve,t);}
struct Resolved {int size=1;double opacity=1;std::optional<double> gradient;double angle=0;};
inline Resolved resolve(const Settings& settings,Input in,int baseSize){const auto s=normalize(settings);return {std::max(1,rounded(std::max(1,baseSize)*output(s.effects[0],in).value_or(100)/100)),std::clamp(output(s.effects[1],in).value_or(100)/100,0.,1.),[&]()->std::optional<double>{auto v=output(s.effects[2],in);return v?std::optional<double>{std::clamp(*v/100,0.,1.)}:std::nullopt;}(),std::clamp(output(s.effects[3],in).value_or(0),-180.,180.)};}
inline int smoothSize(int previous,int target,int base,double distance){const int budget=std::max(1,int(std::floor(std::max(1.,std::ceil(std::max(1,base)/6.))*std::max(1.,distance))));return target>previous?std::min(target,previous+budget):std::max(target,previous-budget);}
struct SpeedState {double x=0,y=0,time=0,speed=0;};
inline double trackSpeed(std::optional<SpeedState>& previous,double x,double y,double time){if(!std::isfinite(x)||!std::isfinite(y)||!std::isfinite(time))return previous?previous->speed:0;SpeedState next{x,y,time,0};if(previous){const double elapsed=time-previous->time;if(elapsed<=0)return previous->speed;if(elapsed<160){const double instant=std::min(4000.,std::hypot(x-previous->x,y-previous->y)*1000/elapsed);next.speed=std::min(4000.,previous->speed+(instant-previous->speed)*(1-std::exp(-elapsed/55)));}}previous=next;return next.speed;}
inline double wrapAngle(double angle){angle=std::fmod(angle+180,360);if(angle<0)angle+=360;return angle-180;}
inline double interpolateAngle(double a,double b,double t){return wrapAngle(a+wrapAngle(b-a)*t);}
// Native LAF pressure=0 for ordinary mouse is absence, never synthetic force.
inline bool reliablePressure(bool pen,bool touch,double pressure,std::optional<double> previous={},bool proved=false){if(!std::isfinite(pressure))return false;if(pen)return true;if(touch)return false;if(proved)return true;const double p=std::clamp(pressure,0.,1.);return p>0&&((previous&&std::abs(p-*previous)>.001)||std::abs(p-.5)>.001);}
}
