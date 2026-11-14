#include "editor.h"
#include "recent_export_paths.h"
#include "palette_layout.h"
#include "legacy_tools.h"
#include "background_preset_library.h"
#include "selection_pattern_brush.h"
#include "home_banner_pane.h"
#include "tool_property_popup.h"
#include "preview_panel.h"
#include "floating_column_surface.h"
#include "dialog_background.h"
#include "gradient_stops_track.h"
#include "interaction_profile.h"
#include "brush_library_delete_dialog.h"
#include "fill_pattern_settings_dialog.h"
#include "latest_task_queue.h"
#include "ui/property.h"

namespace moon::editor {
namespace {
// Legacy magnifier pending RAF sample and source-region cache, owned by the editor.
struct EyedropperLensWork final:ui::Property {
 bool pending=false,rendering=false,cached=false;
 gfx::Point pointer;Pixel sampled=0;
 std::uint64_t identity=0,revision=0,renders=0,reads=0;
 std::string frame,layer;EyedropperSource source=EyedropperSource::Composite;
 int x=0,y=0;std::vector<Pixel> pixels;
 EyedropperLensWork():ui::Property("moonsprite.eyedropper-lens-work"){}
};
struct BrushWrite {std::filesystem::path root;std::array<std::string,7> text;};
constexpr const char* brushFiles[]{"image-brush-modes.txt","pixel-stroke-options.txt","fill-pattern-options.txt","brush-dither-options.txt","magic-eraser-options.txt","brush-profiles.txt","image-brush-selection-v1.txt"};
void writeBrushBatch(const BrushWrite& value){std::filesystem::create_directories(value.root);for(int i=0;i<7;++i){std::ofstream out(value.root/brushFiles[i]);out<<value.text[i];out.close();if(!out)throw std::runtime_error("Brush preferences write failed");}}
struct BrushWrites final:ui::Property {
 LatestTaskQueue<BrushWrite> queue{[](auto value){return std::async(std::launch::async,[value]{writeBrushBatch(*value);});},[]{}};
 std::vector<LatestTaskQueue<BrushWrite>::Acknowledgement> acknowledgements;
 ui::Timer timer;std::function<void()> error;
 BrushWrites(ui::Widget* owner,std::function<void()> failure):ui::Property("moonsprite.brush-writes"),timer(16,owner),error(std::move(failure)){timer.Tick.connect([this]{poll(false);});}
 void poll(bool wait){if(wait)queue.waitIdle();else queue.poll();for(auto it=acknowledgements.begin();it!=acknowledgements.end();){if((*it)->wait_for(std::chrono::seconds(0))!=std::future_status::ready){++it;continue;}try{(*it)->get();}catch(const std::exception&){if(error)error();}it=acknowledgements.erase(it);}if(!queue.busy())timer.stop();}
 void enqueue(BrushWrite value){poll(false);const auto pending=queue.pendingValue(),active=queue.runningValue();const auto latest=pending?pending:active;if(latest&&latest->root==value.root&&latest->text==value.text)return;auto ack=queue.enqueue(std::make_shared<const BrushWrite>(std::move(value)));if(acknowledgements.empty()||acknowledgements.back()!=ack)acknowledgements.push_back(ack);timer.start();}
 ~BrushWrites(){timer.stop();error={};poll(true);}
};
void waitBrushWrites(const ui::Widget* owner){if(auto writes=std::dynamic_pointer_cast<BrushWrites>(owner->getProperty("moonsprite.brush-writes")))writes->poll(true);}
struct BrushSaveProfile {
 std::filesystem::path path;std::uint64_t calls=0;double total=0,maximum=0;
 BrushSaveProfile(){if(const auto value=_wgetenv(L"MOONSPRITE_INTERACTION_PROFILE")){path=value;path+=L".brush-save.tsv";}}
 ~BrushSaveProfile(){if(path.empty())return;try{std::ofstream out(path);out<<"calls\ttotal_ms\tmax_ms\n"<<calls<<'\t'<<total<<'\t'<<maximum<<'\n';}catch(...){}}
};
BrushSaveProfile& brushSaveProfile(){static BrushSaveProfile value;return value;}
struct BrushSaveScope {BrushSaveProfile& profile=brushSaveProfile();std::chrono::steady_clock::time_point start;BrushSaveScope(){if(!profile.path.empty())start=std::chrono::steady_clock::now();}~BrushSaveScope(){if(!profile.path.empty()){const auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();++profile.calls;profile.total+=ms;profile.maximum=std::max(profile.maximum,ms);}}};
}
bool Editor::isToolAvailableForSession(const char* id) const {
  if(!documentOpen_ || pending_!=Pending::None) return false;
  std::string raw=id ? id : "";
  const auto dot=raw.find('.');
  const std::string s=dot==std::string::npos?raw:raw.substr(0,dot);
  if(s=="move"||s=="selection"||s=="shape"||s=="line"||s=="fill") {
    // Rail child ids are canonicalized before applying the legacy session matrix.
  }
  std::vector<std::string> selected=currentDocument().selectedDirectLayerIds();
  if(selected.empty() && !currentDocument().layer().id.empty()) selected.push_back(currentDocument().layer().id);
  bool special=false,text=false,tilemap=false,freeTile=false;
  for(const auto& layer:currentDocument().timeline().state().layers) {
    if(std::find(selected.begin(),selected.end(),layer.id)==selected.end()) continue;
    if(!layer.kind.empty()) special=true;
    if(layer.kind=="text") text=true;
    if(layer.kind=="tilemap") tilemap=true;
    if(layer.kind=="free-tile") freeTile=true;
  }
  if(s=="magic-eraser" && special) return false;
  if(!currentDocument().activeMaskId().empty()) return true;
  if(currentDocument().hasSelectedGroups()) return s=="move"||s=="hand"||s=="zoom"||s=="rotate";
  if(text) return s=="text"||s=="move"||s=="eyedropper"||s=="hand"||s=="zoom"||s=="rotate";
  if(tilemap && currentDocument().tilemapMode()==tiles::Mode::Paint)
    return s=="pencil"||s=="eraser"||s=="selection"||s=="move"||s=="eyedropper"||s=="hand"||s=="zoom"||s=="rotate";
  if(freeTile) return (s=="selection"&&!currentDocument().freeTilePaintMode())||((raw=="fill"||raw=="fill.bucket"||raw=="fill.gradient"||s=="shape"||s=="line"||s=="airbrush")&&!currentDocument().freeTilePaintMode()&&currentDocument().layer().freeTiles&&!currentDocument().layer().freeTiles->sources.empty())||s=="hand"||s=="zoom"||s=="rotate"||s=="eyedropper"||((raw=="move"||raw=="move.move")&&currentDocument().freeTileInstanceView())||((currentDocument().freeTilePaintMode()||(currentDocument().layer().freeTiles&&!currentDocument().layer().freeTiles->sources.empty()))&&(s=="pencil"||s=="eraser"));
  if(special) return true;
  if(s=="eyedropper") return true;
  return currentDocument().rasterToolsAvailable()||s=="zoom"||s=="move"||s=="hand"||s=="rotate";
}void Editor::loadMagicEraserPreferences(){waitBrushWrites(this);
 const auto path=smoke_&&workspacePresetTestDirectory_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path();std::ifstream in(path/"magic-eraser-options.txt");int contiguous,tolerance,gap,threshold;if(in>>contiguous>>tolerance>>gap>>threshold){currentTools().magicEraserContiguous=contiguous!=0;currentTools().wandOptions.tolerance=std::clamp(tolerance,0,255);currentTools().wandOptions.gapClosing=gap!=0;currentTools().wandOptions.gapThreshold=std::clamp(threshold,1,16);}
}
void Editor::smokeFillPatternSettings(){
 smoke_=true;homeOpen_=false;documentOpen_=true;replaceDocumentForSmoke(Document(8,8));pending_=Pending::None;useFillTool();const auto original=currentTools().fillPattern;const auto originalDirectory=workspacePresetTestDirectory_;const auto testDirectory=assets_.parent_path()/"pattern-dialog-test-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(testDirectory);workspacePresetTestDirectory_=testDirectory;
 struct Restore{std::function<void()> fn;~Restore(){fn();}}restore{[&]{currentTools().fillPattern=original;workspacePresetTestDirectory_=originalDirectory;refresh();}};
 auto require=[](bool value,const char* reason){if(!value)throw std::runtime_error(reason);};auto values=[](const PatternSettings& s){return std::array<int,9>{s.randomDensity,s.randomCount,s.randomSpacing,int(s.randomOverlap),s.regularCount,s.regularSpacingX,s.regularSpacingY,int(s.regularOverlap),s.regularRowOffset};};
 currentTools().fillPattern.mode=PatternMode::Random;currentTools().fillPattern.paintMode=PatternPaintMode::Source;currentTools().fillPattern.settings={};currentTools().fillPattern.settings.regularCount=8;currentTools().fillPattern.settings.regularSpacingX=7;currentTools().fillPattern.settings.regularSpacingY=9;currentTools().fillPattern.settings.regularOverlap=true;currentTools().fillPattern.settings.regularRowOffset=11;const auto baseline=currentTools().fillPattern.settings;const auto pixels=currentDocument().canvasPixels();const auto history=currentDocument().historyPosition();
 for(int cancel:{0,6,7,10}){showFillPatternSettings(cancel);require(values(currentTools().fillPattern.settings)==values(baseline)&&!std::filesystem::exists(testDirectory/"fill-pattern-options.txt"),"Pattern Cancel Escape header-close discard draft and do not persist");}
 showFillPatternSettings(8);require(currentTools().fillPattern.settings.randomDensity==37&&currentTools().fillPattern.settings.randomCount==0&&currentTools().fillPattern.settings.regularCount==8&&currentTools().fillPattern.settings.regularRowOffset==11,"Pattern Enter commits only active random fields");const auto saved=currentTools().fillPattern.settings;currentTools().fillPattern.settings={};currentTools().fillPattern.mode=PatternMode::Default;currentTools().fillPattern.paintMode=PatternPaintMode::Paint;loadFillPatternPreferences();require(values(currentTools().fillPattern.settings)==values(saved)&&currentTools().fillPattern.mode==PatternMode::Random&&currentTools().fillPattern.paintMode==PatternPaintMode::Source,"Pattern accepted settings/mode/sampling restore from isolated preferences");
 showFillPatternSettings(2);require(currentTools().fillPattern.settings.randomCount==17&&currentTools().fillPattern.settings.randomDensity==37,"Pattern target count toggles preserve dormant density/count");currentTools().fillPattern.settings.randomSpacing=12;currentTools().fillPattern.settings.randomOverlap=true;showFillPatternSettings(3);require(currentTools().fillPattern.settings.randomOverlap&&currentTools().fillPattern.settings.randomSpacing==0,"Pattern random overlap conflict normalization and zero gap apply");const auto randomBeforeRegular=values(currentTools().fillPattern.settings);
 currentTools().fillPattern.mode=PatternMode::Regular;currentTools().fillPattern.settings.regularOverlap=true;currentTools().fillPattern.settings.regularSpacingX=-8;currentTools().fillPattern.settings.regularSpacingY=-3;showFillPatternSettings(4);require(!currentTools().fillPattern.settings.regularOverlap&&currentTools().fillPattern.settings.regularSpacingX==0&&currentTools().fillPattern.settings.regularSpacingY==0&&currentTools().fillPattern.settings.regularRowOffset==0&&currentTools().fillPattern.settings.randomCount==randomBeforeRegular[1],"Pattern disabling regular overlap clears negatives/row offset without random changes");showFillPatternSettings(5);require(currentTools().fillPattern.settings.regularCount==0&&currentTools().fillPattern.settings.regularSpacingX==0&&currentTools().fillPattern.settings.regularSpacingY==0&&currentTools().fillPattern.settings.randomDensity==randomBeforeRegular[0]&&currentTools().fillPattern.settings.randomCount==randomBeforeRegular[1],"Pattern Reset applies current mode only and restores automatic count");showFillPatternSettings(9);require(currentTools().fillPattern.settings.regularSpacingX==13,"Pattern Enter commits current unblurred arithmetic spacing field before redisplay");

 const auto beforePresets=values(currentTools().fillPattern.settings);const FillPatternPresetStore presets(testDirectory);showFillPatternSettings(11);require(values(currentTools().fillPattern.settings)==beforePresets&&presets.load().size()==1,"Pattern library saves immediately while parent cancellation discards parameter draft");showFillPatternSettings(12);require(values(currentTools().fillPattern.settings)==beforePresets&&presets.load().empty(),"Pattern preset update and confirmed deletion persist independently of parent cancellation");
 const std::string future="{\"version\":2,\"presets\":[]}";{std::ofstream out(presets.path(),std::ios::binary);out<<future;}showFillPatternSettings(13);auto readPresetFile=[&]{std::ifstream in(presets.path(),std::ios::binary);std::ostringstream text;text<<in.rdbuf();return text.str();};require(readPresetFile()==future&&values(currentTools().fillPattern.settings)==beforePresets,"Pattern unreadable library survives failed UI save and parent cancellation");bool refused=false;try{presets.remove("missing");}catch(const std::exception&){refused=true;}require(refused&&readPresetFile()==future,"Pattern unreadable library cannot be overwritten through delete");
 require(currentDocument().canvasPixels()==pixels&&currentDocument().historyPosition()==history&&!currentDocument().dirty(),"Pattern property transactions do not edit image or history");
 {std::ofstream invalid(testDirectory/"fill-pattern-options.txt");invalid<<"1 1 0 37 broken";}const auto beforeBad=currentTools().fillPattern.settings;loadFillPatternPreferences();require(values(currentTools().fillPattern.settings)==values(beforeBad)&&currentTools().fillPattern.mode==PatternMode::Regular,"Malformed pattern preferences cannot partially change live parameters");
}
void Editor::loadFillPatternPreferences(){waitBrushWrites(this);
 {const auto directory=smoke_&&workspacePresetTestDirectory_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path();std::ifstream modes(directory/"image-brush-modes.txt");if(modes){int version,pencil,eraser;if((modes>>version>>pencil>>eraser)&&version==1&&pencil>=0&&pencil<=2&&eraser>=0&&eraser<=2&&(modes>>std::ws).eof()){currentTools().brushProfiles[0].imagePaintMode=PatternPaintMode(pencil);currentTools().brushProfiles[1].imagePaintMode=PatternPaintMode(eraser);}else status_=U"图像笔刷模式偏好读取失败，保留当前模式";}}

 const auto directory=smoke_&&workspacePresetTestDirectory_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path();std::ifstream in(directory/"fill-pattern-options.txt");int version,mode,paint,randomOverlap,regularOverlap;PatternSettings settings;
 if(!(in>>version>>mode>>paint>>settings.randomDensity>>settings.randomCount>>settings.randomSpacing>>randomOverlap>>settings.regularCount>>settings.regularSpacingX>>settings.regularSpacingY>>regularOverlap>>settings.regularRowOffset)||version!=1)return;
 settings.randomDensity=std::clamp(settings.randomDensity,0,1000);settings.randomCount=std::clamp(settings.randomCount,0,100000);settings.randomSpacing=std::clamp(settings.randomSpacing,0,4096);settings.randomOverlap=randomOverlap!=0;settings.regularCount=std::clamp(settings.regularCount,0,100000);settings.regularSpacingX=std::clamp(settings.regularSpacingX,-4096,4096);settings.regularSpacingY=std::clamp(settings.regularSpacingY,-4096,4096);settings.regularOverlap=regularOverlap!=0;settings.regularRowOffset=std::clamp(settings.regularRowOffset,0,100);currentTools().fillPattern.settings=settings;currentTools().fillPattern.mode=PatternMode(std::clamp(mode,0,2));currentTools().fillPattern.paintMode=PatternPaintMode(std::clamp(paint,0,2));
}
void Editor::showFillPatternSettings(int verify){
 if(currentTools().fillPattern.mode==PatternMode::Default||currentDocument().active())return;
 const auto identity=currentDocument().identity();const auto mode=currentTools().fillPattern.mode;PixelEntry* rangeOwner=nullptr;FillPatternSettingsDialog* owner=nullptr;
 auto updateHotRegion=[&]{if(!owner||!owner->display())return;gfx::Region hot;auto add=[&](const gfx::Rect& area){hot|=gfx::Region(gfx::Rect(display()->nativeWindow()->pointToScreen(area.origin()),area.size()));};add(owner->bounds());if(propertyRangePopup_&&propertyRangePopup_->isVisible())add(propertyRangePopup_->bounds());owner->setClickBehavior(ui::PopupWindow::ClickBehavior::CloseOnClickOutsideHotRegion);owner->setHotRegion(hot);};
 auto closeRange=[&]{if(propertyRangePopup_){propertyRangePopup_->closeWindow(nullptr);propertyRangePopup_.reset();}propertyRangeSlider_=nullptr;rangeOwner=nullptr;updateHotRegion();};
 auto visibleRange=[&]{return propertyRangePopup_&&propertyRangePopup_->isVisible();};
 auto syncRange=[&](PixelEntry* entry,int low,int high){if(rangeOwner!=entry||!visibleRange()||!propertyRangeSlider_)return;auto range=propertyRangeSlider_;range->minimum=low;range->maximum=high;range->percentage=entry->suffix==U"%";try{range->value=std::clamp(int(std::stod(entry->text())),low,high);}catch(const std::exception&){}range->invalidate();};
 auto openRange=[&](PixelEntry* entry,int low,int high){if(rangeOwner!=entry||!visibleRange()){showPropertyRange(entry,low,high);rangeOwner=entry;}syncRange(entry,low,high);updateHotRegion();};
 auto ownsRangeFocus=[&](ui::Widget* target){return target&&propertyRangePopup_&&target->window()==propertyRangePopup_.get();};
 closeRange();FillPatternSettingsDialog popup(font_,skin_,toolIcons_,mode,currentTools().fillPattern.settings,(smoke_&&workspacePresetTestDirectory_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path()),openRange,syncRange,closeRange,visibleRange,ownsRangeFocus);owner=&popup;popup.setDisplay(display(),false);const auto size=popup.minimumDialogSize(320*uiScale);popup.setBounds({bounds().center().x-160*uiScale,bounds().center().y-size.h/2,320*uiScale,size.h});updateHotRegion();
 struct RangeLifetime{std::function<void()> close;~RangeLifetime(){close();}}rangeLifetime{closeRange};
 ui::Timer timer(30,&popup);if(verify>=0){timer.Tick.connect([&]{timer.stop();popup.smoke(verify);});timer.start();}popup.openWindowInForeground();timer.stop();closeRange();
 if(popup.accepted()&&currentDocument().identity()==identity&&currentTools().fillPattern.mode==mode){const auto value=popup.result();auto& target=currentTools().fillPattern.settings;if(mode==PatternMode::Random){target.randomDensity=value.randomDensity;target.randomCount=value.randomCount;target.randomSpacing=value.randomSpacing;target.randomOverlap=value.randomOverlap;}else{target.regularCount=value.regularCount;target.regularSpacingX=value.regularSpacingX;target.regularSpacingY=value.regularSpacingY;target.regularOverlap=value.regularOverlap;target.regularRowOffset=value.regularRowOffset;}saveBrushPreferences();}
 requestFocus();refresh();
}

void Editor::useMagicEraserTool(){
 if(currentDocument().active()||selectionDragging_||floatingDragging_||gradientPending_)return;
 if(!currentDocument().layer().kind.empty()){status_=U"魔术橡皮擦仅支持普通像素图层及其蒙版";refresh();return;}
 useFillTool();currentTools().rotateTool=false;currentTools().magicEraserTool=true;toolRowScroll_=0;refresh();
}
bool Editor::processMagicEraserInput(ui::Message* msg){
 if(!(currentTools().fillTool&&currentTools().magicEraserTool))return false;
 if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kMouseMoveMessage&&msg->type()!=ui::kMouseUpMessage)return false;
 auto mouse=static_cast<ui::MouseMessage*>(msg);
 if(magicEraserDragging_){
  if(mouse->right()){cancelStroke();return true;}
  if(msg->type()==ui::kMouseUpMessage&&mouse->button()==strokeButton_){magicEraserDragging_=false;Document::HistoryLabelScope label(currentDocument(),U"魔术橡皮擦");currentDocument().commitStroke();if(hasCapture())releaseMouse();refresh();}return true;
 }
 if(spaceHeld_||currentTools().handTool||eyedropperHeld_)return false;
 if(msg->type()==ui::kMouseDownMessage&&canvasViewport().contains(mouse->position())){
  if(!mouse->left()||!canvasDocumentContains(mouse->position()))return true;
  hideTimelineSelectionGuides();paletteFocused_=false;currentDocument().clearPaletteSelection();requestFocus();currentPlayback().playing=false;strokeButton_=mouse->button();auto options=currentTools().wandOptions;options.contiguous=currentTools().magicEraserContiguous;options.gapClosing=options.contiguous&&options.gapClosing;
  try{auto point=canvasPoint(mouse->position());if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){const auto mapped=repeat::map({double(point.x),double(point.y)},currentDocument().width(),currentDocument().height(),currentView().tileRepeat);if(!mapped)return true;point={int(mapped->local.x),int(mapped->local.y)};}magicEraserDragging_=currentDocument().eraseMatchingColor(point,options,true);if(magicEraserDragging_)captureMouse();}catch(const std::exception& e){currentDocument().cancelStroke();status_=U"魔术橡皮擦失败："+unicodeText(e.what());}refresh();return true;
 }return canvasViewport().contains(mouse->position());
}
namespace { int ditherSmokeChoice=-1; }

