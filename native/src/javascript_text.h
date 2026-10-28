#pragma once
#include <algorithm>
#include <string_view>
namespace moon {
// ECMAScript WhiteSpace + LineTerminator, shared by legacy String.trim consumers.
inline bool javascriptWhitespace(char32_t c){return c==0x9 || c==0xa || c==0xb || c==0xc || c==0xd || c==0x20 || c==0xa0 || c==0x1680 || (c>=0x2000 && c<=0x200a) || c==0x2028 || c==0x2029 || c==0x202f || c==0x205f || c==0x3000 || c==0xfeff;}
inline std::u32string_view javascriptTrim(std::u32string_view text){const auto first=std::find_if_not(text.begin(),text.end(),javascriptWhitespace),last=std::find_if_not(text.rbegin(),text.rend(),javascriptWhitespace).base();return first>=last?std::u32string_view{}:text.substr(std::size_t(first-text.begin()),std::size_t(last-first));}
}
