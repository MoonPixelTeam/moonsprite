#include "canvas_reference_geometry.h"
#include "canvas_reference_image.h"
#include "document.h"
#include "document_snapshot.h"
#include "project_encode.h"
#include "project_import.h"
#include <chrono>
#include <fstream>
#include <iostream>
#include <sstream>
using namespace moon;
namespace {
void check(bool value,const char* why){if(!value)throw std::runtime_error(why);}
void near(double a,double b){if(std::abs(a-b)>1e-8*std::max({1.,std::abs(a),std::abs(b)}))throw std::runtime_error("Actual legacy reference geometry mismatch");}
const std::string png="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==";
CanvasReference picture(std::string id){CanvasReference r;r.id=std::move(id);r.name="参考.png";r.src=std::make_shared<const std::string>(png);r.x=-20;r.y=10;r.width=30;r.height=20;return r;}
Document reopen(const Document& d,bool recovery=false){return project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest((recovery?project::encodeRecoveryProject(d):project::encodeEditableProject(d)).bytes)));}
void transactions(){
 Document d(10,10);d.beginStroke({1,1},0xff123456);d.commitStroke();d.markSaved();
 const auto raster=d.pixels();const auto content=d.contentRevision(),base=d.historySize();int events=0,recorded=0;
 d.setAnimationChangeListener([&](const Document&,const AnimationChange& c){check(c.kind==AnimationChange::Kind::HistoryChanged&&!c.requiresAnimationSync,"References must not synchronize animation or selection");++events;});
 d.setRecordingSession({},[&](Document&,bool){++recorded;});
 check(d.addCanvasReference(picture("ref"))&&d.dirty()&&d.historySize()==base+1,"Add reference in ordinary document history");
 check(!d.addCanvasReference(picture("ref")),"Duplicate ID preserves history");
 d.beginCanvasReference("ref");ReferencePatch patch;patch.x=12;patch.angle=30;d.updateCanvasReference("ref",patch);patch.x=15;patch.angle=90;patch.width=50;d.updateCanvasReference("ref",patch);
 check(d.canvasReference("ref")->x==15&&d.canvasReferences()[0].x==-20&&d.historySize()==base+1,"Gesture previews leave committed project intact");
 check(reopen(d).canvasReference("ref")->x==-20,"Save during preview uses committed placement");
 d.finishCanvasReference();check(d.historySize()==base+2,"One drag is one history entry");d.undo();check(d.canvasReference("ref")->x==-20,"Gesture undo");d.redo();check(d.canvasReference("ref")->x==15,"Gesture redo");
 patch={};patch.flipX=true;d.updateCanvasReference("ref",patch);patch={};patch.locked=true;d.updateCanvasReference("ref",patch);const auto lockedHistory=d.historySize();
 patch.x=900;check(!d.updateCanvasReference("ref",patch)&&!d.removeCanvasReference("ref")&&!d.resetCanvasReference("ref")&&d.historySize()==lockedHistory,"Locked reference only accepts lock changes");
 d.undo();d.resetCanvasReference("ref");check(!d.canRedo()&&d.canvasReference("ref")->width==30&&d.canvasReference("ref")->angle==0&&d.canvasReference("ref")->x==15,"Reset retains position and truncates redo");
 d.undo();check(d.canvasReference("ref")->width==50&&d.canvasReference("ref")->flipX,"Reset undo restores transforms");
 const auto saved=*d.canvasReference("ref");const auto bytes=d.historyBytes(),count=d.historySize();
 d.beginCanvasReference("ref");patch={};patch.y=99;d.updateCanvasReference("ref",patch);d.finishCanvasReference(true);check(sameReference(*d.canvasReference("ref"),saved)&&d.historySize()==count&&d.historyBytes()==bytes,"Cancel preserves state/history");
 d.addCanvasReference(picture("second"));d.bringCanvasReferenceToFront("ref");check(d.canvasReferences().back().id=="ref","Bring to front persists order");
 d.undo();check(d.canvasReferences()[0].id=="ref","Order undo");d.redo();d.removeCanvasReference("ref");d.undo();check(d.canvasReferences().back().id=="ref","Delete undo restores order");d.redo();
 check(reopen(d).canvasReferences().size()==1&&reopen(d,true).canvasReferences().size()==1,"Editable/recovery deletion round trip");
 check(d.setHistoryPosition(base)&&d.canvasReferences().empty(),"History panel jump replays metadata only");
 check(d.pixels()==raster&&d.contentRevision()==content&&recorded==0&&events>10,"Reference history must not paint or record artwork");
}
void persistence(){
 Document d(2,2);d.addCanvasReference(picture("ref"));ReferencePatch p;p.x=-42.5;p.y=73;p.angle=37;p.width=60;p.flipY=true;p.opacity=.4;p.floating=true;d.updateCanvasReference("ref",p);p={};p.locked=true;d.updateCanvasReference("ref",p);
 for(bool recovery:{false,true}){auto copy=reopen(d,recovery);const auto* r=copy.canvasReference("ref");check(r&&sameReference(*r,*d.canvasReference("ref"))&&r->initial->width==30&&!copy.dirty(),"Complete reference metadata round trip");}
 DocumentSnapshot snapshot(d);while(!snapshot.advance(d,std::chrono::steady_clock::now()+std::chrono::seconds(1))){}auto copy=snapshot.finish();check(sameReference(*copy.canvasReference("ref"),*d.canvasReference("ref")),"Snapshot retains source and committed placement");
 p={};p.locked=false;d.updateCanvasReference("ref",p);const auto original=*d.canvasReference("ref");
 const std::string svg="<svg xmlns='http://www.w3.org/2000/svg' width='4' height='8'><rect width='4' height='8' fill='red'/></svg>";
 auto source=std::make_shared<const std::string>(canvasReferenceDataUrl({svg.begin(),svg.end()},"image/svg+xml"));
 check(d.replaceCanvasReference("ref",source,4,8)&&d.canvasReference("ref")->height==120&&d.canvasReference("ref")->initial->angle==0,"Replace retains displayed width and resets initial transform");
 auto reopened=reopen(d);check(*reopened.canvasReference("ref")->src==*source,"Replacement rewrites resource at same ID");d.undo();check(sameReference(*d.canvasReference("ref"),original),"Replacement undo retains old source");d.redo();
 check(d.rollbackProject(copy)&&*d.canvasReference("ref")->src==png,"Backup rollback restores reference resource");d.undo();check(*d.canvasReference("ref")->src==*source,"Backup rollback undo restores source");
 reopened.removeCanvasReference("ref");const auto encoded=project::encodeEditableProject(reopened);project::Archive archive(encoded.bytes);check(!archive.entries().count("references/canvas/ref.dataurl"),"Removed reference resource is pruned from source archive");
 const auto pixels=decodeCanvasReferenceImage(png);check(pixels.width==1&&pixels.height==1,"WIC static image decode");const auto vector=decodeCanvasReferenceImage(*source);check(vector.width==4&&vector.height==8&&vector.pixels[0]==0xff0000ff,"SVG source dimensions and rasterization");
}
void oracle(const char* path){
 std::ifstream input(path);check(bool(input),"Missing legacy oracle");std::string line;std::size_t count=0;
 while(std::getline(input,line)){std::istringstream row(line);char kind;ReferencePlacement r;int fx,fy;TransformPoint p;row>>kind>>r.x>>r.y>>r.width>>r.height>>r.angle>>fx>>fy>>p.x>>p.y;r.flipX=fx;r.flipY=fy;
  try{if(kind=='R'){std::string handle;int integer,center,x,y;double left,top,width,height;row>>handle>>integer>>center>>left>>top>>width>>height>>x>>y;const auto actual=resizeReferenceBounds(r,p,handle,integer,center);near(actual.x,left);near(actual.y,top);near(actual.width,width);near(actual.height,height);check(actual.flipX==bool(x)&&actual.flipY==bool(y),"Legacy resize reflection");}
  else if(kind=='S'){int x,y;row>>x>>y;const auto actual=referenceSourcePoint(r,p,7,5);check(actual?actual->x==x&&actual->y==y:x==-1&&y==-1,"Legacy source coordinate sampling");}
  else if(kind=='H'){double scale;std::string expected;row>>scale>>expected;const auto actual=referenceTransformHit(r,p,scale);check((actual.empty()?"-":actual)==expected,"Legacy resize/rotation handle precedence");}
  check(!row.fail(),"Invalid oracle record");}catch(...){std::cerr<<"Oracle case "<<count<<": "<<line<<"\n";throw;}++count;
 }check(count>10000,"Legacy oracle coverage");std::cout<<count<<" legacy geometry cases passed\n";
}
void lifecycle(){
 Document d(4,4);d.addCanvasReference(picture("ref"));const auto position=d.historyPosition();
 SelectionClipboard clipboard;clipboard.width=clipboard.height=1;clipboard.pixels={0xff123456};check(d.beginFloatingPaste(clipboard,0,0),"Pending floating reference history fixture");d.undo();check(!d.floating()&&d.historyPosition()==position&&d.canvasReference("ref"),"Floating cancel must precede reference history");
 int selectionEvents=0;d.setAnimationChangeListener([&](const Document&,const AnimationChange& c){if(c.kind==AnimationChange::Kind::SelectionPreviewChanged)++selectionEvents;});d.undo();d.redo();d.setHistoryPosition(0);check(selectionEvents==0,"Metadata-only history jump must not project selection");
 Document failure(2,2);failure.addCanvasReference(picture("safe"));failure.setAnimationChangeListener([](const Document&,const AnimationChange&){throw std::runtime_error("Observer failure");});failure.beginCanvasReference("safe");ReferencePatch patch;patch.x=99;failure.updateCanvasReference("safe",patch);bool failed=false;try{failure.finishCanvasReference();}catch(const std::exception&){failed=true;}check(failed&&failure.canvasReferences()[0].x==99&&failure.historySize()==2,"Committed observer failure retains reference and history together");failure.setAnimationChangeListener({});failure.undo();check(failure.canvasReference("safe")->x==-20,"Observer failure remains undoable");
}
void formats(const std::filesystem::path& root){
 auto still=decodeCanvasReferenceImage(readCanvasReferenceSource(root/"alpha.webp"));check(still.width==2&&still.height==1&&still.pixels[1]==0x803c3228,"WebP raw alpha");
 auto gif=decodeCanvasReferenceImage(readCanvasReferenceSource(root/"offset.gif"));check(gif.width==4&&gif.height==3&&gif.pixels[5]==0xff0000ff,"GIF frame offsets");
 auto animated=decodeCanvasReferenceImage(readCanvasReferenceSource(root/"animated.webp"));const auto first=animated.pixels;check(bool(animated.animation)&&!advanceCanvasReferenceImage(animated,0),"Animated initial frame timing");check(advanceCanvasReferenceImage(animated,150)&&animated.pixels!=first,"Animated reference advances raw frame");
 bool failed=false;try{decodeCanvasReferenceImage(readCanvasReferenceSource(root/"bad.gif"));}catch(const std::exception&){failed=true;}check(failed,"Corrupt image rejected");
}
}
int main(int argc,char** argv){try{check(argc==3,"Expected oracle and format fixtures");transactions();persistence();lifecycle();oracle(argv[1]);formats(std::filesystem::u8path(argv[2]));std::cout<<"canvas-reference checks passed\n";return 0;}catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}}
