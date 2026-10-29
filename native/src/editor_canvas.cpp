#include "raster_geometry.h"
#include "editor_implementation.h"
#include "editor.h"
#include "free_tile_instances_panel.h"

namespace moon::editor {
bool Editor::processAirbrushInput(ui::Message* msg){
 if(!airbrushTool_)return false;
 if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kMouseMoveMessage&&msg->type()!=ui::kMouseUpMessage)return false;
 auto m=static_cast<ui::MouseMessage*>(msg);auto p=canvasPoint(m->position());
 if(airbrushDragging_){if(!hasCapture()||!document.strokeActive()){cancelStroke();return true;}if(msg->type()==ui::kMouseMoveMessage){const auto snapped=gridSnapPoint(p);airbrushCenter_={snapped.x,snapped.y};invalidateRect(canvasViewport());return true;}if(msg->type()==ui::kMouseUpMessage&&m->button()==strokeButton_){airbrushDragging_=false;airbrushTimer_.stop();Document::HistoryLabelScope label(document,U"喷枪");const bool changed=document.commitStroke();if(changed)usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-usageStrokeStarted_));usageStrokeStarted_=0;if(hasCapture())releaseMouse();refresh();return true;}return true;}
 if(spaceHeld_||handTool_||eyedropperHeld_||eyedropperGesture_.active())return false;
 if(msg->type()==ui::kMouseDownMessage&&canvasViewport().contains(m->position())){if(!(m->left()||m->right())||document.active()||!canvasDocumentContains(m->position())||!(document.rasterToolsAvailable()||(document.activeMaskId().empty()&&document.layer().kind=="free-tile"&&!document.freeTilePaintMode())))return true;hideTimelineSelectionGuides();paletteFocused_=false;document.clearPaletteSelection();requestFocus();playing_=false;const auto snapped=gridSnapPoint(p);airbrushCenter_={snapped.x,snapped.y};strokeButton_=m->button();strokeColor_=m->right()?document.palette().secondary:ink_;usageStrokeStarted_=usage::now();document.beginStroke({snapped.x,snapped.y},strokeColor_,{},nullptr,0,nullptr,false);if(!document.strokeActive())return true;captureMouse();airbrushDragging_=true;try{sprayAirbrush();nextAirbrushAt_=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count()+airbrushSettings_.intervalMs;airbrushTimer_.start();}catch(...){cancelStroke();throw;}return true;}
 return canvasViewport().contains(m->position());
}

void Editor::wandTick(){

    if(selectionDragging_ && selectionKind_==4 && wandSource_ && (wandIdentity_!=document.identity() || wandContentRevision_!=document.contentRevision() || wandLayer_!=document.layer().id || wandFrame_!=document.frame().id)){if(wandIdentity_==document.identity())endSelectionGesture(true);else{selectionDragging_=false;wandRequest_.reset();++wandGeneration_;if(hasCapture())releaseMouse();}return;}

    if(wandWorker_.valid() && wandWorker_.wait_for(std::chrono::seconds(0))==std::future_status::ready){const auto generation=wandWorkerGeneration_;std::optional<SelectionMask> result;try{result=wandWorker_.get();}catch(const std::exception& e){if(selectionDragging_ && generation==wandGeneration_){endSelectionGesture(true);status_=U"魔棒失败："+unicodeText(e.what());refresh();}return;}if(selectionDragging_ && selectionKind_==4 && generation==wandGeneration_ && !wandRequest_){wandPreviewReady_=true;selectionPreview_=result;invalidateRect(canvasViewport());if(wandReleased_)endSelectionGesture(false);}}

    if(wandRequest_ && !wandWorker_.valid()){const auto p=*wandRequest_;wandRequest_.reset();const auto source=wandSource_;const auto options=wandOptions_;const int w=document.width(),h=document.height();wandWorkerGeneration_=wandGeneration_;std::packaged_task<std::optional<SelectionMask>()> task([source,options,w,h,p]{return magicWandSelection(*source,w,h,p.x,p.y,options);});wandWorker_=task.get_future();std::thread(std::move(task)).detach();}

  }

void Editor::requestWand(Point p){if(wandLastPoint_ && wandLastPoint_->x==p.x && wandLastPoint_->y==p.y)return;wandLastPoint_=SelectionPoint{p.x,p.y};wandPreviewReady_=false;wandRequest_=SelectionPoint{p.x,p.y};wandTick();}

bool Editor::gridSnapActive()const{return document.showCustomGrid()&&runtimePreferences_.flag("tools.gridAlignmentEnabled");}

Point Editor::gridSnapPoint(Point p,int ax,int ay)const{if(!gridSnapActive())return p;const auto q=snapPointToGrid({double(p.x-ax),double(p.y-ay)},document.customGrid());if(!std::isfinite(q.x)||!std::isfinite(q.y)||std::abs(q.x)>1000000||std::abs(q.y)>1000000)return p;return {int(q.x)+ax,int(q.y)+ay};}

Point Editor::gridSnapBrush(Point p)const{int w=brushFeedback_.brushProfiles_[eraser_?1:0].size,h=w;if(pencilImageBrush_){const double radians=std::fmod(pencilImageBrushAngle_,360)*3.14159265358979323846/180,c=std::abs(std::cos(radians)),v=std::abs(std::sin(radians));w=std::max(1,int(std::ceil(pencilImageBrush_->width*c+pencilImageBrush_->height*v-1e-9)));h=std::max(1,int(std::ceil(pencilImageBrush_->width*v+pencilImageBrush_->height*c-1e-9)));}return gridSnapPoint(p,w/2,h/2);}

void Editor::beginAlignmentMove(bool content){
 alignmentGuides_.clear();smartMoveEnabled_=runtimePreferences_.flag("tools.smartAlignmentEnabled");moveAlignmentThreshold_=runtimePreferences_.index("tools.alignmentThreshold.Number");
 std::vector<std::string> excluded;
 if(content){
  if(!document.timelineSelection().cels.empty()){for(const auto& id:document.timelineSelection().cels)if(const auto* cel=document.timeline().findCelById(id))excluded.push_back(cel->layerId);}
  else excluded=document.selectedLayerIdsWithGroups();
  if(excluded.empty()&&frameSelectionExplicit_){for(const auto& layer:document.timeline().state().layers)if(timeline::isLayerEffectivelyVisible(document.timeline().state(),layer)&&!timeline::isLayerEffectivelyLocked(document.timeline().state(),layer))excluded.push_back(layer.id);}
  if(excluded.empty())excluded.push_back(document.layer().id);
 }
 moveAlignmentTargets_=smartMoveEnabled_?alignmentLayerTargets(document.timeline(),document.frame().id,excluded,&alignmentBoundsCache_):std::vector<GridRect>{};
}
Point Editor::gridSnapMove(Point p,GridRect b){
 alignmentGuides_.clear();
 if(gridMoveEnabled_&&document.showCustomGrid()){
  const auto q=snapSelectionTranslationToGrid(b,{double(p.x),double(p.y)},document.customGrid());
  if(std::isfinite(q.x)&&std::isfinite(q.y)&&std::abs(q.x)<=1000000&&std::abs(q.y)<=1000000)p={int(q.x),int(q.y)};
 }else{
  const auto r=resolveAlignment({b},moveAlignmentTargets_,{double(p.x),double(p.y)},document.width(),document.height(),document.customGrid(),false,smartMoveEnabled_,alignmentThresholdForZoom(moveAlignmentThreshold_,zoom_),selectionAxis_==1?'x':selectionAxis_==2?'y':0);
  if(std::isfinite(r.offset.x)&&std::isfinite(r.offset.y)&&std::abs(r.offset.x)<=1000000&&std::abs(r.offset.y)<=1000000){p={int(r.offset.x),int(r.offset.y)};alignmentGuides_=r.guides;}
 }
 if(selectionAxis_==1)p.y=0;else if(selectionAxis_==2)p.x=0;return p;
}

std::optional<SelectionMask> Editor::quickSelectionCellAt(Point p)const{return gridCellBoundsAt(p.x,p.y,document.showCustomGrid()?document.customGrid():GridSettings{0,0,double(checkerboard_.size),double(checkerboard_.size)},document.width(),document.height());}

void Editor::updateSelectionCreation(Point p,bool constrain,bool center,bool rotate){

    if(selectionKind_==4){requestWand(p);return;}

    if(selectionKind_==5){selectionBrushStroke_.collect(document.width(),document.height(),selectionBrushLast_,{p.x,p.y},brushFeedback_.brushProfiles_[0],selectionBrushAngle_);selectionBrushLast_={p.x,p.y};return;}

    std::optional<SelectionMask> incoming;

    if(marqueeDrawingAnchor_){anchoredMarqueeGeometry_.update(anchoredMarqueeSpec_,{double(p.x),double(p.y)},constrain,true,rotate);auto target=anchoredMarqueeSpec_.bounds;if(gridSnapActive()&&target.angle==0){const auto snapped=snapSelectionBoundsToGrid({target.x,target.y,target.width,target.height},document.customGrid());target.x=snapped.x;target.y=snapped.y;target.width=snapped.width;target.height=snapped.height;}target=centerDrawingBounds(target,*marqueeDrawingAnchor_);anchoredMarqueeSpec_.bounds=target;marqueeTarget_=target;selectionPreview_=rotatedMarqueeSelection(target,document.width(),document.height(),selectionKind_==1,selectionRounded_?selectionCornerRadius_:0);selectionLast_=p;return;}
    if(marqueeSpaceTarget_){auto target=*marqueeSpaceTarget_;target.x+=p.x-marqueeSpacePointer_.x;target.y+=p.y-marqueeSpacePointer_.y;marqueeTarget_=target;selectionPreview_=rotatedMarqueeSelection(target,document.width(),document.height(),selectionKind_==1,selectionRounded_?selectionCornerRadius_:0);selectionLast_=p;return;}

    if(quickSelection_){const auto current=quickSelectionCellAt(p);if(!current)return;selectionPreview_=quickSelectCellDragBounds(quickSelectionCell_,*current);selectionLast_=p;return;}

    if(selectionKind_==2 || selectionKind_==3){SelectionPoint point{p.x,p.y};if(selectionKind_==2 && (selectionPath_.empty() || selectionPath_.back().x!=p.x || selectionPath_.back().y!=p.y)){selectionPath_.push_back(point);selectionPathRedo_.clear();}auto path=selectionPath_;if(selectionKind_==3 && (path.empty() || path.back().x!=p.x || path.back().y!=p.y))path.push_back(point);incoming=lassoSelection(path,document.width(),document.height(),selectionKind_==3,runtimePreferences_.flag("tools.balancedShiftLineEnabled"));}

    else {const TransformPoint pointer{double(p.x),double(p.y)};if(rotate && marqueeTarget_){if(!marqueeRotationStart_){marqueeRotationStart_=marqueeTarget_;marqueePointerStart_=pointer;}auto target=*marqueeRotationStart_;const double cx=target.x+target.width/2,cy=target.y+target.height/2;target.angle+=(std::atan2(pointer.y-cy,pointer.x-cx)-std::atan2(marqueePointerStart_.y-cy,marqueePointerStart_.x-cx))*180/3.141592653589793;marqueeTarget_=target;marqueePointerLast_=pointer;}

      else {if(marqueeRotationStart_){marqueeResizeStart_=marqueeTarget_;marqueePointerStart_=marqueePointerLast_;marqueeRotationStart_.reset();}if(marqueeResizeStart_ && center && !marqueeCtrlRestore_){marqueeCtrlRestore_=marqueeTarget_;auto target=*marqueeTarget_;target.x=selectionStart_.x-std::floor(target.width/2);target.y=selectionStart_.y-std::floor(target.height/2);marqueeResizeStart_=target;marqueePointerStart_=pointer;}else if(marqueeCtrlRestore_ && !center){marqueeResizeStart_=marqueeCtrlRestore_;marqueeCtrlRestore_.reset();marqueePointerStart_=pointer;}if(marqueeResizeStart_)marqueeTarget_=resizeRotatedMarquee(*marqueeResizeStart_,{pointer.x-marqueePointerStart_.x,pointer.y-marqueePointerStart_.y},marqueeDirectionX_,marqueeDirectionY_,constrain);else{ShapeSpec creation;creation.start={double(selectionStart_.x),double(selectionStart_.y)};ShapeDragGeometry geometry;geometry.viewAngle=marqueeViewAngle_;geometry.update(creation,pointer,constrain,center,false);marqueeDirectionX_=geometry.directionX;marqueeDirectionY_=geometry.directionY;marqueeTarget_=creation.bounds;}}

      if(gridSnapActive()&&marqueeTarget_->angle==0){const auto b=snapSelectionBoundsToGrid({marqueeTarget_->x,marqueeTarget_->y,marqueeTarget_->width,marqueeTarget_->height},document.customGrid());if(std::isfinite(b.x)&&std::isfinite(b.y)&&std::isfinite(b.width)&&std::isfinite(b.height)&&std::abs(b.x)<1000000&&std::abs(b.y)<1000000&&b.width<1000000&&b.height<1000000){marqueeTarget_->x=b.x;marqueeTarget_->y=b.y;marqueeTarget_->width=b.width;marqueeTarget_->height=b.height;}}

      const auto target=*marqueeTarget_;incoming=target.angle==0 && !(selectionKind_==0 && selectionRounded_)?(selectionKind_==1?ellipseSelection(int(target.x),int(target.y),int(target.width),int(target.height),document.width(),document.height()):rectangleSelection(int(target.x),int(target.y),int(target.width),int(target.height),document.width(),document.height())):rotatedMarqueeSelection(target,document.width(),document.height(),selectionKind_==1,selectionRounded_?selectionCornerRadius_:0);}

    selectionPreview_=incoming;

    selectionLast_=p;

    if(selectionKind_<=1){const auto dimensions=std::to_string(int(marqueeTarget_?marqueeTarget_->width:std::abs(p.x-selectionStart_.x)+1))+" x "+std::to_string(int(marqueeTarget_?marqueeTarget_->height:std::abs(p.y-selectionStart_.y)+1));status_=unicodeText(dimensions);invalidateRect(gfx::Rect(bounds().x,bounds().y2()-Layout::statusHeight*uiScale,bounds().w,Layout::statusHeight*uiScale));}

  }

void Editor::polygonStep(bool redo){auto& source=redo?selectionPathRedo_:selectionPath_;auto& target=redo?selectionPath_:selectionPathRedo_;if(source.empty())return;target.push_back(source.back());source.pop_back();auto incoming=lassoSelection(selectionPath_,document.width(),document.height(),true,runtimePreferences_.flag("tools.balancedShiftLineEnabled"));selectionPreview_=incoming;invalidateRect(canvasViewport());}

