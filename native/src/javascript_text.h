#pragma once
#include <algorithm>
#include <string_view>
#include <string>
namespace moon {
// ECMAScript WhiteSpace + LineTerminator, shared by legacy String.trim consumers.
inline bool javascriptWhitespace(char32_t c){return c==0x9 || c==0xa || c==0xb || c==0xc || c==0xd || c==0x20 || c==0xa0 || c==0x1680 || (c>=0x2000 && c<=0x200a) || c==0x2028 || c==0x2029 || c==0x202f || c==0x205f || c==0x3000 || c==0xfeff;}
inline std::u32string_view javascriptTrim(std::u32string_view text){const auto first=std::find_if_not(text.begin(),text.end(),javascriptWhitespace),last=std::find_if_not(text.rbegin(),text.rend(),javascriptWhitespace).base();return first>=last?std::u32string_view{}:text.substr(std::size_t(first-text.begin()),std::size_t(last-first));}
}

namespace moon {
// JSON.stringify escapes lone UTF-16 surrogates. WinRT Stringify retains those
// code units; ordinary UTF8 conversion replaces them, losing JS string values.
inline std::string javascriptJsonUtf8(std::wstring_view json){
 std::string out;out.reserve(json.size());constexpr char hex[]="0123456789abcdef";
 for(std::size_t i=0;i<json.size();++i){char32_t c=json[i];
  if(c>=0xd800&&c<=0xdbff&&i+1<json.size()&&json[i+1]>=0xdc00&&json[i+1]<=0xdfff)c=0x10000+((c-0xd800)<<10)+(json[++i]-0xdc00);
  else if(c>=0xd800&&c<=0xdfff){out+="\\u";for(int shift=12;shift>=0;shift-=4)out+=hex[(c>>shift)&15];continue;}
  if(c<0x80)out+=char(c);else if(c<0x800){out+=char(0xc0|(c>>6));out+=char(0x80|(c&63));}else if(c<0x10000){out+=char(0xe0|(c>>12));out+=char(0x80|((c>>6)&63));out+=char(0x80|(c&63));}else{out+=char(0xf0|(c>>18));out+=char(0x80|((c>>12)&63));out+=char(0x80|((c>>6)&63));out+=char(0x80|(c&63));}
 }return out;
}
}
