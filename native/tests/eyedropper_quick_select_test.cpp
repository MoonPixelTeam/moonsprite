#include "eyedropper_quick_select.h"
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
int main(int argc,char** argv){try{
 if(argc!=2)throw std::runtime_error("quick-select oracle path");
 std::ifstream input(argv[1]);std::string expected;input>>expected;
 if(expected.size()!=1024)throw std::runtime_error("missing exhaustive legacy oracle");
 for(int bits=0;bits<1024;++bits){
  auto flag=[&](int index){return bool(bits&(1<<index));};
  const moon::EyedropperQuickSelectContext c{flag(0),flag(1),flag(2),flag(3),flag(4),flag(5),flag(6),flag(7),flag(8),flag(9)};
  if(moon::shouldQuickSelectEyedropper(c)!=(expected[bits]=='1'))throw std::runtime_error("legacy quick-select context "+std::to_string(bits));
 }
 std::cout<<"1024 legacy quick-select contexts passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
