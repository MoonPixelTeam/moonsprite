#include "system_string_compare.h"
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
namespace moon {
bool systemStringLess(const std::u32string& left,const std::u32string& right){
#ifdef _WIN32
 auto wide=[](const std::u32string& text){std::wstring out;for(auto c:text){if(c<=0xffff)out.push_back(wchar_t(c));else{c-=0x10000;out.push_back(wchar_t(0xd800+(c>>10)));out.push_back(wchar_t(0xdc00+(c&1023)));}}return out;};const auto a=wide(left),b=wide(right);const int order=CompareStringEx(LOCALE_NAME_USER_DEFAULT,0,a.data(),int(a.size()),b.data(),int(b.size()),nullptr,nullptr,0);if(order)return order==CSTR_LESS_THAN;
#endif
 return left<right;
}
}
