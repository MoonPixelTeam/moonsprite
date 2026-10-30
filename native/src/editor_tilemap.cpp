#include "free_tile_selection_target.h"
#include "editor_implementation.h"
#include "editor.h"
#include "free_tile_instances_panel.h"
#include <set>
namespace moon::editor {
// Legacy useCanvasLayerFeedback + canvas-render-content: transient source-over
// contrast pixels, not a document edit, an outline, or an opacity/blend preview.
void Editor::showFreeTileInstanceFeedback(const std::string& id){
 if(!runtimePreferences_.flag("tools.moveLayerClickFlashEnabled"))return;
 freeTileFlashSurface_.reset();
 freeTileFlashTimer_.stop();
 freeTileFlashTimer_.setInterval(std::array<int,3>{80,120,180}[std::clamp(runtimePreferences_.index("tools.moveLayerClickFlashDuration.Select"),0,2)]);
 freeTileFlashInstance_=id;freeTileFlashCel_=document.cel().id;freeTileFlashIdentity_=document.identity();freeTileFlashStarted_=GetTickCount64();freeTileFlashTimer_.start();invalidateRect(canvasViewport());
}
void Editor::paintFreeTileInstanceFeedback(ui::Graphics& g,const gfx::Rect& cv){
 if(freeTileFlashInstance_.empty()||freeTileFlashIdentity_!=document.identity()||freeTileFlashCel_!=document.cel().id||document.layer().kind!="free-tile"||!document.layer().freeTiles||!document.cel().freeTiles||!document.cel().surface)return;
 if(GetTickCount64()-freeTileFlashStarted_>=std::uint64_t(freeTileFlashTimer_.interval()))return;
 const auto& instances=document.cel().freeTiles->instances;const auto found=std::find_if(instances.begin(),instances.end(),[this](const auto& i){return i.id==freeTileFlashInstance_;});if(found==instances.end())return;const auto& instance=*found;
 const auto& sources=document.layer().freeTiles->sources;const auto source=std::find_if(sources.begin(),sources.end(),[&](const auto& s){return s.id==(instance.sourceId.empty()?instance.tileId:instance.sourceId)||s.tilesetId==(instance.sourceId.empty()?instance.tileId:instance.sourceId);});if(source==sources.end()||!source->visible)return;
 const auto& sets=document.timeline().state().tilesets;const auto set=std::find_if(sets.begin(),sets.end(),[&](const auto& s){return s.id==source->tilesetId;});const auto bounds=document.freeTileInstanceBounds(instance.id);if(set==sets.end()||!bounds)return;
 const int left=std::max(0,bounds->x),top=std::max(0,bounds->y),right=std::min(document.width(),bounds->x+bounds->w),bottom=std::min(document.height(),bounds->y+bounds->h);if(right<=left||bottom<=top)return;
 const int w=right-left,h=bottom-top;
 if(!freeTileFlashSurface_||freeTileFlashRevision_!=document.revision()){const auto pixels=tiles::readTile(*set,0);std::vector<Pixel> overlay(std::size_t(w)*h);
  for(int y=0;y<h;++y)for(int x=0;x<w;++x){int sx=left+x-document.cel().surface->offsetX-instance.x,sy=top+y-document.cel().surface->offsetY-instance.y;if(instance.flipHorizontal)sx=-sx-1;if(instance.flipVertical)sy=-sy-1;const int a=sx,b=sy;switch(instance.rotation){case 1:sx=b;sy=-a-1;break;case 2:sx=-a-1;sy=-b-1;break;case 3:sx=-b-1;sy=a;break;}sx-=source->offsetX;sy-=source->offsetY;if(sx<0||sy<0||sx>=set->tileWidth||sy>=set->tileHeight)continue;const Pixel p=pixels[std::size_t(sy)*set->tileWidth+sx];const Pixel value=((p&255)*.2126+((p>>8)&255)*.7152+((p>>16)&255)*.0722)>145?0:0xffffff;overlay[std::size_t(y)*w+x]=(p&0xff000000)|value;}
  freeTileFlashSurface_=os::instance()->makeRgbaSurface(w,h);if(!freeTileFlashSurface_)return;uploadRgbaRegion(*freeTileFlashSurface_,overlay.data(),w,h,w);freeTileFlashRevision_=document.revision();freeTileFlashBounds_={left,top,w,h};}
 const auto edge=[](double n){return int(std::clamp(std::floor(n+.5),-10000000.,10000000.));};const double z=canvasScale();const int x=edge(cv.x+left*z),y=edge(cv.y+top*z);ui::Paint paint;paint.blendMode(os::BlendMode::SrcOver);g.drawSurface(freeTileFlashSurface_.get(),{0,0,w,h},{x,y,edge(cv.x+right*z)-x,edge(cv.y+bottom*z)-y},os::Sampling(os::Sampling::Filter::Nearest),&paint);
}
void Editor::createTilesetPanel(){
 if(!smoke_)try{const auto path=palettePreferencePath().parent_path()/"free-tile-instance-layout-v1.txt";if(std::filesystem::exists(path)){std::ifstream in(path);std::string value,extra;if(!(in>>value)||(value!="separate"&&value!="integrated")||(in>>extra))throw std::runtime_error("Invalid free tile instance layout");freeTileInstancesSeparate_=value=="separate";}}catch(const std::exception& e){freeTileInstanceLayoutReadable_=false;status_=U"实例栏目偏好读取失败："+unicodeText(e.what());}
 freeTileInstanceSettings_=button(U"",[this]{showFreeTileInstancePanelSettings();});freeTileInstanceSettings_->iconSkin=&toolIcons_;freeTileInstanceSettings_->icon="properties";freeTileInstanceSettings_->setVisible(false);

 freeTileInstancesPanel_=new FreeTileInstancesPanel(font_,skin_,toolIcons_,document);addChild(freeTileInstancesPanel_);freeTileInstancesPanel_->setVisible(false);freeTileInstancesPanel_->caption=[](const std::string& name){return unicodeText(name);};freeTileInstancesPanel_->changed=[this]{refresh();};freeTileInstancesPanel_->flashInstance=[this](const std::string& id){showFreeTileInstanceFeedback(id);};
 freeTileFlashTimer_.Tick.connect([this]{freeTileFlashSurface_.reset();freeTileFlashInstance_.clear();freeTileFlashTimer_.stop();invalidateRect(canvasViewport());});
 menuCommands_.bind("newFreeTileLayer",{[this]{showFreeTileLayerDialog();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy();},{}});
 tilesetDelete_=new PixelButton(font_,skin_,U"",[this]{if(tilesetPanel_)tilesetPanel_->deleteSelection();});tilesetDelete_->iconSkin=&toolIcons_;tilesetDelete_->icon="delete";addChild(tilesetDelete_);tilesetDelete_->setVisible(false);
 tilesetAdd_=new PixelButton(font_,skin_,U"",[this]{if(tilesetPanel_)tilesetPanel_->addSource();});tilesetAdd_->iconSkin=&toolIcons_;tilesetAdd_->icon="plus";addChild(tilesetAdd_);tilesetAdd_->setVisible(false);
 tilesetPanel_=new TilesetPanel(font_,skin_,toolIcons_,document);addChild(tilesetPanel_);tilesetPanel_->setVisible(false);tilesetPanel_->context=[this]{showColumnContextMenu(Column(11));};tilesetPanel_->changed=[this]{refresh();};
 // Legacy panel-preferences localStorage keys remain independent by panel kind.
 if(!smoke_)try{std::array<int,2> sizes{2,2};for(int type=0;type<2;++type){const auto path=palettePreferencePath().parent_path()/(type?"free-tile-swatch-size.txt":"tileset-swatch-size.txt");std::ifstream in(path);std::string value,extra;if(in>>value&&!(in>>extra)){const auto& keys=TilesetPanel::swatchSizeKeys;const auto found=std::find(keys.begin(),keys.end(),value);if(found!=keys.end())sizes[type]=int(found-keys.begin());}}tilesetPanel_->restoreSwatchSizes(sizes);}catch(const std::exception& e){status_=U"瓦片尺寸偏好读取失败："+unicodeText(e.what());}
 tilesetPanel_->swatchSizeChanged=[this](bool free,int index){if(smoke_)return;try{const auto path=palettePreferencePath().parent_path()/(free?"free-tile-swatch-size.txt":"tileset-swatch-size.txt");std::filesystem::create_directories(path.parent_path());const std::string key=TilesetPanel::swatchSizeKeys[index];writeExportBytesAtomic(path,{key.begin(),key.end()});}catch(const std::exception& e){status_=U"瓦片尺寸偏好保存失败："+unicodeText(e.what());}};

 menuCommands_.bind("newTilemapLayer",{[this]{showTilemapLayerDialog(false);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!document.active();},{}});
 menuCommands_.bind("convertLayerToTilemap",{[this]{showTilemapLayerDialog(true);},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!document.active()&&document.layer().kind.empty()&&!document.layerEffectivelyLocked(document.layer());},{}});
 menuCommands_.bind("toggleTilesetPanel",{[this]{tilesetPanelOpen_=!tilesetPanelOpen_;initializeDocking();docking_.custom=true;if(tilesetPanelOpen_)docking_.select(11);refresh();saveWorkspaceSizes();},[this]{return pending_==Pending::None;},[this]{return tilesetPanelOpen_;}});
 menuCommands_.bind("deleteTilesetSelection",{[this]{tilesetPanel_->deleteSelection();},[this]{return pending_==Pending::None&&tilesetPanel_->canDelete();},{}});
 menuCommands_.bind("addFreeTileSource",{[this]{tilesetPanel_->addSource();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&tilesetPanel_->canAddSource();},{}});
 tilesetPanel_->sourceSamplingChanged=[this](bool active,ColorEditorPopup* target){setColorEditorSampling(active,target);};tilesetPanel_->sourceSamplingInput=[this](ui::Message* msg){return processColorEditorCanvasSampling(msg);};
 tilesetPanel_->sourceColors=[this]{return runtimePreferences_.layerDisplayColors;};tilesetPanel_->sourceColorPresets=runtimePreferences_.layerDisplayColors;tilesetPanel_->sourceColorStorage=smoke_?assets_.parent_path()/"color-editor-smoke-size.txt":palettePreferencePath().parent_path()/"color-editor-free-source-size.txt";
 menuCommands_.bind("openFreeTileSourceProperties",{[this]{tilesetPanel_->sourceColorPresets=runtimePreferences_.layerDisplayColors;tilesetPanel_->openSelectedSourceProperties();},[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&tilesetPanel_->canAddSource();},{}});

