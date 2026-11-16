#include "global_color_sampling.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

using Sampling=moon::GlobalColorSampling;
using Pixel=Sampling::Pixel;
static void require(bool condition,const char* message){if(!condition)throw std::runtime_error(message);}
struct Fixture {
 Sampling s;struct Pending {Sampling::Point point;bool region;std::promise<Sampling::Capture> promise;};
 std::vector<Pending> requests;std::vector<Pixel> colors;
 bool lens=false;Sampling::Point position;Pixel lensPixel=0;int finishes=0,pickerReads=0;
 Fixture(){
  s.ports.apply=[&](Pixel c){colors.push_back(c);};s.ports.hideLens=[&]{lens=false;};s.ports.finishPicker=[&]{++finishes;};
  s.ports.moveLens=[&](auto p){if(lens)position=p;};
  s.ports.lens=[&](auto p,const auto& pixels){lens=true;position=p;lensPixel=pixels[pixels.size()/2];};
  s.ports.hideAt=[](auto p){return p.x>=60&&p.x<=90;};
  s.ports.picker=[&](auto p)->std::optional<Sampling::Picker>{if(p.x<60||p.x>90)return {};++pickerReads;return Sampling::Picker{p.x==81?std::optional<Pixel>{}:std::optional<Pixel>{0xff322800u|Pixel(p.x)}};};
  s.ports.canvas=[](auto p)->std::optional<Pixel>{return p.x>=100&&p.x<=110?std::optional<Pixel>{0x80332211}:std::nullopt;};
  s.ports.fallback=[](auto p)->std::optional<Pixel>{return p.x==200?std::optional<Pixel>{0xffaabbcc}:std::nullopt;};
  s.ports.capture=[&](auto p,bool region){requests.push_back({p,region,{}});return requests.back().promise.get_future();};
 }
 void resolve(std::size_t i,Pixel p){auto& r=requests.at(i);r.promise.set_value(r.region?Sampling::Capture{std::vector<Pixel>(121,p),{}}:Sampling::Capture{{},p});s.poll();}
 std::string snapshot()const{std::ostringstream o;o<<colors.size();for(auto c:colors)o<<','<<c;o<<' '<<lens<<' '<<(lens?position.x:0)<<' '<<(lens?position.y:0)<<' '<<(lens?lensPixel:0)<<' '<<requests.size()<<' '<<finishes;return o.str();}
};
int main(int argc,char** argv){try{
 // Actual legacy ColorValueControl-sampling.test.tsx: pending region can move
 // the lens; stale pixels refresh it but only final release changes the color.
 {Fixture f;f.s.begin(0xff030201,true);f.s.queue({300,300});f.s.frame();f.s.queue({400,300});f.s.frame();require(f.requests.size()==1,"single in-flight region");f.resolve(0,0xff000028);require(f.lens&&f.position.x==400&&f.colors.empty()&&f.requests.size()==2,"stale region refreshes latest lens only");f.s.queue({500,300});f.s.frame();require(f.position.x==500,"move lens before capture completes");f.resolve(1,0xff000032);f.s.release({550,300});require(!f.lens&&f.requests.size()==4&&!f.requests[3].region,"release point capture is independent");f.resolve(3,0xff090807);f.resolve(2,0xff000063);require(!f.lens&&f.colors==std::vector<Pixel>{0xff090807}&&f.finishes==1,"late capture cannot resurrect lens or overwrite release");}
 {Fixture f;f.s.begin(0xff030201,false);f.s.queue({30,30});f.s.frame();f.s.queue({60,30});f.s.queue({80,30});f.s.frame();require(f.pickerReads==1&&f.colors==std::vector<Pixel>{0xff322850},"picker wins while desktop capture pending, latest once per frame");f.resolve(0,0xff0000ff);f.s.queue({80,30});f.s.frame();require(f.colors.size()==1,"unchanged RGBA suppressed");f.s.release({90,30});require(f.colors.back()==0xff32285a&&f.requests.size()==1&&f.finishes==1,"final picker sample and finish");}
 {Fixture f;f.s.begin(0,true);f.s.queue({81,20});f.s.frame();require(f.colors.empty()&&f.requests.empty(),"handled empty picker blocks canvas/screen fallback");f.s.queue({105,20});f.s.frame();require(f.colors==std::vector<Pixel>{0x80332211}&&f.lens&&f.requests.empty(),"canvas source retains alpha and bypasses screen");f.s.cancel();require(f.colors.size()==1&&!f.lens&&f.finishes==1,"cancel preserves live sampled color");}
 {Fixture f;f.s.begin(0,true);f.s.queue({300,20});f.s.frame();f.s.release({301,20});f.s.begin(0xff123456,true);f.resolve(1,0xff998877);f.resolve(0,0xff665544);require(f.colors.empty()&&!f.lens&&f.finishes==1,"restart invalidates old final and region callbacks");f.s.cancel();}
 {Fixture f;f.s.ports.capture=[](auto,bool){return std::future<Sampling::Capture>{};};f.s.begin(0,true);f.s.queue({200,20});f.s.frame();require(!f.s.busy()&&f.colors==std::vector<Pixel>{0xffaabbcc}&&f.lens,"invalid platform future reaches UI fallback without busy loop");f.s.cancel();}
 {Fixture f;f.s.begin(0,false);f.s.queue({300,20});f.s.frame();f.s.cancel();f.resolve(0,0xff998877);require(f.colors.empty()&&!f.lens,"cancel rejects late callbacks");}
 {Fixture f;f.s.begin(0,false);f.s.queue({300,20});f.s.frame();f.requests[0].promise.set_exception(std::make_exception_ptr(std::runtime_error("capture failed")));f.s.poll();require(!f.s.busy()&&f.colors.empty(),"capture failure drains without color");}
 {Fixture f;f.s.begin(0,false);f.s.queue({105,20});f.s.ports.apply=[&](Pixel){f.s.cancel();};f.s.frame();require(!f.s.active()&&!f.s.busy(),"owner may cancel reentrantly on apply");}
 if(argc>1){std::ifstream input(argv[1]);require(bool(input),"legacy oracle missing");std::string line;std::unique_ptr<Fixture> f;int rows=0;while(std::getline(input,line)){
  const auto split=line.find(" | ");require(split!=std::string::npos,"oracle row syntax");std::istringstream cmd(line.substr(0,split));char op;cmd>>op;int x,y;Pixel p;
  if(op=='N')f=std::make_unique<Fixture>();else if(op=='B'){int enabled;cmd>>p>>enabled;f->s.begin(p,enabled!=0);}else if(op=='Q'){cmd>>x>>y;f->s.queue({x,y});}else if(op=='F')f->s.frame();else if(op=='D'){std::size_t i;cmd>>i>>p;f->resolve(i,p);}else if(op=='U'){cmd>>x>>y;f->s.release({x,y});}else if(op=='C')f->s.cancel();else throw std::runtime_error("unknown oracle command");
  if(f->snapshot()!=line.substr(split+3))throw std::runtime_error("legacy async mismatch: "+line+" actual "+f->snapshot());++rows;
 }std::cout<<rows<<" actual legacy asynchronous snapshots matched.\n";}
 std::cout<<"Global color sampling lifecycle checks passed.\n";
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
