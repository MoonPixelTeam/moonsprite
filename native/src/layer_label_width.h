#pragma once
#include <algorithm>
#include <cmath>
#include <string>
#include <regex>
#include <cstdlib>
namespace moon::layerlabel {
// useLayerPanelPreferences.tsx: CSS pixel preference; native skin paints at 2x.
inline int clamp(double value){return int(std::floor(std::clamp(value,140.,2000.)+.5));}
inline int load(std::string text){
  const auto first=text.find_first_not_of(" \t\r\n"),last=text.find_last_not_of(" \t\r\n");if(first==std::string::npos)return 190;text=text.substr(first,last-first+1);
  double value=0;
  if(text=="Infinity" || text=="+Infinity")return 2000;if(text=="-Infinity")return 140;
  if(text.size()>2 && text[0]=='0' && (text[1]=='x'||text[1]=='X'||text[1]=='b'||text[1]=='B'||text[1]=='o'||text[1]=='O')){
    const int radix=text[1]=='x'||text[1]=='X'?16:text[1]=='b'||text[1]=='B'?2:8;
    for(std::size_t i=2;i<text.size();++i){const char c=text[i];const int digit=c>='0'&&c<='9'?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:99;if(digit>=radix)return 190;value=value*radix+digit;}
  }else{
    static const std::regex decimal(R"([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)");if(!std::regex_match(text,decimal))return 190;value=std::strtod(text.c_str(),nullptr);
  }
  return value==0 || std::isnan(value)?190:clamp(value);
}
struct Width {
  int physical=190,start=190,pointer=0;bool dragging=false;
  int logical()const{return (physical+1)/2;}
  void set(double value){physical=clamp(value);}
  void begin(int x){start=physical;pointer=x;dragging=true;}
  int at(int x)const{return clamp(double(start)+x-pointer);}
  // Legacy pointercancel and pointerup only stop tracking. No rollback or final-up update.
  void finish(){dragging=false;}
};
}
