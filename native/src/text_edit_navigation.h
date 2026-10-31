#pragma once
#include <string>
namespace moon {
// Same browser-derived word service used by the existing multi-line input.
int inputWordStep(const std::u32string& text,int caret,bool left,bool deleting=false);
}
