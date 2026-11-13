#include "editor.h"
#include "timelapse_session.h"
#include "timelapse_dialog.h"
#include "timelapse_video.h"
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
enum RecordingFormat {RecordingMp4,RecordingWebm,RecordingPng,RecordingJpeg};
std::u32string recordingExtension(int format){return format==RecordingMp4?U".mp4":format==RecordingWebm?U".webm":format==RecordingJpeg?U".jpg":U".png";}
std::u32string recordingFormatName(std::u32string name,int format){const auto dot=name.find_last_of(U'.');if(dot!=std::u32string::npos){auto extension=name.substr(dot+1);for(auto& c:extension)if(c>=U'A'&&c<=U'Z')c+=32;for(auto value:{U"mp4",U"webm",U"png",U"jpg",U"jpeg"})if(extension==value){name.resize(dot);break;}}return name+recordingExtension(format);}
std::u32string recordingOutputStem(std::u32string name,const std::u32string& fallback){const auto dot=name.find_last_of(U'.');if(dot!=std::u32string::npos){auto extension=name.substr(dot+1);for(auto& c:extension)if(c>=U'A'&&c<=U'Z')c+=32;if(extension==U"mp4"||extension==U"webm")name.resize(dot);}return framePngExportStem(std::move(name),fallback);}
class RecordingExportDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;timelapse::Settings settings_;timelapse::Reader reader_;std::function<timelapse::Settings()> prepare_;
 std::function<std::optional<std::vector<std::filesystem::path>>(int,const std::filesystem::path&)> paths_;
 std::function<std::optional<std::filesystem::path>(int,const std::filesystem::path&)> choose_;
 std::filesystem::path directory_;std::u32string fallbackName_;PixelDropdown *format_,*quality_,*mode_;PixelEntry *scale_,*name_,*duration_,*speed_;PixelButton *run_,*cancel_,*close_,*browse_;bool selecting_=false;
 std::vector<PixelButton*> presets_;std::vector<int> presetValues_;ExportProtection protection_;std::future<bool> job_;
 std::shared_ptr<std::atomic<bool>> cancelled_=std::make_shared<std::atomic<bool>>(false);
 std::shared_ptr<std::atomic<std::size_t>> written_=std::make_shared<std::atomic<std::size_t>>(0),total_=std::make_shared<std::atomic<std::size_t>>(0);
 ui::Timer timer_{16,this};bool closing_=false;std::u32string status_;std::filesystem::path pendingLastPath_;
 bool video()const{return format_->selectedIndex()<RecordingPng;}
 int numeric(PixelEntry* entry,int fallback,int minimum,int maximum)const{try{std::size_t used=0;const auto raw=std::stod(entry->text(),&used);if(used==entry->text().size()&&std::isfinite(raw))return int(std::floor(std::clamp(raw,double(minimum),double(maximum))+.5));}catch(...){}return fallback;}
 double durationValue()const{try{std::size_t used=0;const double value=std::stod(duration_->text(),&used);if(used==duration_->text().size()&&std::isfinite(value))return std::clamp(value,1.,3600.);}catch(...){}return 1.;}
 int currentScale()const{return numeric(scale_,100,1,6400);}
 int fieldLeft()const{return DialogLayout::inset+font_.measure(U"视频尺寸与画质")+DialogLayout::gap;}
 int presetRows(int w)const{if(presets_.empty())return 0;int rows=1,x=fieldLeft();for(auto b:presets_){const int width=std::max(28,font_.measure(b->caption)+12);if(x>fieldLeft()&&x+width>w-DialogLayout::inset){++rows;x=fieldLeft();}x+=width+DialogLayout::gap;}return rows;}
 int summaryY(int w)const{return video()?DialogLayout::row(6)+DialogLayout::group:DialogLayout::row(4)+DialogLayout::group+(presets_.empty()?0:presetRows(w)*DialogLayout::rowStep-DialogLayout::gap)+DialogLayout::group;}
 timelapse::Settings outputSettings()const{auto result=settings_;result.quality=timelapse::Quality(quality_->selectedIndex());result.speed=numeric(speed_,result.speed,1,64);return result;}
 timelapse::VideoOptions videoOptions()const{return {mode_->selectedIndex()==0,durationValue()};}
 void syncPresets(){const auto value=currentScale();for(std::size_t i=0;i<presets_.size();++i){presets_[i]->active=presetValues_[i]==value;presets_[i]->invalidate();}invalidate();}
 void syncQuality(){std::vector<std::u32string> labels;for(int i=0;i<3;++i){const auto g=timelapse::videoGeometry(settings_.snapshots,timelapse::Quality(i));labels.push_back((i==0?U"轻量":i==1?U"标准":U"高清")+std::u32string(U" - ")+unicodeText(std::to_string(g.scale))+U"× - "+unicodeText(std::to_string(g.width))+U" × "+unicodeText(std::to_string(g.height)));}const auto selected=quality_->selectedIndex();quality_->setOptions(std::move(labels));quality_->setSelectedIndex(selected<0?int(settings_.quality):selected);}
 void syncMode(bool resize){const bool v=video();quality_->setVisible(v);mode_->setVisible(v);duration_->setVisible(v&&mode_->selectedIndex()==0);speed_->setVisible(v&&mode_->selectedIndex()==1);scale_->setVisible(!v);for(auto b:presets_)b->setVisible(!v);if(resize){auto r=bounds();r.h=minimumDialogSize(r.w).h;setBounds(r);}invalidate();}
 void busy(bool value){for(auto w:std::vector<ui::Widget*>{run_,format_,quality_,mode_,scale_,name_,browse_,duration_,speed_})w->setEnabled(!value);for(auto b:presets_)b->setEnabled(!value);cancel_->caption=value?U"取消":U"关闭";cancel_->invalidate();if(value)cancel_->requestFocus();else run_->requestFocus();}
 void close(){if(selecting_)return;if(job_.valid()){closing_=true;cancelled_->store(true);}else closeWindow(nullptr);}
 std::filesystem::path destination()const{return directory_/std::filesystem::path(recordingOutputStem(unicodeText(name_->text()),fallbackName_)+recordingExtension(format_->selectedIndex()));}
 bool chooseLocation(){if(selecting_||job_.valid())return false;selecting_=true;struct Reset{bool& value;~Reset(){value=false;}} reset{selecting_};const auto chosen=choose_(format_->selectedIndex(),destination());if(!chosen)return false;directory_=chosen->parent_path();name_->setText(chosen->filename().u8string());invalidate();return true;}
 void start(){if(job_.valid()||selecting_)return;try{
  const bool v=video();
  auto validate=[&](PixelEntry* entry,int fallback,int minimum,int maximum){if(!entry->commitExpression())throw std::runtime_error("Invalid recording export value");std::size_t used=0;const auto raw=std::stod(entry->text(),&used);if(used!=entry->text().size()||!std::isfinite(raw))throw std::runtime_error("Invalid recording export value");entry->setText(std::to_string(numeric(entry,fallback,minimum,maximum)));};
  if(v){if(mode_->selectedIndex()==0){if(!duration_->commitExpression())throw std::runtime_error("Invalid video duration");std::size_t used=0;const double raw=std::stod(duration_->text(),&used);if(used!=duration_->text().size()||!std::isfinite(raw))throw std::runtime_error("Invalid video duration");std::ostringstream text;text<<std::setprecision(15)<<durationValue();duration_->setText(text.str());}else validate(speed_,settings_.speed,1,64);}else{validate(scale_,100,1,6400);syncPresets();}
  if(directory_.empty()&&!chooseLocation())return;
  selecting_=true;std::optional<std::vector<std::filesystem::path>> paths;try{settings_=prepare_();syncQuality();paths=paths_(format_->selectedIndex(),destination());}catch(...){selecting_=false;throw;}selecting_=false;if(!paths)return;if(paths->empty())throw std::runtime_error("No recording export destinations");
  auto settings=outputSettings();const auto options=videoOptions();const auto reader=reader_;const auto cancelled=cancelled_;const auto written=written_;const auto total=total_;const auto protection=protection_;const auto scale=currentScale();const bool jpeg=format_->selectedIndex()==RecordingJpeg;const bool webm=format_->selectedIndex()==RecordingWebm;
  completed=false;completedPath.clear();pendingLastPath_=paths->back();cancelled_->store(false);written_->store(0);total_->store(v?timelapse::videoFrameCount(settings,options):settings.snapshots.size());
  job_=std::async(std::launch::async,[settings=std::move(settings),options,reader,paths=*paths,v,webm,jpeg,scale,cancelled,written,total,protection]{auto stop=[cancelled]{return cancelled->load();};auto progress=[written,total](std::size_t count,std::size_t size){written->store(count);total->store(size);};if(v)return webm?timelapse::writeRecordingWebm(settings,reader,paths.front(),options,stop,progress):timelapse::writeRecordingMp4(settings,reader,paths.front(),options,stop,progress);return timelapse::writeRecordingSequence(settings,reader,paths,jpeg,scale,stop,progress,protection)==settings.snapshots.size();});busy(true);
 }catch(const std::exception& e){status_=unicodeText(e.what());invalidate();}}
 void tick(){if(!job_.valid())return;status_=(video()?U"正在编码 ":U"已写入 ")+unicodeText(std::to_string(written_->load()))+U" / "+unicodeText(std::to_string(total_->load()));if(job_.wait_for(std::chrono::milliseconds(0))==std::future_status::ready){try{const bool success=job_.get();status_=success?(video()?U"缩时视频已导出":U"缩时图片已导出"):U"已取消导出";if(success){completed=true;completedPath=pendingLastPath_;}}catch(const std::exception& e){status_=unicodeText(e.what());}busy(false);if(completed||closing_)closeWindow(nullptr);}invalidate();}
