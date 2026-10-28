#include "recent_project_preview.h"
#include <iostream>
#include <stdexcept>
using namespace moon::recent;
int main(){
  Preview preview; preview.width=2; preview.height=1; preview.previewWidth=2; preview.previewHeight=1;
  preview.pixels={0xff0000ffu,0xff00ff00u};
  if(preview.pixels.size()!=2 || preview.previewWidth!=2) throw std::runtime_error("preview model");
  std::cout<<"recent preview checks passed\n"; return 0;
}
