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
class NewDocumentDialog final : public PixelPopupWindow {
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
  std::array<Segment*,3> modes_{};std::array<Segment*,6> sizes_{};
  static constexpr std::array<std::array<int,2>,6> dimensions_{{{16,16},{32,32},{64,64},{128,128},{256,256},{320,180}}};
  struct Preset {std::string name;int width,height;};std::vector<Preset> saved_;
  std::filesystem::path storage_;bool readable_=true,accepted_=false;std::u32string error_;
  int drag_=0;gfx::Point origin_;gfx::Rect original_;
  std::function<bool(std::u32string,int,int)> createDocument_;
  int minimumWidth()const {int modes=10;for(auto b:modes_)modes+=b->minimumWidth();return std::max(146,modes);}
  int sizeColumns(int width)const {int cell=0;for(auto b:sizes_)cell=std::max(cell,b->minimumWidth());return std::clamp((width-13)/(cell-1),1,6);}
  int colorY(int width)const {const int rows=(6+sizeColumns(width)-1)/sizeColumns(width);return 86+rows*16+(rows-1)*2+6;}
  int presetY(int width)const {return colorY(width)+53;}
  int minimumHeight(int width)const {return presetY(width)+76+(error_.empty()?0:12);}
  void relayout(){if(!bounds().isEmpty()){auto r=bounds();r.h=std::max(r.h,minimumHeight(r.w/uiScale)*uiScale);setBounds(r);onLayout();}invalidate();}
  int resizeEdges(gfx::Point p)const {const auto r=bounds();if(!r.contains(p)||close_->bounds().contains(p))return 0;const int e=3*uiScale;return(p.x<r.x+e?1:0)|(p.x>=r.x2()-e?2:0)|(p.y<r.y+e?4:0)|(p.y>=r.y2()-e?8:0);}
  PixelButton* button(std::u32string text,std::function<void()> click){auto b=new PixelButton(font_,skin_,std::move(text),std::move(click));addChild(b);return b;}
  PixelEntry* entry(){auto e=new PixelEntry(font_,skin_);addChild(e);return e;}
  int number(PixelEntry* e)const {try{const std::string text=e->text();if(!std::regex_match(text,std::regex("[0-9]+")))return 0;const int n=std::stoi(text);return n>=1&&n<=1024?n:0;}catch(...){return 0;}}
  void setSize(int w,int h){width_->setText(std::to_string(w));height_->setText(std::to_string(h));sync();}
  void sync(){for(int i=0;i<6;++i){sizes_[i]->active=number(width_)==dimensions_[i][0]&&number(height_)==dimensions_[i][1];sizes_[i]->invalidate();}remove_->setEnabled(readable_&&std::any_of(saved_.begin(),saved_.end(),[&](auto& p){return p.name==presetName_->text();}));}
  void updateOptions(){std::vector<std::u32string> options{U"选择预设"};for(auto& p:saved_)options.push_back(unicodeText(p.name+" · "+std::to_string(p.width)+"×"+std::to_string(p.height)));presets_->setOptions(std::move(options));presets_->setSelectedIndex(0);sync();}
  bool persist(const std::vector<Preset>& next){try{std::ostringstream out;out<<"MoonSprite new-document-presets 1\n";for(auto& p:next)out<<std::quoted(p.name)<<' '<<p.width<<' '<<p.height<<" rgba 0\n";auto text=out.str();std::filesystem::create_directories(storage_.parent_path());writeExportBytesAtomic(storage_,std::vector<std::uint8_t>(text.begin(),text.end()));return true;}catch(...){error_=U"预设保存失败，请重试";invalidate();return false;}}
  void savePreset(){auto name=presetName_->text();const auto first=name.find_first_not_of(" \t\r\n"),last=name.find_last_not_of(" \t\r\n");if(first==std::string::npos){error_=U"请输入预设名称";relayout();return;}name=name.substr(first,last-first+1);const int w=number(width_),h=number(height_);if(!w||!h){error_=U"宽高须为 1–1024 的整数";relayout();return;}auto next=saved_;next.erase(std::remove_if(next.begin(),next.end(),[&](auto& p){return p.name==name;}),next.end());next.push_back({name,w,h});if(persist(next)){saved_=std::move(next);presetName_->setText(name);error_=U"预设已保存";updateOptions();relayout();}}
  void deletePreset(){auto next=saved_;const auto name=presetName_->text();next.erase(std::remove_if(next.begin(),next.end(),[&](auto& p){return p.name==name;}),next.end());if(persist(next)){saved_=std::move(next);presetName_->setText("");error_.clear();updateOptions();relayout();}}
  void submit(){auto name=name_->text();if(name.empty())name=utf8Text(U"未命名作品");const auto u=unicodeText(name);std::string stem=name.substr(0,name.find('.'));std::transform(stem.begin(),stem.end(),stem.begin(),[](unsigned char c){return char(std::toupper(c));});
    if(u.size()>255||name.find_first_of("<>:\"/\\|?*")!=std::string::npos||std::any_of(name.begin(),name.end(),[](unsigned char c){return c<32;})||name.back()=='.'||name.back()==' '||std::regex_match(stem,std::regex("CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9]"))){error_=U"工程名称无效，请检查文件名";relayout();return;}
    const int w=number(width_),h=number(height_);if(!w||!h){error_=U"宽高须为 1–1024 的整数";relayout();return;}
    if(createDocument_(u,w,h)){accepted_=true;closeWindow(nullptr);}else{error_=U"创建画布失败";relayout();}
  }
public:
  NewDocumentDialog(const PixelFont& f,const Skin& s,const Skin& icons,std::filesystem::path storage,std::function<bool(std::u32string,int,int)> create)
    :PixelPopupWindow("",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(f),skin_(s),icons_(icons),storage_(std::move(storage)),createDocument_(std::move(create)) {
    setAutoRemap(false);setWantFocus(true);name_=entry();width_=entry();height_=entry();presetName_=entry();name_->setText(utf8Text(U"未命名作品"));
    close_=button(U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons_;close_->icon="close";close_->skinStyle="icon_button";
    cancel_=button(U"取消",[this]{closeWindow(nullptr);});create_=button(U"创建画布",[this]{submit();});save_=button(U"保存预设",[this]{savePreset();});remove_=button(U"",[this]{deletePreset();});remove_->iconSkin=&icons_;remove_->icon="delete";remove_->skinStyle="icon_button";
    presets_=new PixelDropdown(f,s);addChild(presets_);presets_->changed=[this](int i){if(i>0&&i<=int(saved_.size())){const auto p=saved_[i-1];presetName_->setText(p.name);setSize(p.width,p.height);error_.clear();relayout();}};
    const char32_t* labels[]{U"RGBA",U"索引",U"灰度"};const char* artwork[]{"rgba","indexed","grayscale"};
    for(int i=0;i<3;++i){modes_[i]=new Segment(f,s,labels[i],std::string("new_document.color-mode-")+artwork[i],[]{});addChild(modes_[i]);modes_[i]->active=i==0;modes_[i]->setEnabled(i==0);}
    for(int i=0;i<6;++i){const auto d=dimensions_[i];sizes_[i]=new Segment(f,s,unicodeText(std::to_string(d[0])+"x"+std::to_string(d[1])),"",[this,d]{setSize(d[0],d[1]);});addChild(sizes_[i]);}
    recording_=new PixelSwitch(f,s,U"记录绘画过程",false,{});addChild(recording_);recording_->setEnabled(false);recording_->iconSkin=&skin_;recording_->icon="new_document.record-drawing";
    // Keep original colored record artwork and its native pixel dimensions.
    for(auto e:{width_,height_}){e->numeric=true;e->Change.connect([this]{sync();});}
    presetName_->Change.connect([this]{sync();});for(auto e:{name_,width_,height_})e->accept=[this]{submit();};setSize(64,64);
    try{if(std::filesystem::exists(storage_)){std::ifstream in(storage_);std::string header;std::getline(in,header);if(header!="MoonSprite new-document-presets 1")throw std::runtime_error("Preset version");while(in>>std::ws&&!in.eof()){Preset p;std::string mode;int record;if(!(in>>std::quoted(p.name)>>p.width>>p.height>>mode>>record)||p.name.empty()||p.width<1||p.width>1024||p.height<1||p.height>1024||mode!="rgba"||record!=0)throw std::runtime_error("Preset data");saved_.push_back(std::move(p));}}}catch(...){saved_.clear();readable_=false;error_=U"预设文件损坏，保存已禁用";}
    save_->setEnabled(readable_);updateOptions();
  }
  bool accepted()const{return accepted_;}
  void setBounds(const gfx::Rect& rect){auto r=rect;r.w=std::max(r.w,minimumWidth()*uiScale);r.h=std::max(r.h,minimumHeight(r.w/uiScale)*uiScale);PixelPopupWindow::setBounds(r);}
  const char* geometryCursor(gfx::Point p)const override {const int e=drag_>1?drag_-1:resizeEdges(p);if((e&1&&e&4)||(e&2&&e&8))return "nwse-resize";if((e&1&&e&8)||(e&2&&e&4))return "nesw-resize";return e&3?"ew-resize":e&12?"ns-resize":"default";}
  void onResize(ui::ResizeEvent& ev)override {
    setBoundsQuietly(ev.bounds());onLayout();
  }
  void onLayout(){const auto r=bounds();const int w=r.w/uiScale,body=w-12,half=(body-2)/2;
    auto place=[&](ui::Widget* b,int x,int y,int width,int height){b->setBounds({r.x+x*uiScale,r.y+y*uiScale,width*uiScale,height*uiScale});};
    place(close_,w-2-uiGap-11,2,11,12);place(name_,6,34,body,16);place(width_,6,68,half,16);place(height_,6+half+2,68,body-half-2,16);
    const int columns=sizeColumns(w),cy=colorY(w),py=presetY(w);
    for(int row=0;row*columns<6;++row){const int count=std::min(columns,6-row*columns);int x=6;for(int col=0;col<count;++col){const int right=6+body*(col+1)/count;place(sizes_[row*columns+col],x,86+row*18,right-x,16);x=right-1;}}
    int total=-2;for(auto b:modes_)total+=b->minimumWidth();const int extra=body-total;
    int x=6;for(int i=0;i<3;++i){const int width=modes_[i]->minimumWidth()+extra*(i+1)/3-extra*i/3;place(modes_[i],x,cy+12,width,16);x+=width-1;}
    place(recording_,6,cy+30,body,17);place(presets_,6,py+12,body,16);place(presetName_,6,py+30,body-78,16);place(remove_,w-6-16,py+30,16,16);place(save_,w-6-16-2-58,py+30,58,16);
    place(create_,w/2-67,r.h/uiScale-24,66,18);place(cancel_,w/2+1,r.h/uiScale-24,66,18);
  }
  void onPaint(ui::PaintEvent& ev)override {
    auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());skin_.draw(g,"dialog_frame",r);
    auto text=[&](const char32_t* s,int x,int y){font_.draw(g,s,r.x+x,r.y+y,skin_["text"]);};
    text(U"新建画布",6,2);text(U"名称",6,22);text(U"宽",6,56);text(U"高",6+(r.w-14)/2+2,56);text(U"颜色模式",6,colorY(r.w));text(U"新建预设",6,presetY(r.w));
    if(!error_.empty()){const int y=presetY(r.w)+48;g.saveClip();g.clipRect({r.x+6,r.y+y,r.w-12,12});font_.draw(g,error_,r.x+6,r.y+y,skin_["text"]);g.restoreClip();}
  }
  bool onProcessMessage(ui::Message* msg)override {
    if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}if(key->scancode()==ui::kKeyEnter){submit();return true;}}
    if(msg->type()==ui::kFocusLeaveMessage){drag_=0;if(hasCapture())releaseMouse();}
    if(msg->type()==ui::kMouseDownMessage&&!msg->fromFilter()){const auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()){const int edges=resizeEdges(m->position());if(edges||m->position().y<bounds().y+16*uiScale){drag_=edges?edges+1:1;origin_=m->position();original_=bounds();captureMouse();return true;}}}
    if(msg->type()==ui::kMouseMoveMessage&&drag_&&hasCapture()){auto r=original_;const auto delta=static_cast<ui::MouseMessage*>(msg)->position()-origin_;if(drag_==1)r.offset(delta);else{const int e=drag_-1;if(e&1){r.w=std::max(minimumWidth()*uiScale,r.w-delta.x);r.x=original_.x2()-r.w;}if(e&2)r.w=std::max(minimumWidth()*uiScale,r.w+delta.x);const int minHeight=minimumHeight(r.w/uiScale)*uiScale;if(e&4){r.h=std::max(minHeight,r.h-delta.y);r.y=original_.y2()-r.h;}else if(e&8)r.h=std::max(minHeight,r.h+delta.y);else r.h=std::max(minHeight,r.h);}setBounds(r);return true;}
    if(msg->type()==ui::kMouseUpMessage&&drag_){drag_=0;if(hasCapture())releaseMouse();return true;}
    return ui::PopupWindow::onProcessMessage(msg);
  }
  void smokeGeometryStep(int step){
    cancel_->requestFocus();const auto r=bounds();gfx::Point from(r.x+r.w/2,r.y+8*uiScale),delta;
    switch(step){case 0:delta={74,-36};break;case 1:delta={-131,89};break;case 2:from={r.x2()-1,r.y+r.h/2};delta={-10000,0};break;case 3:from={r.x+r.w/2,r.y2()-1};delta={0,-10000};break;case 4:from={r.x+1,r.y+1};delta={-30,-20};break;default:from={r.x2()-1,r.y2()-1};delta={400,40};break;}
    auto send=[&](ui::MessageType type,gfx::Point p){ui::MouseMessage m(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,p);onProcessMessage(&m);};
    send(ui::kMouseDownMessage,from);if(!hasCapture())throw std::runtime_error("Popup geometry capture");send(ui::kMouseMoveMessage,from+delta);send(ui::kMouseUpMessage,from+delta);
    if(hasCapture()||bounds().y2()-create_->bounds().y2()!=6*uiScale||create_->bounds().x>=cancel_->bounds().x)throw std::runtime_error("Popup footer/capture invariant");
    for(auto child:children())if(!bounds().contains(child->bounds()))throw std::runtime_error("Compact popup clipped a control");
    if(step==2&&bounds().w!=minimumWidth()*uiScale)throw std::runtime_error("Popup failed content width threshold");
    if(step==3&&bounds().h!=minimumHeight(bounds().w/uiScale)*uiScale)throw std::runtime_error("Popup failed content height threshold");
  }
  void smoke(){
    auto check=[](bool b,const char* why){if(!b)throw std::runtime_error(why);};check(number(width_)==64&&number(height_)==64,"New dialog defaults");check(modes_[0]->active&&!recording_->checked(),"RGBA/recording defaults");
    const auto origin=bounds().origin();check(name_->bounds().x==origin.x+6*uiScale&&name_->bounds().x2()==bounds().x2()-6*uiScale,"Dialog padding");check(width_->bounds().y-name_->bounds().y2()==18*uiScale,"Name/size label spacing");check(sizes_[0]->bounds().x2()-sizes_[1]->bounds().x==uiScale&&modes_[0]->bounds().x2()-modes_[1]->bounds().x==uiScale,"Segments share black border");
    sizes_[5]->Click();check(number(width_)==320&&number(height_)==180,"Legacy size preset");
    presetName_->setText("smoke-layout-owned");savePreset();check(std::any_of(saved_.begin(),saved_.end(),[](auto& p){return p.name=="smoke-layout-owned"&&p.width==320&&p.height==180;}),"Preset save");
    {NewDocumentDialog loaded(font_,skin_,icons_,storage_,createDocument_);check(std::any_of(loaded.saved_.begin(),loaded.saved_.end(),[](auto& p){return p.name=="smoke-layout-owned";}),"Preset reload");}
    deletePreset();check(std::none_of(saved_.begin(),saved_.end(),[](auto& p){return p.name=="smoke-layout-owned";}),"Preset delete");name_->setText("CON");submit();check(!accepted_,"Invalid filename accepted");name_->setText(utf8Text(U"布局测试"));setSize(72,48);submit();check(accepted_,"Create callback failed");
  }
};
}
