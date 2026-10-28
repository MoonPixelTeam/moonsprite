#include "editor_implementation.h"
#include "editor.h"
#include "timelapse_session.h"
#include "timelapse_dialog.h"
#include <atomic>
namespace moon::editor {
namespace {
class RecordingFlushDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::function<bool()> ready_;ui::Timer timer_{16,this};
 void tick(){try{if(!ready_())return;completed=true;}catch(const std::exception& e){failure=e.what();}catch(...){failure="Recording flush failed";}timer_.stop();closeWindow(nullptr);}
public:
 bool completed=false;std::string failure;
 RecordingFlushDialog(const PixelFont& f,const Skin& s,std::function<bool()> ready):PixelDialog(s,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(f),skin_(s),ready_(std::move(ready)){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);timer_.Tick.connect([this]{tick();});timer_.start();
 }
 ~RecordingFlushDialog(){timer_.stop();}
 gfx::Size minimumDialogSize(int)const override{return {300*uiScale,90*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());invalidate();}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"保存绘画过程");font_.draw(g,U"正在保存录像，请稍候。",DialogLayout::inset,DialogLayout::bodyTop,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg)->scancode();if(key==ui::kKeyEsc||key==ui::kKeyEnter)return true;}if(processDialogGeometry(msg))return true;return PixelPopupWindow::onProcessMessage(msg);}
};
class RecordingExportDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;timelapse::Settings settings_;timelapse::Reader reader_;std::function<std::optional<std::vector<std::filesystem::path>>(bool)> paths_;PixelDropdown* format_;PixelEntry* scale_;PixelButton *run_,*cancel_,*close_;std::vector<PixelButton*> presets_;std::vector<int> presetValues_;ExportProtection protection_;std::future<std::size_t> job_;std::shared_ptr<std::atomic<bool>> cancelled_=std::make_shared<std::atomic<bool>>(false);std::shared_ptr<std::atomic<std::size_t>> written_=std::make_shared<std::atomic<std::size_t>>(0);ui::Timer timer_{16,this};bool closing_=false;std::u32string status_;std::filesystem::path pendingLastPath_;
 int currentScale()const{try{std::size_t used=0;const auto value=std::stod(scale_->text(),&used);if(used==scale_->text().size()&&std::isfinite(value))return std::clamp(int(std::floor(std::clamp(value,1.,6400.)+.5)),1,6400);}catch(...){}return 100;}
 int presetRows(int w)const{if(presets_.empty())return 0;int rows=1,x=74;for(auto b:presets_){const int width=std::max(28,font_.measure(b->caption)+12);if(x>74&&x+width>w-DialogLayout::inset){++rows;x=74;}x+=width+DialogLayout::gap;}return rows;}
 int summaryY(int w)const{return DialogLayout::row(2)+DialogLayout::group+(presets_.empty()?0:presetRows(w)*DialogLayout::rowStep-DialogLayout::gap)+DialogLayout::group;}
 void syncPresets(){const auto value=currentScale();for(std::size_t i=0;i<presets_.size();++i){presets_[i]->active=presetValues_[i]==value;presets_[i]->invalidate();}invalidate();}
 void busy(bool value){run_->setEnabled(!value);format_->setEnabled(!value);scale_->setEnabled(!value);for(auto b:presets_)b->setEnabled(!value);}
 void close(){if(job_.valid()){closing_=true;cancelled_->store(true);}else closeWindow(nullptr);}
 void start(){if(job_.valid())return;try{
  if(!scale_->commitExpression())throw std::runtime_error("Invalid export scale");std::size_t used=0;const auto raw=std::stod(scale_->text(),&used);if(used!=scale_->text().size()||!std::isfinite(raw))throw std::runtime_error("Invalid export scale");const int scale=std::clamp(int(std::floor(std::clamp(raw,1.,6400.)+.5)),1,6400);scale_->setText(std::to_string(scale));syncPresets();const bool jpeg=format_->selectedIndex()==1;const auto paths=paths_(jpeg);if(!paths)return;if(paths->empty())throw std::runtime_error("No recording export destinations");
  const auto settings=settings_;const auto reader=reader_;const auto cancelled=cancelled_;const auto written=written_;const auto protection=protection_;completed=false;completedPath.clear();pendingLastPath_=paths->back();cancelled_->store(false);written_->store(0);
  job_=std::async(std::launch::async,[settings,reader,paths=*paths,jpeg,scale,cancelled,written,protection]{return timelapse::writeRecordingSequence(settings,reader,paths,jpeg,scale,[cancelled]{return cancelled->load();},[written](std::size_t count,std::size_t){written->store(count);},protection);});busy(true);
 }catch(const std::exception& e){status_=unicodeText(e.what());invalidate();}}
 void tick(){if(!job_.valid())return;status_=U"已写入 "+unicodeText(std::to_string(written_->load()))+U" / "+unicodeText(std::to_string(settings_.snapshots.size()));if(job_.wait_for(std::chrono::milliseconds(0))==std::future_status::ready){try{const auto count=job_.get();status_=cancelled_->load()?U"已取消；已完成的图片已保留":U"已导出 "+unicodeText(std::to_string(count))+U" 张图片";if(!cancelled_->load()&&count==settings_.snapshots.size()){completed=true;completedPath=pendingLastPath_;}}catch(const std::exception& e){status_=unicodeText(e.what());}busy(false);if(completed||closing_)closeWindow(nullptr);}invalidate();}
