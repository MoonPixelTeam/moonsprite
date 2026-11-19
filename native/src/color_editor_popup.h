#pragma once
#include "color_value_model.h"
#include "color_editor_modes.h"
#include "native_widgets.h"
#include "native_status_toast.h"
#include "native_palette_selection.h"
#include "native_color_editor_palette.h"
#include "ui/tooltips.h"
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
  PixelStatusToast copyToast_;
  ui::Timer copyFeedback_{900,this};int copiedSwatch_=0;
  std::function<void(const std::string&)> clipboard_=[](const auto& text){clip::set_text(text);};
  std::function<std::optional<std::string>()> readClipboard_=[]()->std::optional<std::string>{std::string text;if(clip::get_text(text))return text;return {};};
  ui::TooltipManager* paletteTips_=nullptr;
  std::vector<ColorEditorPaletteEntry> paletteEntries_;
  PixelScrollBar* paletteBar_=nullptr;
  gfx::Rect paletteViewport_;int paletteScroll_=0,paletteTotal_=0;
  std::vector<PaletteSelectionEdge> paletteContour_;
  bool paletteHover_=false;
  bool paletteFilters_=false;
  void paintPaletteSelection(ui::Graphics& g,gfx::Point origin)const{
    if(mode_==ColorValueMode::Palette)paintPaletteContour(skin_,paletteContour_,g,origin,paletteViewport_,paletteHover_);
  }
  class ComparisonSwatch final:public StatusToastControl<PixelButton>{
  public:
    using StatusToastControl<PixelButton>::StatusToastControl;
    void onPaint(ui::PaintEvent& ev)override{
      PixelButton::onPaint(ev);
      if(active){auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());
        g.fillRect(skin_["accent"],{r.x,r.y,r.w,1});g.fillRect(skin_["accent"],{r.x,r.y2()-1,r.w,1});
        if(!(swatchOpenEdges&1))g.fillRect(skin_["accent"],{r.x,r.y,1,r.h});
        if(!(swatchOpenEdges&2))g.fillRect(skin_["accent"],{r.x2()-1,r.y,1,r.h});}
      toast().paint(*ev.graphics(),bounds().origin());
    }
  };
  class HexEntry final:public StatusToastControl<PixelEntry>{
    bool rightHeld_=false;
  public:
    using StatusToastControl<PixelEntry>::StatusToastControl;
    std::function<void()> pasteColor;
    void cancelContextGesture(){rightHeld_=false;if(hasCapture())releaseMouse();}
    bool onProcessMessage(ui::Message* msg)override{
      if(msg->type()==ui::kMouseDownMessage||msg->type()==ui::kMouseUpMessage){
        const auto mouse=static_cast<ui::MouseMessage*>(msg);
        if(mouse->right()){
          if(msg->type()==ui::kMouseDownMessage){if(isEnabled()){rightHeld_=true;captureMouse();}return true;}
          const bool paste=rightHeld_&&isEnabled()&&bounds().contains(mouse->position());rightHeld_=false;if(hasCapture())releaseMouse();if(paste&&pasteColor)pasteColor();return true;
        }
      }
      if(rightHeld_&&msg->type()==ui::kMouseMoveMessage)return true;
      if(rightHeld_&&(msg->type()==ui::kFocusLeaveMessage||(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc)))cancelContextGesture();
      if(msg->type()==ui::kKeyDownMessage){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyMenu||(key->scancode()==ui::kKeyF10&&key->onlyShiftPressed())){if(isEnabled()&&pasteColor)pasteColor();return true;}}
      return PixelEntry::onProcessMessage(msg);
    }
  };
  class PaletteChoice final:public StatusToastControl<PixelButton>{
    bool held_=false;
  public:
    int colorId=0;
    std::function<void()> reveal;
    std::function<void(ui::Graphics&,gfx::Point)> paintSelection;
    std::function<bool(gfx::Point)> outlineContains;
    std::function<void(gfx::Point)> pointerMoved;
    using StatusToastControl<PixelButton>::StatusToastControl;
    gfx::Rect border()const{return gfx::Rect(*paletteMaterialRect).offset(bounds().origin());}
    bool selectionHit(gfx::Point point)const{return active&&outlineContains(point);}
    void onPaint(ui::PaintEvent& ev)override{
      // The shared palette cell paints the original full swatch. Selection owns
      // the external material, with the same helper used by pointer hit tests.
      PixelButton::onPaint(ev);
      if(paintSelection)paintSelection(*ev.graphics(),bounds().origin());
      toast().paint(*ev.graphics(),bounds().origin());
    }
    bool onProcessMessage(ui::Message* msg)override{
      if(msg->type()==ui::kFocusEnterMessage&&reveal)reveal();
      if(pointerMoved&&(msg->type()==ui::kMouseMoveMessage||msg->type()==ui::kMouseEnterMessage||msg->type()==ui::kMouseLeaveMessage))pointerMoved(static_cast<ui::MouseMessage*>(msg)->position());
      if(msg->type()==ui::kMouseDownMessage||msg->type()==ui::kMouseUpMessage){
        auto mouse=static_cast<ui::MouseMessage*>(msg);if(!mouse->left())return false;
        const bool inside=paletteViewport().contains(mouse->position())&&(border().contains(mouse->position())||selectionHit(mouse->position()));
        if(msg->type()==ui::kMouseDownMessage){if(!isEnabled()||!inside)return false;held_=true;requestFocus();captureMouse();setSelected(true);return true;}
        if(held_){held_=false;releaseMouse();setSelected(false);if(inside&&isEnabled())Click();return true;}
        return false;
      }
      if(held_&&msg->type()==ui::kFocusLeaveMessage){held_=false;releaseMouse();setSelected(false);}
      if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc&&held_){held_=false;releaseMouse();setSelected(false);return true;}
      return PixelButton::onProcessMessage(msg);
    }
  };
  ColorValueMode mode_=ColorValueMode::Hsv;
  ColorValues values_{};std::uint32_t previous_=0,current_=0;
  bool updating_=false,resident_=false,sampling_=false,editingEnabled_=true;
  gfx::Point titlePress_;bool titleHeld_=false;
  std::array<PixelButton*,7> tabs_{};
  inline static std::vector<color_editor::Mode> sharedModes_=color_editor::defaults();
  inline static std::vector<ColorEditorPopup*> instances_;
  inline static const void* paletteProviderOwner_=nullptr;
  inline static std::function<std::vector<ColorEditorPaletteEntry>()> paletteProvider_;
  std::array<PixelSlider*,5> sliders_{};
  std::array<PixelEntry*,5> entries_{};
  PixelEntry* hex_=nullptr;PixelButton *previousButton_=nullptr,*currentButton_=nullptr,*close_=nullptr,*sample_=nullptr;
  std::vector<PixelButton*> paletteButtons_;
  std::filesystem::path storage_;std::u32string role_;
  std::function<void(std::uint32_t)> changed_,committed_;
  std::uint32_t committedColor_=0;
  std::function<void(bool)> samplingChanged_;
  inline static constexpr ColorValueMode modes_[]{ColorValueMode::Hsv,ColorValueMode::Rgb,ColorValueMode::Lab,ColorValueMode::Gray,ColorValueMode::Palette,ColorValueMode::Hsl,ColorValueMode::Cmyk};
  PixelButton* button(std::u32string text,std::function<void()> action){auto b=new StatusToastControl<PixelButton>(copyToast_,font_,skin_,std::move(text),std::move(action));addChild(b);return b;}
  void refreshCopyFeedback(){
    copyToast_.text=copiedSwatch_?U"已复制 "+unicodeText(colorValueHex(copiedSwatch_==1?previous_:committedColor_)):U"";
    previousButton_->active=copiedSwatch_==1;currentButton_->active=copiedSwatch_==2;
    previousButton_->invalidate();currentButton_->invalidate();
    if(!bounds().isEmpty())copyToast_.place(currentButton_->bounds(),bounds());
    invalidate();
  }
  void copySwatch(bool previous){
    clipboard_(colorValueHex(previous?previous_:committedColor_));
    copiedSwatch_=previous?1:2;copyFeedback_.stop();copyFeedback_.start();refreshCopyFeedback();
  }
  void paletteFilters(bool enabled){
    if(paletteFilters_==enabled)return;paletteFilters_=enabled;
    for(auto type:{ui::kMouseWheelMessage,ui::kMouseDownMessage}){
      if(type==ui::kMouseDownMessage&&samplingFilters_)continue;
      if(enabled)ui::Manager::getDefault()->addMessageFilter(type,this);
      else ui::Manager::getDefault()->removeMessageFilter(type,this);
    }
  }
  void updatePalette(const std::vector<ColorEditorPaletteEntry>& palette){
    if(palette==paletteEntries_)return;
    // Remove the tooltip timer before retiring a target. TooltipManager keeps
    // a pending target pointer, so merely removing its map entry is insufficient.
    if(paletteTips_){removeChild(paletteTips_);delete paletteTips_;}
    paletteTips_=new ui::TooltipManager;addChild(paletteTips_);
    std::unordered_map<int,std::vector<PixelButton*>> available;
    for(auto it=paletteButtons_.rbegin();it!=paletteButtons_.rend();++it)available[static_cast<PaletteChoice*>(*it)->colorId].push_back(*it);
    paletteButtons_.clear();paletteEntries_=palette;
    for(const auto& entry:palette){const int index=int(paletteButtons_.size());auto& existing=available[entry.id];PaletteChoice* b;
      if(existing.empty()){b=new PaletteChoice(copyToast_,font_,skin_,U"",[]{});addChild(b);b->Click.connect([this,b]{if(b->isEnabled()&&b->parent()==this){apply(b->swatch);commitColor();}});}
      else{b=static_cast<PaletteChoice*>(existing.back());existing.pop_back();}
      b->setEnabled(editingEnabled_);b->colorId=entry.id;b->swatch=entry.color;b->active=entry.color==current_;
      b->paletteCell=true;b->paletteSharedSelection=true;b->paletteViewport=[this]{return paletteViewport_;};
      b->reveal=[this,index]{revealPalette(index);};
      b->outlineContains=[this](gfx::Point point){return paletteViewport_.contains(point)&&paletteContourContains(skin_,paletteContour_,point);};
      b->paintSelection=[this](ui::Graphics& g,gfx::Point origin){paintPaletteSelection(g,origin);};
      b->pointerMoved=[this](gfx::Point point){const bool hover=paletteViewport_.contains(point)&&paletteContourContains(skin_,paletteContour_,point);if(hover!=paletteHover_){paletteHover_=hover;invalidate();}};
      paletteButtons_.push_back(b);
      moveChildTo(b,children().back());
      paletteTips_->addTooltipFor(b,utf8Text(entry.name)+" · "+colorValueHex(entry.color));
    }
    for(auto& group:available)for(auto b:group.second){if(b->hasFocus())requestFocus();if(b->hasCapture())b->releaseMouse();b->setVisible(false);b->setEnabled(false);removeChild(b);b->deferDelete();}
    if(!bounds().isEmpty()){layout();invalidate();}
  }
  void replacePalette(const std::vector<std::uint32_t>& palette){
    std::vector<ColorEditorPaletteEntry> entries;for(auto color:palette)entries.push_back({int(entries.size())+1,U"",color});updatePalette(entries);
  }
  void pasteHex(){
    std::optional<std::string> text;try{text=readClipboard_();}catch(...){return;}
    std::uint32_t color;if(text&&!text->empty()&&pickerParseRgbaHex(unicodeText(*text),color,int(current_>>24))){apply(color);commitColor();hex_->setText(colorValueHex(current_));}
  }
  void revealPalette(int index){
    if(mode_!=ColorValueMode::Palette||index<0||index>=int(paletteButtons_.size()))return;
    const auto cell=gfx::Rect(*paletteButtons_[index]->paletteMaterialRect).offset(paletteButtons_[index]->bounds().origin());
    if(cell.y<paletteViewport_.y)paletteScroll_-=paletteViewport_.y-cell.y;
    else if(cell.y2()>paletteViewport_.y2())paletteScroll_+=cell.y2()-paletteViewport_.y2();
    layout();invalidate();
  }
  void sync(bool derive){
    if(derive)values_=colorToValues(current_,mode_);
    updating_=true;const auto fields=colorValueFields(mode_);
    for(int i=0;i<5;++i){const bool show=i<int(fields.size());entries_[i]->setVisible(show);sliders_[i]->setVisible(show);if(show){entries_[i]->numericMinimum=fields[i].minimum;entries_[i]->numericMaximum=fields[i].maximum;sliders_[i]->minimum=fields[i].minimum;sliders_[i]->maximum=fields[i].maximum;sliders_[i]->percentage=fields[i].percentage;sliders_[i]->value=int(std::floor(values_[i]+.5));if(!entries_[i]->hasFocus())entries_[i]->setText(std::to_string(int(std::floor(values_[i]+.5))));sliders_[i]->invalidate();}}
    for(int i=0;i<7;++i){tabs_[i]->setVisible(color_editor::enabled(sharedModes_,i));tabs_[i]->active=mode_==modes_[i];tabs_[i]->invalidate();}
    for(auto b:paletteButtons_){b->active=b->swatch==current_;b->invalidate();}
    if(!hex_->hasFocus())hex_->setText(colorValueHex(current_));
    previousButton_->swatch=previous_;currentButton_->swatch=committedColor_;updating_=false;if(!bounds().isEmpty())setBounds(bounds());layout();refreshCopyFeedback();
  }
  void commitColor(){if(current_==committedColor_)return;committedColor_=current_;currentButton_->swatch=committedColor_;refreshCopyFeedback();if(committed_)committed_(current_);}
  void apply(std::uint32_t color,bool derive=true){if(!editingEnabled_)return;current_=color;sync(derive);if(changed_)changed_(color);}
  void updateField(int i,double value){const auto fields=colorValueFields(mode_);if(i>=int(fields.size())||!std::isfinite(value))return;values_[i]=std::clamp(value,double(fields[i].minimum),double(fields[i].maximum));apply(colorFromValues(mode_,values_,current_),false);}
  void commitHex(){if(updating_||!editingEnabled_)return;std::uint32_t next;if(pickerParseRgbaHex(unicodeText(hex_->text()),next,int(current_>>24))&&next!=current_)apply(next);hex_->setText(colorValueHex(current_));commitColor();}
  bool samplingFilters_=false;
  void samplingFilters(bool enabled){
    if(enabled==samplingFilters_)return;samplingFilters_=enabled;
    auto manager=ui::Manager::getDefault();
    for(auto type:{ui::kMouseDownMessage,ui::kMouseMoveMessage,ui::kMouseUpMessage,ui::kFocusLeaveMessage,ui::kKeyDownMessage}){
      if(type==ui::kMouseDownMessage&&paletteFilters_)continue;
      if(enabled)manager->addMessageFilter(type,this);else manager->removeMessageFilter(type,this);
    }
  }
  void setSampling(bool sampling){samplingFilters(sampling&&bool(canvasSamplingInput));sampling_=sampling;if(sampling){resident_=true;setClickBehavior(ClickBehavior::DoNothingOnClick);}sample_->active=sampling;sample_->invalidate();if(samplingChanged_)samplingChanged_(sampling);}
  void layout(){
    const auto origin=bounds().origin();const auto r=uiLogical(gfx::Rect(bounds().size()));const int x=6,y=DialogLayout::bodyTop,w=r.w-12;
    auto place=[origin](ui::Widget* child,gfx::Rect rect){child->setBounds(uiDisplayRect(rect,origin));};
    close_->icon="close";layoutHeaderButton(close_);
    const int gap=2,hexWidth=hex_->widthForValue(U"#FFFFFFFF");
    const int modeWidth=w-hexWidth-40-22-3*gap;
    const auto visible=availableModes();const int count=int(visible.size());
    int base=1-count;for(int i:visible)base+=font_.measure(tabs_[i]->caption)+8;
    const int extra=modeWidth-base;
    int at=x;for(int n=0;n<count;++n){auto tab=tabs_[visible[n]];const int width=font_.measure(tab->caption)+8+extra*(n+1)/count-extra*n/count;place(tab,{at,y,width,textControlHeight});at+=width-1;}
    at=x+modeWidth+gap;hex_->setFixedContentWidth(hexWidth);place(hex_,{at,y,hexWidth,textControlHeight});
    at+=hexWidth+gap;place(previousButton_,{at,y,20,textControlHeight});place(currentButton_,{at+20,y,20,textControlHeight});
    place(sample_,{at+40+gap,y,22,textControlHeight});
    const auto fields=colorValueFields(mode_);for(int i=0;i<int(fields.size());++i){const int width=std::max(entries_[i]->widthForValue(unicodeText(std::to_string(fields[i].minimum))),entries_[i]->widthForValue(unicodeText(std::to_string(fields[i].maximum))));entries_[i]->setFixedContentWidth(width);place(sliders_[i],{x+27,y+22+i*22,w-27-width-2,textControlHeight});place(entries_[i],{x+w-width,y+22+i*22,width,textControlHeight});}
    const auto body=uiDisplayRect({x,y+22,w,std::max(16,r.h-6-y-22)},origin);
    paletteViewport_=body;
    auto columns=[&]{return std::max(1,(paletteViewport_.w-uiScale)/(15*uiScale));};
    auto total=[&]{const int rows=(int(paletteButtons_.size())+columns()-1)/columns();return rows?((rows-1)*15+16)*uiScale:0;};
    const bool overflow=total()>body.h;if(overflow)paletteViewport_.w-=7*uiScale;
    paletteTotal_=total();paletteScroll_=std::clamp(paletteScroll_,0,std::max(0,paletteTotal_-body.h));
    paletteBar_->setDockBounds(PixelScrollBar::edgeBounds(body,true));paletteBar_->configure(paletteTotal_,body.h,paletteScroll_);
    paletteBar_->setVisible(mode_==ColorValueMode::Palette&&overflow);
    const int paletteColumns=columns();for(int i=0;i<int(paletteButtons_.size());++i){
      const auto full=uiDisplayRect({(i%paletteColumns)*15,(i/paletteColumns)*15,16,16},paletteViewport_.origin()).offset(0,-paletteScroll_);
      auto clipped=(paletteButtons_[i]->active?skin_.selectionMaterialBounds(full):full)&paletteViewport_;if(clipped.isEmpty())clipped={paletteViewport_.x,paletteViewport_.y,0,0};
      auto b=paletteButtons_[i];b->paletteMaterialRect=gfx::Rect(full).offset(-clipped.origin());b->setBounds(clipped);
      // Empty visible bounds keep offscreen buttons in the native Tab order;
      // focus entry reveals them before the next paint, like browser overflow.
      b->setVisible(mode_==ColorValueMode::Palette);
    }
    std::vector<bool> selected;for(auto b:paletteButtons_)selected.push_back(b->active);
    paletteContour_=paletteSelectionContour(skin_,selected,paletteColumns,
      {paletteViewport_.x,paletteViewport_.y-paletteScroll_,16*uiScale,16*uiScale},15,16);
    copyToast_.place(currentButton_->bounds(),bounds());
  }