 const char* blocked[]{"resizeImage","resizeCanvas","cropCanvas","trimCanvas","trimCurrentFrame","duplicateLayer","createLinkedLayer","mergeLayerDown","mergeSelectedLayers","mergeLayerGroup","mergeVisibleLayers","connectCels","disconnectCels","addFrame","addLinkedFrame","deleteFrame","pasteFrames","pasteCels","flipHorizontal","flipVertical","rotate90","rotate180","rotate270","centerContent","delete","openColorAdjustment","openColorReplacement","generateTransformTween","generateCrossfadeTween"};
 for(auto id:blocked){auto it=menuItems_.find(id);if(it==menuItems_.end())continue;auto previous=it->second->available;const bool paintFlip=std::string(id)=="flipHorizontal"||std::string(id)=="flipVertical";it->second->available=[this,previous,paintFlip]{return (!document.hasTilemapContent()||(paintFlip&&document.paintCellFlipAvailable()))&&(!previous||previous());};}
 // Keep unsupported free-instance operations visibly disabled, using existing entries.
 const std::set<std::string> freeBlocked{"imageResize","canvasResize","cropCanvas","trimCanvas","trimCurrentFrame","duplicateLayer","mergeLayerDown","mergeSelectedLayers","mergeLayerGroup","mergeVisibleLayers","rotateContent180","rotateContentCounterClockwise","rotateContentClockwise","centerContentBoth","centerContentHorizontal","centerContentVertical","fillForeground","invertColors","replaceColor","quickAntiAlias","adjustmentColorBalance","adjustmentBrightnessContrast","adjustmentHueSaturation","adjustmentCurves","gradientMap","convolution","lcdScreen","splitLayerStyles","pasteToCurrentCell"};
 for(auto& [id,item]:menuItems_)if(freeBlocked.count(id)||id.rfind("filter:",0)==0){auto previous=item->available;item->available=[this,previous]{return !document.hasFreeTileContent()&&(!previous||previous());};}
 // Legacy beginLayerTransform/beginFreeTransform: single editable source target.
 for(const auto* id:{"transform","freeTransform"}){auto found=menuItems_.find(id);if(found==menuItems_.end())continue;auto previous=found->second->available;const bool free=std::string(id)=="freeTransform";found->second->available=[this,previous,free]{
  if(!document.hasFreeTileContent())return !previous||previous();
  if(!documentOpen_||homeOpen_||pending_!=Pending::None||historyGestureBusy()||frameSelectionExplicit_||!freeTileSelectionTargetBounds(document)||document.hasSelectedGroups())return false;
  for(const auto& layer:document.timelineSelection().layers)if(layer!=document.layer().id)return false;
  for(const auto& id:document.timelineSelection().cels){const auto* c=document.timeline().findCelById(id);if(!c||c->layerId!=document.layer().id||c->frameId!=document.frame().id)return false;}
  if(free)return bool(document.selection());
  const auto b=*freeTileSelectionTargetBounds(document);return b.x<document.width()&&b.y<document.height()&&std::int64_t(b.x)+b.w>0&&std::int64_t(b.y)+b.h>0;
 };}
 for(const auto* id:{"flipHorizontal","flipVertical"}){auto it=menuItems_.find(id);if(it==menuItems_.end())continue;auto previous=it->second->available;it->second->available=[this,previous]{
  if((document.hasTilemapContent()||document.hasFreeTileContent())&&!document.selection()&&!document.floating()&&!(document.layer().kind=="free-tile"&&!document.selectedFreeTileInstances().empty()))return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy()&&!timelineContentFlipTargets(document).empty();
  if(!document.hasFreeTileContent())return !previous||previous();
  if(!documentOpen_||homeOpen_||pending_!=Pending::None||historyGestureBusy()||document.layer().kind!="free-tile"||!document.activeMaskId().empty()||document.hasSelectedGroups()||document.layerEffectivelyLocked(document.layer())||!document.layerEffectivelyVisible(document.layer()))return false;
  if(auto target=document.floatingTransform())return !target->quad&&bool(freeTileSelectionTargetBounds(document));
  if(document.selection())return bool(freeTileSelectionTargetBounds(document));
  const auto ids=document.selectedFreeTileInstances();if(!document.cel().freeTiles)return false;for(const auto& i:document.cel().freeTiles->instances)if(!i.locked&&std::find(ids.begin(),ids.end(),i.id)!=ids.end())return true;return false;
 };}
 // Image and instance paste both use the legacy free-tile transactions.
 // Paste targets any editable free-tile cel, independent of the instance view.
 // Canvas pixel selection is copied unless the instance list owns clipboard scope.
 for(const auto* id:{"copy","cut","paste"}){auto found=menuItems_.find(id);if(found==menuItems_.end())continue;auto previous=found->second->available;const bool paste=std::string(id)=="paste";found->second->available=[this,previous,paste]{
  if(paletteFocused_||!document.hasFreeTileContent())return !previous||previous();
  if(document.active())return false;
  if(paste){if(document.layer().kind!="free-tile"||!document.layer().freeTiles||!document.cel().freeTiles||!document.activeMaskId().empty()||document.layerEffectivelyLocked(document.layer()))return false;}
  else if(document.selection()&&!freeTileInstancesPanel_->clipboardScope()){if(document.layer().kind!="free-tile"||!document.activeMaskId().empty()||!pixelClipboardContext())return false;}
  else if(!document.freeTileInstanceView()||document.selectedFreeTileInstances().empty())return false;
  return !previous||previous();
 };}

}
void Editor::setFreeTileInstancePanelLayout(bool separate,bool persist){
 if(persist&&!smoke_){if(!freeTileInstanceLayoutReadable_)throw std::runtime_error("Instance panel preferences are unreadable");const std::string value=separate?"separate\n":"integrated\n";writeExportBytesAtomic(palettePreferencePath().parent_path()/"free-tile-instance-layout-v1.txt",{value.begin(),value.end()});}
 freeTileInstancesSeparate_=separate;
 // Legacy separate panel switches the ordinary layer view when integrated is chosen.
 if(!separate&&document.layer().kind=="free-tile"&&!document.active())document.setFreeTileInstanceView(true);
 refresh();saveWorkspaceSizes();
}
void Editor::showFreeTileInstancePanelSettings(bool verify){
 if(pending_!=Pending::None||document.active())return;
 FreeTileInstancePanelSettingsDialog popup(font_,skin_,toolIcons_,freeTileInstancesSeparate_,[this](bool separate){try{setFreeTileInstancePanelLayout(separate);}catch(const std::exception& e){status_=U"实例栏目偏好保存失败："+unicodeText(e.what());refresh();}});
 popup.setDisplay(display(),false);const auto size=popup.minimumDialogSize(0);const auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{timer.stop();popup.smokeChange();});timer.start();}popup.openWindowInForeground();requestFocus();
}
void Editor::syncFreeTileInstancePanel(){
 if(!freeTileInstancesPanel_)return;
 const bool target=documentOpen_&&!homeOpen_&&document.activeMaskId().empty()&&document.layer().kind=="free-tile"&&document.layer().freeTiles&&document.cel().freeTiles;
 const std::string key=std::to_string(document.identity())+"/"+(target?document.layer().id+"/"+document.frame().id:"none");
 const int count=target?int(document.cel().freeTiles->instances.size()):0;
 const bool open=freeTileInstancesSeparate_&&count>0&&(!freeTileInstanceAutoSeparate_||key!=freeTileInstanceAutoKey_||freeTileInstanceAutoCount_==0||count>freeTileInstanceAutoCount_);
 if(!freeTileInstancesSeparate_||count==0)freeTileInstancesOpen_=false;
 else if(open){freeTileInstancesOpen_=true;initializeDocking();docking_.custom=true;docking_.select(13);}
 freeTileInstanceAutoKey_=key;freeTileInstanceAutoCount_=count;freeTileInstanceAutoSeparate_=freeTileInstancesSeparate_;
 if(dockingTabs_[13])dockingTabs_[13]->caption=U"实例图层 · "+document.layer().name;
 freeTileInstancesPanel_->setSeparate(freeTileInstancesSeparate_);
}
void Editor::layoutFreeTileInstancePanel(){
 if(!freeTileInstancesPanel_||!freeTileInstanceSettings_)return;
 const int id=freeTileInstancesSeparate_?13:2;
 const bool show=documentOpen_&&!homeOpen_&&columnShown(id)&&(freeTileInstancesSeparate_?freeTileInstancesOpen_:document.freeTileInstanceView());
 freeTileInstancesPanel_->setVisible(show);freeTileInstanceSettings_->setVisible(show);if(!show)return;
 const auto chrome=columnChrome(id);const auto dock=docking_.groups[docking_.groupOf(id)].dock;freeTileInstancesPanel_->setSideDocked(dock==panels::Dock::Left||dock==panels::Dock::Right);freeTileInstancesPanel_->setDensity(timelineDensity_);freeTileInstancesPanel_->setSeparate(freeTileInstancesSeparate_);freeTileInstancesPanel_->setBounds(toDisplay(freeTileInstancesSeparate_?chrome.content:(chrome.actions|chrome.content)));freeTileInstancesPanel_->sync(pending_==Pending::None);
 freeTileInstanceSettings_->setBounds(toDisplay({chrome.actions.x2()-15,chrome.actions.y,15,15}));freeTileInstanceSettings_->setEnabled(pending_==Pending::None&&!document.active());
}

