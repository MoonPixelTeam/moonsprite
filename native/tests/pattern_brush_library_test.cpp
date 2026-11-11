#include "pattern_brush_library.h"
#include <fstream>
#include <chrono>
#include <iostream>
#include <thread>
#include <atomic>
#define CHECK(x) do{if(!(x))throw std::runtime_error(#x);}while(false)
int wmain(int argc,wchar_t** argv){try{using namespace moon;CHECK(argc==2);auto dir=std::filesystem::path(argv[1])/std::to_wstring(std::chrono::high_resolution_clock::now().time_since_epoch().count());PatternBrushLibrary library(dir);auto existingTemp=dir/L".brush-order.json.tmp";{std::ofstream file(existingTemp,std::ios::binary);file<<"preserve-existing-temp";}auto b=createPatternBrushFromRgba(2,1,{1,2,3,0,4,5,6,128});auto bytes=encodePatternBrushPng(b);auto one=library.save("first",bytes,true,-2,7),two=library.save("second",bytes),three=library.save("third",bytes);CHECK(one.id!=two.id);auto list=library.list();CHECK(list.brushes.size()==3&&list.brushes[0].id==one.id&&list.brushes[0].sourceX==-2&&list.brushes[0].sourceY==7);auto decoded=importPatternBrush(std::filesystem::u8path(one.filePath));CHECK(decoded.brush.colors==b.colors);library.reorder({three.id,one.id,two.id});{std::ifstream file(existingTemp,std::ios::binary);std::string contents((std::istreambuf_iterator<char>(file)),{});CHECK(contents=="preserve-existing-temp");}PatternBrushLibrary reopened(dir);CHECK(reopened.list().brushes[0].id==three.id);PatternBrushSelection selected;std::vector<std::string> ids{three.id,one.id,two.id};selected.select(ids,one.id);selected.select(ids,two.id,true);CHECK(selected.ids==std::vector<std::string>({one.id,two.id}));selected.select(ids,three.id,false,true);CHECK(selected.ids==ids);selected.select(ids,one.id);selected.select(ids,one.id);CHECK(selected.ids.empty());library.remove(two.id);CHECK(reopened.list().brushes.size()==2);CHECK(!std::filesystem::exists(std::filesystem::u8path(two.filePath)));bool bad=false;try{library.remove("../first.png");}catch(const std::invalid_argument&){bad=true;}CHECK(bad);auto parent=library.createFolder("Actors"),child=library.createFolder("Child",parent.id);auto duplicate=library.createFolder("Actors");CHECK(duplicate.id=="Actors-2");auto moved=library.move(one.id,child.id);CHECK(moved.id==one.id&&moved.folderId==child.id&&moved.sourceX==-2);auto renamed=library.renameFolder(parent.id,"People");CHECK(renamed.id=="People");PatternBrushLibrary again(dir);CHECK(again.list().folders.size()==3);CHECK(again.list().brushes[0].id==three.id);bool rejected=false;try{library.renameFolder(renamed.id,"Actors-2");}catch(const std::runtime_error&){rejected=true;}CHECK(rejected&&std::filesystem::exists(dir/L"People"/L"Child"));rejected=false;try{library.move(one.id,"../outside");}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected);library.removeFolder(renamed.id);CHECK(again.list().brushes.size()==1&&again.list().brushes[0].id==three.id);CHECK(!std::filesystem::exists(dir/L"People"));

// Legacy list_brushes: first matching order entry wins; missing IDs are
// ignored, unlisted external resources sort by name then ID, across folders.
{const auto orderedRoot=dir/L"order-evidence";PatternBrushLibrary ordered(orderedRoot);const auto nested=ordered.createFolder("Nested");
 for(const auto& name:{"z.png","a.png","b.png","external.png"}){std::ofstream out(orderedRoot/name,std::ios::binary);out.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());}
 {std::ofstream out(orderedRoot/L"Nested"/L"nested.png",std::ios::binary);out.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());}
 {std::ofstream order(orderedRoot/L".brush-order.json");order<<R"(["absent.png","z.png","nested.png","z.png","a.png"])";}
 const auto actual=ordered.list();std::vector<std::string> result;for(const auto& item:actual.brushes)result.push_back(item.id);CHECK(result==std::vector<std::string>({"z.png","nested.png","a.png","b.png","external.png"}));
 CHECK(actual.brushes[1].folderId==nested.id);CHECK(PatternBrushLibrary(orderedRoot).list().brushes[0].id=="z.png");
 // Metadata parsing keeps partial coordinate presence and signed values.
 {std::ofstream meta(orderedRoot/L"z.meta.json");meta<<R"({"sourceX": -13, "sourceY": 2147483648})";}
 const auto metadata=ordered.list().brushes[0];CHECK(!metadata.sourceX&&!metadata.sourceY);
}
// platform_brushes.rs accepts PNG case variants, and set_brush_order
// persists only explicitly supplied existing IDs, rejecting unsafe inputs.
{const auto root=dir.parent_path()/(dir.filename().wstring()+L"-legacy-order");PatternBrushLibrary compatible(root);const auto folder=compatible.createFolder("Upper");
 for(const auto& name:{"UPPER.PNG","middle.PnG","alpha.png"}){std::ofstream out(root/name,std::ios::binary);out.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());}
 CHECK(PatternBrushLibrary::safeId("UPPER.PNG")&&PatternBrushLibrary::safeId("middle.PnG")&&!PatternBrushLibrary::safeId("../unsafe.PNG"));CHECK(compatible.list().brushes.size()==3);
 compatible.reorder({"middle.PnG","UPPER.PNG","missing.PNG","middle.PnG"});
 {std::ifstream order(root/L".brush-order.json");std::string text((std::istreambuf_iterator<char>(order)),{});CHECK(text==R"(["middle.PnG","UPPER.PNG"])");}
 bool rejected=false;try{compatible.reorder({"UPPER.PNG","../unsafe.PNG"});}catch(const std::invalid_argument&){rejected=true;}CHECK(rejected&&compatible.list().brushes.front().id=="middle.PnG");
 compatible.reorder({"UPPER.PNG"});auto reopened=PatternBrushLibrary(root).list();CHECK(reopened.brushes[0].id=="UPPER.PNG"&&reopened.brushes[1].id=="alpha.png"&&reopened.brushes[2].id=="middle.PnG");
 const auto moved=compatible.move("UPPER.PNG",folder.id);CHECK(moved.folderId==folder.id);compatible.removeFolder(folder.id);reopened=compatible.list();CHECK(reopened.brushes.size()==2&&reopened.brushes[0].id=="alpha.png");
 {std::ifstream order(root/L".brush-order.json");std::string text((std::istreambuf_iterator<char>(order)),{});CHECK(text=="[]");}
 compatible.reorder({"middle.PnG"});compatible.remove("middle.PnG");CHECK(PatternBrushLibrary(root).list().brushes.size()==1);
}
// serde_json contract: escaped order strings work; malformed whole documents
// and wrong metadata types default the entire record, never regex fragments.
{const auto root=dir.parent_path()/(dir.filename().wstring()+L"-json");PatternBrushLibrary parsed(root);
 for(const auto& name:{"a.png","z.png"}){std::ofstream out(root/name,std::ios::binary);out.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());}
 auto order=[&](const std::string& text){{std::ofstream out(root/L".brush-order.json");out<<text;}return parsed.list();};
 CHECK(order(R"(["\u007a.png","a.png"])").brushes[0].id=="z.png");
 for(const auto& text:{R"(["z.png",])",R"(["z.png",1])",R"(["z.png"] garbage)",R"({"items":["z.png"]})"})CHECK(order(text).brushes[0].id=="a.png");
 auto metadata=[&](const std::string& text){{std::ofstream out(root/L"a.meta.json");out<<text;}return parsed.list().brushes[0];};
 auto valid=metadata(R"({"intrinsicSize":true,"sourceX":-13,"sourceY":7})");CHECK(valid.sourceX==-13&&valid.sourceY==7);
 for(const auto& text:{R"({"sourceX":1})",R"({"intrinsicSize":true,"sourceX":1,"sourceY":"7"})",R"({"intrinsicSize":true,"sourceX":1,"sourceY":2147483648})",R"({"intrinsicSize":true,"sourceX":1)"}){auto invalid=metadata(text);CHECK(!invalid.sourceX&&!invalid.sourceY);}
}
// A background listing may overlap repeated atomic order replacement.
std::atomic<bool> reading{true};std::exception_ptr readerFailure;
std::thread reader([&]{try{while(reading.load())(void)reopened.list();}catch(...){readerFailure=std::current_exception();}});
try{for(int i=0;i<100;++i)library.reorder({three.id});}catch(...){reading=false;reader.join();throw;}
reading=false;reader.join();if(readerFailure)std::rethrow_exception(readerFailure);
CHECK(reopened.list().brushes.front().id==three.id);

