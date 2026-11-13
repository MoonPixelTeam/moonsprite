#include "selection_boundary.h"
#include "document.h"
#include <chrono>
#include <iostream>
#include <set>
#include <stdexcept>
using namespace moon;
using Edge=SelectionBoundaryCache::Segment;
static void check(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
static std::set<Edge> reference(const std::optional<SelectionMask>& s,int l,int t,int r,int b){
  std::set<Edge> edges;
  if(!s)return edges;
  for(int y=std::max(t,s->y);y<std::min(b,s->y+s->height);++y)
    for(int x=std::max(l,s->x);x<std::min(r,s->x+s->width);++x)if(selectionContains(s,x,y)){
      if(!selectionContains(s,x,y-1))edges.insert({x,y,x+1,y});
      if(!selectionContains(s,x,y+1))edges.insert({x,y+1,x+1,y+1});
      if(!selectionContains(s,x-1,y))edges.insert({x,y,x,y+1});
      if(!selectionContains(s,x+1,y))edges.insert({x+1,y,x+1,y+1});
    }
  return edges;
}
static std::set<Edge> expand(const std::vector<Edge>& segments){
  std::set<Edge> edges;
  for(const auto& e:segments){
    if(e[1]==e[3])for(int x=e[0];x<e[2];++x)check(edges.insert({x,e[1],x+1,e[1]}).second,"Duplicate horizontal boundary");
    else for(int y=e[1];y<e[3];++y)check(edges.insert({e[0],y,e[0],y+1}).second,"Duplicate vertical boundary");
  }
  return edges;
}
int main(){try{
  SelectionBoundaryCache cache;
  for(unsigned bits=0;bits<512;++bits){
    std::optional<SelectionMask> s=SelectionMask{-2,3,3,3,std::vector<unsigned char>(9)};
    for(unsigned i=0;i<9;++i)s->mask[i]=(bits>>i)&1;
    for(const auto& clip:std::vector<Edge>{{-5,0,5,9},{-1,4,1,6},{-5,4,-1,8},{0,0,4,4},{7,7,9,9}}){
      const auto* result=cache.get(s,1,bits+1,clip[0],clip[1],clip[2],clip[3]);
      check(result&&expand(*result)==reference(s,clip[0],clip[1],clip[2],clip[3]),"Merged boundary differs from original clipped pixel edges");
      const auto builds=cache.builds();cache.get(s,1,bits+1,clip[0],clip[1],clip[2],clip[3]);check(cache.builds()==builds,"Ants phase rebuilt unchanged geometry");
    }
  }
  std::optional<SelectionMask> nonbinary=SelectionMask{0,0,2,2,{1,2,0,1}};
  check(expand(*cache.get(nonbinary,2,1,-1,-1,3,3))==reference(nonbinary,-1,-1,3,3),"Nonbinary mask values changed selection semantics");
  SelectionBoundaryCache bounded(2);
  check(!bounded.get(nonbinary,2,1,-1,-1,3,3),"Fragmented selection exceeded cache budget");
  const auto builds=bounded.builds();check(!bounded.get(nonbinary,2,1,-1,-1,3,3)&&bounded.builds()==builds,"Over-budget selection repeatedly attempted cache construction");
  {
    Document d(8,8);const auto revision=d.revision(),content=d.contentRevision();
    d.previewSelection(nonbinary);const auto firstRevision=d.selectionRevision();
    const auto first=expand(*cache.get(d.selection(),d.identity(),firstRevision,-1,-1,9,9));
    nonbinary->mask={0,1,1,0};d.previewSelection(nonbinary);
    check(d.selectionRevision()!=firstRevision&&d.revision()==revision&&d.contentRevision()==content,"Selection preview needs an independent generation");
    check(first!=expand(*cache.get(d.selection(),d.identity(),d.selectionRevision(),-1,-1,9,9)),"Same-size selection preview retained stale boundary");
    d.commitSelection(std::nullopt,nonbinary);auto serial=d.selectionRevision();d.undo();
    check(d.selectionRevision()!=serial&&!d.selection(),"Selection undo did not invalidate boundary generation");
    serial=d.selectionRevision();d.redo();check(d.selectionRevision()!=serial&&selectionEqual(d.selection(),nonbinary),"Selection redo did not invalidate boundary generation");
    serial=d.selectionRevision();d.deselectPixels();check(d.selectionRevision()!=serial&&!d.selection(),"Deselect retained stale boundary generation");
  }
  std::optional<SelectionMask> large=SelectionMask{0,0,1024,1024,std::vector<unsigned char>(1024*1024,1)};
  for(int y=256;y<768;++y)for(int x=256;x<768;++x)large->mask[y*1024+x]=0;
  const auto start=std::chrono::steady_clock::now();const auto* result=cache.get(large,3,1,-1,-1,1025,1025);const auto middle=std::chrono::steady_clock::now();
  check(result&&result->size()==8,"Large hole boundary was not merged");const auto prior=cache.builds();
  for(int i=0;i<1000;++i)check(cache.get(large,3,1,-1,-1,1025,1025)->size()==8,"Warm boundary changed");
  check(cache.builds()==prior,"Warm ants redraw rescanned selection pixels");const auto end=std::chrono::steady_clock::now();
  std::cout<<"selection 1024x1024 cold_ms="<<std::chrono::duration<double,std::milli>(middle-start).count()<<" warm_1000_lookup_ms="<<std::chrono::duration<double,std::milli>(end-middle).count()<<" segments="<<result->size()<<'\n';
  std::cout<<"Selection boundary equivalence, clipping, budget and revision checks passed\n";
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