public:
 bool completed=false;std::filesystem::path completedPath;
 RecordingExportDialog(const PixelFont& font,const Skin& skin,const Skin& icons,timelapse::Settings settings,timelapse::Reader reader,std::function<std::optional<std::vector<std::filesystem::path>>(bool)> paths,std::vector<int> presets,int defaultScale,ExportProtection protection):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(font),skin_(skin),settings_(std::move(settings)),reader_(std::move(reader)),paths_(std::move(paths)),presetValues_(std::move(presets)),protection_(protection){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);format_=new PixelDropdown(font,skin);format_->setOptions({U"PNG 图片序列",U"JPEG 图片序列"});format_->setSelectedIndex(0);addChild(format_);scale_=new PixelEntry(font,skin);scale_->numeric=true;scale_->suffix=U"%";scale_->setText(std::to_string(std::clamp(defaultScale,1,6400)));addChild(scale_);
  auto button=[&](std::u32string text,std::function<void()> cb){auto b=new PixelButton(font,skin,std::move(text),std::move(cb));addChild(b);return b;};
  for(const auto value:presetValues_)presets_.push_back(button(unicodeText(std::to_string(value))+U"%",[this,value]{scale_->setText(std::to_string(value));syncPresets();}));
  scale_->Change.connect([this]{syncPresets();});run_=button(U"导出",[this]{start();});cancel_=button(U"关闭",[this]{close();});close_=button(U"",[this]{close();});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";timer_.Tick.connect([this]{tick();});timer_.start();syncPresets();
 }
 ~RecordingExportDialog(){cancelled_->store(true);timer_.stop();if(job_.valid())job_.wait();}
 gfx::Size minimumDialogSize(int width)const override{const int w=std::max(390,width/uiScale);return {390*uiScale,DialogLayout::fit(summaryY(w)+3*UiSpacing::labelHeight+2*DialogLayout::gap)*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,gfx::Rect p){c->setBounds(uiPhysical(p).offset(r.origin()));};layoutHeaderButton(close_);place(format_,{74,DialogLayout::row(),w-80,textControlHeight});place(scale_,{74,DialogLayout::row(1),w-80,textControlHeight});int x=74,y=DialogLayout::row(2)+DialogLayout::group;for(auto b:presets_){const int width=std::max(28,font_.measure(b->caption)+12);if(x>74&&x+width>w-DialogLayout::inset){x=74;y+=DialogLayout::rowStep;}place(b,{x,y,width,textControlHeight});x+=width+DialogLayout::gap;}place(cancel_,{w-120,DialogLayout::footer(h),55,textControlHeight});place(run_,{w-63,DialogLayout::footer(h),57,textControlHeight});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"导出缩时录像");font_.draw(g,U"格式",DialogLayout::inset,DialogLayout::row()+5,skin_["text"]);font_.draw(g,U"缩放",DialogLayout::inset,DialogLayout::row(1)+5,skin_["text"]);const auto size=timelapse::imageOutputDimensions(settings_.snapshots,currentScale());const int y=summaryY(r.w);font_.draw(g,U"输出尺寸："+unicodeText(std::to_string(size.width))+U" × "+unicodeText(std::to_string(size.height)),DialogLayout::inset,y,skin_["text"]);font_.draw(g,U"已捕获帧："+unicodeText(std::to_string(settings_.snapshots.size())),DialogLayout::inset,y+UiSpacing::labelHeight+DialogLayout::gap,skin_["text"]);font_.draw(g,status_,DialogLayout::inset,y+2*(UiSpacing::labelHeight+DialogLayout::gap),skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){close();return true;}return PixelPopupWindow::onProcessMessage(msg);}
};class RecordingPortabilityDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;PixelButton *local_,*portable_,*cancel_,*close_;
public:int choice=0;
 RecordingPortabilityDialog(const PixelFont& f,const Skin& s,const Skin& icons):PixelDialog(s,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(f),skin_(s){setAutoRemap(false);setWantFocus(true);auto button=[&](std::u32string text,int value){auto b=new PixelButton(f,s,std::move(text),[this,value]{choice=value;closeWindow(nullptr);});addChild(b);return b;};local_=button(U"仅引用本机录像",1);portable_=button(U"携带缩时录像",2);cancel_=button(U"取消",0);close_=button(U"",0);close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";}
 gfx::Size minimumDialogSize(int)const override{return {390*uiScale,140*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,gfx::Rect p){c->setBounds(uiPhysical(p).offset(r.origin()));};layoutHeaderButton(close_);place(local_,{6,DialogLayout::footer(h),132,20});place(portable_,{140,DialogLayout::footer(h),122,20});place(cancel_,{w-61,DialogLayout::footer(h),55,20});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"另存为：携带缩时录像");font_.draw(g,U"普通保存引用本机录像库。分享或换电脑时请选择携带录像。",6,DialogLayout::bodyTop,skin_["text"]);font_.draw(g,U"携带录像会增加工程体积和保存时间。",6,DialogLayout::bodyTop+16,skin_["muted"]);}
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(msg);}
};
}
void Editor::timelapseTick(){
 auto process=[this](Document& d){if(auto session=d.recordingSession()){session->playback=&d==&document&&playing_;session->poll(d);if(!session->error.empty()&&session->error!=timelapseLastError_){timelapseLastError_=session->error;status_=U"缩时录像："+unicodeText(session->error);invalidate();}}};
 if(documentOpen_)process(document);for(auto& project:projects_)if(project->stored)process(*project->stored);
}
bool Editor::flushTimelapse(){
 try{
  auto session=document.recordingSession();if(!session)return true;
  if(smoke_||!display()){session->flush(document);return true;}
  session->beginFlush(document);if(session->flushReady(document))return true;
  const auto identity=document.identity();
  RecordingFlushDialog popup(font_,skin_,[this,session,identity]{if(document.identity()!=identity)throw std::runtime_error("Recording project changed during flush");return session->flushReady(document);});
  popup.setDisplay(display(),false);const auto r=bounds();const auto size=popup.minimumDialogSize(0);popup.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});
  const auto previous=pending_;struct RestorePending{Pending& target;Pending value;~RestorePending(){target=value;}} restore{pending_,previous};pending_=Pending::Timelapse;
  popup.openWindowInForeground();
  if(!popup.failure.empty())throw std::runtime_error(popup.failure);
  if(!popup.completed)throw std::runtime_error("Recording flush did not complete");
  return true;
 }catch(const std::exception& e){status_=U"缩时录像未能保存："+unicodeText(e.what());invalidate();return false;}
}
void Editor::showTimelapse(){
 if(pending_!=Pending::None||!documentOpen_||homeOpen_)return;if(!flushTimelapse())return;
 auto session=timelapse::ensureRecordingSession(document,smoke_?assets_.parent_path()/("timelapse-smoke-owned-"+std::to_string(GetCurrentProcessId())):timelapse::executableLibraryRoot(),smoke_?std::filesystem::path{}:timelapse::legacyLibraryRoot());
 TimelapseDialog popup(font_,skin_,toolIcons_,document.mutableTimelapseSettings(),session->reader(),[this,session]{session->settingsChanged(document);},[this,session]{session->clear(document);},[this]{exportTimelapseImages();});popup.setDisplay(display(),false);auto r=bounds();const int width=420*uiScale,height=525*uiScale;popup.setBounds({r.center().x-width/2,r.center().y-height/2,width,height});
 auto previous=pending_;pending_=Pending::Timelapse;popup.openWindowInForeground();pending_=previous;requestFocus();refresh();
}
void Editor::exportTimelapseImages(){
 if(!flushTimelapse())return;auto session=document.recordingSession();if(!session||document.timelapseSettings().snapshots.empty())return;
 const auto identity=document.identity();const auto settings=document.timelapseSettings();
 RecordingExportDialog popup(font_,skin_,toolIcons_,settings,session->reader(),[this,identity,count=settings.snapshots.size()](bool jpeg)->std::optional<std::vector<std::filesystem::path>>{
  if(document.identity()!=identity)throw std::runtime_error("Recording project changed during export");std::filesystem::path initial=std::filesystem::path(document.name()+U"-timelapse");initial.replace_extension(jpeg?L".jpg":L".png");wchar_t filename[32768]{};wcsncpy_s(filename,initial.c_str(),_TRUNCATE);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=jpeg?L"JPEG 图片序列\0*.jpg\0\0":L"PNG 图片序列\0*.png\0\0";dialog.lpstrDefExt=jpeg?L"jpg":L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST;const auto preferred=preferredExportDirectory().wstring();dialog.lpstrInitialDir=preferred.empty()?nullptr:preferred.c_str();
  if(!chooseSaveFile_(&dialog)){if(CommDlgExtendedError())throw std::runtime_error("Cannot select recording export location");return std::nullopt;}
  const std::filesystem::path selected=filename;return planFrameSequencePaths(selected.parent_path(),selected.stem().u32string(),count,[this](const auto& path,const auto& suggested){return framePngConflict(path,suggested);},jpeg?FrameSequenceFormat::Jpeg:FrameSequenceFormat::Png);
 },runtimePreferences_.exportScales,runtimePreferences_.defaultExportScale(),ExportProtection(runtimePreferences_.index("files.exportProtection.Select")));popup.setDisplay(display(),false);const auto r=bounds();const auto size=popup.minimumDialogSize(0);popup.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});popup.openWindowInForeground();if(popup.completed){rememberSuccessfulExport(popup.completedPath);recordRecentExportPath(popup.completedPath);status_=U"缩时图片序列已导出";}
}
int Editor::chooseTimelapsePortability(){RecordingPortabilityDialog popup(font_,skin_,toolIcons_);popup.setDisplay(display(),false);const auto r=bounds();const auto size=popup.minimumDialogSize(0);popup.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});popup.openWindowInForeground();return popup.choice;}
}
