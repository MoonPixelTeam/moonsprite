#include "color_picker_normal_map.h"
#pragma once
#include "color_picker_moon_ring.h"
#include "color_picker_model.h"
#include "color_picker_wheel.h"
#include <string_view>
#include <utility>
namespace moon {
enum class ColorPickerScheme {SvSquare,HsSquare,Wheel,NormalMap,MoonRing};
inline bool pickerSchemeUsesValue(ColorPickerScheme s){return s!=ColorPickerScheme::SvSquare;}
inline std::string_view colorPickerSchemeKey(ColorPickerScheme s){if(s==ColorPickerScheme::MoonRing)return "moon-ring";if(s==ColorPickerScheme::NormalMap)return "normal-map";return s==ColorPickerScheme::Wheel?"wheel":s==ColorPickerScheme::HsSquare?"hs-square":"sv-square";}
inline ColorPickerScheme parseColorPickerScheme(std::string_view s){if(s=="moon-ring")return ColorPickerScheme::MoonRing;if(s=="normal-map")return ColorPickerScheme::NormalMap;return s=="wheel"?ColorPickerScheme::Wheel:s=="hs-square"?ColorPickerScheme::HsSquare:ColorPickerScheme::SvSquare;}
inline PickerHsv pickerSchemeFieldHsv(ColorPickerScheme scheme,PickerHsv source,double x,double y){if(scheme==ColorPickerScheme::NormalMap)return pickerRgbToHsv(pickerNormalMapInputColor(x,y,255));if(scheme==ColorPickerScheme::Wheel)return pickerWheelInputHsv(source,x,y);x=pickerUnit(x);y=pickerUnit(y);if(scheme==ColorPickerScheme::HsSquare)return {pickerHue(x*360),1-y,source.v};return {source.h,x,1-y};}
inline std::pair<double,double> pickerSchemeMarker(ColorPickerScheme scheme,PickerHsv source){if(scheme==ColorPickerScheme::NormalMap)return pickerNormalMapMarker(source);if(scheme==ColorPickerScheme::Wheel)return pickerWheelMarker(source);if(scheme==ColorPickerScheme::HsSquare)return {pickerHue(source.h)/360,1-source.s};return {source.s,1-source.v};}
inline std::uint32_t pickerSchemeStripColor(ColorPickerScheme scheme,PickerHsv source,double p){p=pickerUnit(p);return pickerHsvToRgb(pickerSchemeUsesValue(scheme)?PickerHsv{source.h,source.s,p}:PickerHsv{p*359,1,1});}
inline double pickerSchemeStripFraction(ColorPickerScheme scheme,PickerHsv s){return pickerSchemeUsesValue(scheme)?s.v:s.h/359;}
inline int pickerSchemeStripMaximum(ColorPickerScheme scheme){return pickerSchemeUsesValue(scheme)?1000:359;}
inline int pickerSchemeStripValue(ColorPickerScheme scheme,PickerHsv s){return int(std::floor((pickerSchemeUsesValue(scheme)?s.v*1000:s.h)+.5));}
inline void pickerSchemeSetStrip(PickerRole& r,ColorPickerScheme s,double f){if(pickerSchemeUsesValue(s)){r.hsv.v=pickerUnit(f);r.emit();}else r.hue(pickerUnit(f)*359);}
inline void pickerSchemeSetStripValue(PickerRole& r,ColorPickerScheme s,int v){if(pickerSchemeUsesValue(s)){r.hsv.v=pickerUnit(double(v)/1000);r.emit();}else r.hue(std::clamp(v,0,359));}
inline void pickerSchemeSetField(PickerRole& r,ColorPickerScheme s,double x,double y){if(s==ColorPickerScheme::NormalMap){r.hsv=pickerRgbToHsv(pickerNormalMapInputColor(x,y,int(r.color>>24)));r.emit();return;}r.hsv=pickerSchemeFieldHsv(s,r.hsv,x,y);r.emit();}
}
