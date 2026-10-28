#pragma once
#include "document.h"
#include <array>
#include <cmath>
#include "native_widgets.h"
#include "layer_blend.h"
#include "ui/message.h"
#include "ui/resize_event.h"

namespace moon {
// FreeTileInstancePropertiesDialog.tsx: patch only touched fields, accumulate
// previews against the opening snapshot, and commit on every normal close.
class FreeTileInstancePropertiesDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;std::u32string title_;
 Document::FreeTileInstanceChanges changes_;
 std::function<void(const Document::FreeTileInstanceChanges&)> changed_;
 PixelDropdown* blend_;PixelSlider* opacity_;PixelButton *close_,*headerClose_;
 std::array<PixelButton*,4> rotation_{};
 std::array<PixelButton*,2> mirror_{};
 std::array<PixelEntry*,2> position_{};std::array<int,2> coordinates_{};
 int rotationValue_=0;bool normalizing_=false;
 void preview(){changed_(changes_);}
 void positionChanged(int axis){
  if(normalizing_)return;
  try{std::size_t used=0;const auto value=std::stod(position_[axis]->text(),&used);
   if(used!=position_[axis]->text().size()||!std::isfinite(value))return;
   coordinates_[axis]=int(std::clamp(std::trunc(value),-double(free_tiles::MaxCoordinate),double(free_tiles::MaxCoordinate)));
   (axis?changes_.y:changes_.x)=coordinates_[axis];preview();
  }catch(const std::invalid_argument&){}catch(const std::out_of_range&){}
 }
 static int row(int index){return DialogLayout::row(index)+(index>=2?DialogLayout::group:0)+(index>=4?DialogLayout::group:0);}
public:
 FreeTileInstancePropertiesDialog(const PixelFont& font,const Skin& skin,const Skin& icons,
   const free_tiles::Instance& instance,const free_tiles::Source& source,const PixelRegion& bounds,bool multiple,std::u32string name,
   std::function<void(const Document::FreeTileInstanceChanges&)> changed)
  :PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow),font_(font),skin_(skin),title_(multiple?U"多个实例属性":std::move(name)+U" 实例属性"),changed_(std::move(changed)),coordinates_{bounds.x,bounds.y},rotationValue_(instance.rotation){
  setAutoRemap(false);setWantFocus(true);
  blend_=new PixelDropdown(font,skin);blend_->setOptions({U"正常",U"变暗",U"正片叠底",U"颜色加深",U"线性加深",U"变亮",U"滤色",U"颜色减淡",U"线性减淡（添加）",U"叠加",U"柔光",U"强光",U"亮光",U"线性光",U"点光",U"实色混合",U"差值",U"排除",U"减去",U"划分",U"色相",U"饱和度",U"颜色",U"明度"});
  blend_->optionGroups={{0,U"基础"},{1,U"变暗"},{5,U"变亮"},{9,U"对比"},{16,U"比较"},{20,U"分量"}};
  blend_->setSelectedIndex(int(parseLayerBlendMode(instance.blendMode.value_or(source.blendMode)).value_or(LayerBlendMode::Normal)));
  blend_->changed=[this](int index){changes_.blendMode=std::string(layerBlendModeName(LayerBlendMode(index)));preview();};addChild(blend_);
  opacity_=new PixelSlider(font,skin);opacity_->value=int(std::floor(instance.opacity.value_or(source.opacity)*100+.5));opacity_->changed=[this](int value){changes_.opacity=value/100.;preview();};addChild(opacity_);
  const bool geometryEnabled=multiple||!instance.locked;
  const std::array<std::u32string,4> angles{U"0°",U"90°",U"180°",U"270°"};
  for(int n=0;n<4;++n){auto button=new PixelButton(font,skin,angles[n],[this,n]{rotationValue_=n;for(int i=0;i<4;++i){rotation_[i]->active=i==n;rotation_[i]->invalidate();}changes_.rotation=n;preview();});button->active=n==rotationValue_;button->setEnabled(geometryEnabled);rotation_[n]=button;addChild(button);}
  for(int n=0;n<2;++n){auto button=new PixelButton(font,skin,n?U"垂直":U"水平",[this,n]{auto button=mirror_[n];button->active=!button->active;button->invalidate();(n?changes_.flipVertical:changes_.flipHorizontal)=button->active;preview();});button->active=n?instance.flipVertical:instance.flipHorizontal;button->iconSkin=&icons;button->icon=n?"selectionFlipVertical":"selectionFlipHorizontal";button->setEnabled(geometryEnabled);mirror_[n]=button;addChild(button);}
  for(int axis=0;axis<2;++axis){auto entry=new PixelEntry(font,skin);position_[axis]=entry;entry->numeric=true;entry->numericMinimum=-free_tiles::MaxCoordinate;entry->numericMaximum=free_tiles::MaxCoordinate;entry->numericValue=[this,axis]{return double(coordinates_[axis]);};entry->suffix=U"px";entry->setText(std::to_string(coordinates_[axis]));entry->setEnabled(geometryEnabled);entry->Change.connect([this,axis]{positionChanged(axis);});entry->blur=[this,axis]{normalizing_=true;position_[axis]->setText(std::to_string(coordinates_[axis]));normalizing_=false;};entry->wheel=[this,axis](int delta){position_[axis]->setText(std::to_string(std::clamp(coordinates_[axis]+delta,-free_tiles::MaxCoordinate,free_tiles::MaxCoordinate)));positionChanged(axis);};entry->accept=entry->cancel=[this]{closeWindow(nullptr);};addChild(entry);}
  close_=new PixelButton(font,skin,U"关闭",[this]{closeWindow(nullptr);});addChild(close_);
  headerClose_=new PixelButton(font,skin,U"",[this]{closeWindow(nullptr);});headerClose_->iconSkin=&icons;headerClose_->icon="close";headerClose_->skinStyle="icon_button";addChild(headerClose_);
 }
 void onResize(ui::ResizeEvent& ev)override{
  setBoundsQuietly(ev.bounds());const auto r=bounds();const int x=r.x+64*uiScale,w=r.w-70*uiScale;
  blend_->setBounds({x,r.y+row(0)*uiScale,w,textControlHeight*uiScale});opacity_->setBounds({x,r.y+row(1)*uiScale,w,textControlHeight*uiScale});
  for(int n=0;n<4;++n){const int left=(n*(w/uiScale)/4)*uiScale,right=((n+1)*(w/uiScale)/4)*uiScale+(n<3?uiScale:0);rotation_[n]->setBounds({x+left,r.y+row(2)*uiScale,right-left,textControlHeight*uiScale});}
  for(int n=0;n<2;++n){const int left=(n*(w/uiScale)/2)*uiScale,right=((n+1)*(w/uiScale)/2)*uiScale+(n==0?uiScale:0);mirror_[n]->setBounds({x+left,r.y+row(3)*uiScale,right-left,textControlHeight*uiScale});position_[n]->setBounds({x,r.y+row(4+n)*uiScale,w,textControlHeight*uiScale});}
  close_->setBounds({r.x2()-61*uiScale,r.y2()-(textControlHeight+6)*uiScale,55*uiScale,textControlHeight*uiScale});layoutHeaderButton(headerClose_);
 }
 gfx::Size minimumDialogSize(int)const override{return {252*uiScale,DialogLayout::fit(row(5)+textControlHeight)*uiScale};}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,title_);const std::array<std::u32string,6> labels{U"混合模式",U"不透明度",U"旋转",U"镜像",U"X",U"Y"};for(int n=0;n<6;++n)font_.draw(g,labels[n],r.x+6,r.y+row(n)+5,skin_["text"]);}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage){const auto code=static_cast<ui::KeyMessage*>(msg)->scancode();if(code==ui::kKeyEsc||code==ui::kKeyEnter){closeWindow(nullptr);return true;}}return PixelPopupWindow::onProcessMessage(msg);}
 void smoke(){position_[1]->blur();if(changes_.y)throw std::runtime_error("Untouched coordinate blur must not create a multi-edit patch");opacity_->value=37;opacity_->changed(37);rotation_[1]->Click();mirror_[0]->Click();position_[0]->setText("3");positionChanged(0);blend_->setSelectedIndex(int(LayerBlendMode::Multiply),true);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);}
};
}
