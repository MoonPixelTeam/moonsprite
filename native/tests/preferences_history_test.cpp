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
 std::cout<<"History preference trim, redo and unlimited checks passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
