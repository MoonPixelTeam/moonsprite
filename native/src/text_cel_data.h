#pragma once
#include "javascript_text.h"
#include <tuple>
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>
namespace moon {
inline constexpr const char* defaultTextFontFamily="Fusion Pixel 10px Prop Zh_hans";
struct TextRect {double x=0,y=0,width=1,height=1;};
struct TextShear {char axis='x',edge='s';double amount=0;};
struct TextTransform {TextRect source,target;double angle=0;std::optional<TextShear> shear;};
struct TextStyleRun {int start=0,end=0;std::optional<int> fontSize,lineSpacing,letterSpacing;std::optional<std::uint32_t> color;};
struct TextCelData {
 // Legacy style offsets are JavaScript UTF-16 string offsets, not codepoint indices.
 std::u16string text;std::string fontFamily=defaultTextFontFamily;int fontSize=10,lineSpacing=0,letterSpacing=0;bool actualSpacing=false,smooth=false,boxed=false;
 enum class Align {Left,Center,Right};Align align=Align::Left;std::uint32_t color=0xff000000;std::vector<TextStyleRun> styleRuns;std::optional<int> originX,originY;int boxWidth=128,boxHeight=64;std::vector<TextTransform> transforms;
};
inline bool textStyleEqual(const TextStyleRun& a,const TextStyleRun& b){return a.fontSize==b.fontSize&&a.lineSpacing==b.lineSpacing&&a.letterSpacing==b.letterSpacing&&a.color==b.color;}
inline bool textStylePresent(const TextStyleRun& r){return r.fontSize||r.lineSpacing||r.letterSpacing||r.color;}
inline std::vector<TextStyleRun> normalizeTextStyleRuns(std::vector<TextStyleRun> runs,int length){
 if(length<1)return {};std::vector<TextStyleRun> candidates;std::vector<int> boundaries{0,length};
 for(auto r:runs){r.start=std::clamp(r.start,0,length);r.end=std::clamp(r.end,r.start,length);if(r.fontSize)r.fontSize=std::clamp(*r.fontSize,1,512);if(r.lineSpacing)r.lineSpacing=std::clamp(*r.lineSpacing,-256,512);if(r.letterSpacing)r.letterSpacing=std::clamp(*r.letterSpacing,-64,256);if(r.end<=r.start||!textStylePresent(r))continue;boundaries.push_back(r.start);boundaries.push_back(r.end);candidates.push_back(r);}
 std::sort(boundaries.begin(),boundaries.end());boundaries.erase(std::unique(boundaries.begin(),boundaries.end()),boundaries.end());std::vector<TextStyleRun> result;
 for(std::size_t i=0;i+1<boundaries.size();++i){const int from=boundaries[i],to=boundaries[i+1];auto found=std::find_if(candidates.rbegin(),candidates.rend(),[&](const TextStyleRun& r){return r.start<=from&&r.end>=to;});if(found==candidates.rend())continue;auto next=*found;next.start=from;next.end=to;if(!result.empty()&&result.back().end==from&&textStyleEqual(result.back(),next))result.back().end=to;else result.push_back(next);}return result;
}
inline bool validTextRect(TextRect r){return std::isfinite(r.x)&&std::isfinite(r.y)&&std::isfinite(r.width)&&std::isfinite(r.height)&&r.width>=1&&r.height>=1;}
inline std::string normalizeTextFontFamily(const std::string& raw){
 std::u16string units;for(std::size_t i=0;i<raw.size();){const auto first=static_cast<unsigned char>(raw[i++]);char32_t cp=first;int extra=0;if(first>=0xf0){cp=first&7;extra=3;}else if(first>=0xe0){cp=first&15;extra=2;}else if(first>=0xc0){cp=first&31;extra=1;}for(int n=0;n<extra;++n){if(i>=raw.size()||(static_cast<unsigned char>(raw[i])&0xc0)!=0x80){cp=0xfffd;break;}cp=(cp<<6)|(static_cast<unsigned char>(raw[i++])&63);}if(cp>0x10ffff)cp=0xfffd;if(cp<=0xffff)units+=char16_t(cp);else{cp-=0x10000;units+=char16_t(0xd800+(cp>>10));units+=char16_t(0xdc00+(cp&1023));}}
 const auto a=std::find_if_not(units.begin(),units.end(),[](char16_t c){return javascriptWhitespace(c);}),b=std::find_if_not(units.rbegin(),units.rend(),[](char16_t c){return javascriptWhitespace(c);}).base();if(a>=b)return defaultTextFontFamily;units=std::u16string(a,b);if(units.size()>128)units.resize(128);std::string out;for(std::size_t i=0;i<units.size();++i){char32_t cp=units[i];if(cp>=0xd800&&cp<=0xdbff&&i+1<units.size()&&units[i+1]>=0xdc00&&units[i+1]<=0xdfff)cp=0x10000+((cp-0xd800)<<10)+(units[++i]-0xdc00);if(cp<128)out+=char(cp);else if(cp<2048){out+=char(0xc0|(cp>>6));out+=char(0x80|(cp&63));}else if(cp<65536){out+=char(0xe0|(cp>>12));out+=char(0x80|((cp>>6)&63));out+=char(0x80|(cp&63));}else{out+=char(0xf0|(cp>>18));out+=char(0x80|((cp>>12)&63));out+=char(0x80|((cp>>6)&63));out+=char(0x80|(cp&63));}}return out;
}
inline TextCelData normalizeTextCelData(TextCelData d){
 d.fontSize=std::clamp(d.fontSize,1,512);d.lineSpacing=std::clamp(d.lineSpacing,-256,512);d.letterSpacing=std::clamp(d.letterSpacing,-64,256);d.boxWidth=std::clamp(d.boxWidth,1,16384);d.boxHeight=std::clamp(d.boxHeight,1,16384);d.fontFamily=normalizeTextFontFamily(d.fontFamily);
 d.styleRuns=normalizeTextStyleRuns(std::move(d.styleRuns),int(d.text.size()));d.transforms.erase(std::remove_if(d.transforms.begin(),d.transforms.end(),[](const TextTransform& t){return !validTextRect(t.source)||!validTextRect(t.target)||!std::isfinite(t.angle);}),d.transforms.end());return d;
}
inline TextCelData newTextToolData(std::uint32_t color,int lastSize=10){TextCelData d;d.text=u"TEXT";d.color=color;d.fontSize=std::clamp(lastSize,1,512);d.lineSpacing=d.letterSpacing=1;d.actualSpacing=true;return d;}
inline std::optional<int> textFontDefaultSize(const std::string& family){if(family==defaultTextFontFamily)return 10;if(family=="Silkscreen"||family=="Tiny5")return 8;return {};}
inline void translateTextCelData(TextCelData& d,int dx,int dy){if(!dx&&!dy)return;d.originX=d.originX.value_or(0)+dx;d.originY=d.originY.value_or(0)+dy;for(auto& t:d.transforms){t.source.x+=dx;t.source.y+=dy;t.target.x+=dx;t.target.y+=dy;}}
}
namespace moon {
inline TextStyleRun textStyleAt(const TextCelData& d,int index){TextStyleRun r;r.fontSize=d.fontSize;r.lineSpacing=d.lineSpacing;r.letterSpacing=d.letterSpacing;r.color=d.color;for(auto s:d.styleRuns)if(s.start<=index&&s.end>index){if(s.fontSize)r.fontSize=s.fontSize;if(s.lineSpacing)r.lineSpacing=s.lineSpacing;if(s.letterSpacing)r.letterSpacing=s.letterSpacing;if(s.color)r.color=s.color;break;}return r;}
inline std::vector<TextStyleRun> applyTextStyleRun(std::vector<TextStyleRun> runs,int from,int to,const TextStyleRun& patch,int length){
 from=std::clamp(from,0,length);to=std::clamp(to,from,length);runs=normalizeTextStyleRuns(std::move(runs),length);if(to<=from)return runs;std::vector<int> points{0,length,from,to};for(auto r:runs){points.push_back(r.start);points.push_back(r.end);}std::sort(points.begin(),points.end());points.erase(std::unique(points.begin(),points.end()),points.end());std::vector<TextStyleRun> result;
 for(std::size_t i=0;i+1<points.size();++i){const int a=points[i],b=points[i+1];TextStyleRun r;r.start=a;r.end=b;auto found=std::find_if(runs.begin(),runs.end(),[&](const TextStyleRun& s){return s.start<=a&&s.end>=b;});if(found!=runs.end())r=*found;if(a>=from&&b<=to){if(patch.fontSize)r.fontSize=patch.fontSize;if(patch.lineSpacing)r.lineSpacing=patch.lineSpacing;if(patch.letterSpacing)r.letterSpacing=patch.letterSpacing;if(patch.color)r.color=patch.color;}r.start=a;r.end=b;if(!textStylePresent(r))continue;if(!result.empty()&&result.back().end==a&&textStyleEqual(result.back(),r))result.back().end=b;else result.push_back(r);}return result;
}
inline std::vector<TextStyleRun> reconcileTextStyleRuns(std::vector<TextStyleRun> runs,const std::u16string& before,const std::u16string& after){
 runs=normalizeTextStyleRuns(std::move(runs),int(before.size()));if(before==after)return runs;int prefix=0,suffix=0;while(prefix<int(before.size())&&prefix<int(after.size())&&before[prefix]==after[prefix])++prefix;while(suffix<int(before.size())-prefix&&suffix<int(after.size())-prefix&&before[before.size()-1-suffix]==after[after.size()-1-suffix])++suffix;const int oldEnd=int(before.size())-suffix,newEnd=int(after.size())-suffix,delta=newEnd-oldEnd;std::vector<TextStyleRun> result;
 for(auto r:runs){if(r.start<prefix){auto part=r;part.end=std::min(r.end,prefix);if(part.end>part.start)result.push_back(part);}if(r.end>oldEnd){auto part=r;part.start=std::max(r.start,oldEnd)+delta;part.end=r.end+delta;if(part.end>part.start)result.push_back(part);}}
 if(newEnd>prefix){const int inherited=prefix>0?prefix-1:std::min(prefix,std::max(0,int(before.size())-1));auto found=std::find_if(runs.begin(),runs.end(),[&](const TextStyleRun& r){return r.start<=inherited&&r.end>inherited;});if(found!=runs.end()){auto r=*found;r.start=prefix;r.end=newEnd;result.push_back(r);}}return normalizeTextStyleRuns(std::move(result),int(after.size()));
}
inline std::u16string textUtf16(const std::u32string& text){std::u16string result;for(auto c:text){if(c<=0xffff)result+=char16_t(c);else{c-=0x10000;result+=char16_t(0xd800+(c>>10));result+=char16_t(0xdc00+(c&1023));}}return result;}
inline std::u32string textUtf32(const std::u16string& text){std::u32string result;for(std::size_t i=0;i<text.size();++i){char32_t c=text[i];if(c>=0xd800&&c<=0xdbff&&i+1<text.size()&&text[i+1]>=0xdc00&&text[i+1]<=0xdfff)c=0x10000+((c-0xd800)<<10)+(text[++i]-0xdc00);result+=c;}return result;}
inline int textUtf16Index(const std::u32string& text,int index){return int(textUtf16(text.substr(0,std::clamp(index,0,int(text.size())))).size());}
inline double textJsRound(double value){return std::floor(value+.5);}
}

namespace moon {
// TextToolDialog.tsx styleAt/selectionValues/selectionColor use UTF16 offsets.
struct TextSelectionStyle {std::optional<int> fontSize,lineSpacing,letterSpacing;std::optional<std::uint32_t> color;};
inline TextSelectionStyle textSelectionStyle(const TextCelData& d,int from,int to){from=std::clamp(from,0,int(d.text.size()));to=std::clamp(to,from,int(d.text.size()));auto at=[&](int i){return textStyleAt(d,i>=int(d.text.size())&&!d.text.empty()?int(d.text.size())-1:i);};const auto first=at(from);TextSelectionStyle result{first.fontSize,first.lineSpacing,first.letterSpacing,first.color};for(int i=from+1;i<to;++i){const auto style=at(i);if(style.fontSize!=result.fontSize)result.fontSize.reset();if(style.lineSpacing!=result.lineSpacing)result.lineSpacing.reset();if(style.letterSpacing!=result.letterSpacing)result.letterSpacing.reset();if(style.color!=result.color)result.color.reset();}return result;}
}
