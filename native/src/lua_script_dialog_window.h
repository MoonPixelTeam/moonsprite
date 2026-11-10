#pragma once
#include "lua_script_dialog_state.h"
#include "lua_script_numeric_widgets.h"
#include "color_editor_popup.h"
#include "ui/resize_event.h"
#include <limits>
namespace moon {
// LuaScriptDialog.tsx native window. The host supplies model replacements and
// busy state, and queues action JSON; it must never destroy this in a callback.
class ScriptDialogWindow final:public PixelDialog {
 class Viewport final:public ui::Widget {public:Viewport():ui::Widget(ui::kGenericWidget){setTransparent(true);}void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());}};
 using Object=winrt::Windows::Data::Json::JsonObject;
 using Value=winrt::Windows::Data::Json::JsonValue;
 using Type=winrt::Windows::Data::Json::JsonValueType;
 struct Row {Object model;ui::Widget* widget=nullptr;int y=0;};
 const PixelFont& font_;const Skin& skin_;const Skin& icons_;
 Object model_;script::DialogState state_;std::vector<Row> rows_;
 ui::Widget* viewport_;PixelScrollBar* bar_;PixelButton* close_;
 int scroll_=0,total_=0;bool busy_=false,resetting_=false;
 std::function<void(std::string)> send_;
 std::unique_ptr<ColorEditorPopup> color_;std::filesystem::path colorStorage_;
 std::optional<std::string> colorId_;bool closing_=false;
 static double number(const Object& c,const wchar_t* key,double fallback){return c.HasKey(key)&&c.GetNamedValue(key).ValueType()==Type::Number?c.GetNamedNumber(key):fallback;}
 static std::string id(const Object& c){return winrt::to_string(c.GetNamedString(L"id"));}
 auto value(const Object& c)const{const auto key=c.GetNamedValue(L"dataKey");if(key.ValueType()==Type::String&&!key.GetString().empty())return Object::Parse(winrt::to_hstring(state_.valuesJson())).GetNamedValue(key.GetString());return c.GetNamedValue(L"value");}
 void emit(std::optional<std::string> action){if(action&&!resetting_&&!busy_){setBusy(true);if(send_)send_(std::move(*action));}}
 void draft(const std::string& key,const std::string& json){if(!resetting_)state_.edit(key,json,busy_);}
 void commit(const std::string& key,script::DialogState::Commit when){emit(state_.commit(key,when,busy_));}
 void click(const std::string& key){auto action=state_.click(key,busy_);syncChecks();emit(std::move(action));}
 void syncChecks(){for(auto& row:rows_)if(auto check=dynamic_cast<PixelCheckbox*>(row.widget)){const auto v=value(row.model);check->setChecked(v.ValueType()==Type::Boolean&&v.GetBoolean());}}
 static Pixel packed(const winrt::Windows::Data::Json::IJsonValue& v){if(v.ValueType()!=Type::Object)return 0xff000000;const auto o=v.GetObject();Pixel p=0;int shift=0;for(auto k:{L"r",L"g",L"b",L"a"}){p|=Pixel(std::clamp(number(o,k,k==std::wstring(L"a")?255:0),0.,255.))<<shift;shift+=8;}return p;}
 static std::string colorJson(Pixel p){Object o;int shift=0;for(auto k:{L"r",L"g",L"b",L"a"}){o.Insert(k,Value::CreateNumberValue((p>>shift)&255));shift+=8;}return winrt::to_string(o.Stringify());}
 void openColor(const std::string& key,PixelButton* button){
  if(busy_)return;if(!color_){color_=std::make_unique<ColorEditorPopup>(font_,skin_,icons_,colorStorage_);color_->Close.connect([this](ui::CloseEvent&){auto key=std::move(colorId_);colorId_.reset();if(key&&!closing_&&!resetting_)commit(*key,script::DialogState::Commit::Change);});}
  colorId_=key;color_->setDisplay(display(),false);color_->open(button->bounds(),display()->bounds(),button->swatch,U"颜色",{},[this,key,button](Pixel p){draft(key,colorJson(p));button->swatch=p;button->invalidate();},{});
 }
 void layout(){
  const auto r=bounds();layoutHeaderButton(close_);const auto body=uiPhysical({6,DialogLayout::bodyTop,r.w/uiScale-12,std::max(1,r.h/uiScale-DialogLayout::bodyTop-6)}).offset(r.origin());viewport_->setBounds(body);
  const int page=body.h/uiScale;scroll_=std::clamp(scroll_,0,std::max(0,total_-page));bar_->setVisible(total_>page);bar_->setBounds({body.x2()-7*uiScale,body.y,7*uiScale,body.h});bar_->configure(total_,page,scroll_);
  const int w=body.w/uiScale-(bar_->isVisible()?9:0),label=std::min(110,std::max(60,w*2/5));
  for(auto& row:rows_){if(!row.widget)continue;const bool visible=row.model.GetNamedBoolean(L"visible");const int y=row.y-scroll_;row.widget->setVisible(visible&&y>=0&&y+20<=page);row.widget->setBounds({body.x+(label+2)*uiScale,body.y+y*uiScale,std::max(1,w-label-2)*uiScale,20*uiScale});}
  invalidate();
 }
 void requestClose(){if(!busy_)emit(state_.close());}
 void build(){
  for(auto& r:rows_)if(r.widget){viewport_->removeChild(r.widget);delete r.widget;}rows_.clear();total_=0;
  for(const auto& item:model_.GetNamedArray(L"controls")){auto c=item.GetObject();Row row{c,nullptr,total_};if(c.GetNamedBoolean(L"visible"))total_+=22;const auto kind=c.GetNamedString(L"kind");const auto key=id(c);const auto v=value(c);auto text=c.GetNamedString(L"text");auto label=unicodeText(winrt::to_string(text.empty()?c.GetNamedString(L"id"):text));
   if(kind==L"entry"){auto e=new PixelEntry(font_,skin_);e->setText(v.ValueType()==Type::String?winrt::to_string(v.GetString()):"");e->Change.connect([this,e,key]{draft(key,winrt::to_string(Value::CreateStringValue(winrt::to_hstring(e->text())).Stringify()));});e->accept=[this,key]{commit(key,script::DialogState::Commit::Enter);};e->blur=[this,key]{commit(key,script::DialogState::Commit::Blur);};row.widget=e;}
   else if(kind==L"number"){auto e=new ScriptNumberEntry(font_,skin_,v.ValueType()==Type::Number?v.GetNumber():0,number(c,L"min",-std::numeric_limits<double>::max()),number(c,L"max",std::numeric_limits<double>::max()),number(c,L"step",1));e->changed=[this,key](double n){draft(key,winrt::to_string(Value::CreateNumberValue(n).Stringify()));};e->committed=[this,key]{commit(key,script::DialogState::Commit::Blur);};row.widget=e;}
   else if(kind==L"slider"){const auto low=number(c,L"min",0);auto s=new ScriptRangeSlider(font_,skin_,v.ValueType()==Type::Number?v.GetNumber():low,low,number(c,L"max",std::max(low+1,100.)),number(c,L"step",1));s->draftChanged=[this,key](double n){draft(key,winrt::to_string(Value::CreateNumberValue(n).Stringify()));};s->released=[this,key]{commit(key,script::DialogState::Commit::PointerUp);};row.widget=s;}
   else if(kind==L"button")row.widget=new PixelButton(font_,skin_,label,[this,key]{click(key);});
   else if(kind==L"check"||kind==L"radio"){auto check=new PixelCheckbox(font_,skin_,label,v.ValueType()==Type::Boolean&&v.GetBoolean(),[this,key,kind](bool selected){if(kind==L"check")draft(key,selected?"true":"false");click(key);});row.widget=check;}
   else if(kind==L"combobox"){auto d=new PixelDropdown(font_,skin_);std::vector<std::u32string> options;int selected=0;for(const auto& option:c.GetNamedArray(L"options")){if(v.ValueType()==Type::String&&option.GetString()==v.GetString())selected=int(options.size());options.push_back(unicodeText(winrt::to_string(option.GetString())));}d->setOptions(options);d->setSelectedIndex(selected);d->changed=[this,key,c](int i){auto options=c.GetNamedArray(L"options");if(i<0||i>=int(options.Size()))return;draft(key,winrt::to_string(options.GetAt(i).Stringify()));commit(key,script::DialogState::Commit::Change);};row.widget=d;}
   else if(kind==L"color"){auto b=new PixelButton(font_,skin_,U"",[]{});b->paletteCell=true;b->swatch=packed(v);b->Click.connect([this,key,b]{openColor(key,b);});row.widget=b;}
   else if(kind!=L"label"&&kind!=L"separator")throw std::invalid_argument("Unsupported Lua dialog control");
   if(row.widget)viewport_->addChild(row.widget);rows_.push_back(std::move(row));
  }
  if(total_)total_-=2;setBusy(busy_);if(!bounds().isEmpty())layout();
 }