void Editor::useAirbrushTool(){if((currentDocument().active()&&!currentDocument().floating())||selectionDragging_||floatingDragging_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=currentTools().smoothTool=false;liquifyResetPosition_.reset();currentTools().rotateTool=currentTools().textTool=currentTools().moveTool=currentTools().selectionTool=currentTools().shapeTool=currentTools().eyedropperTool=currentTools().zoomTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;currentTools().airbrushTool=true;toolRowScroll_=0;refresh();}
void Editor::saveAirbrushPreferences(){if(smoke_&&!workspacePresetTestDirectory_)return;try{const auto path=(smoke_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path())/"airbrush-options.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::badbit|std::ios::failbit);const auto& s=currentTools().airbrushSettings;out<<s.particleRadius<<' '<<int(s.shape)<<' '<<s.angle<<' '<<s.scatterRadius<<' '<<s.density<<' '<<s.intervalMs<<'\n';}catch(...){status_=U"喷枪参数已调整，但偏好保存失败";}}
void Editor::sprayAirbrush(){if(!airbrushDragging_||!currentDocument().strokeActive())return;std::vector<SelectionPoint> particles;generateAirbrushParticles(airbrushCenter_,currentTools().airbrushSettings,[this]{return std::generate_canonical<double,53>(airbrushRandom_);},[&](auto p){particles.push_back(p);});BrushOptions b;b.size=currentTools().airbrushSettings.particleRadius*2-1;b.shape=currentTools().airbrushSettings.shape;const auto revision=currentDocument().contentRevision();currentDocument().sprayStroke(particles,b,b.shape==BrushShape::Round?0:currentTools().airbrushSettings.angle);invalidateStrokePixels(revision);}
void Editor::createAirbrushOptions(){

 auto shape=button(U"",[this]{PixelMenu menu(skin_);const char* icons[]={"brush-round","brush-square","brush-line"};for(int i=0;i<3;++i){auto row=new PixelMenuItem(font_,skin_,i==0?U"圆形":i==1?U"方形":U"线形");row->iconSkin=&toolIcons_;row->icon=icons[i];row->checked=[this,i]{return int(currentTools().airbrushSettings.shape)==i;};row->Click.connect([this,i]{currentTools().airbrushSettings.shape=BrushShape(i);saveAirbrushPreferences();layoutToolOptions();});menu.addChild(row);}menu.showPopup({airbrushShapeButton_->bounds().x,airbrushShapeButton_->bounds().y2()},display());requestFocus();});shape->iconSkin=&toolIcons_;airbrushShapeButton_=shape;airbrushControls_.push_back({shape,19});
 const char32_t* labels[]={U"散布",U"粒子",U"角度",U"密度",U"间隔"};const int lo[]={1,1,-180,1,16},hi[]={64,16,180,128,1000};
 for(int i=0;i<5;++i){auto label=button(labels[i],[]{});label->labelOnly=true;label->setEnabled(false);airbrushControls_.push_back({label,font_.measure(labels[i])});auto entry=new PixelEntry(font_,skin_);entry->numeric=true;entry->deferredNumeric=true;entry->numericMounted=[this,i]{return currentTools().airbrushTool&&(i!=2||currentTools().airbrushSettings.shape!=BrushShape::Round);};entry->numericMinimum=lo[i];entry->numericMaximum=hi[i];entry->numericValue=[this,i]{const auto& s=currentTools().airbrushSettings;const int values[]={s.scatterRadius,s.particleRadius,s.angle,s.density,s.intervalMs};return double(values[i]);};entry->suffix=i<2?U"px":i==2?U"°":i==4?U"ms":U"";addChild(entry);entry->setFixedContentWidth(entry->widthForValue(i==2?U"-180":i==4?U"1000":U"128"));airbrushFields_[i]=entry;airbrushControls_.push_back({entry,entry->contentWidth()});auto commit=[this,entry,i,low=lo[i],high=hi[i]]{try{std::size_t used;double value=std::stod(entry->text(),&used);if(used!=entry->text().size()||!std::isfinite(value))return;auto& s=currentTools().airbrushSettings;int* fields[]={&s.scatterRadius,&s.particleRadius,&s.angle,&s.density,&s.intervalMs};*fields[i]=int(std::floor(std::clamp(value,double(low),double(high))+.5));saveAirbrushPreferences();}catch(...){}layoutToolOptions();invalidateRect(canvasViewport());};entry->deferredCommit=commit;entry->Change.connect(commit);entry->blur=commit;entry->accept=[this,commit]{commit();closeParameterRange();requestFocus();};entry->cancel=[this]{closeParameterRange();};entry->focus=[this,entry,low=lo[i],high=hi[i]]{openParameterRange(entry,low,high);};}
 airbrushTimer_.Tick.connect([this]{if(!airbrushDragging_||!currentDocument().strokeActive()||!hasCapture()||homeOpen_||pending_!=Pending::None){airbrushTimer_.stop();if(airbrushDragging_)cancelStroke();return;}auto now=[] {return std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count();};try{nextAirbrushAt_=advanceAirbrushClock(nextAirbrushAt_,now(),currentTools().airbrushSettings.intervalMs,[this]{sprayAirbrush();},now);}catch(const std::exception& e){cancelStroke();status_=unicodeText(e.what());}});
}
void Editor::layoutAirbrushOptions(){const auto& s=currentTools().airbrushSettings;const int values[]={s.scatterRadius,s.particleRadius,s.angle,s.density,s.intervalMs};const char* icons[]={"brush-round","brush-square","brush-line"};airbrushShapeButton_->icon=icons[int(s.shape)];int x=uiLogical(bounds()).x+workspaceLayout(uiLogical(bounds())).workX;for(std::size_t i=0;i<airbrushControls_.size();++i){auto& c=airbrushControls_[i];const bool visible=currentTools().airbrushTool&&!(s.shape==BrushShape::Round&&(i==5||i==6));c.first->setVisible(visible);c.first->setEnabled(pending_==Pending::None&&!currentDocument().active());if(visible){placePropertyControl(c.first,x,c.second);x+=propertyControlWidth(c.first,c.second)+uiGap;}}for(int i=0;i<5;++i)if(!airbrushFields_[i]->hasFocus()&&airbrushFields_[i]->text()!=std::to_string(values[i]))airbrushFields_[i]->setText(std::to_string(values[i]));}

std::filesystem::path Editor::recentExportPathsPath()const{return recentExportPathsPathOverride_.empty()?palettePreferencePath().parent_path()/"recent-export-paths-v1.txt":recentExportPathsPathOverride_;}

void Editor::recordRecentExportPath(const std::filesystem::path& output){if(!smoke_||!recentExportPathsPathOverride_.empty())recent_export_paths::record(recentExportPathsPath(),output.u8string());}

std::filesystem::path Editor::recentExportDirectoryPath()const{return recentExportDirectoryPathOverride_.empty()?palettePreferencePath().parent_path()/"last-export-directory-v1.txt":recentExportDirectoryPathOverride_;}

std::filesystem::path Editor::preferredExportDirectory()const{

    if(runtimePreferences_.index("files.exportLocationMode.Select")==0&&(!smoke_||!recentExportDirectoryPathOverride_.empty()))try{

      std::ifstream in(recentExportDirectoryPath());std::string header,value;std::getline(in,header);

      if(header=="MoonSprite last-export-directory 1"&&(in>>std::quoted(value))&&!value.empty()&&(in>>std::ws).eof())return std::filesystem::u8path(value);

    }catch(...){}

    return std::filesystem::u8path(runtimePreferences_.get("files.exportDirectory.Text"));

  }

void Editor::rememberExportDirectory(const std::filesystem::path& output){

    if(smoke_&&recentExportDirectoryPathOverride_.empty())return;const auto directory=output.parent_path();if(directory.empty())return;

    try{std::ostringstream out;out<<"MoonSprite last-export-directory 1\n"<<std::quoted(directory.u8string())<<'\n';auto text=out.str();std::filesystem::create_directories(recentExportDirectoryPath().parent_path());writeExportBytesAtomic(recentExportDirectoryPath(),{text.begin(),text.end()});}catch(...){/* A successful export remains successful if preferences cannot be saved. */}

  }

std::filesystem::path Editor::exportMemoryPath()const{return exportMemoryPathOverride_.empty()?palettePreferencePath().parent_path()/"document-export-settings-v1.txt":exportMemoryPathOverride_;}

std::string Editor::exportMemoryIdentity()const{

    auto path=currentPath().empty()?currentDocument().sourceFilePath():currentPath();

    if(!path.empty()){auto value=path.generic_wstring();CharLowerBuffW(value.data(),DWORD(value.size()));return "path:"+std::filesystem::path(value).generic_u8string();}

    static const auto session=std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64());

    return "id:"+session+"-"+std::to_string(currentDocument().identity());

  }

std::vector<Editor::RememberedExport> Editor::readExportMemory()const{

    std::vector<RememberedExport> result;

    try{std::ifstream in(exportMemoryPath());std::string header;std::getline(in,header);const bool version5=header=="MoonSprite document-export-settings 5",version4=version5||header=="MoonSprite document-export-settings 4",version3=version4||header=="MoonSprite document-export-settings 3",version2=version3||header=="MoonSprite document-export-settings 2";if(!version2&&header!="MoonSprite document-export-settings 1")return result;

      while(in>>std::ws&&!in.eof()){RememberedExport r;auto& p=r.settings;int direction=0;

        if(!(in>>std::quoted(r.identity)>>std::quoted(r.filename)>>std::quoted(p.name)>>p.kind>>p.format>>p.explicitRange>>p.image.scalePercent>>p.image.trim>>p.image.trimCommon>>p.image.selection>>p.image.automatic>>std::quoted(p.image.layerId)>>p.animation.scalePercent>>p.animation.frameStart>>p.animation.frameEnd>>std::quoted(p.animation.loopSectionId)>>direction>>p.animation.trim>>p.animation.trimCommon))return {};

        if(r.identity.empty()||r.filename.empty()||p.kind<0||p.kind>2||p.format<0||p.format>10||(p.kind==1&&p.format==5)||(p.kind!=1&&p.format==6)||(p.format>6&&p.kind!=0)||p.image.scalePercent<1||p.image.scalePercent>6400||p.animation.scalePercent<1||p.animation.scalePercent>6400||p.animation.frameStart<1||p.animation.frameEnd<1||direction<0||direction>3)return {};

        if(version2&&!(in>>std::quoted(p.animation.layerId)))return {};if(version3&&!(in>>p.animation.selection))return {};if(version4&&!(in>>p.allLayers))return {};if(version5&&!(in>>p.slices>>std::quoted(p.sliceId)>>std::quoted(r.directory)))return {};p.animation.direction=GifDirection(direction);result.push_back(std::move(r));if(result.size()==100)break;

      }

    }catch(...){return {};}return result;

  }

void Editor::playExportSuccessSound() noexcept {try{if(!runtimePreferences_.flag("files.exportSoundEnabled"))return;if(playExportSound_(assets_/"audio/export-success.wav"))return;}catch(...){}if(!exportSoundErrorReported_){exportSoundErrorReported_=true;OutputDebugStringW(L"MoonSprite audio.export-success: playback unavailable\n");}}

void Editor::rememberSuccessfulExport(const std::filesystem::path& path){

    rememberExportDirectory(path);

    if(smoke_&&exportMemoryPathOverride_.empty())return;

    try{RememberedExport r;r.identity=exportMemoryIdentity();r.filename=path.filename().u8string();r.directory=path.parent_path().u8string();auto& p=r.settings;

      p.name=exportPresets_.name->text();p.kind=pending_==Pending::StaticExport?0:framePngMode_?2:1;

      p.format=p.kind==0?(exportProjectFormat_?exportProjectFormat_:staticJpeg_?5:staticSvg_?3:staticIco_?2:staticBmp_?1:exportOptions_.automatic?4:0):(p.kind==1&&gifWebp_?6:frameJpeg_?5:frameSvg_?3:frameIco_?2:frameBmp_?1:framePngAutomatic_?4:0);

      p.explicitRange=gifExplicitRange_;p.image=exportOptions_;p.animation=gifOptions_;p.allLayers=p.kind!=2&&exportAllLayers_;p.slices=exportSlices_;p.sliceId=exportSliceId_;

      auto entries=readExportMemory();entries.erase(std::remove_if(entries.begin(),entries.end(),[&](const auto& old){return old.identity==r.identity;}),entries.end());entries.insert(entries.begin(),std::move(r));if(entries.size()>100)entries.resize(100);

      std::ostringstream out;out<<"MoonSprite document-export-settings 5\n";for(const auto& item:entries){const auto& v=item.settings;out<<std::quoted(item.identity)<<' '<<std::quoted(item.filename)<<' '<<std::quoted(v.name)<<' '<<v.kind<<' '<<v.format<<' '<<v.explicitRange<<' '<<v.image.scalePercent<<' '<<v.image.trim<<' '<<v.image.trimCommon<<' '<<v.image.selection<<' '<<v.image.automatic<<' '<<std::quoted(v.image.layerId)<<' '<<v.animation.scalePercent<<' '<<v.animation.frameStart<<' '<<v.animation.frameEnd<<' '<<std::quoted(v.animation.loopSectionId)<<' '<<int(v.animation.direction)<<' '<<v.animation.trim<<' '<<v.animation.trimCommon<<' '<<std::quoted(v.animation.layerId)<<' '<<v.animation.selection<<' '<<v.allLayers<<' '<<v.slices<<' '<<std::quoted(v.sliceId)<<' '<<std::quoted(item.directory)<<'\n';}

      auto text=out.str();std::filesystem::create_directories(exportMemoryPath().parent_path());writeExportBytesAtomic(exportMemoryPath(),{text.begin(),text.end()});

    }catch(...){/* Export succeeded; unavailable preference storage must not fail the export. */}

  }

bool Editor::restoreExportMemory(bool frames){

    if(restoringExportMemory_||(smoke_&&exportMemoryPathOverride_.empty()))return false;

    auto entries=readExportMemory();auto it=std::find_if(entries.begin(),entries.end(),[&](const auto& r){return r.identity==exportMemoryIdentity();});if(it==entries.end())return false;

    auto p=it->settings;if(frames){if(p.kind==1||p.format>6)p.format=4;if(p.kind==0){p.animation.scalePercent=p.image.scalePercent;p.animation.trim=p.image.trim;p.animation.trimCommon=p.image.trimCommon;p.animation.frameEnd=int(currentDocument().timeline().state().frames.size());}p.kind=2;p.animation.layerId.clear();p.animation.selection=false;p.allLayers=false;p.slices=false;p.sliceId.clear();}

    else if(p.kind==2&&currentDocument().timeline().state().frames.size()<=1){p.kind=0;p.image.scalePercent=p.animation.scalePercent;p.image.trim=p.animation.trim;p.image.trimCommon=p.animation.trimCommon;p.image.automatic=p.format==4;p.image.selection=false;p.image.layerId.clear();}

    restoringExportMemory_=true;try{applyExportPreset(p);}catch(...){restoringExportMemory_=false;throw;}restoringExportMemory_=false;

    if(!it->directory.empty())exportDirectory_=std::filesystem::u8path(it->directory);exportFilename_->setText(it->filename);auto name=std::filesystem::u8path(it->filename);name.replace_extension(exportExtension());exportFilename_->setText(name.u8string());

    const bool knownPreset=std::any_of(savedExportPresets_.begin(),savedExportPresets_.end(),[&](const auto& preset){return preset.name==p.name&&preset.kind==p.kind&&preset.format==p.format&&preset.image.selection==p.image.selection&&preset.image.layerId==p.image.layerId&&preset.animation.layerId==p.animation.layerId&&preset.animation.selection==p.animation.selection&&preset.allLayers==p.allLayers&&preset.slices==p.slices&&preset.sliceId==p.sliceId;});

    if(!knownPreset)exportPresets_.name->setText("");updateExportPresetOptions();refresh();return true;

  }

void Editor::restoreSaveControls(){for(auto state:savingControlStates_)state.first->setEnabled(state.second);savingControlStates_.clear();}

void Editor::setRelativeLuminance(bool enabled){currentView().relativeLuminance=enabled;renderer_.setRelativeLuminance(enabled);currentDocument().setDeferredFloatingDisplaySupported(!enabled);}

void Editor::toggleSelectionOutline(){currentView().showSelectionOutline=!currentView().showSelectionOutline;if(!currentView().showSelectionOutline)antsTimer_.stop();invalidateRect(canvasViewport());}

bool Editor::advancedActive()const{return advancedMode_!=0;}

int Editor::optionsTop()const{return advancedActive()?0:dockArea(uiLogical(clientBounds())).y;}

bool Editor::advancedToolWidget(ui::Widget* w)const{
    if(w==commands_[3]||w==commands_[4]||w==brushRange_||w==gradientRadialButton_||w==eyedropperSourceButton_||w==eyedropperForegroundButton_||w==eyedropperBackgroundButton_||w==eyedropperReplaceButton_)return true;
    for(const auto& item:toolControls_)if(w==item.first)return true;
    if(w==drawingAnchorButton_||w==drawingAnchorPresetButton_)return true;
    for(const auto* list:{&selectionControls_,&fillControls_,&gradientControls_,&shapeControls_,&liquifyControls_,&airbrushControls_,&smoothControls_})for(const auto& item:*list)if(w==item.first)return true;
    for(auto button:symmetryButtons_)if(w==button)return true;
    return false;
  }

void Editor::restoreAdvancedVisibility(){
    const auto current=children();
    for(const auto& saved:advancedHidden_)if(std::find(current.begin(),current.end(),saved.first)!=current.end())saved.first->setVisible(saved.second);
    advancedHidden_.clear();
  }

void Editor::applyAdvancedVisibility(){
    if(!advancedActive())return;
    for(auto child:children()){
      const bool keep=child==canvasHorizontal_||child==canvasVertical_||
        (pending_!=Pending::None&&(child==modalSurface_||modalControl(child)))||
        (advancedMode_==1&&advancedToolWidget(child));
      if(keep)continue;
      if(std::none_of(advancedHidden_.begin(),advancedHidden_.end(),[child](const auto& item){return item.first==child;}))advancedHidden_.push_back({child,child->isVisible()});
      child->setVisible(false);
    }
  }

void Editor::changeAdvancedMode(int next){
    const auto oldView=canvasViewport();
    restoreAdvancedVisibility();advancedMode_=next;
    const auto delta=canvasViewport().center()-oldView.center();currentView().canvas.offset(delta);
    if(navigation_.pan_.active){navigation_.pan_.origin.x+=delta.x;navigation_.pan_.origin.y+=delta.y;}
    ui::ResizeEvent resize(this,bounds());onResize(resize);refresh();
  }

void Editor::cycleAdvancedMode(){if(!documentOpen_||homeOpen_||pending_!=Pending::None)return;changeAdvancedMode((advancedMode_+1)%3);advancedNotice_=true;advancedNoticeTimer_.stop();advancedNoticeTimer_.start();invalidate();}

void Editor::paintAdvancedNotice(ui::Graphics& graphics){
    if(!advancedNotice_)return;
    UiPaintScale scale(graphics);const auto rc=uiLogical(clientBounds());
    const std::u32string title=U"高级模式已开启",hint=U"Ctrl+F 恢复";
    const auto a=font_.inkBounds(title),b=font_.inkBounds(hint);
    const int w=std::min(rc.w,std::max(a.w,b.w)+4*uiGap+6),h=2*Layout::fontHeight+5*uiGap+6;
    const gfx::Rect box(std::max(0,(rc.w-w)/2),std::max(0,std::min(64,rc.h-h)),w,h);
    graphics.fillRect(skin_["panel"],box);skin_.draw(graphics,"panel_outer",box);
    font_.draw(graphics,title,box.x+(box.w-a.w)/2-a.x,box.y+3+2*uiGap-a.y,skin_["text"]);
    font_.draw(graphics,hint,box.x+(box.w-b.w)/2-b.x,box.y+3+3*uiGap+Layout::fontHeight-b.y,skin_["muted"]);
  }

gfx::Rect Editor::toDisplay(gfx::Rect local)const{return uiDisplayRect(local,bounds().origin());}

gfx::Rect Editor::dialogDisplayBounds()const{return toDisplay(modalBounds(uiLogical(clientBounds())));}

panels::Visibility Editor::columnVisibility()const{auto visible=pickerOpen_;visible[0]=palettePanelOpen_;visible[1]=colorPickerOpen_;visible[2]=layersPanelOpen_&&documentOpen_;visible[3]=previewPanelOpen_;visible[8]=historyPanelOpen_&&documentOpen_;visible[9]=referencePanelOpen_;visible[10]=tabletVisibility_.visible&&documentOpen_;visible[11]=tilesetPanelOpen_&&documentOpen_;visible[12]=brushLibraryPanelOpen_&&documentOpen_;visible[13]=freeTileInstancesSeparate_&&freeTileInstancesOpen_&&documentOpen_&&!homeOpen_;return visible;}

panels::Rect Editor::dockArea(gfx::Rect rc)const{const auto r=Layout::rail(rc,toolRailSide_,int(toolRail_.size())).main;return {r.x,r.y,r.w,r.h};}

panels::Rect Editor::floatingArea(gfx::Rect rc)const{return {0,0,rc.w,rc.h};}

void Editor::loadWorkspaceSizes() {

    std::ifstream in(palettePreferencePath().parent_path()/"workspace-sizes.txt");readWorkspaceSizes(in);

    bool pickerLayoutLoaded=false;
    std::ifstream panelsIn(palettePreferencePath().parent_path()/"workspace-panels.txt");if(docking_.read(panelsIn)){bool p,c,l,v;if(panelsIn>>p>>c>>l>>v){palettePanelOpen_=p;colorPickerOpen_=c;layersPanelOpen_=l;previewPanelOpen_=v;std::string tag;if(panelsIn>>tag && tag=="picker-columns-v1"){pickerLayoutLoaded=true;for(int id=4;id<8;++id)if(!(panelsIn>>pickerOpen_[id]))pickerLayoutLoaded=false;}}}if(!pickerLayoutLoaded)setupDefaultPickerGroup();

  }

void Editor::readWorkspaceSizes(std::istream& in) {

    std::string header;

    if(!(in>>header) || header!="moonsprite-workspace-sizes-v1")return;

    std::string line;std::getline(in,line);

    while(std::getline(in,line)) {

      std::istringstream row(line);std::string kind;row>>kind;

      if(kind=="dock") {

        int width,height;double share;

        if(row>>width>>share>>height && width>=0 && width<=8192 && std::isfinite(share) && share>=0 && share<=1 && height>=65 && height<=8192)

          {dockWidth_=width;paletteShare_=share;timelineHeight_=height;}

      } else {

        std::string key;if(kind=="modal")row>>key;

        gfx::Rect r;if(!(row>>r.x>>r.y>>r.w>>r.h) || std::abs(double(r.x))>16384 || std::abs(double(r.y))>16384 || r.w>8192 || r.h>8192)continue;

        if(kind=="preview" && r.w>=180 && r.h>=120 && previewPanel_)previewPanel_->setBounds(r);

        if(kind=="modal" && r.w>0 && r.h>0)for(int i=1;i<=int(Pending::Preferences);++i)

          if(key==modalSizeKey(Pending(i)))modalGeometry_[Pending(i)]=r;

      }

    }

  }

void Editor::saveSelectionPreferences(){if(smoke_)return;try{const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);std::ofstream out(path/"selection-options.txt");out<<currentTools().selectionRounded<<' '<<currentTools().selectionCornerRadius<<' '<<currentTools().selectionMode<<' '<<currentView().selectionPivotVisible<<'\n';}catch(...){status_=U"选区偏好保存失败";}}

int Editor::inkProfileIndex()const{return currentTools().eraser?3:currentTools().fillTool||currentTools().gradientTool?4:currentTools().shapeTool?((currentTools().shapeKind==ShapeKind::Line||currentTools().shapeKind==ShapeKind::Curve)?5:6):0;}
InkMode Editor::currentInkMode()const{return currentTools().inkProfiles[inkProfileIndex()];}
BrushOptions Editor::activeStrokeBrush()const{auto b=currentTools().brushProfiles[currentTools().eraser?1:0];b.ink=currentTools().eraser?InkMode::Simple:currentInkMode();return b;}
std::filesystem::path Editor::inkModesPath()const{return inkPreferenceOverride_.empty()?palettePreferencePath().parent_path()/"ink-modes.txt":inkPreferenceOverride_;}
void Editor::loadInkPreferences(){try{const auto path=inkModesPath();if(!std::filesystem::exists(path))return;std::ifstream in(path);std::string h;int sync;std::array<InkMode,8> modes{};if(!(in>>h>>sync)||h!="ink-v1"||(sync!=0&&sync!=1))throw std::runtime_error("Invalid ink preferences");for(auto& mode:modes){int v;if(!(in>>v)||v<0||v>2)throw std::runtime_error("Invalid ink mode");mode=InkMode(v);}if(!(in>>std::ws).eof())throw std::runtime_error("Trailing ink preferences");currentTools().inkProfiles=modes;currentTools().syncInkAcrossTools=sync!=0;}catch(const std::exception&){status_=U"墨水偏好读取失败，使用有效默认值";}}
void Editor::saveInkPreferences(){if(smoke_&&inkPreferenceOverride_.empty())return;try{std::filesystem::create_directories(inkModesPath().parent_path());std::ostringstream o;o<<"ink-v1 "<<currentTools().syncInkAcrossTools;for(auto m:currentTools().inkProfiles)o<<' '<<int(m);o<<'\n';auto t=o.str();writeExportBytesAtomic(inkModesPath(),{t.begin(),t.end()});}catch(...){status_=U"墨水模式已调整，但偏好保存失败";}}
void Editor::chooseInkMode(InkMode mode){currentTools().inkProfiles[inkProfileIndex()]=mode;if(currentTools().syncInkAcrossTools)currentTools().inkProfiles.fill(mode);saveInkPreferences();layoutToolOptions();invalidateRect(canvasViewport());}
void Editor::smokeInkModes(){
 auto require=[](bool v,const char* m){if(!v)throw std::runtime_error(m);};const auto savedModes=currentTools().inkProfiles;const bool savedSync=currentTools().syncInkAcrossTools;const auto savedOverride=inkPreferenceOverride_;const auto savedPending=pending_;
 struct Restore{std::function<void()> f;~Restore(){f();}} restore{[&]{currentTools().inkProfiles=savedModes;currentTools().syncInkAcrossTools=savedSync;inkPreferenceOverride_=savedOverride;pending_=savedPending;layoutToolOptions();}};
 require(workspacePresetTestDirectory_.has_value(),"Ink isolated fixture"); pending_=Pending::None;
 const auto savedImage=currentTools().pencilImageBrush;const auto savedImageId=currentTools().pencilImageBrushId;
 const auto savedPencil=currentTools().brushProfiles[0],savedEraser=currentTools().brushProfiles[1];const auto savedStep=runtimePreferences_.index("tools.lineDirectionStep.Number");auto savedRuntimeValues=runtimePreferences_.values;
 struct RestoreBrush{std::function<void()> f;~RestoreBrush(){f();}} restoreBrush{[&]{currentTools().pencilImageBrush=savedImage;currentTools().pencilImageBrushId=savedImageId;currentTools().brushProfiles[0]=savedPencil;currentTools().brushProfiles[1]=savedEraser;runtimePreferences_.values.swap(savedRuntimeValues);ditherSmokeChoice=-1;layoutToolOptions();}};
 if(std::wstring(GetCommandLineW()).find(L"--brush-write-queue-only")!=std::wstring::npos){
  const auto identity=currentDocument().identity();const auto pixels=currentDocument().canvasPixels();const auto history=currentDocument().historySize(),revision=currentDocument().revision();const auto dirty=currentDocument().dirty();
  for(int i=0;i<40;++i){currentTools().brushProfiles[0].size=i+1;currentTools().brushProfiles[0].opacity=i;saveBrushPreferences();}
  waitBrushWrites(this);const auto root=*workspacePresetTestDirectory_;auto read=[](const auto& path){std::ifstream in(path,std::ios::binary);return std::string(std::istreambuf_iterator<char>(in),{});};
  std::istringstream profile(read(root/"brush-profiles.txt"));int size=0,opacity=0;require(bool(profile>>size>>opacity)&&size==40&&opacity==39,"Brush queue lost latest parameters");
  const auto reportRoot=_wgetenv(L"MOONSPRITE_BRUSH_SAVE_REPORT_ROOT");const auto output=reportRoot?std::filesystem::path(reportRoot):std::filesystem::path("build/test-tmp/brush-save-result");std::filesystem::create_directories(output);
  for(auto name:brushFiles){const auto bytes=read(root/name);std::ofstream out(output/name,std::ios::binary);out<<bytes;}
  BrushWrite value;value.root=root/"recovered";for(int i=0;i<7;++i)value.text[i]=std::to_string(i);
  const auto blocked=root/"blocked";writeExportBytesAtomic(blocked,{1});int errors=0;
  {BrushWrites writes(this,[&]{++errors;});auto bad=value;bad.root=blocked;writes.enqueue(bad);writes.poll(true);require(errors==1,"Brush queue write failure not reported");writes.enqueue(value);writes.poll(true);for(int i=0;i<7;++i)require(read(value.root/brushFiles[i])==value.text[i],"Brush queue failed recovery batch");}
  {BrushWrites writes(this,{});value.root=root/"closed";for(int i=0;i<40;++i){value.text.fill(std::to_string(i));writes.enqueue(value);}}
  for(auto name:brushFiles)require(read(value.root/name)=="39","Brush writer destructor failed final batch");
  require(currentDocument().identity()==identity&&currentDocument().canvasPixels()==pixels&&currentDocument().historySize()==history&&currentDocument().revision()==revision&&currentDocument().dirty()==dirty,"Brush settings queue modified document");std::ofstream(output/"check.txt")<<"latest_six_files=pass\nfailure_recovery=pass\ndestructor_batch=pass\nartwork_history=pass\n";return;
 }
 lineStepInput_->setText("99");lineStepInput_->Change();require(runtimePreferences_.index("tools.lineDirectionStep.Number")==16,"Stair actual numeric control clamps max");lineStepInput_->setText("0");lineStepInput_->Change();require(runtimePreferences_.index("tools.lineDirectionStep.Number")==1,"Stair actual numeric control clamps min");
 const bool perfectBefore=currentTools().brushProfiles[0].perfectPixels;perfectPixelsButton_->Click();require(currentTools().brushProfiles[0].perfectPixels!=perfectBefore&&currentTools().brushProfiles[1].perfectPixels!=perfectBefore,"Perfect actual checkbox applies session setting");
 currentTools().pencilImageBrush.reset();currentTools().brushProfiles[currentTools().eraser?1:0].dither=false;ditherSmokeChoice=5;showBrushDitherPopup();ditherSmokeChoice=-1;const auto& testedDither=currentTools().brushProfiles[currentTools().eraser?1:0];require(testedDither.dither&&testedDither.ditherTemplate==BrushDitherTemplate::Bayer2,"Dither actual popup selects template");
 waitBrushWrites(this);
 {std::ifstream in(*workspacePresetTestDirectory_/"pixel-stroke-options.txt");int perfect=-1,step=-1;require(bool(in>>perfect>>step)&&perfect==int(!perfectBefore)&&step==1,"Pixel stroke isolated preferences persist");}
 {std::ifstream in(*workspacePresetTestDirectory_/"brush-dither-options.txt");int enabled,t,stage;for(int i=0;i<2;++i){require(bool(in>>enabled>>t>>stage),"Dither isolated profiles stored");if(i==(currentTools().eraser?1:0))require(enabled&&t==5,"Dither selected profile persists");}}
inkPreferenceOverride_=*workspacePresetTestDirectory_/"ink-modes.txt";pending_=Pending::None;
 for(int i=0;i<3;++i){showInkMenu(i);require(currentInkMode()==InkMode(i),"Ink actual menu row selection");}
 showInkMenu(1);showInkMenu(3);require(currentTools().syncInkAcrossTools&&std::all_of(currentTools().inkProfiles.begin(),currentTools().inkProfiles.end(),[](auto m){return m==InkMode::CopyAlphaColor;}),"Ink sync all profiles");
 currentTools().inkProfiles.fill(InkMode::Simple);currentTools().syncInkAcrossTools=false;loadInkPreferences();require(currentTools().syncInkAcrossTools&&currentInkMode()==InkMode::CopyAlphaColor,"Ink persisted state");const auto before=currentTools().inkProfiles;writeExportBytesAtomic(inkPreferenceOverride_,{'b','a','d'});loadInkPreferences();require(currentTools().inkProfiles==before&&currentTools().syncInkAcrossTools,"Malformed ink preferences preserve valid state");
}
void Editor::showInkMenu(int smokeChoice){if(pending_!=Pending::None||currentDocument().active())return;PixelMenu menu(skin_);const char32_t* labels[]={U"普通",U"复制 Alpha 与颜色",U"锁定 Alpha"};const char* icons[]={"ink-simple","ink-copy-alpha-color","ink-lock-alpha"};std::vector<PixelMenuItem*> rows;for(int i=0;i<3;++i){auto item=new PixelMenuItem(font_,skin_,labels[i]);item->iconSkin=&toolIcons_;item->icon=icons[i];item->checked=[this,i]{return int(currentInkMode())==i;};item->Click.connect([this,i]{chooseInkMode(InkMode(i));});menu.addChild(item);rows.push_back(item);}auto sync=new PixelMenuItem(font_,skin_,U"同步所有工具");sync->checked=[this]{return currentTools().syncInkAcrossTools;};sync->Click.connect([this]{currentTools().syncInkAcrossTools=!currentTools().syncInkAcrossTools;if(currentTools().syncInkAcrossTools)currentTools().inkProfiles.fill(currentInkMode());saveInkPreferences();layoutToolOptions();});menu.addChild(sync);rows.push_back(sync);ui::Timer timer(40,&menu);if(smokeChoice>=0){timer.Tick.connect([&]{timer.stop();rows.at(smokeChoice)->Click();menu.closeWindow();});timer.start();}menu.showPopup({inkButton_->bounds().x,inkButton_->bounds().y2()+uiGap*uiScale},display());timer.stop();requestFocus();}

void Editor::saveBrushPreferences() {
    drawingAnchorDefaults_=currentView().drawingAnchor;drawingAnchorDefaultEnabled_=currentView().drawFromCanvasCenter;drawingAnchorDefaultVisible_=currentView().drawingAnchorVisible;

    brushFeedback_.brushPreferencesPending_=false;++brushFeedback_.brushPreferenceWrites_;

    if(smoke_&&!workspacePresetTestDirectory_) return;

    BrushSaveScope scope;
    try {

      const auto path=smoke_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path();BrushWrite value;value.root=path;

      {std::ostringstream modes;modes<<1<<' '<<int(currentTools().brushProfiles[0].imagePaintMode)<<' '<<int(currentTools().brushProfiles[1].imagePaintMode);value.text[0]=modes.str();}
      std::ostringstream pixelStroke;pixelStroke<<currentTools().brushProfiles[0].perfectPixels<<' '<<std::clamp(runtimePreferences_.index("tools.lineDirectionStep.Number"),1,16)<<'\n';
      {const auto& settings=currentTools().fillPattern.settings;std::ostringstream patternOut;patternOut<<1<<' '<<int(currentTools().fillPattern.mode)<<' '<<int(currentTools().fillPattern.paintMode)<<' '<<settings.randomDensity<<' '<<settings.randomCount<<' '<<settings.randomSpacing<<' '<<settings.randomOverlap<<' '<<settings.regularCount<<' '<<settings.regularSpacingX<<' '<<settings.regularSpacingY<<' '<<settings.regularOverlap<<' '<<settings.regularRowOffset;value.text[2]=patternOut.str();}
      std::ostringstream ditherOut;for(const auto& b:currentTools().brushProfiles)ditherOut<<b.dither<<' '<<int(b.ditherTemplate)<<' '<<b.ditherStage<<'\n';
      std::ostringstream magicOut;magicOut<<currentTools().magicEraserContiguous<<' '<<currentTools().wandOptions.tolerance<<' '<<currentTools().wandOptions.gapClosing<<' '<<currentTools().wandOptions.gapThreshold<<'\n';
      std::ostringstream out;

      for(const auto& brush:currentTools().brushProfiles) out<<brush.size<<' '<<brush.opacity<<' '<<int(brush.shape)<<'\n';

      out<<currentTools().selectionBrushAngle<<' '<<currentTools().selectionRotSprite<<'\n';out<<currentTools().fillOptions.tolerance<<' '<<currentTools().fillOptions.contiguous<<' '<<currentTools().fillOptions.gapClosing<<' '<<currentTools().fillOptions.gapThreshold<<' '<<currentTools().fillOptions.visibleLayers<<' '<<currentTools().fillOptions.connectivity<<'\n';out<<currentTools().gradientRadial<<' '<<currentTools().gradientDither<<' '<<currentTools().gradientOptions.tolerance<<' '<<currentTools().gradientOptions.contiguous<<' '<<currentTools().gradientConfirm<<' '<<currentTools().gradientFreeform<<' '<<currentTools().gradientStops.size()<<'\n';for(const auto& stop:currentTools().gradientStops)out<<stop.position<<' '<<stop.color<<'\n';out<<int(currentTools().shapeKind)<<' '<<currentTools().shapeRounded<<' '<<currentTools().shapeRadius<<' '<<currentTools().shapeRatio<<' '<<currentTools().shapeRatioWidth<<' '<<currentTools().shapeRatioHeight<<'\n';out<<int(currentTools().fillPattern.texture)<<' '<<currentTools().fillPattern.textureScale<<'\n';out<<currentTools().curveAnchorCount<<'\n';out<<currentView().drawFromCanvasCenter<<' '<<currentView().drawingAnchorVisible<<' '<<std::setprecision(17)<<currentView().drawingAnchor.x<<' '<<currentView().drawingAnchor.y<<'\n';value.text[1]=pixelStroke.str();value.text[3]=ditherOut.str();value.text[4]=magicOut.str();value.text[5]=out.str();
      {std::ostringstream image;image<<"image-brush-v1 "<<std::quoted(currentTools().temporaryBrushActive||currentTools().temporaryBrushCapture?std::string{}:currentTools().pencilImageBrushId)<<' '<<std::setprecision(17)<<currentTools().pencilImageBrushAngle;value.text[6]=image.str();}
      if(_wgetenv(L"MOONSPRITE_BRUSH_SAVE_SYNC_REFERENCE")){waitBrushWrites(this);writeBrushBatch(value);}
      else{auto writes=std::dynamic_pointer_cast<BrushWrites>(getProperty("moonsprite.brush-writes"));if(!writes){writes=std::make_shared<BrushWrites>(this,[this]{status_=U"笔刷参数已调整，但偏好保存失败";invalidateRect(statusBounds());});setProperty(writes);}writes->enqueue(std::move(value));}

    } catch(const std::exception&) {status_=U"笔刷参数已调整，但偏好保存失败";}

  }

void Editor::commitBrushField(bool opacity) {

    if(updatingBrushFields_ || currentTools().handTool || pending_!=Pending::None) return;

    auto input=opacity?brushOpacityInput_:brushSizeInput_;

    try {

      std::size_t end=0;const auto value=std::stod(input->text(),&end);

      if(end!=input->text().size() || !std::isfinite(value)) return;

      auto& brush=currentTools().brushProfiles[currentTools().eraser?1:0];

      const int next=int(std::floor(std::clamp(value,opacity?0.0:1.0,opacity?100.0:64.0)+0.5));

      auto& target=opacity?brush.opacity:brush.size;

      if(target!=next) {target=next;saveBrushPreferences();if(brushRange_ && brushRangeOpacity_==opacity) {brushRange_->value=next;brushRange_->invalidate();}}

    } catch(const std::exception&) {return;}

  }

void Editor::brushShapeMenu() {

    if(pending_!=Pending::None || currentDocument().active()) return;

    PixelMenu menu(skin_);const char32_t* labels[]={U"圆形",U"方形",U"线形"};const char* icons[]={"brush-round","brush-square","brush-line"};

    for(int i=0;i<3;++i) {auto item=new PixelMenuItem(font_,skin_,labels[i]);item->iconSkin=&toolIcons_;item->icon=icons[i];

      item->checked=[this,i]{return int(currentTools().brushProfiles[currentTools().eraser?1:0].shape)==i;};

      item->Click.connect([this,i]{currentTools().brushProfiles[currentTools().eraser?1:0].shape=BrushShape(i);saveBrushPreferences();refresh();});menu.addChild(item);}

    menu.showPopup(gfx::Point(brushShapeButton_->bounds().x,brushShapeButton_->bounds().y2()+uiGap*uiScale),display());requestFocus();

  }

gfx::Rect Editor::toolPopupBounds(ui::Widget* trigger,int width,int height){

    const auto view=display()->bounds(),at=trigger->bounds();

    return {std::clamp(at.x,view.x,std::max(view.x,view.x2()-width*uiScale)),std::clamp(at.y2()+uiGap*uiScale,view.y,std::max(view.y,view.y2()-height*uiScale)),width*uiScale,height*uiScale};

  }

void Editor::showPropertyRange(PixelEntry* entry,int minimum,int maximum){

    if(!isVisible() || !entry->isEnabled() || !entry->isVisible() || pending_!=Pending::None)return;

    closeParameterRange();
    if(propertyRangePopup_)propertyRangePopup_->closeWindow(nullptr);

    propertyRangePopup_=std::make_unique<ToolPropertyPopup>(skin_,font_,U"");

    auto& popup=*propertyRangePopup_;popup.setDisplay(display(),false);popup.setBounds(toolPopupBounds(entry,129,textControlHeight+12));

    // FocusEnter can open the flyout before the initiating MouseDown is

    // dispatched. Keep that same click on the owner from closing it again.

    popup.setClickBehavior(ui::PopupWindow::ClickBehavior::CloseOnClickOutsideHotRegion);

    gfx::Region hotRegion;

    for(const auto& area:{entry->bounds(),popup.bounds()})hotRegion|=gfx::Region(gfx::Rect(display()->nativeWindow()->pointToScreen(area.origin()),area.size()));

    popup.setHotRegion(hotRegion);

    auto range=new PixelSlider(font_,skin_);propertyRangeSlider_=range;range->minimum=minimum;range->maximum=maximum;range->percentage=entry->suffix==U"%";

    try{range->value=std::clamp(int(entry->deferredNumeric&&entry->numericValue?entry->numericValue():std::stod(entry->text())),minimum,maximum);}catch(...){range->value=minimum;}

    range->changed=[entry](int value){entry->setText(std::to_string(value));entry->Change();};

    popup.place(range,{6,6,117,textControlHeight});popup.openWindow();

  }

void Editor::showBrushRange(bool opacity) {

    if(currentTools().handTool || pending_!=Pending::None)return;

    showPropertyRange(opacity?brushOpacityInput_:brushSizeInput_,opacity?0:1,opacity?100:64);

  }

gfx::Rect Editor::homeBounds() const {

    const auto rc=uiLogical(bounds());const int width=std::min(560,rc.w-24);

    return {rc.x+(rc.w-width)/2,rc.y+Layout::workY+10,width,rc.h-Layout::workY-Layout::statusHeight-20};

  }

int Editor::homeBannerHeight() const {const auto box=homeBounds();return box.h<340?std::clamp(box.h-188,24,64):110;}

int Editor::homeContentY() const {return homeBounds().y+44+homeBannerHeight()+12;}

int Editor::homeLeftWidth() const {return std::min(148,homeBounds().w/3);}

std::filesystem::path Editor::homeRecentPath() const {return palettePreferencePath().parent_path()/"home-recent.txt";}

void Editor::recordHomeRecent(const std::filesystem::path& path){if(path.empty()||(smoke_&&recentSettingsOverride_.empty()))return;if(recent::record(homeRecent_,path.u8string(),recent::now())){recentErrors_.erase(path.u8string());saveRecentProjects();updateRecentMenu();if(homeOpen_&&homeSection_==0)loadHomeSection();}}

void Editor::loadHomeSection() {

    homeEntries_.clear();homeScroll_=homeScrollPixels_=0;

    if(homeSection_==1)loadGallery();
    if(homeSection_==3)loadHomeFolder();
    if(homeSection_==0)for(const auto& value:homeRecent_)homeEntries_.push_back({unicodeText(recent::baseName(value.path)),std::filesystem::u8path(value.path),{}});

    if(homeSection_==2){loadRecoveries();for(const auto& row:recoveryCatalog_.rows())homeEntries_.push_back({unicodeText(row.name),recoveryDirectory()/std::filesystem::u8path(row.id+".moonsprite"),row.id});}

  }

void Editor::layoutHome() {

    if(homeActions_.empty())return;

    const bool shown=homeOpen_;const bool usable=shown && pending_==Pending::None;

    const auto box=homeBounds();const int left=homeLeftWidth(),right=box.x+left+12,width=box.w-left-12;

    if(homeBannerPane_){homeBannerPane_->setBounds(uiPhysical({box.x,box.y+44,box.w,homeBannerHeight()}));homeBannerPane_->setVisible(shown);homeBannerPane_->setEnabled(usable);homeBannerPane_->setActive(shown);if(shown&&(homeBannerInitialized_||!recentSettingsOverride_.empty())&&(!smoke_||!recentSettingsOverride_.empty()))homeBannerPane_->start(galleryDirectory());}
    const bool compact=box.h<340;const int top=homeContentY(),primaryStep=compact?24:34,resourceTop=top+2*primaryStep+(compact?10:22),resourceStep=compact?18:26;

    const auto resourceViewport=uiPhysical(gfx::Rect(box.x,resourceTop,left,std::max(1,box.y2()-resourceTop)));
    if(homeAnnouncements_){homeAnnouncements_->setVisible(shown);homeAnnouncements_->setEnabled(usable);homeAnnouncements_->setBounds(resourceViewport);homeAnnouncements_->configure(int(homeActions_.size()-2)*resourceStep+6);}
    const int resourceOffset=homeAnnouncements_?homeAnnouncements_->offset():0;
    for(std::size_t i=0;i<homeActions_.size();++i){const bool primary=i<2;const int y=primary?top+int(i)*primaryStep:resourceTop+int(i-2)*resourceStep-resourceOffset;auto action=homeActions_[i];action->paletteViewport=primary?std::function<gfx::Rect()>{}:std::function<gfx::Rect()>{[resourceViewport]{return resourceViewport;}};action->setBounds(uiPhysical(gfx::Rect(box.x,y,primary?left:std::max(1,left-9),primary?(compact?21:28):(compact?17:22))));action->setVisible(shown&&(primary||resourceViewport.intersects(action->bounds())));}

    for(std::size_t i=0;i<homeActions_.size();++i)homeActions_[i]->setEnabled(usable && i<2);

    homeReturn_->setVisible(shown && documentOpen_);homeReturn_->setBounds(uiPhysical(gfx::Rect(box.x2()-94,box.y+2,94,19)));

    homeReturn_->setEnabled(usable);

    const bool recentToolsWrap=width<360;const int toolsWidth=homeSection_==0?68:homeSection_==2?17:51;const int tabSpace=std::max(1,width-(recentToolsWrap?0:toolsWidth+4));
    const int visibleTabs=std::min(int(homeSections_.size()),std::max(1,(tabSpace-19)/76));const int tabWidth=std::min(76,std::max(1,(tabSpace-(visibleTabs<int(homeSections_.size())?19:0))/visibleTabs));
    while(homeTabs_.size()<homeSections_.size()){const auto slot=homeTabs_.size();auto b=button(U"",[this,slot]{if(slot<homeSections_.size())selectHomeSection(homeSections_[slot].id);});homeTabs_.push_back(b);}

    const auto active=std::find_if(homeSections_.begin(),homeSections_.end(),[this](const auto& s){return s.id==homeSectionId_;});const auto activeIndex=std::size_t(active-homeSections_.begin());const bool activeOverflow=activeIndex>=std::size_t(visibleTabs);
    for(std::size_t i=0;i<homeTabs_.size();++i){auto b=homeTabs_[i];const bool visible=int(i)<visibleTabs-(activeOverflow?1:0)||(activeOverflow&&i==activeIndex);const int slot=activeOverflow&&i==activeIndex?visibleTabs-1:int(i);b->setVisible(shown&&i<homeSections_.size()&&visible);b->setEnabled(usable);if(i<homeSections_.size()){const auto& entry=homeSections_[i];b->caption=entry.kind=="recent"?U"最近文件":entry.kind=="gallery"?U"画廊":entry.kind=="recovery"?U"恢复":unicodeText(entry.name);b->active=entry.id==homeSectionId_;}b->setBounds(uiPhysical(gfx::Rect(right+slot*tabWidth,top,tabWidth-1,21)));}
    homeMore_->setVisible(shown&&visibleTabs<int(homeSections_.size()));homeMore_->setEnabled(usable);homeMore_->setBounds(uiPhysical({right+visibleTabs*tabWidth,top+3,15,15}));homeManage_->setVisible(shown);homeManage_->setEnabled(usable);

    const int recentToolsY=top+(recentToolsWrap?23:3),listTop=top+(recentToolsWrap?46:28);
    int toolX=right+width-66;for(auto button:{recentPrivacy_,recentRefresh_,recentClear_})if(button){button->setBounds(uiPhysical({toolX,recentToolsY,15,15}));button->setVisible(shown&&(homeSection_==0||((homeSection_==1||homeSection_==3)&&button==recentRefresh_)));button->setEnabled(usable);toolX+=17;}
    if(galleryFolder_){galleryFolder_->setBounds(uiPhysical({right+width-66,recentToolsY,15,15}));galleryFolder_->setVisible(shown&&(homeSection_==1||homeSection_==3));galleryFolder_->setEnabled(usable);}
    homeManage_->setBounds(uiPhysical({right+width-15,recentToolsY,15,15}));
    if(recentPrivacy_)recentPrivacy_->icon=recentHidden_?"eyeOff":"eye";
    if(recentClear_)recentClear_->setEnabled(usable&&std::any_of(homeRecent_.begin(),homeRecent_.end(),[](const auto& v){return !v.pinned;}));
    auto viewport=uiPhysical(gfx::Rect(right+6,listTop,std::max(1,width-12),std::max(1,box.y2()-listTop-6)));

    if(homeScrollBar_)homeScrollBar_->setVisible(false);
    for(auto row:homeRows_)row->setVisible(false);
    if(recentPane_){
      recentPane_->setVisible(shown);recentPane_->setEnabled(usable);
      if(!shown){recentPane_->setActive(false);return;}
      recentPane_->setBounds(viewport);
      recentPane_->setCacheDirectory(homeSection_==2?std::filesystem::path{}:smoke_&&recentSettingsOverride_.empty()?std::filesystem::path{}:(recentSettingsOverride_.empty()?homeRecentPath().parent_path():recentSettingsOverride_)/"project-preview-cache");
      recentPane_->setRecovery(homeSection_==2);recentPane_->setDensity(homeSection_==2?1:recentDensity_);recentPane_->setFolder(homeSection_==3);recentPane_->setGallery(homeSection_==1||homeSection_==3);
      if(homeSection_==2){homeFilesHidden_=false;recentPane_->setRecoveries(recoveryCatalog_.rows(),recoveryDirectory(),recoveryPreferences_.retentionDays);}
      else{auto visible=homeSection_==3?folderProjects_:homeSection_==1?galleryProjects_:homeRecent_;const auto originalCount=visible.size();visible.erase(std::remove_if(visible.begin(),visible.end(),[this](const auto& p){return !home::matches(p.path,homeFormats_);}),visible.end());homeFilesHidden_=visible.size()!=originalCount;recentPane_->setProjects(visible,recentErrors_,homeSection_==0&&recentHidden_);}
      recentPane_->setActive(true);
    }



  }

void Editor::showHome(bool open) {

    if(open&&colorEditorPopup_&&colorEditorPopup_->isVisible())colorEditorPopup_->closeWindow(nullptr);

    if(pending_!=Pending::None || currentDocument().active())return;

    if(open && advancedActive())changeAdvancedMode(0);
    currentPlayback().playing=false;

    if(open && !homeOpen_){homeVisibility_.clear();for(auto child:children())homeVisibility_.push_back({child,!child->hasFlags(ui::HIDDEN)});loadHomeSection();if(homeBannerPane_&&(homeBannerInitialized_||!recentSettingsOverride_.empty())&&(!smoke_||!recentSettingsOverride_.empty()))homeBannerPane_->start(galleryDirectory(),true);}

    homeOpen_=open;refresh();

  }

void Editor::applyHomeVisibility() {

    if(homeOpen_){for(auto child:children())if(child!=modalSurface_ && child!=menuBar_ && child!=homeButton_ && child!=discard_ && child!=keep_ && child!=dialogClose_ && child!=saveBeforeClose_ && child!=paletteInput_)child->setVisible(false);}

    if(homeOpen_)layoutDocumentTab();

    layoutHome();if(pending_==Pending::OpenError)layoutModal();if(pending_==Pending::Preferences)layoutPreferences(modalBounds(uiLogical(clientBounds())));

  }

void Editor::createHome() {

    auto image=[&](const std::filesystem::path& path){const auto patch=importSkinPng(path,2048);const auto& b=*patch.bitmap;auto surface=os::instance()->makeRgbaSurface(b.width,b.height);surface->clear();{os::SurfaceLock lock(surface.get());for(int y=0;y<b.height;++y)for(int x=0;x<b.width;++x){const auto p=b.pixels[y*b.width+x];surface->putPixel(gfx::rgba(p&255,(p>>8)&255,(p>>16)&255,p>>24),x,y);}}return surface;};

    homeLogo_=image(assets_/"home/logo.png");homeBannerPane_=new HomeBannerPane(font_,skin_,toolIcons_,assets_);addChild(homeBannerPane_);homeBannerPane_->open=[this](const auto& banner){openHomeBanner(banner);};homeBannerPane_->author=[this](const std::string& url){try{homeBannerAuthorLauncher_(url);}catch(const std::exception& e){status_=unicodeText(e.what());invalidate();}};

    loadRecentProjects();

    auto action=[&](const char32_t* title,const char* icon,std::function<void()> run={}){auto b=button(title,run?run:[]{});b->iconSkin=&toolIcons_;b->icon=icon;b->iconWithCaption=true;b->setEnabled(bool(run));homeActions_.push_back(b);};

    action(U"新建精灵","plus",[this]{ask(Pending::New);});action(U"打开精灵","folderOpen",[this]{chooseProject();});action(U"工程备份","save");action(U"使用帮助","info");action(U"使用技巧","info");action(U"Steam 愿望单","link");

    for(int i=0;i<3;++i){const char32_t* titles[]{U"最近文件",U"画廊",U"恢复"};auto b=button(titles[i],[this,i]{if(std::size_t(i)<homeSections_.size())selectHomeSection(homeSections_[i].id);});homeTabs_.push_back(b);}

    homeReturn_=button(U"返回当前工程",[this]{showHome(false);});
    recentPane_=new RecentProjectsPane(font_,skin_,toolIcons_);addChild(recentPane_);recentPane_->densityChanged=[this](int value){recentDensity_=value;if(smoke_&&recentSettingsOverride_.empty())return;try{const auto dir=recentSettingsOverride_.empty()?homeRecentPath().parent_path():recentSettingsOverride_;std::filesystem::create_directories(dir);const std::string text=value==0?"small":value==2?"large":"medium";writeExportBytesAtomic(dir/"moonsprite.home-project-layout.v1",{text.begin(),text.end()});}catch(...){}};
    recentPane_->open=[this](const std::string& path,bool background){if(homeSection_==2){const auto id=std::filesystem::u8path(path).stem().u8string();if(auto record=recoveryCatalog_.find(id))restoreRecovery(std::filesystem::u8path(path),id,unicodeText(record->name));}else openRecentProject(path,background);};recentPane_->pin=[this](const std::string& path){if(homeSection_==1||homeSection_==3)toggleGalleryPin(path);else{recent::togglePin(homeRecent_,path);recentChanged();}};recentPane_->remove=[this](const std::string& path){if(homeSection_==2)discardHomeRecovery(std::filesystem::u8path(path).stem().u8string());else if(homeSection_==1)deleteGalleryProject(path);else if(homeSection_==0)removeRecentProject(path);};recentPane_->folder=[this](const std::string& path){openRecentFolder(path);};recentPane_->reordered=[this](std::vector<std::string> paths){if(homeSection_==0){recent::reorder(homeRecent_,paths);recentChanged();}};
    auto recentTool=[&](const char* icon,std::function<void()> action){auto b=button(U"",std::move(action));b->iconSkin=&toolIcons_;b->icon=icon;b->skinStyle="icon_button";return b;};
    recentPrivacy_=recentTool("eye",[this]{toggleRecentPrivacy();});recentRefresh_=recentTool("refresh",[this]{if(homeSection_==0)loadRecentProjects();loadHomeSection();refresh();});recentClear_=recentTool("clearRecords",[this]{recent::clear(homeRecent_);recentChanged();});

    galleryFolder_=recentTool("folderOpen",[this]{if(auto f=activeHomeFolder()){try{if(!std::filesystem::is_directory(std::filesystem::u8path(f->directory)))throw std::runtime_error("Folder is unavailable");projectFolderLauncher_(std::filesystem::u8path(f->directory));}catch(const std::exception& e){status_=unicodeText(e.what());invalidate();}}else openGalleryFolder();});
    homeManage_=recentTool("properties",[this]{showHomeSectionManager();});homeMore_=recentTool("more",[this]{showHomeOverflow();});
    homeAnnouncements_=new HomeAnnouncementsPane(font_,skin_,[this](std::size_t index){showLatestRelease(index,releaseNotesVerify_);},[this]{layoutHome();});addChild(homeAnnouncements_);

    layoutHome();

  }

void Editor::paintWorkLayer(ui::Graphics& g,const gfx::Rect& rc) {
    if(advancedActive()){g.fillRect(skin_["background"],rc);if(advancedMode_==1)g.fillRect(skin_["panel"],gfx::Rect(0,0,rc.w,Layout::optionsHeight+Layout::gap));return;}

    const int top=Layout::documentY+Layout::projectTabHeight-1;

    g.fillRect(skin_["panel"],gfx::Rect(0,top,rc.w,rc.h-top));

    g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(0,top,rc.w,1));

    g.fillRect(gfx::rgba(66,79,103,255),gfx::Rect(0,top+1,rc.w,1));

  }

