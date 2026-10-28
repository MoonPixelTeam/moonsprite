#pragma once
#include "native_widgets.h"
#include "ui_scale.h"
#include "image_export.h"
#include "ui/popup_window.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include <fstream>
#include <iomanip>
#include <regex>

namespace moon {
// NewDocumentDialog.tsx / new-document-presets.ts: native controls and storage.
class NewDocumentDialog final : public PixelDialog {
  class Segment final : public PixelButton {
    const PixelFont& font_;const Skin& skin_;std::string artwork_;
  public:
    int minimumWidth()const {return font_.measure(caption)+8+(artwork_.empty()?0:skin_.assets.patches.at(artwork_).bitmap->width+2);}
    Segment(const PixelFont& f,const Skin& s,std::u32string text,std::string art,std::function<void()> click)
      :PixelButton(f,s,std::move(text),std::move(click)),font_(f),skin_(s),artwork_(std::move(art)){}
    void onPaint(ui::PaintEvent& ev)override {
      auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
      const char* state=!isEnabled()?"disabled":isSelected()?"pressed":active?"selected":hasMouse()?"hover":"normal";
      skin_.draw(g,std::string("icon_button.")+state,r);
      int width=font_.measure(caption),iw=0,ih=0;
      if(!artwork_.empty()){const auto& b=*skin_.assets.patches.at(artwork_).bitmap;iw=b.width;ih=b.height;width+=iw+2;}
      const int x=r.x+(r.w-width)/2;
      if(iw)skin_.draw(g,artwork_,{x,r.y+(r.h-ih)/2,iw,ih},false,isEnabled()?255:102);
      font_.draw(g,caption,x+(iw?iw+2:0),r.y+(r.h-10)/2,skin_[isEnabled()?"text":"muted"]);
    }
  };
  const PixelFont& font_;const Skin& skin_;const Skin& icons_;
  PixelEntry *name_,*width_,*height_,*presetName_;
  PixelButton *close_,*cancel_,*create_,*save_,*remove_;
  PixelDropdown* presets_;PixelSwitch* recording_;
  PixelPresetControls presetControls_;
  std::array<Segment*,3> modes_{};std::array<Segment*,6> sizes_{};
  static constexpr std::array<std::array<int,2>,6> dimensions_{{{16,16},{32,32},{64,64},{128,128},{256,256},{320,180}}};
  struct Preset {std::string name;int width,height;bool record=false;};std::vector<Preset> saved_;
  std::filesystem::path storage_;bool readable_=true,accepted_=false;std::u32string error_;
  std::function<bool(std::u32string,int,int)> createDocument_;
  int sizeColumns(int width)const {int cell=0;for(auto b:sizes_)cell=std::max(cell,b->minimumWidth());return std::clamp((width-13)/(cell-1),1,6);}
  static constexpr int sizeY(){return DialogLayout::field(1)+textControlHeight+DialogLayout::gap;}
  int colorY(int width)const {const int rows=(6+sizeColumns(width)-1)/sizeColumns(width);return sizeY()+rows*textControlHeight+(rows-1)*DialogLayout::gap+DialogLayout::group;}
  int presetY(int width)const {return colorY(width)+34+textControlHeight+6;}
  void relayout(){if(!bounds().isEmpty()){setBounds(bounds());onLayout();}invalidate();}
  PixelButton* button(std::u32string text,std::function<void()> click){auto b=new PixelButton(font_,skin_,std::move(text),std::move(click));addChild(b);return b;}
  PixelEntry* entry(){auto e=new PixelEntry(font_,skin_);addChild(e);return e;}
  int number(PixelEntry* e)const {try{const std::string text=e->text();if(!std::regex_match(text,std::regex("[0-9]+")))return 0;const int n=std::stoi(text);return n>=1&&n<=1024?n:0;}catch(...){return 0;}}
  void setSize(int w,int h){width_->setText(std::to_string(w));height_->setText(std::to_string(h));sync();}
  void sync(){for(int i=0;i<6;++i){sizes_[i]->active=number(width_)==dimensions_[i][0]&&number(height_)==dimensions_[i][1];sizes_[i]->invalidate();}remove_->setEnabled(readable_&&std::any_of(saved_.begin(),saved_.end(),[&](auto& p){return p.name==presetName_->text();}));}
  void updateOptions(){std::vector<std::u32string> options{U"选择预设"};for(auto& p:saved_)options.push_back(unicodeText(p.name+" · "+std::to_string(p.width)+"×"+std::to_string(p.height)));presets_->setOptions(std::move(options));presets_->setSelectedIndex(0);sync();}
  bool persist(const std::vector<Preset>& next){try{std::ostringstream out;out<<"MoonSprite new-document-presets 1\n";for(auto& p:next)out<<std::quoted(p.name)<<' '<<p.width<<' '<<p.height<<" rgba "<<int(p.record)<<"\n";auto text=out.str();std::filesystem::create_directories(storage_.parent_path());writeExportBytesAtomic(storage_,std::vector<std::uint8_t>(text.begin(),text.end()));return true;}catch(...){error_=U"预设保存失败，请重试";invalidate();return false;}}
  void savePreset(){auto name=presetName_->text();const auto first=name.find_first_not_of(" \t\r\n"),last=name.find_last_not_of(" \t\r\n");if(first==std::string::npos){error_=U"请输入预设名称";relayout();return;}name=name.substr(first,last-first+1);const int w=number(width_),h=number(height_);if(!w||!h){error_=U"宽高须为 1–1024 的整数";relayout();return;}auto next=saved_;next.erase(std::remove_if(next.begin(),next.end(),[&](auto& p){return p.name==name;}),next.end());next.push_back({name,w,h,recording_->checked()});if(persist(next)){saved_=std::move(next);presetName_->setText(name);error_=U"预设已保存";updateOptions();relayout();}}
  void deletePreset(){auto next=saved_;const auto name=presetName_->text();next.erase(std::remove_if(next.begin(),next.end(),[&](auto& p){return p.name==name;}),next.end());if(persist(next)){saved_=std::move(next);presetName_->setText("");error_.clear();updateOptions();relayout();}}
  void submit(){auto name=name_->text();if(name.empty())name=utf8Text(U"未命名作品");const auto u=unicodeText(name);std::string stem=name.substr(0,name.find('.'));std::transform(stem.begin(),stem.end(),stem.begin(),[](unsigned char c){return char(std::toupper(c));});
    if(u.size()>255||name.find_first_of("<>:\"/\\|?*")!=std::string::npos||std::any_of(name.begin(),name.end(),[](unsigned char c){return c<32;})||name.back()=='.'||name.back()==' '||std::regex_match(stem,std::regex("CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]"))){error_=U"工程名称无效，请检查文件名";relayout();return;}
    const int w=number(width_),h=number(height_);if(!w||!h){error_=U"宽高须为 1–1024 的整数";relayout();return;}
    if(createWithRecording?createWithRecording(u,w,h,recording_->checked()):createDocument_(u,w,h)){accepted_=true;closeWindow(nullptr);}else{error_=U"创建画布失败";relayout();}
  }
public:
  std::function<bool(std::u32string,int,int,bool)> createWithRecording;
  void setRecordingDefault(bool value){recording_->setChecked(value);}
  bool recordingEnabled()const{return recording_->checked();}
  NewDocumentDialog(const PixelFont& f,const Skin& s,const Skin& icons,std::filesystem::path storage,std::function<bool(std::u32string,int,int)> create)
    :PixelDialog(s,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(s),icons_(icons),storage_(std::move(storage)),createDocument_(std::move(create)) {
    setAutoRemap(false);setWantFocus(true);name_=entry();width_=entry();height_=entry();name_->setText(utf8Text(U"未命名作品"));
    close_=button(U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons_;close_->icon="close";close_->skinStyle="icon_button";
    cancel_=button(U"取消",[this]{closeWindow(nullptr);});create_=button(U"创建画布",[this]{submit();});
    presetControls_=PixelPresetControls::create([this]{return entry();},[this](std::u32string label,std::function<void()> action){return button(std::move(label),std::move(action));},
      [this,&f,&s]{auto dropdown=new PixelDropdown(f,s);addChild(dropdown);return dropdown;},icons_,
      [this](int i){if(i>0&&i<=int(saved_.size())){const auto p=saved_[i-1];presetName_->setText(p.name);setSize(p.width,p.height);recording_->setChecked(p.record);error_.clear();relayout();}},
      [this]{savePreset();},[this]{deletePreset();});
    presets_=presetControls_.choices;presetName_=presetControls_.name;save_=presetControls_.save;remove_=presetControls_.remove;
    const char32_t* labels[]{U"RGBA",U"索引",U"灰度"};const char* artwork[]{"rgba","indexed","grayscale"};
    for(int i=0;i<3;++i){modes_[i]=new Segment(f,s,labels[i],std::string("new_document.color-mode-")+artwork[i],[]{});addChild(modes_[i]);modes_[i]->active=i==0;modes_[i]->setEnabled(i==0);}
    for(int i=0;i<6;++i){const auto d=dimensions_[i];sizes_[i]=new Segment(f,s,unicodeText(std::to_string(d[0])+"x"+std::to_string(d[1])),"",[this,d]{setSize(d[0],d[1]);});addChild(sizes_[i]);}
    recording_=new PixelSwitch(f,s,U"记录绘画过程",false,std::function<void(bool)>{});addChild(recording_);recording_->setEnabled(true);recording_->iconSkin=&skin_;recording_->icon="new_document.record-drawing";
    // Keep original colored record artwork and its native pixel dimensions.
    for(auto e:{width_,height_}){e->numeric=true;e->Change.connect([this]{sync();});}
    presetName_->Change.connect([this]{sync();});for(auto e:{name_,width_,height_})e->accept=[this]{submit();};setSize(64,64);
    try{if(std::filesystem::exists(storage_)){std::ifstream in(storage_);std::string header;std::getline(in,header);if(header!="MoonSprite new-document-presets 1")throw std::runtime_error("Preset version");while(in>>std::ws&&!in.eof()){Preset p;std::string mode;int record;if(!(in>>std::quoted(p.name)>>p.width>>p.height>>mode>>record)||p.name.empty()||p.width<1||p.width>1024||p.height<1||p.height>1024||mode!="rgba"||(record!=0&&record!=1))throw std::runtime_error("Preset data");p.record=record!=0;saved_.push_back(std::move(p));}}}catch(...){saved_.clear();readable_=false;error_=U"预设文件损坏，保存已禁用";}
    save_->setEnabled(readable_);updateOptions();
  }
  bool accepted()const{return accepted_;}
  int preferredHeight(int width)const{return DialogLayout::fit(presetY(width)+54+(error_.empty()?0:16));}
  void onResize(ui::ResizeEvent& ev)override {
    setBoundsQuietly(ev.bounds());onLayout();
  }
  void onLayout(){const auto r=bounds();const int w=r.w/uiScale,body=w-12,half=(body-2)/2;
    auto place=[&](ui::Widget* b,int x,int y,int width,int height){b->setBounds({r.x+x*uiScale,r.y+y*uiScale,width*uiScale,height*uiScale});};
    layoutHeaderButton(close_);place(name_,6,DialogLayout::field(),body,textControlHeight);place(width_,6,DialogLayout::field(1),half,textControlHeight);place(height_,6+half+2,DialogLayout::field(1),body-half-2,textControlHeight);
    const int columns=sizeColumns(w),cy=colorY(w),py=presetY(w);
    for(int row=0;row*columns<6;++row){const int count=std::min(columns,6-row*columns);int x=6;for(int col=0;col<count;++col){const int right=6+body*(col+1)/count;place(sizes_[row*columns+col],x,sizeY()+row*(textControlHeight+2),right-x,textControlHeight);x=right-1;}}
    int total=-2;for(auto b:modes_)total+=b->minimumWidth();const int extra=body-total;
    int x=6;for(int i=0;i<3;++i){const int width=modes_[i]->minimumWidth()+extra*(i+1)/3-extra*i/3;place(modes_[i],x,cy+12,width,textControlHeight);x+=width-1;}
    place(recording_,6,cy+34,body,textControlHeight);presetControls_.layout(uiPhysical(gfx::Rect(6,py+12,body,42)).offset(bounds().origin()));
    place(create_,w/2-67,r.h/uiScale-textControlHeight-6,66,textControlHeight);place(cancel_,w/2+1,r.h/uiScale-textControlHeight-6,66,textControlHeight);
  }
  gfx::Size minimumDialogSize(int width)const override {
    int modes=-2;for(auto b:modes_)modes+=b->minimumWidth();
    const int w=std::max({146,modes+12,2*width_->widthForValue(U"1024")+14,font_.measure(recording_->caption)+44});
    return {w*uiScale,preferredHeight(std::max(w,width/uiScale))*uiScale};
  }
  void paintDialogContents(ui::PaintEvent& ev)override {
    auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
    auto text=[&](const char32_t* s,int x,int y){font_.draw(g,s,r.x+x,r.y+y,skin_["text"]);};
    drawDialogTitle(font_,g,r,U"新建画布");text(U"名称",6,DialogLayout::label());text(U"宽",6,DialogLayout::label(1));text(U"高",6+(r.w-14)/2+2,DialogLayout::label(1));text(U"颜色模式",6,colorY(r.w));text(U"新建预设",6,presetY(r.w));
    if(!error_.empty()){const int y=presetY(r.w)+60;g.saveClip();g.clipRect({r.x+6,r.y+y,r.w-12,12});font_.draw(g,error_,r.x+6,r.y+y,skin_["text"]);g.restoreClip();}
  }
  bool onProcessMessage(ui::Message* msg)override {
    if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}if(key->scancode()==ui::kKeyEnter){submit();return true;}}
    return PixelPopupWindow::onProcessMessage(msg);
  }
  void smokeGeometryStep(int step){
    cancel_->requestFocus();const auto r=bounds();gfx::Point from(r.x+r.w/2,r.y+8*uiScale),delta;
    switch(step){case 0:delta={74,-36};break;case 1:delta={-131,89};break;case 2:from={r.x2()-1,r.y+r.h/2};delta={40*uiScale-r.w,0};break;case 3:from={r.x+r.w/2,r.y2()-1};delta={0,40*uiScale-r.h};break;case 4:from={r.x+1,r.y+1};delta={-30,-20};break;default:from={r.x2()-1,r.y2()-1};delta={400,40};break;}
    auto send=[&](ui::MessageType type,gfx::Point p){ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,p);onProcessMessage(&m);};
    send(ui::kMouseDownMessage,from);if(!hasCapture())throw std::runtime_error("Popup geometry capture");send(ui::kMouseMoveMessage,from+delta);send(ui::kMouseUpMessage,from+delta);
    if(hasCapture()||bounds().y2()-create_->bounds().y2()!=6*uiScale||create_->bounds().x>=cancel_->bounds().x)throw std::runtime_error("Popup footer/capture invariant");

