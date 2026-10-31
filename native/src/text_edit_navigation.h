#pragma once
#include <string>
#include <utility>
namespace moon {
// Same browser-derived word service used by the existing multi-line input.
int inputWordStep(const std::u32string& text,int caret,bool left,bool deleting=false);
std::pair<int,int> inputWordRange(const std::u32string& text,int index,bool trailingWhitespace);
}