void Editor::paintDocumentTab(ui::Graphics& g) {
    if(advancedActive())return;

    const auto rc=uiLogical(clientBounds());g.saveClip();g.clipRect({0,Layout::documentY,std::max(1,rc.w-17),Layout::projectTabHeight});
    // Fragmented parent damage often lies entirely outside the project strip.
    // Respect the actual transformed clip before visiting every open project.
    if(g.getClipBounds().isEmpty() && !(smoke_ && _wgetenv(L"MOONSPRITE_PROJECT_TAB_REFERENCE"))){g.restoreClip();return;}

    for(std::size_t i=0;i<projects_.size();++i){const auto& value=projectDocument(i);auto tab=uiLogical(projectTabRects_[i]);tab.offset(-bounds().x/uiScale,-bounds().y/uiScale);const bool active=i==activeProject_ && !homeOpen_;

      skin_.draw(g,active?"project_tab.active":"project_tab.inactive",tab);

      const auto ink=font_.inkBounds(value.name());const int width=std::max(0,std::min(ink.w,tab.w-2*Layout::inset-11-uiGap-(value.dirty()?3+uiGap:0)));

      g.saveClip();g.clipRect({tab.x+Layout::inset,tab.y+4,width,9});font_.draw(g,value.name(),tab.x+Layout::inset-ink.x,tab.y+4-ink.y,skin_["text"]);g.restoreClip();

      if(value.dirty())g.fillRect(gfx::rgba(41,121,255,255),{tab.x+Layout::inset+width+uiGap,tab.y+7,3,3});

    }g.restoreClip();

  }

void Editor::paintHome(ui::Graphics& g) {

    UiPaintScale scale(g);const auto rc=uiLogical(clientBounds()),absolute=homeBounds();auto box=absolute;box.offset(-bounds().x/uiScale,-bounds().y/uiScale);

    g.fillRect(skin_["background"],rc);

    if(documentOpen_){paintWorkLayer(g,rc);paintDocumentTab(g);}

    auto text=[&](const std::u32string& title,int x,int y,bool muted=false){font_.draw(g,title,x,y,skin_[muted?"muted":"text"]);};

    g.drawSurface(homeLogo_.get(),gfx::Rect(0,0,14,14),gfx::Rect(box.x,box.y,28,28),os::Sampling(),nullptr);

    text(U"MOONSPRITE",box.x+36,box.y+2);text(U"像素艺术专业编辑器",box.x+36,box.y+17,true);

    g.fillRect(skin_["border"],gfx::Rect(box.x,box.y+36,box.w,1));

    const int left=homeLeftWidth(),right=box.x+left+12,width=box.w-left-12;

    const int top=homeContentY()-bounds().y/uiScale;

    const gfx::Rect list(right,top+22,width,std::max(12,box.y2()-top-22));g.fillRect(skin_["panel"],list);skin_.draw(g,"panel_outer",list);

    const bool compact=box.h<340;const int resourceTop=top+2*(compact?24:34)+(compact?10:22);

    g.fillRect(skin_["border"],gfx::Rect(box.x,resourceTop-(compact?6:17),left,1));

    if(!compact)text(U"更多入口 · 待迁移",box.x,resourceTop-13,true);

    if(recentPane_->count()==0){

      const std::u32string heading=homeSection_==2?(recoveryCatalog_.status()==recovery::CatalogStatus::Loading?U"正在读取恢复工程":recoveryCatalog_.status()==recovery::CatalogStatus::Failed?U"恢复记录读取失败":U"没有待恢复的工程"):homeSection_==3?(folderLoading_?U"正在读取文件夹":!folderError_.empty()?U"文件夹读取失败":U"文件夹中没有工程"):homeSection_==1?(galleryLoading_?U"正在读取画廊":!galleryError_.empty()?U"画廊读取失败":U"画廊中没有工程"):U"从一个新作品开始";

      const std::u32string detail=homeSection_==2?U"恢复工程会显示在这里":homeSection_==3?(!folderError_.empty()?unicodeText(folderError_):homeFilesHidden_?U"文件已被格式筛选隐藏":U"所选文件夹的文件显示在这里"):homeSection_==1?(!galleryError_.empty()?unicodeText(galleryError_):U"工程文件保存在 MoonSprite 根目录的 gallery 文件夹中。"):U"新建或打开精灵，继续创作";

      const int y=list.y+std::max(8,(list.h-32)/2);

      g.saveClip();g.clipRect(gfx::Rect(right+6,list.y+4,width-12,list.h-8));

      const auto displayHeading=homeSection_!=2&&homeFilesHidden_?U"没有符合显示格式的文件":heading;const auto displayDetail=homeSection_!=2&&homeFilesHidden_?U"可在栏目管理中修改文件显示格式":detail;text(displayHeading,right+(width-font_.measure(displayHeading))/2,y);text(displayDetail,right+(width-font_.measure(displayDetail))/2,y+19,true);g.restoreClip();

    }

    text(status_,uiGap,rc.h-Layout::statusHeight+uiGap,true);

  }

