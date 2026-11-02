#include "image_sequence_import.h"
#include "project_encode.h"
#include "project_import.h"
#include <iostream>
#include <chrono>
using namespace moon;
using namespace moon::image_sequence;
static void check(bool value,const char* message){if(!value)throw std::runtime_error(message);}
int main(int argc,char** argv){try{
 const auto root=std::filesystem::u8path(argc>1?argv[1]:"image-sequence-test-owned")/std::to_string(std::chrono::steady_clock::now().time_since_epoch().count());std::filesystem::create_directories(root);auto pref=root/"settings.txt";
 check(batches({"a02.png","other.gif","a01.png","A01.PNG","a04.png"})==std::vector<std::vector<std::string>>{{"a01.png","a02.png"},{"other.gif"},{"a04.png"}},"Detection/order/dedupe");
 check(batches({"C:\\x\\09.PNG","C:/x/10.png","C:/x/11.png"}).size()==1,"Padding transition/slash aliases");
 check(batches({"x1.png","x02.png","x03.png","x5.png"})==std::vector<std::vector<std::string>>{{"x1.png"},{"x02.png","x03.png"},{"x5.png"}},"Mixed padding/gaps");
 check(batches({"a1.gif","a2.gif","a1.jpg","a2.png","dir/a3.png","a9007199254740992.png","a9007199254740993.png"}).size()==7,"Nonsequence formats/directories/safe integers");
 check(batches({u8"É01.png",u8"é02.PNG",u8"é01.PNG"}).size()==1,"Unicode case aliases");
 check(duration(0)==1&&duration(123.9)==123&&duration(70000)==60000&&duration(std::numeric_limits<double>::quiet_NaN())==100,"Duration bounds");
 int asks=0,reads=0,adds=0,opens=0,errors=0;std::optional<Document> result;
 Host host;host.ask=[&](const auto&,Settings& settings){++asks;check(reads==0,"Ask before decode");settings.selected=std::vector<std::size_t>{2,0};settings.duration=147.9;return Choice::Animation;};
 host.open=[&](const std::string&){++opens;return true;};host.read=[&](const std::string& path){++reads;Document doc(1,1);doc.beginStroke({0,0},path=="walk01.png"?0x80443322:0xffaabbcc);doc.commitStroke();return doc;};host.add=[&](Document doc){++adds;result=std::move(doc);};host.error=[&](const std::string&){++errors;};
 check(open({"walk03.png","walk01.png","walk02.png"},pref,host),"Animation result");
 check(asks==1&&reads==2&&adds==1&&errors==0&&result->name()==U"walk"&&result->dirty()&&result->sourceFilePath().empty()&&!result->sourceArchive()&&result->animationLoop(),"New animation identity/name/dirty/path/loop");
 const auto& state=result->timeline().state();check(state.frames.size()==2&&state.frames[0].duration==147&&state.frames[1].duration==147&&state.cels[0].surface->pixels[0]==0x80443322&&state.cels[1].surface->pixels[0]==0xffaabbcc,"Ordered selection/alpha/duration");check(result->palette().entries.size()==2,"Imported palette");
 const auto encoded=project::encodeEditableProject(*result);const auto reopened=project::prepareEditableImport(project::readProjectManifest(encoded.bytes));
 check(reopened.id==result->projectId()&&reopened.name==U"walk"&&reopened.loop&&reopened.timeline.frames.size()==2&&reopened.timeline.frames[0].duration==147&&reopened.timeline.cels[0].surface->pixels[0]==0x80443322&&reopened.timeline.cels[1].surface->pixels[0]==0xffaabbcc&&reopened.palette.entries.size()==2,"Native project round-trip structure/identity/pixels/palette");
 asks=reads=adds=errors=0;host.ask=[&](const auto&,Settings& s){++asks;s.selected=std::vector<std::size_t>{};s.remember=true;return Choice::Animation;};check(!open({"a1.png","a2.png"},pref,host)&&reads==0&&adds==0&&!load(pref),"Empty selection must not remember/decode");
 host.ask=[&](const auto&,Settings& s){++asks;s.remember=true;return Choice::Cancel;};check(!open({"a1.png","a2.png","other.png"},pref,host)&&opens==0&&!load(pref),"Cancel stops batch and must not remember");
 asks=opens=0;host.ask=[&](const auto&,Settings& s){++asks;s.repeat=true;return Choice::Separate;};check(open({"a1.png","a2.png","b1.png","b2.png"},pref,host)&&asks==1&&opens==4&&!load(pref),"Repeat only this invocation");
 check(open({"a1.png","a2.png"},pref,host)&&asks==2,"Repeat not persisted");
 host.ask=[&](const auto&,Settings& s){++asks;s.remember=true;s.duration=222;return Choice::Separate;};open({"a1.png","a2.png"},pref,host);const auto previousAsks=asks;check(open({"a1.png","a2.png"},pref,host)&&asks==previousAsks&&load(pref)->duration==222,"Remember across calls");
 const auto corrupt=root/"corrupt.txt";{std::ofstream f(corrupt);f<<"garbage";}check(!load(corrupt),"Corrupt preference ignored");
 host.ask=[](const auto&,Settings&){return Choice::Animation;};adds=errors=0;reads=0;host.read=[&](const std::string&){return Document(++reads,1);};check(!open({"a1.png","a2.png"},corrupt,host)&&adds==0&&errors==1,"Dimension failure no partial document");
 reads=errors=0;host.read=[&](const std::string&){Document doc(1,1);if(++reads==2)doc.addFrame();return doc;};check(!open({"a1.png","a2.png"},corrupt,host)&&adds==0&&errors==1,"Animated source rejected transactionally");
 reads=errors=0;host.read=[&](const std::string&)->Document{++reads;throw std::runtime_error("bad source");};check(!open({"a1.png","a2.png"},corrupt,host)&&reads==1&&adds==0&&errors==1,"Decode failure no partial document");
 std::vector<std::string> huge;for(int i=1;i<=64;++i)huge.push_back("big"+std::to_string(i)+".png");reads=errors=0;host.read=[&](const std::string&){++reads;return Document(1024,1024);};check(!open(huge,corrupt,host)&&reads==1&&adds==0&&errors==1,"Resource budget checked after first decode");
 opens=0;host.ask=[](const auto&,Settings&){return Choice::Separate;};host.open=[&](const std::string&){return ++opens!=1;};check(open({"a1.png","a2.png"},corrupt,host)&&opens==2,"Separate failure continues siblings");
 std::cout<<"image-sequence-import: passed\n";return 0;
}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
