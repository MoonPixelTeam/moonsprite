#include "editor_implementation.h"
#include "extension_install_dialog.h"
#include "extension_package.h"
#include "extension_localization.h"
#include "lua_script_service.h"
#include "project_zip_writer.h"
#include <future>
namespace moon::editor { namespace {
struct Preview {extension::PackageInspection package;std::optional<extension::RuntimeCandidate> previous;};
class ExtensionInstallDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::filesystem::path path_,directory_;
 PixelButton *confirm_,*cancel_,*close_;PixelScrollBar* scrollBar_;ui::Timer timer_{20,this};
 std::future<Preview> inspection_;std::future<std::string> installation_;std::optional<Preview> preview_;
 std::u32string title_=U"安装扩展",text_=U"正在检查扩展包…";std::vector<std::u32string> lines_;int wrapWidth_=-1,scroll_=0;
 bool busy_=true,cancelling_=false,installed_=false,failed_=false;
 gfx::Rect body()const{auto r=uiLogical(clientBounds());return {r.x+6,r.y+DialogLayout::bodyTop,std::max(1,r.w-22),std::max(12,r.h-DialogLayout::bodyTop-textControlHeight-12)};}
 void wrap(){const int width=body().w;if(width==wrapWidth_)return;wrapWidth_=width;lines_.clear();std::u32string line;int advance=0;for(auto c:text_){if(c==U'\n'){lines_.push_back(std::move(line));line.clear();advance=0;continue;}int glyph=font_.measure(std::u32string(1,c));if(advance+glyph>width&&!line.empty()){lines_.push_back(std::move(line));line.clear();advance=0;}line+=c;advance+=glyph;}lines_.push_back(std::move(line));scroll_=std::clamp(scroll_,0,std::max(0,int(lines_.size())*12-body().h));scrollBar_->configure(int(lines_.size())*12*uiScale,body().h*uiScale,scroll_*uiScale);scrollBar_->setVisible(int(lines_.size())*12>body().h);}
 void content(std::u32string value){text_=std::move(value);wrapWidth_=-1;scroll_=0;wrap();invalidate();}
 void controls(){confirm_->setEnabled(!busy_&&preview_.has_value()&&!failed_);cancel_->setEnabled(!installation_.valid());close_->setEnabled(!installation_.valid());cancel_->caption=cancelling_?U"正在取消…":failed_?U"关闭":U"取消";invalidate();}
 void cancel(){if(installation_.valid())return;if(inspection_.valid()){cancelling_=true;controls();return;}closeWindow(nullptr);}
 void error(const std::string& value){busy_=false;failed_=true;content(U"扩展安装失败："+unicodeText(value));controls();}
 void begin(){if(busy_||failed_||!preview_)return;try{busy_=true;controls();content(U"正在安装扩展，请稍候…");auto package=std::move(preview_->package);installation_=std::async(std::launch::async,[package=std::move(package),directory=directory_]()mutable{winrt::init_apartment(winrt::apartment_type::multi_threaded);struct Apartment{~Apartment(){winrt::uninit_apartment();}} apartment;auto result=extension::installInspectedPackage(package,directory);return result.extension.id;});controls();}catch(const std::exception& e){error(e.what());}}
 void tick(){try{
  if(inspection_.valid()&&inspection_.wait_for(std::chrono::seconds(0))==std::future_status::ready){preview_=inspection_.get();if(cancelling_){closeWindow(nullptr);return;}busy_=false;auto candidate=extension::localizedCandidate(preview_->package.candidate,"zh-CN");auto& m=candidate.metadata;auto text=[](const std::string& s){return unicodeText(s.empty()?"未提供":s);};const bool replaces=preview_->previous.has_value();title_=replaces?U"扩展版本冲突":U"安装扩展";confirm_->caption=replaces?U"替换安装":U"安装";
   std::u32string message=replaces?U"“"+text(m.name)+U"”已安装，是否替换为待安装版本？":U"是否安装“"+text(m.name)+U"”？";
   if(replaces)message+=U"\n\n版本冲突：当前已安装 "+text(preview_->previous->metadata.version)+U"，待安装 "+text(m.version)+U"。\n继续后将替换现有扩展；启用状态和扩展设置会保留。";
   message+=U"\n\n作者："+text(m.author)+U"　版本："+text(m.version)+U"\n标识："+unicodeText(candidate.extension.id)+U"\n\n"+(m.description.empty()?U"此扩展未提供描述。":unicodeText(m.description));
   if(candidate.manifest.HasKey(L"runtime"))message+=U"\n\n原生版尚未接入 Runtime 执行器；安装后该部分功能暂不可用。";
   content(std::move(message));controls();
  }
  if(installation_.valid()&&installation_.wait_for(std::chrono::seconds(0))==std::future_status::ready){installation_.get();busy_=false;installed_=true;closeWindow(nullptr);}
 }catch(const winrt::hresult_error& e){if(cancelling_)closeWindow(nullptr);else error(winrt::to_string(e.message()));}catch(const std::exception& e){if(cancelling_)closeWindow(nullptr);else error(e.what());}}
public:
 ExtensionInstallDialog(const PixelFont& f,const Skin& s,const Skin& icons,const std::filesystem::path& path,const std::filesystem::path& directory):PixelDialog(s,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(s),path_(path),directory_(directory){
  setAutoRemap(false);setWantFocus(true);confirm_=new PixelButton(f,s,U"安装",[this]{begin();});cancel_=new PixelButton(f,s,U"取消",[this]{cancel();});close_=new PixelButton(f,s,U"",[this]{cancel();});close_->icon="close";close_->iconSkin=&icons;close_->skinStyle="icon_button";for(auto* button:{confirm_,cancel_,close_})addChild(button);scrollBar_=new PixelScrollBar(s,true);addChild(scrollBar_);scrollBar_->changed=[this](int value){scroll_=value/uiScale;invalidate();};
  inspection_=std::async(std::launch::async,[path,directory]{winrt::init_apartment(winrt::apartment_type::multi_threaded);struct Apartment{~Apartment(){winrt::uninit_apartment();}} apartment;Preview result;result.package=extension::inspectPackage(path);std::filesystem::create_directories(directory);for(auto& existing:extension::RuntimeDirectory::list(directory))if(existing.extension.id==result.package.candidate.extension.id){result.previous=std::move(existing);break;}return result;});controls();timer_.Tick.connect([this]{tick();});timer_.start();
 }
 ~ExtensionInstallDialog(){timer_.stop();}
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
 auto run=[&](bool accept,bool fail,bool replacing){ExtensionInstallDialog dialog(font,skin,icons,package,root);place(dialog,display,area);ui::Timer driver(20,&dialog);bool acted=false;int ticks=0,readyTicks=0;driver.Tick.connect([&]{if(++ticks>1500){dialog.checkChoose(false);throw std::runtime_error("Extension install UI timeout");}if(!dialog.ready())return;if(dialog.failed()){if(!fail)throw std::runtime_error("Unexpected installer failure");acted=true;dialog.checkChoose(false);return;}if(acted)return;if(dialog.replaces()!=replacing)throw std::runtime_error("Extension replacement preview mismatch");if(dialog.lineCount()<30)throw std::runtime_error("Long extension description missing");if(!acted){if(++readyTicks<3)return;dialog.checkScroll();writeSmokeFrame(dialog.display()->nativeSurface().get(),directory/(replacing?"replacement.bmp":"preview.bmp"));acted=true;dialog.checkChoose(accept);}});driver.start();dialog.openWindowInForeground();driver.stop();if(!acted||dialog.installed()!=(accept&&!fail))throw std::runtime_error("Installer choice/result mismatch");};
 // Repeated runs own this same ID; use its actual initial state without deleting fixtures.
 bool existing=std::filesystem::exists(root/"install-ui");write("1");run(false,false,existing);run(true,false,existing);
 extension::RuntimeDirectory::setEnabled(root,"install-ui",false);write("2");run(false,false,true);if(extension::RuntimeDirectory::inspect(root,"install-ui",false).metadata.version!="1")throw std::runtime_error("Cancel replaced package");run(true,false,true);if(extension::RuntimeDirectory::inspect(root,"install-ui",false).metadata.version!="2"||extension::RuntimeDirectory::state(root).enabled.at("install-ui"))throw std::runtime_error("Replacement/state retention failed");
 {std::ofstream out(package,std::ios::binary);out<<"broken archive";}run(false,true,false);
 write("3");HANDLE lock=CreateFileW((root/".state.json").c_str(),GENERIC_READ,FILE_SHARE_READ,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr);if(lock==INVALID_HANDLE_VALUE)throw std::runtime_error("Installer rollback lock failed");try{run(true,true,true);}catch(...){CloseHandle(lock);throw;}CloseHandle(lock);if(extension::RuntimeDirectory::inspect(root,"install-ui",false).metadata.version!="2")throw std::runtime_error("UI failed install lost previous version");
}
}