void Editor::polygonShapePreview(){
 auto& path=shapeSpec_.polygonPath;shapeSpec_.polygonFilled=false;shapeSpec_.polygonBalanced=shapeSpec_.kind==ShapeKind::Polygon&&runtimePreferences_.flag("tools.balancedShiftLineEnabled");
 bool prefix=polygonShapeCacheBalanced_==shapeSpec_.polygonBalanced&&polygonShapeCachePath_.size()<=path.size();
 if(prefix)for(std::size_t i=0;i<polygonShapeCachePath_.size();++i)if(polygonShapeCachePath_[i].x!=path[i].x||polygonShapeCachePath_[i].y!=path[i].y){prefix=false;break;}
 if(!prefix){polygonShapeCachePath_.clear();polygonShapeCache_.clear();}
 for(std::size_t i=std::max<std::size_t>(1,polygonShapeCachePath_.size());i<path.size();++i){auto edge=selectionLine(path[i-1],path[i],shapeSpec_.polygonBalanced);polygonShapeCache_.insert(polygonShapeCache_.end(),edge.begin(),edge.end());}
 polygonShapeCachePath_=path;polygonShapeCacheBalanced_=shapeSpec_.polygonBalanced;shapeSpec_.polygonContour=polygonShapeCache_;
 if(!path.empty()){const SelectionPoint pointer{int(shapePointer_.x),int(shapePointer_.y)};auto append=[&](SelectionPoint a,SelectionPoint b){auto edge=selectionLine(a,b,shapeSpec_.polygonBalanced);shapeSpec_.polygonContour.insert(shapeSpec_.polygonContour.end(),edge.begin(),edge.end());};append(path.back(),pointer);if(path.size()>1&&shapeSpec_.kind==ShapeKind::Polygon)append(pointer,path.front());}
 shapeRequest_=true;shapeTick();
}
void Editor::polygonShapeStep(bool redo){auto& path=shapeSpec_.polygonPath;if(redo){if(polygonShapeRedo_.empty())return;path.push_back(polygonShapeRedo_.back());polygonShapeRedo_.pop_back();}else{if(path.empty())return;polygonShapeRedo_.push_back(path.back());path.pop_back();}polygonShapePreview();refresh();}
void Editor::finishPolygonShape(){
 if(!shapeDragging_||(shapeSpec_.kind!=ShapeKind::Polygon&&shapeSpec_.kind!=ShapeKind::Freeform))return;
 try{shapeSpec_.polygonFilled=true;shapeSpec_.polygonBalanced=shapeSpec_.kind==ShapeKind::Polygon&&runtimePreferences_.flag("tools.balancedShiftLineEnabled");shapeRequest_=true;shapeTick();if(document.shapeActive()){Document::HistoryLabelScope label(document,shapeSpec_.kind==ShapeKind::Freeform?U"绘制自由形状":U"绘制多边形");document.commitShapePreview();}}
 catch(const std::exception& e){document.cancelShapePreview();status_=U"多边形失败："+unicodeText(e.what());}
 shapeDragging_=shapeRequest_=false;shapeSpec_.polygonPath.clear();shapeSpec_.polygonContour.clear();polygonShapeRedo_.clear();polygonShapeCachePath_.clear();polygonShapeCache_.clear();if(hasCapture())releaseMouse();refresh();
}
void Editor::curveTick(){
 if(!shapeDragging_||shapeSpec_.kind!=ShapeKind::Curve)return;
 if(shapeIdentity_!=document.identity()||!document.shapeActive()){cancelStroke();return;}
 const auto controls=curveEndpoint_?curveDefaultControls(shapeSpec_.start,shapeSpec_.end,curveAnchorCount_):curveControls_;
 const auto points=bezierCurvePixelPoints(shapeSpec_.start,controls,shapeSpec_.end,brushFeedback_.brushProfiles_[0].perfectPixels);auto brush=brushFeedback_.brushProfiles_[0];brush.ink=currentInkMode();
 document.updateGeometricBrushPreview(points,shapeColor_,brush,pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_);invalidateRect(canvasViewport());
}
void Editor::finishCurveShape(){
 if(!shapeDragging_||shapeSpec_.kind!=ShapeKind::Curve||curveEndpoint_)return;
 try{const auto points=bezierCurvePixelPoints(shapeSpec_.start,curveControls_,shapeSpec_.end,brushFeedback_.brushProfiles_[0].perfectPixels);auto brush=brushFeedback_.brushProfiles_[0];brush.ink=currentInkMode();Document::HistoryLabelScope label(document,U"绘制曲线");
 if(document.layer().kind=="free-tile"&&document.activeMaskId().empty()){
  // Keep the source target captured on initial press and commit the same
  // source-local brush path used by preview (legacy commitBrushPath).
  if(document.updateGeometricBrushPreview(points,shapeColor_,brush,pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_))document.commitShapePreview();else document.cancelShapePreview();
 }else{document.cancelShapePreview();document.paintGeometricBrushPath(points,shapeColor_,brush,pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_);}shapeDragging_=shapeRequest_=false;}
 catch(const std::exception& e){document.cancelStroke();status_=U"曲线失败："+unicodeText(e.what());}
 shapeDragging_=shapeRequest_=false;curveControls_.clear();if(hasCapture())releaseMouse();refresh();
}
void Editor::shapeTick(){if(shapeDragging_&&shapeDrawingAnchor_)shapeSpec_.bounds=centerDrawingBounds(shapeSpec_.bounds,*shapeDrawingAnchor_);if(shapeDragging_&&shapeSpec_.kind==ShapeKind::Curve){try{shapeRequest_=false;curveTick();}catch(const std::exception& e){document.cancelShapePreview();shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();status_=U"曲线失败："+unicodeText(e.what());refresh();}return;}if(!shapeDragging_)return;if(document.identity()!=shapeIdentity_ || !document.shapeActive()){shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();refresh();return;}if(shapeRequest_){shapeRequest_=false;shapeSpec_.brush=brushFeedback_.brushProfiles_[0];shapeSpec_.brush.ink=(shapeSpec_.kind==ShapeKind::Polygon||shapeSpec_.kind==ShapeKind::Freeform)?InkMode::Simple:currentInkMode();shapeSpec_.strokeWidth=brushFeedback_.brushProfiles_[0].size;shapeSpec_.cornerRadius=shapeRounded_?shapeRadius_:0;try{if(shapeSpec_.kind==ShapeKind::Line&&document.layer().kind=="free-tile"&&document.activeMaskId().empty()){
 auto points=selectionLine({int(shapeSpec_.start.x),int(shapeSpec_.start.y)},{int(shapeSpec_.end.x),int(shapeSpec_.end.y)},runtimePreferences_.flag("tools.balancedShiftLineEnabled"));
 if(shapeSpec_.brush.perfectPixels){std::vector<BrushPathPoint> perfect;for(const auto& point:points)appendPerfectPixelSegment(perfect,{point.x,point.y});points.clear();for(const auto& point:perfect)points.push_back({point.x,point.y});}
 document.updateGeometricBrushPreview(points,shapeColor_,shapeSpec_.brush,pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_);
}else document.updateShapePreview(shapeSpec_,shapeColor_);invalidateRect(canvasViewport());}catch(const std::exception& e){document.cancelShapePreview();shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();status_=U"形状失败："+unicodeText(e.what());refresh();}}}

void Editor::useShapeTool(ShapeKind kind){if(document.activeMaskId().empty()&&document.layer().kind=="tilemap"&&document.tilemapMode()==tiles::Mode::Paint){status_=U"瓦片绘制模式不支持此工具，请切换像素模式";refresh();return;}if(gradientPending_ || gradientDragging_ || selectionDragging_ || floatingDragging_ || shapeDragging_)return;document.commitFloatingPaste();cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;textTool_=false;moveTool_=false;shapeSpec_.kind=kind;shapeTool_=true;eyedropperTool_=false;navigation_.zoomTool_=false;selectionTool_=gradientTool_=fillTool_=handTool_=eraser_=false;playing_=false;toolRowScroll_=0;refresh();}

void Editor::gradientColors(){gradientSpec_.first=gradientRight_?document.palette().secondary:ink_;gradientSpec_.last=gradientRight_?ink_:document.palette().secondary;gradientSpec_.stops=gradientFreeform_?gradientStops_:std::vector<GradientStop>{};if(gradientRight_)for(auto& stop:gradientSpec_.stops)stop.position=1-stop.position;}

void Editor::gradientTick(){if(!document.gradientActive()){gradientDragging_=gradientPending_=gradientRequest_=false;return;}if(document.identity()!=gradientIdentity_ || document.contentRevision()!=gradientContent_ || document.layer().id!=gradientLayer_ || document.frame().id!=gradientFrame_){cancelGradientGesture();return;}if(gradientPending_ && (gradientSpec_.first!=(gradientRight_?document.palette().secondary:document.palette().primary) || gradientSpec_.last!=(gradientRight_?document.palette().primary:document.palette().secondary))){ink_=document.palette().primary;gradientRequest_=true;}if(!gradientRequest_)return;gradientRequest_=false;gradientColors();document.updateGradient(gradientSpec_,gradientOptions_);invalidateRect(canvasViewport());}

void Editor::gradientChanged(){saveBrushPreferences();gradientRequest_=document.gradientActive();gradientTick();layoutToolOptions();invalidate();}

void Editor::cancelGradientGesture(){gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;document.cancelGradient();if(hasCapture())releaseMouse();refresh();}

void Editor::applyGradientGesture(){gradientRequest_=true;gradientTick();document.commitGradient();gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;if(hasCapture())releaseMouse();refresh();}

void Editor::useFillTool(){magicEraserTool_=false;if(document.activeMaskId().empty()&&document.layer().kind=="tilemap"&&document.tilemapMode()==tiles::Mode::Paint){status_=U"瓦片绘制模式不支持填充，请切换像素模式";refresh();return;}if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;document.commitFloatingPaste();cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;textTool_=false;moveTool_=false;shapeTool_=false;rememberGradientTool_=false;gradientTool_=false;fillTool_=true;selectionTool_=false;handTool_=eraser_=false;eyedropperTool_=false;navigation_.zoomTool_=false;refresh();}

void Editor::useGradientTool(){if(document.activeMaskId().empty()&&document.layer().kind=="tilemap"&&document.tilemapMode()==tiles::Mode::Paint){status_=U"瓦片绘制模式不支持此工具，请切换像素模式";refresh();return;}if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;document.commitFloatingPaste();cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;textTool_=false;moveTool_=false;gradientOptions_.visibleLayers=fillOptions_.visibleLayers;gradientOptions_.connectivity=fillOptions_.connectivity;shapeTool_=false;rememberGradientTool_=true;gradientTool_=true;fillTool_=selectionTool_=handTool_=eraser_=false;playing_=false;eyedropperTool_=false;navigation_.zoomTool_=false;refresh();}

void Editor::sortGradientStops(GradientStop selected){std::stable_sort(gradientStops_.begin(),gradientStops_.end(),[](auto a,auto b){return a.position<b.position;});for(int i=0;i<int(gradientStops_.size());++i)if(gradientStops_[i].position==selected.position && gradientStops_[i].color==selected.color)gradientStop_=i;gradientChanged();}

void Editor::addGradientStop(){double gap=-1,position=.5;for(std::size_t i=1;i<gradientStops_.size();++i)if(gradientStops_[i].position-gradientStops_[i-1].position>gap){gap=gradientStops_[i].position-gradientStops_[i-1].position;position=(gradientStops_[i].position+gradientStops_[i-1].position)/2;}if(gap<.002)return;position=std::clamp(position,.001,.999);GradientSpec s;s.stops=gradientStops_;GradientStop added{position,GradientSampler(s).forAmount(position,0,0)};gradientStops_.push_back(added);sortGradientStops(added);}

std::optional<SelectionTransform> Editor::selectionTransformTarget() const {if(auto floating=document.floatingTransform())return floating;if(!document.selection())return {};const auto& mask=*document.selection();return SelectionTransform{double(mask.x),double(mask.y),double(mask.width),double(mask.height)};}

TransformPoint Editor::selectionPivotPreset(const SelectionTransform& target,int index) const {auto coordinate=[](double size,int position){const double last=std::max(.5,size-.5);return (position==0?.5:position==2?last:std::min(last,std::floor(size/2)+.5))/std::max(1.0,size);};return transformPoint(target,coordinate(target.width,index%3),coordinate(target.height,index/3));}

TransformPoint Editor::selectionPivotPoint() const {auto target=selectionTransformTarget();return selectionPivot_.value_or(target?selectionPivotPreset(*target,4):TransformPoint{});}

bool Editor::selectionPivotHit(gfx::Point point) const {if(drawingAnchorActive())return false;if(!document.selection() || !selectionPivotVisible_ || selectionFreeTransform_ || selectionDragging_)return false;const auto p=selectionPivotPoint();const auto screen=canvasDocumentToDisplay(p);return std::abs(point.x-screen.x)<=10 && std::abs(point.y-screen.y)<=10;}

Point Editor::constrainedSelectionDelta(Point delta,bool shift){if(!shift){selectionAxis_=0;return delta;}const int x=std::abs(delta.x),y=std::abs(delta.y);if(!selectionAxis_ && (x || y))selectionAxis_=x>=y?1:2;if(selectionAxis_==1 && y>x*1.2)selectionAxis_=2;if(selectionAxis_==2 && x>y*1.2)selectionAxis_=1;return selectionAxis_==1?Point{delta.x,0}:Point{0,delta.y};}

void Editor::centerContent(bool horizontal,bool vertical){const auto before=document.selection();if(document.centerActiveContent(horizontal,vertical)){const auto after=document.selection();if(selectionPivot_ && before && after){selectionPivot_->x+=after->x-before->x;selectionPivot_->y+=after->y-before->y;}selectionPivotMask_=after;playing_=false;}refresh();}