void Editor::showBrushDitherPopup(){
 if(currentTools().pencilImageBrush||currentDocument().active())return;
 ToolPropertyPopup popup(skin_,font_,U"笔刷抖动");popup.setDisplay(display(),false);popup.setWantFocus(true);popup.setBounds(toolPopupBounds(toolControls_[1].first,178,163));
 const char32_t* names[]={U"棋盘",U"左斜线",U"右斜线",U"横向",U"纵向",U"Bayer 2",U"Bayer 4",U"Bayer 8"};
 std::array<PixelButton*,8> choices{};PixelButton *previous=nullptr,*following=nullptr,*stageLabel=nullptr;
 auto sync=[&]{const auto& b=currentTools().brushProfiles[currentTools().eraser?1:0];for(int i=0;i<8;++i){choices[i]->active=b.dither&&int(b.ditherTemplate)==i;choices[i]->invalidate();}previous->setEnabled(b.dither);following->setEnabled(b.dither);stageLabel->caption=unicodeText(std::to_string(b.ditherStage)+"/"+std::to_string(brushDitherStageCount(b.ditherTemplate)));stageLabel->invalidate();};
 auto changed=[&]{saveBrushPreferences();layoutToolOptions();invalidateRect(canvasViewport());sync();};
 for(int i=0;i<8;++i){choices[i]=new PixelButton(font_,skin_,names[i],[&,i]{auto& b=currentTools().brushProfiles[currentTools().eraser?1:0];const auto t=BrushDitherTemplate(i);if(b.dither&&b.ditherTemplate==t)b.dither=false;else{const int old=brushDitherStageCount(b.ditherTemplate),next=brushDitherStageCount(t);b.ditherStage=std::clamp(int(std::lround(double(b.ditherStage)/old*next)),1,next);b.ditherTemplate=t;b.dither=true;}changed();});popup.place(choices[i],{6+(i%2)*84,DialogLayout::bodyTop+(i/2)*22,80,20});}
 previous=new PixelButton(font_,skin_,U"",[&]{auto& b=currentTools().brushProfiles[currentTools().eraser?1:0];b.ditherStage=std::max(1,b.ditherStage-1);changed();});previous->icon="playback-previous";previous->iconSkin=&toolIcons_;popup.place(previous,{6,DialogLayout::bodyTop+94,15,15});
 stageLabel=new PixelButton(font_,skin_,U"",[]{});stageLabel->labelOnly=true;stageLabel->setEnabled(false);popup.place(stageLabel,{23,DialogLayout::bodyTop+92,126,20});
 following=new PixelButton(font_,skin_,U"",[&]{auto& b=currentTools().brushProfiles[currentTools().eraser?1:0];b.ditherStage=std::min(brushDitherStageCount(b.ditherTemplate),b.ditherStage+1);changed();});following->icon="playback-next";following->iconSkin=&toolIcons_;popup.place(following,{151,DialogLayout::bodyTop+94,15,15});
 sync();ui::Timer timer(40,&popup);if(ditherSmokeChoice>=0){timer.Tick.connect([&]{timer.stop();choices.at(ditherSmokeChoice)->Click();popup.closeWindow(nullptr);});timer.start();}popup.openWindowInForeground();timer.stop();requestFocus();
}
// Legacy createSession/loadToolSettings: load values without creating controls.
void Editor::loadSessionToolPreferences(bool reset){
 waitBrushWrites(this);
 const auto directory=smoke_&&workspacePresetTestDirectory_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path();
 if(reset){
  currentView().drawingAnchor={.5,.5};currentView().drawingAnchorVisible=true;currentView().drawFromCanvasCenter=false;
  for(auto& brush:currentTools().brushProfiles)brush={};
  currentTools().selectionMode=currentTools().selectionKind=currentTools().selectionBrushAngle=0;currentTools().selectionRounded=currentTools().selectionRotSprite=false;currentTools().selectionCornerRadius=4;currentView().selectionPivotVisible=true;currentTools().wandOptions={};
  shapeSpec_={};currentTools().shapeKind=ShapeKind::Rectangle;currentTools().shapeRounded=currentTools().shapeRatio=false;currentTools().shapeRadius=4;currentTools().shapeRatioWidth=currentTools().shapeRatioHeight=1;currentTools().curveAnchorCount=2;
  currentTools().fillOptions={};currentTools().fillPattern={};currentTools().fillLibrarySelection={};currentTools().fillImageName.clear();currentTools().rememberGradientTool=false;gradientSpec_={};currentTools().gradientRadial=false;currentTools().gradientDither=0;currentTools().gradientOptions={};currentTools().gradientStops.clear();currentTools().gradientConfirm=currentTools().gradientFreeform=false;
  currentTools().inkProfiles={};currentTools().syncInkAcrossTools=false;currentTools().pencilImageBrush.reset();currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrushAngle=0;
  currentTools().brushDynamics={};currentTools().airbrushSettings={};currentTools().liquifyOptions={};currentTools().smoothStrength=50;currentTools().smoothAngle=0;currentTools().smoothBrush={};currentTools().moveAutoSelect=true;currentTools().eyedropperSource=EyedropperSource::Composite;currentTools().magicEraserContiguous=false;
 }
 try{std::ifstream in(directory/"airbrush-options.txt");AirbrushSettings s;int shape;if(in>>s.particleRadius>>shape>>s.angle>>s.scatterRadius>>s.density>>s.intervalMs){s.particleRadius=std::clamp(s.particleRadius,1,16);s.shape=BrushShape(std::clamp(shape,0,2));s.angle=std::clamp(s.angle,-180,180);s.scatterRadius=std::clamp(s.scatterRadius,1,64);s.density=std::clamp(s.density,1,128);s.intervalMs=std::clamp(s.intervalMs,16,1000);currentTools().airbrushSettings=s;}}catch(...){}
 try{std::ifstream in(directory/"smooth-brush-v1.txt");std::string tag;int s,a,size,shape;if(in>>tag>>s>>a>>size>>shape&&tag=="smooth-v1"){currentTools().smoothStrength=std::clamp(s,0,100);currentTools().smoothAngle=std::clamp(a,-180,180);currentTools().smoothBrush.size=std::clamp(size,1,64);currentTools().smoothBrush.shape=BrushShape(std::clamp(shape,0,2));}}catch(...){}
    try {

      {std::ifstream selectionSettings(directory/"selection-options.txt");int rounded,radius,mode,pivot;if(selectionSettings>>rounded>>radius>>mode>>pivot){currentTools().selectionRounded=rounded!=0;currentTools().selectionCornerRadius=std::clamp(radius,0,256);currentTools().selectionMode=std::clamp(mode,0,3);currentView().selectionPivotVisible=pivot!=0;}}

      const auto path=directory/"brush-profiles.txt";

      if(std::filesystem::exists(path)) {

        std::ifstream in(path);int size,opacity,shape;

        for(auto& brush:currentTools().brushProfiles) {if(!(in>>size>>opacity>>shape)) throw std::runtime_error("Invalid brush preferences");

          brush={std::clamp(size,1,64),std::clamp(opacity,0,100),BrushShape(std::clamp(shape,0,2))};}int angle;if(in>>angle)currentTools().selectionBrushAngle=std::clamp(angle,-180,180);int algorithm;if(in>>algorithm)currentTools().selectionRotSprite=algorithm==1;int tolerance,contiguous,gap,threshold,reference,connectivity;if(in>>tolerance>>contiguous>>gap>>threshold>>reference>>connectivity)currentTools().fillOptions={std::clamp(tolerance,0,255),connectivity==8?8:4,std::clamp(threshold,1,16),contiguous!=0,gap!=0,reference!=0};int radial,dither,gt,gc,confirm,freeform;std::size_t stops;if(in>>radial>>dither>>gt>>gc>>confirm>>freeform>>stops){currentTools().gradientRadial=radial!=0;currentTools().gradientDither=std::clamp(dither,0,8);currentTools().gradientOptions.tolerance=std::clamp(gt,0,255);currentTools().gradientOptions.contiguous=gc!=0;currentTools().gradientConfirm=confirm!=0;currentTools().gradientFreeform=freeform!=0;if(stops<=4096)for(std::size_t i=0;i<stops;++i){GradientStop stop;if(!(in>>stop.position>>stop.color))break;if(std::isfinite(stop.position)){stop.position=std::clamp(stop.position,0.0,1.0);currentTools().gradientStops.push_back(stop);}}std::stable_sort(currentTools().gradientStops.begin(),currentTools().gradientStops.end(),[](auto a,auto b){return a.position<b.position;});}int kind,rounded,radius,ratio;double rw,rh;if(in>>kind>>rounded>>radius>>ratio>>rw>>rh){currentTools().shapeKind=ShapeKind(std::clamp(kind,0,7));currentTools().shapeRounded=rounded!=0;currentTools().shapeRadius=std::clamp(radius,0,256);currentTools().shapeRatio=ratio!=0;if(std::isfinite(rw))currentTools().shapeRatioWidth=std::clamp(rw,.1,100.0);if(std::isfinite(rh))currentTools().shapeRatioHeight=std::clamp(rh,.1,100.0);}int texture,textureScale;if(in>>texture>>textureScale){currentTools().fillPattern.texture=FillTexture(std::clamp(texture,0,3));currentTools().fillPattern.textureScale=std::clamp(textureScale,1,16);}int anchors;if(in>>anchors)currentTools().curveAnchorCount=std::clamp(anchors,1,8);int enabled,visible;double anchorX,anchorY;if(in>>enabled>>visible>>anchorX>>anchorY){currentView().drawFromCanvasCenter=enabled!=0;currentView().drawingAnchorVisible=visible!=0;if(std::isfinite(anchorX)&&std::isfinite(anchorY))currentView().drawingAnchor={anchorX,anchorY};}drawingAnchorDefaults_=currentView().drawingAnchor;drawingAnchorDefaultEnabled_=currentView().drawFromCanvasCenter;drawingAnchorDefaultVisible_=currentView().drawingAnchorVisible;

      }

    } catch(const std::exception&) {status_=U"笔刷偏好读取失败，使用有效默认值";}

    loadMagicEraserPreferences();
    loadFillPatternPreferences();

    {std::ifstream in(directory/"brush-dither-options.txt");for(auto& b:currentTools().brushProfiles){int enabled,t,stage;if(!(in>>enabled>>t>>stage))break;b.dither=enabled!=0;b.ditherTemplate=BrushDitherTemplate(std::clamp(t,0,7));b.ditherStage=std::clamp(stage,1,brushDitherStageCount(b.ditherTemplate));}}
    {std::ifstream in(directory/"pixel-stroke-options.txt");int perfect=0,step=1;if(in>>perfect>>step){for(auto& b:currentTools().brushProfiles)b.perfectPixels=perfect!=0;runtimePreferences_.set("tools.lineDirectionStep.Number",std::to_string(std::clamp(step,1,16)));}}
    currentTools().wandOptions.connectivity=currentTools().fillOptions.connectivity;currentTools().wandOptions.visibleLayers=currentTools().fillOptions.visibleLayers;


 // Existing adapters retain their validation and file format; test roots never
 // redirect a production user's preference files.
 const auto oldInk=inkPreferenceOverride_,oldDynamics=dynamicsPreferenceOverride_,oldLiquify=liquifyPreferenceOverride_;
 if(smoke_&&workspacePresetTestDirectory_){inkPreferenceOverride_=directory/"ink-modes.txt";dynamicsPreferenceOverride_=directory/"brush-dynamics-v6.txt";liquifyPreferenceOverride_=directory/"liquify-options.txt";}
 loadInkPreferences();loadDynamicsPreferences();loadLiquifyPreferences();
 inkPreferenceOverride_=oldInk;dynamicsPreferenceOverride_=oldDynamics;liquifyPreferenceOverride_=oldLiquify;
 {std::ifstream in(directory/"image-brush-selection-v1.txt");std::string version,id;double angle;if(in>>version>>std::quoted(id)>>angle&&version=="image-brush-v1"&&id.size()<=4096&&std::isfinite(angle)&&(in>>std::ws).eof()){currentTools().pencilImageBrushId=id;currentTools().pencilImageBrushAngle=std::clamp(angle,-180.,180.);resolvePencilImageBrush();}}
 {std::ifstream in(directory/"eyedropper-source.txt");std::string value;if(in>>value)currentTools().eyedropperSource=value=="current-layer"?EyedropperSource::CurrentLayer:EyedropperSource::Composite;}
 {std::ifstream in(directory/"move-tool-v1.txt");std::string tag;int value;if(in>>tag>>value&&tag=="move-tool-v1"&&(value==0||value==1))currentTools().moveAutoSelect=value!=0;}
}

void Editor::createToolOptions() {waitBrushWrites(this);
 createLiquifyOptions();
    createSmoothOptions();
    createAirbrushOptions();



    loadSessionToolPreferences(false);

    auto icon=[&](const char* name,const char32_t* hint,bool enabled=false) {

      auto control=button(U"",[]{});control->icon=name;control->iconSkin=&toolIcons_;control->setEnabled(enabled);

      control->hover=[this,hint]{status_=hint;invalidate();};toolControls_.push_back({control,15});return control;

    };

    auto label=[&](const char32_t* text) {auto control=button(text,[]{});control->labelOnly=true;control->setEnabled(false);toolControls_.push_back({control,font_.measure(text)});return control;};

    brushShapeButton_=icon("brush-round",U"笔刷形状",true);brushShapeButton_->Click.connect([this]{brushShapeMenu();});

    auto ditherButton=icon("dither",U"笔刷抖动",true);ditherButton->Click.connect([this]{showBrushDitherPopup();});imageBrushButton_=icon("image",U"图像笔刷",true);imageBrushButton_->Click.connect([this]{showPencilImageBrushes();});

    toolControls_[0].gap=toolControls_[1].gap=-1;

    auto number=[&](bool opacity) {

      auto control=new PixelEntry(font_,skin_);addChild(control);control->numeric=true;control->deferredNumeric=true;
      control->numericMinimum=opacity?0:1;control->numericMaximum=opacity?100:64;
      control->numericValue=[this,opacity]{const auto& b=currentTools().brushProfiles[currentTools().eraser?1:0];return double(opacity?b.opacity:b.size);};
      control->suffix=opacity?U"%":U"px";

      const int width=control->widthForValue(opacity?U"100":U"64");

      control->setFixedContentWidth(width);

      toolControls_.push_back({control,width});

      control->focus=[this,opacity]{showBrushRange(opacity);};

      auto commit=[this,opacity]{commitBrushField(opacity);if(!updatingBrushFields_)layoutToolOptions();};
      control->deferredCommit=commit;
      control->Change.connect(commit);

      control->accept=[this,opacity]{commitBrushField(opacity);requestFocus();layoutToolOptions();};

      control->blur=[this,opacity]{commitBrushField(opacity);};

      control->cancel=[this]{requestFocus();layoutToolOptions();};

      control->wheel=[this,opacity,control](int delta){auto& value=opacity?currentTools().brushProfiles[currentTools().eraser?1:0].opacity:currentTools().brushProfiles[currentTools().eraser?1:0].size;

        value=std::clamp(value+delta,opacity?0:1,opacity?100:64);control->setText(std::to_string(value));saveBrushPreferences();layoutToolOptions();invalidate();};

      return control;

    };

    brushSizeInput_=number(false);label(U"不透明度");brushOpacityInput_=number(true);

    {auto scrubLabel=static_cast<PixelButton*>(toolControls_[4].first);scrubLabel->setEnabled(true);scrubLabel->framePress=[this](const ui::MouseMessage& msg){numberScrubLastX_=msg.position().x;};scrubLabel->frameDrag=[this](int x){brushOpacityInput_->adjustNumber((x-numberScrubLastX_)*((os::instance()->keyModifiers() & ui::kKeyShiftModifier)?10:1));numberScrubLastX_=x;};}

    label(U"阶梯");toolControls_.back().pencilOnly=true;

    lineStepInput_=new PixelEntry(font_,skin_);auto step=lineStepInput_;addChild(step);step->setText(std::to_string(std::clamp(runtimePreferences_.index("tools.lineDirectionStep.Number"),1,16)));step->setEnabled(true);step->hover=[this]{status_=U"斜向直线阶梯比例（1–16）；Shift 直线或 Ctrl+Shift 连接线";invalidate();};toolControls_.push_back({step,22,uiGap,true});
    auto commitStep=[this]{try{int v=std::clamp(std::stoi(lineStepInput_->text()),1,16);runtimePreferences_.set("tools.lineDirectionStep.Number",std::to_string(v));lineStepInput_->setText(std::to_string(v));saveBrushPreferences();}catch(...){lineStepInput_->setText(std::to_string(std::clamp(runtimePreferences_.index("tools.lineDirectionStep.Number"),1,16)));}};
    step->Change.connect(commitStep);step->accept=[this,commitStep]{commitStep();requestFocus();};step->blur=commitStep;
    perfectPixelsButton_=icon("checkboxUnchecked",U"完美像素：移除笔画转角的多余像素",true);auto perfect=perfectPixelsButton_;perfect->Click.connect([this]{const bool enabled=!currentTools().brushProfiles[0].perfectPixels;for(auto& b:currentTools().brushProfiles)b.perfectPixels=enabled;saveBrushPreferences();layoutToolOptions();invalidate();});perfect->caption=U"完美像素";perfect->bareIconWithCaption=true;toolControls_.back().second=11+uiGap+font_.measure(perfect->caption);

    inkButton_=icon("ink-simple",U"墨水模式",true);inkButton_->Click.connect([this]{showInkMenu();});dynamicsButton_=icon("pressure-dynamics",U"压力与速度动态",true);dynamicsButton_->Click.connect([this]{showDynamicsOptions();});loadDynamicsPreferences();

    const auto symmetryStart=toolControls_.size();

    const char* symmetryIcons[]{"symmetry-horizontal","symmetry-vertical","symmetry-diagonal-up","symmetry-diagonal-down","symmetry-rotational","more"};

    for(int i=0;i<6;++i){auto b=icon(symmetryIcons[i],i<5?U"对称绘制":U"对称轴设置");b->setEnabled(true);symmetryButtons_[i]=b;b->Click.connect([this,i]{if(i==5)showSymmetryMenu();else toggleSymmetry(i);});}

    for(std::size_t i=symmetryStart;i+1<toolControls_.size();++i) toolControls_[i].gap=-1;

    commands_[3]->icon="undo";commands_[4]->icon="redo";

    for(auto b:{commands_[3],commands_[4]}) {b->iconSkin=&toolIcons_;b->iconWithCaption=true;}

    auto option=[&](const char32_t* text,int width,auto action){auto b=button(text,action);selectionControls_.push_back({b,width});return b;};

    auto modeGroup=new ui::Widget(ui::kGenericWidget);modeGroup->setTransparent(true);addChild(modeGroup);selectionControls_.push_back({modeGroup,57});

    const char* modeIcons[]{"selection-replace","selection-add","selection-subtract","selection-intersect"};

    const char32_t* modeNames[]{U"替换选区",U"添加选区",U"减去选区",U"相交选区"};

    for(int i=0;i<4;++i){auto b=new PixelButton(font_,skin_,U"",[this,i]{currentTools().selectionMode=i;saveSelectionPreferences();layoutToolOptions();invalidateRect(canvasViewport());});b->icon=modeIcons[i];b->iconSkin=&toolIcons_;b->skinStyle="icon_button";b->iconGroupIndex=i;b->iconGroupCount=4;b->hover=[this,i,modeNames]{status_=modeNames[i];invalidate();};modeGroup->addChild(b);selectionModeButtons_[i]=b;}

    auto wandNumber=[&](bool gap){auto entry=new PixelEntry(font_,skin_);entry->numeric=true;addChild(entry);selectionControls_.push_back({entry,gap?30:32});auto commit=[this,entry,gap]{try{std::size_t used=0;const double raw=std::stod(entry->text(),&used);if(used!=entry->text().size() || !std::isfinite(raw))return;const int value=int(std::floor(std::clamp(raw,-1000.0,1000.0)+.5));if(gap)currentTools().wandOptions.gapThreshold=std::clamp(value,1,16);else currentTools().wandOptions.tolerance=std::clamp(value,0,255);}catch(...){ }saveBrushPreferences();layoutToolOptions();};entry->Change.connect(commit);entry->accept=[this,commit]{commit();requestFocus();};entry->blur=commit;entry->cancel=[this]{requestFocus();layoutToolOptions();};entry->wheel=[this,gap,entry](int delta){if(gap)currentTools().wandOptions.gapThreshold=std::clamp(currentTools().wandOptions.gapThreshold+delta,1,16);else currentTools().wandOptions.tolerance=std::clamp(currentTools().wandOptions.tolerance+delta,0,255);entry->setText(std::to_string(gap?currentTools().wandOptions.gapThreshold:currentTools().wandOptions.tolerance));saveBrushPreferences();layoutToolOptions();invalidate();};return entry;};

    option(U"容差",28,[]{})->labelOnly=true;wandToleranceInput_=wandNumber(false);

    wandContiguousButton_=option(U"连续",45,[this]{if(currentTools().fillTool&&currentTools().magicEraserTool)currentTools().magicEraserContiguous=!currentTools().magicEraserContiguous;else currentTools().wandOptions.contiguous=!currentTools().wandOptions.contiguous;saveBrushPreferences();layoutToolOptions();invalidate();});

    wandGapButton_=option(U"智能闭合",65,[this]{currentTools().wandOptions.gapClosing=!currentTools().wandOptions.gapClosing;saveBrushPreferences();layoutToolOptions();invalidate();});wandGapInput_=wandNumber(true);

    for(auto b:{wandContiguousButton_,wandGapButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}

    wandConnectivityButton_=option(U"4 方连接",57,[this]{currentTools().wandOptions.connectivity=currentTools().wandOptions.connectivity==4?8:4;currentTools().fillOptions.connectivity=currentTools().wandOptions.connectivity;saveBrushPreferences();layoutToolOptions();invalidate();});

    wandReferenceButton_=option(U"",15,[this]{showFillSettings(wandReferenceButton_);});wandReferenceButton_->icon="properties";wandReferenceButton_->iconSkin=&toolIcons_;

    selectionBrushAngleInput_=new PixelEntry(font_,skin_);selectionBrushAngleInput_->numeric=true;selectionBrushAngleInput_->suffix=U"°";addChild(selectionBrushAngleInput_);selectionControls_.push_back({selectionBrushAngleInput_,42});auto angleCommit=[this]{try{std::size_t used=0;const double value=std::stod(selectionBrushAngleInput_->text(),&used);if(used==selectionBrushAngleInput_->text().size() && std::isfinite(value))currentTools().selectionBrushAngle=std::clamp(int(std::floor(std::clamp(value,-180.0,180.0)+.5)),-180,180);}catch(...){}saveBrushPreferences();layoutToolOptions();invalidateRect(canvasViewport());};selectionBrushAngleInput_->Change.connect(angleCommit);selectionBrushAngleInput_->blur=angleCommit;selectionBrushAngleInput_->accept=[this,angleCommit]{angleCommit();requestFocus();};selectionBrushAngleInput_->cancel=[this]{requestFocus();layoutToolOptions();};selectionBrushAngleInput_->wheel=[this](int delta){currentTools().selectionBrushAngle=std::clamp(currentTools().selectionBrushAngle+delta,-180,180);selectionBrushAngleInput_->setText(std::to_string(currentTools().selectionBrushAngle));saveBrushPreferences();layoutToolOptions();invalidateRect(canvasViewport());};

    selectionAlgorithmButton_=option(U"快速旋转",70,[this]{if(selectionDragging_ || floatingDragging_)return;currentTools().selectionRotSprite=!currentTools().selectionRotSprite;saveBrushPreferences();if(auto target=currentDocument().floatingTransform())currentDocument().transformFloatingPaste(*target,currentTools().selectionRotSprite);layoutToolOptions();invalidateRect(canvasViewport());});

    const char32_t* fieldSuffix[]{U"X",U"Y",U"宽",U"高",U"°"};

    for(int index=0;index<5;++index){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->deferredNumeric=true;input->numericMinimum=index==4?-180:-1000000000;input->numericMaximum=index==4?180:1000000000;input->numericValue=[this,index]{if(auto t=selectionTransformTarget()){if(index==0)return t->x;if(index==1)return t->y;if(index==2)return t->width*(t->flipHorizontal?-1:1);if(index==3)return t->height*(t->flipVertical?-1:1);return t->angle;}return 0.0;};input->suffix=fieldSuffix[index];addChild(input);input->focus=[this,input,index]{openParameterRange(input,index==4?-180:-1000000000,index==4?180:1000000000);};selectionTransformFields_[index]=input;selectionControls_.push_back({input,48});auto commit=[this,input,index]{if(selectionDragging_ || floatingDragging_)return;try{std::size_t used=0;const double value=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(value) || !currentDocument().selection())return;auto target=*selectionTransformTarget();if(index==0 || index==1){const double next=std::floor(value+.5);auto& coordinate=index==0?target.x:target.y;auto& origin=index==0?target.flipOriginX:target.flipOriginY;if(origin)*origin+=next-coordinate;coordinate=next;}else if(index==4)target.angle=std::floor(value*10+.5)/10;else{const double magnitude=std::max(1.0,std::floor(std::abs(value)+.5)),old=index==2?target.width:target.height;const bool oldFlip=index==2?target.flipHorizontal:target.flipVertical;const double factor=(value<0?-magnitude:magnitude)/(old*(oldFlip?-1:1));const double radians=target.angle*3.141592653589793/180,dx=index==2?(factor-1)*old/2:0,dy=index==3?(factor-1)*old/2:0;const auto previous=target;target=resizeSelectionTransform(target,{dx*std::cos(radians)-dy*std::sin(radians),dx*std::sin(radians)+dy*std::cos(radians)},index==2?"e":"s",false,false,true);if(factor>0 && oldFlip){auto& origin=index==2?target.flipOriginX:target.flipOriginY;const auto& original=index==2?previous.flipOriginX:previous.flipOriginY;if(original)origin=(index==2?target.x:target.y)+(*original-(index==2?previous.x:previous.y))/old*magnitude;}}if(!currentDocument().beginSelectionContentMove(false,currentView().frameSelection))return;currentDocument().transformFloatingPaste(target,currentTools().selectionRotSprite);selectionPropertiesActive_=true;layoutToolOptions();invalidateRect(canvasViewport());}catch(...){}};input->deferredCommit=commit;input->Change.connect(commit);input->blur=commit;input->accept=[this,commit]{commit();closeParameterRange();requestFocus();layoutToolOptions();};input->cancel=[this]{closeParameterRange();requestFocus();layoutToolOptions();};}

    auto fillButton=[&](const char32_t* caption,int width,std::function<void()> action){auto b=button(caption,[this,action]{action();saveBrushPreferences();layoutToolOptions();invalidate();});fillControls_.push_back({b,width});return b;};

    auto fillNumber=[&](bool gap){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->deferredNumeric=true;input->numericMounted=[this,gap]{return currentTools().fillTool&&( !gap || currentTools().fillOptions.gapClosing);};input->numericMinimum=gap?1:0;input->numericMaximum=gap?16:255;input->numericValue=[this,gap]{return double(gap?currentTools().fillOptions.gapThreshold:currentTools().fillOptions.tolerance);};addChild(input);fillControls_.push_back({input,34});auto commit=[this,input,gap]{try{std::size_t used=0;double value=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(value))return;const int next=int(std::floor(std::clamp(value,gap?1.0:0.0,gap?16.0:255.0)+.5));if(gap)currentTools().fillOptions.gapThreshold=next;else currentTools().fillOptions.tolerance=next;saveBrushPreferences();}catch(...){}layoutToolOptions();};input->deferredCommit=commit;input->Change.connect(commit);input->blur=commit;input->accept=[this,commit]{commit();closeParameterRange();requestFocus();};input->cancel=[this]{closeParameterRange();requestFocus();};input->focus=[this,input,gap]{openParameterRange(input,gap?1:0,gap?16:255);};return input;};

    fillButton(U"容差",28,[]{})->labelOnly=true;fillToleranceInput_=fillNumber(false);

    fillContiguousButton_=fillButton(U"连续",45,[this]{currentTools().fillOptions.contiguous=!currentTools().fillOptions.contiguous;});

    fillGapButton_=fillButton(U"智能闭合",65,[this]{currentTools().fillOptions.gapClosing=!currentTools().fillOptions.gapClosing;});fillGapInput_=fillNumber(true);

    for(auto b:{fillContiguousButton_,fillGapButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}

    fillConnectivityButton_=fillButton(U"4 方连接",57,[this]{currentTools().fillOptions.connectivity=currentTools().fillOptions.connectivity==4?8:4;currentTools().wandOptions.connectivity=currentTools().fillOptions.connectivity;});

    fillReferenceButton_=fillButton(U"",15,[this]{showFillSettings(fillReferenceButton_);});fillReferenceButton_->icon="properties";fillReferenceButton_->iconSkin=&toolIcons_;auto pivotButton=option(U"",15,[this]{showSelectionPivotPopup();});pivotButton->icon="selection-pivot-preset-4";pivotButton->iconSkin=&toolIcons_;pivotButton->iconGroupCount=1;

    auto shrinkButton=option(U"",15,[this]{shrinkSelectionToContent();});shrinkButton->icon="selection-shrink";shrinkButton->iconSkin=&toolIcons_;shrinkButton->iconGroupCount=1;shrinkButton->hover=[this]{status_=U"收缩选区至内容";invalidate();};

    selectionRoundedButton_=option(U"圆角",43,[this]{currentTools().selectionRounded=!currentTools().selectionRounded;saveSelectionPreferences();layoutToolOptions();invalidate();});selectionRoundedButton_->iconSkin=&toolIcons_;selectionRoundedButton_->bareIconWithCaption=true;

    selectionCornerRadiusInput_=new PixelEntry(font_,skin_);selectionCornerRadiusInput_->numeric=true;selectionCornerRadiusInput_->suffix=U"px";addChild(selectionCornerRadiusInput_);selectionControls_.push_back({selectionCornerRadiusInput_,44});auto radiusCommit=[this]{try{std::size_t used=0;double value=std::stod(selectionCornerRadiusInput_->text(),&used);if(used==selectionCornerRadiusInput_->text().size() && std::isfinite(value)){currentTools().selectionCornerRadius=int(std::floor(std::clamp(value,0.0,256.0)+.5));saveSelectionPreferences();}}catch(...){}layoutToolOptions();};selectionCornerRadiusInput_->Change.connect(radiusCommit);selectionCornerRadiusInput_->blur=radiusCommit;selectionCornerRadiusInput_->accept=[this,radiusCommit]{radiusCommit();requestFocus();};selectionCornerRadiusInput_->cancel=[this]{requestFocus();layoutToolOptions();};

  }

void Editor::showFillSettings(PixelButton* trigger,bool gradient){

    PixelMenu menu(skin_);const bool wand=trigger==wandReferenceButton_;const bool visible=gradient?currentTools().gradientOptions.visibleLayers:wand?currentTools().wandOptions.visibleLayers:currentTools().fillOptions.visibleLayers;const int connectivity=gradient?currentTools().gradientOptions.connectivity:wand?currentTools().wandOptions.connectivity:currentTools().fillOptions.connectivity;

    auto heading=[&](const char32_t* text){auto item=new PixelMenuItem(font_,skin_,text);item->setEnabled(false);menu.addChild(item);};

    heading(U"\u53c2\u8003\u56fe\u5c42");

    for(int i=0;i<2;++i){auto item=new PixelMenuItem(font_,skin_,i?U"\u53ef\u89c1\u56fe\u5c42":U"\u5f53\u524d\u56fe\u5c42");item->checked=[visible,i]{return visible==(i!=0);};item->Click.connect([this,i,gradient]{currentTools().fillOptions.visibleLayers=currentTools().wandOptions.visibleLayers=currentTools().gradientOptions.visibleLayers=i!=0;if(gradient)gradientChanged();else{saveBrushPreferences();refresh();}});menu.addChild(item);}

    menu.addChild(new PixelMenuSeparator(skin_));heading(U"\u8fde\u63a5\u65b9\u5f0f");

    for(int n:{4,8}){auto item=new PixelMenuItem(font_,skin_,unicodeText(std::to_string(n))+U" \u65b9\u8fde\u63a5");item->checked=[connectivity,n]{return connectivity==n;};item->Click.connect([this,n,gradient]{currentTools().fillOptions.connectivity=currentTools().wandOptions.connectivity=currentTools().gradientOptions.connectivity=n;if(gradient)gradientChanged();else{saveBrushPreferences();refresh();}});menu.addChild(item);}

    const auto at=trigger->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();

  }

