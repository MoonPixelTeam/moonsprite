#include "editor_implementation.h"
#include "extension_install_dialog.h"
#include "extension_package.h"
#include "extension_localization.h"
#include "lua_script_service.h"
#include "project_zip_writer.h"
#include <future>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>
namespace moon::editor { namespace {
struct Preview {extension::PackageInspection package;std::optional<extension::RuntimeCandidate> previous;};
// Process ownership avoids std::async future destruction joining the UI thread.
// Accepted disk work drains on normal process exit; workers never capture a dialog.
class InstallationQueue {
 std::mutex mutex_;std::condition_variable ready_;std::deque<std::function<void()>> jobs_;bool stopping_=false;std::thread worker_;
public:
 InstallationQueue():worker_([this]{for(;;){std::function<void()> job;{std::unique_lock<std::mutex> lock(mutex_);ready_.wait(lock,[this]{return stopping_||!jobs_.empty();});if(jobs_.empty())return;job=std::move(jobs_.front());jobs_.pop_front();}job();}}){}
 ~InstallationQueue(){{std::lock_guard<std::mutex> lock(mutex_);stopping_=true;}ready_.notify_one();worker_.join();}
 template<class Work> auto submit(Work work)->std::future<decltype(work())>{using Result=decltype(work());auto task=std::make_shared<std::packaged_task<Result()>>([work=std::move(work)]()mutable{winrt::init_apartment(winrt::apartment_type::multi_threaded);struct Apartment{~Apartment(){winrt::uninit_apartment();}} apartment;return work();});auto future=task->get_future();{std::lock_guard<std::mutex> lock(mutex_);jobs_.push_back([task]{(*task)();});}ready_.notify_one();return future;}
};
InstallationQueue& installationQueue(){static InstallationQueue queue;return queue;}

class ExtensionInstallDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::filesystem::path path_,directory_;
 PixelButton *confirm_,*cancel_,*close_;PixelScrollBar* scrollBar_;ui::Timer timer_{20,this};
 std::future<Preview> inspection_;std::future<std::string> installation_;std::function<void()> beforeInstallation_;std::optional<Preview> preview_;
 std::u32string title_=U"安装扩展",text_=U"正在检查扩展包…";std::vector<std::u32string> lines_;int wrapWidth_=-1,scroll_=0;
 bool busy_=true,installed_=false,failed_=false;
 gfx::Rect body()const{auto r=uiLogical(clientBounds());return {r.x+6,r.y+DialogLayout::bodyTop,std::max(1,r.w-22),std::max(12,r.h-DialogLayout::bodyTop-textControlHeight-12)};}
 void wrap(){const int width=body().w;if(width==wrapWidth_)return;wrapWidth_=width;lines_.clear();std::u32string line;int advance=0;for(auto c:text_){if(c==U'\n'){lines_.push_back(std::move(line));line.clear();advance=0;continue;}int glyph=font_.measure(std::u32string(1,c));if(advance+glyph>width&&!line.empty()){lines_.push_back(std::move(line));line.clear();advance=0;}line+=c;advance+=glyph;}lines_.push_back(std::move(line));scroll_=std::clamp(scroll_,0,std::max(0,int(lines_.size())*12-body().h));scrollBar_->configure(int(lines_.size())*12*uiScale,body().h*uiScale,scroll_*uiScale);scrollBar_->setVisible(int(lines_.size())*12>body().h);}
 void content(std::u32string value){text_=std::move(value);wrapWidth_=-1;scroll_=0;wrap();invalidate();}
 void controls(){confirm_->setEnabled(!busy_&&preview_.has_value()&&!failed_);cancel_->setEnabled(!installation_.valid());close_->setEnabled(!installation_.valid());cancel_->caption=failed_?U"关闭":U"取消";invalidate();}
 void cancel(){if(installation_.valid())return;inspection_={};closeWindow(nullptr);}
 void error(const std::string& value){std::u32string message;try{message=unicodeText(value);}catch(...){int n=MultiByteToWideChar(CP_ACP,0,value.c_str(),-1,nullptr,0);if(n>0){std::wstring wide(n,L'\0');MultiByteToWideChar(CP_ACP,0,value.c_str(),-1,wide.data(),n);wide.resize(n-1);message=unicodeText(winrt::to_string(wide));}else message=U"无法读取系统错误说明。";}busy_=false;failed_=true;content(U"扩展安装失败："+message);controls();}
 void begin(){if(busy_||failed_||!preview_)return;try{busy_=true;controls();content(U"正在安装扩展，请稍候…");auto package=std::move(preview_->package);installation_=installationQueue().submit([package=std::move(package),directory=directory_,before=std::move(beforeInstallation_)]()mutable{if(before)before();auto result=extension::installInspectedPackage(package,directory);return result.extension.id;});controls();}catch(const std::exception& e){error(e.what());}}
 void tick(){try{
  if(inspection_.valid()&&inspection_.wait_for(std::chrono::seconds(0))==std::future_status::ready){preview_=inspection_.get();busy_=false;auto candidate=extension::localizedCandidate(preview_->package.candidate,"zh-CN");auto& m=candidate.metadata;auto text=[](const std::string& s){return unicodeText(s.empty()?"未提供":s);};const bool replaces=preview_->previous.has_value();title_=replaces?U"扩展版本冲突":U"安装扩展";confirm_->caption=replaces?U"替换安装":U"安装";
   std::u32string message=replaces?U"“"+text(m.name)+U"”已安装，是否替换为待安装版本？":U"是否安装“"+text(m.name)+U"”？";
   if(replaces)message+=U"\n\n版本冲突：当前已安装 "+text(preview_->previous->metadata.version)+U"，待安装 "+text(m.version)+U"。\n继续后将替换现有扩展；启用状态和扩展设置会保留。";
   message+=U"\n\n作者："+text(m.author)+U"　版本："+text(m.version)+U"\n标识："+unicodeText(candidate.extension.id)+U"\n\n"+(m.description.empty()?U"此扩展未提供描述。":unicodeText(m.description));
   if(candidate.manifest.HasKey(L"runtime"))message+=U"\n\n原生版尚未接入 Runtime 执行器；安装后该部分功能暂不可用。";
   content(std::move(message));controls();
  }
  if(installation_.valid()&&installation_.wait_for(std::chrono::seconds(0))==std::future_status::ready){installation_.get();busy_=false;installed_=true;closeWindow(nullptr);}
 }catch(const winrt::hresult_error& e){error(winrt::to_string(e.message()));}catch(const std::exception& e){error(e.what());}}
public:
 ExtensionInstallDialog(const PixelFont& f,const Skin& s,const Skin& icons,const std::filesystem::path& path,const std::filesystem::path& directory,std::function<void()> beforeInspection={},std::function<void()> beforeInstallation={}):PixelDialog(s,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(s),path_(path),directory_(directory),beforeInstallation_(std::move(beforeInstallation)){
  setAutoRemap(false);setWantFocus(true);confirm_=new PixelButton(f,s,U"安装",[this]{begin();});cancel_=new PixelButton(f,s,U"取消",[this]{cancel();});close_=new PixelButton(f,s,U"",[this]{cancel();});close_->icon="close";close_->iconSkin=&icons;close_->skinStyle="icon_button";for(auto* button:{confirm_,cancel_,close_})addChild(button);scrollBar_=new PixelScrollBar(s,true);addChild(scrollBar_);scrollBar_->changed=[this](int value){scroll_=value/uiScale;invalidate();};
  inspection_=installationQueue().submit([path,directory,beforeInspection=std::move(beforeInspection)]{if(beforeInspection)beforeInspection();Preview result;result.package=extension::inspectPackage(path);std::filesystem::create_directories(directory);for(auto& existing:extension::RuntimeDirectory::list(directory))if(existing.extension.id==result.package.candidate.extension.id){result.previous=std::move(existing);break;}return result;});controls();timer_.Tick.connect([this]{tick();});timer_.start();
 }
 ~ExtensionInstallDialog(){timer_.stop();if(!parent())setDisplay(nullptr,false);}
 void onBeforeClose(ui::CloseEvent& event)override{if(installation_.valid())event.cancel();else{inspection_={};timer_.stop();}}
 std::string failureText()const{return utf8Text(text_);}
 bool installed()const{return installed_;}bool ready()const{return !busy_;}bool failed()const{return failed_;}bool replaces()const{return preview_&&preview_->previous.has_value();}int lineCount()const{return int(lines_.size());}
 void checkScroll(){if(!scrollBar_->isVisible())throw std::runtime_error("Long description scrollbar hidden");ui::MouseMessage wheel(ui::kMouseWheelMessage,ui::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,bounds().center(),{0,-1});onProcessMessage(&wheel);if(scroll_!=36)throw std::runtime_error("Description wheel scroll failed");scrollBar_->changed(72*uiScale);if(scroll_!=72)throw std::runtime_error("Scrollbar physical coordinate mismatch");scroll_=0;scrollBar_->configure(int(lines_.size())*12*uiScale,body().h*uiScale,0);invalidate();}
 void checkChoose(bool accept){if(accept)begin();else cancel();}
 gfx::Size minimumDialogSize(int)const override{return {240*uiScale,140*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());auto r=bounds();int y=r.y2()-(6+textControlHeight)*uiScale;cancel_->setBounds({r.x2()-66*uiScale,y,60*uiScale,textControlHeight*uiScale});confirm_->setBounds({r.x2()-148*uiScale,y,80*uiScale,textControlHeight*uiScale});layoutHeaderButton(close_);auto b=body();scrollBar_->setBounds({r.x2()-13*uiScale,r.y+DialogLayout::bodyTop*uiScale,7*uiScale,b.h*uiScale});wrap();}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,title_);auto b=body();g.saveClip();g.clipRect(b);int first=scroll_/12;for(int i=first;i<int(lines_.size())&&b.y+i*12-scroll_<b.y2();++i)font_.draw(g,lines_[i],b.x,b.y+i*12-scroll_,skin_["text"]);g.restoreClip();}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyEsc){cancel();return true;}if(key==ui::kKeyEnter){begin();return true;}}if(msg->type()==ui::kMouseWheelMessage){scroll_=std::clamp(scroll_-static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*36,0,std::max(0,int(lines_.size())*12-body().h));scrollBar_->configure(int(lines_.size())*12*uiScale,body().h*uiScale,scroll_*uiScale);invalidate();return true;}return PixelDialog::onProcessMessage(msg);}
};
void place(ExtensionInstallDialog& dialog,ui::Display* display,const gfx::Rect& area){dialog.setDisplay(display,false);const int w=std::min(380*uiScale,area.w),h=std::min(240*uiScale,area.h);auto center=area.center();dialog.setBounds({center.x-w/2,center.y-h/2,w,h});}
}
bool installExtensionPackage(const PixelFont& font,const Skin& skin,const Skin& icons,ui::Display* display,const gfx::Rect& area,const std::filesystem::path& path,const std::filesystem::path& directory,std::function<void()> installed){ExtensionInstallDialog dialog(font,skin,icons,path,directory);place(dialog,display,area);dialog.openWindowInForeground();if(dialog.installed()&&installed)installed();return dialog.installed();}
void checkExtensionInstallDialog(const PixelFont& font,const Skin& skin,const Skin& icons,ui::Display* display,const gfx::Rect& area,const std::filesystem::path& directory){
 std::filesystem::create_directories(directory);std::ofstream(directory/"test-owned.marker")<<"extension install UI fixture";
 auto package=directory/"sample.msext",root=directory/"extensions";
 auto write=[&](const std::string& version){std::string manifest="{\"schemaVersion\":1,\"id\":\"install-ui\",\"name\":\"Package\",\"version\":\""+version+"\",\"description\":\""+std::string(3500,'x')+"\",\"entry\":\"main.lua\"}";project::Bytes m(manifest.begin(),manifest.end()),lua{'r','e','t','u','r','n',' ','1'};auto bytes=project::encodeResourceArchive({{"manifest.json",m},{"main.lua",lua}});std::ofstream out(package,std::ios::binary);out.write(reinterpret_cast<const char*>(bytes.data()),bytes.size());};
 auto run=[&](bool accept,bool fail,bool replacing){ExtensionInstallDialog dialog(font,skin,icons,package,root);place(dialog,display,area);ui::Timer driver(20,&dialog);bool acted=false;int ticks=0,readyTicks=0;driver.Tick.connect([&]{if(++ticks>1500){dialog.checkChoose(false);throw std::runtime_error("Extension install UI timeout");}if(!dialog.ready())return;if(dialog.failed()){if(!fail)throw std::runtime_error("Unexpected installer failure: "+dialog.failureText());acted=true;dialog.checkChoose(false);return;}if(acted)return;if(dialog.replaces()!=replacing)throw std::runtime_error("Extension replacement preview mismatch");if(dialog.lineCount()<30)throw std::runtime_error("Long extension description missing");if(!acted){if(++readyTicks<3)return;dialog.checkScroll();writeSmokeFrame(dialog.display()->nativeSurface().get(),directory/(replacing?"replacement.bmp":"preview.bmp"));acted=true;dialog.checkChoose(accept);}});driver.start();dialog.openWindowInForeground();driver.stop();if(!acted||dialog.installed()!=(accept&&!fail))throw std::runtime_error("Installer choice/result mismatch");};
 write("1");
 // Hold actual inspection before disk access, then cancel via the modal UI.
 // The accepted read may finish later (including an error) without reaching UI.
 for(bool failAfterCancel:{false,true}){
  const auto isolated=directory/(failAfterCancel?"cancel-failure":"cancel-success");std::filesystem::create_directories(isolated);std::ofstream(isolated/"test-owned.marker")<<"cancel inspection fixture";
  auto release=std::make_shared<std::promise<void>>();auto gate=release->get_future().share();struct Release{std::shared_ptr<std::promise<void>> value;~Release(){if(value)try{value->set_value();}catch(...){}}} guard{release};
  auto entered=std::make_shared<std::promise<void>>();auto started=entered->get_future();int ticks=0;bool cancelled=false;auto start=std::chrono::steady_clock::now();
  {
   ExtensionInstallDialog dialog(font,skin,icons,package,isolated,[gate,entered,failAfterCancel]{entered->set_value();gate.wait();if(failAfterCancel)throw std::runtime_error("injected cancelled inspection failure");});place(dialog,display,area);ui::Timer cancelDriver(20,&dialog);
   cancelDriver.Tick.connect([&]{if(++ticks>250)throw std::runtime_error("Held inspection did not start");if(started.wait_for(std::chrono::seconds(0))!=std::future_status::ready||ticks<3)return;cancelled=true;start=std::chrono::steady_clock::now();dialog.checkChoose(false);});cancelDriver.start();dialog.openWindowInForeground();cancelDriver.stop();if(dialog.installed())throw std::runtime_error("Cancelled inspection installed package");
  }
  if(!cancelled||std::chrono::steady_clock::now()-start>std::chrono::milliseconds(250))throw std::runtime_error("Cancelled dialog waited for inspection");
  release->set_value();guard.value.reset();installationQueue().submit([]{return true;}).get();if(std::filesystem::exists(isolated/"install-ui")||std::filesystem::exists(isolated/".state.json"))throw std::runtime_error("Cancelled inspection changed installation");
 }
 // Once accepted, cancel/title/host close cannot interrupt an atomic install.
 {
  const auto isolated=directory/"accepted-install";std::filesystem::create_directories(isolated);std::ofstream(isolated/"test-owned.marker")<<"accepted install fixture";
  auto release=std::make_shared<std::promise<void>>();auto gate=release->get_future().share();struct Release{std::shared_ptr<std::promise<void>> value;~Release(){if(value)try{value->set_value();}catch(...){}}} guard{release};
  auto entered=std::make_shared<std::promise<void>>();auto started=entered->get_future();bool accepted=false,checkedClose=false;int ticks=0,heldTicks=0;
  ExtensionInstallDialog dialog(font,skin,icons,package,isolated,{},[gate,entered]{entered->set_value();gate.wait();});place(dialog,display,area);ui::Timer driver(20,&dialog);
  driver.Tick.connect([&]{if(++ticks>500)throw std::runtime_error("Held accepted install timeout");if(dialog.failed())throw std::runtime_error(dialog.failureText());if(!accepted&&dialog.ready()){accepted=true;dialog.checkChoose(true);return;}if(!accepted||started.wait_for(std::chrono::seconds(0))!=std::future_status::ready||checkedClose)return;
   dialog.checkChoose(false);dialog.closeWindow(nullptr);if(!dialog.parent()||!dialog.isVisible())throw std::runtime_error("Accepted install closed before transaction completion");
   if(++heldTicks<3)return;checkedClose=true;release->set_value();guard.value.reset();
  });driver.start();dialog.openWindowInForeground();driver.stop();if(!checkedClose||!dialog.installed()||extension::RuntimeDirectory::inspect(isolated,"install-ui",false).metadata.version!="1")throw std::runtime_error("Accepted install did not complete after close refusal");
 }
 // Repeated runs own this same ID; use its actual initial state without deleting fixtures.
 bool existing=std::filesystem::exists(root/"install-ui");write("1");run(false,false,existing);run(true,false,existing);
 extension::RuntimeDirectory::setEnabled(root,"install-ui",false);write("2");run(false,false,true);if(extension::RuntimeDirectory::inspect(root,"install-ui",false).metadata.version!="1")throw std::runtime_error("Cancel replaced package");run(true,false,true);if(extension::RuntimeDirectory::inspect(root,"install-ui",false).metadata.version!="2"||extension::RuntimeDirectory::state(root).enabled.at("install-ui"))throw std::runtime_error("Replacement/state retention failed");
 {std::ofstream out(package,std::ios::binary);out<<"broken archive";}run(false,true,false);
 write("3");HANDLE lock=CreateFileW((root/".state.json").c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);if(lock==INVALID_HANDLE_VALUE)throw std::runtime_error("Installer rollback lock failed");try{run(true,true,true);}catch(...){CloseHandle(lock);throw;}CloseHandle(lock);if(extension::RuntimeDirectory::inspect(root,"install-ui",false).metadata.version!="2")throw std::runtime_error("UI failed install lost previous version");
}
}
