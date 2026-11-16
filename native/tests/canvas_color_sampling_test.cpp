#include "canvas_color_sampling.h"
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>

using Router=moon::CanvasColorSampling;
static void require(bool ok,const char* why){if(!ok)throw std::runtime_error(why);}
struct Fixture{
 Router router;int canvases[5]{};int hit=0;std::map<int,Router::Token> tokens;std::vector<std::string> events;
 Fixture(){router.canvasAtPoint=[this](auto)->const void*{return hit?&canvases[hit]:nullptr;};}
 void add(int id,int key,std::optional<Router::Pixel> pixel){tokens[id]=router.add({&canvases[key],[this,id,pixel](auto p){events.push_back("s"+std::to_string(id)+":"+std::to_string(p.x)+":"+std::to_string(p.y));return pixel;},[this,id](bool value){events.push_back("c"+std::to_string(id)+":"+std::to_string(value));}});}
 void begin(int key,int pointer){router.begin(&canvases[key],pointer,[this](auto c,auto p){events.push_back("a"+std::to_string(c)+":"+std::to_string(p.x)+":"+std::to_string(p.y));});}
 void intent(int key){router.intent(&canvases[key],[this](auto c,auto p,bool secondary){events.push_back("i"+std::to_string(c)+":"+std::to_string(p.x)+":"+std::to_string(p.y)+":"+std::to_string(secondary));});}
 std::string snapshot(const std::string& result)const{std::ostringstream s;s<<result<<' ';for(int i=1;i<=3;++i)s<<router.activeFor(&canvases[i]);s<<':'<<router.intentActive()<<' ';for(std::size_t i=0;i<events.size();++i){if(i)s<<',';s<<events[i];}return s.str();}
};
int main(int argc,char** argv){try{
 {Fixture f;f.add(1,1,1);f.add(2,2,0);f.hit=2;require(f.router.sample({17,29})==0,"Transparent raw sample is valid");f.begin(1,7);require(f.router.route({17,29}),"Captured route handles target");f.router.end(8);require(f.router.activeFor(&f.canvases[1]),"Wrong pointer cannot end gesture");f.router.end(7);require(!f.router.activeFor(&f.canvases[1]),"Correct pointer releases source");require(f.events[f.events.size()-2]=="c2:0"&&f.events.back()=="c1:0","Target and source cursor cleanup");}
 {Fixture f;f.add(1,1,1);f.add(2,2,{});f.intent(1);f.hit=2;require(f.router.routeIntent({17,29},true),"Null sample consumes target intent");require(f.events.back()=="s2:17:29","Null cannot emit color");f.hit=1;require(!f.router.routeIntent({17,29},false),"Source falls through to local input");f.router.clearIntentFor(&f.canvases[2]);require(f.router.intentActive(),"Other owner cannot clear intent");f.router.clearIntentFor(&f.canvases[1]);require(!f.router.intentActive(),"Source clears intent");}
 {Fixture f;f.add(1,1,1);f.add(2,2,2);f.begin(1,0);f.hit=2;f.router.route({17,29});f.router.remove(f.tokens[2]);require(f.events.back()=="c2:0"&&f.router.activeFor(&f.canvases[1]),"Removing target keeps source gesture");f.router.remove(f.tokens[1]);require(!f.router.activeFor(&f.canvases[1]),"Removing source ends routing");}
 if(argc>1){std::ifstream in(argv[1]);require(bool(in),"Legacy oracle missing");std::unique_ptr<Fixture> f;std::string line;int count=0;
  while(std::getline(in,line)){const auto split=line.find(" | ");require(split!=std::string::npos,"Oracle syntax");std::istringstream command(line.substr(0,split));char op;command>>op;std::string result="-";int key,id,pointer;
   if(op=='N')f=std::make_unique<Fixture>();
   else if(op=='A'){std::string pixel;command>>id>>key>>pixel;f->add(id,key,pixel=="null"?std::optional<Router::Pixel>{}:std::optional<Router::Pixel>{Router::Pixel(std::stoull(pixel))});}
   else if(op=='H')command>>f->hit;
   else if(op=='D'){command>>id;f->router.remove(f->tokens.at(id));}
   else if(op=='B'){command>>key>>pointer;f->begin(key,pointer);}
   else if(op=='E'){if(command>>pointer)f->router.end(pointer);else f->router.end();}
   else if(op=='I'){command>>key;f->intent(key);}
   else if(op=='C'){command>>key;f->router.clearIntentFor(&f->canvases[key]);}
   else if(op=='Z')f->router.clearIntent();
   else if(op=='S'){const auto c=f->router.sample({17,29});result=c?std::to_string(*c):"null";}
   else if(op=='R')result=std::to_string(f->router.route({17,29}));
   else if(op=='T'){command>>id;result=std::to_string(f->router.routeIntent({17,29},id!=0));}
   else throw std::runtime_error("Unknown command");
   const auto actual=f->snapshot(result);if(actual!=line.substr(split+3))throw std::runtime_error("Legacy mismatch: "+line+" actual "+actual);++count;
  }std::cout<<count<<" actual legacy canvas router snapshots matched.\n";
 }
 std::cout<<"Canvas color sampling lifecycle checks passed.\n";
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
