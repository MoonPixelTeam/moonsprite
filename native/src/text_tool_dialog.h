#pragma once
#include "pixel_text_area.h"
#include "color_editor_popup.h"
#include "text_font_service.h"
#include "text_cel_data.h"
#include "../tests/fixtures/text_word_navigation_browser.h"
namespace moon {
class TextToolDialog final:public PixelDialog {
 const PixelFont& font_;const Skin& skin_;TextFontService& fonts_;TextCelData value_;std::function<void(const TextCelData&,bool)> preview_;std::vector<TextFontOption> options_;PixelTextArea* text_;PixelDropdown *family_,*align_,*layout_,*spacing_,*render_;std::vector<PixelEntry*> numbers_;PixelButton* color_=nullptr;std::unique_ptr<ColorEditorPopup> colorPopup_;PixelButton *ok_,*cancel_,*close_,*live_,*import_,*system_,*erase_;bool live=true,accepted_=false,syncing_=false;std::u32string error_;
 void syncSelection(){if(numbers_.size()!=5||!color_)return;auto [a,b]=text_->selectionRange();const auto selected=textSelectionStyle(value_,textUtf16Index(text_->value(),a),textUtf16Index(text_->value(),b));syncing_=true;const std::optional<int> values[]{selected.fontSize,selected.lineSpacing,selected.letterSpacing,value_.boxWidth,value_.boxHeight};for(int i=0;i<5;++i)if(!numbers_[i]->hasFocus())numbers_[i]->setText(values[i]?std::to_string(*values[i]):"");color_->colorRole=selected.color.has_value();color_->swatch=selected.color.value_or(value_.color);color_->caption.clear();color_->invalidate();syncing_=false;}
 void update(){try{value_=normalizeTextCelData(value_);syncSelection();preview_(value_,live);error_.clear();}catch(const std::exception& e){error_=unicodeText(e.what());}invalidate();}
 // TextToolDialog.tsx selectFont/addFont share base-size selection semantics.
 void selectFont(const std::string& family){value_.fontFamily=family;if(auto size=textFontDefaultSize(family))value_.fontSize=*size;fonts_.recordSize(value_.fontSize);}
 void selectFontAfterRemoval(){const auto remaining=fonts_.catalog();value_.fontFamily=remaining.empty()?defaultTextFontFamily:remaining.front().family;}
 void style(int field,int n){if(field==0)fonts_.recordSize(n);auto [a,b]=text_->selectionRange();if(a!=b&&field<3){TextStyleRun patch;if(field==0)patch.fontSize=n;if(field==1)patch.lineSpacing=n;if(field==2)patch.letterSpacing=n;value_.styleRuns=applyTextStyleRun(value_.styleRuns,textUtf16Index(text_->value(),a),textUtf16Index(text_->value(),b),patch,int(value_.text.size()));}else{if(field==0)value_.fontSize=n;if(field==1)value_.lineSpacing=n;if(field==2)value_.letterSpacing=n;if(field==3)value_.boxWidth=n;if(field==4)value_.boxHeight=n;}update();}
 void catalog(){options_=fonts_.catalog();std::vector<std::u32string> names;int index=0;for(std::size_t i=0;i<options_.size();++i){names.push_back(unicodeText(options_[i].family));if(options_[i].family==value_.fontFamily)index=int(i);}family_->setOptions(names);family_->setSelectedIndex(index);erase_->setEnabled(!options_.empty()&&options_[index].imported);}
 PixelButton* button(std::u32string label,std::function<void()> action){auto b=new PixelButton(font_,skin_,label,action);addChild(b);return b;}
public:
 TextToolDialog(const PixelFont& font,const Skin& skin,const Skin& icons,TextFontService& fonts,TextCelData value,std::function<void(const TextCelData&,bool)> preview,std::filesystem::path colorStorage):PixelDialog(skin,"",ui::PopupWindow::ClickBehavior::DoNothingOnClick),font_(font),skin_(skin),fonts_(fonts),value_(std::move(value)),preview_(std::move(preview)){
 setAutoRemap(false);setWantFocus(true);setEnterBehavior(ui::PopupWindow::EnterBehavior::DoNothingOnEnter);text_=new PixelTextArea(font,skin);addChild(text_);text_->setValue(textUtf32(value_.text));text_->changed=[this](const auto& s){const auto next=textUtf16(s);value_.styleRuns=reconcileTextStyleRuns(value_.styleRuns,value_.text,next);value_.text=next;update();};text_->cancel=[this]{closeWindow(nullptr);};family_=new PixelDropdown(font,skin);addChild(family_);family_->changed=[this](int n){if(n<0||n>=int(options_.size()))return;selectFont(options_[n].family);erase_->setEnabled(options_[n].imported);update();};
 for(int i=0;i<5;++i){auto e=new PixelEntry(font,skin);e->numeric=true;addChild(e);numbers_.push_back(e);e->setText(std::to_string(i==0?value_.fontSize:i==1?value_.lineSpacing:i==2?value_.letterSpacing:i==3?value_.boxWidth:value_.boxHeight));e->blur=[this]{syncSelection();};e->Change.connect([this,e,i]{if(syncing_)return;try{std::size_t used=0;int n=std::stoi(e->text(),&used);if(used==e->text().size())style(i,n);}catch(...){}});}
 auto dropdown=[&](std::vector<std::u32string> labels,int index,std::function<void(int)> change){auto d=new PixelDropdown(font,skin);addChild(d);d->setOptions(labels);d->setSelectedIndex(index);d->changed=std::move(change);return d;};align_=dropdown({U"左对齐",U"居中",U"右对齐"},int(value_.align),[this](int n){value_.align=TextCelData::Align(n);update();});layout_=dropdown({U"自由文字",U"文字框"},value_.boxed?1:0,[this](int n){value_.boxed=n==1;update();});spacing_=dropdown({U"传统间距",U"实际间距"},value_.actualSpacing?1:0,[this](int n){value_.actualSpacing=n==1;if(value_.actualSpacing){if(!value_.lineSpacing)value_.lineSpacing=1;if(!value_.letterSpacing)value_.letterSpacing=1;for(auto& r:value_.styleRuns){if(r.lineSpacing&&!*r.lineSpacing)r.lineSpacing=1;if(r.letterSpacing&&!*r.letterSpacing)r.letterSpacing=1;}numbers_[1]->setText(std::to_string(value_.lineSpacing));numbers_[2]->setText(std::to_string(value_.letterSpacing));}update();});render_=dropdown({U"像素",U"平滑"},value_.smooth?1:0,[this](int n){value_.smooth=n==1;update();});
 color_=button(U"",[this,&icons,colorStorage]{if(!colorPopup_)colorPopup_=std::make_unique<ColorEditorPopup>(font_,skin_,icons,colorStorage);colorPopup_->setDisplay(display(),false);colorPopup_->open(color_->bounds(),display()->bounds(),textSelectionStyle(value_,textUtf16Index(text_->value(),text_->selectionRange().first),textUtf16Index(text_->value(),text_->selectionRange().second)).color.value_or(value_.color),U"文字颜色",{},[this](std::uint32_t n){auto [a,b]=text_->selectionRange();if(a==b)value_.color=n;else{TextStyleRun patch;patch.color=n;value_.styleRuns=applyTextStyleRun(value_.styleRuns,textUtf16Index(text_->value(),a),textUtf16Index(text_->value(),b),patch,int(value_.text.size()));}color_->swatch=n;color_->invalidate();update();},{});});color_->colorRole=true;color_->swatch=value_.color;

 ok_=button(U"确定",[this]{if(value_.text.empty())return;update();if(!error_.empty())return;accepted_=true;closeWindow(nullptr);});cancel_=button(U"取消",[this]{closeWindow(nullptr);});close_=button(U"",[this]{closeWindow(nullptr);});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";live_=button(U"实时预览",[this]{live=!live;live_->active=live;update();});live_->active=true;
 import_=button(U"导入字体",[this]{try{wchar_t path[32768]{};OPENFILENAMEW o{};o.lStructSize=sizeof(o);o.lpstrFilter=L"Fonts\0*.ttf;*.ttc;*.otf;*.woff;*.woff2\0\0";o.lpstrFile=path;o.nMaxFile=32768;o.Flags=OFN_FILEMUSTEXIST|OFN_NOCHANGEDIR;if(GetOpenFileNameW(&o)){selectFont(fonts_.importFile(path).family);catalog();update();}}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}});
 system_=button(U"系统字体",[this]{PixelMenu menu(skin_);for(const auto& name:fonts_.systemFamilies()){auto item=new PixelMenuItem(font_,skin_,unicodeText(name));item->Click.connect([this,name]{try{selectFont(fonts_.importSystem(name).family);catalog();update();}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}});menu.addChild(item);}menu.showPopup(system_->bounds().origin(),display());});erase_=button(U"删除字体",[this]{int n=family_->selectedIndex();if(n<0||n>=int(options_.size())||!options_[n].imported)return;try{fonts_.erase(options_[n].id);selectFontAfterRemoval();catalog();update();}catch(const std::exception& e){error_=unicodeText(e.what());invalidate();}});catalog();text_->selectionChanged=[this]{syncSelection();};text_->setSelectionRange(0,0);syncSelection();
 }
 ~TextToolDialog(){if(colorPopup_)colorPopup_->closeWindow(nullptr);}
 void smokeEditing(){
 const auto original=value_;const bool originalLive=live;const int originalLastSize=fonts_.lastSize();auto check=[](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};
 value_=newTextToolData(0xff102030);value_.text=u"A\U0001f600BC";TextStyleRun run;run.start=1;run.end=3;run.fontSize=18;run.color=0xffaabbcc;value_.styleRuns={run};text_->setValue(textUtf32(value_.text));
 text_->setSelectionRange(1,2);check(numbers_[0]->text()=="18"&&color_->colorRole&&color_->swatch==*run.color,"Selected UTF16 style sync");
 text_->setSelectionRange(0,2);check(numbers_[0]->text().empty()&&!color_->colorRole,"Mixed selection style");
 text_->setSelectionRange(1,1);check(numbers_[0]->text()=="18","Caret style");text_->setSelectionRange(4,4);check(numbers_[0]->text()=="10","End caret style fallback");
 text_->setSelectionRange(1,2);style(0,20);check(textStyleAt(value_,1).fontSize==20&&textStyleAt(value_,2).fontSize==20&&textStyleAt(value_,3).fontSize==10,"UTF16 style range");check(fonts_.lastSize()==20,"Selected-range size is remembered immediately");
 text_->setSelectionRange(4,4);style(0,12);check(value_.fontSize==12&&textStyleAt(value_,1).fontSize==20,"No selection updates base style");check(fonts_.lastSize()==12,"Base size is remembered before dialog confirmation");
 const auto savedRuns=value_.styleRuns;selectFont("Tiny5");check(value_.fontSize==8&&fonts_.lastSize()==8&&value_.styleRuns.size()==savedRuns.size()&&value_.styleRuns[0].fontSize==savedRuns[0].fontSize,"Font selection applies default base size and preserves range overrides");selectFont("Arial");check(value_.fontSize==8&&fonts_.lastSize()==8,"Font without default preserves current size");selectFontAfterRemoval();check(value_.fontFamily==fonts_.catalog().front().family&&value_.fontSize==8,"Font removal fallback uses usage-sorted catalog without changing size");
 auto key=[&](ui::KeyScancode scan,ui::KeyModifiers mods,int c=0){ui::KeyMessage message(ui::kKeyDownMessage,scan,mods,c,0);check(text_->onProcessMessage(&message),"Text key was not consumed");};
 key(ui::kKeyNil,ui::kKeyNoneModifier,'x');key(ui::kKeyNil,ui::kKeyNoneModifier,'y');check(value_.text==u"A\U0001f600BCxy","Text typing");
 key(ui::kKeyZ,ui::kKeyCtrlModifier);check(value_.text==u"A\U0001f600BC"&&text_->selectionRange()==std::pair<int,int>{4,4},"Local grouped undo");
 key(ui::kKeyY,ui::kKeyCtrlModifier);check(value_.text==u"A\U0001f600BCxy","Local redo");
 text_->setSelectionRange(1,2);key(ui::kKeyBackspace,ui::kKeyNoneModifier);check(value_.text==u"ABCxy","Unicode deletion");key(ui::kKeyZ,ui::kKeyCtrlModifier);check(value_.text==u"A\U0001f600BCxy"&&text_->selectionRange()==std::pair<int,int>{1,2},"Local undo restores selection");
 key(ui::kKeyNil,ui::kKeyNoneModifier,'q');check(!text_->redoLocal(),"New edit must clear redo");
 // Drive the same key handler used by both text and layer-property inputs.
 text_->setValue(U"ABCDE\nx\nABCDE");
 auto at=[&](int a,int b){check(text_->selectionRange()==std::pair<int,int>{a,b},"Text keyboard selection position");};
 text_->setSelectionRange(1,4);key(ui::kKeyLeft,ui::kKeyNoneModifier);at(1,1);
 text_->setSelectionRange(4,1);key(ui::kKeyRight,ui::kKeyNoneModifier);at(4,4);
 text_->setSelectionRange(1,4);key(ui::kKeyLeft,ui::kKeyShiftModifier);at(1,3);
 text_->setSelectionRange(4,4);key(ui::kKeyDown,ui::kKeyNoneModifier);at(7,7);key(ui::kKeyDown,ui::kKeyNoneModifier);at(12,12);
 key(ui::kKeyUp,ui::kKeyShiftModifier);at(7,12);key(ui::kKeyUp,ui::kKeyShiftModifier);at(4,12);
 // Horizontal navigation resets the desired column after crossing a short row.
 text_->setSelectionRange(4,4);key(ui::kKeyDown,ui::kKeyNoneModifier);key(ui::kKeyLeft,ui::kKeyNoneModifier);key(ui::kKeyDown,ui::kKeyNoneModifier);at(8,8);
 key(ui::kKeyHome,ui::kKeyCtrlModifier);at(0,0);key(ui::kKeyUp,ui::kKeyNoneModifier);at(0,0);
 key(ui::kKeyEnd,ui::kKeyCtrlModifier);at(13,13);key(ui::kKeyDown,ui::kKeyNoneModifier);at(13,13);
 key(ui::kKeyPageUp,ui::kKeyNoneModifier);at(0,0);key(ui::kKeyPageDown,ui::kKeyShiftModifier);at(0,13);
 check(!text_->undoLocal(),"Navigation must not create local text history");
 // Three glyphs fit per visual row; Home/End must not jump the whole paragraph.
 const auto originalTextBounds=text_->bounds();
 auto narrow=originalTextBounds;narrow.w=(12+font_.measure(U"ABC"))*uiScale;text_->setBounds(narrow);
 value_.text=u"ABCDEF\nG";value_.styleRuns.clear();text_->setValue(textUtf32(value_.text));text_->setSelectionRange(1,1);
 key(ui::kKeyEnd,ui::kKeyNoneModifier);at(3,3);key(ui::kKeyHome,ui::kKeyNoneModifier);at(0,0);
 key(ui::kKeyEnd,ui::kKeyShiftModifier);at(0,3);key(ui::kKeyRight,ui::kKeyNoneModifier);at(3,3);key(ui::kKeyHome,ui::kKeyNoneModifier);at(0,0);
 key(ui::kKeyEnd,ui::kKeyShiftModifier);key(ui::kKeyHome,ui::kKeyShiftModifier);at(0,0);
 key(ui::kKeyEnd,ui::kKeyNoneModifier);key(ui::kKeyDown,ui::kKeyNoneModifier);at(6,6);
 key(ui::kKeyUp,ui::kKeyNoneModifier);at(3,3);key(ui::kKeyHome,ui::kKeyNoneModifier);at(0,0);
 // Explicitly setting the same offset addresses the next row's start instead.
 text_->setSelectionRange(3,3);key(ui::kKeyEnd,ui::kKeyNoneModifier);at(6,6);key(ui::kKeyHome,ui::kKeyNoneModifier);at(3,3);
 // An edit and local Undo restore the visual side of the wrap as well as the offset.
 text_->setSelectionRange(1,1);key(ui::kKeyEnd,ui::kKeyNoneModifier);key(ui::kKeyNil,ui::kKeyNoneModifier,'z');
 key(ui::kKeyZ,ui::kKeyCtrlModifier);check(value_.text==u"ABCDEF\nG","Wrapped input undo restores content");at(3,3);
 key(ui::kKeyHome,ui::kKeyNoneModifier);at(0,0);
 // Hit testing includes the trailing insertion point of the preceding row.
 auto pointer=text_->bounds().origin()+gfx::Point((6+font_.measure(U"ABC"))*uiScale,9*uiScale);
 ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,pointer);
 text_->onProcessMessage(&down);
 ui::MouseMessage up(ui::kMouseUpMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,pointer);
 text_->onProcessMessage(&up);at(3,3);key(ui::kKeyHome,ui::kKeyNoneModifier);at(0,0);
 text_->setBounds(originalTextBounds);
 // Unicode clusters are single navigation/deletion units, UTF16 styles remain unchanged.
 for(const auto& cluster:std::vector<std::u32string>{U"e\u0301",U"\U0001f1e8\U0001f1f3",U"\U0001f469\u200d\U0001f4bb",U"\U0001f44d\U0001f3fd",U"\u1100\u1161\u11a8"}){
  const auto sample=U"A"+cluster+U"B";const int end=1+int(cluster.size());
  value_.text=textUtf16(sample);value_.styleRuns.clear();text_->setValue(sample);text_->setSelectionRange(1,1);
  key(ui::kKeyRight,ui::kKeyNoneModifier);at(end,end);key(ui::kKeyLeft,ui::kKeyShiftModifier);at(1,end);
  key(ui::kKeyLeft,ui::kKeyNoneModifier);at(1,1);key(ui::kKeyDel,ui::kKeyNoneModifier);check(text_->value()==U"AB","Delete preserves complete Unicode clusters");
  key(ui::kKeyZ,ui::kKeyCtrlModifier);check(text_->value()==sample,"Cluster Delete undo restores original codepoints");at(1,1);
  key(ui::kKeyY,ui::kKeyCtrlModifier);check(text_->value()==U"AB","Cluster Delete redo");key(ui::kKeyZ,ui::kKeyCtrlModifier);
  text_->setSelectionRange(end,end);key(ui::kKeyBackspace,ui::kKeyNoneModifier);check(text_->value()==U"AB","Backspace preserves complete Unicode clusters");
  key(ui::kKeyZ,ui::kKeyCtrlModifier);check(text_->value()==sample,"Cluster Backspace undo");at(end,end);
  text_->setSelectionRange(2,2);key(ui::kKeyDel,ui::kKeyNoneModifier);check(text_->value()==U"AB","Interior caret Delete removes complete cluster");key(ui::kKeyZ,ui::kKeyCtrlModifier);check(text_->value()==sample,"Interior Delete undo");at(2,2);
  key(ui::kKeyBackspace,ui::kKeyNoneModifier);check(text_->value()==U"AB","Interior caret Backspace removes complete cluster");key(ui::kKeyZ,ui::kKeyCtrlModifier);check(text_->value()==sample,"Interior Backspace undo");
 }
 value_.text=u"A\nB";value_.styleRuns.clear();text_->setValue(U"A\nB");text_->setSelectionRange(1,1);key(ui::kKeyDel,ui::kKeyNoneModifier);check(value_.text==u"AB","Newline remains an editable boundary");key(ui::kKeyZ,ui::kKeyCtrlModifier);check(value_.text==u"A\nB","Newline undo");
 // Native pixel geometry has different glyph widths from browser shaping;
 // verify the browser-observed invariant with the actual pointer/key handler.
 const auto clusterBounds=text_->bounds();
 for(const auto& cluster:std::vector<std::u32string>{U"e\u0301",U"\U0001f1e8\U0001f1f3",U"\U0001f469\u200d\U0001f4bb",U"\U0001f44d\U0001f3fd",U"\u1100\u1161\u11a8"}){
  const auto sample=U"A"+cluster+U"B";const int end=1+int(cluster.size());
  value_.text=textUtf16(sample);value_.styleRuns.clear();text_->setValue(sample);
  const int width=std::max(font_.measure(cluster),font_.measure(U"A"));
  auto narrow=clusterBounds;narrow.w=(12+width)*uiScale;text_->setBounds(narrow);
  auto legal=[&]{const auto selected=text_->selectionRange();for(const int offset:{selected.first,selected.second})check(offset==0||offset==1||offset==end||offset==end+1,"Pointer/vertical selection must not split Unicode cluster");};
  auto pointer=[&](ui::MessageType type,int x,int row,ui::KeyModifiers modifiers=ui::kKeyNoneModifier){ui::MouseMessage event(type,os::PointerType::Mouse,ui::kButtonLeft,modifiers,text_->bounds().origin()+gfx::Point((6+x)*uiScale,(9+12*row)*uiScale));check(text_->onProcessMessage(&event),"Cluster pointer input consumed");legal();};
  // Whole cluster wraps after A; its internal codepoints cannot create extra rows.
  text_->setSelectionRange(0,0);key(ui::kKeyDown,ui::kKeyNoneModifier);at(1,1);
  key(ui::kKeyEnd,ui::kKeyNoneModifier);at(end,end);key(ui::kKeyHome,ui::kKeyNoneModifier);at(1,1);
  key(ui::kKeyEnd,ui::kKeyShiftModifier);at(1,end);
  text_->setSelectionRange(0,0);key(ui::kKeyDown,ui::kKeyShiftModifier);at(0,1);key(ui::kKeyDown,ui::kKeyShiftModifier);at(0,end);
  for(int row=0;row<3;++row)for(int x=0;x<=width+2;++x){pointer(ui::kMouseDownMessage,x,row);pointer(ui::kMouseUpMessage,x,row);}
  pointer(ui::kMouseDownMessage,0,0);pointer(ui::kMouseMoveMessage,width,1);pointer(ui::kMouseUpMessage,width,1);at(0,end);
  pointer(ui::kMouseDownMessage,width,1);pointer(ui::kMouseMoveMessage,0,0);pointer(ui::kMouseUpMessage,0,0);at(0,end);
  pointer(ui::kMouseDownMessage,0,1);pointer(ui::kMouseUpMessage,0,1);at(1,1);
  pointer(ui::kMouseDownMessage,width,1,ui::kKeyShiftModifier);pointer(ui::kMouseUpMessage,width,1,ui::kKeyShiftModifier);at(1,end);
  check(text_->value()==sample&&!text_->undoLocal(),"Pointer and vertical navigation do not alter content/history");
 }
 text_->setBounds(clusterBounds);
 int wordCase=0;std::string wordErrors;
 for(const auto& fixture:textWordBrowserCases){
  value_.text=textUtf16(fixture.before);value_.styleRuns.clear();text_->setValue(fixture.before);text_->setSelectionRange(fixture.anchor,fixture.caret);
  const auto modifiers=ui::KeyModifiers(ui::kKeyCtrlModifier|(fixture.shift?ui::kKeyShiftModifier:ui::kKeyNoneModifier));
  key(fixture.key,modifiers);
  if(text_->value()!=fixture.after||text_->selectionRange()!=std::pair<int,int>{fixture.start,fixture.end}){if(wordErrors.size()<3000)wordErrors+="Browser word-navigation mismatch in case "+std::to_string(wordCase)+" actual="+std::to_string(text_->selectionRange().first)+","+std::to_string(text_->selectionRange().second)+" text="+utf8Text(text_->value())+"\n";++wordCase;continue;}
  if(std::u32string(fixture.before)!=fixture.after){
   key(ui::kKeyZ,ui::kKeyCtrlModifier);check(text_->value()==fixture.before,"Word deletion local undo");
   key(ui::kKeyY,ui::kKeyCtrlModifier);check(text_->value()==fixture.after,"Word deletion local redo");
  }else check(!text_->undoLocal(),"Word navigation adds no text history");
  ++wordCase;
 }
 if(!wordErrors.empty())throw std::runtime_error(wordErrors);
 fonts_.recordSize(originalLastSize);value_=original;live=originalLive;text_->setValue(textUtf32(value_.text));text_->setSelectionRange(0,0);update();
 }
 os::SurfaceRef smokeFrame(){auto surface=os::instance()->makeRgbaSurface(bounds().w,bounds().h);surface->clear();{ui::Graphics g(surface);{UiPaintScale scale(g);skin_.drawDialogBackground(g,uiLogical(clientBounds()));}ui::PaintEvent ev(this,&g);paintDialogContents(ev);}auto paint=[&](auto child){if(!child->isVisible())return;ui::Graphics g(nullptr,surface,child->bounds().x-bounds().x,child->bounds().y-bounds().y);ui::PaintEvent ev(child,&g);child->onPaint(ev);};paint(text_);for(PixelButton* b:{family_,align_,layout_,spacing_,render_})paint(b);for(auto e:numbers_)paint(e);for(auto b:{color_,ok_,cancel_,close_,live_,import_,system_,erase_})paint(b);return surface;}
 void smokeClearAndRestore(const std::function<void(bool)>& verify){
  const auto original=value_.text;auto send=[&](ui::KeyScancode code,ui::KeyModifiers mods){ui::KeyMessage event(ui::kKeyDownMessage,code,mods,0,0);if(!text_->onProcessMessage(&event))throw std::runtime_error("Text empty draft input was not consumed");};
  send(ui::kKeyA,ui::kKeyCtrlModifier);send(ui::kKeyBackspace,ui::kKeyNoneModifier);if(!value_.text.empty())throw std::runtime_error("Text deletion did not clear value");verify(true);ok_->Click();if(accepted_)throw std::runtime_error("Empty text cannot be confirmed");
  send(ui::kKeyZ,ui::kKeyCtrlModifier);if(value_.text!=original)throw std::runtime_error("Text local Undo did not restore emptied draft");verify(false);
  send(ui::kKeyY,ui::kKeyCtrlModifier);verify(true);send(ui::kKeyZ,ui::kKeyCtrlModifier);verify(false);
 }
 void smokeAccept(){ok_->Click();}
 bool accepted()const{return accepted_;}const TextCelData& value()const{return value_;}
 gfx::Size minimumDialogSize(int)const override{return {440*uiScale,340*uiScale};}
 void onResize(ui::ResizeEvent& e)override{setBoundsQuietly(e.bounds());const auto r=bounds();int w=r.w/uiScale,h=r.h/uiScale;auto p=[&](ui::Widget* c,gfx::Rect b){c->setBounds(uiPhysical(b).offset(r.origin()));};layoutHeaderButton(close_);p(text_,{6,27,w-12,112});p(family_,{6,155,w-12,20});for(int i=0;i<3;++i)p(numbers_[i],{6+i*100,191,94,20});p(render_,{306,191,w-312,20});p(spacing_,{6,227,94,20});p(align_,{106,227,94,20});p(layout_,{206,227,94,20});p(color_,{306,227,w-312,20});p(numbers_[3],{6,263,94,20});p(numbers_[4],{106,263,94,20});p(import_,{206,263,72,20});p(system_,{280,263,72,20});p(erase_,{354,263,w-360,20});int y=DialogLayout::footer(h);p(live_,{6,y,80,20});p(cancel_,{w-118,y,55,20});p(ok_,{w-61,y,55,20});}
 void paintDialogContents(ui::PaintEvent& e)override{auto& g=*e.graphics();UiPaintScale scale(g);auto r=uiLogical(clientBounds());drawDialogTitle(font_,g,r,U"文字工具");auto label=[&](const char32_t* t,int x,int y){font_.draw(g,t,r.x+x,r.y+y,skin_["muted"]);};label(U"字体",6,143);label(U"字号",6,179);label(U"行间距",106,179);label(U"字间距",206,179);label(U"渲染",306,179);label(U"间距模式",6,215);label(U"对齐",106,215);label(U"布局",206,215);label(U"颜色",306,215);label(U"框宽",6,251);label(U"框高",106,251);if(!error_.empty())font_.draw(g,error_,r.x+6,r.y+286,skin_["text"]);}
 bool onProcessMessage(ui::Message* m)override{if(processDialogGeometry(m))return true;if(m->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(m)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return PixelPopupWindow::onProcessMessage(m);}
};
}
