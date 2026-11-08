#include "home_banner.h"
#include "fixtures/home_banner_legacy.h"
#include <iostream>
bool same(const std::vector<moon::home::Banner>& a,const std::vector<moon::home::Banner>& b){
 if(a.size()!=b.size())return false;
 for(std::size_t i=0;i<a.size();++i){const auto& x=a[i];const auto& y=b[i];
  if(x.id!=y.id||x.kind!=y.kind||x.projectName!=y.projectName||x.asset!=y.asset||x.name!=y.name||x.author!=y.author||x.url!=y.url||x.path!=y.path||x.modified!=y.modified)return false;}
 return true;
}
int main(){try{
 if(!same(moon::home::bannerDefinitions(),banner_fixture::definitions))throw std::runtime_error("Curated metadata differs from actual legacy");
 int index=0;for(const auto& c:banner_fixture::cases){if(!same(moon::home::resolveBanners(c.definitions,c.projects),c.expected))throw std::runtime_error("Legacy resolution case "+std::to_string(index));++index;}
 for(const auto& c:banner_fixture::shuffles){std::size_t i=0;const auto input=moon::home::bannerDefinitions();if(!same(moon::home::shuffleBanners(input,[&]{return c.random.at(i++);}),c.expected)||!same(input,banner_fixture::definitions))throw std::runtime_error("Legacy shuffle or input mutation");}
 std::cout<<index<<" actual legacy resolution cases and "<<banner_fixture::shuffles.size()<<" shuffle cases passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