public:
 bool completed=false;std::filesystem::path completedPath;
 RecordingExportDialog(const PixelFont& font,const Skin& skin,const Skin& icons,timelapse::Settings settings,timelapse::Reader reader,std::function<std::optional<std::vector<std::filesystem::path>>(int,const std::filesystem::path&)> paths,std::function<std::optional<std::filesystem::path>(int,const std::filesystem::path&)> choose,std::filesystem::path initial,std::vector<int> presets,int defaultScale,ExportProtection protection,std::function<timelapse::Settings()> prepare):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(font),skin_(skin),settings_(std::move(settings)),reader_(std::move(reader)),prepare_(std::move(prepare)),paths_(std::move(paths)),choose_(std::move(choose)),directory_(initial.parent_path()),fallbackName_(framePngExportStem(initial.filename().u32string())),presetValues_(std::move(presets)),protection_(protection){
  setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);
  auto dropdown=[&]{auto d=new PixelDropdown(font,skin);addChild(d);return d;};auto entry=[&](std::string text,bool number){auto e=new PixelEntry(font,skin);e->numeric=number;e->setText(text);addChild(e);return e;};auto button=[&](std::u32string text,std::function<void()> cb){auto b=new PixelButton(font,skin,std::move(text),std::move(cb));addChild(b);return b;};
  format_=dropdown();format_->setOptions({U"MP4",U"WebM",U"PNG 图片序列",U"JPEG 图片序列"});format_->optionEnabled=[](int i){return i>=RecordingMp4&&i<=RecordingJpeg;};format_->setSelectedIndex(RecordingMp4);
  name_=entry(utf8Text(recordingFormatName(initial.filename().u32string(),RecordingMp4)),false);
  quality_=dropdown();syncQuality();mode_=dropdown();mode_->setOptions({U"按选择时长导出",U"按选择倍率导出"});mode_->setSelectedIndex(0);
  const int seconds=std::clamp(int(std::floor(settings_.snapshots.size()/double(std::clamp(settings_.fps,1,60))/std::clamp(settings_.speed,1,64)+.5)),1,3600);
  duration_=entry(std::to_string(seconds),true);duration_->suffix=U"s";speed_=entry(std::to_string(settings_.speed),true);speed_->suffix=U"x";scale_=entry(std::to_string(std::clamp(defaultScale,1,6400)),true);scale_->suffix=U"%";
  for(auto value:presetValues_)presets_.push_back(button(unicodeText(std::to_string(value))+U"%",[this,value]{scale_->setText(std::to_string(value));syncPresets();}));
  browse_=button(U"",[this]{try{chooseLocation();}catch(const std::exception& e){status_=unicodeText(e.what());invalidate();}});browse_->iconSkin=&icons;browse_->icon="folderOpen";browse_->skinStyle="icon_button";
  format_->changed=[this](int i){name_->setText(utf8Text(recordingFormatName(unicodeText(name_->text()),i)));status_.clear();syncMode(true);};mode_->changed=[this](int){syncMode(true);};quality_->changed=[this](int){invalidate();};scale_->Change.connect([this]{syncPresets();});duration_->Change.connect([this]{invalidate();});speed_->Change.connect([this]{invalidate();});
  run_=button(U"导出",[this]{start();});cancel_=button(U"关闭",[this]{close();});close_=button(U"",[this]{close();});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";timer_.Tick.connect([this]{tick();});timer_.start();syncPresets();syncMode(false);
 }
 ~RecordingExportDialog(){cancelled_->store(true);timer_.stop();if(job_.valid())job_.wait();}
 gfx::Size minimumDialogSize(int width)const override{const int w=std::max(420,width/uiScale);return {420*uiScale,DialogLayout::fit(summaryY(w)+(video()?5:3)*(UiSpacing::labelHeight+DialogLayout::gap))*uiScale};}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();const int w=r.w/uiScale,h=r.h/uiScale;auto place=[&](ui::Widget* c,gfx::Rect p){c->setBounds(uiPhysical(p).offset(r.origin()));};layoutHeaderButton(close_);place(name_,{fieldLeft(),DialogLayout::row(),w-fieldLeft()-23,textControlHeight});place(browse_,{w-21,DialogLayout::row()+2,15,15});place(format_,{fieldLeft(),DialogLayout::row(2),w-fieldLeft()-DialogLayout::inset,textControlHeight});for(auto c:std::vector<ui::Widget*>{scale_,quality_})place(c,{fieldLeft(),DialogLayout::row(3),w-fieldLeft()-DialogLayout::inset,textControlHeight});place(mode_,{fieldLeft(),DialogLayout::row(4),w-fieldLeft()-DialogLayout::inset,textControlHeight});for(auto c:{duration_,speed_})place(c,{fieldLeft(),DialogLayout::row(5),w-fieldLeft()-DialogLayout::inset,textControlHeight});int x=fieldLeft(),y=DialogLayout::row(4)+DialogLayout::group;for(auto b:presets_){const int width=std::max(28,font_.measure(b->caption)+12);if(x>fieldLeft()&&x+width>w-DialogLayout::inset){x=fieldLeft();y+=DialogLayout::rowStep;}place(b,{x,y,width,textControlHeight});x+=width+DialogLayout::gap;}place(cancel_,{w-120,DialogLayout::footer(h),55,textControlHeight});place(run_,{w-63,DialogLayout::footer(h),57,textControlHeight});}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"导出缩时录像");auto label=[&](std::u32string text,int row){font_.draw(g,text,DialogLayout::inset,DialogLayout::row(row)+5,skin_["text"]);};label(U"文件名",0);g.saveClip();g.clipRect({DialogLayout::inset,DialogLayout::row(1),r.w-2*DialogLayout::inset,UiSpacing::labelHeight});font_.draw(g,U"所选目录："+directory_.u32string(),DialogLayout::inset,DialogLayout::row(1),skin_["muted"]);g.restoreClip();label(U"格式",2);label(video()?U"视频尺寸与画质":U"缩放",3);if(video()){label(U"导出方式",4);label(mode_->selectedIndex()==0?U"最终视频时长":U"缩时倍速",5);}
  const auto geometry=timelapse::videoGeometry(settings_.snapshots,timelapse::Quality(quality_->selectedIndex()));const auto size=video()?timelapse::Dimensions{geometry.width,geometry.height}:timelapse::imageOutputDimensions(settings_.snapshots,currentScale());int y=summaryY(r.w);auto line=[&](std::u32string text){font_.draw(g,text,DialogLayout::inset,y,skin_["text"]);y+=UiSpacing::labelHeight+DialogLayout::gap;};line(U"输出尺寸："+unicodeText(std::to_string(size.width))+U" × "+unicodeText(std::to_string(size.height)));line(U"已捕获帧："+unicodeText(std::to_string(settings_.snapshots.size())));
  if(video()){const auto options=videoOptions();const double seconds=timelapse::videoFrameCount(settings_.snapshots.size(),settings_.fps,numeric(speed_,settings_.speed,1,64),options)/double(std::clamp(settings_.fps,1,60));auto decimal=[](double value){return unicodeText(std::to_string(int(std::floor(value*10+.5))/10))+U"."+unicodeText(std::to_string(int(std::floor(value*10+.5))%10));};line(U"预计时长："+decimal(seconds)+U" s");line(U"实际播放速度："+decimal(seconds>0?settings_.snapshots.size()/double(settings_.fps)/seconds:settings_.speed)+U"x");}line(status_);
 }
 bool onProcessMessage(ui::Message* msg)override{if(processDialogGeometry(msg))return true;if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){close();return true;}return PixelPopupWindow::onProcessMessage(msg);}
};
class RecordingPortabilityDialog final:public PixelDialog {
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
 auto process=[this](Document& d){if(auto session=d.recordingSession()){session->playback=&d==&currentDocument()&&currentPlayback().playing;session->poll(d);if(!session->error.empty()&&session->error!=timelapseLastError_){timelapseLastError_=session->error;status_=U"缩时录像："+unicodeText(session->error);invalidate();}}};
 if(documentOpen_)process(currentDocument());for(auto& project:projects_)if(project->value)process(*project->value);
}
bool Editor::flushTimelapse(){
 try{
  auto session=currentDocument().recordingSession();if(!session)return true;
  if(smoke_||!display()){session->flush(currentDocument());return true;}
  session->beginFlush(currentDocument());if(session->flushReady(currentDocument()))return true;
  const auto identity=currentDocument().identity();
  RecordingFlushDialog popup(font_,skin_,[this,session,identity]{if(currentDocument().identity()!=identity)throw std::runtime_error("Recording project changed during flush");return session->flushReady(currentDocument());});
  popup.setDisplay(display(),false);const auto r=bounds();const auto size=popup.minimumDialogSize(0);popup.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});
  const auto previous=pending_;struct RestorePending{Pending& target;Pending value;~RestorePending(){target=value;}} restore{pending_,previous};pending_=Pending::Timelapse;
  popup.openWindowInForeground();
  if(!popup.failure.empty())throw std::runtime_error(popup.failure);
  if(!popup.completed)throw std::runtime_error("Recording flush did not complete");
  return true;
 }catch(const std::exception& e){status_=U"缩时录像未能保存："+unicodeText(e.what());invalidate();return false;}
}
void Editor::showTimelapse(){
 if(pending_!=Pending::None||!documentOpen_||homeOpen_)return;
 auto session=timelapse::ensureRecordingSession(currentDocument(),smoke_?assets_.parent_path()/("timelapse-smoke-owned-"+std::to_string(GetCurrentProcessId())):timelapse::executableLibraryRoot(),smoke_?std::filesystem::path{}:timelapse::legacyLibraryRoot());
 TimelapseDialog popup(font_,skin_,toolIcons_,currentDocument().mutableTimelapseSettings(),session->reader(),[this,session]{session->settingsChanged(currentDocument());},[this,session]{session->clear(currentDocument());},[this]{exportTimelapseImages();});popup.setPreviewCheckerboard(checkerboard_);popup.setDisplay(display(),false);auto r=bounds();const int width=420*uiScale,height=525*uiScale;popup.setBounds({r.center().x-width/2,r.center().y-height/2,width,height});
 auto previous=pending_;pending_=Pending::Timelapse;popup.openWindowInForeground();pending_=previous;requestFocus();refresh();
}
void Editor::exportTimelapseImages(){
 auto session=currentDocument().recordingSession();if(!session||currentDocument().timelapseSettings().snapshots.empty())return;
 const auto identity=currentDocument().identity();auto settings=currentDocument().timelapseSettings();
 RecordingExportDialog popup(font_,skin_,toolIcons_,std::move(settings),session->reader(),[this,identity](int format,const std::filesystem::path& selected)->std::optional<std::vector<std::filesystem::path>>{
  if(currentDocument().identity()!=identity)throw std::runtime_error("Recording project changed during export");
  auto conflicts=[this](const auto& path,const auto& suggested){return framePngConflict(path,suggested);};if(format==RecordingMp4||format==RecordingWebm)return resolveExportDestinations({selected},conflicts);return planFrameSequencePaths(selected.parent_path(),selected.filename().u32string(),currentDocument().timelapseSettings().snapshots.size(),conflicts,format==RecordingJpeg?FrameSequenceFormat::Jpeg:FrameSequenceFormat::Png);
 },[this,identity](int format,const std::filesystem::path& initial)->std::optional<std::filesystem::path>{
  if(currentDocument().identity()!=identity)throw std::runtime_error("Recording project changed during export");
  wchar_t filename[32768]{};wcsncpy_s(filename,initial.c_str(),_TRUNCATE);OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=format==RecordingWebm?L"WebM 视频\0*.webm\0\0":format==RecordingMp4?L"MP4 视频\0*.mp4\0\0":format==RecordingJpeg?L"JPEG 图片序列\0*.jpg;*.jpeg\0\0":L"PNG 图片序列\0*.png\0\0";dialog.lpstrDefExt=format==RecordingWebm?L"webm":format==RecordingMp4?L"mp4":format==RecordingJpeg?L"jpg":L"png";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST;
  if(!chooseSaveFile_(&dialog)){if(CommDlgExtendedError())throw std::runtime_error("Cannot select recording export location");return std::nullopt;}
  std::filesystem::path selected=filename;auto extension=selected.extension().wstring();std::transform(extension.begin(),extension.end(),extension.begin(),[](wchar_t c){return std::towlower(c);});const auto expected=std::filesystem::path(recordingExtension(format)).wstring();if(extension!=expected&&!(format==RecordingJpeg&&extension==L".jpeg"))selected+=expected;return selected;
 },preferredExportDirectory()/std::filesystem::path(framePngExportStem(currentDocument().name(),U"MoonSprite")+U"-timelapse.png"),runtimePreferences_.exportScales,runtimePreferences_.defaultExportScale(),ExportProtection(runtimePreferences_.index("files.exportProtection.Select")),[this,identity,session]{
  if(currentDocument().identity()!=identity)throw std::runtime_error("Recording project changed during export");
  session->beginCaptureFlush();
  if(!session->captureFlushReady(currentDocument())){
   RecordingFlushDialog waiting(font_,skin_,[this,identity,session]{if(currentDocument().identity()!=identity)throw std::runtime_error("Recording project changed during export");return session->captureFlushReady(currentDocument());});waiting.setDisplay(display(),false);const auto size=waiting.minimumDialogSize(0);const auto r=bounds();waiting.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});waiting.openWindowInForeground();if(!waiting.failure.empty())throw std::runtime_error(waiting.failure);if(!waiting.completed)throw std::runtime_error("Recording capture did not complete");
  }
  return currentDocument().timelapseSettings();
 });popup.setDisplay(display(),false);const auto r=bounds();const auto size=popup.minimumDialogSize(0);popup.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});popup.openWindowInForeground();if(popup.completed){rememberSuccessfulExport(popup.completedPath);recordRecentExportPath(popup.completedPath);status_=U"缩时录像已导出";}
}
int Editor::chooseTimelapsePortability(){RecordingPortabilityDialog popup(font_,skin_,toolIcons_);popup.setDisplay(display(),false);const auto r=bounds();const auto size=popup.minimumDialogSize(0);popup.setBounds({r.center().x-size.w/2,r.center().y-size.h/2,size.w,size.h});popup.openWindowInForeground();return popup.choice;}
}
