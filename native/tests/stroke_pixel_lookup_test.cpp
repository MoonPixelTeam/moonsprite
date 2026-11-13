#include "stroke_pixel_lookup.h"
#include <iostream>
#include <random>
#include <stdexcept>
#include <string>
#include <vector>
#define CHECK(x) do{if(!(x))throw std::runtime_error(std::string("line ")+std::to_string(__LINE__)+": "+#x);}while(false)
int main(){try{
 using moon::StrokePixelLookup;
 StrokePixelLookup lookup;lookup.reset(8192,8192);
 CHECK(lookup.payloadBytes()==0);CHECK(lookup.directoryBytes()<=256*1024);
 // Reads and perfect-pixel rollback of untouched indices must not allocate.
 CHECK(lookup[8192*8192-1]==-1);lookup.set(8192*8192-1,-1);CHECK(lookup.allocatedPages()==0);
 lookup.set(0,5);lookup.set(63*8192+63,6);CHECK(lookup.allocatedPages()==1);CHECK(lookup.payloadBytes()==16384);
 lookup.set(64,7);CHECK(lookup.allocatedPages()==2);CHECK(lookup[63*8192+63]==6);CHECK(lookup[64]==7);
 lookup.clear();CHECK(lookup.allocatedPages()==0);CHECK(lookup[0]==-1);CHECK(lookup[64]==-1);
 // Non-aligned dimensions and repeated changes/rollback match the former dense oracle.
 constexpr int width=137,height=193;lookup.reset(width,height);
 std::vector<int> dense(width*height,-1);std::mt19937 random(90210);
 for(int operation=0;operation<150000;++operation){
  const auto index=std::size_t(random()%dense.size());CHECK(lookup[index]==dense[index]);
  if(operation%4){const int value=operation%11?operation:-1;lookup.set(index,value);dense[index]=value;}
  if(operation%17777==0){lookup.reset(width,height);std::fill(dense.begin(),dense.end(),-1);}
 }
 for(std::size_t i=0;i<dense.size();++i)CHECK(lookup[i]==dense[i]);
 lookup.set(10,123);auto copy=lookup;copy.set(10,456);CHECK(lookup[10]==123);CHECK(copy[10]==456);
 StrokePixelLookup assigned;assigned=lookup;assigned.clear();CHECK(lookup[10]==123);CHECK(assigned[10]==-1);
 auto moved=std::move(lookup);CHECK(moved[10]==123);lookup.reset(width,height);lookup.set(10,789);CHECK(lookup[10]==789);CHECK(moved[10]==123);
 assigned=std::move(moved);moved.reset(width,height);CHECK(moved[10]==-1);CHECK(assigned[10]==123);
 assigned=std::move(assigned);CHECK(assigned[10]==123);
 lookup.reset(65,65);CHECK(lookup[64*65+64]==-1);lookup.set(64*65+64,42);CHECK(lookup[64*65+64]==42);
 lookup.reset(0,0);CHECK(lookup.allocatedPages()==0);lookup.reset(65,65);CHECK(lookup[64*65+64]==-1);
 bool rejected=false;try{lookup.reset(-1,65);}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);
 std::cout<<"paged stroke lookup: dense equivalence, bounded allocation, copy/move and rollback passed\n";
 return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