void Editor::showGradientStopsMenu(bool verify){
    const bool samplingPendingAtOpen=gradientPending_;

    currentTools().gradientFreeform=true;if(currentTools().gradientStops.size()<2)currentTools().gradientStops={{0,ink_},{1,currentDocument().palette().secondary}};

    ToolPropertyPopup popup(skin_,font_,U"自由色标");popup.setDisplay(display(),false);popup.setWantFocus(true);popup.setBounds(toolPopupBounds(gradientFreeformButton_,244,133));

    auto track=new GradientStopsTrack(toolIcons_);track->stops=&currentTools().gradientStops;track->selected=&gradientStop_;popup.place(track,{6,DialogLayout::bodyTop,232,22});

    auto position=new PixelEntry(font_,skin_);position->numeric=true;position->suffix=U"%";popup.place(position,{6,55,60,textControlHeight});

    auto color=new PixelEntry(font_,skin_);popup.place(color,{68,55,96,textControlHeight});
    // GradientStopsEditor.tsx: selected-stop filled ColorValueControl.
    bool closingStops=false;
    std::unique_ptr<ColorEditorPopup> stopColorEditor;
    gradientStopsFocusOwner_=&popup;
    struct ResetStopsFocus {std::function<void()> run;~ResetStopsFocus(){run();}} resetStopsFocus{[this]{gradientStopsFocusOwner_=nullptr;gradientStopsColorFocusOwner_=nullptr;}};
    PixelButton* colorValue=nullptr;
    colorValue=new PixelButton(font_,skin_,U"",[&,this]{
      if(stopColorEditor && stopColorEditor->isVisible()){stopColorEditor->closeWindow(nullptr);return;}
      if(!stopColorEditor){
        stopColorEditor=std::make_unique<ColorEditorPopup>(font_,skin_,toolIcons_,smoke_?assets_.parent_path()/"gradient-color-editor-smoke-size.txt":palettePreferencePath().parent_path()/"gradient-color-editor-size.txt");
        gradientStopsColorFocusOwner_=stopColorEditor.get();
        stopColorEditor->Close.connect([&](ui::CloseEvent&){if(!closingStops){popup.setClickBehavior(ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);popup.requestFocus();}});
      }
      std::vector<Pixel> colors;for(const auto& entry:currentDocument().palette().entries)if(entry.id)colors.push_back(entry.color);
      popup.setClickBehavior(ui::PopupWindow::ClickBehavior::DoNothingOnClick);
      stopColorEditor->open(colorValue->bounds(),bounds(),currentTools().gradientStops[gradientStop_].color,U"渐变色标",colors,[&,this](Pixel next){
        if(closingStops || currentTools().gradientStops.empty())return;
        gradientStop_=std::clamp(gradientStop_,0,int(currentTools().gradientStops.size())-1);
        currentTools().gradientStops[gradientStop_].color=next;colorValue->swatch=next;
        if(!color->hasFocus())color->setText(paletteHex(next));
        colorValue->invalidate();track->invalidate();gradientChanged();
      },[&,this](bool active){setColorEditorSampling(active,stopColorEditor.get());});
      stopColorEditor->canvasSamplingInput=[&,this](ui::Message* message){
        if(auto mouse=dynamic_cast<ui::MouseMessage*>(message);mouse&&!eyedropperGesture_.active()&&popup.bounds().contains(mouse->positionForDisplay(popup.display())))return false;
        return processColorEditorCanvasSampling(message);
      };
    });
    colorValue->colorRole=true;
    popup.place(colorValue,{166,55,72,textControlHeight});
    popup.Close.connect([&](ui::CloseEvent&){closingStops=true;if(stopColorEditor)stopColorEditor->closeWindow(nullptr);});

    auto sync=[&]{if(stopColorEditor && stopColorEditor->isVisible()){closingStops=true;stopColorEditor->closeWindow(nullptr);closingStops=false;}gradientStop_=std::clamp(gradientStop_,0,int(currentTools().gradientStops.size())-1);if(!position->hasFocus())position->setText(std::to_string(gradientRound(currentTools().gradientStops[gradientStop_].position*100)));if(!color->hasFocus())color->setText(paletteHex(currentTools().gradientStops[gradientStop_].color));colorValue->swatch=currentTools().gradientStops[gradientStop_].color;colorValue->invalidate();track->invalidate();};sync();

    track->changed=[&,this]{sync();gradientChanged();};
    track->activateColor=[&]{colorValue->Click();};

    position->Change.connect([&,this]{try{auto stop=currentTools().gradientStops[gradientStop_];const double next=std::stod(position->text())/100;if(!std::isfinite(next))return;const double previous=stop.position;stop.position=std::clamp(next,0.0,1.0);if(stop.position==0 || stop.position==1)for(int i=0;i<int(currentTools().gradientStops.size());++i)if(i!=gradientStop_ && currentTools().gradientStops[i].position==stop.position)currentTools().gradientStops[i].position=previous;currentTools().gradientStops[gradientStop_]=stop;sortGradientStops(stop);sync();}catch(...){} });

    color->Change.connect([&,this]{Pixel next;if(parsePaletteHex(color->text(),next)){currentTools().gradientStops[gradientStop_].color=next;gradientChanged();colorValue->swatch=next;colorValue->invalidate();track->invalidate();}});

    for(int index:{14,15,16,17}){auto source=static_cast<PixelButton*>(gradientControls_[index].first);auto action=new PixelButton(font_,skin_,source->caption,[&,source]{source->Click();sync();});popup.place(action,{6+(index-14)*58,77,56,textControlHeight});}

    auto close=new PixelButton(font_,skin_,U"关闭",[&]{popup.closeWindow(nullptr);});popup.place(close,{182,107,56,textControlHeight});

    ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{if(gradientPending_!=samplingPendingAtOpen || (samplingPendingAtOpen&&!currentDocument().gradientActive()))throw std::runtime_error("Opening gradient color windows cancelled pending gradient");if(track->parent()!=&popup || position->parent()!=&popup || color->parent()!=&popup)throw std::runtime_error("Gradient editor controls must belong to dialog");for(auto widget:{static_cast<ui::Widget*>(track),static_cast<ui::Widget*>(position),static_cast<ui::Widget*>(color),static_cast<ui::Widget*>(colorValue),static_cast<ui::Widget*>(close)}){const auto point=popup.display()->nativeWindow()->pointToScreen(widget->bounds().center());if(manager()->pickFromScreenPos(point)!=widget || !manager()->isWidgetClickable(widget))throw std::runtime_error("Property dialog click blocked: target="+std::to_string(widget==track?0:widget==position?1:widget==color?2:3)+" bounds="+std::to_string(widget->bounds().x)+","+std::to_string(widget->bounds().y)+" popup="+std::to_string(popup.bounds().x)+","+std::to_string(popup.bounds().y)+" picked="+std::to_string(manager()->pickFromScreenPos(point)==&popup)+" clickable="+std::to_string(manager()->isWidgetClickable(widget)));ui::MouseMessage down(ui::kMouseDownMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,widget->bounds().center());down.setDisplay(popup.display());down.setFromFilter(true);if(manager()->sendMessage(&down))throw std::runtime_error("Background global filter swallowed popup click");}const auto beforeColor=currentTools().gradientStops[gradientStop_].color;const auto beforeHistory=currentDocument().historySize();const auto beforePixels=currentDocument().pixels();
      if(std::wstring(GetCommandLineW()).find(L"--linked-gradient-cancel-only")!=std::wstring::npos){
       const auto savedStops=currentTools().gradientStops;const int savedStop=gradientStop_;const auto h=currentDocument().historyPosition();const auto pixels=currentDocument().pixels();
       currentTools().gradientStops={{0,0xff123456},{.5,0xffabcdef},{1,0xff778899}};gradientStop_=1;
       const auto r=track->bounds();const int startX=r.x+5*uiScale+(r.w-11*uiScale)/2;const int y=r.y+10*uiScale;const int toX=startX+24*uiScale;
       auto pointer=[&](ui::MessageType type,int x,int py,ui::MouseButton button){ui::MouseMessage event(type,os::PointerType::Mouse,button,ui::kKeyNoneModifier,{x,py});event.setDisplay(popup.display());track->onProcessMessage(&event);if(type==ui::kMouseDownMessage)track->enableFlags(ui::HAS_CAPTURE);};
       auto unchanged=[&]{return currentTools().gradientStops.size()==3&&currentTools().gradientStops[1].position==.5;};
       pointer(ui::kMouseDownMessage,startX,y,ui::kButtonLeft);pointer(ui::kMouseMoveMessage,toX,y,ui::kButtonNone);pointer(ui::kMouseUpMessage,toX,y,ui::kButtonLeft);
       if(!unchanged()||track->hasCapture())throw std::runtime_error("Gradient late unpressed move after click must cancel without changing stop");
       pointer(ui::kMouseDownMessage,startX,y,ui::kButtonLeft);pointer(ui::kMouseMoveMessage,toX,y,ui::kButtonLeft);const double moved=currentTools().gradientStops[1].position;
       if(!(moved>.5))throw std::runtime_error("Gradient pressed move still updates selected stop");
       pointer(ui::kMouseMoveMessage,toX,r.y2()+25*uiScale,ui::kButtonLeft);pointer(ui::kMouseMoveMessage,toX+30*uiScale,y,ui::kButtonNone);pointer(ui::kMouseUpMessage,toX+30*uiScale,y,ui::kButtonLeft);
       if(currentTools().gradientStops.size()!=3||currentTools().gradientStops[1].position!=moved||track->hasCapture())throw std::runtime_error("Gradient unpressed move clears pending deletion while preserving already moved value");
       pointer(ui::kMouseMoveMessage,startX,y,ui::kButtonLeft);if(currentTools().gradientStops[1].position!=moved)throw std::runtime_error("Gradient cancelled drag must ignore later pressed move");
       pointer(ui::kMouseDownMessage,toX,y,ui::kButtonLeft);pointer(ui::kMouseMoveMessage,toX,r.y2()+25*uiScale,ui::kButtonLeft);pointer(ui::kMouseUpMessage,toX,r.y2()+25*uiScale,ui::kButtonLeft);
       if(currentTools().gradientStops.size()!=2||track->hasCapture()||currentDocument().historyPosition()!=h||currentDocument().pixels()!=pixels)throw std::runtime_error("Gradient normal pressed removal keeps two endpoints and document pixels history unchanged");
       currentTools().gradientStops=savedStops;gradientStop_=savedStop;track->changed();track->invalidate();
      }
      const auto stopsBeforeDouble=currentTools().gradientStops;const int originalStop=gradientStop_;
      auto doubleStop=[&](int index,ui::MouseButton button){const auto r=track->bounds();const int x=r.x+gradientRound(currentTools().gradientStops[index].position*(r.w/uiScale-11))*uiScale+5*uiScale;ui::MouseMessage event(ui::kDoubleClickMessage,os::PointerType::Mouse,button,ui::kKeyNoneModifier,{x,r.y+10*uiScale});event.setDisplay(popup.display());track->onProcessMessage(&event);};
      const int activatedStop=gradientStop_==0?int(currentTools().gradientStops.size())-1:0;
      doubleStop(activatedStop,ui::kButtonRight);
      if(stopColorEditor && stopColorEditor->isVisible())throw std::runtime_error("Gradient right double click opened color editor");
      doubleStop(activatedStop,ui::kButtonLeft);
      if(!stopColorEditor || !stopColorEditor->isVisible() || gradientStop_!=activatedStop || stopColorEditor->color()!=currentTools().gradientStops[activatedStop].color || !std::equal(currentTools().gradientStops.begin(),currentTools().gradientStops.end(),stopsBeforeDouble.begin(),stopsBeforeDouble.end(),[](const auto& a,const auto& b){return a.position==b.position&&a.color==b.color;}) || track->hasCapture())throw std::runtime_error("Gradient stop double click selects exact stop and opens owned color editor without mutation");
      doubleStop(originalStop,ui::kButtonLeft);
      if(gradientStop_!=originalStop || !stopColorEditor->isVisible() || stopColorEditor->color()!=beforeColor)throw std::runtime_error("Gradient double click switches owned editor to selected stop");
      {ui::MouseMessage blank(ui::kDoubleClickMessage,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,{track->bounds().center().x,track->bounds().y});blank.setDisplay(popup.display());track->onProcessMessage(&blank);}
      if(gradientStop_!=originalStop || currentTools().gradientStops.size()!=stopsBeforeDouble.size() || !stopColorEditor->isVisible())throw std::runtime_error("Gradient empty ramp double click leaves stop and editor unchanged");
      if(!stopColorEditor || !stopColorEditor->isVisible())throw std::runtime_error("Gradient selected color editor entry");
      stopColorEditor->sampled(0x40112233);
      if(currentTools().gradientStops[gradientStop_].color!=0x40112233 || colorValue->swatch!=0x40112233 || color->text()!=paletteHex(0x40112233))throw std::runtime_error("Gradient selected color live alpha/HEX sync");
      if(currentDocument().historySize()!=beforeHistory || currentDocument().pixels()!=beforePixels)throw std::runtime_error("Gradient color editor changed committed pixels/history");
      if(gradientPending_!=samplingPendingAtOpen)throw std::runtime_error("Gradient popup lost pending transaction before sampling");
      const bool pendingBefore=gradientPending_;const auto primaryBefore=currentDocument().palette().primary,secondaryBefore=currentDocument().palette().secondary;
      const bool gradientToolBefore=currentTools().gradientTool;
      stopColorEditor->testSampling();
      if(!colorEditorSampling_||colorEditorSamplingTarget_!=stopColorEditor.get()||!currentTools().eyedropperTool||gradientPending_!=pendingBefore)throw std::runtime_error("Gradient stop sampling begins preserving transaction");
      std::optional<gfx::Point> samplePoint;
      const auto viewport=canvasViewport();
      for(int y=viewport.y+1;y<viewport.y2()&&!samplePoint;y+=std::max(1,viewport.h/12))for(int x=viewport.x+1;x<viewport.x2();x+=std::max(1,viewport.w/12)){
        gfx::Point at(x,y);if(!popup.bounds().contains(at)&&!stopColorEditor->bounds().contains(at)&&canvasDocumentContains(at)){samplePoint=at;break;}
      }
      if(!samplePoint)throw std::runtime_error("Gradient sampling fixture needs visible canvas outside popups");
      auto sampleMouse=[&](ui::MessageType type){ui::MouseMessage event(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,*samplePoint);event.setDisplay(display());event.setFromFilter(true);return stopColorEditor->onProcessMessage(&event);};
      const auto pixel=transformCanvasPoint(*samplePoint);const auto expected=sampleEyedropper(currentDocument().timeline(),currentDocument().frame().id,currentDocument().layer().id,currentDocument().width(),currentDocument().height(),int(std::floor(pixel.x)),int(std::floor(pixel.y)),currentTools().eyedropperSource);
      if(!sampleMouse(ui::kMouseDownMessage)||currentTools().gradientStops[gradientStop_].color!=expected)throw std::runtime_error("Gradient stop samples canvas RGBA");
      sampleMouse(ui::kMouseMoveMessage);sampleMouse(ui::kMouseUpMessage);
      if(colorEditorSampling_||colorEditorSamplingTarget_||eyedropperGesture_.active()||currentTools().gradientTool!=gradientToolBefore||gradientPending_!=pendingBefore||currentDocument().palette().primary!=primaryBefore||currentDocument().palette().secondary!=secondaryBefore||currentDocument().historySize()!=beforeHistory||currentDocument().pixels()!=beforePixels)throw std::runtime_error("Gradient sample release restores tool without role/history/pixel changes");
      stopColorEditor->testSampling();ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);stopColorEditor->onProcessMessage(&escape);
      if(colorEditorSampling_||colorEditorSamplingTarget_||!stopColorEditor->isVisible()||gradientPending_!=pendingBefore)throw std::runtime_error("Gradient sampling Escape ends only sample");
      stopColorEditor->sampled(beforeColor);stopColorEditor->closeWindow(nullptr);
      colorValue->Click();if(!stopColorEditor->isVisible())throw std::runtime_error("Gradient color editor reopen");
      stopColorEditor->testSampling();
      timer.stop();popup.closeWindow(nullptr);
      if(colorEditorSampling_||colorEditorSamplingTarget_||eyedropperGesture_.active())throw std::runtime_error("Gradient parent close left sampling state");
      if(stopColorEditor->isVisible())throw std::runtime_error("Gradient parent close left color editor open");
    });timer.start();}

    popup.openWindowInForeground();closingStops=true;if(stopColorEditor)stopColorEditor->closeWindow(nullptr);requestFocus();gradientChanged();if(verify&&(gradientPending_!=samplingPendingAtOpen || (samplingPendingAtOpen&&!currentDocument().gradientActive())))throw std::runtime_error("Closing gradient color windows cancelled pending gradient");

  }

void Editor::showFillTexturePopup(bool verify){

    ToolPropertyPopup popup(skin_,font_,U"填充纹理");popup.setDisplay(display(),false);popup.setWantFocus(true);popup.setBounds(toolPopupBounds(fillTextureButton_,150,125));

    auto range=new PixelSlider(font_,skin_);range->minimum=1;range->maximum=16;range->value=currentTools().fillPattern.textureScale;range->percentage=false;popup.place(range,{6,99,138,textControlHeight});range->setVisible(currentTools().fillPattern.texture!=FillTexture::Solid);

    range->changed=[this](int value){currentTools().fillPattern.textureScale=value;saveBrushPreferences();refresh();};

    std::array<PixelButton*,4> choices{};const char32_t* names[]{U"纯色",U"裂纹",U"木纹",U"颗粒"};

    for(int i=0;i<4;++i){auto choice=new PixelButton(font_,skin_,names[i],[&,i]{currentTools().fillPattern.texture=FillTexture(i);range->setVisible(i!=0);for(int j=0;j<4;++j){choices[j]->active=j==i;choices[j]->invalidate();}saveBrushPreferences();refresh();});choices[i]=choice;choice->active=int(currentTools().fillPattern.texture)==i;popup.place(choice,{6+(i%2)*70,DialogLayout::bodyTop+(i/2)*22,68,textControlHeight});}

    auto close=new PixelButton(font_,skin_,U"关闭",[&]{popup.closeWindow(nullptr);});popup.place(close,{6,73,138,textControlHeight});

    ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{if(range->parent()!=&popup || fillTextureScale_->isVisible())throw std::runtime_error("Texture scale must stay inside popup");timer.stop();popup.closeWindow(nullptr);});timer.start();}

    popup.openWindowInForeground();requestFocus();

  }

void Editor::createGradientOptions(){

    auto control=[&](const char32_t* name,int width,std::function<void()> action){auto b=button(name,[this,action]{action();gradientChanged();});gradientControls_.push_back({b,width});return b;};

    gradientType_=control(U"线性",47,[this]{currentTools().gradientRadial=false;gradientSpec_.geometry.reset();gradientGeometry_={};});gradientType_->caption.clear();gradientType_->iconSkin=&toolIcons_;gradientType_->icon="gradient-linear";gradientType_->iconGroupCount=2;

    gradientRadialButton_=button(U"",[this]{currentTools().gradientRadial=true;gradientSpec_.geometry.reset();gradientGeometry_={};gradientChanged();});gradientRadialButton_->iconSkin=&toolIcons_;gradientRadialButton_->icon="gradient-radial";gradientRadialButton_->iconGroupCount=2;gradientRadialButton_->iconGroupIndex=1;

    control(U"容差",28,[]{})->labelOnly=true;

    gradientTolerance_=new PixelEntry(font_,skin_);gradientTolerance_->numeric=true;addChild(gradientTolerance_);gradientControls_.push_back({gradientTolerance_,32});auto tolerance=[this]{try{std::size_t used=0;const auto n=std::stod(gradientTolerance_->text(),&used);if(used==gradientTolerance_->text().size() && std::isfinite(n))currentTools().gradientOptions.tolerance=gradientRound(std::clamp(n,0.0,255.0));}catch(...){}gradientChanged();};gradientTolerance_->Change.connect(tolerance);gradientTolerance_->blur=tolerance;gradientTolerance_->accept=[this,tolerance]{tolerance();requestFocus();};

    gradientContiguous_=control(U"连续",45,[this]{currentTools().gradientOptions.contiguous=!currentTools().gradientOptions.contiguous;});gradientContiguous_->iconSkin=&toolIcons_;gradientContiguous_->bareIconWithCaption=true;

    gradientReference_=control(U"",15,[this]{showFillSettings(gradientReference_,true);});gradientReference_->icon="properties";gradientReference_->iconSkin=&toolIcons_;

    gradientConnectivity_=control(U"4 方连接",57,[this]{currentTools().fillOptions.connectivity=currentTools().wandOptions.connectivity=currentTools().gradientOptions.connectivity=currentTools().gradientOptions.connectivity==4?8:4;});

    gradientDither_=control(U"无抖动",92,[this]{PixelMenu menu(skin_);const char32_t* names[]{U"无抖动",U"Bayer 2×2",U"Bayer 4×4",U"Bayer 8×8",U"棋盘",U"对角线",U"反向对角线",U"水平线",U"垂直线"};for(int i=0;i<9;++i){auto item=new PixelMenuItem(font_,skin_,names[i]);item->checked=[this,i]{return currentTools().gradientDither==i;};item->Click.connect([this,i]{currentTools().gradientDither=i;gradientChanged();});menu.addChild(item);}menu.showPopup(gfx::Point(gradientDither_->bounds().x,gradientDither_->bounds().y2()),display());});gradientDither_->iconSkin=&toolIcons_;gradientDither_->icon="dither";gradientDither_->iconWithCaption=true;

    gradientFreeformButton_=control(U"自由色标",65,[this]{showGradientStopsMenu();});gradientFreeformButton_->iconSkin=&toolIcons_;gradientFreeformButton_->bareIconWithCaption=false;

    gradientMode_=control(U"即时应用",65,[this]{currentTools().gradientConfirm=!currentTools().gradientConfirm;});

    control(U"应用",40,[this]{applyGradientGesture();});control(U"取消",40,[this]{cancelGradientGesture();});

    control(U"色标",40,[this]{PixelMenu menu(skin_);for(int i=0;i<int(currentTools().gradientStops.size());++i){auto item=new PixelMenuItem(font_,skin_,unicodeText(std::to_string(gradientRound(currentTools().gradientStops[i].position*100)))+U"% "+unicodeText(paletteHex(currentTools().gradientStops[i].color)));item->checked=[this,i]{return gradientStop_==i;};item->Click.connect([this,i]{gradientStop_=i;layoutToolOptions();invalidate();});menu.addChild(item);}auto anchor=gradientControls_[11].first->bounds();menu.showPopup(gfx::Point(anchor.x,anchor.y2()),display());});

    gradientStopPosition_=new PixelEntry(font_,skin_);gradientStopPosition_->numeric=true;gradientStopPosition_->suffix=U"%";addChild(gradientStopPosition_);gradientControls_.push_back({gradientStopPosition_,48});auto position=[this]{if(currentTools().gradientStops.empty())return;try{std::size_t used=0;const auto n=std::stod(gradientStopPosition_->text(),&used);if(used!=gradientStopPosition_->text().size() || !std::isfinite(n))return;auto& stop=currentTools().gradientStops[gradientStop_];const double old=stop.position,next=std::clamp(n/100,0.0,1.0);if(next!=old && (next==0 || next==1))for(int i=0;i<int(currentTools().gradientStops.size());++i)if(i!=gradientStop_ && currentTools().gradientStops[i].position==next)currentTools().gradientStops[i].position=old;stop.position=next;sortGradientStops(stop);}catch(...){} };gradientStopPosition_->Change.connect(position);gradientStopPosition_->blur=position;gradientStopPosition_->accept=[this,position]{position();requestFocus();};

    gradientStopColor_=new PixelEntry(font_,skin_);addChild(gradientStopColor_);gradientControls_.push_back({gradientStopColor_,80});auto color=[this]{if(currentTools().gradientStops.empty())return;Pixel next;if(parsePaletteHex(gradientStopColor_->text(),next)){currentTools().gradientStops[gradientStop_].color=next;gradientChanged();}};gradientStopColor_->Change.connect(color);gradientStopColor_->blur=color;gradientStopColor_->accept=[this,color]{color();requestFocus();};

    control(U"添加",40,[this]{addGradientStop();});control(U"删除",40,[this]{if(currentTools().gradientStops.size()>2){currentTools().gradientStops.erase(currentTools().gradientStops.begin()+gradientStop_);gradientStop_=std::max(0,gradientStop_-1);}});

    control(U"反转",40,[this]{for(auto& s:currentTools().gradientStops)s.position=1-s.position;std::reverse(currentTools().gradientStops.begin(),currentTools().gradientStops.end());gradientStop_=int(currentTools().gradientStops.size())-1-gradientStop_;});

    control(U"重置",40,[this]{currentTools().gradientStops={{0,ink_},{1,currentDocument().palette().secondary}};gradientStop_=0;});auto track=new GradientStopsTrack(toolIcons_);track->stops=&currentTools().gradientStops;track->selected=&gradientStop_;track->changed=[this]{gradientChanged();};addChild(track);gradientControls_.push_back({track,180});

  }

void Editor::connectLegacyPropertyRanges(){

    auto bind=[this](PixelEntry* entry,int minimum,int maximum){entry->focus=[this,entry,minimum,maximum]{showPropertyRange(entry,minimum,maximum);};};

    bind(wandToleranceInput_,0,255);bind(wandGapInput_,1,16);bind(gradientTolerance_,0,255);bind(selectionBrushAngleInput_,-180,180);

  }

void Editor::createShapeOptions(){drawingAnchorButton_=button(U"",[this]{currentView().drawFromCanvasCenter=!currentView().drawFromCanvasCenter;saveBrushPreferences();refresh();});drawingAnchorButton_->icon="draw-with-anchor";drawingAnchorButton_->iconSkin=&toolIcons_;drawingAnchorButton_->hover=[this]{status_=U"从绘图锚点绘制";invalidate();};drawingAnchorPresetButton_=button(U"",[this]{showDrawingAnchorPopup();});drawingAnchorPresetButton_->icon="anchor-preset-center";drawingAnchorPresetButton_->iconSkin=&toolIcons_;curveAnchorInput_=new PixelEntry(font_,skin_);addChild(curveAnchorInput_);curveAnchorInput_->numeric=true;curveAnchorInput_->suffix=U"控制点";curveAnchorInput_->setVisible(false);curveAnchorInput_->Change.connect([this]{try{currentTools().curveAnchorCount=std::clamp(std::stoi(curveAnchorInput_->text()),1,8);saveBrushPreferences();}catch(...){} });curveAnchorInput_->focus=[this]{showPropertyRange(curveAnchorInput_,1,8);};auto option=[&](const char32_t* text,int width,std::function<void()> action){auto b=button(text,[this,action]{action();saveBrushPreferences();layoutToolOptions();invalidate();});shapeControls_.push_back({b,width});return b;};shapeModeButton_=option(U"矩形填充",76,[this]{showToolGroup((currentTools().shapeKind==ShapeKind::Line||currentTools().shapeKind==ShapeKind::Curve)?5:4);});shapeModeButton_->iconSkin=&toolIcons_;shapeModeButton_->iconWithCaption=true;shapeRoundedButton_=option(U"圆角",45,[this]{currentTools().shapeRounded=!currentTools().shapeRounded;});shapeRatioButton_=option(U"固定比例",65,[this]{currentTools().shapeRatio=!currentTools().shapeRatio;});for(auto b:{shapeRoundedButton_,shapeRatioButton_}){b->iconSkin=&toolIcons_;b->bareIconWithCaption=true;}

    auto number=[&](int field,const char32_t* suffix,int width){auto input=new PixelEntry(font_,skin_);input->numeric=true;input->suffix=suffix;addChild(input);shapeControls_.push_back({input,width});auto commit=[this,input,field]{try{std::size_t used=0;const auto value=std::stod(input->text(),&used);if(used!=input->text().size() || !std::isfinite(value))return;if(field==0)currentTools().shapeRadius=gradientRound(std::clamp(value,0.0,256.0));else (field==1?currentTools().shapeRatioWidth:currentTools().shapeRatioHeight)=std::floor(std::clamp(value,.1,100.0)*10+.5)/10;saveBrushPreferences();layoutToolOptions();invalidate();}catch(...){} };input->Change.connect(commit);input->blur=commit;input->accept=[this,commit]{commit();requestFocus();};return input;};shapeRadiusInput_=number(0,U"px",48);shapeRatioWidthInput_=number(1,U"",38);shapeRatioHeightInput_=number(2,U"",38);auto swap=option(U"",19,[this]{std::swap(currentTools().shapeRatioWidth,currentTools().shapeRatioHeight);});swap->iconSkin=&toolIcons_;swap->icon="swap";

  }

