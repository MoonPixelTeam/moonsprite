#include "editor.h"
#include "editor_implementation.h"
#include "outline_dialog.h"
#include "outline_settings_json.h"
namespace moon::editor {
OutlineSettings Editor::savedOutlineSettings()const{
 if(document.outlineSettings())return *document.outlineSettings();
 if(auto it=runtimePreferences_.values.find("outline.settings.json");it!=runtimePreferences_.values.end())try{auto parsed=decodeOutlineSettings(winrt::Windows::Data::Json::JsonValue::Parse(winrt::to_hstring(it->second)),document.palette().primary);if(parsed)return *parsed;}catch(...){}
 OutlineSettings settings;settings.color=document.palette().primary;return settings;
}
void Editor::saveOutlineDefaults(const OutlineSettings& settings){
 runtimePreferences_.values["outline.settings.json"]=winrt::to_string(encodeOutlineSettings(settings).Stringify());
 if(!smoke_)try{if(!runtimePreferencesReadable_)throw std::runtime_error("原首选项读取失败，未覆盖");auto text=runtimePreferences_.encode();auto path=palettePreferencePath().parent_path()/"editor-preferences.txt";std::filesystem::create_directories(path.parent_path());writeExportBytesAtomic(path,{text.begin(),text.end()});}catch(const std::exception& e){status_=U"描边设置保存失败："+unicodeText(e.what());}
}
void Editor::quickOutline(bool boundary){
 if(boundary&&!document.selection()){status_=U"需要先创建选区";refresh();return;}
 auto settings=savedOutlineSettings();settings.color=document.palette().primary;settings.smartHue=false;if(boundary)settings.sampling.position=0;
 try{playing_=false;if(document.applyOutline(settings,selectedMaskSlots_,boundary)){if(!boundary)saveOutlineDefaults(settings);}else status_=U"当前选区或图层内没有可描边的内容。";}
 catch(const std::exception& e){status_=U"无法应用描边："+unicodeText(e.what());}refresh();
}
void Editor::openOutline(int verify){
 if(!documentOpen_||homeOpen_||pending_!=Pending::None||(document.active()&&!document.floating()))return;
 document.commitFloatingPaste();cancelStroke();playing_=false;auto settings=savedOutlineSettings();settings.color=document.palette().primary;
 bool remember=false;if(auto it=runtimePreferences_.values.find("outline.color.json");it!=runtimePreferences_.values.end())try{auto value=winrt::Windows::Data::Json::JsonObject::Parse(winrt::to_hstring(it->second));remember=value.GetNamedBoolean(L"rememberLastSelectedColor",false);if(remember)if(auto c=decodeOutlineSettings(value,settings.color))settings.color=c->color;}catch(...){}
 for(auto name:{"outline-kernel-round","outline-kernel-square","outline-kernel-horizontal","outline-kernel-vertical","outline-direction-on","outline-direction-off"})if(!toolIcons_.assets.patches.count(name))toolIcons_.assets.patches[name]=importSkinPng(assets_/"utility-icons"/(std::string(name)+".png"),32);
 const auto identity=document.identity(),revision=document.revision();const auto foreground=document.palette().primary;
 struct Result{Document::OutlineTask task;std::uint64_t generation;bool apply=false,completed=false;std::string error;};
 std::future<Result> worker;std::optional<OutlineSettings> queued;std::shared_ptr<std::atomic<bool>> token;std::uint64_t generation=0;bool queuedApply=false,finished=false,published=false;
 auto valid=[&]{return document.identity()==identity&&document.revision()==revision;};
 auto clear=[&]{if(token)token->store(true);++generation;queued.reset();published=false;if(valid())document.cancelColorAdjustment();refresh();};
 auto launch=[&]{if(!queued||worker.valid()||!valid())return;auto value=*queued;queued.reset();auto task=document.captureOutlineTask(value,selectedMaskSlots_);token=std::make_shared<std::atomic<bool>>(false);auto cancel=token;const auto current=generation;const bool applying=queuedApply;
  worker=std::async(std::launch::async,[task=std::move(task),cancel,current,applying]()mutable{Result result{std::move(task),current,applying};try{result.completed=Document::runOutlineTask(result.task,[cancel]{return cancel->load();});}catch(const std::exception& e){result.error=e.what();}return result;});};
 auto preview=[&](std::optional<OutlineSettings> value){if(finished)return;clear();if(value){queued=value;queuedApply=false;launch();}};
 auto apply=[&](OutlineSettings value){clear();queued=value;queuedApply=true;launch();};
 auto poll=[&]()->std::optional<bool>{std::optional<bool> applied;if(worker.valid()&&worker.wait_for(std::chrono::seconds(0))==std::future_status::ready){auto result=worker.get();if(valid()&&result.generation==generation){if(!result.error.empty())throw std::runtime_error(result.error);if(result.completed){if(result.apply){const auto value=result.task.settings;bool ok=document.commitOutlineTask(std::move(result.task));if(ok){finished=true;saveOutlineDefaults(value);}applied=ok;}else published=document.publishOutlineTask(result.task);refresh();}else if(result.apply)applied=false;}}launch();return applied;};
 auto colorPreference=[&](bool keep,Pixel color){if(!keep)color=foreground;winrt::Windows::Data::Json::JsonObject object;object.Insert(L"rememberLastSelectedColor",winrt::Windows::Data::Json::JsonValue::CreateBooleanValue(keep));OutlineSettings value;value.color=color;object.Insert(L"color",encodeOutlineSettings(value).GetNamedObject(L"color"));runtimePreferences_.values["outline.color.json"]=winrt::to_string(object.Stringify());if(!smoke_&&runtimePreferencesReadable_){auto text=runtimePreferences_.encode();auto path=palettePreferencePath().parent_path()/"editor-preferences.txt";std::filesystem::create_directories(path.parent_path());writeExportBytesAtomic(path,{text.begin(),text.end()});}};
 auto cleanup=[&]{finished=true;if(token)token->store(true);queued.reset();if(worker.valid())worker.get();if(valid())document.cancelColorAdjustment();refresh();};
 try{
  std::vector<Pixel> palette;for(const auto& c:document.palette().entries)if(c.id)palette.push_back(c.color);
  OutlineDialog popup(font_,skin_,toolIcons_,settings,remember,foreground,smoke_?assets_.parent_path()/"outline-color-smoke-size.txt":palettePreferencePath().parent_path()/"outline-color-size.txt",palette,[](Pixel c){return paletteHex(c);},[](const std::string& text,Pixel& c){return parsePaletteHex(text,c);},colorPreference,preview,apply,poll);popup.setDisplay(display(),false);auto view=canvasViewport();const int width=popup.preferredWidth()*uiScale,height=popup.preferredHeight()*uiScale;popup.setBounds({view.x+(view.w-width)/2,view.y+(view.h-height)/2,width,height});
  ui::Timer timer(70,&popup);int phase=0;auto phaseChanged=std::chrono::steady_clock::now();auto started=std::chrono::steady_clock::now();if(verify){timer.Tick.connect([&]{if(std::chrono::steady_clock::now()-started>std::chrono::seconds(15))throw std::runtime_error("Outline dialog timeout");if(phase==0){popup.smokeStep(0);phase=1;}else if(phase==1&&published){writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"outline-dialog-smoke.bmp");popup.smokeStep(1);phase=2;phaseChanged=std::chrono::steady_clock::now();}else if(phase==2&&std::chrono::steady_clock::now()-phaseChanged>std::chrono::milliseconds(120)&&!worker.valid()&&!queued){if(document.colorAdjustmentActive())throw std::runtime_error("Outline live off retained preview");popup.smokeStep(verify==1?2:3);phase=3;}});timer.start();}
  popup.openWindowInForeground();timer.stop();cleanup();
 }catch(...){cleanup();throw;}requestFocus();
}
void Editor::smokeOutline(){
 smoke_=true;homeOpen_=false;documentOpen_=true;playing_=false;selectedMaskSlots_.clear();document=Document(9,9);document.beginStroke({4,4},0xff123456);document.commitStroke();document.setPaletteRole(0xff00ff00,false,true);refresh();const auto original=document.pixels();const auto history=document.historySize();
 if(!menuCommands_.invoke("quickOutline")||document.pixels()[31]!=0xff00ff00||document.historySize()!=history+1)throw std::runtime_error("Quick outline menu/current foreground");document.undo();
 openOutline(1);if(document.pixels()!=original||document.historySize()!=history+1||document.historyPosition()!=history||document.colorAdjustmentActive())throw std::runtime_error("Outline cancel mutated document");
 openOutline(2);if(document.pixels()==original||document.historyPosition()!=history+1||!document.outlineSettings()||document.outlineSettings()->sampling.thickness!=2||document.outlineSettings()->sampling.kernel!=1||document.outlineSettings()->sampling.directions!=254||document.outlineSettings()->previewEnabled)throw std::runtime_error("Outline dialog apply/settings");document.undo();if(document.pixels()!=original)throw std::runtime_error("Outline dialog undo");document.redo();document.undo();
 document.previewSelection(SelectionMask{1,1,3,3,{}});const auto position=document.outlineSettings()->sampling.position;
 if(!shortcutSupported("outlineSelectionInside")||!runShortcutCommand("outlineSelectionInside")||document.pixels()[10]!=0xff00ff00||document.outlineSettings()->sampling.position!=position)throw std::runtime_error("Outline boundary shortcut/settings isolation");
 document.undo();document.clearTimelineSelection();document.deselectPixels();const auto owner=document.layer().id,frame=document.frame().id;document.fillSelectionOrCanvas(0xff112233);if(!document.createAttachedMask(owner,frame))throw std::runtime_error("Outline mask fixture");document.beginStroke({4,4},0xff000000);document.commitStroke();const auto raster=document.pixels();selectedMaskSlots_={{owner,frame}};quickOutline();if(document.pixels()!=raster)throw std::runtime_error("Outline mask changed layer raster");selectedMaskSlots_.clear();document=Document();refresh();
}

}
