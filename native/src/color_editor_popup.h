#pragma once
#include "color_value_model.h"
#include "native_widgets.h"
#include "ui/message.h"
#include "ui/manager.h"
#include "ui/resize_event.h"
#include "clip/clip.h"
#include <fstream>

namespace moon {
// ColorValueControl.tsx: transient editor becomes resident after title dragging;
// edits are live, closing commits valid HEX (invalid text resets), never reverts.
class ColorEditorPopup final : public PixelDialog {
  const PixelFont& font_;const Skin& skin_;const Skin& icons_;
  ColorValueMode mode_=ColorValueMode::Hsv;
  ColorValues values_{};std::uint32_t previous_=0,current_=0;
  bool updating_=false,resident_=false,sampling_=false;
  gfx::Point titlePress_;bool titleHeld_=false;
  std::array<PixelButton*,5> tabs_{};
  std::array<PixelSlider*,5> sliders_{};
  std::array<PixelEntry*,5> entries_{};
  PixelEntry* hex_=nullptr;PixelButton *previousButton_=nullptr,*currentButton_=nullptr,*close_=nullptr,*sample_=nullptr;
  std::vector<PixelButton*> paletteButtons_;
  std::filesystem::path storage_;std::u32string role_;
  std::function<void(std::uint32_t)> changed_;
  std::function<void(bool)> samplingChanged_;
  inline static constexpr ColorValueMode modes_[]{ColorValueMode::Hsv,ColorValueMode::Rgb,ColorValueMode::Lab,ColorValueMode::Gray,ColorValueMode::Palette};
  PixelButton* button(std::u32string text,std::function<void()> action){auto b=new PixelButton(font_,skin_,std::move(text),std::move(action));addChild(b);return b;}
  void sync(bool derive){
    if(derive)values_=colorToValues(current_,mode_);
    updating_=true;const auto fields=colorValueFields(mode_);
    for(int i=0;i<5;++i){const bool show=i<int(fields.size());entries_[i]->setVisible(show);sliders_[i]->setVisible(show);if(show){sliders_[i]->minimum=fields[i].minimum;sliders_[i]->maximum=fields[i].maximum;sliders_[i]->percentage=fields[i].percentage;sliders_[i]->value=int(std::floor(values_[i]+.5));if(!entries_[i]->hasFocus())entries_[i]->setText(std::to_string(int(std::floor(values_[i]+.5))));sliders_[i]->invalidate();}}
    for(int i=0;i<5;++i){tabs_[i]->active=mode_==modes_[i];tabs_[i]->invalidate();}
    for(auto b:paletteButtons_){b->setVisible(mode_==ColorValueMode::Palette);b->active=b->swatch==current_;b->invalidate();}
    if(!hex_->hasFocus())hex_->setText(colorValueHex(current_));
    previousButton_->swatch=previous_;currentButton_->swatch=current_;previousButton_->invalidate();currentButton_->invalidate();updating_=false;if(!bounds().isEmpty())setBounds(bounds());layout();invalidate();
  }
  void apply(std::uint32_t color,bool derive=true){current_=color;sync(derive);if(changed_)changed_(color);}
  void updateField(int i,double value){const auto fields=colorValueFields(mode_);if(i>=int(fields.size())||!std::isfinite(value))return;values_[i]=std::clamp(value,double(fields[i].minimum),double(fields[i].maximum));apply(colorFromValues(mode_,values_,current_),false);}
  void commitHex(){if(updating_)return;std::uint32_t next;if(pickerParseRgbaHex(unicodeText(hex_->text()),next,int(current_>>24)))apply(next);hex_->setText(colorValueHex(current_));}
  bool samplingFilters_=false;
  void samplingFilters(bool enabled){
    if(enabled==samplingFilters_)return;samplingFilters_=enabled;
    auto manager=ui::Manager::getDefault();
    for(auto type:{ui::kMouseDownMessage,ui::kMouseMoveMessage,ui::kMouseUpMessage,ui::kFocusLeaveMessage,ui::kKeyDownMessage}){
      if(enabled)manager->addMessageFilter(type,this);else manager->removeMessageFilter(type,this);
    }
  }
  void setSampling(bool sampling){samplingFilters(sampling&&bool(canvasSamplingInput));sampling_=sampling;if(sampling){resident_=true;setClickBehavior(ClickBehavior::DoNothingOnClick);}sample_->active=sampling;sample_->invalidate();if(samplingChanged_)samplingChanged_(sampling);}
  void layout(){
    const auto r=uiLogical(bounds());const int x=r.x+6,y=r.y+DialogLayout::bodyTop,w=r.w-12;
    auto place=[](ui::Widget* child,gfx::Rect rect){child->setBounds(uiPhysical(rect));};
    close_->icon="close";layoutHeaderButton(close_);
    const int gap=2,hexWidth=hex_->widthForValue(U"#FFFFFFFF");
    const int modeWidth=w-hexWidth-40-22-3*gap;
    int base=-4;for(auto tab:tabs_)base+=font_.measure(tab->caption)+8;
    const int extra=modeWidth-base;
    int at=x;for(int i=0;i<5;++i){const int width=font_.measure(tabs_[i]->caption)+8+extra*(i+1)/5-extra*i/5;place(tabs_[i],{at,y,width,textControlHeight});at+=width-1;}
    at=x+modeWidth+gap;hex_->setFixedContentWidth(hexWidth);place(hex_,{at,y,hexWidth,textControlHeight});
    at+=hexWidth+gap;place(previousButton_,{at,y,20,textControlHeight});place(currentButton_,{at+20,y,20,textControlHeight});
    place(sample_,{at+40+gap,y,22,textControlHeight});
    const auto fields=colorValueFields(mode_);for(int i=0;i<int(fields.size());++i){const int width=std::max(entries_[i]->widthForValue(unicodeText(std::to_string(fields[i].minimum))),entries_[i]->widthForValue(unicodeText(std::to_string(fields[i].maximum))));entries_[i]->setFixedContentWidth(width);place(sliders_[i],{x+27,y+22+i*22,w-27-width-2,textControlHeight});place(entries_[i],{x+w-width,y+22+i*22,width,textControlHeight});}
    const int columns=std::max(1,w/15);for(int i=0;i<int(paletteButtons_.size());++i){place(paletteButtons_[i],{x+(i%columns)*15,y+22+(i/columns)*15,16,16});paletteButtons_[i]->setVisible(mode_==ColorValueMode::Palette && y+22+(i/columns)*15+16<=r.y2()-6);}
  }
public:
  std::function<bool(ui::Message*)> canvasSamplingInput;
  ~ColorEditorPopup(){samplingFilters(false);if(sampling_)try{setSampling(false);}catch(...){}}
  ColorEditorPopup(const PixelFont& font,const Skin& skin,const Skin& icons,std::filesystem::path storage)
    :PixelDialog(skin,"",ClickBehavior::CloseOnClickInOtherWindow,EnterBehavior::DoNothingOnEnter),font_(font),skin_(skin),icons_(icons),storage_(std::move(storage)){
    setAutoRemap(false);setWantFocus(true);setTransparent(true);
    close_=button(U"",[this]{commitHex();closeWindow(nullptr);});close_->iconSkin=&icons_;
    const char32_t* names[]{U"HSV",U"RGB",U"LAB",U"GRAY",U"PLT"};
    for(int i=0;i<5;++i)tabs_[i]=button(names[i],[this,i]{commitHex();mode_=modes_[i];sync(true);});
    hex_=new PixelEntry(font_,skin_);addChild(hex_);hex_->accept=[this]{commitHex();};hex_->blur=[this]{commitHex();};hex_->cancel=[this]{commitHex();closeWindow(nullptr);};
    auto copy=[this](bool previous){clip::set_text(colorValueHex(previous?previous_:current_));};
    previousButton_=button(U"",[copy]{copy(true);});currentButton_=button(U"",[copy]{copy(false);});previousButton_->recentColorSwatch=currentButton_->recentColorSwatch=true;previousButton_->swatchOpenEdges=2;currentButton_->swatchOpenEdges=1;
    sample_=button(U"",[this]{setSampling(!sampling_);});sample_->iconSkin=&icons_;sample_->icon="tool-eyedropper-normal";
    for(int i=0;i<5;++i){auto slider=new PixelSlider(font_,skin_);addChild(slider);sliders_[i]=slider;slider->numberSuffix=U"";slider->changed=[this,i](int v){updateField(i,v);};
      slider->colorGradient=[this,i](double t){auto next=values_;const auto fields=colorValueFields(mode_);if(i>=int(fields.size()))return current_;next[i]=fields[i].minimum+t*(fields[i].maximum-fields[i].minimum);return colorFromValues(mode_,next,current_);};
      auto entry=new PixelEntry(font_,skin_);addChild(entry);entries_[i]=entry;entry->numeric=true;entry->Change.connect([this,i,entry]{if(updating_)return;try{std::size_t used=0;const double v=std::stod(entry->text(),&used);if(used==entry->text().size())updateField(i,v);}catch(...){}});entry->blur=[this]{sync(false);};entry->accept=[this]{sync(false);};entry->cancel=[this]{commitHex();closeWindow(nullptr);};}
    Close.connect([this](ui::CloseEvent&){commitHex();if(sampling_)setSampling(false);changed_={};samplingChanged_={};try{std::filesystem::create_directories(storage_.parent_path());std::ofstream out(storage_);out<<bounds().w/uiScale<<' '<<bounds().h/uiScale;}catch(const std::exception&){ /* A read-only preference directory must not prevent closing. */ }});
  }
  int preferredHeight()const{
    const int rows=std::max(1,int(colorValueFields(mode_).size()));
    const int rowHeight=mode_==ColorValueMode::Palette?16:textControlHeight;
    return DialogLayout::bodyTop+textControlHeight+2+rows*rowHeight+(rows-1)*2+6;
  }
  void open(gfx::Rect trigger,gfx::Rect viewport,std::uint32_t color,std::u32string role,const std::vector<std::uint32_t>& palette,std::function<void(std::uint32_t)> changed,std::function<void(bool)> samplingChanged){
    previous_=current_=color;role_=std::move(role);changed_=std::move(changed);samplingChanged_=std::move(samplingChanged);sample_->setEnabled(bool(samplingChanged_));resident_=sampling_=false;setClickBehavior(ClickBehavior::CloseOnClickInOtherWindow);
    for(auto b:paletteButtons_){removeChild(b);delete b;}paletteButtons_.clear();for(auto c:palette){auto b=button(U"",[this,c]{apply(c);});b->paletteCell=true;b->swatch=c;paletteButtons_.push_back(b);}
    int w=320,h=preferredHeight();std::ifstream in(storage_);in>>w>>h;w=std::clamp(w,1,640);h=std::clamp(h,1,500);const auto floor=minimumDialogSize(w*uiScale);w=std::max(floor.w,std::min(w*uiScale,viewport.w));h=std::max(floor.h,std::min(h*uiScale,viewport.h));
    const int x=std::clamp(trigger.x,viewport.x,std::max(viewport.x,viewport.x2()-w)),y=trigger.y2()+h<=viewport.y2()?trigger.y2():std::max(viewport.y,trigger.y-h);
    setBounds({x,y,w,h});sync(true);openWindow();
  }
  bool sampling()const{return sampling_;}
  void sampled(std::uint32_t color){apply(color);}
  void finishSampling(){if(sampling_)setSampling(false);}
  void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());if(hex_)layout();}
  gfx::Size minimumDialogSize(int)const override {
    int tabs=-4;for(auto tab:tabs_)tabs+=font_.measure(tab->caption)+8;
    return {(12+tabs+hex_->widthForValue(U"#FFFFFFFF")+40+22+6)*uiScale,preferredHeight()*uiScale};
  }
  void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"颜色编辑 "+role_);const auto fields=colorValueFields(mode_);for(int i=0;i<int(fields.size());++i)font_.draw(g,unicodeText(fields[i].label),r.x+6,r.y+DialogLayout::bodyTop+DialogLayout::rowStep+i*DialogLayout::rowStep+5,skin_["text"]);if(mode_==ColorValueMode::Palette&&paletteButtons_.empty())font_.draw(g,U"颜色板为空",r.x+6,r.y+49,skin_["muted"]);}
  bool onProcessMessage(ui::Message* msg)override{
    if(sampling_&&canvasSamplingInput&&canvasSamplingInput(msg))return true;
    if(msg->type()==ui::kMouseDownMessage&&!msg->fromFilter()){auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()&&m->position().y<bounds().y+20*uiScale){titlePress_=m->position();titleHeld_=true;}}
    if(titleHeld_&&msg->type()==ui::kMouseMoveMessage&&hasCapture()){auto p=static_cast<ui::MouseMessage*>(msg)->position()-titlePress_;if(std::hypot(double(p.x),double(p.y))>=3*uiScale){resident_=true;setClickBehavior(ClickBehavior::DoNothingOnClick);}}
    if(msg->type()==ui::kMouseUpMessage)titleHeld_=false;
    if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){if(sampling_){setSampling(false);return true;}commitHex();closeWindow(nullptr);return true;}
    return PixelPopupWindow::onProcessMessage(msg);
  }
  std::uint32_t color()const{return current_;}
  void testSampling(){setSampling(true);}
  void smoke(){
    auto check=[](bool v,const char* why){if(!v)throw std::runtime_error(why);};
    check(icons_.assets.patches.count(sample_->icon)!=0,"Missing legacy eyedropper icon");
    check(skin_.assets.patches.count("icon.marker-light") && skin_.assets.patches.count("icon.marker-dark"),"Missing shared picker markers");
    check(previousButton_->bounds().x2()==currentButton_->bounds().x && previousButton_->swatchOpenEdges==2 && currentButton_->swatchOpenEdges==1,"Comparison swatches must join without middle border");
    check(hex_->bounds().w==hex_->widthForValue(U"#FFFFFFFF")*uiScale,"HEX content width");
    const auto original=bounds();
    for(int width:{360,400,540}){
      setBounds({original.x,original.y,width*uiScale,preferredHeight()*uiScale});
      check(bounds().h==preferredHeight()*uiScale,"Editor preferred content height");
      check(hex_->bounds().x-tabs_.back()->bounds().x2()==2*uiScale && previousButton_->bounds().x-hex_->bounds().x2()==2*uiScale && sample_->bounds().x-currentButton_->bounds().x2()==2*uiScale,"Editor toolbar group spacing");
      check(sample_->bounds().x2()==bounds().x2()-6*uiScale,"Editor toolbar fills width");
      check(bounds().y2()-entries_[3]->bounds().y2()==6*uiScale,"Editor bottom content padding");
    }
    setBounds({original.x,original.y,40*uiScale,40*uiScale});
    tabs_[3]->Click();tabs_[0]->Click();
    check(bounds().w>=minimumDialogSize(bounds().w).w && bounds().h>=minimumDialogSize(bounds().w).h,"Editor must preserve content floor across mode switches");
    setBounds({original.x,original.y,original.w,preferredHeight()*uiScale});
    tabs_[1]->Click();entries_[0]->setText("17");entries_[0]->Change();check((current_&255)==17,"RGB editor channel binding");
    const auto alpha=current_>>24;hex_->setText("#AABBCC");commitHex();check(current_==((alpha<<24)|0xccbbaa),"HEX retains fallback alpha");hex_->setText("invalid");commitHex();check(hex_->text()==colorValueHex(current_),"Invalid HEX resets");
    for(int i=0;i<5;++i){tabs_[i]->Click();check(tabs_[i]->active,"Editor mode tab selection");for(auto s:sliders_)if(s->isVisible())check(s->bounds().h==textControlHeight*uiScale,"Color slider shared height");}
    if(!paletteButtons_.empty()){auto expected=paletteButtons_[0]->swatch;paletteButtons_[0]->Click();check(current_==expected,"Palette editor selection");}
    tabs_[0]->Click();for(auto child:children())if(child->isVisible())check(bounds().contains(child->bounds()),"Color editor control outside window");
    for(int width:{120,240,300})for(bool hover:{false,true}){
      const gfx::Rect border(4*uiScale,4*uiScale,width*uiScale,textControlHeight*uiScale);const auto material=skin_.selectionMaterialBounds(border);
      auto mask=os::instance()->makeRgbaSurface((width+8)*uiScale,(textControlHeight+8)*uiScale);mask->clear();{ui::Graphics g(mask);UiPaintScale scale(g);skin_.drawSelectionBorder(g,border,hover);}
      os::SurfaceLock lock(mask.get());for(int y=0;y<mask->height();++y)for(int x=0;x<mask->width();++x)check(skin_.selectionContains(material,{x,y})==(gfx::geta(mask->getPixel(x,y))!=0),"Color slider selection alpha/hit mismatch");
    }
  }
};
}