void Editor::migratePropertyDropdowns() {

    auto* imageModeDropdown=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(imageModeDropdown);imagePaintModeDropdown_=imageModeDropdown;addChild(imagePaintModeDropdown_);imagePaintModeDropdown_->setOptions({U"油漆笔刷",U"图案与来源对齐",U"图案与目标对齐"});imagePaintModeDropdown_->prepareOptions=[this]{imagePaintModeDropdown_->setSelectedIndex(int(currentTools().brushProfiles[currentTools().eraser?1:0].imagePaintMode));};imagePaintModeDropdown_->changed=[this](int mode){if(mode<0||mode>2||currentDocument().active())return;currentTools().brushProfiles[currentTools().eraser?1:0].imagePaintMode=PatternPaintMode(mode);saveBrushPreferences();refresh();};propertyDropdowns_.push_back(imagePaintModeDropdown_);toolControls_.push_back({imagePaintModeDropdown_,116});

    auto convert=[this](PixelButton*& old,std::vector<std::u32string> names,std::function<int()> current,std::function<void(int)> choose) {

      auto next=new DialogBackground<PixelDropdown>(font_,skin_);configureDialogBackground(next);addChild(next);

      next->setOptions(std::move(names));next->setSelectedIndex(current());

      next->prepareOptions=[next,current]{next->setSelectedIndex(current());};propertyDropdowns_.push_back(next);

      next->changed=[this,choose](int index){choose(index);saveBrushPreferences();refresh();};

      auto replace=[&](auto& controls){for(auto& c:controls)if(c.first==old){c.first=next;c.second=std::max(c.second,font_.measure(next->caption)+25);}};

      replace(toolControls_);replace(selectionControls_);replace(fillControls_);replace(gradientControls_);replace(shapeControls_);

      auto previous=old;old=next;removeChild(previous);delete previous;

    };

    convert(selectionAlgorithmButton_,{U"\u5feb\u901f\u65cb\u8f6c",U"RotSprite"},[this]{return currentTools().selectionRotSprite;},[this](int i){currentTools().selectionRotSprite=i!=0;if(auto target=currentDocument().floatingTransform())currentDocument().transformFloatingPaste(*target,currentTools().selectionRotSprite);});

    convert(gradientDither_,{U"\u65e0\u6296\u52a8",U"Bayer 2\u00d72",U"Bayer 4\u00d74",U"Bayer 8\u00d78",U"\u68cb\u76d8",U"\u5bf9\u89d2\u7ebf",U"\u53cd\u5411\u5bf9\u89d2\u7ebf",U"\u6c34\u5e73\u7ebf",U"\u5782\u76f4\u7ebf"},[this]{return currentTools().gradientDither;},[this](int i){currentTools().gradientDither=i;gradientChanged();});

    convert(eyedropperSourceButton_,{U"\u5408\u6210\u56fe\u50cf",U"\u5f53\u524d\u56fe\u5c42"},[this]{return currentTools().eyedropperSource==EyedropperSource::CurrentLayer;},[this](int i){currentTools().eyedropperSource=i?EyedropperSource::CurrentLayer:EyedropperSource::Composite;try{if(!smoke_){const auto path=palettePreferencePath().parent_path()/"eyedropper-source.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);out<<(i?"current-layer":"composite");}}catch(const std::exception& e){status_=U"\u5438\u7ba1\u8bbe\u7f6e\u4fdd\u5b58\u5931\u8d25:"+unicodeText(e.what());}});

  }

void Editor::initializePropertyEntryWidths() {

    // Reserve the full supported display range once, independently of edits.

    auto reserve=[](const auto& list){for(const auto& item:list)if(auto entry=dynamic_cast<PixelEntry*>(item.first))

      entry->setFixedContentWidth(std::max(item.second,entry->widthForValue(U"000")));};

    reserve(toolControls_);reserve(selectionControls_);reserve(fillControls_);reserve(gradientControls_);reserve(shapeControls_);

    auto fit=[](PixelEntry* entry,const char32_t* longest){if(entry)entry->setFixedContentWidth(entry->widthForValue(longest));};

    fit(brushSizeInput_,U"64");fit(brushOpacityInput_,U"100");

    fit(wandToleranceInput_,U"255");fit(wandGapInput_,U"16");fit(fillToleranceInput_,U"255");fit(fillGapInput_,U"16");

    fit(selectionBrushAngleInput_,U"-180");fit(gradientTolerance_,U"255");fit(gradientStopPosition_,U"100");fit(gradientStopColor_,U"#FFFFFFFF");

    fit(shapeRadiusInput_,U"256");fit(shapeRatioWidthInput_,U"99.9");fit(shapeRatioHeightInput_,U"99.9");

  }

int Editor::propertyControlWidth(ui::Widget* control,int width) const {

    const auto button=dynamic_cast<PixelButton*>(control);

    if(auto entry=dynamic_cast<PixelEntry*>(control))return entry->contentWidth();

    if(control==gradientType_)return 29;

    if(auto dropdown=dynamic_cast<PixelDropdown*>(control))return std::max(width,font_.measure(dropdown->caption)+25);

    return button && !button->icon.empty() && button->caption.empty()?propertyIconWidth:width;

  }

void Editor::placePropertyControl(ui::Widget* control,int x,int width) {

    const auto button=dynamic_cast<PixelButton*>(control);

    const int height=(!selectionControls_.empty() && control==selectionControls_[0].first) || (button && !button->icon.empty() && button->caption.empty())?propertyIconHeight:button && button->labelOnly?Layout::optionsHeight:textControlHeight;

    const auto next=uiPhysical(gfx::Rect(x,uiLogical(bounds()).y+optionsTop()+(Layout::optionsHeight-height)/2,propertyControlWidth(control,width),height));
    // Entries also refresh text/caret viewport after content and suffix changes.
    if(control->bounds()!=next || dynamic_cast<PixelEntry*>(control) || (smoke_ && _wgetenv(L"MOONSPRITE_TOOL_LAYOUT_REFERENCE")))control->setBounds(next);

  }

bool Editor::supportsToolSymmetry()const{return !(currentTools().fillTool&&currentTools().magicEraserTool) && !currentTools().liquifyTool && !currentTools().smoothTool && !currentTools().handTool && !currentTools().zoomTool && !currentTools().gradientTool && !currentTools().eyedropperTool;}

void Editor::layoutSymmetryOptions(){

    const auto rc=uiLogical(bounds());const auto layout=workspaceLayout(rc);

    int left=rc.x+layout.workX;

    auto include=[&](ui::Widget* control){if(!control->hasFlags(ui::HIDDEN))left=std::max(left,control->bounds().x2()/uiScale+uiGap);};

    for(const auto& c:toolControls_)if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),c.first)==symmetryButtons_.end())include(c.first);

    include(drawingAnchorButton_);include(drawingAnchorPresetButton_);
    for(const auto* controls:{&selectionControls_,&fillControls_,&gradientControls_,&shapeControls_,&liquifyControls_,&airbrushControls_,&smoothControls_})for(const auto& c:*controls)include(c.first);

    const int right=commands_[3]->bounds().x/uiScale-uiGap;left=std::min(left,right-85);const bool show=supportsToolSymmetry();

    for(int i=0;i<6;++i){auto b=symmetryButtons_[i];if(!b)continue;placePropertyControl(b,left+i*14,15);b->setVisible(show && left+85<=right);b->setEnabled(pending_==Pending::None && !currentDocument().active() && !selectionDragging_ && !symmetryDragging_);if(i<5)b->active=symmetryFlag(i);}

  }

void Editor::layoutToolRail() {
 struct AdvancedVisibility{Editor& e;~AdvancedVisibility(){e.applyAdvancedVisibility();}} advancedVisibility{*this};
 if(!railVerticalScrollBar_||!railHorizontalScrollBar_)return;const auto rc=uiLogical(clientBounds());const auto geometry=Layout::rail(rc,toolRailSide_,int(toolRail_.size()));const auto viewport=toDisplay(geometry.viewport);auto active=geometry.horizontal?railHorizontalScrollBar_:railVerticalScrollBar_;auto inactive=geometry.horizontal?railVerticalScrollBar_:railHorizontalScrollBar_;inactive->setVisible(false);railScrollBar_=active;
 const int page=geometry.page*uiScale,total=geometry.total*uiScale;railScrollPixels_=std::clamp(railScrollPixels_,0,std::max(0,total-page));
 for(std::size_t i=0;i<toolRail_.size();++i){auto b=toolRail_[i];auto box=geometry.viewport;box.w=Layout::toolSize;box.h=Layout::toolHeight;if(geometry.horizontal)box.x+=int(i)*geometry.step;else box.y+=int(i)*geometry.step;const auto next=toDisplay(box).offset(geometry.horizontal?-railScrollPixels_:0,geometry.horizontal?0:-railScrollPixels_);if(b->bounds()!=next || (smoke_ && _wgetenv(L"MOONSPRITE_TOOL_LAYOUT_REFERENCE")))b->setBounds(next);b->paletteViewport=[viewport]{return viewport;};b->setVisible(!homeOpen_&&viewport.intersects(b->bounds()));}
 active->setDockBounds(toDisplay(geometry.bar));active->configure(total,page,railScrollPixels_);active->wheelStep=geometry.step*uiScale;active->setVisible(!homeOpen_&&geometry.overflow);active->setEnabled(pending_==Pending::None);
}

void Editor::finishToolScrollLayout() {

    const auto rc=uiLogical(bounds());const auto l=workspaceLayout(rc);

    const int left=(rc.x+l.workX)*uiScale,right=commands_[3]->bounds().x-uiGap*uiScale-(supportsToolSymmetry()?(85+uiGap)*uiScale:0);

    const gfx::Rect viewport(left,(rc.y+optionsTop())*uiScale,std::max(uiScale,right-left),Layout::optionsHeight*uiScale);

    std::vector<ui::Widget*> controls;auto add=[&](ui::Widget* w){if(w && w->parent()==this && !w->hasFlags(ui::HIDDEN) && std::find(controls.begin(),controls.end(),w)==controls.end())controls.push_back(w);};

    add(drawingAnchorButton_);add(drawingAnchorPresetButton_);
    for(auto& c:toolControls_)if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),c.first)==symmetryButtons_.end())add(c.first);

    for(const auto* list:{&selectionControls_,&fillControls_,&gradientControls_,&shapeControls_,&liquifyControls_,&airbrushControls_,&smoothControls_})for(const auto& c:*list)add(c.first);

    for(auto w:selectionModeButtons_)if(!selectionControls_.empty() && !selectionControls_[0].first->hasFlags(ui::HIDDEN))add(w);

    for(const auto& c:sliceControls_)add(c.first);
    add(gradientRadialButton_);add(eyedropperSourceButton_);
    add(eyedropperForegroundButton_);add(eyedropperBackgroundButton_);add(eyedropperReplaceButton_);

    int end=left;for(auto w:controls)end=std::max(end,w->bounds().x2());const int total=end-left;

    toolRowScroll_=std::clamp(toolRowScroll_,0,std::max(0,total-viewport.w));

    for(auto w:controls){scrollViewports_[w]=viewport;if(toolRowScroll_!=0 || (smoke_ && _wgetenv(L"MOONSPRITE_TOOL_LAYOUT_REFERENCE"))){if(w->children().empty())w->setBounds(w->bounds().offset(-toolRowScroll_,0));else {w->setBoundsQuietly(w->bounds().offset(-toolRowScroll_,0));for(auto child:w->children())child->setBounds(child->bounds().offset(-toolRowScroll_,0));}}w->setVisible(viewport.intersects(w->bounds()));if(auto b=dynamic_cast<PixelButton*>(w))b->paletteViewport=[viewport]{return viewport;};if(auto entry=dynamic_cast<PixelEntry*>(w))entry->paletteViewport=[viewport]{return viewport;};}

    for(auto b:selectionModeButtons_)if(b)b->paletteViewport=[viewport]{return viewport;};

    int symmetryX=left;for(auto w:controls)if(!w->hasFlags(ui::HIDDEN))symmetryX=std::max(symmetryX,std::min(w->bounds().x2(),viewport.x2())+uiGap*uiScale);

    if(supportsToolSymmetry())for(int i=0;i<6;++i)if(symmetryButtons_[i]){auto b=symmetryButtons_[i];auto r=b->bounds();r.x=symmetryX+i*14*uiScale;b->setBounds(r);b->setVisible(symmetryX+85*uiScale<=commands_[3]->bounds().x-uiGap*uiScale);}

  }

void Editor::layoutToolOptions() {
    InteractionScope optionsScope(13,"tool-options-layout");
    // Entry::setText always rebuilds shaped character boxes, even for the
    // identical value. Resizing only changes placement; keep the existing
    // boxes/caret until the displayed model value actually changes.
    const bool textReference=smoke_ && _wgetenv(L"MOONSPRITE_TOOL_TEXT_REFERENCE");
    auto syncText=[&](PixelEntry* entry,const std::string& value){if(textReference || entry->text()!=value)entry->setText(value);};
    if(imagePaintModeDropdown_)imagePaintModeDropdown_->setVisible(false);
    // Eligible shape/selection branches place these same controls below.
    // Hiding first frees focus/capture and invalidates the occupied area.
    if(drawingAnchorButton_ && (!drawingAnchorEligible() || (smoke_ && _wgetenv(L"MOONSPRITE_ANCHOR_VISIBILITY_REFERENCE")))){drawingAnchorButton_->setVisible(false);drawingAnchorPresetButton_->setVisible(false);}

    ++brushFeedback_.toolOptionsLayouts_;

    struct Finish {Editor& editor;~Finish(){editor.layoutMoveOptions();editor.layoutSliceOptions();editor.finishToolScrollLayout();editor.applyAdvancedVisibility();editor.syncParameterRange();}} finish{*this};

    if(!currentDocument().selection()&&!currentDocument().floating())selectionPropertiesActive_=false;

    if(toolControls_.empty()) return;

    for(auto dropdown:propertyDropdowns_)if(dropdown->prepareOptions)dropdown->prepareOptions();

    for(int i=0;i<5;++i)if(symmetryButtons_[i])symmetryButtons_[i]->active=symmetryFlag(i);

    if(brushRange_ && (currentTools().handTool || pending_!=Pending::None)) brushRange_->setVisible(false);

    const auto rc=uiLogical(bounds());const auto optionsLayout=workspaceLayout(rc);const bool usable=pending_==Pending::None && !currentDocument().active();if(inkButton_){auto m=currentInkMode();inkButton_->icon=m==InkMode::Simple?"ink-simple":m==InkMode::CopyAlphaColor?"ink-copy-alpha-color":"ink-lock-alpha";inkButton_->setEnabled(usable);}if(toolRail_.size()>3){const char* icons[]{"selection-rectangle-normal","selection-ellipse-normal","selection-lasso-normal","selection-polygon-lasso-normal","selection-magic-normal","selection-brush-normal"};toolRail_[3]->icon=icons[currentTools().selectionKind];}

    if(homeButton_){homeButton_->setEnabled(usable);homeButton_->setVisible(true);}

    commands_[0]->setVisible(false);

    commands_[3]->setBounds(uiPhysical(gfx::Rect(rc.x+optionsLayout.workX+optionsLayout.workW-43-uiGap-43,rc.y+optionsTop(),43,textControlHeight)));

    commands_[4]->setBounds(uiPhysical(gfx::Rect(rc.x+optionsLayout.workX+optionsLayout.workW-43,rc.y+optionsTop(),43,textControlHeight)));

    if(eyedropperSourceButton_)eyedropperSourceButton_->setVisible(false);
    for(auto control:{eyedropperForegroundButton_,eyedropperBackgroundButton_,eyedropperReplaceButton_})if(control)control->setVisible(false);

    for(auto& control:fillControls_)control.first->setVisible(false);

    for(auto& control:gradientControls_)control.first->setVisible(false);

    if(gradientRadialButton_)gradientRadialButton_->setVisible(false);

    if(!currentTools().liquifyTool)for(auto& control:liquifyControls_)control.first->setVisible(false);
    for(auto& control:shapeControls_)control.first->setVisible(false);
    if(!currentTools().smoothTool)for(auto& c:smoothControls_)c.first->setVisible(false);
    if(currentTools().smoothTool){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);for(auto& c:airbrushControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);int x=rc.x+optionsLayout.workX;const auto& b=currentTools().smoothBrush;auto shape=static_cast<PixelButton*>(smoothControls_[0].first);shape->icon=b.shape==BrushShape::Round?"brush-round":b.shape==BrushShape::Square?"brush-square":"brush-line";auto size=static_cast<PixelEntry*>(smoothControls_[1].first);if(!size->hasFocus())syncText(size,std::to_string(b.size));if(!smoothAngleInput_->hasFocus())syncText(smoothAngleInput_,std::to_string(currentTools().smoothAngle));if(!smoothStrengthInput_->hasFocus())syncText(smoothStrengthInput_,std::to_string(currentTools().smoothStrength));for(auto& c:smoothControls_){const bool angular=c.first==smoothAngleInput_||c.first==smoothControls_[2].first;const bool visible=!angular||(b.size>1&&b.shape!=BrushShape::Round);c.first->setVisible(visible);c.first->setEnabled(usable&&!smoothDragging_);if(visible){placePropertyControl(c.first,x,c.second);x+=propertyControlWidth(c.first,c.second)+uiGap;}}for(auto button:symmetryButtons_)if(button)button->setVisible(false);if(dynamicsButton_){placePropertyControl(dynamicsButton_,x,15);dynamicsButton_->setVisible(true);dynamicsButton_->setEnabled(usable&&!smoothDragging_);}return;}
    layoutAirbrushOptions();
    if(currentTools().airbrushTool){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);layoutSymmetryOptions();return;}

    if(layoutLiquifyOptions())return;
    if(currentTools().moveTool||currentTools().textTool){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);layoutSymmetryOptions();return;}
    if(currentTools().zoomTool){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);layoutSymmetryOptions();return;}

    if(currentTools().eyedropperTool && eyedropperSourceButton_){
      for(auto& c:toolControls_)c.first->setVisible(false);
      for(auto& c:selectionControls_)c.first->setVisible(false);
      if(brushRange_)brushRange_->setVisible(false);
      int x=rc.x+optionsLayout.workX;
      const bool enabled=(usable || replaceSampling_>=0) && !eyedropperGesture_.active();
      auto place=[&](PixelButton* control,int width){placePropertyControl(control,x,width);control->setVisible(true);control->setEnabled(enabled);x+=propertyControlWidth(control,width)+uiGap;};
      eyedropperSourceButton_->caption=currentTools().eyedropperSource==EyedropperSource::Composite?U"合成图像":U"当前图层";
      place(eyedropperSourceButton_,76);x+=6-uiGap;
      eyedropperForegroundButton_->swatch=currentDocument().displayPalette().primary;
      eyedropperBackgroundButton_->swatch=currentDocument().displayPalette().secondary;
      const int colorWidth=font_.measure(U"#FFFFFFFF")+8;
      place(eyedropperForegroundButton_,colorWidth);place(eyedropperBackgroundButton_,colorWidth);x+=6-uiGap;
      place(eyedropperReplaceButton_,font_.measure(eyedropperReplaceButton_->caption)+24);
      layoutSymmetryOptions();return;
    }

    if(currentTools().fillTool&&currentTools().magicEraserTool){
      for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);
      if(!wandToleranceInput_->hasFocus())syncText(wandToleranceInput_,std::to_string(currentTools().wandOptions.tolerance));if(!wandGapInput_->hasFocus())syncText(wandGapInput_,std::to_string(currentTools().wandOptions.gapThreshold));wandContiguousButton_->icon=currentTools().magicEraserContiguous?"check":"checkboxUnchecked";wandGapButton_->icon=currentTools().wandOptions.gapClosing?"check":"checkboxUnchecked";
      int x=rc.x+optionsLayout.workX;for(int i:{1,2,3,4,5,7}){auto [w,width]=selectionControls_[i];const bool show=currentTools().magicEraserContiguous||(i!=4&&i!=5);w->setVisible(show);w->setEnabled(usable&&!magicEraserDragging_&&(i!=5||currentTools().wandOptions.gapClosing));if(show){placePropertyControl(w,x,width);x+=propertyControlWidth(w,width)+uiGap;}}
      if(toolRail_.size()>1)toolRail_[1]->icon="tool-magic-eraser-normal";layoutSymmetryOptions();return;
    }
    if(toolRail_.size()>1)toolRail_[1]->icon="tool-eraser-normal";
    if(curveAnchorInput_)curveAnchorInput_->setVisible(false);
    if(currentTools().shapeTool && !shapeControls_.empty()){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);const bool line=currentTools().shapeKind==ShapeKind::Line||currentTools().shapeKind==ShapeKind::Curve,rect=currentTools().shapeKind==ShapeKind::Rectangle || currentTools().shapeKind==ShapeKind::RectangleOutline,outline=currentTools().shapeKind==ShapeKind::RectangleOutline || currentTools().shapeKind==ShapeKind::EllipseOutline;int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);const char32_t* labels[]{U"直线",U"矩形描边",U"矩形填充",U"椭圆描边",U"椭圆填充",U"多边形填充",U"自由形状",U"曲线"};const char* icons[]{"shape-line-normal","shape-rectangle-normal","shape-rectangle-fill-normal","shape-ellipse-normal","shape-ellipse-fill-normal","shape-polygon-normal","shape-freeform-normal","shape-curve-normal"};shapeModeButton_->caption=labels[int(currentTools().shapeKind)];shapeModeButton_->icon=icons[int(currentTools().shapeKind)];if(toolRail_.size()>5){toolRail_[(currentTools().shapeKind==ShapeKind::Line||currentTools().shapeKind==ShapeKind::Curve)?5:4]->icon=icons[int(currentTools().shapeKind)];}shapeRoundedButton_->icon=currentTools().shapeRounded?"check":"checkboxUnchecked";shapeRatioButton_->icon=currentTools().shapeRatio?"check":"checkboxUnchecked";if(!shapeRadiusInput_->hasFocus())syncText(shapeRadiusInput_,std::to_string(currentTools().shapeRadius));for(auto field:{shapeRatioWidthInput_,shapeRatioHeightInput_})if(!field->hasFocus()){std::ostringstream text;text<<(field==shapeRatioWidthInput_?currentTools().shapeRatioWidth:currentTools().shapeRatioHeight);syncText(field,text.str());}

      auto place=[&](ui::Widget* w,int width){width=propertyControlWidth(w,width);placePropertyControl(w,x,width);w->setVisible(true);w->setEnabled(usable && !shapeDragging_);x+=width+uiGap;};shapeModeButton_->setVisible(false);if(line){brushShapeButton_->icon=currentTools().brushProfiles[0].shape==BrushShape::Round?"brush-round":currentTools().brushProfiles[0].shape==BrushShape::Square?"brush-square":"brush-line";place(brushShapeButton_,15);perfectPixelsButton_->icon=currentTools().brushProfiles[0].perfectPixels?"check":"checkboxUnchecked";place(perfectPixelsButton_,toolControls_[8].second);}if(currentTools().shapeKind!=ShapeKind::Polygon&&currentTools().shapeKind!=ShapeKind::Freeform)place(inkButton_,15);if(line || outline){if(!brushSizeInput_->hasFocus())syncText(brushSizeInput_,std::to_string(currentTools().brushProfiles[0].size));place(brushSizeInput_,toolControls_[3].second);}if(!line&&currentTools().shapeKind!=ShapeKind::Polygon&&currentTools().shapeKind!=ShapeKind::Freeform){if(rect){place(shapeRoundedButton_,45);if(currentTools().shapeRounded)place(shapeRadiusInput_,48);}place(shapeRatioButton_,65);if(currentTools().shapeRatio){place(shapeRatioWidthInput_,38);place(shapeRatioHeightInput_,38);place(shapeControls_[6].first,19);}}if(currentTools().shapeKind==ShapeKind::Curve){if(!curveAnchorInput_->hasFocus())syncText(curveAnchorInput_,std::to_string(currentTools().curveAnchorCount));place(curveAnchorInput_,48);}layoutDrawingAnchor(x);layoutSymmetryOptions();return;}

    if(currentTools().gradientTool && !gradientControls_.empty()){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);const int left=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);int total=0;for(int i=0;i<int(gradientControls_.size());++i)if((i<9 && i!=5) || (i>=9 && i<11 && gradientPending_))total+=propertyControlWidth(gradientControls_[i].first,gradientControls_[i].second)+uiGap;int x=left;

      gradientType_->caption.clear();gradientType_->icon="gradient-linear";gradientType_->active=!currentTools().gradientRadial;gradientRadialButton_->active=currentTools().gradientRadial;if(!gradientTolerance_->hasFocus())syncText(gradientTolerance_,std::to_string(currentTools().gradientOptions.tolerance));gradientContiguous_->icon=currentTools().gradientOptions.contiguous?"check":"checkboxUnchecked";gradientReference_->caption.clear();gradientConnectivity_->caption=currentTools().gradientOptions.connectivity==4?U"4 方连接":U"8 方连接";const char32_t* dithers[]{U"无抖动",U"Bayer 2×2",U"Bayer 4×4",U"Bayer 8×8",U"棋盘",U"对角线",U"反向对角线",U"水平线",U"垂直线"};gradientDither_->caption=dithers[currentTools().gradientDither];gradientFreeformButton_->icon.clear();gradientMode_->caption=currentTools().gradientConfirm?U"确认应用":U"即时应用";if(!currentTools().gradientStops.empty()){gradientStop_=std::clamp(gradientStop_,0,int(currentTools().gradientStops.size())-1);if(!gradientStopPosition_->hasFocus()){std::ostringstream text;text<<currentTools().gradientStops[gradientStop_].position*100;syncText(gradientStopPosition_,text.str());}if(!gradientStopColor_->hasFocus())syncText(gradientStopColor_,paletteHex(currentTools().gradientStops[gradientStop_].color));}

      for(int i=0;i<int(gradientControls_.size());++i){auto [w,width]=gradientControls_[i];width=propertyControlWidth(w,width);const bool applies=(i<9 && i!=5) || (i>=9 && i<11 && gradientPending_);w->setVisible(applies);w->setEnabled(pending_==Pending::None && !gradientDragging_);placePropertyControl(w,x,width);if(i==0){gradientType_->setBounds(uiPhysical(gfx::Rect(x,rc.y+optionsTop()+(Layout::optionsHeight-16)/2,15,16)));placePropertyControl(gradientRadialButton_,x+14,15);gradientRadialButton_->setVisible(!w->hasFlags(ui::HIDDEN));gradientRadialButton_->setEnabled(w->isEnabled());}if(applies)x+=width+uiGap;}if(toolRail_.size()>6)toolRail_[6]->icon="tool-gradient-normal";layoutSymmetryOptions();return;}

    if(toolRail_.size()>6)toolRail_[6]->icon=currentTools().rememberGradientTool?"tool-gradient-normal":"tool-fill-normal";

    if(currentTools().fillTool){for(auto& c:toolControls_)c.first->setVisible(false);for(auto& c:selectionControls_)c.first->setVisible(false);if(brushRange_)brushRange_->setVisible(false);int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);

      if(!fillToleranceInput_->hasFocus())syncText(fillToleranceInput_,std::to_string(currentTools().fillOptions.tolerance));if(!fillGapInput_->hasFocus())syncText(fillGapInput_,std::to_string(currentTools().fillOptions.gapThreshold));fillContiguousButton_->icon=currentTools().fillOptions.contiguous?"check":"checkboxUnchecked";fillGapButton_->icon=currentTools().fillOptions.gapClosing?"check":"checkboxUnchecked";fillConnectivityButton_->caption=currentTools().fillOptions.connectivity==4?U"4 方连接":U"8 方连接";fillReferenceButton_->caption.clear();

      const char32_t* textureNames[]{U"纯色",U"裂纹",U"木纹",U"颗粒"};fillTextureButton_->caption=textureNames[int(currentTools().fillPattern.texture)];fillImageButton_->active=!currentTools().fillPattern.brushes.empty();if(!fillTextureScale_->hasFocus())syncText(fillTextureScale_,std::to_string(currentTools().fillPattern.textureScale));

      for(std::size_t i=0;i<fillControls_.size();++i){auto [control,width]=fillControls_[i];width=propertyControlWidth(control,width);const bool show=control!=fillTextureScale_ && i!=5 && (currentTools().fillOptions.contiguous || (i!=3 && i!=4));control->setVisible(show);control->setEnabled(usable && !fillDragging_ && (i!=4 || currentTools().fillOptions.gapClosing));placePropertyControl(control,x,width);if(show)x+=width+uiGap;}layoutSymmetryOptions();return;}

    if(currentTools().selectionTool){if(brushRange_ && currentTools().selectionKind!=5)brushRange_->setVisible(false);for(auto& c:toolControls_)c.first->setVisible(false);int x=rc.x+optionsLayout.workX,right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0);

      if(currentTools().selectionKind==5 && !selectionPropertiesActive_){const auto& brush=currentTools().brushProfiles[0];if(!brushSizeInput_->hasFocus())syncText(brushSizeInput_,std::to_string(brush.size));brushSizeInput_->setEnabled(usable && !selectionDragging_);brushShapeButton_->setEnabled(usable && !selectionDragging_);brushShapeButton_->icon=brush.shape==BrushShape::Round?"brush-round":brush.shape==BrushShape::Square?"brush-square":"brush-line";for(auto index:{0,3}){auto& control=toolControls_[index];control.first->setVisible(true);placePropertyControl(control.first,x,control.second);x+=propertyControlWidth(control.first,control.second)+uiGap;}}

      selectionRoundedButton_->icon=currentTools().selectionRounded?"check":"checkboxUnchecked";if(!selectionCornerRadiusInput_->hasFocus())syncText(selectionCornerRadiusInput_,std::to_string(currentTools().selectionCornerRadius));

      const char32_t* modes[]{U"替换选区",U"添加选区",U"减去选区",U"相交选区"};for(int i=0;i<4;++i)selectionModeButtons_[i]->active=i==(selectionRight_?2:selectionShift_?1:currentTools().selectionMode);

      selectionAlgorithmButton_->caption=currentTools().selectionRotSprite?U"RotSprite":U"快速旋转";if(!selectionBrushAngleInput_->hasFocus())syncText(selectionBrushAngleInput_,std::to_string(currentTools().selectionBrushAngle));if(!wandToleranceInput_->hasFocus())syncText(wandToleranceInput_,std::to_string(currentTools().wandOptions.tolerance));if(!wandGapInput_->hasFocus())syncText(wandGapInput_,std::to_string(currentTools().wandOptions.gapThreshold));wandContiguousButton_->icon=currentTools().wandOptions.contiguous?"check":"checkboxUnchecked";wandGapButton_->icon=currentTools().wandOptions.gapClosing?"check":"checkboxUnchecked";wandConnectivityButton_->caption=currentTools().wandOptions.connectivity==4?U"4 方连接":U"8 方连接";wandReferenceButton_->caption.clear();

      if(auto target=selectionTransformTarget()){const double values[]{target->x,target->y,target->width*(target->flipHorizontal?-1:1),target->height*(target->flipVertical?-1:1),target->angle};for(int i=0;i<5;++i)if(!selectionTransformFields_[i]->hasFocus()){std::ostringstream text;text<<values[i];syncText(selectionTransformFields_[i],text.str());}}

      for(std::size_t i=0;i<selectionControls_.size();++i){auto [control,width]=selectionControls_[i];width=propertyControlWidth(control,width);const bool show=i!=6 && ((i==9 && selectionPropertiesActive_) || (i==17 && currentTools().selectionKind==0 && !selectionPropertiesActive_) || (i==18 && currentTools().selectionKind==0 && currentTools().selectionRounded && !selectionPropertiesActive_) || ((i==15 || i==16) && currentDocument().selection()) || (selectionPropertiesActive_ && currentDocument().selection()?i>=10 && i<17:i==0 || (currentTools().selectionKind==4 && i>0 && i<8) || (currentTools().selectionKind==5 && i==8 && currentTools().brushProfiles[0].size>1 && currentTools().brushProfiles[0].shape!=BrushShape::Round)));control->setVisible(show);control->setEnabled((usable || currentDocument().floating()) && !selectionDragging_ && !floatingDragging_ && (control!=wandGapButton_ && control!=wandGapInput_ || currentTools().wandOptions.contiguous));placePropertyControl(control,x,width);if(i==0)for(int m=0;m<4;++m)selectionModeButtons_[m]->setBounds(uiPhysical(gfx::Rect(x+m*14,rc.y+optionsTop()+(Layout::optionsHeight-propertyIconHeight)/2,propertyIconWidth,propertyIconHeight)));if(show)x+=width+uiGap;}layoutDrawingAnchor(x);layoutSymmetryOptions();return;}

    for(auto& c:selectionControls_)c.first->setVisible(false);

    if(perfectPixelsButton_){perfectPixelsButton_->icon=currentTools().brushProfiles[0].perfectPixels?"check":"checkboxUnchecked";perfectPixelsButton_->setEnabled(usable&&!currentDocument().active());}
    const int profile=currentTools().eraser?1:0;const auto& brush=currentTools().brushProfiles[profile];

    updatingBrushFields_=true;

    if(!brushSizeInput_->hasFocus() || shownBrushProfile_!=profile) syncText(brushSizeInput_,std::to_string(brush.size));

    if(!brushOpacityInput_->hasFocus() || shownBrushProfile_!=profile) syncText(brushOpacityInput_,std::to_string(brush.opacity));

    updatingBrushFields_=false;shownBrushProfile_=profile;

    brushShapeButton_->icon=brush.shape==BrushShape::Round?"brush-round":brush.shape==BrushShape::Square?"brush-square":"brush-line";

    auto ditherControl=static_cast<PixelButton*>(toolControls_[1].first);ditherControl->active=brush.dither&&currentTools().pencilImageBrushId.empty();ditherControl->setEnabled(usable&&currentTools().pencilImageBrushId.empty()&&!currentDocument().active());
    brushShapeButton_->active=currentTools().pencilImageBrushId.empty();imageBrushButton_->active=!currentTools().pencilImageBrushId.empty();imageBrushButton_->setEnabled(usable);brushShapeButton_->setEnabled(usable);brushSizeInput_->setEnabled(usable && currentTools().pencilImageBrushId.empty());brushOpacityInput_->setEnabled(usable);

    const int right=commands_[3]->bounds().x/uiScale-uiGap-(supportsToolSymmetry()?85+uiGap:0),left=rc.x+optionsLayout.workX;int total=0;

    for(std::size_t i=0;i<toolControls_.size();++i) if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),toolControls_[i].first)==symmetryButtons_.end() && !(currentTools().eraser && toolControls_[i].pencilOnly)) total+=propertyControlWidth(toolControls_[i].first,toolControls_[i].second)+toolControls_[i].gap;

    int x=left;

    for(std::size_t i=0;i<toolControls_.size();++i) {

      auto& control=toolControls_[i];if(std::find(symmetryButtons_.begin(),symmetryButtons_.end(),control.first)!=symmetryButtons_.end()){
        // These controls are laid out immediately below by layoutSymmetryOptions.
        // Hiding them here makes Manager invalidate every sibling and release
        // focus/capture, only to show the same buttons again in this call.
        if(smoke_ && _wgetenv(L"MOONSPRITE_SYMMETRY_VISIBILITY_REFERENCE"))control.first->setVisible(false);
        continue;
      }const bool applies=!(currentTools().eraser && control.pencilOnly)&&(control.first!=imagePaintModeDropdown_||(ordinaryBrushTool()&&currentTools().pencilImageBrush&&currentTools().pencilImageBrush->intrinsicSize));

      const auto button=dynamic_cast<PixelButton*>(control.first);

      const bool entry=dynamic_cast<PixelEntry*>(control.first)!=nullptr;

      placePropertyControl(control.first,x,control.second);

      control.first->setVisible(!currentTools().handTool && applies);
      if(control.first==imagePaintModeDropdown_)control.first->setEnabled(usable);

      if(applies) x+=propertyControlWidth(control.first,control.second)+control.gap;

    }

    layoutSymmetryOptions();

  }

