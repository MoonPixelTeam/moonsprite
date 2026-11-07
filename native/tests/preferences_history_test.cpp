#include "document.h"
#include <iostream>
#include <limits>
#include <stdexcept>
using namespace moon;
void check(bool v){if(!v)throw std::runtime_error("History preference regression");}
int main(){try{
 Document d(1,1);for(unsigned i=1;i<=5;++i){d.beginStroke({0,0},0xff000000|i);d.commitStroke();}
 const auto pixels=d.pixels();const auto revision=d.revision();const auto dirty=d.dirty();d.setHistoryEntryLimit(2);
 check(d.historySize()==2 && d.pixels()==pixels && d.revision()==revision && d.dirty()==dirty);
 d.undo();check(d.pixels()[0]==0xff000004);d.undo();check(d.pixels()[0]==0xff000003 && !d.canUndo());
 d.setHistoryEntryLimit(1);check(d.historySize()==1);d.redo();check(d.pixels()[0]==0xff000004 && !d.canRedo());
 d.setHistoryEntryLimit(std::numeric_limits<std::size_t>::max());for(unsigned i=6;i<=9;++i){d.beginStroke({0,0},0xff000000|i);d.commitStroke();}check(d.historySize()==5);
 // A finite runtime limit uses legacy's 10000 cap; the native max sentinel
 // represents JavaScript Infinity and must also work at construction.
 Document capped(1,1);capped.setHistoryEntryLimit(10001);for(unsigned i=0;i<10002;++i)capped.updatePaletteColor(1,0xff000000|i);check(capped.historySize()==10000);
 capped.setHistoryEntryLimit(std::numeric_limits<std::size_t>::max());capped.updatePaletteColor(1,0xff123456);check(capped.historySize()==10001);
 Document unlimited(1,1,256*1024*1024,std::numeric_limits<std::size_t>::max());for(unsigned i=0;i<10002;++i)unlimited.updatePaletteColor(1,0xff000000|i);check(unlimited.historySize()==10002);
 const auto retained=unlimited.paletteEntry(1)->color;unlimited.setHistoryEntryLimit(0);check(unlimited.historySize()==1&&unlimited.historyPosition()==1&&unlimited.paletteEntry(1)->color==retained);unlimited.undo();check(unlimited.paletteEntry(1)->color==(0xff000000|10000));unlimited.redo();check(unlimited.paletteEntry(1)->color==retained);
 std::cout<<"History preference trim, redo and unlimited checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