void Editor::trimCanvas(bool allFrames){try{if(document.trimCanvas(allFrames,selectionPivot_)){playing_=false;selectionFreeTransform_=false;fitCanvas();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::cropCanvas(){try{if(document.cropCanvas(selectionPivot_)){playing_=false;selectionFreeTransform_=false;fitCanvas();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::shrinkSelectionToContent(){document.commitFloatingPaste();const auto before=document.selection();if(!before)return;auto next=document.selectionContentBounds(*before);if(!next){status_=U"选区中没有内容";refresh();return;}if(selectionEqual(before,next))return;document.commitSelection(before,next);selectionPivot_.reset();selectionPropertiesActive_=true;refresh();}

void Editor::showSelectionPivotPopup(bool drawing){if(!drawing&&!document.selection())return;auto targetForPopup=[&]()->std::optional<SelectionTransform>{return drawing?std::optional<SelectionTransform>{SelectionTransform{0,0,double(document.width()),double(document.height())}}:selectionTransformTarget();};auto currentPoint=[&]{return drawing?drawingAnchorPoint():selectionPivotPoint();};auto assignPoint=[&](TransformPoint point){if(drawing)setDrawingAnchor(point);else selectionPivot_=point;};auto& pivotVisible=drawing?drawingAnchorVisible_:selectionPivotVisible_;ui::PopupWindow popup("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);popup.setAutoRemap(false);popup.setWantFocus(true);const auto trigger=(drawing?static_cast<ui::Widget*>(drawingAnchorPresetButton_):selectionControls_[15].first)->bounds();const auto popupBounds=gfx::Rect(std::clamp(trigger.x,bounds().x,std::max(bounds().x,bounds().x2()-90*uiScale)),trigger.y2()+2*uiScale,90*uiScale,83*uiScale);popup.setBounds(popupBounds);class PivotPanel final:public ui::Widget{const Skin& skin;public:PivotPanel(const Skin& value):ui::Widget(ui::kGenericWidget),skin(value){}void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto rect=uiLogical(clientBounds());g.fillRect(skin["panel"],rect);skin.draw(g,"panel_outer",rect);}};auto content=new PivotPanel(skin_);popup.addChild(content);content->setBounds(popupBounds);auto visible=new PixelButton(font_,skin_,drawing?U"显示绘图锚点":U"显示轴心",[&,this]{pivotVisible=!pivotVisible;if(drawing)saveBrushPreferences();else saveSelectionPreferences();invalidateRect(canvasViewport());});visible->active=pivotVisible;visible->icon=pivotVisible?"check":"checkboxUnchecked";visible->iconSkin=&toolIcons_;visible->bareIconWithCaption=true;content->addChild(visible);visible->setBounds(gfx::Rect(popupBounds.x+6*uiScale,popupBounds.y+6*uiScale,78*uiScale,textControlHeight*uiScale));std::array<PixelButton*,9> presets{};for(int i=0;i<9;++i){auto button=new PixelButton(font_,skin_,U"",[&,this,i]{if(auto target=targetForPopup())assignPoint(selectionPivotPreset(*target,i));invalidateRect(canvasViewport());});const char* anchorIcons[]={"nw","n","ne","w","center","e","sw","s","se"};button->icon=drawing?std::string("anchor-preset-")+anchorIcons[i]:"selection-pivot-preset-"+std::to_string(i);button->iconSkin=&toolIcons_;content->addChild(button);button->setBounds(gfx::Rect(popupBounds.x+(6+(i%3)*17)*uiScale,popupBounds.y+(28+(i/3)*17)*uiScale,15*uiScale,15*uiScale));if(auto target=targetForPopup()){const auto point=selectionPivotPreset(*target,i),current=currentPoint();button->active=std::abs(point.x-current.x)<1e-6 && std::abs(point.y-current.y)<1e-6;}presets[i]=button;button->Click.connect([&,i]{for(int j=0;j<9;++j){presets[j]->active=i==j;presets[j]->invalidate();}});}visible->Click.connect([&,this,visible]{visible->active=pivotVisible;visible->icon=pivotVisible?"check":"checkboxUnchecked";visible->invalidate();});popup.Resize.connect([&,content,visible](ui::ResizeEvent&){const auto area=content->bounds();visible->setBounds(gfx::Rect(area.x+6*uiScale,area.y+6*uiScale,78*uiScale,textControlHeight*uiScale));for(int i=0;i<9;++i)presets[i]->setBounds(gfx::Rect(area.x+(6+(i%3)*17)*uiScale,area.y+(28+(i/3)*17)*uiScale,15*uiScale,15*uiScale));});std::unique_ptr<ui::Timer> verify;if(smoke_){verify=std::make_unique<ui::Timer>(160,&popup);verify->Tick.connect([&]{if(presets[0]->bounds().x!=visible->bounds().x || presets[3]->bounds().x!=visible->bounds().x || presets[6]->bounds().x!=visible->bounds().x)throw std::runtime_error("Pivot popup left alignment");presets[0]->Click();if(auto target=targetForPopup()){const auto expected=selectionPivotPreset(*target,0);if(currentPoint().x!=expected.x || currentPoint().y!=expected.y)status_=U"轴心预设测试失败";}writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"selection-pivot-smoke.bmp");verify->stop();popup.closeWindow(nullptr);});verify->start();}popup.openWindowInForeground();requestFocus();}

void Editor::startFreeSelectionTransform(){if(!document.selection() || selectionDragging_ || floatingDragging_)return;auto target=*selectionTransformTarget();if(!document.beginSelectionContentMove(false,frameSelectionExplicit_))return;target.quad=std::array<TransformPoint,4>{{transformPoint(target,0,0),transformPoint(target,1,0),transformPoint(target,1,1),transformPoint(target,0,1)}};document.transformFloatingPaste(target,false);selectionFreeTransform_=true;selectionTool_=true;eyedropperTool_=false;navigation_.zoomTool_=false;selectionPropertiesActive_=true;refresh();}

TransformPoint Editor::transformCanvasPoint(gfx::Point p) const {return canvasDocumentPoint(p);}

std::optional<SelectionTransform> Editor::selectionControlTarget() const {

    auto target=selectionTransformTarget();

    if(target && !target->quad && target->angle==0 && target->shearX==0 && target->shearY==0 && document.selection()){

      const auto& mask=*document.selection();target->x=mask.x;target->y=mask.y;target->width=mask.width;target->height=mask.height;

    }

    return target;

  }

std::string Editor::transformHit(gfx::Point p)const {auto target=selectionControlTarget();return target?selectionTransformHit(*target,transformCanvasPoint(p),1.0/canvasScale()):std::string{};}

bool Editor::celClipboardContext()const{return !paletteFocused_ && !document.timelineSelection().cels.empty();}

void Editor::cutTimelineCels(){try{document.clearMaskClipboard();playing_=false;document.cutSelectedCels();celClipboardSnapshot_=document.exportCelClipboard();layerClipboardSnapshot_.reset();frameClipboardSnapshot_={};status_=U"单元格已剪切";}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

bool Editor::hasApplicationFrameClipboard()const{return !frameClipboardSnapshot_.items.empty();}

bool Editor::applicationCelSelectionOnly()const{return !celClipboardSnapshot_.items.empty() && bool(celClipboardSnapshot_.items.front().selectionPixels);}

bool Editor::hasApplicationCelClipboard()const{return !celClipboardSnapshot_.items.empty();}

std::optional<int> Editor::timelineGifDropIndex(gfx::Point at)const{

    if(!documentOpen_ || homeOpen_ || !columnShown(2) || pending_!=Pending::None)return {};

    const auto grid=timelineFrameViewport(true)|timelineFrameViewport();if(!grid.contains(at))return {};

    return std::clamp(frameScroll_+int(std::floor(double(at.x-grid.x+frameScrollRemainder_)/(timelineFrameWidth()*uiScale))),0,int(document.timeline().state().frames.size()));

  }

void Editor::clearTimelineGifDrop(){if(gifDropTargetIndex_){gifDropTargetIndex_.reset();invalidateTimelineGrid();}}

bool Editor::handleTimelineGifDrag(os::DragEvent& event,bool drop){

    const auto index=timelineGifDropIndex(event.position());auto data=event.dataProvider();if(!index || !data || !data->contains(os::DragDataItemType::Paths)){clearTimelineGifDrop();return false;}

    const auto paths=data->getPaths();if(paths.empty() || !std::all_of(paths.begin(),paths.end(),[](const auto& path){auto ext=std::filesystem::u8path(path).extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return std::towlower(c);});return ext==L".gif";})){clearTimelineGifDrop();return false;}

    if(!event.sourceSupports(os::DropOperation::Copy)){clearTimelineGifDrop();event.dropResult(os::DropOperation::None);return true;}

    event.dropResult(os::DropOperation::Copy);if(!drop){if(gifDropTargetIndex_!=index){gifDropTargetIndex_=index;invalidateTimelineGrid();}return true;}

    clearTimelineGifDrop();try{for(const auto& path:paths){auto source=openGifAnimation(std::filesystem::u8path(path));if(document.importGifAnimationLayer(source,*index)){playing_=false;frameSelectionExplicit_=false;timelineSelectionIdentity_=document.identity();timelineSelectionGuidesVisible_=true;paletteFocused_=false;status_=U"GIF 已导入时间轴";}}}catch(const std::exception& error){status_=unicodeText(error.what());}refresh();event.acceptDrop(true);return true;

  }

void Editor::copyTimelineFrames(){try{document.clearMaskClipboard();if(document.copySelectedFrames()){freeTileInstanceClipboard_.reset();frameClipboardSnapshot_=document.exportFrameClipboard();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::cutTimelineFrames(){try{document.clearMaskClipboard();playing_=false;if(document.copySelectedFrames()){auto snapshot=document.exportFrameClipboard();frameClipboardSnapshot_=std::move(snapshot);layerClipboardSnapshot_.reset();celClipboardSnapshot_={};document.cutSelectedFrames();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::pasteTimelineFrames(){try{if(document.pasteFrameClipboard(frameClipboardSnapshot_)){if(document.selectedFrames().empty()){frameSelectionExplicit_=false;clearTimelineRowSelection();timelineSelectionGuidesVisible_=true;}else markFrameSelection();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::copyTimelineCels(){try{document.clearMaskClipboard();if(document.copySelectedCels()){freeTileInstanceClipboard_.reset();celClipboardSnapshot_=document.exportCelClipboard();layerClipboardSnapshot_.reset();frameClipboardSnapshot_={};status_=U"单元格已复制";}else{celClipboardSnapshot_={};frameClipboardSnapshot_={};status_=U"没有选中的单元格";}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::pasteTimelineCels(){try{if(!celClipboardSnapshot_.items.empty())document.pasteCelClipboard(celClipboardSnapshot_);if(document.floating()){playing_=false;selectionTool_=true;eyedropperTool_=handTool_=false;}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

bool Editor::pixelClipboardContext() const {return !paletteFocused_ && (!frameSelectionExplicit_ || !document.activeMaskId().empty());}
bool Editor::mixedPixelCopyContext(bool cut)const{return document.hasTilemapContent()&&pixelClipboardContext()&&document.selection()&&document.activeMaskId().empty()&&(cut?document.tilemapSelectionCutAvailable():(document.layer().kind.empty()||document.layer().kind=="tilemap"));}
bool Editor::mixedPixelPasteContext()const{return document.hasTilemapContent()&&pixelClipboardContext()&&document.activeMaskId().empty()&&document.layer().kind.empty()&&!document.hasSelectedGroups()&&!document.layerEffectivelyLocked(document.layer())&&!layerClipboardSnapshot_&&!frameSelectionExplicit_&&(!celClipboardContext()||!hasApplicationCelClipboard());}

void Editor::beginLayerTransform(){if(selectionDragging_ || floatingDragging_)return;if(!document.beginLayerTransform()){status_=U"所选图层隐藏、锁定或没有可变换内容";refresh();return;}selectionPivot_.reset();selectionFreeTransform_=false;selectionPropertiesActive_=false;useSelectionTool(0);selectionMode_=0;}

void Editor::useSelectionTool(int kind){if(shapeDragging_ || gradientPending_ || gradientDragging_ || floatingDragging_ || (selectionDragging_ && selectionKind_==5))return;if(selectionDragging_ || floatingDragging_)endSelectionGesture(!polygonPending_);if(kind>=0)selectionKind_=kind;document.commitFloatingPaste();cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;textTool_=false;moveTool_=false;selectionTool_=true;shapeTool_=false;gradientTool_=false;fillTool_=false;handTool_=false;eraser_=false;playing_=false;eyedropperTool_=false;navigation_.zoomTool_=false;refresh();}

void Editor::selectAllPixels(){document.commitFloatingPaste();useSelectionTool();document.selectAllPixels();selectionPropertiesActive_=false;selectionPivot_.reset();selectionPivotMask_=document.selection();selectionFreeTransform_=false;refresh();}

void Editor::copyMergedPixels(){try{auto payload=document.copyMergedPixels();if(!payload){pixelClipboard_.clear();status_=U"没有可复制的合并像素";}else{freeTileInstanceClipboard_.reset();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};frameClipboardSnapshot_={};status_=pixelClipboard_.write(*payload)?U"合并像素已复制":U"已复制到内部剪贴板，系统剪贴板不可用";}}catch(const std::exception& e){status_=U"复制合并失败："+unicodeText(e.what());}refresh();}

void Editor::cutSelectionPixels(){const bool paintPixelBlocked=document.tilemapPaintSelectionDeleteBlocked();std::optional<SelectionClipboard> copied;document.cutPixels(copied);selectionPropertiesActive_=false;selectionPivot_.reset();selectionFreeTransform_=false;if(paintPixelBlocked)status_=U"请在瓦片集中选择新增、绘制或修改模式；其他像素操作需先栅格化图层。";}

void Editor::copySelectionPixels(bool cut){if(paletteFocused_){if(!cut)copyPaletteColors();return;}if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}if(!document.selection()){status_=U"需要像素选区";refresh();return;}auto payload=document.copyPixels();if(!payload){freeTileInstanceClipboard_.reset();pixelClipboard_.clear();status_=U"选区没有可复制像素";if(cut)cutSelectionPixels();refresh();return;}freeTileInstanceClipboard_.reset();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};frameClipboardSnapshot_={};if(!pixelClipboard_.write(*payload))status_=U"已复制到内部剪贴板，系统剪贴板不可用";else status_=U"像素已复制";if(cut)cutSelectionPixels();refresh();}

void Editor::pasteSelectionPixels(){
 if(paletteFocused_){pastePaletteColors();return;}
 if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}
 try{
  document.commitFloatingPaste();auto payload=pixelClipboard_.read();
  if(!payload){if(freeTileInstanceClipboard_&&document.activeMaskId().empty()&&document.layer().kind=="free-tile"){document.pasteFreeTileInstances(*freeTileInstanceClipboard_);selectionPropertiesActive_=selectionFreeTransform_=false;selectionPivot_.reset();refresh();return;}status_=U"剪贴板没有像素图像";refresh();return;}
  const auto viewport=canvasViewport();const double scale=canvasScale();
  const int left=int(std::floor((viewport.x-canvas_.x)/scale)),top=int(std::floor((viewport.y-canvas_.y)/scale)),right=int(std::ceil((viewport.x2()-canvas_.x)/scale)),bottom=int(std::ceil((viewport.y2()-canvas_.y)/scale));
  const auto position=PixelClipboard::resolvePlacement(*payload,document.width(),document.height(),left,top,right,bottom);
  if(document.activeMaskId().empty()&&document.layer().kind=="free-tile"){const bool pasted=document.pasteFreeTilePixels(*payload,position);status_=pasted?U"图像已粘贴到自由瓦片":U"自由瓦片目标不可用或没有可粘贴的变化";if(pasted)tilesetPanelOpen_=true;refresh();return;}
  if(document.beginFloatingPaste(*payload,position.x,position.y)){playing_=false;liquifyTool_=smoothTool_=airbrushTool_=textTool_=moveTool_=shapeTool_=gradientTool_=fillTool_=eraser_=false;liquifyResetPosition_.reset();selectionTool_=true;eyedropperTool_=false;navigation_.zoomTool_=false;handTool_=false;status_=U"浮动粘贴：拖动移动，Enter 确认，Esc 取消";}
  else status_=U"目标图层锁定或剪贴板没有可粘贴像素";
  refresh();
 }catch(const std::exception& e){status_=U"粘贴失败："+unicodeText(e.what());refresh();}
}

int Editor::selectionHit(gfx::Point position) const {if(!selectionFreeTransform_&&tabletAssist_.owner==document.identity()&&tabletAssist_.explicitMove&&document.selection()){const auto hit=selectionContentHit(document.selection(),canvasDocumentPoint(position).x,canvasDocumentPoint(position).y,8.0/canvasScale());if(hit)return tabletAssist_.boxMove?1:2;}if(selectionFreeTransform_){auto target=selectionTransformTarget();if(target && target->quad){const auto uv=selectionQuadMap(*target->quad,transformCanvasPoint(position),true);return uv.x>=-1e-7 && uv.x<=1+1e-7 && uv.y>=-1e-7 && uv.y<=1+1e-7?2:0;}}return selectionContentHit(document.selection(),canvasDocumentPoint(position).x,canvasDocumentPoint(position).y,8.0/canvasScale());}

void Editor::endSelectionGesture(bool cancel){if(!selectionDragging_ && !floatingDragging_)return;alignmentGuides_.clear();moveAlignmentTargets_.clear();smartMoveEnabled_=false;if(cancel){++wandGeneration_;wandRequest_.reset();if(floatingDragging_){if(document.paintCellMoving())document.finishPaintCellMove(true);else document.cancelFloatingPaste();selectionPivot_=selectionPivotBeforeGesture_;}else document.previewSelection(selectionBefore_);}else if(floatingDragging_&&document.paintCellMoving()){document.finishPaintCellMove();}else if(selectionDragging_){if(selectionBoxDragging_)document.commitSelectionBox(selectionBefore_);else{auto symmetric=[&](const std::optional<SelectionMask>& incoming){return symmetrySelection(incoming,document.width(),document.height(),document.symmetryAxes,document.symmetryCenter());};if(selectionKind_==5)document.previewSelection(combineSelection(selectionBefore_,symmetric(selectionBrushStroke_.mask(document.width())),gestureSelectionMode_));if(polygonPending_)document.previewSelection(combineSelection(selectionBefore_,symmetric(lassoSelection(selectionPath_,document.width(),document.height(),true,runtimePreferences_.flag("tools.balancedShiftLineEnabled"))),gestureSelectionMode_));const bool moved=selectionMoved_ || selectionKind_>=2 || quickSelection_;const auto after=moved?(selectionKind_==3 || selectionKind_==5?document.selection():combineSelection(selectionBefore_,quickSelection_||selectionKind_==4?selectionPreview_:symmetric(selectionPreview_),gestureSelectionMode_)):gestureSelectionMode_==0?std::optional<SelectionMask>{}:selectionBefore_;if(temporaryBrushCapture_){document.previewSelection(selectionBefore_);if(after)finishTemporaryBrushCapture(*after);}else document.commitSelection(selectionBefore_,after,true);frameSelectionExplicit_=false;}}selectionDragging_=floatingDragging_=selectionBoxDragging_=polygonPending_=false;wandReleased_=false;selectionPath_.clear();selectionPathRedo_.clear();selectionBrushStroke_={};selectionPreview_.reset();marqueeTarget_.reset();marqueeRotationStart_.reset();marqueeResizeStart_.reset();marqueeCtrlRestore_.reset();marqueeSpaceTarget_.reset();marqueeDrawingAnchor_.reset();quickSelection_=false;selectionRight_=false;selectionAxis_=0;if(!selectionStatusBefore_.empty()){status_=selectionStatusBefore_;selectionStatusBefore_.clear();}transformHandle_.clear();if(hasCapture())releaseMouse();refresh();}

const std::unordered_map<std::size_t,Pixel>* Editor::brushLineBaseline(const BrushLineAnchor* anchor) const {
    if(document.layer().kind=="free-tile")return nullptr;

    if(!anchor || anchor->revision!=document.revision())return nullptr;

    if(!anchor->baselinePoints.empty()){anchor->baseline.reserve(anchor->baselinePoints.size());for(const auto& item:anchor->baselinePoints)anchor->baseline.emplace(item);anchor->baselinePoints.clear();}

    return &anchor->baseline;

  }

bool Editor::ordinaryBrushTool() const {return !liquifyTool_ && !smoothTool_ && !airbrushTool_ && !textTool_ && !moveTool_ && !selectionTool_ && !shapeTool_ && !gradientTool_ && !fillTool_ && !handTool_ && !navigation_.zoomTool_ && !eyedropperTool_;}

const Editor::BrushLineAnchor* Editor::brushLineAnchor() const {if(document.layer().kind=="free-tile"&&(document.freeTilePaintMode()||!document.activeMaskId().empty()||!document.layer().freeTiles||document.layer().freeTiles->sources.empty()))return nullptr;const auto& a=brushFeedback_.brushLineAnchors_[eraser_?1:0];return a && a->identity==document.identity() && a->layer==document.layer().id && a->frame==document.frame().id?&*a:nullptr;}

void Editor::flushBrushSizePreferences(){if(brushFeedback_.brushPreferencesPending_)saveBrushPreferences();}

bool Editor::modifierBrushSupported() const {
 if(liquifyTool_||airbrushTool_||smoothTool_)return true;

    return (!pencilImageBrush_ || !pencilImageBrush_->intrinsicSize || (selectionTool_ && selectionKind_==5)) && ((!moveTool_ && !shapeTool_ && !selectionTool_ && !fillTool_ && !gradientTool_ && !handTool_ && !navigation_.zoomTool_ && !eyedropperTool_) ||

      (shapeTool_ && shapeSpec_.kind==ShapeKind::Line) || (selectionTool_ && selectionKind_==5 && !selectionPropertiesActive_));

  }

void Editor::setModifierBrushSize(int value) {
 if(airbrushTool_){airbrushSettings_.scatterRadius=std::clamp(value,1,64);saveAirbrushPreferences();layoutToolOptions();invalidateRect(canvasViewport());return;}if(smoothTool_){smoothBrush_.size=std::clamp(value,1,64);saveSmoothPreferences();layoutToolOptions();invalidateRect(canvasViewport());return;}
 if(liquifyTool_){liquifyOptions_.radius=std::clamp(value,1,64);saveLiquifyPreferences();layoutToolOptions();invalidateRect(canvasViewport());return;}

    auto& brush=brushFeedback_.brushProfiles_[eraser_?1:0];value=std::clamp(value,1,64);

    if(brush.size==value)return;

    const auto oldDamage=brushPreviewDamage(paletteMousePosition_);const int previous=brush.size;

    brush.size=value;

    // Only the selection brush's angle field changes visibility at size 1.

    if(selectionTool_ && selectionKind_==5 && brush.shape!=BrushShape::Round && (previous==1)!=(value==1))layoutToolOptions();

    else if(brushSizeInput_ && !brushSizeInput_->hasFocus()){

      updatingBrushFields_=true;brushSizeInput_->setText(std::to_string(value));updatingBrushFields_=false;

    }

    if(brushRange_ && !brushRangeOpacity_){brushRange_->value=value;brushRange_->invalidate();}

    for(const auto& damage:{oldDamage,brushPreviewDamage(paletteMousePosition_)})if(!damage.isEmpty())invalidateRect(damage);

    // Model/preview update immediately; repeated wheel ticks share one disk write.

    brushFeedback_.brushPreferencesPending_=true;brushFeedback_.brushPreferencesDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(250);

  }

void Editor::finishModifierBrushSize(){if(!brushFeedback_.modifierBrushSize_)return;const bool pressed=brushFeedback_.modifierBrushSize_->pressed;brushFeedback_.modifierBrushSize_.reset();if(pressed && hasCapture())releaseMouse();flushBrushSizePreferences();updateNavigationCursor();}

void Editor::invalidatePanMovement(gfx::Point delta) {if(viewRotation_.active()){invalidateRect(canvasViewport());return;}

    const auto viewport=canvasViewport();

    gfx::Region drawable;getDrawableRegion(drawable,ui::Widget::kCutTopWindows);

    drawable&=gfx::Region(viewport);

    gfx::Region valid=drawable;valid-=getUpdateRegion();

    if(display())valid-=display()->getInvalidRegion();

    // Reuse Aseprite UI's overlap-safe software scroll, keeping dirty pixels and

    // floating controls out of both source and destination. GPU repaints.

    if(navigation_.panBlit_ && display() && !display()->nativeWindow()->gpuAcceleration() && !playing_ &&

       !selectionTool_ && !document.gradientActive() && !document.floating()) {

      auto source=valid;source.offset(-delta.x,-delta.y);source&=valid;

      if(!source.isEmpty()){

        ui::move_region(display(),source,delta.x,delta.y);++navigation_.canvasBlitMoves_;

        source.offset(delta.x,delta.y);drawable-=source;

      }

    }

    for(const auto& r:drawable)navigation_.canvasPanRepaintPixels_+=std::uint64_t(r.w)*r.h;

    invalidateRegion(drawable);

  }

void Editor::updateNavigationCursor() {if(refreshCursor_) refreshCursor_();}

void Editor::finishPan(bool cancel) {

    if(!navigation_.pan_.active) return;

    if(cancel) {canvas_.x=navigation_.pan_.origin.x;canvas_.y=navigation_.pan_.origin.y;}

    navigation_.pan_.end();navigation_.panButton_=ui::kButtonNone;layoutCanvasScrollBars();

    if(hasCapture()) releaseMouse();

    updateNavigationCursor();invalidateRect(canvasViewport());

  }

void Editor::selectionAutoPan(gfx::Point pointer){if(!(selectionDragging_ || floatingDragging_) || selectionKind_==4 || selectionKind_==5)return;const auto viewport=canvasViewport();auto speed=[](int point,int start,int end){return point<start+28?-std::min(16.0,std::max(2.0,(start+28-point)*.4)):point>end-28?std::min(16.0,std::max(2.0,(point-(end-28))*.4)):0.0;};const int dx=int(std::round(speed(pointer.x,viewport.x,viewport.x2()))),dy=int(std::round(speed(pointer.y,viewport.y,viewport.y2())));if(!dx && !dy)return;panCanvasDisplay(-dx,-dy);constrainCanvas();invalidateRect(viewport);}

void Editor::constrainCanvas() {

    const auto viewport=canvasViewport();

    if(viewRotation_.active()){const auto center=canvasDocumentToDisplay({document.width()/2.,document.height()/2.});const double rad=viewRotation_.degrees*3.14159265358979323846/180;const int w=int(std::ceil(std::abs(std::cos(rad))*canvas_.w+std::abs(std::sin(rad))*canvas_.h)),h=int(std::ceil(std::abs(std::sin(rad))*canvas_.w+std::abs(std::cos(rad))*canvas_.h));const int x=clampCanvasAxis(center.x-w/2,viewport.x,viewport.w,w)+w/2,y=clampCanvasAxis(center.y-h/2,viewport.y,viewport.h,h)+h/2;const auto d=runtimePreferences_.index("editing.rotationIndicatorPosition.Select")==1?view::Point{double(x-center.x),double(y-center.y)}:viewRotation_.inverse({double(x-center.x),double(y-center.y)},{0,0});canvas_.x+=int(std::lround(d.x));canvas_.y+=int(std::lround(d.y));layoutCanvasScrollBars();return;}
    canvas_.x=clampCanvasAxis(canvas_.x,viewport.x,viewport.w,canvas_.w);

    canvas_.y=clampCanvasAxis(canvas_.y,viewport.y,viewport.h,canvas_.h);layoutCanvasScrollBars();

  }

ui::Widget* Editor::frontWidgetAt(gfx::Point point,bool checkParentsVisibility){InteractionScope interactionScope(3,"hit-test");

    if(hasFlags(ui::HIDDEN) || (checkParentsVisibility && !isVisible()) || !bounds().contains(point))return nullptr;

    if(layerLabelSeparator_ && layerLabelSeparator_->isVisible() && layerLabelHit(point))return layerLabelSeparator_;

    const auto& widgets=children();

    for(auto it=widgets.rbegin();it!=widgets.rend();++it){auto child=*it;

      // Widget::pick uses these same gates. Reject first, before callbacks

      // rebuild viewport/docking geometry for hidden or unrelated controls.

      if(!InteractionProfile::get().referenceHitTesting && (child->hasFlags(ui::HIDDEN) || !child->bounds().contains(point)))continue;

      if(pending_!=Pending::None && child!=modalSurface_ && !modalControl(child))continue;

      if(child==paletteSelectionOverlay_ && !paletteOutlineContains(point))continue;

      if(auto viewport=scrollViewports_.find(child);viewport!=scrollViewports_.end() && !viewport->second.contains(point))continue;

      if(auto cell=dynamic_cast<PixelButton*>(child);cell && cell->paletteViewport && !cell->paletteViewport().contains(point))continue;

      if(auto entry=dynamic_cast<PixelEntry*>(child);entry && entry->paletteViewport && !entry->paletteViewport().contains(point))continue;

      if(auto hit=child->pick(point,checkParentsVisibility))return hit;

    }

    return this;

  }

void Editor::focusWidgetOverlay(ui::Widget* w){

    if(!w)return;const int id=widgetColumn(w);
    // Legacy useAppCommandScope remembers the last editor surface; menu focus
    // has no surface and must not replace the instance-list command target.
    if(freeTileInstancesPanel_&&pending_==Pending::None&&(w==this||id>=0)){const bool instances=freeTileInstancesPanel_->owns(w);freeTileInstancesPanel_->rememberClipboardScope(instances);if(instances)paletteFocused_=false;}

    if(pending_!=Pending::None && modalControl(w)){dialogFocus_=++overlayClock_;raiseDockWidgets();invalidate();}

    else if(pending_==Pending::None && id>=0 && columnFloating(id)){for(int tab:docking_.groups[docking_.groupOf(id)].tabs)floatingFocus_[tab]=++overlayClock_;raiseDockWidgets();invalidate();}

  }

bool Editor::canvasOwnsPointer(gfx::Point position) const {InteractionScope interactionScope(4,"canvas-ownership");

    if(homeOpen_ || !documentOpen_ || pending_!=Pending::None || panelGesture_.id>=0 || sizeDrag_!=SizeDrag::None || panelScrollDrag_.active())return false;

    const auto capture=ui::Manager::getDefault()->getCapture();

    if(capture && capture!=this)return false;

    if(capture==this)return smoothDragging_||selectionDragging_||floatingDragging_||selectionPivotDragging_||navigation_.pan_.active||eyedropperGesture_.active()||navigation_.zoomDragging_||shapeDragging_||gradientDragging_||fillDragging_||document.active();

    if(!canvasViewport().contains(position) || const_cast<Editor*>(this)->frontWidgetAt(position,false)!=this)return false;

    // A menu or a separate popup window can cover the same canvas coordinates.

    if(window() && window()->isVisible() && display() && display()->nativeWindow()){

      auto picked=ui::Manager::getDefault()->pickFromScreenPos(display()->nativeWindow()->pointToScreen(position));

      if(picked && picked!=this)return false;

    }

    return true;

  }

bool Editor::selectionPointerVisible(gfx::Point position) const {

    return selectionTool_ && canvasOwnsPointer(position) && std::string(cursorAt(position))=="none";

  }

void Editor::refreshCanvasPointerFeedback() {if(viewRotation_.active()){invalidateRect(canvasViewport());return;}

    gfx::Rect next;

    if(paletteMousePosition_ && selectionTool_ && canvasOwnsPointer(*paletteMousePosition_)){

      if(selectionKind_==5 && !spaceHeld_ && !handTool_ && !eyedropperTool_ && !eyedropperHeld_ && !eyedropperGesture_.active())next=canvasViewport();

      else if(selectionPointerVisible(*paletteMousePosition_)){

        const auto p=canvasPoint(*paletteMousePosition_);const double scale=canvasScale();

        const int x=int(std::round(canvas_.x+p.x*scale)),y=int(std::round(canvas_.y+p.y*scale));

        next=gfx::Rect(x-7,y-7,std::max(2,int(std::round(canvas_.x+(p.x+1)*scale))-x)+14,std::max(2,int(std::round(canvas_.y+(p.y+1)*scale))-y)+14)&canvasViewport();

      }

    }

    if(next!=selectionPointerDamage_){

      const auto previous=selectionPointerDamage_;selectionPointerDamage_=next;

      if(!previous.isEmpty())invalidateRect(previous);

      if(!next.isEmpty())invalidateRect(next);

    }else if(selectionKind_==5 && !next.isEmpty())invalidateRect(next);

  }

gfx::Rect Editor::brushPreviewDamage(std::optional<gfx::Point> position) {

    if(position && (airbrushTool_||smoothTool_))return canvasViewport();
    if(!position || homeOpen_ || !documentOpen_ || !(ordinaryBrushTool() || (shapeTool_ && shapeSpec_.kind==ShapeKind::Line)) ||

       !canvasViewport().contains(*position))return {};

    // Connected lines and symmetry can cover disjoint parts of the document.

    // Keep their existing conservative redraw until all copies are bounded.

    if(viewRotation_.active() || brushFeedback_.brushPreviewShift_ || symmetryHas(document.symmetryAxes))return canvasViewport();

    const auto p=gridSnapBrush(canvasPoint(*position));const auto brush=brushFeedback_.brushProfiles_[eraser_?1:0];

    int width=brush.size,height=brush.size;

    if(pencilImageBrush_){

      const double angle=std::fmod(pencilImageBrushAngle_,360)*3.14159265358979323846/180;

      const double c=std::abs(std::cos(angle)),s=std::abs(std::sin(angle));

      width=std::max(1,int(std::ceil(pencilImageBrush_->width*c+pencilImageBrush_->height*s-1e-9)));

      height=std::max(1,int(std::ceil(pencilImageBrush_->width*s+pencilImageBrush_->height*c-1e-9)));

    }

    const double scale=canvasScale();

    const int x=int(std::round(canvas_.x+(p.x-width/2)*scale)),y=int(std::round(canvas_.y+(p.y-height/2)*scale));

    const int right=int(std::round(canvas_.x+(p.x-width/2+width)*scale)),bottom=int(std::round(canvas_.y+(p.y-height/2+height)*scale));

    // Subpixel zoom still renders a pixel with a minimum one-device-pixel box.

    return (gfx::Rect(x-1,y-1,std::max(1,right-x)+2,std::max(1,bottom-y)+2)&canvasViewport());

  }

void Editor::updatePaletteMouse(std::optional<gfx::Point> position) {InteractionScope interactionScope(5,"pointer");

    const auto previous=paletteMousePosition_;

    paletteMousePosition_=position;refreshCanvasPointerFeedback();

    if(previous==position)return;

    if((previous && layerLabelHit(*previous)) || (position && layerLabelHit(*position)))invalidateTimelineGrid();

    // The retained canvas cache repairs only the old/new preview footprints.

    // Queue both regions separately so a large pointer jump does not dirty the gap.

    if(!navigation_.pan_.active && (!document.active() || eraser_))for(auto p:{previous,position}){const auto damage=brushPreviewDamage(p);if(!damage.isEmpty())invalidateRect(damage);}

    if(layersPanelOpen_) {

      // Filtered display-relative pointer updates also cover the part of the

      // frame lying outside hit widgets, and movements inside a single widget.

      const auto l=columnLayout(uiLogical(bounds()),2);

      auto grid=uiPhysical(gfx::Rect(l.workX+5,l.layerTop+timelineHeaderOffset(),l.workW-9,l.bottom-l.layerTop-timelineHeaderOffset()-5));grid.offset(bounds().x,bounds().y);

      auto hoverArea=grid;hoverArea.enlarge(4*uiScale);

      if((previous && hoverArea.contains(*previous)) || (position && hoverArea.contains(*position))){

      const auto outlines=timelineOutlines();

      const bool changed=std::any_of(outlines.begin(),outlines.end(),[&](const auto& outline){

        auto material=skin_.selectionMaterialBounds(uiPhysical(outline.border).offset(outline.offset));material.offset(bounds().x,bounds().y);

        return (previous && skin_.selectionContains(material,*previous)) != (position && skin_.selectionContains(material,*position));

      });

      auto hoverSlot=[&](const std::optional<gfx::Point>& point){

        if(!point || !grid.contains(*point))return gfx::Point(-1,-1);

        const auto viewport=timelineFrameViewport();

        const int x=point->x<viewport.x?int((point->x-grid.x)/(12*uiScale)):

          7+int((point->x-viewport.x+frameScrollRemainder_)/(12*uiScale));

        const int y=point->y<viewport.y?-1:int((point->y-viewport.y+layerScrollRemainder_)/(12*uiScale));

        return gfx::Point(x,y);

      };

      if(changed || hoverSlot(previous)!=hoverSlot(position))invalidateTimelineGrid();

      }

    }

    if(paletteSelectionOverlay_ && paletteSelectionOverlay_->isVisible() &&

       bool(previous && paletteOutlineContains(*previous))!=bool(position && paletteOutlineContains(*position)))paletteSelectionOverlay_->invalidate();

    for(auto swatch:swatches_) if(swatch->active && swatch->isVisible() &&

       bool(previous && swatch->bounds().contains(*previous))!=bool(position && swatch->bounds().contains(*position)))swatch->invalidate();

  }

const char* Editor::selectionTransformCursor(const std::string& hit,const SelectionTransform& target,gfx::Point position) const {

    if(hit.rfind("rotate-",0)==0) {

      // legacy useCanvasCursor: hover follows the displayed corner; rotation

      // capture follows the pointer about the displayed center (six directions).

      const auto center=transformPoint(target,.5,.5);

      const auto point=floatingDragging_?transformCanvasPoint(position):transformPoint(target,hit=="rotate-ne" || hit=="rotate-se"?1:0,hit=="rotate-sw" || hit=="rotate-se"?1:0);

      const double dx=point.x-center.x,dy=point.y-center.y;

      if(std::abs(dy)>0 && std::abs(dx)<=std::abs(dy)*(std::sqrt(2.0)-1))return dy<0?"selection-rotate-n":"selection-rotate-s";

      return dy<0?(dx<0?"selection-rotate-nw":"selection-rotate-ne"):(dx<0?"selection-rotate-sw":"selection-rotate-se");

    }

    if(hit.rfind("shear-",0)==0){const bool horizontal=hit=="shear-n" || hit=="shear-s";const auto a=transformPoint(target,0,0),b=transformPoint(target,horizontal?1:0,horizontal?0:1);const int bucket=(int(std::floor(std::atan2(b.y-a.y,b.x-a.x)*180/3.141592653589793/45+.5))%4+4)%4;return bucket==0?"selection-shear-horizontal":bucket==1?"selection-shear-nwse":bucket==2?"selection-shear-vertical":"selection-shear-nesw";}

    double direction=hit=="n" || hit=="s"?90:hit=="nw" || hit=="se"?45:hit=="ne" || hit=="sw"?-45:0;

    direction+=target.angle;

    if(hit.size()==2 && (target.flipHorizontal || target.flipVertical)) {

      // Legacy flipped corners derive their direction from opposite controls.

      const auto a=transformPoint(target,hit=="ne" || hit=="se"?1:0,hit=="sw" || hit=="se"?1:0);

      const auto b=transformPoint(target,hit=="ne" || hit=="se"?0:1,hit=="sw" || hit=="se"?0:1);

      direction=std::atan2(a.y-b.y,a.x-b.x)*180/3.141592653589793;

    }

    const int bucket=(int(std::floor(direction/45+.5))%4+4)%4;

    return bucket==0?"ew-resize":bucket==1?"nwse-resize":bucket==2?"ns-resize":"nesw-resize";

  }

const char* Editor::selectionCursorAt(gfx::Point position) const {

    if(selectionPivotDragging_)return "move";

    if(floatingDragging_ && transformHandle_.empty())return selectionCopyDrag_?"copy":"move";

    if(selectionBoxDragging_)return "selection-move";

    if(selectionDragging_ && selectionKind_!=5)return "none";

    if(selectionDragging_ && selectionKind_==5)return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    if(!floatingDragging_ && !selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";

    const auto hit=selectionShift_ && !floatingDragging_?std::string{}:transformHandle_.empty()?transformHit(position):transformHandle_;

    if(!hit.empty())if(auto target=selectionTransformTarget())return selectionTransformCursor(hit,*target,position);

    const int inside=selectionHit(position);

    if(!selectionShift_ && (inside==1 || (inside==2 && (selectionMode_<2 || selectionCtrl_))))

      return selectionCtrl_?"copy":inside==1?"selection-move":"move";

    if(selectionTool_ && selectionKind_==5) {

      const auto p=canvasPoint(position);

      if(p.x>=0 && p.y>=0 && p.x<document.width() && p.y<document.height() && !(document.rasterToolsAvailable()||document.maskBrushAvailable()))return "unavailable";

      return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    }

    const auto p=canvasPoint(position);

    const bool insideCanvas=p.x>=0 && p.y>=0 && p.x<document.width() && p.y<document.height();

    if(insideCanvas && !(document.rasterToolsAvailable()||document.maskBrushAvailable()))return "unavailable";

    return "none";

  }

const char* Editor::cursorAt(gfx::Point position) const {InteractionScope interactionScope(6,"cursor");
    if(referenceSamplingCursor_)return "eyedropper";

    if(const auto capture=ui::Manager::getDefault()->getCapture();capture && capture!=this){

      if(previewPanel_ && previewPanel_->hasCapture())return previewPanel_->cursorAt(position);

      return "default";

    }

    if(pending_!=Pending::None){
      if(hasCapture() && sizeDrag_==SizeDrag::Modal)return panelResizeCursor(sizeDragEdges_);
      if(hasCapture() && sizeDrag_==SizeDrag::ModalMove)return "move";
      return panelResizeCursor(panelResizeEdges(dialogDisplayBounds(),position));
    }
    if(panelScrollDrag_.active())return "grabbing";

    if(panelScrollSpace_ && pending_==Pending::None)for(const auto& region:scrollDragRegions_)if(region.bounds().contains(position)){const auto maximum=region.target.maximum();if(maximum.x>0 || maximum.y>0)return "grab";}

    if(layerLabelWidth_.dragging || layerLabelHit(position))return "ew-resize";

    if(loopTrackDrag_ || loopTrackHit(position).edge)return "ew-resize";

    if(panelGesture_.id>=0){const int edges=panelGesture_.edges;return edges?panelResizeHitCursor(edges):"move";}

    if(pending_==Pending::None)for(auto close:columnClose_)if(close && close->isVisible() && close->bounds().contains(position))return "default";

    if(const auto resize=panelResizeAt(position);resize.edges)return panelResizeHitCursor(resize.edges);

    if(docking_.custom && pending_==Pending::None){const int id=topFloatingColumnAt(position);if(id>=0){auto r=columnGeometry(uiLogical(bounds())).panel[id];const auto box=uiPhysical(gfx::Rect(r.x,r.y,r.w,r.h)).offset(bounds().origin());return position.y<box.y+16*uiScale?"move":"default";}}

    if(docking_.custom && pending_==Pending::None){const auto geometry=columnGeometry(uiLogical(clientBounds()));for(int id=0;id<panels::columnCount;++id)if(geometry.shown[id]){const auto r=geometry.panel[id];const auto box=toDisplay(gfx::Rect(r.x,r.y,r.w,r.h));if(box.contains(position) && position.y<box.y+16*uiScale)return "move";}}

    // Captured canvas gestures own the pointer across all sibling UI regions.

    // This is the native equivalent of legacy canvas pointer capture.

    if(navigation_.zoomDragging_)return "zoom";

    if(navigation_.pan_.active)return "grabbing";

    if(drawingAnchorDragging_)return "move";
    if(symmetryDragging_)return "move";

    if(eyedropperGesture_.active())return "eyedropper";

    if(selectionDragging_ || floatingDragging_ || selectionPivotDragging_)return selectionCursorAt(position);

    if(brushFeedback_.modifierBrushSize_)return brushFeedback_.modifierBrushSize_->pressed?"ew-resize":legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    if(moveDragging_||document.freeTileInstanceMoving())return "move";
    if(shapeDragging_ || gradientDragging_)return "crosshair";

    if(pending_==Pending::None && (fillDragging_ || (document.active() && !document.floating())))return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    if(homeButton_ && homeButton_->isEnabled() && homeButton_->bounds().contains(position))return "progress";

    if(homeOpen_)return "default";

    if(!documentOpen_)return "default";

    if(pending_==Pending::None && sizeDrag_==SizeDrag::None && previewPanel_ && previewPanel_->isVisible() && (previewPanel_->hasCapture() || previewPanel_->bounds().contains(position)))return previewPanel_->cursorAt(position);

    const auto handle=sizeDrag_==SizeDrag::None?sizeHandleAt(position):sizeDrag_;

    if(handle==SizeDrag::Modal)return panelResizeCursor(sizeDrag_==SizeDrag::None?panelResizeEdges(dialogDisplayBounds(),position):sizeDragEdges_);

    if(handle==SizeDrag::ModalMove)return "move";

    if(handle==SizeDrag::DockWidth)return "ew-resize";

    if(handle==SizeDrag::ColorSplit || handle==SizeDrag::Timeline)return "ns-resize";

    if(paletteGrowth_ || (pending_==Pending::None&&paletteGrowthHandle_&&paletteGrowthHandle_->isVisible()&&paletteGrowthHandle_->bounds().contains(position)))return "ew-resize";

    if(rotateTool_&&canvasViewport().contains(position))return "rotate";
    if(replaceSampling_>=0 && canvasViewport().contains(position))return "eyedropper";if(pending_!=Pending::None) return "default";

    if(navigation_.pan_.active) return "grabbing";

    // A captured drawing gesture owns the cursor for its entire lifetime.

    // Resolve this before hover-only symmetry/axis and sampling checks, which

    // otherwise caused a one-frame cursor jump when the pointer crossed an

    // axis or left the canvas.

    if(brushFeedback_.modifierBrushSize_)return brushFeedback_.modifierBrushSize_->pressed?"ew-resize":legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    if(moveDragging_)return "move";
    if(shapeDragging_ || gradientDragging_)return "crosshair";

    if(fillDragging_)return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    if(!canvasOwnsPointer(position))return "default";

    if(symmetryDragging_ || (!document.active() && !spaceHeld_ && !handTool_ && !navigation_.zoomTool_ && !eyedropperTool_ && !eyedropperHeld_ && symmetryHit(position)))return "move";

    if(sliceTool()&&sliceAlt_)return "copy";
    if(eyedropperGesture_.active() || ((eyedropperTool_ || eyedropperHeld_) && canvasViewport().contains(position) && !document.active() && !spaceHeld_))return "eyedropper";

    // Selection and transform captures keep their semantic cursor even when

    // the pointer briefly leaves the canvas, matching the legacy pointer

    // capture path.

    if((selectionDragging_ || floatingDragging_ || selectionPivotDragging_) && (selectionTool_ || document.floating()))

      return selectionCursorAt(position);

    if(!canvasViewport().contains(position)) return "default";

    if(!document.active() && (spaceHeld_ || handTool_)) return "grab";

    if(navigation_.zoomTool_ && !spaceHeld_ && !eyedropperHeld_)return "zoom";

    if(selectionTool_ && !selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";

    if(sliceTool()){const auto p=canvasPoint(position);if(sliceAtPoint(document.slices(),p.x,p.y))return "move";return "crosshair";}
    if(moveTool_)return "move";
    if(selectionTool_ || document.floating())return selectionCursorAt(position);

    const auto point=canvasPoint(position);

    const bool inDocument=point.x>=0 && point.y>=0 && point.x<document.width() && point.y<document.height();

    if(inDocument && !(document.rasterToolsAvailable()||document.maskBrushAvailable()))return "unavailable";

    // Current cursor color feedback follows the active ordinary layer; legacy's

    // composited replacement sample resolves to ink or the exposed checker.

    if(eraser_ && inDocument) {

      const auto color=checkerboard_.at(point.x,point.y);

      return legacyPaintCursor(gfx::getr(color),gfx::getg(color),gfx::getb(color));

    }

    if(shapeTool_ || gradientTool_ || fillTool_) {

      if(inDocument && !(document.rasterToolsAvailable()||document.maskBrushAvailable()))return "unavailable";

      if(shapeTool_ || gradientTool_)return "crosshair";

      return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    }

    return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

  }

bool Editor::panelHasCapture() const {return hasCapture() || (previewPanel_ && previewPanel_->hasCapture());}

void Editor::flushPanelGeometry() {

    flushDockPointer();

    if(previewPanel_)previewPanel_->flushGeometry();

    flushSizeGeometry();

  }

void Editor::ensureContentCache() {InteractionScope interactionScope(7,"content-cache");if(luminanceDocumentIdentity_!=document.identity()){if(luminanceDocumentIdentity_)renderer_.setRelativeLuminance(false);luminanceDocumentIdentity_=document.identity();}auto displayedOnion=onion_;if(timelineHidden_)displayedOnion.enabled=false;renderer_.setOnionSkin(displayedOnion,playing_);renderer_.sync(document);}

void Editor::paintSelectionAnts(ui::Graphics& g,gfx::Rect cv,gfx::Rect viewport,int phase) {

    syncSelectionOutlineView();if(!showSelectionOutline_ || !document.selection())return;

    const auto& s=document.selection();const double scale=canvasScale();gfx::Path path;

    auto segment=[&](int x,int y,int x2,int y2){

      path.moveTo(cv.x+x*scale,cv.y+y*scale);path.lineTo(cv.x+x2*scale,cv.y+y2*scale);

    };

    if(s->mask.empty()) {

      segment(s->x,s->y,s->x+s->width,s->y);segment(s->x,s->y+s->height,s->x+s->width,s->y+s->height);

      segment(s->x,s->y,s->x,s->y+s->height);segment(s->x+s->width,s->y,s->x+s->width,s->y+s->height);

    } else {

      for(int y=std::max(s->y,int(std::floor((viewport.y-cv.y)/scale))-1);y<std::min(s->y+s->height,int(std::ceil((viewport.y2()-cv.y)/scale))+1);++y)

        for(int x=std::max(s->x,int(std::floor((viewport.x-cv.x)/scale))-1);x<std::min(s->x+s->width,int(std::ceil((viewport.x2()-cv.x)/scale))+1);++x) {

          if(!selectionContains(s,x,y))continue;

          if(!selectionContains(s,x,y-1))segment(x,y,x+1,y);

          if(!selectionContains(s,x,y+1))segment(x,y+1,x+1,y+1);

          if(!selectionContains(s,x-1,y))segment(x,y,x,y+1);

          if(!selectionContains(s,x+1,y))segment(x+1,y,x+1,y+1);

        }

    }

    // Direct MIT Aseprite shader reuse: 4 black / 4 white device pixels.

    // Transform boundary coordinates, never the shader or hairline stroke.

    ui::Paint paint;paint.style(ui::Paint::Stroke);

    ui::set_checkered_paint_mode(paint,phase,gfx::rgba(0,0,0,255),gfx::rgba(255,255,255,255));

    g.drawPath(path,paint);

  }

gfx::Color Editor::selectionPreviewColor(int x,int y,bool selection) const {

    if(selection && runtimePreferences_.index("cursor.selectionPreviewColorMode.Select")==1){Pixel c;if(parsePaletteHex(runtimePreferences_.get("cursor.selectionPreviewColor.Color"),c))return gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,255);}

    Pixel pixel=0;if(selectionColorIdentity_!=document.identity() || selectionColorRevision_!=document.contentRevision() || selectionColorFrame_!=document.frame().id||selectionColorFloatingRevision_!=document.floatingOverlayRevision()){selectionColorFloatingRevision_=document.floatingOverlayRevision();selectionColorTiles_.clear();selectionColorIdentity_=document.identity();selectionColorRevision_=document.contentRevision();selectionColorFrame_=document.frame().id;}

    if(x>=0 && y>=0 && x<document.width() && y<document.height()){const auto key=std::make_pair(x/64,y/64);auto it=selectionColorTiles_.find(key);const int left=key.first*64,top=key.second*64,width=std::min(64,document.width()-left);if(it==selectionColorTiles_.end()){if(selectionColorTiles_.size()>=32)selectionColorTiles_.erase(selectionColorTiles_.begin());const PixelRegion region{left,top,width,std::min(64,document.height()-top)};const auto overlay=document.floatingDeferred()?document.floatingOverlayRegion(region):std::vector<Pixel>{};auto composed=compositeNormalRegion(document.displayTimeline(),document.frame().id,{region.x,region.y,region.w,region.h},document.layer().id,document.floatingDeferred()?&overlay:nullptr,region.w,region.x,region.y,false);it=selectionColorTiles_.emplace(key,std::move(composed)).first;}pixel=it->second[(y-top)*width+x-left];}

    auto color=pixel>>24?gfx::rgba(pixel&255,(pixel>>8)&255,(pixel>>16)&255,255):checkerboard_.at(x,y);

    return gfx::getr(color)*.2126+gfx::getg(color)*.7152+gfx::getb(color)*.0722>145?gfx::rgba(0,0,0,255):gfx::rgba(255,255,255,255);

  }

void Editor::paintSelectionFeedback(ui::Graphics& g,const gfx::Rect& cv,const gfx::Rect& viewport) {

    if(!selectionTool_ || handTool_ || spaceHeld_)return;

    const double scale=canvasScale();

    auto pixelBox=[&](int x,int y){const int left=int(std::round(cv.x+x*scale)),top=int(std::round(cv.y+y*scale));return gfx::Rect(left,top,std::max(1,int(std::round(cv.x+(x+1)*scale))-left),std::max(1,int(std::round(cv.y+(y+1)*scale))-top));};

    auto pixel=[&](int x,int y){if(x<0 || y<0 || x>=document.width() || y>=document.height())return;const auto box=pixelBox(x,y);if(box.intersects(viewport))g.fillRect(selectionPreviewColor(x,y),box);};

    const bool creating=selectionDragging_ && !selectionBoxDragging_;

    if(creating && selectionPreview_){const auto& mask=*selectionPreview_;

      if(selectionKind_==2 || selectionKind_==3){auto path=selectionPath_;if(selectionKind_==3 && (path.empty() || path.back().x!=selectionLast_.x || path.back().y!=selectionLast_.y))path.push_back({selectionLast_.x,selectionLast_.y});for(std::size_t i=1;i<path.size();++i)for(auto at:selectionLine(path[i-1],path[i],selectionKind_==3&&runtimePreferences_.flag("tools.balancedShiftLineEnabled")))pixel(at.x,at.y);if(path.size()>1 && (selectionKind_==3 || runtimePreferences_.flag("tools.lassoPreviewClosed")))for(auto at:selectionLine(path.back(),path.front(),selectionKind_==3&&runtimePreferences_.flag("tools.balancedShiftLineEnabled")))pixel(at.x,at.y);}

      else {const int left=std::max(mask.x,int(std::floor((viewport.x-cv.x)/scale))),top=std::max(mask.y,int(std::floor((viewport.y-cv.y)/scale))),right=std::min(mask.x+mask.width,int(std::ceil((viewport.x2()-cv.x)/scale))),bottom=std::min(mask.y+mask.height,int(std::ceil((viewport.y2()-cv.y)/scale)));for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)if(selectionContains(selectionPreview_,x,y) && (selectionKind_==4 || !selectionContains(selectionPreview_,x-1,y) || !selectionContains(selectionPreview_,x+1,y) || !selectionContains(selectionPreview_,x,y-1) || !selectionContains(selectionPreview_,x,y+1)))pixel(x,y);}

      if(selectionKind_<=1 && runtimePreferences_.flag("cursor.selectionSizeVisible")){const auto target=marqueeTarget_.value_or(SelectionTransform{double(mask.x),double(mask.y),double(mask.width),double(mask.height)});const int l=int(std::floor(target.x)),t=int(std::floor(target.y)),r=l+int(target.width)-1,b=t+int(target.height)-1;

        const auto first=unicodeText(std::to_string(l)+", "+std::to_string(t)+" - "+std::to_string(r)+", "+std::to_string(b));const auto second=unicodeText(std::to_string(int(target.width))+" x "+std::to_string(int(target.height)));

        const int width=std::max(font_.inkBounds(first).w,font_.inkBounds(second).w)+4;auto anchor=pixelBox(l,t).origin();const int bx=std::clamp(anchor.x,viewport.x,std::max(viewport.x,viewport.x2()-width*uiScale)),by=std::clamp(anchor.y-26*uiScale,viewport.y,std::max(viewport.y,viewport.y2()-26*uiScale));

        UiPaintScale ui(g,gfx::Point(bx,by));g.fillRect(gfx::rgba(74,74,81,180),gfx::Rect(0,0,width,26));font_.draw(g,first,2,2,gfx::rgba(255,255,255,255));font_.draw(g,second,2,14,gfx::rgba(255,255,255,255));

      }

    }

    if(selectionKind_==5 || floatingDragging_ || selectionBoxDragging_ || selectionPivotDragging_ || !paletteMousePosition_)return;

    const auto point=*paletteMousePosition_;if(!selectionPointerVisible(point))return;

    const auto hit=transformHit(point);const int content=selectionHit(point);if(!selectionShift_ && selectionPivotHit(point))return;

    if(!creating && !selectionShift_ && (!hit.empty() || content==1 || (content==2 && (selectionMode_<2 || selectionCtrl_))))return;

    const auto p=canvasPoint(point);auto box=pixelBox(p.x,p.y);const int w=std::max(2,box.w),h=std::max(2,box.h);box.x-=(w-box.w)/2;box.y-=(h-box.h)/2;box.w=w;box.h=h;const auto color=selectionPreviewColor(p.x,p.y);

    for(int sx:{-1,1})for(int sy:{-1,1}){const int x=sx<0?box.x:box.x2(),y=sy<0?box.y:box.y2();g.fillRect(color,gfx::Rect(sx<0?x-6:x,sy<0?y-2:y,6,2));g.fillRect(color,gfx::Rect(sx<0?x-2:x,sy<0?y-6:y,2,6));}

  }

void Editor::paintBrushPreview(ui::Graphics& g,const gfx::Rect& cv,bool outlinePass) {InteractionScope interactionScope(8,"brush-preview");

    const int configured=runtimePreferences_.index("cursor.brushPreviewMode.Select");const int previewMode=(outlinePass || document.active())?1:configured==3?2:configured;if(previewMode==0)return;

    if(homeOpen_ || !documentOpen_ || pending_!=Pending::None || playing_ || spaceHeld_ || navigation_.pan_.active ||

       eyedropperHeld_ || eyedropperGesture_.active() || !(document.rasterToolsAvailable()||document.maskBrushAvailable()) || !paletteMousePosition_ ||

       !(ordinaryBrushTool() || (shapeTool_ && shapeSpec_.kind==ShapeKind::Line)) ||

       shapeDragging_ || document.floating() || !canvasViewport().contains(*paletteMousePosition_))return;

    if(!canvasOwnsPointer(*paletteMousePosition_))return;

    if(document.active() && !runtimePreferences_.flag("cursor.drawingBrushPreviewEnabled"))return;

    const auto brush=activeStrokeBrush();const auto p=gridSnapBrush(canvasPoint(*paletteMousePosition_));

    const auto anchor=runtimePreferences_.flag("tools.shiftLinePreviewEnabled") && brushFeedback_.brushPreviewShift_ && !document.active() && ordinaryBrushTool()?brushLineAnchor():nullptr;

    Point target=p;if(anchor && brushFeedback_.modifierCtrl_){auto end=constrainShapeLine({double(anchor->point.x),double(anchor->point.y)},{double(p.x),double(p.y)},runtimePreferences_.index("tools.lineDirectionStep.Number"));target={int(end.x),int(end.y)};}

    target=anchor?gridSnapPoint(target):gridSnapBrush(target);

    const double scale=canvasScale();

    auto box=[&](int x,int y){const int l=int(std::round(cv.x+x*scale)),t=int(std::round(cv.y+y*scale));return gfx::Rect(l,t,std::max(1,int(std::round(cv.x+(x+1)*scale))-l),std::max(1,int(std::round(cv.y+(y+1)*scale))-t));};

    if((eraser_ || previewMode==1 || previewMode==3) && !anchor){

      // Complete outline includes the portion outside the document.

      auto edge=[&](int x,int y,unsigned edges){const auto r=box(x,y);if(!r.intersects(canvasPaintViewport(g.getClipBounds())))return;const auto color=selectionPreviewColor(x,y,false);const int thickness=runtimePreferences_.index("cursor.brushEdgeThickness.Number");

        if(edges&1)g.fillRect(color,gfx::Rect(r.x,r.y,thickness,r.h));

        if(edges&2)g.fillRect(color,gfx::Rect(r.x2()-thickness,r.y,thickness,r.h));

        if(edges&4)g.fillRect(color,gfx::Rect(r.x,r.y,r.w,thickness));

        if(edges&8)g.fillRect(color,gfx::Rect(r.x,r.y2()-thickness,r.w,thickness));};

      if(!pencilImageBrush_ && brushFeedback_.brushPreviewBatch_){

        // Reuse legacy row-span geometry. Cache only boundary samples, rather

        // than rebuilding a tree for every interior pixel on every mouse move.

        if(brushFeedback_.eraserOutlineSize_!=brush.size || brushFeedback_.eraserOutlineShape_!=brush.shape){

          brushFeedback_.eraserOutline_.clear();const auto rows=brushSpans(brush);

          std::array<unsigned char,64*64> mask{};

          for(const auto& row:rows)for(int x=row.left;x<=row.right;++x)mask[row.y*64+x]=1;

          auto contains=[&](int x,int y){return x>=0 && y>=0 && x<brush.size && y<brush.size && mask[y*64+x]!=0;};

          for(int x=0;x<brush.size;++x)for(int y=0;y<brush.size;++y)if(contains(x,y)){

            const unsigned edges=(!contains(x-1,y)?1:0)|(!contains(x+1,y)?2:0)|(!contains(x,y-1)?4:0)|(!contains(x,y+1)?8:0);

            if(edges)brushFeedback_.eraserOutline_.push_back({x-brush.size/2,y-brush.size/2,edges});

          }

          brushFeedback_.eraserOutlineSize_=brush.size;brushFeedback_.eraserOutlineShape_=brush.shape;

        }

        for(const auto& sample:brushFeedback_.eraserOutline_)edge(p.x+sample.x,p.y+sample.y,sample.edges);

        if(eraser_ || previewMode==1)return;

      }

      std::set<std::pair<int,int>> mask;

      if(pencilImageBrush_){const auto stamp=prepareImageBrushStamp(*pencilImageBrush_,brush.size,pencilImageBrushAngle_,brush.imagePaintMode,p.x,p.y,p.x-pencilImageBrush_->width/2,p.y-pencilImageBrush_->height/2);for(auto sample:stamp.samples)mask.emplace(p.x-stamp.width/2+sample.x,p.y-stamp.height/2+sample.y);}

      else for(auto span:brushSpans(brush))for(int x=span.left;x<=span.right;++x)mask.emplace(p.x-brush.size/2+x,p.y-brush.size/2+span.y);

      for(auto [x,y]:mask)edge(x,y,(!mask.count({x-1,y})?1:0)|(!mask.count({x+1,y})?2:0)|(!mask.count({x,y-1})?4:0)|(!mask.count({x,y+1})?8:0));

      if(eraser_ || previewMode==1)return;

    }

    const auto replacements=document.brushPreview(anchor?anchor->point:p,target,eraser_?0:ink_,brush,pencilImageBrush_?&*pencilImageBrush_:nullptr,pencilImageBrushAngle_,brushLineBaseline(anchor),bool(anchor));

    if(replacements.empty())return;

    PixelRegion region;for(auto [i,value]:replacements)region.include(int(i%document.width()),int(i/document.width()));

    std::vector<Pixel> pixels(std::size_t(region.w)*region.h);

    const auto& source=document.activeSurface();raster::validate(source);
    const bool denseSource=raster::fullCanvas(source,document.width(),document.height());
    for(int y=0;y<region.h;++y){auto row=pixels.begin()+std::size_t(y)*region.w;if(denseSource)std::copy_n(source.pixels.begin()+std::size_t(region.y+y)*document.width()+region.x,region.w,row);else for(int x=0;x<region.w;++x)row[x]=raster::readWorld(source,region.x+x,region.y+y);}

    for(auto [i,value]:replacements)pixels[(i/document.width()-region.y)*region.w+i%document.width()-region.x]=value;

    auto composed=compositeNormalRegion(document.displayTimeline(),document.frame().id,{region.x,region.y,region.w,region.h},document.layer().id,&pixels,region.w,region.x,region.y);

    // Port legacy solidCompositePreviewRects: group adjacent equal colors.

    // Keep fillRect's exact alpha rounding, including image-brush samples.

    // Integer zoom has disjoint boxes; fractional zoom retains scalar order.

    if(brushFeedback_.brushPreviewBatch_ && !anchor && scale>=1 && scale==std::floor(scale) && std::uint64_t(region.w)*region.h<=256*256){

      std::vector<std::uint8_t> occupied(pixels.size(),0);

      for(auto [i,value]:replacements)occupied[(i/document.width()-region.y)*region.w+i%document.width()-region.x]=1;

      for(int y=0;y<region.h;++y)for(int x=0;x<region.w;){const auto at=std::size_t(y)*region.w+x;if(!occupied[at]){++x;continue;}

        const int first=x;const auto color=composed[at];const int checker=checkerboard_.size*scale<2?0:((region.x+x)/checkerboard_.size+(region.y+y)/checkerboard_.size)%2;

        while(++x<region.w && occupied[std::size_t(y)*region.w+x] && composed[std::size_t(y)*region.w+x]==color && (checkerboard_.size*scale<2 || ((region.x+x)/checkerboard_.size+(region.y+y)/checkerboard_.size)%2==checker)){}

        const auto left=box(region.x+first,region.y+y),right=box(region.x+x-1,region.y+y);const gfx::Rect r(left.x,left.y,right.x2()-left.x,left.h);

        if(!r.intersects(canvasPaintViewport(g.getClipBounds())))continue;

        g.fillRect(checker?checkerboard_.dark:checkerboard_.light,r);g.fillRect(gfx::rgba(color&255,(color>>8)&255,(color>>16)&255,color>>24),r);

      }

      if(configured==3 && !outlinePass)paintBrushPreview(g,cv,true);

      return;

    }

    for(auto [i,value]:replacements){const int x=int(i%document.width()),y=int(i/document.width());auto r=box(x,y);if(!r.intersects(canvasPaintViewport(g.getClipBounds())))continue;

      auto color=composed[std::size_t(y-region.y)*region.w+x-region.x];

      g.fillRect(checkerboard_.size*scale<2?checkerboard_.light:checkerboard_.at(x,y),r);

      g.fillRect(gfx::rgba(color&255,(color>>8)&255,(color>>16)&255,color>>24),r);

    }

    if(configured==3 && !outlinePass)paintBrushPreview(g,cv,true);

  }

void Editor::paintCanvasBackdrop(ui::Graphics& g) {

    g.saveClip();clipColumn(g,-1,true);UiPaintScale scale(g);

    const auto rc=uiLogical(clientBounds());const auto l=workspaceLayout(rc);

    g.fillRect(skin_["background"],rc);paintWorkLayer(g,rc);

    if(!advancedActive())for(int i=0;i<2;++i){const auto r=i?l.workspaceContent():l.workspacePanel();const char* slot=i?"panel_content":"panel_outer";

      g.fillRect(skin_[i?"background":"panel"],r);if(!skin_.draw(g,slot,r))g.drawRect(skin_["border"],r);

    }

    if(canvasHorizontal_ && canvasHorizontal_->isVisible() && canvasVertical_->isVisible())paintScrollbarCorner(g,canvasViewport());

    g.restoreClip();

  }

void Editor::paintCanvas(ui::Graphics& g) {InteractionScope interactionScope(9,"canvas-paint");

    auto viewport=canvasViewport();viewport.offset(-bounds().x,-bounds().y);

    auto cv=canvas_;cv.offset(-bounds().x,-bounds().y);

    g.saveClip();g.clipRect(viewport);clipColumn(g,-1,true);

    g.fillRect(skin_["background"],viewport);

    if(!documentOpen_){g.restoreClip();return;}
    viewport=canvasPaintViewport(viewport);g.save();g.concat(canvasRotationMatrix());

    {

      // Decoration remains 2x, but its origin can move by one device pixel.

      UiPaintScale scale(g,cv.origin());

      skin_.draw(g,"document_frame",gfx::Rect(-3,-3,cv.w/uiScale+6,cv.h/uiScale+6));

      const auto dimensions=std::to_string(document.width())+" x "+std::to_string(document.height());

      font_.draw(g,std::u32string(dimensions.begin(),dimensions.end()),0,-15,skin_["muted"]);

    }

    if(previewPanel_)previewPanel_->checkerboard=checkerboard_;

    ensureContentCache();
    renderer_.draw(g,cv,canvasScale(),checkerboard_.light,checkerboard_.dark,checkerboard_.size);
    paintFreeTileInstanceFeedback(g,cv);
    // legacy canvas-render-guides.ts: committed composite remains unchanged.
    if(canvasResizePreview_&&canvasResizeIdentity_==document.identity()&&canvasResizeRevision_==document.revision()){
      const auto v=*canvasResizePreview_;const double z=canvasScale();auto coord=[](double n){return int(std::clamp(std::floor(n+.5),-10000000.,10000000.));};
      const int left=coord(cv.x-double(v[2])*z),top=coord(cv.y-double(v[3])*z),right=coord(cv.x+(double(v[0])-v[2])*z),bottom=coord(cv.y+(double(v[1])-v[3])*z);const gfx::Rect proposed(left,top,std::max(1,right-left),std::max(1,bottom-top));
      auto difference=[](gfx::Rect a,gfx::Rect b){std::vector<gfx::Rect> result;auto overlap=a.createIntersection(b);if(overlap.isEmpty()){result.push_back(a);return result;}auto add=[&](gfx::Rect r){if(!r.isEmpty())result.push_back(r);};add({a.x,a.y,a.w,overlap.y-a.y});add({a.x,overlap.y2(),a.w,a.y2()-overlap.y2()});add({a.x,overlap.y,overlap.x-a.x,overlap.h});add({overlap.x2(),overlap.y,a.x2()-overlap.x2(),overlap.h});return result;};
      const auto exposed=difference(proposed,cv),clipped=difference(cv,proposed);const double cell=checkerboard_.size*z;
      for(auto area:exposed){area&=viewport;if(area.isEmpty())continue;g.saveClip();g.clipRect(area);g.fillRect(checkerboard_.light,area);if(cell>=2){const int firstX=int(std::floor((area.x-cv.x)/cell)),lastX=int(std::ceil((area.x2()-cv.x)/cell)),firstY=int(std::floor((area.y-cv.y)/cell)),lastY=int(std::ceil((area.y2()-cv.y)/cell));for(int y=firstY;y<lastY;++y)for(int x=firstX;x<lastX;++x)if((x+y)%2){const int x0=coord(cv.x+x*cell),y0=coord(cv.y+y*cell),x1=coord(cv.x+(x+1)*cell),y1=coord(cv.y+(y+1)*cell);g.fillRect(checkerboard_.dark,{x0,y0,x1-x0,y1-y0});}}g.restoreClip();}
      for(const auto& areas:{exposed,clipped})for(auto area:areas){area&=viewport;if(!area.isEmpty())g.fillRect(gfx::rgba(0,0,0,115),area);}
      Pixel packed=0xffff0000;parsePaletteHex(runtimePreferences_.get("appearance.canvasResizeColor"),packed);const auto color=gfx::rgba(packed&255,(packed>>8)&255,(packed>>16)&255,packed>>24);
      g.fillRect(color,{cv.x,cv.y,cv.w,1});g.fillRect(color,{cv.x,cv.y2()-1,cv.w,1});g.fillRect(color,{cv.x,cv.y,1,cv.h});g.fillRect(color,{cv.x2()-1,cv.y,1,cv.h});
      for(int x:{proposed.x,proposed.x2()})g.fillRect(color,{x,viewport.y,2*uiScale,viewport.h});for(int y:{proposed.y,proposed.y2()})g.fillRect(color,{viewport.x,y,viewport.w,2*uiScale});
    }

    if(tweenEndpointImage_&&tweenEndpointIdentity_==document.identity()&&tweenEndpointRevision_==document.revision()){
      const double z=canvasScale();const int x=int(std::floor(cv.x+tweenEndpointX_*z+.5)),y=int(std::floor(cv.y+tweenEndpointY_*z+.5));ui::Paint ghost(gfx::rgba(255,255,255,102));ghost.blendMode(os::BlendMode::SrcOver);g.saveClip();g.clipRect(canvasViewport());g.drawSurface(tweenEndpointImage_.get(),{0,0,tweenEndpointImage_->width(),tweenEndpointImage_->height()},{x,y,std::max(1,int(std::floor(tweenEndpointImage_->width()*z+.5))),std::max(1,int(std::floor(tweenEndpointImage_->height()*z+.5)))},os::Sampling(),&ghost);g.restoreClip();
    }


    if(document.showCustomGrid()){

      Pixel packed=0xffff0000;parsePaletteHex(runtimePreferences_.get("appearance.gridColor"),packed);const auto color=gfx::rgba(packed&255,(packed>>8)&255,(packed>>16)&255,packed>>24);const auto settings=document.customGrid();

      auto clip=canvasPaintViewport(g.getClipBounds());clip&=gfx::Rect(cv.x,cv.y,int(std::ceil(document.width()*canvasScale())),int(std::ceil(document.height()*canvasScale())));g.saveClip();g.clipRect(clip);

      for(double x:gridLinePositions(settings.x,settings.width,std::max(0.,(clip.x-cv.x)/canvasScale()),std::min(double(document.width()),(clip.x2()-cv.x)/canvasScale()),zoom_))g.fillRect(color,gfx::Rect(int(std::floor(cv.x+x*canvasScale()+.5)),clip.y,1,clip.h));

      for(double y:gridLinePositions(settings.y,settings.height,std::max(0.,(clip.y-cv.y)/canvasScale()),std::min(double(document.height()),(clip.y2()-cv.y)/canvasScale()),zoom_))g.fillRect(color,gfx::Rect(clip.x,int(std::floor(cv.y+y*canvasScale()+.5)),clip.w,1));g.restoreClip();

    }

    if(document.showPixelGrid()&&shouldRenderPixelGrid(zoom_)){

      Pixel packed=0x8f5c4d45;parsePaletteHex(runtimePreferences_.get("appearance.pixelGridColor"),packed);const auto color=gfx::rgba(packed&255,(packed>>8)&255,(packed>>16)&255,packed>>24);

      const auto clip=canvasPaintViewport(g.getClipBounds()).createIntersection(cv);g.saveClip();g.clipRect(cv);

      for(int x:pixelGridLines(cv.x,canvasScale(),document.width(),clip.x,clip.x2()))g.fillRect(color,gfx::Rect(x,clip.y,1,clip.h));

      for(int y:pixelGridLines(cv.y,canvasScale(),document.height(),clip.y,clip.y2()))g.fillRect(color,gfx::Rect(clip.x,y,clip.w,1));g.restoreClip();

    }

    paintBrushPreview(g,cv);

    if(symmetryHas(document.symmetryAxes)){

      const auto c=document.symmetryCenter();const auto a=document.symmetryAxes;const double scale=canvasScale();

      const auto color=gfx::rgba(symmetryColor_&255,(symmetryColor_>>8)&255,(symmetryColor_>>16)&255,symmetryColor_>>24);

      auto draw=[&](double x,double y){if(x<0 || y<0 || x>document.width() || y>document.height())return;g.fillRect(color,gfx::Rect(int(std::round(cv.x+x*scale)),int(std::round(cv.y+y*scale)),symmetryThickness_,symmetryThickness_));};

      const auto clip=canvasPaintViewport(g.getClipBounds());

      // A sample extends to the right/bottom by the configured thickness.

      // Preserve original sample coordinates/order; skip only invisible samples.

      const int firstX=symmetryClip_?std::max(0,clip.x-cv.x-symmetryThickness_):0,lastX=symmetryClip_?std::min(cv.w,clip.x2()-cv.x):cv.w;

      const int firstY=symmetryClip_?std::max(0,clip.y-cv.y-symmetryThickness_):0,lastY=symmetryClip_?std::min(cv.h,clip.y2()-cv.y):cv.h;

      if(a.horizontal||a.rotational||a.diagonalDown||a.diagonalUp)for(int x=firstX;x<=lastX;++x){const double px=x/scale;if(a.horizontal||a.rotational)draw(px,c.y);if(a.diagonalDown)draw(px,px+c.y-c.x);if(a.diagonalUp)draw(px,c.x+c.y-px);}

      if(a.vertical||a.rotational)for(int y=firstY;y<=lastY;++y)draw(c.x,y/scale);

    }

    if(selectionTool_ && selectionKind_==5 && selectionBrushPointer_ && canvasOwnsPointer(*selectionBrushPointer_) && !eyedropperTool_ && !eyedropperHeld_ && !eyedropperGesture_.active() && !spaceHeld_ && !handTool_ && ((selectionDragging_ && !selectionBoxDragging_) || transformHit(*selectionBrushPointer_).empty())){const auto pointer=*selectionBrushPointer_;if((selectionDragging_ && !selectionBoxDragging_) || selectionHit(pointer)==0){auto coverage=selectionBrushStroke_;const auto p=canvasPoint(pointer);coverage.collect(document.width(),document.height(),{p.x,p.y},{p.x,p.y},brushFeedback_.brushProfiles_[0],selectionBrushAngle_);const double scale=canvasScale();auto draw=[&](int x,int y){const int left=int(std::round(cv.x+x*scale)),top=int(std::round(cv.y+y*scale)),right=int(std::round(cv.x+(x+1)*scale)),bottom=int(std::round(cv.y+(y+1)*scale));g.fillRect(gfx::rgba(41,121,255,89),gfx::Rect(left,top,std::max(1,right-left),std::max(1,bottom-top)));};for(auto key:coverage.visited)draw(int(key%document.width()),int(key/document.width()));for(auto p:coverage.outsidePreview)draw(p.first,p.second);}}

    paintAirbrushPreview(g,cv);paintLiquifyPreview(g,cv);
    paintSmoothCoverage(g,cv);
    if(document.gradientActive()){auto handle=[&](TransformPoint p){const int x=gradientRound(cv.x+p.x*canvasScale()),y=gradientRound(cv.y+p.y*canvasScale());g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));};handle(gradientSpec_.radial?resolveGradientGeometry(gradientSpec_).center:gradientSpec_.start);handle(gradientSpec_.end);}

    if(runtimePreferences_.flag("tools.alignmentGuidesVisible") && (selectionDragging_ || floatingDragging_ || moveDragging_) && !alignmentGuides_.empty()){
      const gfx::Rect boundary(cv.x,cv.y,int(std::ceil(document.width()*canvasScale())),int(std::ceil(document.height()*canvasScale())));
      g.saveClip();g.clipRect(boundary);const auto color=gfx::rgba(41,121,255,230);
      for(auto guide:alignmentGuides_){if(guide.axis=='x' && guide.position>=0 && guide.position<=document.width()){const int x=int(std::floor(cv.x+guide.position*canvasScale()+.5))-(guide.position==document.width()?1:0);g.fillRect(color,gfx::Rect(x,boundary.y,1,boundary.h));}else if(guide.axis=='y' && guide.position>=0 && guide.position<=document.height()){const int y=int(std::floor(cv.y+guide.position*canvasScale()+.5))-(guide.position==document.height()?1:0);g.fillRect(color,gfx::Rect(boundary.x,y,boundary.w,1));}}
      g.restoreClip();
    }
    paintMoveFeedback(g,cv);
    paintTextBox(g,cv);
    paintSelectionFeedback(g,cv,viewport);

    paintSelectionAnts(g,cv,viewport,antsOffset_);

    // Legacy useCanvasSelectionOverlay: one union outline for selected free
    // instances, below an explicit pixel selection and hidden during playback.
    if(showSelectionOutline_&&!document.selection()&&!playing_){
      PixelRegion selected;for(const auto& id:document.selectedFreeTileInstances())if(const auto b=document.freeTileInstanceBounds(id)){selected.include(b->x,b->y);selected.include(b->x+b->w-1,b->y+b->h-1);}
      if(selected.w>0&&selected.h>0){Pixel packed=0xffff0000;parsePaletteHex(runtimePreferences_.get("appearance.freeTileInstanceOutlineColor.Color"),packed);const auto color=gfx::rgba(packed&255,(packed>>8)&255,(packed>>16)&255,packed>>24);const auto coord=[](double n){return int(std::clamp(std::floor(n+.5),-10000000.,10000000.));};const int left=coord(cv.x+selected.x*canvasScale()),top=coord(cv.y+selected.y*canvasScale()),right=coord(cv.x+(selected.x+selected.w)*canvasScale()),bottom=coord(cv.y+(selected.y+selected.h)*canvasScale());g.drawRect(color,{left,top,std::max(1,right-left),std::max(1,bottom-top)});}
    }

    if(showSelectionOutline_ && document.selection() && !homeOpen_ && !smoke_ && !antsTimer_.isRunning())antsTimer_.start();

    if(selectionTool_ && !selectionDragging_){if(auto target=selectionControlTarget()){for(auto uv:std::array<TransformPoint,8>{{{0,0},{.5,0},{1,0},{0,.5},{1,.5},{0,1},{.5,1},{1,1}}}){if(selectionFreeTransform_ && (uv.x==.5 || uv.y==.5))continue;auto p=transformPoint(*target,uv.x,uv.y);const int x=int(std::round(cv.x+p.x*canvasScale())),y=int(std::round(cv.y+p.y*canvasScale()));g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));}}}

    if((drawingAnchorActive()&&drawingAnchorVisible_) || (document.selection() && selectionPivotVisible_ && !selectionFreeTransform_ && !selectionDragging_)){const auto p=drawingAnchorActive()&&drawingAnchorVisible_?drawingAnchorPoint():selectionPivotPoint();const auto point=gfx::Point(int(std::round(cv.x+p.x*canvasScale())),int(std::round(cv.y+p.y*canvasScale())));UiPaintScale scale(g,point-gfx::Point(9,9));toolIcons_.draw(g,"selection-pivot",gfx::Rect(0,0,9,9),true);}

    g.restore();
    paintSliceOverlay(g);paintViewRotationIndicator(g);
    g.restoreClip();

  }

void Editor::onPaint(ui::PaintEvent& ev) {

    auto& g=*ev.graphics();
    struct AdvancedNoticePaint{Editor& e;ui::Graphics& g;~AdvancedNoticePaint(){e.paintAdvancedNotice(g);}} advancedNoticePaint{*this,g};

    // Like legacy's requestDrawRef, invalidations share the existing drawing

    // scheduler. Pan requests only the viewport and reuses composed content.

    if(!homeOpen_ && pending_==Pending::None){

      const auto ll=columnLayout(uiLogical(clientBounds()),2);

      auto timelineArea=toDisplay(gfx::Rect(ll.workX,ll.layerTop+35,ll.workW,ll.bottom-ll.layerTop-35));timelineArea.offset(-bounds().origin());

      if(columnShown(2) && !columnFloating(2) && timelineArea.contains(g.getClipBounds())){

        paintTimelineCached(g,ll,timelineArea);return;

      }

      auto full=canvasFullViewport();full.offset(-bounds().origin());

      full.enlarge(uiScale);

      if(full.contains(g.getClipBounds())) {paintCanvasBackdrop(g);paintCanvas(g);paintEyedropperLens(g);return;}

      const auto layout=workspaceLayout(uiLogical(clientBounds()));

      const auto options=uiPhysical(gfx::Rect(layout.workX,optionsTop(),layout.workW,Layout::optionsHeight));

      if(advancedMode_!=2 && options.contains(g.getClipBounds())){g.saveClip();clipColumn(g,-1,true);UiPaintScale scale(g);g.fillRect(skin_["background"],uiLogical(clientBounds()));paintWorkLayer(g,uiLogical(clientBounds()));g.restoreClip();return;}

      auto status=statusBounds();status.offset(-bounds().origin());

      if(!advancedActive() && status.contains(g.getClipBounds())){UiPaintScale scale(g);g.fillRect(skin_["background"],uiLogical(clientBounds()));paintWorkLayer(g,uiLogical(clientBounds()));paintStatusText(g);return;}

    }

    if(homeOpen_)paintHome(g);else{paintChrome(g);paintTimelineGrid(g);paintCanvas(g);paintEyedropperLens(g);}

  }

void Editor::paintDockFeedback(ui::Graphics& g) {
    if(advancedActive())return;

    const auto& d=panelGesture_;if(d.id<0 || !d.moved || d.edges || d.before.groups[d.before.groupOf(d.id)].dock==panels::Dock::Floating)return;

    UiPaintScale scale(g);

    if(d.confirmed.group>=0 || d.confirmed.dock!=panels::Dock::Floating){

      auto r=d.confirmed.preview;const auto color=skin_["accent"];

      g.fillRect(gfx::rgba(gfx::getr(color),gfx::getg(color),gfx::getb(color),88),gfx::Rect(r.x,r.y,r.w,r.h));

    }

    const auto& caption=dockingTabs_[d.id]->caption;const auto ink=font_.inkBounds(caption);

    const auto ghost=dockGhostRect();skin_.draw(g,"panel_tab_active",ghost);

    font_.draw(g,caption,ghost.x+5-ink.x,ghost.y+4,skin_["text"]);

  }

}

namespace moon::editor {
void Editor::copyEditorClipboard(bool cut){
 try{if(paletteFocused_){if(!cut)copyPaletteColors();return;}if(document.freeTileInstanceView()&&(!document.selection()||(freeTileInstancesPanel_&&freeTileInstancesPanel_->clipboardScope()))){auto clipboard=document.copyFreeTileInstances();if(!clipboard)return;freeTileInstanceClipboard_=std::move(clipboard);pixelClipboard_.captureStructuredCopyBaseline();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};frameClipboardSnapshot_={};pixelClipboard_.clear();document.clearMaskClipboard();if(cut)document.deleteFreeTileInstances(document.selectedFreeTileInstances());refresh();return;}if(document.hasTilemapContent()&&document.layer().kind!="free-tile"&&document.selection()&&!mixedPixelCopyContext(cut))throw std::runtime_error("瓦片文档当前支持整图层、图层组、整帧与整单元格剪贴板");if(document.selection()){copySelectionPixels(cut);return;}if(!selectedMaskSlots_.empty()){freeTileInstanceClipboard_.reset();copyMaskTimeline(cut);return;}document.clearMaskClipboard();if(celClipboardContext()){if(cut)cutTimelineCels();else copyTimelineCels();return;}if(frameSelectionExplicit_){if(cut)cutTimelineFrames();else copyTimelineFrames();return;}
 if(cut&&!document.canDeleteSelectedLayers())return;auto snapshot=document.copyLayerClipboard();freeTileInstanceClipboard_.reset();layerClipboardSnapshot_=std::move(snapshot);if(layerClipboardSnapshot_){celClipboardSnapshot_={};frameClipboardSnapshot_={};pixelClipboard_.clear();if(cut)document.deleteSelectedLayers();}refresh();}catch(const std::exception& e){showSaveError(e);}
}
void Editor::pasteEditorClipboard(){try{if(!paletteFocused_&&freeTileInstanceClipboard_){const auto external=pixelClipboard_.readSystemSelection();if(!pixelClipboard_.preferStructuredCopy(external)){pasteSelectionPixels();return;}}if(!paletteFocused_&&!freeTileInstanceClipboard_&&!layerClipboardSnapshot_&&!hasApplicationCelClipboard()&&!hasApplicationFrameClipboard()&&!document.hasMaskClipboard()&&document.layer().kind=="free-tile"&&document.activeMaskId().empty()){pasteSelectionPixels();return;}if(!paletteFocused_&&!document.selection()&&!layerClipboardSnapshot_&&!hasApplicationCelClipboard()&&!hasApplicationFrameClipboard()&&document.hasMaskClipboard()&&(!selectedMaskSlots_.empty()||!document.timelineSelection().cels.empty())){
 bool external=false;if(GetClipboardSequenceNumber()!=document.maskClipboardSequence())try{external=bool(pixelClipboard_.read());}catch(...){}
 if(external){pasteSelectionPixels();return;}if(!selectedMaskSlots_.empty()){const auto target=selectedMaskSlots_.back();pasteMaskTimeline(target.first,target.second);return;}const auto* c=document.timeline().findCelById(document.timelineSelection().cels.back());if(c){pasteMaskTimeline(c->layerId,c->frameId);return;}}
 if(mixedPixelPasteContext()){pasteSelectionPixels();return;}if(document.hasTilemapContent()&&!paletteFocused_&&(!document.activeMaskId().empty()||!(freeTileInstanceClipboard_&&document.layer().kind=="free-tile"&&document.layer().freeTiles&&document.cel().freeTiles&&document.activeMaskId().empty())&&!(layerClipboardSnapshot_||(celClipboardContext()?!document.active()&&!document.selection()&&hasApplicationCelClipboard()&&!applicationCelSelectionOnly():frameSelectionExplicit_&&hasApplicationFrameClipboard()))))throw std::runtime_error("瓦片文档当前支持整图层、图层组、整帧与整单元格剪贴板");if(paletteFocused_){pastePaletteColors();return;}if(!document.activeMaskId().empty()){pasteSelectionPixels();return;}if(freeTileInstanceClipboard_&&document.layer().kind=="free-tile"&&document.layer().freeTiles&&document.cel().freeTiles&&document.activeMaskId().empty()){document.pasteFreeTileInstances(*freeTileInstanceClipboard_);selectionPropertiesActive_=false;selectionFreeTransform_=false;selectionPivot_.reset();refresh();return;}if(layerClipboardSnapshot_){document.pasteLayerClipboard(*layerClipboardSnapshot_);virtualSlots_.clear();virtualAnchor_.reset();refresh();return;}if(celClipboardContext()){pasteTimelineCels();return;}if(frameSelectionExplicit_){pasteTimelineFrames();return;}pasteSelectionPixels();}catch(const std::exception& e){showSaveError(e);}}
}

namespace moon::editor {
void Editor::smokeMaskSelectionClipboard(){
 smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;frameSelectionExplicit_=false;playing_=false;document=Document(4,2);document.fillSelectionOrCanvas(0xff112233);const auto cel=document.pixels();const auto owner=document.layer().id,frame=document.frame().id;auto require=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};
 require(document.createAttachedMask(owner,frame),"Mask clipboard UI fixture");document.clearTimelineSelection();document.previewSelection({});refresh();requestFocus();
 SelectionClipboard input;input.width=2;input.height=1;input.originX=1;input.originY=0;input.pixels={0x800000ff,0xff000000};input.mask={1,1};auto previous=pixelClipboard_.exchangeSystemImageReaderForSmoke([&]{return std::optional<SelectionClipboard>{input};});
 try{
  const auto baseline=timeline::resolvedMask(document.timeline().state(),owner,frame)->surface.pixels;const auto history=document.historyPosition();
  frameSelectionExplicit_=true;pasteEditorClipboard();require(document.floating()&&document.pixels()==cel,"Mask actual paste routing");require(selectionTool_&&document.historyPosition()==history,"Mask paste remains unconfirmed");
  ui::KeyMessage cancel(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&cancel);require(!document.floating()&&timeline::resolvedMask(document.timeline().state(),owner,frame)->surface.pixels==baseline,"Mask actual Escape baseline");
  pasteEditorClipboard();require(document.floating(),"Mask actual second paste");ui::KeyMessage confirm(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);onProcessMessage(&confirm);require(!document.floating()&&document.pixels()==cel,"Mask actual Enter target isolation");const auto committed=timeline::resolvedMask(document.timeline().state(),owner,frame)->surface.pixels;require(committed!=baseline,"Mask actual Enter commits pixels");
  require(document.historyPosition()==history+2,"Mask Enter content and deselect history");document.undo();document.undo();require(timeline::resolvedMask(document.timeline().state(),owner,frame)->surface.pixels==baseline,"Mask actual paste undo");document.redo();document.redo();require(timeline::resolvedMask(document.timeline().state(),owner,frame)->surface.pixels==committed,"Mask actual paste redo");
  frameSelectionExplicit_=false;document.clearTimelineSelection();document.previewSelection(SelectionMask{1,0,2,1,{}});startFreeSelectionTransform();require(document.floating()&&selectionFreeTransform_,"Mask actual free transform entry");onProcessMessage(&cancel);require(!document.floating()&&timeline::resolvedMask(document.timeline().state(),owner,frame)->surface.pixels==committed,"Mask free transform Escape isolation");
  pixelClipboard_.exchangeSystemImageReaderForSmoke(std::move(previous));document=Document();frameSelectionExplicit_=false;refresh();
 }catch(...){pixelClipboard_.exchangeSystemImageReaderForSmoke(std::move(previous));throw;}
}

void Editor::useSmoothTool(){
 if(document.active()||selectionDragging_||floatingDragging_)return;
 document.commitFloatingPaste();cancelStroke();liquifyTool_=false;liquifyResetPosition_.reset();smoothTool_=false;airbrushTool_=false;rotateTool_=textTool_=moveTool_=selectionTool_=shapeTool_=eyedropperTool_=navigation_.zoomTool_=gradientTool_=fillTool_=handTool_=eraser_=false;smoothTool_=true;playing_=false;toolRowScroll_=0;refresh();
}
bool Editor::processSmoothInput(ui::Message* msg){
 if(!smoothTool_)return false;
 if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kMouseMoveMessage&&msg->type()!=ui::kMouseUpMessage)return false;
 auto* m=static_cast<ui::MouseMessage*>(msg);const auto point=canvasPoint(m->position());
 if(spaceHeld_||handTool_||eyedropperHeld_||eyedropperGesture_.active()){if(smoothDragging_){cancelStroke();return true;}return false;}
 if(canvasViewport().contains(m->position()))smoothPointer_=m->position();else if(!smoothDragging_)smoothPointer_.reset();
 if(smoothDragging_){
  if(!hasCapture()||playing_||document.active()||!document.rasterToolsAvailable()||!document.layer().kind.empty()||!document.activeMaskId().empty()||!selectionEqual(document.selection(),smoothSelection_)||document.identity()!=smoothIdentity_||document.contentRevision()!=smoothContent_||document.layer().id!=smoothLayer_||document.frame().id!=smoothFrame_){smoothDragging_=false;smoothArea_={};if(hasCapture())releaseMouse();refresh();return true;}
  if(msg->type()==ui::kMouseMoveMessage||(msg->type()==ui::kMouseUpMessage&&m->button()==ui::kButtonLeft)){
   {dynamicsRasterDistance_=std::max(std::abs(point.x-smoothLast_.x),std::abs(point.y-smoothLast_.y));auto b=smoothBrush_;const auto resolved=resolveDynamics();b.size=resolved.size;smoothArea_.collect(document.width(),document.height(),smoothLast_,{point.x,point.y},b,dynamics::rounded(dynamics::wrapAngle(smoothAngle_+resolved.angle)),document.selection());}smoothLast_={point.x,point.y};
   if(msg->type()==ui::kMouseUpMessage){auto visited=std::move(smoothArea_.visited);smoothArea_={};smoothDragging_=false;if(hasCapture())releaseMouse();try{const bool changed=document.applySmoothBrush(visited,smoothStrength_,smoothStarted_);if(changed)usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-usageStrokeStarted_));usageStrokeStarted_=0;}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}else invalidateRect(canvasViewport());
  }return true;
 }
 if(msg->type()==ui::kMouseDownMessage&&canvasViewport().contains(m->position())){
  if(!m->left()||playing_||document.active()||!document.rasterToolsAvailable()||!document.layer().kind.empty()||!document.activeMaskId().empty()||!canvasDocumentContains(m->position()))return true;
  hideTimelineSelectionGuides();paletteFocused_=false;requestFocus();playing_=false;smoothDragging_=true;smoothStarted_=std::chrono::steady_clock::now();usageStrokeStarted_=usage::now();smoothIdentity_=document.identity();smoothContent_=document.contentRevision();smoothLayer_=document.layer().id;smoothFrame_=document.frame().id;smoothSelection_=document.selection();smoothLast_={point.x,point.y};smoothArea_={};{auto b=smoothBrush_;const auto resolved=resolveDynamics(true);b.size=resolved.size;smoothArea_.collect(document.width(),document.height(),smoothLast_,smoothLast_,b,dynamics::rounded(dynamics::wrapAngle(smoothAngle_+resolved.angle)),document.selection());}captureMouse();invalidateRect(canvasViewport());return true;
 }
 if(msg->type()==ui::kMouseMoveMessage){invalidateRect(canvasViewport());return canvasViewport().contains(m->position());}
 return msg->type()==ui::kMouseUpMessage&&canvasViewport().contains(m->position());
}
void Editor::paintSmoothCoverage(ui::Graphics& g,const gfx::Rect& cv){
 if(!smoothTool_||!smoothPointer_||playing_||document.active()||!document.rasterToolsAvailable()||!document.layer().kind.empty()||!document.activeMaskId().empty()||spaceHeld_||handTool_||eyedropperHeld_||eyedropperGesture_.active()||!canvasOwnsPointer(*smoothPointer_))return;
 auto coverage=smoothArea_;const auto p=canvasPoint(*smoothPointer_);coverage.collect(document.width(),document.height(),{p.x,p.y},{p.x,p.y},smoothBrush_,smoothAngle_,document.selection(),true);const double scale=canvasScale();
 auto draw=[&](int x,int y){const int l=int(std::round(cv.x+x*scale)),t=int(std::round(cv.y+y*scale)),r=int(std::round(cv.x+(x+1)*scale)),b=int(std::round(cv.y+(y+1)*scale));g.fillRect(gfx::rgba(230,0,255,89),gfx::Rect(l,t,std::max(1,r-l),std::max(1,b-t)));};
 for(auto key:coverage.visited)draw(int(key%document.width()),int(key/document.width()));for(auto [x,y]:coverage.outsidePreview)draw(x,y);
}


void Editor::paintAirbrushPreview(ui::Graphics& g,const gfx::Rect& cv){
 if(!airbrushTool_||!paletteMousePosition_||spaceHeld_||eyedropperHeld_||!canvasOwnsPointer(*paletteMousePosition_)||!canvasViewport().contains(*paletteMousePosition_)||(airbrushDragging_&&!runtimePreferences_.flag("cursor.drawingBrushPreviewEnabled")))return;
 const auto axes=document.activeMaskId().empty()&&document.layer().kind=="free-tile"?SymmetryAxes{}:document.symmetryAxes;
 auto center=gridSnapPoint(canvasPoint(*paletteMousePosition_));BrushOptions scatter;scatter.size=airbrushSettings_.scatterRadius*2+1;std::unordered_set<std::size_t> area;for(auto row:brushSpans(scatter,129))for(int x=row.left;x<=row.right;++x)for(auto p:symmetryPoints({center.x-scatter.size/2+x,center.y-scatter.size/2+row.y},document.width(),document.height(),axes,document.symmetryCenter()))if(!airbrushDragging_||!document.selection()||selectionContains(document.selection(),p.x,p.y))area.insert(std::size_t(p.y)*document.width()+p.x);
 const double z=canvasScale();auto box=[&](int x,int y){int l=int(std::round(cv.x+x*z)),t=int(std::round(cv.y+y*z));return gfx::Rect(l,t,std::max(1,int(std::round(cv.x+(x+1)*z))-l),std::max(1,int(std::round(cv.y+(y+1)*z))-t));};auto inside=[&](int x,int y){return x>=0&&y>=0&&x<document.width()&&y<document.height()&&area.count(std::size_t(y)*document.width()+x);};
 for(auto key:area){int x=int(key%document.width()),y=int(key/document.width());auto r=box(x,y);auto pixel=raster::readWorld(document.activeSurface(),x,y);const auto color=(299*(pixel&255)+587*((pixel>>8)&255)+114*((pixel>>16)&255))/1000>145?gfx::rgba(0,0,0,255):gfx::rgba(255,255,255,255);if(!inside(x-1,y))g.fillRect(color,{r.x,r.y,1,r.h});if(!inside(x+1,y))g.fillRect(color,{r.x2()-1,r.y,1,r.h});if(!inside(x,y-1))g.fillRect(color,{r.x,r.y,r.w,1});if(!inside(x,y+1))g.fillRect(color,{r.x,r.y2()-1,r.w,1});}
 BrushOptions particle;particle.size=airbrushSettings_.particleRadius*2-1;particle.shape=airbrushSettings_.shape;const auto footprint=selectionBrushFootprint(particle,particle.shape==BrushShape::Round?0:airbrushSettings_.angle);for(auto row:footprint.spans)for(int x=row.left;x<=row.right;++x)for(auto p:symmetryPoints({center.x-footprint.width/2+x,center.y-footprint.height/2+row.y},document.width(),document.height(),axes,document.symmetryCenter()))if(!airbrushDragging_||!document.selection()||selectionContains(document.selection(),p.x,p.y)){auto value=brushComposite(raster::readWorld(document.activeSurface(),p.x,p.y),strokeColor_?strokeColor_:ink_,100);g.fillRect(gfx::rgba(value&255,(value>>8)&255,(value>>16)&255,value>>24),box(p.x,p.y));}
}

}

namespace moon::editor {
bool Editor::drawingAnchorEligible()const{return (selectionTool_&&selectionKind_<=1)||(shapeTool_&&(shapeSpec_.kind==ShapeKind::Rectangle||shapeSpec_.kind==ShapeKind::RectangleOutline||shapeSpec_.kind==ShapeKind::Ellipse||shapeSpec_.kind==ShapeKind::EllipseOutline));}
bool Editor::drawingAnchorActive()const{return drawFromCanvasCenter_&&drawingAnchorEligible();}
TransformPoint Editor::drawingAnchorPoint()const{return {std::floor(drawingAnchor_.x*document.width()*2+.5)/2,std::floor(drawingAnchor_.y*document.height()*2+.5)/2};}
void Editor::setDrawingAnchor(TransformPoint point){if(!std::isfinite(point.x)||!std::isfinite(point.y))return;drawingAnchor_={std::floor(point.x*2+.5)/2/document.width(),std::floor(point.y*2+.5)/2/document.height()};saveBrushPreferences();invalidateRect(canvasViewport());}
void Editor::showDrawingAnchorPopup(){if(drawingAnchorActive()&&!document.active())showSelectionPivotPopup(true);}
void Editor::layoutDrawingAnchor(int& x){if(!drawingAnchorEligible())return;x+=4;for(auto control:{drawingAnchorButton_,drawingAnchorPresetButton_}){placePropertyControl(control,x,15);control->setVisible(true);control->setEnabled(pending_==Pending::None&&!document.active()&&!selectionDragging_&&!floatingDragging_&&!shapeDragging_);x+=15+uiGap;}drawingAnchorButton_->active=drawFromCanvasCenter_;drawingAnchorPresetButton_->setEnabled(drawingAnchorButton_->isEnabled()&&drawFromCanvasCenter_);}
}
