#include "editor_implementation.h"
#include "editor.h"
#include "image_decode.h"
#include "image_save.h"
#include "image_export.h"
#include "aseprite_io.h"
#include "psd_import.h"
#include "project_import.h"
#include <fstream>
namespace moon::editor {
void Editor::smokeLargeImageIo(){
 smoke_=true;asyncSaveForSmoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;queuedSaves_.clear();
 auto check=[](bool value,const char* why){if(!value)throw std::runtime_error(why);};
 const auto root=assets_.parent_path()/"large-image-ui-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(root);recoveryDirectory_=root/"recovery";
 runtimePreferences_.set("files.saveOriginalFormat","true");runtimePreferences_.set("files.projectBackupEnabled","false");
 auto read=[](const std::filesystem::path& path){std::ifstream f(path,std::ios::binary);return std::vector<std::uint8_t>((std::istreambuf_iterator<char>(f)),{});};
 auto decode=[](const std::filesystem::path& path){const auto format=saveImageFormat(path);if(format==SaveImageFormat::Ase||format==SaveImageFormat::Aseprite)return openAseprite(path);if(format==SaveImageFormat::Psd)return openPsd(path);return openRasterImage(path);};
 auto finish=[&]{const auto until=std::chrono::steady_clock::now()+std::chrono::seconds(30);while(pending_==Pending::Saving){check(std::chrono::steady_clock::now()<until,"Large image save timeout");saveTick();if(saveWorker_.valid())saveWorker_.wait_for(std::chrono::milliseconds(1));}check(pending_==Pending::None,"Large image save failed");};
 auto originalChooser=chooseSaveFile_;auto originalDecision=asepriteSaveDecisionForSmoke_;
 try{
  asepriteSaveDecisionForSmoke_=[](bool,const auto&){return 2;};unsigned cases=0;
  for(const auto* ext:{L".png",L".jpg",L".jpeg",L".webp",L".bmp",L".gif",L".ase",L".aseprite",L".psd"}){
   const int width=cases%2?3:1025,height=cases%2?1031:3;
   // Keep large source fixtures on the heap; Editor open/save has its own
   // production stack frames and must run under the normal product stack.
   auto source=std::make_unique<Document>(Document::fromImage(width,height,std::vector<Pixel>(std::size_t(width)*height,0xff2040c0),U"Large source"));
   if(std::wstring(ext)==L".gif"){source->setFrameDuration(40);source->addFrame(true);source->setFrameDuration(210);}
   const auto path=root/(std::wstring(L"source")+ext);const auto bytes=encodeSaveImage(*source,saveImageFormat(path));writeExportBytesAtomic(path,bytes);source.reset();
   const auto priorTabs=projects_.size();openPath(path);check(pending_==Pending::None&&document.width()==width&&document.height()==height&&document.sourceFilePath()==path&&documentPath_.empty()&&!document.dirty()&&!document.canUndo(),"Large actual Editor source open");check(projects_.size()>=priorTabs,"Large open removed existing tabs");
   const auto identity=document.identity(),history=document.historySize(),tabs=projects_.size();const auto baseline=document.pixels();openPath(path);check(document.identity()==identity&&projects_.size()==tabs,"Large duplicate source open");
   document.beginStroke({width-1,height-1},0xff778899);document.commitStroke();const auto expected=document.pixels();check(expected.back()==0xff778899&&document.historySize()==history+1,"Large actual edge stroke");document.undo();check(document.pixels()==baseline,"Large actual edge undo");document.redo();check(document.pixels()==expected,"Large actual edge redo");
   chooseSaveFile_=[](OPENFILENAMEW*){throw std::runtime_error("Large source Save unexpectedly opened chooser");return false;};menuItems_.at("save")->Click();finish();check(!document.dirty()&&document.sourceFilePath()==path&&documentPath_.empty()&&document.historySize()==history+1,"Large source actual Save identity/history");
   auto saved=std::make_unique<Document>(decode(path));check(saved->width()==width&&saved->height()==height,"Large source actual Save decode");if(saveImageFormat(path)!=SaveImageFormat::Jpeg&&saveImageFormat(path)!=SaveImageFormat::Webp)check(saved->pixels()==expected,"Large source actual Save pixels");if(saveImageFormat(path)==SaveImageFormat::Gif)check(saved->timeline().state().frames.size()==2&&saved->timeline().state().frames[1].duration==210,"Large source GIF save animation");saved.reset();
   const auto sourceAfterSave=read(path);const auto native=root/(path.filename().wstring()+L".moonsprite");unsigned choices=0;chooseSaveFile_=[&](OPENFILENAMEW* chooser){++choices;wcsncpy_s(chooser->lpstrFile,chooser->nMaxFile,native.c_str(),_TRUNCATE);chooser->nFilterIndex=1;return true;};menuItems_.at("saveAs")->Click();finish();
   check(choices==1&&document.identity()==identity&&documentPath_==native&&!document.dirty()&&document.historySize()==history+1&&read(path)==sourceAfterSave,"Large native SaveAs changed source or edit history");
   auto archive=std::make_shared<const project::Bytes>(read(native));auto reopened=std::make_unique<Document>(project::createEditableDocument(project::prepareEditableImport(project::readProjectManifest(archive))));check(reopened->width()==width&&reopened->height()==height&&reopened->pixels()==expected&&reopened->timeline().state().frames.size()==document.timeline().state().frames.size(),"Large actual native save/reopen");++cases;
  }
  // Native coordinate-edge width remains interactive through actual canvas,
  // file loading, drawing and save; no UI geometry or zoom preference changes.
  {auto source=Document::fromImage(32768,1,std::vector<Pixel>(32768,0xff2040c0),U"Long canvas");writeExportBytesAtomic(root/"edge.png",encodeSaveImage(source,SaveImageFormat::Png));}
  openPath(root/"edge.png");check(pending_==Pending::None&&document.width()==32768,"Coordinate edge Editor open");document.beginStroke({32767,0},0xffabcdef);document.commitStroke();saveProject(false);finish();check(openRasterImage(root/"edge.png").pixels().back()==0xffabcdef,"Coordinate edge Editor save");
  // Invalid files must report an error while keeping current pixels, tab,
  // dirty state and history. Use the real parser, not a throwing decoder stub.
  const auto identity=document.identity(),history=document.historySize(),tabs=projects_.size();const auto pixels=document.pixels();const bool dirty=document.dirty();auto invalid=encodeAseprite(document);invalid[8]=1;invalid[9]=128;const auto bad=root/"oversized.ase";writeExportBytesAtomic(bad,invalid);openPath(bad);check(pending_==Pending::OpenError&&document.identity()==identity&&document.historySize()==history&&document.pixels()==pixels&&document.dirty()==dirty&&projects_.size()==tabs,"Oversized actual Editor open changed live document");resolve(false);
  const auto broken=root/"broken.webp";writeExportBytesAtomic(broken,{'R','I','F','F',8,0,0,0,'W','E','B','P'});openPath(broken);check(pending_==Pending::OpenError&&document.identity()==identity&&document.historySize()==history&&document.pixels()==pixels&&projects_.size()==tabs,"Broken WebP actual Editor open changed live document");resolve(false);
  chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);asyncSaveForSmoke_=false;
  std::ofstream(root/"result.txt")<<cases<<" source formats: actual Editor open/dedup/edge edit/undo/redo/original Save/native SaveAs/reopen/source preservation; 32768 edge canvas and invalid-open live-state protection passed. Real production decoder/worker/atomic writer; chooser callback injected.\n";
 }catch(...){chooseSaveFile_=std::move(originalChooser);asepriteSaveDecisionForSmoke_=std::move(originalDecision);asyncSaveForSmoke_=false;throw;}
}
}