public:
  std::function<bool(ui::Message*)> canvasSamplingInput;
  ~ColorEditorPopup(){copyFeedback_.stop();paletteFilters(false);instances_.erase(std::remove(instances_.begin(),instances_.end(),this),instances_.end());samplingFilters(false);if(sampling_)try{setSampling(false);}catch(...){}}
  ColorEditorPopup(const PixelFont& font,const Skin& skin,const Skin& icons,std::filesystem::path storage)
    :PixelDialog(skin,"",ClickBehavior::CloseOnClickInOtherWindow,EnterBehavior::DoNothingOnEnter),font_(font),skin_(skin),icons_(icons),copyToast_(font,skin),storage_(std::move(storage)){
    setAutoRemap(false);setWantFocus(true);setTransparent(true);
    close_=button(U"",[this]{commitHex();closeWindow(nullptr);});close_->iconSkin=&icons_;
    const char32_t* names[]{U"HSV",U"RGB",U"LAB",U"GRAY",U"PLT",U"HSL",U"CMYK"};
    for(int i=0;i<7;++i)tabs_[i]=button(names[i],[this,i]{commitHex();if(color_editor::enabled(sharedModes_,i)){if(mode_!=modes_[i])paletteScroll_=0;mode_=modes_[i];sync(true);}});
    auto hex=new HexEntry(copyToast_,font_,skin_);hex_=hex;hex->pasteColor=[this]{pasteHex();};addChild(hex_);hex_->accept=[this]{commitHex();};hex_->blur=[this]{commitHex();};hex_->cancel=[this]{commitHex();closeWindow(nullptr);};
    previousButton_=new ComparisonSwatch(copyToast_,font_,skin_,U"",[this]{copySwatch(true);});addChild(previousButton_);
    currentButton_=new ComparisonSwatch(copyToast_,font_,skin_,U"",[this]{copySwatch(false);});addChild(currentButton_);
    previousButton_->recentColorSwatch=currentButton_->recentColorSwatch=true;previousButton_->swatchOpenEdges=2;currentButton_->swatchOpenEdges=1;
    sample_=button(U"",[this]{setSampling(!sampling_);});sample_->iconSkin=&icons_;sample_->icon="tool-eyedropper-normal";
    paletteBar_=new StatusToastControl<PixelScrollBar>(copyToast_,skin_,true);addChild(paletteBar_);paletteBar_->wheelStep=15*uiScale;paletteBar_->changed=[this](int value){paletteScroll_=value;layout();invalidate();};
    copyFeedback_.Tick.connect([this]{copyFeedback_.stop();copiedSwatch_=0;refreshCopyFeedback();});
    for(int i=0;i<5;++i){auto slider=new StatusToastControl<PixelSlider>(copyToast_,font_,skin_);addChild(slider);sliders_[i]=slider;slider->colorEditorInteraction=true;slider->numberSuffix=U"";slider->changed=[this,i](int v){updateField(i,v);};slider->interactionCommit=[this]{commitColor();};
      slider->colorGradient=[this,i](double t){auto next=values_;const auto fields=colorValueFields(mode_);if(i>=int(fields.size()))return current_;next[i]=fields[i].minimum+t*(fields[i].maximum-fields[i].minimum);return colorFromValues(mode_,next,current_);};
      auto entry=new StatusToastControl<PixelEntry>(copyToast_,font_,skin_);addChild(entry);entries_[i]=entry;entry->numeric=true;entry->numericSteppers=true;entry->numericExpressionFilter=true;entry->deferredNumeric=true;entry->numericValue=[this,i]{return std::floor(values_[i]+.5);};entry->deferredCommit=[this,i,entry]{if(updating_)return;try{std::size_t used=0;const double v=std::stod(entry->text(),&used);if(used==entry->text().size()&&std::isfinite(v)&&v!=std::floor(values_[i]+.5)){updateField(i,v);commitColor();}}catch(...){}};entry->wheel=[this,i,entry](int delta){const auto fields=colorValueFields(mode_);if(i>=int(fields.size()))return;const auto next=std::clamp(std::floor(values_[i]+.5)+delta,double(fields[i].minimum),double(fields[i].maximum));if(next!=std::floor(values_[i]+.5)){updateField(i,next);commitColor();}entry->restoreNumericDraft();};entry->blur=[this]{sync(false);};entry->accept=[entry]{entry->releaseFocus();};entry->cancel=[this]{commitHex();closeWindow(nullptr);};}
    Close.connect([this](ui::CloseEvent&){static_cast<HexEntry*>(hex_)->cancelContextGesture();commitHex();if(sampling_)setSampling(false);paletteFilters(false);changed_={};committed_={};samplingChanged_={};try{std::filesystem::create_directories(storage_.parent_path());std::ofstream out(storage_);out<<bounds().w/uiScale<<' '<<bounds().h/uiScale;}catch(const std::exception&){ /* A read-only preference directory must not prevent closing. */ }});
    mode_=modes_[availableModes().front()];instances_.push_back(this);
    for(int i=0;i<7;++i)tabs_[i]->setVisible(color_editor::enabled(sharedModes_,i));
  }
  static void setModePreferences(const std::vector<color_editor::Mode>& modes){
    sharedModes_=color_editor::normalize(modes);
    for(auto popup:instances_)popup->refreshModePreferences();
  }
  static const std::vector<color_editor::Mode>& modePreferences(){return sharedModes_;}
  static void setPaletteProvider(const void* owner,std::function<std::vector<ColorEditorPaletteEntry>()> provider){paletteProviderOwner_=owner;paletteProvider_=std::move(provider);}
  static void clearPaletteProvider(const void* owner){if(paletteProviderOwner_==owner){paletteProvider_={};paletteProviderOwner_=nullptr;}}
  static void refreshActivePalettes(){
    if(!paletteProvider_||std::none_of(instances_.begin(),instances_.end(),[](auto popup){return popup->isVisible();}))return;
    const auto palette=paletteProvider_();for(auto popup:instances_)if(popup->isVisible())popup->updatePalette(palette);
  }
  std::vector<int> availableModes()const{std::vector<int> result;for(const auto& item:sharedModes_)if(item.enabled)result.push_back(color_editor::catalogIndex(item.id));return result;}
  void refreshModePreferences(){
    if(!color_editor::enabled(sharedModes_,int(mode_))){mode_=modes_[availableModes().front()];paletteScroll_=0;}
    if(!bounds().isEmpty())sync(true);
  }
  ColorValueMode mode()const{return mode_;}
  void testMode(ColorValueMode mode){tabs_.at(int(mode))->Click();}
  int preferredHeight()const{
    const int rows=std::max(1,int(colorValueFields(mode_).size()));
    const int rowHeight=mode_==ColorValueMode::Palette?16:textControlHeight;
    return DialogLayout::bodyTop+textControlHeight+2+rows*rowHeight+(rows-1)*2+6;
  }
  void open(gfx::Rect trigger,gfx::Rect viewport,std::uint32_t color,std::u32string role,const std::vector<std::uint32_t>& palette,std::function<void(std::uint32_t)> changed,std::function<void(bool)> samplingChanged,std::function<void(std::uint32_t)> committed={}){
    finishSampling();
    setEditingEnabled(true);committedColor_=color;committed_=std::move(committed);previous_=current_=color;role_=std::move(role);changed_=std::move(changed);samplingChanged_=std::move(samplingChanged);sample_->setEnabled(bool(samplingChanged_));resident_=sampling_=false;setClickBehavior(ClickBehavior::CloseOnClickInOtherWindow);
    paletteScroll_=0;if(paletteProvider_)updatePalette(paletteProvider_());else replacePalette(palette);
    int w=320,h=preferredHeight();std::ifstream in(storage_);in>>w>>h;w=std::clamp(w,1,640);h=std::clamp(h,1,500);const auto floor=minimumDialogSize(w*uiScale);w=std::max(floor.w,std::min(w*uiScale,viewport.w));h=std::max(floor.h,std::min(h*uiScale,viewport.h));
    const int x=std::clamp(trigger.x,viewport.x,std::max(viewport.x,viewport.x2()-w)),y=trigger.y2()+h<=viewport.y2()?trigger.y2():std::max(viewport.y,trigger.y-h);
    setBounds({x,y,w,h});sync(true);openWindow();paletteFilters(true);
  }
  // ColorValueControl disabled preserves the popup, close and copy controls.
  void setEditingEnabled(bool enabled){
    if(editingEnabled_==enabled)return;editingEnabled_=enabled;
    if(!enabled){static_cast<HexEntry*>(hex_)->cancelContextGesture();finishSampling();}
    for(auto tab:tabs_)tab->setEnabled(enabled);
    hex_->setEnabled(enabled);sample_->setEnabled(enabled&&bool(samplingChanged_));
    for(auto entry:entries_)entry->setEnabled(enabled);
    for(auto slider:sliders_)slider->setEnabled(enabled);
    for(auto choice:paletteButtons_)choice->setEnabled(enabled);
  }
  // External controlled value update; retain popup geometry and previous swatch.
  void receiveColor(std::uint32_t color){if(color==current_)return;current_=committedColor_=color;sync(true);hex_->setText(colorValueHex(current_));}
  bool sampling()const{return sampling_;}
  void sampled(std::uint32_t color){apply(color);commitColor();}
  void finishSampling(){if(sampling_)setSampling(false);}
  void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());if(hex_)layout();}
  gfx::Size minimumDialogSize(int)const override {
    const auto visible=availableModes();int tabs=1-int(visible.size());for(int i:visible)tabs+=font_.measure(tabs_[i]->caption)+8;
    return {(12+tabs+hex_->widthForValue(U"#FFFFFFFF")+40+22+6)*uiScale,preferredHeight()*uiScale};
  }
  void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();{UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"颜色编辑 "+role_);const auto fields=colorValueFields(mode_);for(int i=0;i<int(fields.size());++i)font_.draw(g,unicodeText(fields[i].label),r.x+6,r.y+DialogLayout::bodyTop+DialogLayout::rowStep+i*DialogLayout::rowStep+5,skin_["text"]);if(mode_==ColorValueMode::Palette&&paletteButtons_.empty())font_.draw(g,U"颜色板为空",r.x+6,r.y+49,skin_["muted"]);}paintPaletteSelection(g,bounds().origin());copyToast_.paint(g,bounds().origin());}
  bool onProcessMessage(ui::Message* msg)override{
    if(msg->type()==ui::kMouseDownMessage&&msg->fromFilter()&&isVisible()&&mode_==ColorValueMode::Palette){
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto recipient=msg->recipient();
      if(mouse->left()&&(!recipient||recipient->window()==this)&&paletteViewport_.contains(mouse->position())&&paletteContourContains(skin_,paletteContour_,mouse->position())){
        for(auto b:paletteButtons_)if(b->active&&b->bounds().contains(mouse->position()))return b->onProcessMessage(msg);
      }
    }
    if(msg->type()==ui::kMouseDownMessage&&msg->fromFilter()&&!sampling_)return false;
    if(msg->type()==ui::kMouseMoveMessage&&!msg->fromFilter()){
      const bool hover=isVisible()&&mode_==ColorValueMode::Palette&&paletteViewport_.contains(static_cast<ui::MouseMessage*>(msg)->position())&&paletteContourContains(skin_,paletteContour_,static_cast<ui::MouseMessage*>(msg)->position());
      if(hover!=paletteHover_){paletteHover_=hover;invalidate();}
    }
    if(msg->type()==ui::kMouseWheelMessage&&isVisible()&&mode_==ColorValueMode::Palette){
      const auto mouse=static_cast<ui::MouseMessage*>(msg);const auto recipient=msg->recipient();
      if((!recipient||recipient->window()==this)&&paletteViewport_.contains(mouse->position()))return paletteBar_->onProcessMessage(msg);
    }
    if(msg->fromFilter()&&msg->type()==ui::kMouseWheelMessage)return false;
    if(sampling_&&canvasSamplingInput&&canvasSamplingInput(msg))return true;
    if(msg->type()==ui::kMouseDownMessage&&!msg->fromFilter()){auto m=static_cast<ui::MouseMessage*>(msg);if(m->left()&&m->position().y<bounds().y+20*uiScale){titlePress_=m->position();titleHeld_=true;}}
    if(titleHeld_&&msg->type()==ui::kMouseMoveMessage&&hasCapture()){auto p=static_cast<ui::MouseMessage*>(msg)->position()-titlePress_;if(std::hypot(double(p.x),double(p.y))>=3*uiScale){resident_=true;setClickBehavior(ClickBehavior::DoNothingOnClick);}}
    if(msg->type()==ui::kMouseUpMessage)titleHeld_=false;
    if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){if(sampling_){setSampling(false);return true;}commitHex();closeWindow(nullptr);return true;}
    return PixelPopupWindow::onProcessMessage(msg);
  }
  std::uint32_t color()const{return current_;}
  void testSampling(){setSampling(true);}
  void smokePaletteMatches(const std::vector<ColorEditorPaletteEntry>& expected){
    if(paletteEntries_!=expected||paletteButtons_.size()!=expected.size())throw std::runtime_error("Live popup palette differs from active document");
    for(std::size_t i=0;i<expected.size();++i)if(static_cast<PaletteChoice*>(paletteButtons_[i])->colorId!=expected[i].id||paletteButtons_[i]->swatch!=expected[i].color||paletteTips_->getTooltipFor(paletteButtons_[i])!=utf8Text(expected[i].name)+" · "+colorValueHex(expected[i].color))throw std::runtime_error("Live palette cell/tooltip mismatch");
  }
  void smokePaletteAndPaste(const std::function<void(ColorEditorPopup*,const char*)>& snapshot);
  void smokeFeedbackAndPalette(const std::function<void(ColorEditorPopup*,const char*)>& snapshot){
    auto check=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};
    const auto savedClipboard=clipboard_;std::vector<std::string> copied;clipboard_=[&](const auto& text){copied.push_back(text);};
    const auto savedChanged=changed_;int changes=0;changed_=[&](auto){++changes;};
    std::vector<std::uint32_t> palette;for(unsigned i=0;i<128;++i)palette.push_back(0xff000000u|((i*37)&255)|(((i*71)&255)<<8)|(((i*13)&255)<<16));palette[1]=palette[0];replacePalette(palette);
    const auto initial=current_;const auto frame=bounds();
    previousButton_->Click();check(copied==std::vector<std::string>{colorValueHex(previous_)}&&copiedSwatch_==1&&previousButton_->active&&!currentButton_->active&&copyFeedback_.isRunning()&&copyFeedback_.interval()==900,"Previous clipboard feedback lifecycle");
    currentButton_->Click();check(copied.back()==colorValueHex(current_)&&copiedSwatch_==2&&currentButton_->active&&!previousButton_->active&&changes==0&&current_==initial,"Repeated clipboard copy color isolation");
    check(copyToast_.text==U"已复制 "+unicodeText(copied.back()),"Copy toast actual HEX");
    const auto focused=manager()->getFocus();snapshot(this,"color-editor-copy-smoke.bmp");check(manager()->getFocus()==focused,"Copy toast stole focus");
    copyFeedback_.Tick();check(!copiedSwatch_&&copyToast_.text.empty()&&!previousButton_->active&&!currentButton_->active&&!copyFeedback_.isRunning(),"Copy feedback expiry");
    tabs_[4]->Click();setBounds({frame.x+1,frame.y+1,frame.w,preferredHeight()*uiScale});
    const auto toolbar=hex_->bounds();const auto primary=current_;check(paletteBar_->isVisible()&&paletteTotal_>paletteViewport_.h,"Compact palette missing overflow");
    auto wheel=[&](int amount,gfx::Point at,ui::Widget* recipient=nullptr){ui::MouseMessage message(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,at,{0,amount});message.setFromFilter(true);message.setRecipient(recipient?recipient:paletteButtons_[0]);return onProcessMessage(&message);};
    check(wheel(1,paletteViewport_.center())&&paletteScroll_==15*uiScale,"Palette wheel over color did not scroll down");
    check(wheel(-1,paletteViewport_.center())&&paletteScroll_==0,"Palette reverse wheel");
    check(!wheel(1,hex_->bounds().center())&&paletteScroll_==0,"Palette wheel escaped viewport");
    check(!wheel(1,paletteViewport_.center(),parent())&&paletteScroll_==0,"Palette wheel intercepted another window");
    auto pointer=[&](auto* widget,ui::MessageType type,gfx::Point at){ui::MouseMessage message(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at);return widget->onProcessMessage(&message);};
    auto thumb=paletteBar_->thumbBounds();pointer(paletteBar_,ui::kMouseDownMessage,thumb.center());check(paletteBar_->hasCapture(),"Palette scrollbar thumb capture");
    pointer(paletteBar_,ui::kMouseMoveMessage,{thumb.center().x,paletteBar_->bounds().y2()+40});pointer(paletteBar_,ui::kMouseUpMessage,{thumb.center().x,paletteBar_->bounds().y2()+40});
    check(!paletteBar_->hasCapture()&&paletteScroll_==paletteTotal_-paletteViewport_.h,"Palette scrollbar drag/release");
    wheel(-100000,paletteViewport_.center());pointer(paletteBar_,ui::kMouseDownMessage,{paletteBar_->bounds().center().x,paletteBar_->bounds().y2()-2});
    check(paletteScroll_==paletteViewport_.h/2&&!paletteBar_->hasCapture(),"Palette scrollbar page click");
    check(wheel(100000,paletteViewport_.center())&&paletteScroll_==paletteTotal_-paletteViewport_.h,"Palette bottom clamp");
    check(!paletteButtons_.back()->bounds().isEmpty()&&hex_->bounds()==toolbar&&changes==0&&current_==primary,"Palette scrolling changed color or toolbar");
    snapshot(this,"color-editor-palette-bottom-smoke.bmp");
    auto last=paletteButtons_.back();const auto lastColor=last->swatch;const auto point=last->bounds().center();
    pointer(last,ui::kMouseDownMessage,point);check(last->hasCapture()&&current_==primary&&changes==0,"Palette press prematurely applied color");
    pointer(last,ui::kMouseUpMessage,point);check(!last->hasCapture()&&current_==lastColor&&changes==1,"Palette last color release binding");
    const auto held=current_;pointer(last,ui::kMouseDownMessage,last->bounds().center());pointer(last,ui::kMouseUpMessage,{bounds().x,bounds().y});check(current_==held&&changes==1&&!last->hasCapture(),"Palette outside release cancellation");
    wheel(-100000,paletteViewport_.center());check(paletteScroll_==0&&last->bounds().isEmpty(),"Palette top clamp");
    manager()->setFocus(hex_,ui::FocusMessage::Source::Keyboard);manager()->dispatchMessages();
    manager()->setFocus(last,ui::FocusMessage::Source::Keyboard);manager()->dispatchMessages();
    check(last->hasFocus()&&!last->bounds().isEmpty()&&paletteScroll_>0,"Offscreen palette keyboard focus reveal");
    ui::KeyMessage press(ui::kKeyDownMessage,ui::kKeySpace,ui::kKeyNoneModifier,0,0),release(ui::kKeyUpMessage,ui::kKeySpace,ui::kKeyNoneModifier,0,0);
    last->onProcessMessage(&press);last->onProcessMessage(&release);check(changes==2&&current_==lastColor,"Palette keyboard activation");
    const int oldScroll=paletteScroll_;tabs_[1]->Click();tabs_[4]->Click();check(oldScroll>0&&paletteScroll_==0,"Palette mode remount resets overflow");
    setBounds({frame.x+1,frame.y+1,640*uiScale,400*uiScale});check(!paletteBar_->isVisible()&&paletteScroll_==0&&!paletteButtons_.back()->bounds().isEmpty(),"Palette resize did not reveal all colors");
    setBounds({frame.x+1,frame.y+1,frame.w,preferredHeight()*uiScale});
    current_=paletteButtons_.front()->swatch;sync(true);
    check(paletteButtons_[0]->active&&paletteButtons_[1]->active,"Duplicate palette selection fixture");
    paletteScroll_=1;layout();check(paletteScroll_==1,"Partial physical-pixel scroll");
    for(bool hover:{false,true}){
      paletteHover_=hover;auto mask=os::instance()->makeRgbaSurface(bounds().w,bounds().h);mask->clear();{ui::Graphics g(mask);paintPaletteSelection(g,bounds().origin());}
      int visible=0;os::SurfaceLock lock(mask.get());for(int y=0;y<mask->height();++y)for(int x=0;x<mask->width();++x){const gfx::Point at(x+bounds().x,y+bounds().y);const bool painted=gfx::geta(mask->getPixel(x,y))!=0;visible+=painted;check((paletteViewport_.contains(at)&&paletteContourContains(skin_,paletteContour_,at))==painted,"Compact palette contour alpha/hit mismatch");}
      check(visible>0,"Compact palette contour test had no visible selection");
      const auto first=static_cast<PaletteChoice*>(paletteButtons_[0])->border();check(!paletteContourContains(skin_,paletteContour_,{first.x2()-uiScale,first.center().y}),"Duplicate selected colors retained internal outline");
    }
    currentButton_->Click();snapshot(this,"color-editor-palette-copy-smoke.bmp");copyFeedback_.Tick();
    replacePalette({});sync(true);check(!paletteBar_->isVisible()&&paletteScroll_==0&&paletteContour_.empty(),"Empty palette retained scrolling/selection");
    snapshot(this,"color-editor-palette-empty-smoke.bmp");
    check(changes==2,"Palette layout or copy published a color");
    changed_=savedChanged;clipboard_=savedClipboard;
  }
  void smoke(){
    {const auto savedChanged=changed_,savedCommitted=committed_;const auto savedClipboard=clipboard_;const auto savedColor=current_,savedAccepted=committedColor_,savedPrevious=previous_;const auto savedMode=mode_;
      auto slider=sliders_[0];mode_=ColorValueMode::Rgb;current_=committedColor_=0xff332210;sync(true);slider->requestFocus();manager()->dispatchMessages();if(!slider->hasFocus())throw std::runtime_error("Color slider focus fixture");
      int commits=0,drafts=0;std::string copied;changed_=[&](auto){++drafts;};committed_=[&](auto){++commits;};clipboard_=[&](auto text){copied=text;};const auto initial=current_;
      auto key=[&](ui::MessageType type){ui::KeyMessage message(type,ui::kKeyRight,ui::kKeyShiftModifier,0,0);slider->onProcessMessage(&message);};
      key(ui::kKeyDownMessage);key(ui::kKeyUpMessage);if((current_&255)!=17||commits||drafts!=1||currentButton_->swatch!=initial)throw std::runtime_error("Color keyboard preview must await blur and ignore keyboard Shift");
      currentButton_->Click();if(copied!=colorValueHex(initial)||copyToast_.text!=U"已复制 "+unicodeText(copied)||commits)throw std::runtime_error("Comparison copy must use confirmed color");
      ui::MouseMessage wheel(ui::kMouseWheelMessage,os::PointerType::Mouse,ui::kButtonNone,ui::kKeyNoneModifier,slider->bounds().center(),{0,-1});slider->onProcessMessage(&wheel);if((current_&255)!=18||commits!=1||currentButton_->swatch!=current_)throw std::runtime_error("Color wheel must confirm pending keyboard draft immediately");
      key(ui::kKeyDownMessage);key(ui::kKeyUpMessage);if(commits!=1)throw std::runtime_error("Color key release confirmed early");slider->releaseFocus();manager()->dispatchMessages();if(commits!=2||currentButton_->swatch!=current_)throw std::runtime_error("Color keyboard blur confirmation missing");
      auto pointer=[&](ui::MessageType type,int numerator,bool shift=false){const auto r=slider->bounds();ui::MouseMessage message(type,os::PointerType::Mouse,ui::kButtonLeft,shift?ui::kKeyShiftModifier:ui::kKeyNoneModifier,{r.x+r.w*numerator/4,r.center().y});slider->onProcessMessage(&message);};
      pointer(ui::kMouseDownMessage,1);manager()->dispatchMessages();pointer(ui::kMouseMoveMessage,2);const auto preview=current_;if(commits!=2||currentButton_->swatch==preview||!slider->hasCapture())throw std::runtime_error("Color pointer preview confirmed early");pointer(ui::kMouseUpMessage,4,true);manager()->dispatchMessages();if(current_!=preview||commits!=3||slider->hasCapture()||slider->hasFocus()||currentButton_->swatch!=preview)throw std::runtime_error("Color pointer release must retain preview, confirm and blur");
      copyFeedback_.stop();copiedSwatch_=0;mode_=savedMode;current_=savedColor;committedColor_=savedAccepted;previous_=savedPrevious;changed_=savedChanged;committed_=savedCommitted;clipboard_=savedClipboard;sync(true);
    }
    {const auto savedChanged=changed_,savedCommitted=committed_;const auto savedColor=current_,savedAccepted=committedColor_;int drafts=0,commits=0;changed_=[&](auto){++drafts;};committed_=[&](auto){++commits;};committedColor_=current_;apply(current_^1u);if(drafts!=1||commits)throw std::runtime_error("Color draft committed early");commitColor();commitColor();if(commits!=1)throw std::runtime_error("Color duplicate commit");hex_->setText(colorValueHex(current_^2u));commitHex();if(commits!=2||drafts!=2)throw std::runtime_error("Color HEX commit missing");current_=savedColor;committedColor_=savedAccepted;changed_=savedChanged;committed_=savedCommitted;sync(true);}
    {const auto savedChanged=changed_,savedCommitted=committed_;const auto savedColor=current_,savedAccepted=committedColor_;const auto savedMode=mode_;mode_=ColorValueMode::Rgb;sync(true);int commits=0;changed_=[](auto){};committed_=[&](auto){++commits;};committedColor_=current_;const auto next=((current_&255)+1)%256;entries_[0]->setText(std::to_string(next));entries_[0]->Change();if(current_!=savedColor||commits)throw std::runtime_error("Channel draft published early");entries_[0]->commitExpression();if((current_&255)!=next||commits!=1)throw std::runtime_error("Channel accept missing");entries_[0]->setText("2+3");entries_[0]->commitExpression();if((current_&255)!=5)throw std::runtime_error("Channel expression missing");const auto beforeSample=commits;sampled(current_^256u);sampled(current_);if(commits!=beforeSample+1)throw std::runtime_error("Sample commit deduplication missing");mode_=savedMode;current_=savedColor;committedColor_=savedAccepted;changed_=savedChanged;committed_=savedCommitted;sync(true);}
    {const auto initial=current_;setEditingEnabled(false);if(hex_->isEnabled()||entries_[0]->isEnabled()||sliders_[0]->isEnabled()||tabs_[0]->isEnabled()||!close_->isEnabled()||!previousButton_->isEnabled()||!currentButton_->isEnabled())throw std::runtime_error("Busy color control availability");sampled(initial^1u);if(current_!=initial)throw std::runtime_error("Disabled color accepted sample");setEditingEnabled(true);if(!hex_->isEnabled()||!entries_[0]->isEnabled()||!sliders_[0]->isEnabled())throw std::runtime_error("Color controls did not resume");}
    auto check=[](bool v,const char* why){if(!v)throw std::runtime_error(why);};
    check(icons_.assets.patches.count(sample_->icon)!=0,"Missing legacy eyedropper icon");
    check(skin_.assets.patches.count("icon.marker-light") && skin_.assets.patches.count("icon.marker-dark"),"Missing shared picker markers");
    check(previousButton_->bounds().x2()==currentButton_->bounds().x && previousButton_->swatchOpenEdges==2 && currentButton_->swatchOpenEdges==1,"Comparison swatches must join without middle border");
    check(hex_->bounds().w==hex_->widthForValue(U"#FFFFFFFF")*uiScale,"HEX content width");
    const auto original=bounds();
    for(int width:{360,400,540}){
      setBounds({original.x,original.y,width*uiScale,preferredHeight()*uiScale});
      check(bounds().h==preferredHeight()*uiScale,"Editor preferred content height");
      check(hex_->bounds().x-tabs_[availableModes().back()]->bounds().x2()==2*uiScale && previousButton_->bounds().x-hex_->bounds().x2()==2*uiScale && sample_->bounds().x-currentButton_->bounds().x2()==2*uiScale,"Editor toolbar group spacing");
      check(sample_->bounds().x2()==bounds().x2()-6*uiScale,"Editor toolbar fills width");
      check(bounds().y2()-entries_[3]->bounds().y2()==6*uiScale,"Editor bottom content padding");
    }
    setBounds({original.x,original.y,40*uiScale,40*uiScale});
    tabs_[3]->Click();tabs_[0]->Click();
    check(bounds().w>=minimumDialogSize(bounds().w).w && bounds().h>=minimumDialogSize(bounds().w).h,"Editor must preserve content floor across mode switches");
    setBounds({original.x,original.y,original.w,preferredHeight()*uiScale});
    tabs_[1]->Click();entries_[0]->setText("17");entries_[0]->Change();entries_[0]->commitExpression();check((current_&255)==17,"RGB editor channel binding");
    const auto alpha=current_>>24;hex_->setText("#AABBCC");commitHex();check(current_==((alpha<<24)|0xccbbaa),"HEX retains fallback alpha");hex_->setText("invalid");commitHex();check(hex_->text()==colorValueHex(current_),"Invalid HEX resets");
    for(int i=0;i<5;++i){tabs_[i]->Click();check(tabs_[i]->active,"Editor mode tab selection");for(auto s:sliders_)if(s->isVisible())check(s->bounds().h==textControlHeight*uiScale,"Color slider shared height");}
    if(!paletteButtons_.empty()){auto expected=paletteButtons_[0]->swatch;paletteButtons_[0]->Click();check(current_==expected,"Palette editor selection");}
    const auto savedModes=sharedModes_;auto all=savedModes;for(auto& item:all)item.enabled=true;setModePreferences(all);
    const auto neutral=current_;const auto savedChanged=changed_;int notifications=0;changed_=[&](std::uint32_t){++notifications;};
    for(int i=0;i<7;++i){tabs_[i]->Click();check(mode_==modes_[i]&&tabs_[i]->active&&current_==neutral&&notifications==0,"Mode switch changed color or submitted unchanged HEX");
      setBounds({original.x+1,original.y+1,40*uiScale,40*uiScale});
      const auto fields=colorValueFields(mode_);check(bounds().w>=minimumDialogSize(bounds().w).w,"Seven-mode minimum width");
      for(int field=0;field<5;++field)check(entries_[field]->isVisible()==(field<int(fields.size())),"Mode field visibility");
      if(!fields.empty())check(bounds().y2()-entries_[fields.size()-1]->bounds().y2()==6*uiScale,"Mode minimum bottom padding");
      for(auto child:children())if(child->isVisible())check(bounds().contains(child->bounds()),"Seven-mode minimum content overflow");
    }
    tabs_[6]->Click();entries_[4]->setText("91");entries_[4]->Change();entries_[4]->commitExpression();check(current_>>24==91&&notifications==1,"CMYK alpha field binding");
    tabs_[5]->Click();entries_[0]->setText("240");entries_[0]->Change();entries_[0]->commitExpression();check(notifications==2,"HSL channel edit binding");
    changed_=savedChanged;setModePreferences(savedModes);apply(neutral);
    tabs_[0]->Click();setBounds({original.x,original.y,original.w,preferredHeight()*uiScale});for(auto child:children())if(child->isVisible())check(bounds().contains(child->bounds()),"Color editor control outside window");
    for(int width:{120,240,300})for(bool hover:{false,true}){
      const gfx::Rect border(4*uiScale,4*uiScale,width*uiScale,textControlHeight*uiScale);const auto material=skin_.selectionMaterialBounds(border);
      auto mask=os::instance()->makeRgbaSurface((width+8)*uiScale,(textControlHeight+8)*uiScale);mask->clear();{ui::Graphics g(mask);UiPaintScale scale(g);skin_.drawSelectionBorder(g,border,hover);}
      os::SurfaceLock lock(mask.get());for(int y=0;y<mask->height();++y)for(int x=0;x<mask->width();++x)check(skin_.selectionContains(material,{x,y})==(gfx::geta(mask->getPixel(x,y))!=0),"Color slider selection alpha/hit mismatch");
    }
  }
};
}
