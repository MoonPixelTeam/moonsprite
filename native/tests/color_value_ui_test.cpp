#include "color_value_ui.h"
#include <stdexcept>
#include <iostream>
int main() {
  using namespace moon;
  auto check=[](bool ok){if(!ok) throw std::runtime_error("Legacy color display contract mismatch");};
  check(displayColorRoleHex(0xff563412)==U"#123456");
  check(displayColorRoleHex(0x80563412)==U"#12345680");
  check(displayColorRoleHex(0)==U"#00000000");
  check(displayColorRoleHex(0xffffffff)==U"#FFFFFF");
  check(colorRoleTextColor(0xffffffff)==0xff0d0a09);
  check(colorRoleTextColor(0xff000000)==0xffffffff);
  check(colorRoleTextColor(0x7f000000)==0xff0d0a09);
  check(colorRoleTextColor(0x80000000)==0xffffffff);
  check(colorRoleTextColor(0xff007600)==0xffffffff);
  check(colorRoleTextColor(0xff00ff00)==0xff0d0a09);
  std::cout<<"Legacy color role HEX/contrast checks passed\n";
}
