#pragma once
#include <array>
#include <cstdint>
namespace moon {
struct TabletAssistState {
 std::uint64_t owner=0;std::array<bool,3> modifiers{};bool sampling=false,boxMove=false,explicitMove=false,latched=false;
 void reset(){owner=0;modifiers={};sampling=boxMove=explicitMove=latched=false;}
 void bind(std::uint64_t identity){if(owner!=identity){reset();owner=identity;}}
 void modifier(std::uint64_t identity,int index,bool value){bind(identity);if(index>=0&&index<3)modifiers[index]=value;}
 bool modifier(std::uint64_t identity,int index)const{return owner==identity&&index>=0&&index<3&&modifiers[index];}
 void sample(std::uint64_t identity,bool value){bind(identity);sampling=value;}
 void move(std::uint64_t identity,bool boundary){bind(identity);explicitMove=true;boxMove=boundary;}
 void latch(std::uint64_t identity,bool value){bind(identity);latched=value;modifiers={};}
};
struct TabletAssistVisibility {
 int mode=0;bool visible=false,detected=false;
 void preference(int value){value=value<0||value>2?0:value;if(mode==value)return;mode=value;detected=false;if(mode)visible=mode==1;}
 bool touch(){if(mode||detected)return false;detected=true;visible=true;return true;}
 void manual(bool value){visible=value;}
};
}
