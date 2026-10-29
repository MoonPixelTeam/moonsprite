#pragma once
#include "document.h"
#include "native_widgets.h"
#include "color_editor_popup.h"
#include "ui/message.h"
#include "ui/resize_event.h"
#include "ui/tooltips.h"
namespace moon {
// Legacy FreeTileSourcePropertiesDialog: cumulative live patch, normal close
// commits. Description, offsets, opacity and blend remain hidden in this form.
class FreeTileSourcePropertiesDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;std::u32string title_;
 Document::FreeTileSourceChanges changes_;std::function<void(const Document::FreeTileSourceChanges&)> preview_;
 PixelEntry* name_;PixelSwitch *visible_,*locked_;PixelButton *headerClose_,*custom_;std::vector<PixelButton*> presets_;std::vector<Pixel> colors_;std::optional<Pixel> color_;
 std::unique_ptr<ColorEditorPopup> picker_;std::filesystem::path storage_;
 static constexpr int nameY=DialogLayout::bodyTop,toggleY=nameY+textControlHeight+6,colorLabelY=toggleY+2*textControlHeight+2+6,colorY=colorLabelY+10+2;
 void choose(std::optional<Pixel> color){color_=color;changes_.displayColor.emplace(color);for(std::size_t n=0;n<presets_.size();++n){presets_[n]->active=n?color==std::optional<Pixel>{colors_[n-1]}:!color;presets_[n]->invalidate();}custom_->swatch=color.value_or(0xffff7929);custom_->invalidate();preview_(changes_);}
 int columns(int width)const{return std::max(1,(width/uiScale-12+2)/22);}
 void finish(){if(picker_&&picker_->isVisible())picker_->closeWindow(nullptr);closeWindow(nullptr);}
public:
 std::function<void(bool,ColorEditorPopup*)> samplingChanged;std::function<bool(ui::Message*)> samplingInput;std::vector<Pixel> paletteColors;
 FreeTileSourcePropertiesDialog(const PixelFont& font,const Skin& skin,const Skin& icons,const free_tiles::Source& source,std::vector<Pixel> colors,std::filesystem::path storage,std::function<void(const Document::FreeTileSourceChanges&)> preview)
 :PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),icons_(icons),title_(U"源瓦片属性 · "+unicodeText(source.name)),preview_(std::move(preview)),colors_(std::move(colors)),color_(source.displayColor),storage_(std::move(storage)){
  setAutoRemap(false);setWantFocus(true);
  name_=new PixelEntry(font,skin);name_->setMaxTextLength(96);name_->setText(source.name);name_->Change.connect([this]{changes_.name=unicodeText(name_->text());preview_(changes_);});name_->accept=name_->cancel=[this]{finish();};name_->focus=[this]{name_->selectText(0,-1);};addChild(name_);
  visible_=new PixelSwitch(font,skin,U"显示瓦片实例",source.visible,[this](bool value){changes_.visible=value;preview_(changes_);});addChild(visible_);
  locked_=new PixelSwitch(font,skin,U"锁定瓦片实例",source.locked,[this](bool value){changes_.locked=value;preview_(changes_);});addChild(locked_);
  auto tips=new ui::TooltipManager;addChild(tips);tips->addTooltipFor(visible_,"控制该源瓦片的全部实例是否在画布中显示；关闭后实例不会删除，重新打开即可恢复。");tips->addTooltipFor(locked_,"锁定该源瓦片后，画布中的实例不能移动，源瓦片内容也不能编辑；已有实例不会被删除。");
  for(std::size_t n=0;n<=colors_.size();++n){auto b=new PixelButton(font,skin,n?U"":U"无",[this,n]{choose(n?std::optional<Pixel>{colors_[n-1]}:std::nullopt);});if(n){b->colorRole=true;b->swatch=colors_[n-1];}b->active=n?color_==std::optional<Pixel>{colors_[n-1]}:!color_;presets_.push_back(b);addChild(b);}
  custom_=new PixelButton(font,skin,U"",[this]{if(!picker_){picker_=std::make_unique<ColorEditorPopup>(font_,skin_,icons_,storage_);picker_->Close.connect([this](ui::CloseEvent&){setClickBehavior(ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);});}setClickBehavior(ui::PopupWindow::ClickBehavior::DoNothingOnClick);picker_->canvasSamplingInput=[this](ui::Message* msg){if(auto mouse=dynamic_cast<ui::MouseMessage*>(msg);mouse&&bounds().contains(mouse->positionForDisplay(display())))return false;return samplingInput&&samplingInput(msg);};picker_->setDisplay(display(),false);picker_->open(custom_->bounds(),display()->bounds(),color_.value_or(0xffff7929),U"源瓦片颜色",paletteColors,[this](Pixel color){choose(color);},[this](bool active){if(samplingChanged)samplingChanged(active,picker_.get());});});custom_->colorRole=true;custom_->swatch=color_.value_or(0xffff7929);addChild(custom_);
  tips->addTooltipFor(custom_,"自定义颜色");
  headerClose_=new PixelButton(font,skin,U"",[this]{finish();});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(headerClose_);
 }
 ~FreeTileSourcePropertiesDialog(){if(picker_&&picker_->isVisible())picker_->closeWindow(nullptr);}
 const Document::FreeTileSourceChanges& changes()const{return changes_;}
 void focusName(){name_->requestFocus();name_->selectText(0,-1);}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());const auto r=bounds();name_->setBounds({r.x+48*uiScale,r.y+nameY*uiScale,r.w-54*uiScale,textControlHeight*uiScale});visible_->setBounds({r.x+6*uiScale,r.y+toggleY*uiScale,r.w-12*uiScale,textControlHeight*uiScale});locked_->setBounds({r.x+6*uiScale,r.y+(toggleY+textControlHeight+2)*uiScale,r.w-12*uiScale,textControlHeight*uiScale});const int cols=columns(r.w);for(std::size_t n=0;n<=presets_.size();++n){auto b=n<presets_.size()?presets_[n]:custom_;b->setBounds({r.x+(6+int(n)%cols*22)*uiScale,r.y+(colorY+int(n)/cols*22)*uiScale,20*uiScale,20*uiScale});}layoutHeaderButton(headerClose_);}
 gfx::Size minimumDialogSize(int width)const override{width=std::max(width,264*uiScale);const int rows=(int(presets_.size())+1+columns(width)-1)/columns(width);return {264*uiScale,(colorY+rows*22-2+6)*uiScale};}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());auto title=title_;while(!title.empty()&&font_.measure(title)>r.w-32)title.pop_back();drawDialogTitle(font_,g,r,title);font_.draw(g,U"名称",r.x+6,r.y+nameY+5,skin_["text"]);font_.draw(g,U"显示颜色",r.x+6,r.y+colorLabelY,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage&&(!picker_||!picker_->isVisible())){auto k=static_cast<ui::KeyMessage*>(msg);if(k->scancode()==ui::kKeyEnter||k->scancode()==ui::kKeyEsc){finish();return true;}}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(int close){if(close==3){headerClose_->Click();return;}name_->setText("  Shared source  ");name_->Change();visible_->Click();locked_->Click();if(presets_.size()>1)presets_[1]->Click();custom_->Click();picker_->sampled(0xff102030);picker_->closeWindow(nullptr);if(!isVisible())throw std::runtime_error("Source dialog stays open after child color editor");presets_.front()->Click();if(close==0){ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&key);}else if(close==1){ui::KeyMessage key(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);onProcessMessage(&key);}else headerClose_->Click();}
};
}