// Library transactions span PNG + metadata + order. A concurrent scan must
// never see a saved brush before its source coordinates or a half-moved pair.
{const auto root=dir.parent_path()/(dir.filename().wstring()+L"-transactions");PatternBrushLibrary transactions(root);const auto folder=transactions.createFolder("Moves");
 std::atomic<bool> run{true};std::atomic<unsigned> scans{0};std::exception_ptr failure;
 std::thread scanner([&]{try{PatternBrushLibrary observer(root);while(run.load()){const auto snapshot=observer.list();for(const auto& item:snapshot.brushes){CHECK(item.sourceX==-9&&item.sourceY==17);CHECK(item.folderId.empty()||item.folderId==folder.id);}++scans;std::this_thread::yield();}}catch(...){failure=std::current_exception();run=false;}});
 try{while(scans.load()==0&&run.load())std::this_thread::yield();for(int i=0;i<12;++i){auto saved=transactions.save("transaction",bytes,true,-9,17);transactions.move(saved.id,folder.id);transactions.move(saved.id,"");transactions.remove(saved.id);}}catch(...){run=false;scanner.join();throw;}
 run=false;scanner.join();if(failure)std::rethrow_exception(failure);CHECK(scans>0&&transactions.list().brushes.empty());
}

CHECK(reorderedPatternBrushIds({"a","b","c","d"},{"c","a"},"d",false)==std::vector<std::string>({"b","a","c","d"}));
CHECK(reorderedPatternBrushIds({"a","b","c","d"},{"c","a"},"b",true)==std::vector<std::string>({"b","a","c","d"}));
CHECK(reorderedPatternBrushIds({"a","b","c","d"},{"c","a"},"",false)==std::vector<std::string>({"b","d","a","c"}));
const auto dragOne=library.save("drag-one",bytes),dragTwo=library.save("drag-two",bytes);const auto destination=library.createFolder("DragTarget");auto conflict=dir/std::filesystem::u8path(destination.id)/std::filesystem::u8path(dragTwo.id);conflict.replace_extension(L".meta.json");{std::ofstream out(conflict);out<<"occupied";}
bool moveRejected=false;try{library.moveGroup({dragOne.id,dragTwo.id},destination.id);}catch(const std::runtime_error&){moveRejected=true;}CHECK(moveRejected);CHECK(std::filesystem::exists(std::filesystem::u8path(dragOne.filePath))&&std::filesystem::exists(std::filesystem::u8path(dragTwo.filePath)));CHECK(!std::filesystem::exists(dir/std::filesystem::u8path(destination.id)/std::filesystem::u8path(dragOne.id)));
std::filesystem::remove(conflict);library.moveGroup({dragOne.id,dragTwo.id},destination.id);PatternBrushLibrary dragReopened(dir);for(const auto& id:{dragOne.id,dragTwo.id}){auto items=dragReopened.list().brushes;auto found=std::find_if(items.begin(),items.end(),[&](const auto& item){return item.id==id;});CHECK(found!=items.end()&&found->folderId==destination.id);}library.moveGroup({dragOne.id,dragTwo.id},"");library.reorder({dragTwo.id,dragOne.id});CHECK(PatternBrushLibrary(dir).list().brushes.front().id==dragTwo.id);


CHECK(PatternBrushDropPaths::normalize(R"(  "D:\Art\笔刷.png"  )")==R"(D:\Art\笔刷.png)");
CHECK(PatternBrushDropPaths::normalize("file:///D:/Art/brush%20stamp.png")==R"(D:\Art\brush stamp.png)");
CHECK(PatternBrushDropPaths::normalize("file://server/share/brush.png")==R"(\\server\share\brush.png)");
PatternBrushDropPaths unicodeDrops;CHECK(unicodeDrops.fresh({u8R"(D:\Art\Ä.PNG)",u8R"(d:\art\ä.png)"},2100).size()==1);PatternBrushDropPaths drops;CHECK(drops.fresh({R"(D:\Art\Brush.PNG)",R"(d:\art\brush.png)","notes.txt"},100).size()==1);CHECK(drops.fresh({R"(D:\Art\Brush.PNG)"},1099).empty());CHECK(drops.fresh({R"(D:\Art\Brush.PNG)"},1100).size()==1);
std::cout<<"pattern brush library checks passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