std::vector<int> Editor::paletteViewSlots()const{
 auto& cache=paletteLayoutCache_;if(cache.identity!=currentDocument().identity()||cache.revision!=currentDocument().revision()||cache.columns!=paletteColumns_||cache.manual!=paletteManual_){const auto& p=currentDocument().palette();auto slots=paletteManual_?fitPaletteSlotsToGrid(normalizePaletteSlots(p.entries,p.order(),p.slots,p.columns),p.columns,paletteColumns_).slots:visiblePaletteOrder(p.entries,p.order());cache.slots=std::move(slots);cache.identity=currentDocument().identity();cache.revision=currentDocument().revision();cache.columns=paletteColumns_;cache.manual=paletteManual_;}return cache.slots;
}

PaletteViewSelection Editor::capturePaletteView()const{PaletteViewSelection view;view.columns=paletteColumns_;view.focused=paletteFocusedSlot_;if(paletteBoxRange_&&paletteBoxRange_->identity==currentDocument().identity())view.box=std::make_pair(paletteBoxRange_->start,paletteBoxRange_->end);return view;}

void Editor::restorePaletteView(){const auto serial=currentDocument().paletteViewRestoreSerial();if(paletteRestoreIdentity_==currentDocument().identity()&&paletteRestoreSerial_==serial)return;paletteRestoreIdentity_=currentDocument().identity();paletteRestoreSerial_=serial;if(const auto& view=currentDocument().paletteViewRestore()){auto map=[&](std::size_t i){return i/view->columns*paletteColumns_+i%view->columns;};paletteFocusedSlot_=view->focused?std::optional<std::size_t>(map(*view->focused)):std::nullopt;if(view->box)paletteBoxRange_=PaletteBoxRange{currentDocument().identity(),map(view->box->first),map(view->box->second),currentDocument().palette().selected};else paletteBoxRange_.reset();}}

void Editor::choosePaletteLayout(bool manual){if(paletteGesture_)finishPalettePointer(true);if(paletteGrowth_)finishPaletteGrowth(true);paletteManual_=manual;if(!smoke_)try{const auto path=palettePreferencePath().parent_path();std::filesystem::create_directories(path);std::ofstream out(path/"palette-layout-mode.txt");out<<(manual?"manual":"auto");if(!out)throw std::runtime_error("Palette layout write");}catch(...){status_=U"色板布局偏好保存失败";}refresh();}

void Editor::addManualPaletteColor(std::size_t slot){const auto slots=paletteViewSlots();if(slot<slots.size()&&slots[slot]!=EmptyPaletteSlot)return;try{currentDocument().addPaletteColor(currentDocument().palette().primary,paletteLocked_,slot,&slots,paletteColumns_);}catch(const std::length_error&){status_=U"颜色编号超出当前支持范围";refresh();return;}if(!paletteLocked_){paletteFocusedSlot_.reset();paletteBoxRange_.reset();}refresh();}

std::string Editor::activeRailTool() const {
    if(currentTools().liquifyTool)return "liquify";
    if(currentTools().smoothTool)return "smooth";
    if(currentTools().airbrushTool)return "airbrush";
    if(currentTools().rotateTool)return "rotate";
    if(currentTools().textTool)return "text";
    if(currentTools().moveTool)return currentTools().sliceMode?"move.slice":"move.move";

    if(currentTools().shapeTool){const char* ids[]{"line.line","shape.rectangle-outline","shape.rectangle","shape.ellipse-outline","shape.ellipse","shape.polygon","shape.freeform","line.curve"};return ids[int(currentTools().shapeKind)];}

    if(currentTools().zoomTool)return "zoom";

    if(currentTools().eyedropperTool)return "eyedropper";

    if(currentTools().handTool)return "hand";

    if(currentTools().selectionTool)return legacyToolGroups()[3][currentTools().selectionKind].id;

    if(currentTools().gradientTool)return "fill.gradient";

    if(currentTools().fillTool)return currentTools().magicEraserTool?"magic-eraser":"fill.bucket";

    return currentTools().eraser?legacyToolGroups()[1].front().id:legacyToolGroups()[0].front().id;

  }

void Editor::cancelStroke() {
    if(liquifyDragging_)finishLiquifyGesture(true);
    if(smoothDragging_)usageStrokeStarted_=0; smoothDragging_=false;smoothArea_={};smoothPointer_.reset();
    dynamicsStroke_=false;magicEraserDragging_=false;
    airbrushDragging_=false;airbrushTimer_.stop();
    if(sliceDrag_)finishSliceGesture(true);
    if(moveDragging_)finishMoveGesture(true);

    currentPlayback().playing=false;
    if(currentTools().temporaryBrushCapture)exitTemporaryBrushCapture();

    finishPan(true);

    curveControls_.clear();curveEndpoint_=true;curveAnchorIndex_=0;shapeSpec_.polygonPath.clear();shapeSpec_.polygonContour.clear();polygonShapeRedo_.clear();polygonShapeCachePath_.clear();polygonShapeCache_.clear();shapeDragging_=shapeRequest_=false;gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;if(fillDragging_){fillDragging_=false;if(fillCommitted_){fillCommitted_=false;currentDocument().undo();}}currentDocument().cancelStroke(); if(hasCapture()) releaseMouse(); refresh();

  }

bool& Editor::symmetryFlag(int i){auto& a=currentDocument().symmetryAxes;return i==0?a.horizontal:i==1?a.vertical:i==2?a.diagonalUp:i==3?a.diagonalDown:a.rotational;}

void Editor::saveSymmetryPreferences(){try{if(smoke_)return;const auto path=palettePreferencePath().parent_path()/"symmetry.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);for(int i=0;i<5;++i)out<<symmetryFlag(i)<<' ';out<<symmetryLocked_<<' '<<symmetryThickness_<<' '<<symmetryColor_;}catch(const std::exception& e){status_=U"对称偏好保存失败："+unicodeText(e.what());}}

void Editor::toggleSymmetry(int i){
  if(currentDocument().active() || i<0 || i>4)return;
  const bool on=!symmetryFlag(i);
  const auto viewport=canvasViewport();
  const auto center=currentDocument().symmetryCenter();
  // Legacy symmetryAxisSegment + viewportSegmentVisible: test the finite
  // displayed axis, rather than requiring its center to be on screen.
  auto visible=[&]{
    if(viewport.w<=0 || viewport.h<=0)return true;
    auto displayPoint=[&](double x,double y){return currentView().rotation.forward({currentView().canvas.x+x*canvasScale(),currentView().canvas.y+y*canvasScale()},canvasRotationPivot());};
    const auto pivot=displayPoint(center.x,center.y);
    if(i==4)return pivot.x>=viewport.x && pivot.x<=viewport.x2() && pivot.y>=viewport.y && pivot.y<=viewport.y2();
    std::vector<view::Point> points;
    const double w=currentDocument().width(),h=currentDocument().height();
    auto add=[&](double x,double y){
      const double e=1e-6;if(x< -e || y< -e || x>w+e || y>h+e)return;
      view::Point point{std::clamp(x,0.,w),std::clamp(y,0.,h)};
      for(const auto& p:points)if(std::abs(p.x-point.x)<e && std::abs(p.y-point.y)<e)return;
      points.push_back(point);
    };
    if(i==0){add(0,center.y);add(w,center.y);}
    else if(i==1){add(center.x,0);add(center.x,h);}
    else if(i==3){const double d=center.y-center.x;add(0,d);add(w,w+d);add(-d,0);add(h-d,h);}
    else{const double sum=center.x+center.y;add(0,sum);add(w,sum-w);add(sum,0);add(sum-h,h);}
    if(points.size()<2)return false;
    std::sort(points.begin(),points.end(),[](const auto& a,const auto& b){return a.x<b.x || (a.x==b.x && a.y<b.y);});
    const auto start=displayPoint(points.front().x,points.front().y),end=displayPoint(points.back().x,points.back().y);
    double from=0,to=1;const double dx=end.x-start.x,dy=end.y-start.y;
    for(const auto edge:std::array<std::pair<double,double>,4>{{{start.x-viewport.x,dx},{viewport.x2()-start.x,-dx},{start.y-viewport.y,dy},{viewport.y2()-start.y,-dy}}}){
      if(edge.second==0){if(edge.first<0)return false;continue;}
      const double ratio=-edge.first/edge.second;
      if(edge.second>0)from=std::max(from,ratio);else to=std::min(to,ratio);
      if(from>to)return false;
    }
    return true;
  };
  if(on && (!symmetryInitialized_ || !visible())){
    const auto at=canvasDocumentPoint(viewport.center());
    const auto next=moveSymmetryCenter(center,SymmetryAxis::Center,{at.x,at.y},currentDocument().width(),currentDocument().height());
    if(next.x!=center.x || next.y!=center.y)currentDocument().setSymmetryCenter(next);
  }
  if(on)symmetryInitialized_=true;
  symmetryFlag(i)=on;persistedSymmetryAxes_=currentDocument().symmetryAxes;saveSymmetryPreferences();refresh();
}

void Editor::showSymmetryMenu(){PixelMenu menu(skin_);auto add=[&](const char32_t* label,std::function<void()> action){auto item=new PixelMenuItem(font_,skin_,label);item->Click.connect(action);menu.addChild(item);return item;};add(U"重置对称轴",[this]{currentDocument().setSymmetryCenter(defaultSymmetryCenter(currentDocument().width(),currentDocument().height()));refresh();});auto lock=add(U"锁定对称轴（Ctrl临时解锁）",[this]{symmetryLocked_=!symmetryLocked_;saveSymmetryPreferences();});lock->checked=[this]{return symmetryLocked_;};for(int n=1;n<=8;++n){auto item=new PixelMenuItem(font_,skin_,U"轴粗细 "+unicodeText(std::to_string(n))+U" px");item->checked=[this,n]{return symmetryThickness_==n;};item->Click.connect([this,n]{symmetryThickness_=n;saveSymmetryPreferences();invalidateRect(canvasViewport());});menu.addChild(item);}auto colorLabel=new PixelMenuItem(font_,skin_,U"对称轴颜色 HEX");colorLabel->setEnabled(false);menu.addChild(colorLabel);auto colorInput=new PixelEntry(font_,skin_);colorInput->setText(paletteHex(symmetryColor_));menu.addChild(colorInput);colorInput->Change.connect([this,colorInput]{Pixel next;if(parsePaletteHex(colorInput->text(),next)){symmetryColor_=next;saveSymmetryPreferences();invalidateRect(canvasViewport());}});const auto at=symmetryButtons_[5]->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

std::optional<SymmetryAxis> Editor::symmetryHit(gfx::Point at,bool ctrl)const{if(!symmetryAxisDragAllowed(symmetryLocked_,ctrl) || !symmetryHas(currentDocument().symmetryAxes) || !canvasViewport().contains(at) || !canvasDocumentContains(at))return {};const auto p=SymmetryCenter{canvasDocumentPoint(at).x,canvasDocumentPoint(at).y},c=currentDocument().symmetryCenter();if(std::hypot(p.x-c.x,p.y-c.y)<=std::max(.35,9/canvasScale()))return SymmetryAxis::Center;const double radius=std::max(.25,std::max(7.0,symmetryThickness_/2.0+4)/canvasScale());double best=radius;std::optional<SymmetryAxis> axis;auto check=[&](SymmetryAxis a,double d){if(d<=radius && (!axis || d<best)){best=d;axis=a;}};const auto a=currentDocument().symmetryAxes;if(a.horizontal||a.rotational)check(SymmetryAxis::Horizontal,std::abs(p.y-c.y));if(a.vertical||a.rotational)check(SymmetryAxis::Vertical,std::abs(p.x-c.x));if(a.diagonalUp)check(SymmetryAxis::DiagonalUp,std::abs(p.x+p.y-c.x-c.y)/std::sqrt(2.0));if(a.diagonalDown)check(SymmetryAxis::DiagonalDown,std::abs(p.y-p.x-c.y+c.x)/std::sqrt(2.0));return axis;}

void Editor::finishSymmetryDrag(bool cancel){if(!symmetryDragging_)return;const auto center=cancel?symmetryDragBefore_:currentDocument().symmetryCenter();currentDocument().setSymmetryCenter(center,!cancel);symmetryDragging_=false;if(hasCapture())releaseMouse();updateNavigationCursor();refresh();}

void Editor::useEyedropperTool(){currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().rotateTool=false;if((currentDocument().active()&&!currentDocument().floating()) || selectionDragging_ || floatingDragging_ || shapeDragging_ || gradientDragging_ || gradientPending_ || fillDragging_ || eyedropperGesture_.active() || navigation_.zoomDragging_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().selectionTool=currentTools().shapeTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=currentTools().zoomTool=false;currentTools().eyedropperTool=true;currentPlayback().playing=false;layoutToolOptions();refresh();}

std::pair<std::uint64_t,std::uint64_t> eyedropperLensWorkCounts(const ui::Widget& owner){
 const auto work=std::dynamic_pointer_cast<EyedropperLensWork>(owner.getProperty("moonsprite.eyedropper-lens-work"));
 return work?std::make_pair(work->renders,work->reads):std::make_pair(std::uint64_t(0),std::uint64_t(0));
}

void Editor::updateEyedropperLens(gfx::Point pointer,Pixel sampled) {

    auto work=std::dynamic_pointer_cast<EyedropperLensWork>(getProperty("moonsprite.eyedropper-lens-work"));
    if(!work){work=std::make_shared<EyedropperLensWork>();setProperty(work);}
    if(!eyedropperLensEnabled_){work->pending=false;eyedropperLensSurface_.reset();return;}
    if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){const auto at=canvasDocumentPoint(pointer);if(!repeat::map({at.x,at.y},currentDocument().width(),currentDocument().height(),currentView().tileRepeat))return;}
    // First preview remains immediate; subsequent pointer bursts render once at paint.
    if(!work->rendering&&eyedropperLensSurface_){work->pointer=pointer;work->sampled=sampled;work->pending=true;invalidateRect(canvasViewport());return;}
    work->pending=false;

    if(!eyedropperLensSurface_)eyedropperLensPrevious_=eyedropperGesture_.secondary()?currentDocument().palette().secondary:currentDocument().palette().primary;

    eyedropperLensPointer_=pointer;

    auto at=canvasDocumentPoint(pointer);
    if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){
      const auto mapped=repeat::map({at.x,at.y},currentDocument().width(),currentDocument().height(),currentView().tileRepeat);
      if(!mapped)return;
      at={mapped->local.x,mapped->local.y};
      sampled=sampleEyedropper(currentDocument().timeline(),currentDocument().frame().id,currentDocument().layer().id,currentDocument().width(),currentDocument().height(),int(std::floor(at.x)),int(std::floor(at.y)),currentTools().eyedropperSource);
    }
    const double px=at.x,py=at.y;

    const int sx=int(std::floor(px))-12,sy=int(std::floor(py))-12;

    if(!work->cached||work->identity!=currentDocument().identity()||work->revision!=currentDocument().revision()||work->frame!=currentDocument().frame().id||work->layer!=currentDocument().layer().id||work->source!=currentTools().eyedropperSource||work->x!=sx||work->y!=sy){
      auto pixels=currentTools().eyedropperSource==EyedropperSource::Composite?compositeNormalRegion(currentDocument().timeline(),currentDocument().frame().id,{sx,sy,25,25}):std::vector<Pixel>(625);
      if(currentTools().eyedropperSource==EyedropperSource::CurrentLayer)for(int y=0;y<25;++y)for(int x=0;x<25;++x)pixels[y*25+x]=sampleEyedropper(currentDocument().timeline(),currentDocument().frame().id,currentDocument().layer().id,currentDocument().width(),currentDocument().height(),sx+x,sy+y,currentTools().eyedropperSource);
      work->pixels=std::move(pixels);work->identity=currentDocument().identity();work->revision=currentDocument().revision();work->frame=currentDocument().frame().id;work->layer=currentDocument().layer().id;work->source=currentTools().eyedropperSource;work->x=sx;work->y=sy;work->cached=true;++work->reads;
    }
    const auto& pixels=work->pixels;++work->renders;

    // Legacy 256px shell / 204px field; adapt CSS pixels to native 2x UI.

    eyedropperLensSurface_=os::instance()->makeRgbaSurface(128,128);eyedropperLensSurface_->clear();

    const double pixelScale=std::max(12.0,currentView().zoom*1.5)/2;

    auto over=[](Pixel background,Pixel color){const unsigned a=color>>24;auto c=[&](int shift){return (((color>>shift)&255)*a+((background>>shift)&255)*(255-a)+127)/255;};return Pixel(c(0)|(c(8)<<8)|(c(16)<<16)|0xff000000);};

    const auto& pointerBitmap=*eyedropperLensPointers_[(299*(sampled&255)+587*((sampled>>8)&255)+114*((sampled>>16)&255))/1000<145?1:0].bitmap;

    os::SurfaceLock lock(eyedropperLensSurface_.get());

    for(int y=0;y<128;++y)for(int x=0;x<128;++x){

      const int at=(y/2)*64+x/2;Pixel color=0;

      if(eyedropperLensMasks_[0].bitmap->pixels[at]>>24){

        const int dx=int(std::floor(px+(x+.5-64)/pixelScale)),dy=int(std::floor(py+(y+.5-64)/pixelScale));

        const auto checker=checkerboard_.at(dx,dy);

        const Pixel bg=Pixel(gfx::getr(checker)|(gfx::getg(checker)<<8)|(gfx::getb(checker)<<16)|0xff000000);

        color=over(bg,dx>=0 && dy>=0 && dx<currentDocument().width() && dy<currentDocument().height() && dx>=sx && dx<sx+25 && dy>=sy && dy<sy+25?pixels[(dy-sy)*25+dx-sx]:0);

        if(x>=56 && x<72 && y>=56 && y<72){const auto p=pointerBitmap.pixels[(y-56)*2*32+(x-56)*2];color=over(color,(p&0xffffff)|((p>>25)<<24));}

      }

      if(eyedropperLensMasks_[1].bitmap->pixels[at]>>24)color=color?over(color,sampled):sampled;

      if(eyedropperLensMasks_[2].bitmap->pixels[at]>>24)color=color?over(color,eyedropperLensPrevious_):eyedropperLensPrevious_;

      const auto frame=eyedropperLensMasks_[3].bitmap->pixels[at];if(frame>>24)color=frame;

      eyedropperLensSurface_->putPixel(gfx::rgba(color&255,(color>>8)&255,(color>>16)&255,color>>24),x,y);

    }

  }

void Editor::paintEyedropperLens(ui::Graphics& g) {

    if(!eyedropperGesture_.active() || !eyedropperLensSurface_)return;
    if(auto work=std::dynamic_pointer_cast<EyedropperLensWork>(getProperty("moonsprite.eyedropper-lens-work"));work&&work->pending){
      work->rendering=true;
      try{updateEyedropperLens(work->pointer,work->sampled);}catch(...){work->rendering=false;throw;}
      work->rendering=false;
    }

    UiPaintScale scale(g);auto viewport=uiLogical(canvasViewport());viewport.offset(-bounds().x/uiScale,-bounds().y/uiScale);

    const double lensSizes[]{.5,.75,1,1.25};const int size=int(128*lensSizes[eyedropperLensSize_]);const gfx::Point pointer((eyedropperLensPointer_.x-bounds().x)/uiScale,(eyedropperLensPointer_.y-bounds().y)/uiScale);

    const int x=std::clamp(pointer.x-size/2,viewport.x+3,std::max(viewport.x+3,viewport.x2()-size-3));

    const int y=pointer.y-size-9>=viewport.y+3?pointer.y-size-9:std::clamp(pointer.y+9,viewport.y+3,std::max(viewport.y+3,viewport.y2()-size-3));

    ui::Paint composite;composite.blendMode(os::BlendMode::SrcOver);

    g.saveClip();g.clipRect(viewport);g.drawSurface(eyedropperLensSurface_.get(),gfx::Rect(0,0,128,128),gfx::Rect(x,y,size,size),os::Sampling(),&composite);g.restoreClip();

  }

bool Editor::processColorEditorCanvasSampling(ui::Message* msg){
  auto target=colorEditorSamplingTarget_;
  if(!colorEditorSampling_||!target)return false;
  auto finish=[&]{target->finishSampling();};
  if(currentDocument().identity()!=colorEditorSamplingIdentity_){finish();return false;}
  if(msg->type()==ui::kKeyDownMessage){
    if(static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){finish();return true;}
    return false;
  }
  if(msg->type()==ui::kFocusLeaveMessage){
    const auto focus=static_cast<ui::FocusMessage*>(msg);
    if(!focus->newFocus()){finish();return false;}
    return false;
  }
  const auto mouse=dynamic_cast<ui::MouseMessage*>(msg);if(!mouse)return false;
  if(mouse->display()&&mouse->display()!=display()){finish();return false;}
  const auto point=mouse->positionForDisplay(display());
  if(target->bounds().contains(mouse->positionForDisplay(target->display())))return false;
  const bool active=eyedropperGesture_.active();
  if(!active&&!canvasViewport().contains(point))return false;
  try{
    if(msg->type()==ui::kMouseDownMessage){
      if(!mouse->left()&&!mouse->right())return false;
      if(!active){strokeButton_=mouse->button();eyedropperGesture_.begin(mouse->right(),false);target->captureMouse();}
    }else if(msg->type()==ui::kMouseUpMessage){
      if(active&&(mouse->button()==strokeButton_||mouse->button()==ui::kButtonNone)){finishEyedropper();return true;}
      return active;
    }else if(msg->type()!=ui::kMouseMoveMessage)return false;
    if(eyedropperGesture_.active()&&canvasViewport().contains(point)){
      const auto p=transformCanvasPoint(point);const Point at{int(std::floor(p.x)),int(std::floor(p.y))};
      const auto color=sampleEyedropper(currentDocument().timeline(),currentDocument().frame().id,currentDocument().layer().id,currentDocument().width(),currentDocument().height(),at.x,at.y,currentTools().eyedropperSource);
      updateEyedropperLens(point,color);sampleEyedropperAt(at);
    }
    return eyedropperGesture_.active();
  }catch(const std::exception& e){finish();status_=U"渐变色标采色失败："+unicodeText(e.what());invalidate();return true;}
}

void Editor::sampleEyedropperAt(Point p){try{if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){const auto mapped=repeat::map({double(p.x),double(p.y)},currentDocument().width(),currentDocument().height(),currentView().tileRepeat);if(!mapped)return;p={int(mapped->local.x),int(mapped->local.y)};}const auto color=sampleEyedropper(currentDocument().timeline(),currentDocument().frame().id,currentDocument().layer().id,currentDocument().width(),currentDocument().height(),p.x,p.y,currentTools().eyedropperSource);eyedropperGesture_.sample(color);if(colorEditorSampling_&&colorEditorSamplingTarget_)colorEditorSamplingTarget_->sampled(color);else setSharedColor(color,eyedropperGesture_.secondary());if(replaceSampling_>=0)changeReplaceColor(replaceSampling_,color,true);refresh();}catch(const std::exception& e){status_=U"采色失败："+unicodeText(e.what());invalidate();}}

void Editor::finishEyedropper(){if(auto work=std::dynamic_pointer_cast<EyedropperLensWork>(getProperty("moonsprite.eyedropper-lens-work")))work->pending=false;const bool returnToPencil=currentTools().eyedropperTool && replaceSampling_<0 && !colorEditorSampling_ && runtimePreferences_.flag("tools.eyedropperSwitchToPencil");const bool editorSampling=colorEditorSampling_;const auto added=eyedropperGesture_.finish(paletteSamplingHeld_);if(added)try{currentDocument().addPaletteColor(*added);}catch(const std::length_error&){status_=U"颜色编号超出当前支持范围";}eyedropperLensSurface_.reset();if(hasCapture())releaseMouse();if(replaceSampling_>=0)finishReplaceSampling();if(editorSampling&&colorEditorSamplingTarget_)colorEditorSamplingTarget_->finishSampling();if(returnToPencil){currentTools().eyedropperTool=false;currentTools().selectionTool=currentTools().shapeTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().zoomTool=currentTools().eraser=false;}updateNavigationCursor();refresh();}

std::filesystem::path Editor::fillBrushLibraryDirectory() const {if(brushLibraryTestDirectory_)return *brushLibraryTestDirectory_;

    wchar_t path[32768]{};const auto size=GetModuleFileNameW(nullptr,path,32768);if(!size || size==32768)throw std::runtime_error("Cannot locate native brush library");return std::filesystem::path(path).parent_path()/L"brushes";

  }

std::filesystem::path Editor::backgroundPresetDirectory() const {return fillBrushLibraryDirectory().parent_path()/L"BackgroundPresets";}

void Editor::createSelectionBackgroundPreset(){currentDocument().commitFloatingPaste();if(!currentDocument().selection()){status_=U"请先创建选区";refresh();return;}try{auto image=encodeSelectionBackgroundPreset(currentDocument(),*currentDocument().selection());if(!image){status_=U"选区中没有可用的背景预设像素";refresh();return;}BackgroundPresetLibrary library(backgroundPresetTestDirectory_.value_or(backgroundPresetDirectory()));library.save(U"选区背景预设",image->png);status_=U"已保存背景预设";}catch(const std::exception& e){status_=U"保存背景预设失败："+unicodeText(e.what());}refresh();}

void Editor::resolvePencilImageBrush(){currentTools().pencilImageBrush.reset();if(currentTools().pencilImageBrushId.empty())return;try{if(currentTools().pencilImageBrushId.rfind("project:",0)==0){const auto id=currentTools().pencilImageBrushId.substr(8);for(const auto& item:currentDocument().projectBrushes())if(item.metadata.id==id){if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];currentTools().pencilImageBrush=item.brush;currentTools().temporaryBrushActive=false;return;}throw std::runtime_error("工程笔刷已不存在");}PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& item:library.list().brushes)if(item.id==currentTools().pencilImageBrushId){if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];currentTools().pencilImageBrush=importPatternBrush(std::filesystem::u8path(item.filePath)).brush;currentTools().pencilImageBrush->selectionColorMapping=item.sourceX.has_value()&&item.sourceY.has_value();currentTools().pencilImageBrush->sourceX=item.sourceX.value_or(0);currentTools().pencilImageBrush->sourceY=item.sourceY.value_or(0);currentTools().temporaryBrushActive=false;return;}throw std::runtime_error("本地笔刷已不存在");}catch(const std::exception& e){currentTools().pencilImageBrushId.clear();status_=U"图像笔刷不可用："+unicodeText(e.what());}}