    if(step==2&&bounds().w!=minimumDialogSize(bounds().w).w)throw std::runtime_error("Popup content width floor");
    if(step==3&&bounds().h!=minimumDialogSize(bounds().w).h)throw std::runtime_error("Popup responsive height floor");
  }
  void smoke(){
    auto check=[](bool b,const char* why){if(!b)throw std::runtime_error(why);};check(close_->columnHeaderAction && close_->bounds().size()==gfx::Size(15*uiScale,15*uiScale),"New dialog must use shared 15px header button");check(number(width_)==64&&number(height_)==64,"New dialog defaults");check(modes_[0]->active&&!recording_->checked(),"RGBA/recording defaults");
    const auto restored=bounds();
    check(name_->bounds().y-bounds().y==(DialogLayout::bodyTop+12)*uiScale,"New canvas body boundary");
    check(sizes_[0]->bounds().y-width_->bounds().y2()==UiSpacing::related*uiScale,"Size presets related spacing");
    check(modes_[0]->bounds().y-(bounds().y+colorY(bounds().w/uiScale)*uiScale)==12*uiScale,"Color group label spacing");
    for(int width:{minimumDialogSize(bounds().w).w,280*uiScale,400*uiScale}){
      const auto floor=minimumDialogSize(width);setBounds({restored.x,restored.y,width,floor.h});
      for(auto child:children())if(!child->hasFlags(ui::HIDDEN) && !bounds().contains(child->bounds()))throw std::runtime_error("New dialog child escaped responsive content floor");
      if(presetControls_.name->bounds().y2()+6*uiScale>create_->bounds().y)throw std::runtime_error("New dialog preset/footer overlap");
    }
    setBounds(restored);
    const auto origin=bounds().origin();check(name_->bounds().x==origin.x+6*uiScale&&name_->bounds().x2()==bounds().x2()-6*uiScale,"Dialog padding");check(width_->bounds().y-name_->bounds().y2()==18*uiScale,"Name/size label spacing");check(sizes_[0]->bounds().x2()-sizes_[1]->bounds().x==uiScale&&modes_[0]->bounds().x2()-modes_[1]->bounds().x==uiScale,"Segments share black border");
    sizes_[5]->Click();check(number(width_)==320&&number(height_)==180,"Legacy size preset");
    presetName_->setText("smoke-layout-owned");savePreset();check(std::any_of(saved_.begin(),saved_.end(),[](auto& p){return p.name=="smoke-layout-owned"&&p.width==320&&p.height==180;}),"Preset save");
    {NewDocumentDialog loaded(font_,skin_,icons_,storage_,createDocument_);check(std::any_of(loaded.saved_.begin(),loaded.saved_.end(),[](auto& p){return p.name=="smoke-layout-owned";}),"Preset reload");}
    deletePreset();check(std::none_of(saved_.begin(),saved_.end(),[](auto& p){return p.name=="smoke-layout-owned";}),"Preset delete");name_->setText("CON");submit();check(!accepted_,"Invalid filename accepted");name_->setText(utf8Text(U"布局测试"));setSize(72,48);submit();check(accepted_,"Create callback failed");
  }
};
}