public:
 std::function<void()> escape;
 ScriptDialogWindow(const PixelFont& font,const Skin& skin,const Skin& icons,std::string model,std::filesystem::path colorStorage,std::function<void(std::string)> send):PixelDialog(skin,"",ClickBehavior::DoNothingOnClick,EnterBehavior::DoNothingOnEnter),font_(font),skin_(skin),icons_(icons),model_(Object::Parse(winrt::to_hstring(model))),state_(model),colorStorage_(std::move(colorStorage)),send_(std::move(send)){
  setAutoRemap(false);setWantFocus(true);viewport_=new Viewport;addChild(viewport_);bar_=new PixelScrollBar(skin,true);addChild(bar_);bar_->changed=[this](int n){scroll_=n;layout();};close_=new PixelButton(font,skin,U"",[this]{requestClose();});close_->iconSkin=&icons;close_->icon="close";close_->skinStyle="icon_button";addChild(close_);build();
 }
 ~ScriptDialogWindow(){closing_=true;if(color_)color_->closeWindow(nullptr);}
 void closeFromHost(){closing_=true;closeWindow(nullptr);}
 void onBeforeClose(ui::CloseEvent& ev)override{if(!closing_){ev.cancel();requestClose();}}
 void editEntryForCheck(const std::string& key,const std::string& text,bool submit=false){for(auto& r:rows_)if(id(r.model)==key){auto e=dynamic_cast<PixelEntry*>(r.widget);if(!e)throw std::runtime_error("Expected script entry");e->setText(text);e->Change();if(submit)e->accept();return;}throw std::runtime_error("Script entry missing");}
 std::string draftValuesForCheck()const{return state_.valuesJson();}
 void clickForCheck(const std::string& key){for(auto& r:rows_)if(id(r.model)==key){auto b=dynamic_cast<PixelButton*>(r.widget);if(!b)throw std::runtime_error("Expected script button");b->Click();return;}throw std::runtime_error("Script button missing");}
 bool busyForCheck()const{return busy_;}
 void setBusy(bool busy){busy_=busy;close_->setEnabled(!busy);for(auto& r:rows_)if(r.widget)r.widget->setEnabled(!busy&&r.model.GetNamedBoolean(L"enabled"));}
 void replace(std::string model){resetting_=true;if(color_)color_->closeWindow(nullptr);model_=Object::Parse(winrt::to_hstring(model));state_.reset(model);build();resetting_=false;}
 gfx::Size minimumDialogSize(int)const override{return {320*uiScale,100*uiScale};}
 int preferredHeight()const{return DialogLayout::bodyTop+std::min(total_,360)+6;}
 void onResize(ui::ResizeEvent& ev)override{setBoundsQuietly(ev.bounds());layout();}
 void paintDialogContents(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto r=uiLogical(clientBounds());const auto title=model_.GetNamedString(L"title");drawDialogTitle(font_,g,r,title.empty()?U"Lua Script":unicodeText(winrt::to_string(title)));const int bottom=r.h-6;g.saveClip();g.clipRect({r.x+6,r.y+DialogLayout::bodyTop,r.w-21,std::max(0,bottom-DialogLayout::bodyTop)});for(const auto& row:rows_){if(!row.model.GetNamedBoolean(L"visible"))continue;const int y=r.y+DialogLayout::bodyTop+row.y-scroll_;if(y+20<r.y+DialogLayout::bodyTop||y>=r.y+bottom)continue;const auto kind=row.model.GetNamedString(L"kind");auto label=row.model.GetNamedString(L"label");if(label.empty()&&(kind==L"entry"||kind==L"number"||kind==L"slider"||kind==L"combobox"||kind==L"color"))label=row.model.GetNamedString(L"text");const int labelWidth=std::min(110,std::max(60,(r.w-12-(bar_->isVisible()?9:0))*2/5));g.saveClip();g.clipRect({r.x+6,y,labelWidth,20});font_.draw(g,unicodeText(winrt::to_string(label)),r.x+6,y+5,skin_["text"]);g.restoreClip();if(kind==L"label"||kind==L"separator")font_.draw(g,unicodeText(winrt::to_string(row.model.GetNamedString(L"text"))),r.x+8+labelWidth,y+5,skin_["text"]);}g.restoreClip();}
 bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kMouseWheelMessage){scroll_+=static_cast<ui::MouseMessage*>(msg)->wheelDelta().y*66;layout();return true;}if(msg->type()==ui::kKeyDownMessage&&static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){if(escape)escape();else requestClose();return true;}return PixelDialog::onProcessMessage(msg);}
 void verify(){if(rows_.size()<3)throw std::runtime_error("Script dialog rows missing");int lastBottom=viewport_->bounds().y;for(const auto& row:rows_)if(row.widget&&row.widget->isVisible()){const auto b=row.widget->bounds();if(b.h!=20*uiScale||b.w<=0||b.y<lastBottom||!viewport_->bounds().contains(b))throw std::runtime_error("Script dialog control geometry");lastBottom=b.y2();}for(auto& r:rows_)if(r.widget&&r.model.GetNamedString(L"kind")==L"entry"){auto e=static_cast<PixelEntry*>(r.widget);e->setText("native draft");e->Change();e->accept();return;}throw std::runtime_error("Script dialog entry missing");}
};
}
