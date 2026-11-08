#pragma once
#include "recovery_codec.h"
#include <windows.h>
#include <algorithm>
#include <cmath>
#include <cctype>
#include <cstdlib>
#include <ctime>
#include <iomanip>
#include <sstream>
namespace moon::recovery {
// HomeWorkspace::parseRecoveryTimestamp: old seconds/us/ns records coexist
// with current millisecond strings. This is display only, never expiry deletion.
inline double displayTimestamp(const std::string& text){
 char* end=nullptr;const char* first=text.c_str();double value=std::strtod(first,&end);while(end&&*end&&std::isspace(static_cast<unsigned char>(*end)))++end;
 if(end&&!*end&&(end!=first||text.find_first_not_of(" \t\r\n")==std::string::npos)&&std::isfinite(value)){
  const auto size=std::abs(value);return std::trunc(size>=1e17?value/1e6:size>=1e14?value/1e3:size>0&&size<1e11?value*1e3:value);
 }
 // Native persisted records are numeric. Accept the ISO date form used by
 // older portable records as well; do not infer locale-dependent date formats.
 std::tm time{};std::istringstream input(text);input>>std::get_time(&time,"%Y-%m-%d");if(input.fail())return 0;
 bool local=false;if(input.peek()=='T'||input.peek()==' '){local=true;input.get();input>>std::get_time(&time,"%H:%M:%S");if(input.fail())return 0;}
 double fraction=0;if(input.peek()=='.'){input.get();double unit=.1;while(input.peek()>='0'&&input.peek()<='9'){fraction+=(input.get()-'0')*unit;unit*=.1;}}
 int offset=0;if(input.peek()=='+'||input.peek()=='-'){local=false;const int sign=input.get()=='+'?1:-1;int h=0,m=0;auto digit=[&]{int c=input.get();return c>='0'&&c<='9'?c-'0':-100;};h=10*digit();h+=digit();if(input.peek()==':')input.get();m=10*digit();m+=digit();if(h<0||h>23||m<0||m>59)return 0;offset=sign*(h*60+m);}else if(input.peek()=='Z'){local=false;input.get();}
 if(input.peek()!=std::char_traits<char>::eof())return 0;time.tm_isdst=-1;const auto seconds=local?_mktime64(&time):_mkgmtime64(&time);return seconds==-1?0:double(seconds)*1000+std::trunc(fraction*1000)-offset*60000.;
}
inline double remainingDays(double timestamp,int days,double now){return std::max(0.,std::ceil((timestamp+double(days)*86400000-now)/86400000));}
inline std::string displayTime(double ms){
 if(!std::isfinite(ms)||std::abs(ms)>8640000000000000.)return "--";
 const auto seconds=__time64_t(ms/1000);std::tm time{};if(_localtime64_s(&time,&seconds))return "--";std::ostringstream out;out<<std::put_time(&time,"%Y/%m/%d %H:%M");return out.str();
}
}
