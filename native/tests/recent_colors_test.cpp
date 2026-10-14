#include "recent_colors.h"
#include <chrono>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
using namespace moon;
static void require(bool condition) {if(!condition) throw std::runtime_error("Recent color legacy contract failed");}
int main() {
  RecentColors recent;std::vector<std::uint32_t> colors;
  for(unsigned r=0;r<30;++r) colors.push_back(0xff000000|r);
  require(recent.remember(colors));require(recent.values().size()==24);
  require(recent.values().front()==colors[29] && recent.values().back()==colors[6]);
  require(recent.remember({colors[10],0x8000000a}));
  require(recent.values()[0]==0x8000000a && recent.values()[1]==colors[10]);
  require(!recent.remember({0x8000000a}));

  RecentColors painted;RecentPaintDrag drag;
  constexpr std::uint32_t red=0xff0000ff,blue=0xffff0000;
  require(!drag.observe(painted,RecentPaintKind::Draw,false,red,false));require(painted.values().empty());
  require(drag.observe(painted,RecentPaintKind::Draw,false,red,true));
  require(!drag.observe(painted,RecentPaintKind::Draw,false,blue,true));require(painted.values().front()==red);
  drag.reset();require(drag.observe(painted,RecentPaintKind::Draw,false,blue,true));
  require(painted.values()==std::vector<std::uint32_t>({blue,red}));
  drag.reset();require(!drag.observe(painted,RecentPaintKind::Draw,true,red,true));
  require(!drag.observe(painted,RecentPaintKind::Draw,false,0xff,true));
  require(!drag.observe(painted,RecentPaintKind::Navigation,false,red,true));
  require(drag.observe(painted,RecentPaintKind::Gradient,false,red,true,blue));
  require(painted.values()==std::vector<std::uint32_t>({red,blue}));
  // Head-color no-op still consumes the per-drag gate.
  drag.reset();require(!drag.observe(painted,RecentPaintKind::Draw,false,red,true));
  require(!drag.observe(painted,RecentPaintKind::Draw,false,blue,true));
  require(painted.values().front()==red);
  // Undo/cancel are not color-history operations; resetting gesture preserves MRU.
  drag.reset();require(painted.values().front()==red);

  const auto directory=std::filesystem::temp_directory_path()/
    ("moonsprite-recent-test-"+std::to_string(std::chrono::steady_clock::now().time_since_epoch().count()));
  std::filesystem::create_directory(directory);
  const auto file=directory/"recent.txt";
  recent.save(file);RecentColors reloaded;reloaded.load(file);require(reloaded.values()==recent.values());
  {std::ofstream out(file);out<<"null\n999 0 0 255\n1.5 2 3 255\n1 2 3 255 garbage\n1 2 3 255\n1 2 3 255\n0 0 0 0\n";}
  reloaded.load(file);require(reloaded.values()==std::vector<std::uint32_t>({0xff030201,0xff030201,0}));
  reloaded.load(directory/"missing.txt");require(reloaded.values().empty());
  bool failed=false;try {reloaded.save(file/"invalid-parent.txt");}catch(const std::exception&){failed=true;}require(failed);
  // Delete only the two paths created by this test, never recursive user data.
  std::filesystem::remove(file);std::filesystem::remove(directory);
  std::cout<<"Recent colors: RGBA MRU24, alpha identity, first changed paint only, exclusions, gradient order, persistence and invalid rows passed.\n";
}