void Editor::deleteFillLibrarySelection(const std::vector<std::string>& ids){
 if(ids.empty()||pending_!=Pending::None||currentDocument().active())return;
 try{PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& id:ids){if(id.rfind("project:",0)==0)currentDocument().deleteProjectBrush(id.substr(8));else library.remove(id);currentTools().fillLibrarySelection.removed(id);}applyFillLibrarySelection();saveBrushPreferences();status_=U"已删除笔刷："+unicodeText(std::to_string(ids.size()));}catch(const std::exception& e){const auto error=std::string(e.what());try{applyFillLibrarySelection();}catch(const std::exception&){currentTools().fillPattern.brushes.clear();currentTools().fillImageName.clear();currentTools().pencilImageBrushId.clear();currentTools().pencilImageBrush.reset();}status_=U"删除图案失败："+unicodeText(error);}brushLibraryNeedsReload_=true;refresh();
}
void Editor::confirmFillLibraryDelete(int verify){
 if(pending_!=Pending::None||currentDocument().active()||currentTools().fillLibrarySelection.ids.empty())return;
 try{PatternBrushLibrary library(fillBrushLibraryDirectory());const auto listing=library.list();std::vector<std::string> ids;std::u32string name;auto add=[&](const std::string& id,const std::string& label){if(std::find(currentTools().fillLibrarySelection.ids.begin(),currentTools().fillLibrarySelection.ids.end(),id)!=currentTools().fillLibrarySelection.ids.end()){ids.push_back(id);name=unicodeText(label);}};for(const auto& item:listing.brushes)if(item.folderId==fillFolder_)add(item.id,item.name);if(fillFolder_.empty())for(const auto& item:currentDocument().projectBrushes())add("project:"+item.metadata.id,item.metadata.name);if(ids.empty())return;if(ids.size()>1)name=unicodeText(std::to_string(ids.size()))+U" 个笔刷";
 const auto identity=currentDocument().identity();BrushLibraryDeleteDialog popup(font_,skin_,toolIcons_,name);popup.setDisplay(display(),false);const auto size=popup.minimumDialogSize(300*uiScale);popup.setBounds({bounds().center().x-150*uiScale,bounds().center().y-size.h/2,300*uiScale,size.h});ui::Timer timer(30,&popup);if(verify){timer.Tick.connect([&]{timer.stop();popup.smoke(verify-1);});timer.start();}popup.openWindowInForeground();if(popup.accepted()&&currentDocument().identity()==identity)deleteFillLibrarySelection(ids);
 }catch(const std::exception& e){status_=U"删除图案失败："+unicodeText(e.what());}requestFocus();refresh();
}

void Editor::editFillFolder(bool rename){if(rename&&fillFolder_.empty())return;fillFolderRename_=rename;fillFolderEditing_=fillFolder_;paletteInput_->numeric=false;paletteInput_->suffix.clear();paletteInput_->setText(rename?std::filesystem::u8path(fillFolder_).filename().u8string():"");pending_=Pending::BrushFolderName;menuBar_->setEnabled(false);discard_->caption=rename?U"重命名":U"创建";keep_->caption=U"取消";discard_->setVisible(true);keep_->setVisible(true);dialogClose_->setVisible(true);paletteInput_->setVisible(true);refresh();paletteInput_->requestFocus();paletteInput_->selectAllText();}

void Editor::moveFillBrushes(const std::string& folder){try{PatternBrushLibrary library(fillBrushLibraryDirectory());for(const auto& id:currentTools().fillLibrarySelection.ids)if(id.rfind("project:",0)!=0)library.move(id,folder);status_=U"已移动选中图案";}catch(const std::exception& e){status_=U"移动图案失败："+unicodeText(e.what());}brushLibraryNeedsReload_=true;refresh();}

void Editor::confirmFillFolderDelete(){if(fillFolder_.empty())return;auto target=fillFolder_;PixelMenu menu(skin_);menu.addChild(new PixelMenuItem(font_,skin_,U"取消"));auto confirm=new PixelMenuItem(font_,skin_,U"确认删除文件夹及全部图案（无法撤销）");confirm->Click.connect([this,target]{try{PatternBrushLibrary library(fillBrushLibraryDirectory());auto before=library.list();library.removeFolder(target);for(const auto& item:before.brushes)if(item.folderId==target||item.folderId.rfind(target+"/",0)==0)currentTools().fillLibrarySelection.removed(item.id);fillFolder_.clear();applyFillLibrarySelection();saveBrushPreferences();status_=U"已删除图案文件夹";}catch(const std::exception& e){status_=U"删除文件夹失败："+unicodeText(e.what());}brushLibraryNeedsReload_=true;refresh();});menu.addChild(confirm);auto at=brushLibraryPanel_&&brushLibraryPanel_->isVisible()?brushLibraryActions_[2]->bounds():fillImageButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();}

// legacy workspace-commands-tool.ts274-311 and workspace-temporary-brush.test.ts.
void Editor::beginTemporaryBrushCapture(){
 if(currentTools().temporaryBrushCapture || (currentDocument().active()&&!currentDocument().floating()) || selectionDragging_ || floatingDragging_ || shapeDragging_ || gradientPending_ || gradientDragging_ || fillDragging_ || eyedropperGesture_.active())return;
 currentDocument().commitFloatingPaste();cancelStroke();
 if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];
 currentTools().temporaryBrushCapture=TemporaryBrushCapture{currentTools().selectionKind,currentTools().selectionMode,currentTools().selectionCornerRadius,currentTools().selectionRounded,currentDocument().identity()};
 currentTools().selectionKind=0;currentTools().selectionMode=0;currentTools().selectionRounded=false;currentView().freeTransform=selectionPropertiesActive_=false;
 currentTools().selectionTool=true;currentTools().shapeTool=currentTools().eyedropperTool=currentTools().zoomTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;
 status_=U"拖出矩形捕获临时笔刷，Esc 取消";refresh();
}
void Editor::finishTemporaryBrushCapture(const SelectionMask& selection){
 if(!currentTools().temporaryBrushCapture || currentTools().temporaryBrushCapture->identity!=currentDocument().identity())return;
 try{
  auto brush=createSelectionPatternBrush(currentDocument().activeSurfaceIfPresent(),currentDocument().width(),currentDocument().height(),selection);
  if(!brush){status_=U"选区中没有可用笔刷像素";return;}
  const auto old=*currentTools().temporaryBrushCapture;currentTools().selectionKind=old.kind;currentTools().selectionMode=old.mode;currentTools().selectionRounded=old.rounded;currentTools().selectionCornerRadius=old.radius;currentTools().temporaryBrushCapture.reset();
  if(currentTools().temporaryBrushReturnProfile)currentTools().brushProfiles[0]=*currentTools().temporaryBrushReturnProfile;
  currentTools().pencilImageBrush=std::move(brush);currentTools().pencilImageBrushId="temporary-capture";currentTools().pencilImageBrushAngle=0;currentTools().temporaryBrushActive=true;
  currentTools().fillPattern.brushes.clear();currentTools().fillLibrarySelection={};currentTools().fillImageName.clear();
  currentTools().selectionTool=currentTools().shapeTool=currentTools().eyedropperTool=currentTools().zoomTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;
  status_=U"已捕获临时笔刷，Esc 恢复普通笔刷";
 }catch(const std::exception& e){status_=U"捕获笔刷失败："+unicodeText(e.what());}
}
void Editor::exitTemporaryBrushCapture(){
 const bool capturing=bool(currentTools().temporaryBrushCapture);
 if(capturing){const auto old=*currentTools().temporaryBrushCapture;currentTools().selectionKind=old.kind;currentTools().selectionMode=old.mode;currentTools().selectionRounded=old.rounded;currentTools().selectionCornerRadius=old.radius;currentTools().temporaryBrushCapture.reset();}
 const auto paintMode=currentTools().brushProfiles[0].imagePaintMode;
 if(currentTools().temporaryBrushReturnProfile)currentTools().brushProfiles[0]=*currentTools().temporaryBrushReturnProfile;
 currentTools().brushProfiles[0].imagePaintMode=paintMode;
 currentTools().temporaryBrushReturnProfile.reset();currentTools().temporaryBrushActive=false;currentTools().pencilImageBrush.reset();currentTools().pencilImageBrushId.clear();currentTools().fillPattern.brushes.clear();currentTools().fillLibrarySelection={};currentTools().fillImageName.clear();
 if(capturing)currentTools().selectionTool=currentTools().shapeTool=currentTools().eyedropperTool=currentTools().zoomTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;
}

void Editor::createBrushFromSelection(){

    currentDocument().commitFloatingPaste();if(!currentDocument().selection()){status_=U"需要像素选区";refresh();return;}

    try{auto brush=createSelectionPatternBrush(currentDocument().activeSurfaceIfPresent(),currentDocument().width(),currentDocument().height(),*currentDocument().selection());if(!brush){status_=U"选区中没有可用笔刷像素";refresh();return;}const auto directory=smoke_?fillBrushLibraryDirectory().parent_path().parent_path()/"pattern-brush-library-fixture":fillBrushLibraryDirectory();PatternBrushLibrary library(directory);auto value=library.save("笔刷",encodePatternBrushPng(*brush),true,brush->sourceX,brush->sourceY);if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];currentTools().temporaryBrushActive=false;currentTools().pencilImageBrushId=value.id;currentTools().pencilImageBrush=*brush;currentTools().fillPattern.brushes.clear();currentTools().fillLibrarySelection={};currentTools().fillImageName.clear();currentDocument().previewSelection({});currentView().pivot.reset();selectionPropertiesActive_=false;currentView().freeTransform=false;currentTools().selectionTool=currentTools().shapeTool=currentTools().eyedropperTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;saveBrushPreferences();brushLibraryNeedsReload_=true;status_=U"选区笔刷已保存到本地库";}catch(const std::exception& e){status_=U"创建选区笔刷失败："+unicodeText(e.what());}refresh();

  }

void Editor::createFillBrushFromSelection(){

    currentDocument().commitFloatingPaste();if(!currentDocument().selection()){status_=U"需要选区";refresh();return;}

    try{auto brush=createSelectionPatternBrush(currentDocument().activeSurfaceIfPresent(),currentDocument().width(),currentDocument().height(),*currentDocument().selection());if(!brush){status_=U"选区中没有可用笔刷像素";refresh();return;}PatternBrushLibrary library(fillBrushLibraryDirectory());auto value=library.save("笔刷",encodePatternBrushPng(*brush),true,brush->sourceX,brush->sourceY);if(!fillFolder_.empty())library.move(value.id,fillFolder_);PatternBrushSelection selection;selection.ids={value.id};selection.active=selection.anchor=value.id;std::vector<PatternBrush> patterns{*brush};auto active=*brush;const auto name=unicodeText(std::filesystem::u8path(value.filePath).stem().u8string());if(!currentTools().temporaryBrushReturnProfile)currentTools().temporaryBrushReturnProfile=currentTools().brushProfiles[0];currentTools().temporaryBrushActive=false;currentTools().fillLibrarySelection=std::move(selection);currentTools().fillPattern.brushes=std::move(patterns);currentTools().pencilImageBrushId=value.id;currentTools().pencilImageBrush=std::move(active);currentTools().fillImageName=name;currentDocument().previewSelection({});selectionPropertiesActive_=false;saveBrushPreferences();brushLibraryNeedsReload_=true;status_=U"选区笔刷已保存到本地库";}catch(const std::exception& e){status_=U"创建选区笔刷失败："+unicodeText(e.what());}refresh();

  }

void Editor::importFillImage(){

    wchar_t filename[32768]{};OPENFILENAMEW dialog{};dialog.lStructSize=sizeof(dialog);dialog.hwndOwner=GetActiveWindow();dialog.lpstrFile=filename;dialog.nMaxFile=32768;dialog.lpstrFilter=L"图案图像\0*.png;*.jpg;*.jpeg;*.bmp;*.gif;*.webp\0\0";dialog.Flags=OFN_EXPLORER|OFN_NOCHANGEDIR|OFN_PATHMUSTEXIST|OFN_FILEMUSTEXIST|OFN_ALLOWMULTISELECT;

    if(!GetOpenFileNameW(&dialog))return;

    std::vector<std::filesystem::path> paths;auto first=std::filesystem::path(filename);auto next=filename+std::wcslen(filename)+1;if(!*next)paths.push_back(first);else for(;*next;next+=std::wcslen(next)+1)paths.push_back(first/next);

    importBrushLibraryImages(paths,fillFolder_);
  }


void Editor::createFillPatternOptions(){

    fillTextureButton_=button(U"纯色",[this]{showFillTexturePopup();});fillControls_.push_back({fillTextureButton_,48});

    fillTextureScale_=new PixelEntry(font_,skin_);fillTextureScale_->numeric=true;addChild(fillTextureScale_);fillControls_.push_back({fillTextureScale_,32});auto scale=[this]{try{currentTools().fillPattern.textureScale=std::clamp(std::stoi(fillTextureScale_->text()),1,16);saveBrushPreferences();}catch(...){}layoutToolOptions();};fillTextureScale_->Change.connect(scale);fillTextureScale_->blur=scale;fillTextureScale_->accept=[this,scale]{scale();requestFocus();};

    fillImageButton_=button(U"图案",[this]{showFillLibraryMenu();});fillControls_.push_back({fillImageButton_,48});

  }

void Editor::createEyedropperOptions(){

    int maskIndex=0;for(const auto name:{"viewport","eyedropper-magnifier-sampled-mask","eyedropper-magnifier-previous-mask","eyedropper-magnifier-frame"})eyedropperLensMasks_[maskIndex++]=importSkinPng(assets_/"eyedropper"/(std::string(name)+".png"),64);

    eyedropperLensPointers_[0]=importSkinPng(assets_/"cursors/02-Slice-2.png",32);eyedropperLensPointers_[1]=importSkinPng(assets_/"cursors/03-Slice-3.png",32);

    {std::ifstream in(palettePreferencePath().parent_path()/"zoom-tool-drag-mode.txt");std::string mode;if(in>>mode)navigation_.zoomSmooth_=mode=="smooth";}

    // localStorage preference becomes the existing native preference directory.

    try{std::ifstream in(palettePreferencePath().parent_path()/"eyedropper-source.txt");std::string value;if(in>>value && value=="current-layer")currentTools().eyedropperSource=EyedropperSource::CurrentLayer;}catch(const std::exception& e){status_=U"吸管设置读取失败："+unicodeText(e.what());}

    eyedropperSourceButton_=button(U"合成图像",[this]{PixelMenu menu(skin_);for(int i=0;i<2;++i){auto item=new PixelMenuItem(font_,skin_,i?U"当前图层":U"合成图像");item->checked=[this,i]{return currentTools().eyedropperSource==(i?EyedropperSource::CurrentLayer:EyedropperSource::Composite);};item->Click.connect([this,i]{currentTools().eyedropperSource=i?EyedropperSource::CurrentLayer:EyedropperSource::Composite;try{if(!smoke_){const auto path=palettePreferencePath().parent_path()/"eyedropper-source.txt";std::filesystem::create_directories(path.parent_path());std::ofstream out(path);out.exceptions(std::ios::failbit|std::ios::badbit);out<<(i?"current-layer":"composite");}}catch(const std::exception& e){status_=U"吸管设置保存失败："+unicodeText(e.what());}refresh();});menu.addChild(item);}const auto at=eyedropperSourceButton_->bounds();menu.showPopup({at.x,at.y2()},display());requestFocus();});

    // legacy EditorToolOptions: filled role controls and refresh replacement entry.
    eyedropperForegroundButton_=button(U"",[this]{showRoleColorEditor(false,eyedropperForegroundButton_);});
    eyedropperBackgroundButton_=button(U"",[this]{showRoleColorEditor(true,eyedropperBackgroundButton_);});
    for(auto control:{eyedropperForegroundButton_,eyedropperBackgroundButton_})control->colorRole=true;
    eyedropperForegroundButton_->hover=[this]{status_=U"前景色 · 点击编辑颜色";invalidate();};
    eyedropperBackgroundButton_->hover=[this]{status_=U"背景色 · 点击编辑颜色";invalidate();};
    eyedropperReplaceButton_=button(U"替换颜色",[this]{openReplaceColor();});
    eyedropperReplaceButton_->icon="refresh";eyedropperReplaceButton_->iconSkin=&toolIcons_;
    eyedropperReplaceButton_->bareIconWithCaption=true;
  }

void Editor::showToolGroup(std::size_t index,bool smoke,int smokeChoice) {

    if(floatingDragging_ || (selectionDragging_ && currentTools().selectionKind==5))return;

    if(pending_!=Pending::None) return;

    class ToolFlyout final:public ui::PopupWindow {

    public:ToolFlyout():ui::PopupWindow("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow){setAutoRemap(false);setWantFocus(true);}

      bool onProcessMessage(ui::Message* msg)override{if(msg->type()==ui::kKeyDownMessage && static_cast<ui::KeyMessage*>(msg)->scancode()==ui::kKeyEsc){closeWindow(nullptr);return true;}return ui::PopupWindow::onProcessMessage(msg);}

    };

    // Legacy's manual popover allows the rest of the rail to keep receiving input.

    if(toolFlyout_)toolFlyout_->closeWindow(nullptr);

    toolFlyout_=std::make_unique<ToolFlyout>();

    auto& popup=*toolFlyout_;

    std::vector<PixelButton*> buttons;

    const auto& group=legacyToolGroups()[index];

    const auto anchor=toolRail_[index]->bounds();

    const int width=(int(group.size())*14+1)*uiScale,height=16*uiScale;

    const auto view=display()->bounds();

    int x=anchor.x2()+uiGap*uiScale,y=anchor.y;if(toolRailSide_==1)x=anchor.x-uiGap*uiScale-width;else if(toolRailSide_==2){x=anchor.x;y=anchor.y2()+uiGap*uiScale;}else if(toolRailSide_==3){x=anchor.x;y=anchor.y-uiGap*uiScale-height;}
    const gfx::Rect area(std::clamp(x,view.x,std::max(view.x,view.x2()-width)),std::clamp(y,view.y,std::max(view.y,view.y2()-height)),width,height);

    popup.setBounds(area);

    for(const auto& tool:legacyToolGroups()[index]) {

      const bool available=isToolAvailableForSession(tool.id);

      auto item=new PixelButton(font_,skin_,U"",[]{});

      item->iconGroupIndex=int(buttons.size());item->iconGroupCount=int(group.size());

      item->hover=[this,label=std::u32string(tool.label),available]{status_=label+(available?U"":U" \u00b7 \u672a\u63a5\u5165");invalidate();};

      item->iconSkin=&toolIcons_;item->icon=std::string(tool.icon)+"-normal";

      item->setEnabled(available);

      item->active=activeRailTool()==tool.id;

      if(available) item->Click.connect([this,command=tool.command,id=std::string(tool.id)]{if(id=="magic-eraser"){useMagicEraserTool();return;}if(id=="liquify"){runShortcutCommand("tool.liquify");return;}if(id=="smooth"){useSmoothTool();return;}if(id=="airbrush"){useAirbrushTool();return;}if(id=="move.slice"){useSliceTool();return;}if(id=="move.move"){useMoveTool();return;}if(id=="text"){useTextTool();return;}if(id=="eyedropper"){useEyedropperTool();return;}if(id=="zoom"){useZoomTool();return;}if(id=="rotate"){runShortcutCommand("tool.rotate");return;}if(id=="line.line" || id=="line.curve" || id=="shape.rectangle-outline" || id=="shape.rectangle" || id=="shape.ellipse-outline" || id=="shape.ellipse" || id=="shape.polygon" || id=="shape.freeform"){useShapeTool(id=="line.curve"?ShapeKind::Curve:id=="shape.freeform"?ShapeKind::Freeform:id=="shape.polygon"?ShapeKind::Polygon:id=="line.line"?ShapeKind::Line:id=="shape.rectangle-outline"?ShapeKind::RectangleOutline:id=="shape.rectangle"?ShapeKind::Rectangle:id=="shape.ellipse-outline"?ShapeKind::EllipseOutline:ShapeKind::Ellipse);return;}if(id=="fill.bucket"){useFillTool();return;}if(id=="fill.gradient"){useGradientTool();return;}if(command<0){int kind=id=="selection.ellipse"?1:id=="selection.lasso"?2:id=="selection.polygon-lasso"?3:id=="selection.magic"?4:id=="selection.brush"?5:0;useSelectionTool(kind);return;}currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().selectionTool=false;currentTools().shapeTool=false;currentTools().eyedropperTool=false;currentTools().zoomTool=false;currentTools().gradientTool=false;currentTools().fillTool=false;currentTools().handTool=command==5;currentTools().eraser=command==2;refresh();});

      if(available)item->Click.connect([window=&popup]{window->closeWindow(nullptr);});

      popup.addChild(item);buttons.push_back(item);

    }

    auto place=[window=&popup,buttons]{const auto box=window->bounds();for(int i=0;i<int(buttons.size());++i)buttons[i]->setBounds(gfx::Rect(box.x+i*14*uiScale,box.y,15*uiScale,16*uiScale));};

    popup.Resize.connect([place](ui::ResizeEvent&){place();});place();
    popup.Close.connect([this](ui::CloseEvent&){toolRailFlyoutOpen_=false;raiseDockWidgets();invalidate();});
    std::vector<std::pair<gfx::Point,ui::Widget*>> previousRailHits;
    if(smoke)for(auto button:toolRail_)if(button->isEnabled()&&button->isVisible()){const auto screen=display()->nativeWindow()->pointToScreen(button->bounds().center());previousRailHits.push_back({screen,manager()->pickFromScreenPos(screen)});}
    toolRailFlyoutOpen_=true;raiseDockWidgets();invalidate();
    popup.openWindow();

    if(smoke){

      if(popup.isForeground())throw std::runtime_error("Tool flyout must not block background hover");

      for(auto button:toolRail_)if(button->isEnabled() && button->isVisible()){

        const auto point=display()->nativeWindow()->pointToScreen(button->bounds().center());

        if(auto picked=manager()->pickFromScreenPos(point);picked!=button){auto rect=[](gfx::Rect r){return std::to_string(r.x)+","+std::to_string(r.y)+","+std::to_string(r.w)+","+std::to_string(r.h);};throw std::runtime_error("Tool flyout blocked another rail button side="+std::to_string(toolRailSide_)+" button="+rect(button->bounds())+" popup="+rect(popup.bounds())+" editor="+rect(bounds())+" display="+rect(display()->bounds())+" picked="+(picked?rect(picked->bounds()):std::string("null")));}

      }

      for(int i=0;i<int(buttons.size());++i){const auto box=buttons[i]->bounds();if(box.w!=15*uiScale || box.h!=16*uiScale || box.y!=buttons[0]->bounds().y || (i && box.x!=buttons[i-1]->bounds().x2()-uiScale))throw std::runtime_error("Tool flyout must be one connected horizontal row");if(buttons[i]->active!=(activeRailTool()==group[i].id))throw std::runtime_error("Tool flyout selection mismatch");}

      if(smokeChoice>=0)buttons.at(std::size_t(smokeChoice))->Click();
      popup.closeWindow(nullptr);
      if(toolRailFlyoutOpen_)throw std::runtime_error("Tool flyout close retained raised rail state");
      for(const auto& hit:previousRailHits)if(manager()->pickFromScreenPos(hit.first)!=hit.second)throw std::runtime_error("Tool flyout close failed to restore prior floating hit order");

    }

  }

void Editor::createToolRail() {

    toolIcons_.colors=skin_.colors;

    toolIcons_.assets.colors=skin_.assets.colors;

    toolIcons_.monochromeIcons=true;

    for(std::size_t index=0;index<legacyToolGroups().size();++index) {

      const auto& group=legacyToolGroups()[index];

      for(const auto& tool:group) {

        for(const auto* suffix:{"-normal","-normal-disabled"}) {

          const auto name=std::string(tool.icon)+suffix;

          const auto atlas=skin_.assets.patches.find("icon."+name);toolIcons_.assets.patches[name]=atlas==skin_.assets.patches.end()?importSkinPng(assets_/"tool-icons"/(name+".png"),32):atlas->second;

        }

      }

      const auto& first=group.front();

      auto b=first.command>=0?commands_[first.command]:button(first.label,[]{});

      if(first.command<0) commands_.push_back(b);

      b->caption.clear();b->skinStyle="icon_button";b->iconGroupCount=1;

      b->iconSkin=&toolIcons_;b->icon=std::string(first.icon)+"-normal";

      b->mutedIcon=first.command<0 && index!=2 && index!=3 && index!=4 && index!=5 && index!=6 && index!=7 && index!=8 && index!=9 && index!=11 && index!=12;if(index==2)b->Click.connect([this]{runShortcutCommand("tool.liquify");});if(index==4)b->Click.connect([this]{useShapeTool(currentTools().shapeKind==ShapeKind::Line?ShapeKind::Rectangle:currentTools().shapeKind);});if(index==5)b->Click.connect([this]{useShapeTool(currentTools().shapeKind==ShapeKind::Curve?ShapeKind::Curve:ShapeKind::Line);});if(index==6)b->Click.connect([this]{if(currentTools().rememberGradientTool)useGradientTool();else useFillTool();});if(index==7)b->Click.connect([this]{useTextTool();});if(index==8)b->Click.connect([this]{useMoveTool();});if(index==9)b->Click.connect([this]{useEyedropperTool();});if(index==11)b->Click.connect([this]{useZoomTool();});if(index==12)b->Click.connect([this]{runShortcutCommand("tool.rotate");});if(index==3)b->Click.connect([this]{useSelectionTool();});

      b->hover=[this,index] {

        const auto& group=legacyToolGroups()[index];

        const auto& primary=group[index==3?currentTools().selectionKind:index==6 && currentTools().rememberGradientTool?1:0];

        status_=std::u32string(primary.label)+(primary.command<0 && index!=2 && index!=3 && index!=4 && index!=5 && index!=6 && index!=7 && index!=8 && index!=9 && index!=11 && index!=12?U" · 未接入":U"");

        if(group.size()>1) status_+=U" · 单击、长按或右键展开工具组";

        invalidateRect(gfx::Rect(bounds().x,bounds().y2()-36,bounds().w,36));

      };

      if(group.size()>1) {

        b->context=[this,index]{showToolGroup(index);};

        b->openGroup=[this,index]{showToolGroup(index);};

      }

      toolRail_.push_back(b);

    }

  }


void Editor::saveSmoothPreferences(){if(smoke_&&!workspacePresetTestDirectory_)return;try{const auto p=(smoke_?*workspacePresetTestDirectory_:palettePreferencePath().parent_path())/"smooth-brush-v1.txt";std::filesystem::create_directories(p.parent_path());std::ofstream out(p);out.exceptions(std::ios::failbit|std::ios::badbit);out<<"smooth-v1 "<<currentTools().smoothStrength<<' '<<currentTools().smoothAngle<<' '<<currentTools().smoothBrush.size<<' '<<int(currentTools().smoothBrush.shape)<<'\n';}catch(...){status_=U"平滑参数已调整，但偏好保存失败";}}
void Editor::createSmoothOptions(){

 auto label=[&](const char32_t* text){auto b=button(text,[]{});b->labelOnly=true;b->setEnabled(false);smoothControls_.push_back({b,font_.measure(text)});};
 auto number=[&](int field,const char32_t* suffix){auto e=new PixelEntry(font_,skin_);e->numeric=true;e->deferredNumeric=true;e->numericMounted=[this,field]{return currentTools().smoothTool&&(field!=1||(currentTools().smoothBrush.size>1&&currentTools().smoothBrush.shape!=BrushShape::Round));};e->numericMinimum=field==0?1:field==1?-180:0;e->numericMaximum=field==0?64:field==1?180:100;e->numericValue=[this,field]{return double(field==0?currentTools().smoothBrush.size:field==1?currentTools().smoothAngle:currentTools().smoothStrength);};e->suffix=suffix;e->setFixedContentWidth(e->widthForValue(field==1?U"-180":U"100"));addChild(e);smoothControls_.push_back({e,e->widthForValue(field==1?U"-180":U"100")});auto commit=[this,e,field]{if(smoothDragging_)return;try{std::size_t used=0;const auto v=std::stod(e->text(),&used);if(used!=e->text().size()||!std::isfinite(v))return;const int value=int(std::floor(std::clamp(v,-1000.0,1000.0)+.5));if(field==0){currentTools().smoothBrush.size=std::clamp(value,1,64);saveSmoothPreferences();}else{(field==1?currentTools().smoothAngle:currentTools().smoothStrength)=std::clamp(value,field==1?-180:0,field==1?180:100);saveSmoothPreferences();}layoutToolOptions();invalidateRect(canvasViewport());}catch(...){}};e->deferredCommit=commit;e->Change.connect(commit);e->blur=commit;e->accept=[this,commit]{commit();closeParameterRange();requestFocus();};e->cancel=[this]{closeParameterRange();};e->focus=[this,e,field]{openParameterRange(e,field==0?1:field==1?-180:0,field==0?64:field==1?180:100);};return e;};
 auto shape=button(U"",[this]{PixelMenu menu(skin_);const char32_t* names[]={U"圆形",U"方形",U"直线"};const char* icons[]={"brush-round","brush-square","brush-line"};for(int i=0;i<3;++i){auto row=new PixelMenuItem(font_,skin_,names[i]);row->iconSkin=&toolIcons_;row->icon=icons[i];row->checked=[this,i]{return int(currentTools().smoothBrush.shape)==i;};row->Click.connect([this,i]{currentTools().smoothBrush.shape=BrushShape(i);saveSmoothPreferences();layoutToolOptions();invalidateRect(canvasViewport());});menu.addChild(row);}const auto r=smoothControls_[0].first->bounds();menu.showPopup({r.x,r.y2()+uiGap*uiScale},display());requestFocus();});shape->iconSkin=&toolIcons_;smoothControls_.push_back({shape,15});
 number(0,U"px");label(U"角度");smoothAngleInput_=number(1,U"°");label(U"效果强度");smoothStrengthInput_=number(2,U"%");

}

}



