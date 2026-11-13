#pragma once
#include <string>
namespace moon {
// Preserve the desktop localeCompare adaptation at the platform boundary.
bool systemStringLess(const std::u32string&,const std::u32string&);
}
