#include "quick_command_preferences.h"
#include "fixtures/quick_command_legacy.h"
#include <winrt/base.h>
#include <iostream>
#include <stdexcept>
using namespace moon::quick;
void require(bool b,const char* message){if(!b)throw std::runtime_error(message);}
void sameCommands(const std::vector<Command>& a,const std::vector<Command>& b){require(a.size()==b.size(),"command size");for(unsigned i=0;i<a.size();++i)require(a[i].id==b[i].id&&a[i].enabled==b[i].enabled,"command order/enabled");}
void sameBars(const std::vector<Bar>& a,const std::vector<Bar>& b){require(a.size()==b.size(),"bar size");for(unsigned i=0;i<a.size();++i){require(a[i].id==b[i].id&&a[i].name==b[i].name&&a[i].edge==b[i].edge&&a[i].position==b[i].position&&a[i].expanded==b[i].expanded,"bar fields");sameCommands(a[i].commands,b[i].commands);}}
int main(){try{winrt::init_apartment();unsigned n=0;
 for(auto& c:quickBarOracle){try{auto bars=parseBars(c.input);sameBars(bars,parseBars(c.expected));sameBars(bars,parseBars(encodeBars(bars)));}catch(...){std::cerr<<"bar fixture "<<n<<'\n';throw;}++n;}
 for(auto& c:quickCommandOracle)sameCommands(parseCommands(c.input),parseCommands(c.expected));
 for(auto& c:reorderOracle){std::vector<Command> commands{{"cut",true},{"copy",false},{"paste",true}};reorderCommands(commands,c.source,c.target,c.after);auto expected=parseCommands(c.expected);expected.resize(3);sameCommands(commands,expected);}
 auto fallback=defaultCommands(1);auto b=parseBars("[{\"name\":\"custom\"}]",fallback);sameCommands(b[0].commands,fallback);
 // Actual legacy moveBar examples: edge ties, axis changes, grab offset,
 // snap distance, oversized bars, track origins and clamping.
 Rect track{100,200,1000,800},bar{0,0,425,40};
 auto p=moveBar({Edge::Top,20},track,bar,620,200,13);require(p.edge==Edge::Top&&p.position==.5,"center snap");
 p=moveBar({Edge::Top,20},track,bar,630,200,13);require(p.position==.5,"snap inside12");
 p=moveBar({Edge::Top,20},track,bar,633,200,13);require(p.position==.513,"outside snap");
 p=moveBar({Edge::Top,20},track,bar,100,200,13);require(p.edge==Edge::Top&&p.position==.2205,"tie prefers top / lower clamp");
 p=moveBar({Edge::Top,20},track,bar,1100,600,13);require(p.edge==Edge::Right&&p.position==.5,"axis switch clears offset");
 p=moveBar({Edge::Top,20},{0,0,50,50},bar,25,0,13);require(p.position==.5,"oversized centered");
 p=moveBar({Edge::Left,20},track,{0,0,40,425},100,720,13);require(p.edge==Edge::Left&&p.position==.625,"vertical grab offset");
 std::cout<<n<<" legacy bar cases, 6 command cases and drag boundaries passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}catch(const winrt::hresult_error& e){std::wcerr<<e.message().c_str()<<'\n';return 1;}}