void Editor::syncTilesetPanel(){if(tilesetPanel_){tilesetPanel_->sync();tilesetDelete_->setEnabled(pending_==Pending::None&&tilesetPanel_->canDelete());tilesetAdd_->setEnabled(pending_==Pending::None&&tilesetPanel_->canAddSource());}}
void Editor::layoutTilesetPanel(){if(!tilesetPanel_)return;const bool show=columnShown(11)&&documentOpen_&&!homeOpen_;tilesetPanel_->setVisible(show);tilesetDelete_->setVisible(show);tilesetAdd_->setVisible(show&&document.layer().kind=="free-tile");if(!show){tilesetPanel_->cancelPending();return;}auto chrome=columnChrome(11);tilesetDelete_->setBounds(toDisplay({chrome.actions.x2()-15,chrome.actions.y,15,15}));tilesetAdd_->setBounds(toDisplay({chrome.actions.x2()-32,chrome.actions.y,15,15}));tilesetPanel_->setBounds(toDisplay(chrome.content));}

void Editor::showTilemapLayerDialog(bool convert){
 if(!documentOpen_||homeOpen_||pending_!=Pending::None||document.active())return;TilemapLayerDialog popup(font_,skin_,toolIcons_,document,convert);popup.accept=[this,convert](std::u32string name,int width,int height,const std::string& shared){const bool changed=convert?document.convertLayerToTilemap(width,height,std::move(name)):document.createTilemapLayer(width,height,std::move(name),shared);if(changed){tilesetPanelOpen_=true;initializeDocking();docking_.custom=true;docking_.select(11);}return changed;};popup.setDisplay(display(),false);const auto size=popup.minimumDialogSize(280*uiScale);const auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});popup.openWindowInForeground();requestFocus();refresh();saveWorkspaceSizes();
}
void Editor::showFreeTileLayerDialog(int verify){
 if(!documentOpen_||homeOpen_||pending_!=Pending::None||historyGestureBusy())return;
 const auto identity=document.identity();FreeTileLayerDialog popup(font_,skin_,toolIcons_,document);
 popup.accept=[this,identity](std::u32string name,const std::string& shared){if(document.identity()!=identity)return false;const bool changed=document.createFreeTileLayer(std::move(name),shared);if(changed){tilesetPanelOpen_=true;initializeDocking();docking_.custom=true;docking_.select(11);}return changed;};
 popup.setDisplay(display(),false);const auto size=popup.minimumDialogSize(260*uiScale);const auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});ui::Timer timer(50,&popup);if(verify){timer.Tick.connect([&]{timer.stop();popup.smoke(verify);});timer.start();}popup.openWindowInForeground();timer.stop();requestFocus();refresh();if(!verify)saveWorkspaceSizes();
}
bool Editor::processFreeTileInput(ui::Message* msg){
 if(document.freeTileInstanceFlagsActive()||document.freeTileInstancePropertiesActive())return false;
 const bool dragging=document.freeTilePlacementActive();
 if(dragging&&(msg->type()==ui::kFocusLeaveMessage||!hasCapture()||pending_!=Pending::None||homeOpen_)){document.cancelFreeTilePlacement();if(hasCapture())releaseMouse();refresh();return false;}
 if(dragging&&(msg->type()==ui::kKeyDownMessage||msg->type()==ui::kKeyUpMessage)){const auto key=static_cast<ui::KeyMessage*>(msg);if(key->scancode()==ui::kKeyEsc){document.cancelFreeTilePlacement();if(hasCapture())releaseMouse();refresh();}else if(document.freeTileInstanceMoving()){ui::MouseMessage move(ui::kMouseMoveMessage,os::PointerType::Mouse,ui::kButtonLeft,key->modifiers(),movePointer_);processFreeTileInput(&move);}return true;}
 auto mouse=dynamic_cast<ui::MouseMessage*>(msg);if(!mouse)return false;
 if(dragging){try{
  if(msg->type()==ui::kMouseUpMessage&&mouse->button()==ui::kButtonNone){document.cancelFreeTilePlacement();if(hasCapture())releaseMouse();refresh();return true;}
  if(msg->type()==ui::kMouseMoveMessage||(msg->type()==ui::kMouseUpMessage&&mouse->button()==strokeButton_)){
   const auto p=canvasPoint(mouse->position());if(document.freeTileInstanceMoving()){movePointer_=mouse->position();const auto delta=constrainedSelectionDelta({p.x-moveStart_.x,p.y-moveStart_.y},moveModifierHeld("constrainAxis",*mouse));document.previewFreeTileInstanceMove(delta.x,delta.y);}else document.updateFreeTilePlacement(p);
   if(msg->type()==ui::kMouseUpMessage){document.commitFreeTilePlacement();if(hasCapture())releaseMouse();refresh();}
  }
  if(previewPanel_&&previewPanel_->isVisible())previewPanel_->invalidate();invalidateRect(canvasViewport());
 }catch(const std::exception& e){document.cancelFreeTilePlacement();if(hasCapture())releaseMouse();status_=unicodeText(e.what());refresh();}return true;}
 if(!documentOpen_||homeOpen_||pending_!=Pending::None||document.layer().kind!="free-tile"||!document.activeMaskId().empty()||!ordinaryBrushTool()||!document.freeTilePaintMode()||handTool_||spaceHeld_||msg->type()!=ui::kMouseDownMessage||!(mouse->left()||mouse->right())||!canvasViewport().contains(mouse->position())||!canvasDocumentContains(mouse->position()))return false;
 try{hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;strokeButton_=mouse->button();if(document.beginFreeTilePlacement(canvasPoint(mouse->position()),eraser_,mouse->right())){captureMouse();invalidateRect(canvasViewport());}}catch(const std::exception& e){document.cancelFreeTilePlacement();status_=unicodeText(e.what());refresh();}return true;
}

}
