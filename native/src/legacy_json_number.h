#pragma once
#include <cmath>
#include <cstdlib>
#include <cstdint>
#include <limits>
#include <locale.h>
#include <string>
#include <stdexcept>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Foundation.Collections.h>
namespace moon::project::legacyjson {
// Number(value) for JSON values used by legacy restoreProjectTimelapse.
// JSON cannot provide custom valueOf/toString methods; arrays use Array#join.
inline bool numberSpace(wchar_t c){return (c>=9&&c<=13)||c==32||c==0xa0||c==0x1680||(c>=0x2000&&c<=0x200a)||c==0x2028||c==0x2029||c==0x202f||c==0x205f||c==0x3000||c==0xfeff;}
inline double nan(){return std::numeric_limits<double>::quiet_NaN();}
inline double stringNumber(std::wstring text){
 std::size_t begin=0,end=text.size();while(begin<end&&numberSpace(text[begin]))++begin;while(end>begin&&numberSpace(text[end-1]))--end;text=text.substr(begin,end-begin);
 if(text.empty())return 0.;if(text==L"Infinity"||text==L"+Infinity")return std::numeric_limits<double>::infinity();if(text==L"-Infinity")return -std::numeric_limits<double>::infinity();
 if(text.size()>2&&text[0]==L'0'&&(text[1]==L'x'||text[1]==L'X'||text[1]==L'b'||text[1]==L'B'||text[1]==L'o'||text[1]==L'O')){
  const int group=(text[1]==L'x'||text[1]==L'X')?4:(text[1]==L'b'||text[1]==L'B')?1:3,radix=1<<group;
  std::uint64_t significant=0;std::size_t bits=0;bool guard=false,sticky=false;
  for(std::size_t i=2;i<text.size();++i){const auto c=text[i];const int digit=c>=L'0'&&c<=L'9'?c-L'0':c>=L'a'&&c<=L'f'?c-L'a'+10:c>=L'A'&&c<=L'F'?c-L'A'+10:-1;if(digit<0||digit>=radix)return nan();
   for(int bit=group-1;bit>=0;--bit){const bool one=(digit&(1<<bit))!=0;if(!bits&&!one)continue;++bits;if(bits<=53)significant=(significant<<1)|std::uint64_t(one);else if(bits==54)guard=one;else sticky=sticky||one;}
  }
  if(bits<=53)return double(significant);if(guard&&(sticky||(significant&1)))++significant;if(bits>1024)return std::numeric_limits<double>::infinity();return std::ldexp(double(significant),int(bits-53));
 }
 // Validate the whole decimal grammar before CRT conversion: strtod alone
 // accepts spellings (inf, hex floats, trailing text) rejected by Number().
 std::size_t i=0;if(text[i]==L'+'||text[i]==L'-')++i;std::size_t digits=0;
 while(i<text.size()&&text[i]>=L'0'&&text[i]<=L'9'){++i;++digits;}
 if(i<text.size()&&text[i]==L'.'){++i;while(i<text.size()&&text[i]>=L'0'&&text[i]<=L'9'){++i;++digits;}}
 if(!digits)return nan();if(i<text.size()&&(text[i]==L'e'||text[i]==L'E')){++i;if(i<text.size()&&(text[i]==L'+'||text[i]==L'-'))++i;const auto start=i;while(i<text.size()&&text[i]>=L'0'&&text[i]<=L'9')++i;if(i==start)return nan();}
 if(i!=text.size())return nan();
 struct Locale{_locale_t value=_create_locale(LC_NUMERIC,"C");~Locale(){if(value)_free_locale(value);}};static Locale locale;
 if(!locale.value)throw std::runtime_error("Cannot initialize legacy number conversion locale");return _wcstod_l(text.c_str(),nullptr,locale.value);
}
inline double number(winrt::Windows::Data::Json::IJsonValue value){
 using namespace winrt::Windows::Data::Json;if(!value)return nan();
 // Single-element nested arrays reduce iteratively to avoid recursion depth.
 while(value.ValueType()==JsonValueType::Array){auto array=value.GetArray();if(!array.Size())return 0.;if(array.Size()!=1)return nan();value=array.GetAt(0);if(value.ValueType()==JsonValueType::Boolean)return nan();if(value.ValueType()==JsonValueType::Number&&value.GetNumber()==0)return 0.;}
 switch(value.ValueType()){
 case JsonValueType::Null:return 0.;case JsonValueType::Boolean:return value.GetBoolean()?1.:0.;case JsonValueType::Number:return value.GetNumber();case JsonValueType::String:return stringNumber(std::wstring(value.GetString()));
 default:return nan();
 }
}
}
