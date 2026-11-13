#include "editor.h"
#include "image_decode.h"
#include "ui/move_region.h"
#include "legacy_cursors.h"
#include "pixel_grid.h"
#include "sheet_import_preview.h"
#include "free_tile_selection_target.h"
#include "raster_geometry.h"
#include "layer_label_separator.h"
#include "preview_panel.h"
#include "floating_column_surface.h"
#include "floating_panel_geometry.h"
#include "ui_frame_capture.h"
#include "interaction_profile.h"
#include "pending_gradient_dialog.h"
#include "free_tile_instances_panel.h"

namespace moon::editor {
std::string textBoxPointerHit(const Document&,const Skin&,const gfx::Rect&,double,Point,gfx::Point);
std::string textLayerAtPoint(const Document&,Point);
// Legacy canvas-brush-coverage-overlay.ts: canonical coverage in every copy.
void drawSelectionBrushCoverage(ui::Graphics& g,const SelectionBrushStroke& coverage,int width,int height,repeat::Mode mode,const gfx::Rect& canvas,double scale){
 auto draw=[&](int x,int y){const int left=int(std::round(canvas.x+x*scale)),top=int(std::round(canvas.y+y*scale)),right=int(std::round(canvas.x+(x+1)*scale)),bottom=int(std::round(canvas.y+(y+1)*scale));g.fillRect(gfx::rgba(41,121,255,89),gfx::Rect(left,top,std::max(1,right-left),std::max(1,bottom-top)));};
 for(const auto copy:repeat::offsets(mode))for(auto key:coverage.visited)draw(int(key%width)+copy.x*width,int(key/width)+copy.y*height);
 if(mode==repeat::Mode::Off)for(auto point:coverage.outsidePreview)draw(point.first,point.second);
}

// Legacy tools-shapes.ts findShapeBoundarySpan / collectShapeBoundaryPoints.
std::vector<SelectionPoint> marqueeContour(const SelectionTransform& target,bool ellipse,int radius){
 const auto bounds=transformBounds(target);const int top=bounds.y,bottom=top+bounds.height,left=bounds.x,right=left+bounds.width-1;if(bounds.width<=0||bounds.height<=0)return {};
 const int roundedRadius=std::min(std::max(0,radius),int(std::floor(std::min(target.width,target.height)/2)));
 auto contains=[&](int x,int y){const auto local=transformLocalPoint(target,{x+.5,y+.5});const double px=local.x-target.x,py=local.y-target.y,dx=px-target.width/2,dy=py-target.height/2;if(ellipse)return dx*dx/(target.width*target.width/4)+dy*dy/(target.height*target.height/4)<=1;if(std::abs(dx)>=target.width/2-1e-9||std::abs(dy)>=target.height/2-1e-9)return false;if(!roundedRadius||(px>=roundedRadius&&px<=target.width-roundedRadius)||(py>=roundedRadius&&py<=target.height-roundedRadius))return true;const double cx=px<roundedRadius?roundedRadius:target.width-roundedRadius,cy=py<roundedRadius?roundedRadius:target.height-roundedRadius;return (px-cx)*(px-cx)+(py-cy)*(py-cy)<=roundedRadius*roundedRadius+1e-9;};
 std::vector<std::optional<std::pair<int,int>>> spans;spans.reserve(bounds.height);const double radians=target.angle*3.141592653589793/180,cosine=transformSnap(std::cos(-radians)),sine=transformSnap(std::sin(-radians)),cx=target.x+target.width/2,cy=target.y+target.height/2;
 for(int y=top;y<bottom;++y){const double seedX=std::abs(sine)<1e-9?cx-.5:cx-(y+.5-cy)*cosine/sine-.5;int seed=std::clamp(int(std::floor(seedX+.5)),left,right);if(!contains(seed,y)){bool found=false;for(int distance=1;distance<=right-left;++distance){if(seed-distance>=left&&contains(seed-distance,y)){seed-=distance;found=true;break;}if(seed+distance<=right&&contains(seed+distance,y)){seed+=distance;found=true;break;}}if(!found){spans.emplace_back();continue;}}int lo=left,hi=seed;while(lo<hi){int mid=lo+(hi-lo)/2;if(contains(mid,y))hi=mid;else lo=mid+1;}const int first=lo;lo=seed;hi=right;while(lo<hi){int mid=lo+(hi-lo+1)/2;if(contains(mid,y))lo=mid;else hi=mid-1;}spans.emplace_back(std::make_pair(first,lo));}
 auto member=[&](int x,int y){return y>=top&&y<bottom&&spans[y-top]&&x>=spans[y-top]->first&&x<=spans[y-top]->second;};std::set<std::pair<int,int>> removed;const double angle=std::fmod(std::fmod(target.angle,360)+360,360);if(!ellipse&&!roundedRadius&&target.width>2&&target.height>2&&std::abs(std::fmod(angle,90))>1e-9)for(int y=top;y<bottom;++y)if(spans[y-top]){auto span=*spans[y-top];for(int x=span.first;x<=span.second;++x){if(span.second-span.first>3&&x>span.first&&x<span.second){x=span.second-1;continue;}if(int(member(x-1,y))+int(member(x+1,y))+int(member(x,y-1))+int(member(x,y+1))<=1)removed.emplace(x,y);}}
 auto finalMember=[&](int x,int y){return member(x,y)&&!removed.count({x,y});};std::vector<SelectionPoint> points;std::set<std::pair<int,int>> seen;auto add=[&](int x,int y){if(finalMember(x,y)&&seen.emplace(x,y).second)points.push_back({x,y});};
 for(int y=top;y<bottom;++y)if(spans[y-top]){auto span=*spans[y-top];add(span.first,y);add(span.second,y);for(int neighbor:{y-1,y+1}){if(neighbor<top||neighbor>=bottom||!spans[neighbor-top]){for(int x=span.first;x<=span.second;++x)add(x,y);}else{auto other=*spans[neighbor-top];for(int x=span.first;x<=std::min(span.second,other.first-1);++x)add(x,y);for(int x=std::max(span.first,other.second+1);x<=span.second;++x)add(x,y);}}}for(auto point:removed)for(auto delta:std::array<SelectionPoint,4>{{{-1,0},{1,0},{0,-1},{0,1}}})add(point.first+delta.x,point.second+delta.y);return points;
}
bool Editor::processAirbrushInput(ui::Message* msg){
 if(!currentTools().airbrushTool)return false;
 if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kMouseMoveMessage&&msg->type()!=ui::kMouseUpMessage)return false;
 auto m=static_cast<ui::MouseMessage*>(msg);auto p=canvasPoint(m->position());
 const auto repeatMode=tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off;
 const auto mapped=repeat::map({double(p.x),double(p.y)},currentDocument().width(),currentDocument().height(),repeatMode);
 if(mapped)p={int(mapped->local.x),int(mapped->local.y)};
 if(airbrushDragging_&&msg->type()==ui::kMouseMoveMessage&&!mapped)return true;
 if(airbrushDragging_){if(!hasCapture()||!currentDocument().strokeActive()){cancelStroke();return true;}if(msg->type()==ui::kMouseMoveMessage){const auto snapped=gridSnapPoint(p);airbrushCenter_={snapped.x,snapped.y};invalidateRect(canvasViewport());return true;}if(msg->type()==ui::kMouseUpMessage&&m->button()==strokeButton_){airbrushDragging_=false;airbrushTimer_.stop();Document::HistoryLabelScope label(currentDocument(),U"喷枪");const bool changed=currentDocument().commitStroke();if(changed)usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-usageStrokeStarted_));usageStrokeStarted_=0;if(hasCapture())releaseMouse();refresh();return true;}return true;}
 if(spaceHeld_||currentTools().handTool||eyedropperHeld_||eyedropperGesture_.active())return false;
 if(msg->type()==ui::kMouseDownMessage&&canvasViewport().contains(m->position())){if(!(m->left()||m->right())||currentDocument().active()||!canvasDocumentContains(m->position())||!(currentDocument().rasterToolsAvailable()||(currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile"&&!currentDocument().freeTilePaintMode())))return true;hideTimelineSelectionGuides();paletteFocused_=false;currentDocument().clearPaletteSelection();requestFocus();currentPlayback().playing=false;const auto snapped=gridSnapPoint(p);airbrushCenter_={snapped.x,snapped.y};strokeButton_=m->button();strokeColor_=m->right()?currentDocument().palette().secondary:ink_;usageStrokeStarted_=usage::now();currentDocument().beginStroke({snapped.x,snapped.y},strokeColor_,{},nullptr,0,nullptr,false,false,false,repeatMode);if(!currentDocument().strokeActive())return true;captureMouse();airbrushDragging_=true;try{sprayAirbrush();nextAirbrushAt_=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now().time_since_epoch()).count()+currentTools().airbrushSettings.intervalMs;airbrushTimer_.start();}catch(...){cancelStroke();throw;}return true;}
 return canvasViewport().contains(m->position());
}

void Editor::wandTick(){
 if(selectionDragging_&&currentTools().selectionKind==4&&wand_.hasSource()&&!wand_.matches(currentDocument().identity(),currentDocument().contentRevision(),currentDocument().layer().id,currentDocument().frame().id)){
  if(wand_.document()==currentDocument().identity())endSelectionGesture(true);
  else{selectionDragging_=false;wand_.cancel();if(hasCapture())releaseMouse();}
  return;
 }
 auto update=wand_.poll(selectionDragging_&&currentTools().selectionKind==4,[&](SelectionPoint p)->workspace::WandPreviewController::Work{
  const auto source=wand_.source();const auto options=currentTools().wandOptions;const int w=currentDocument().width(),h=currentDocument().height();
  std::optional<FreeTileSelectionRaster> freeSource;
  if(currentDocument().layer().kind=="free-tile"&&currentDocument().activeMaskId().empty())freeSource=freeTileSelectionRaster(currentDocument());
  const bool freeSelection=currentDocument().layer().kind=="free-tile"&&currentDocument().activeMaskId().empty();const auto axes=currentDocument().symmetryAxes;const auto center=currentDocument().symmetryCenter();
  return [source,options,w,h,p,freeSelection,axes,center,freeSource=std::move(freeSource)]{return freeSelection?symmetrySelection(freeSource?freeSource->select({p.x,p.y},options,w,h):std::optional<SelectionMask>{},w,h,axes,center):magicWandSelection(*source,w,h,p.x,p.y,options);};
 });
 if(update.kind==workspace::WandPreviewController::Update::Failed){endSelectionGesture(true);status_=U"魔棒失败："+unicodeText(update.error);refresh();return;}
 if(update.kind==workspace::WandPreviewController::Update::Preview||update.kind==workspace::WandPreviewController::Update::Commit){selectionPreview_=std::move(update.selection);invalidateRect(canvasViewport());if(update.kind==workspace::WandPreviewController::Update::Commit)endSelectionGesture(false);}
}

void Editor::requestWand(Point p){if(wand_.request({p.x,p.y}))wandTick();}

bool Editor::gridSnapActive()const{return !currentView().isoViewEnabled&&currentDocument().showCustomGrid()&&runtimePreferences_.flag("tools.gridAlignmentEnabled");}

Point Editor::gridSnapPoint(Point p,int ax,int ay)const{if(!gridSnapActive())return p;const auto q=snapPointToGrid({double(p.x-ax),double(p.y-ay)},currentDocument().customGrid());if(!std::isfinite(q.x)||!std::isfinite(q.y)||std::abs(q.x)>1000000||std::abs(q.y)>1000000)return p;return {int(q.x)+ax,int(q.y)+ay};}

Point Editor::gridSnapBrush(Point p)const{int w=currentTools().brushProfiles[currentTools().eraser?1:0].size,h=w;if(currentTools().pencilImageBrush){const double radians=std::fmod(currentTools().pencilImageBrushAngle,360)*3.14159265358979323846/180,c=std::abs(std::cos(radians)),v=std::abs(std::sin(radians));w=std::max(1,int(std::ceil(currentTools().pencilImageBrush->width*c+currentTools().pencilImageBrush->height*v-1e-9)));h=std::max(1,int(std::ceil(currentTools().pencilImageBrush->width*v+currentTools().pencilImageBrush->height*c-1e-9)));}return gridSnapPoint(p,w/2,h/2);}

void Editor::beginAlignmentMove(bool content){
 alignmentGuides_.clear();smartMoveEnabled_=runtimePreferences_.flag("tools.smartAlignmentEnabled");moveAlignmentThreshold_=runtimePreferences_.index("tools.alignmentThreshold.Number");
 std::vector<std::string> excluded;
 if(content){
  if(!currentDocument().timelineSelection().cels.empty()){for(const auto& id:currentDocument().timelineSelection().cels)if(const auto* cel=currentDocument().timeline().findCelById(id))excluded.push_back(cel->layerId);}
  else excluded=currentDocument().selectedLayerIdsWithGroups();
  if(excluded.empty()&&currentView().frameSelection){for(const auto& layer:currentDocument().timeline().state().layers)if(timeline::isLayerEffectivelyVisible(currentDocument().timeline().state(),layer)&&!timeline::isLayerEffectivelyLocked(currentDocument().timeline().state(),layer))excluded.push_back(layer.id);}
  if(excluded.empty())excluded.push_back(currentDocument().layer().id);
 }
 moveAlignmentTargets_=smartMoveEnabled_?alignmentLayerTargets(currentDocument().timeline(),currentDocument().frame().id,excluded,&alignmentBoundsCache_):std::vector<GridRect>{};
}
Point Editor::gridSnapMove(Point p,GridRect b){
 alignmentGuides_.clear();
 if(gridMoveEnabled_&&currentDocument().showCustomGrid()){
  const auto q=snapSelectionTranslationToGrid(b,{double(p.x),double(p.y)},currentDocument().customGrid());
  if(std::isfinite(q.x)&&std::isfinite(q.y)&&std::abs(q.x)<=1000000&&std::abs(q.y)<=1000000)p={int(q.x),int(q.y)};
 }else{
  const auto r=resolveAlignment({b},moveAlignmentTargets_,{double(p.x),double(p.y)},currentDocument().width(),currentDocument().height(),currentDocument().customGrid(),false,smartMoveEnabled_,alignmentThresholdForZoom(moveAlignmentThreshold_,currentView().zoom),selectionAxis_==1?'x':selectionAxis_==2?'y':0);
  if(std::isfinite(r.offset.x)&&std::isfinite(r.offset.y)&&std::abs(r.offset.x)<=1000000&&std::abs(r.offset.y)<=1000000){p={int(r.offset.x),int(r.offset.y)};alignmentGuides_=r.guides;}
 }
 if(selectionAxis_==1)p.y=0;else if(selectionAxis_==2)p.x=0;return p;
}

std::optional<SelectionMask> Editor::quickSelectionCellAt(Point p)const{return gridCellBoundsAt(p.x,p.y,currentDocument().showCustomGrid()?currentDocument().customGrid():GridSettings{0,0,double(checkerboard_.size),double(checkerboard_.size)},currentDocument().width(),currentDocument().height());}

void Editor::updateSelectionCreation(Point p,bool constrain,bool center,bool rotate){

    if(currentTools().selectionKind==4){requestWand(p);return;}

    if(currentTools().selectionKind==5){selectionBrushStroke_.collect(currentDocument().width(),currentDocument().height(),selectionBrushLast_,{p.x,p.y},currentTools().brushProfiles[0],currentTools().selectionBrushAngle,tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off);selectionBrushLast_={p.x,p.y};return;}

    const auto repeatMode=tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off;
    auto marquee=[&](SelectionTransform target)->std::optional<SelectionMask>{
     if(repeatMode==repeat::Mode::Off)return rotatedMarqueeSelection(target,currentDocument().width(),currentDocument().height(),currentTools().selectionKind==1,currentTools().selectionRounded?currentTools().selectionCornerRadius:0);
     const auto bounds=transformBounds(target);if(bounds.width<1||bounds.height<1)return {};if(std::uint64_t(bounds.width)*bounds.height>64ull*1024*1024)throw std::length_error("Repeated selection exceeds pixel budget");
     target.x-=bounds.x;target.y-=bounds.y;auto mask=rotatedMarqueeSelection(target,bounds.width,bounds.height,currentTools().selectionKind==1,currentTools().selectionRounded?currentTools().selectionCornerRadius:0);if(mask){mask->x+=bounds.x;mask->y+=bounds.y;}return repeat::wrapSelection(mask,currentDocument().width(),currentDocument().height(),repeatMode);
    };
    std::optional<SelectionMask> incoming;

    if(marqueeDrawingAnchor_){anchoredMarqueeGeometry_.update(anchoredMarqueeSpec_,{double(p.x),double(p.y)},constrain,true,rotate);auto target=anchoredMarqueeSpec_.bounds;if(gridSnapActive()&&target.angle==0){const auto snapped=snapSelectionBoundsToGrid({target.x,target.y,target.width,target.height},currentDocument().customGrid());target.x=snapped.x;target.y=snapped.y;target.width=snapped.width;target.height=snapped.height;}target=centerDrawingBounds(target,*marqueeDrawingAnchor_);anchoredMarqueeSpec_.bounds=target;marqueeTarget_=target;selectionPreview_=marquee(target);selectionLast_=p;return;}
    if(marqueeSpaceTarget_){auto target=*marqueeSpaceTarget_;target.x+=p.x-marqueeSpacePointer_.x;target.y+=p.y-marqueeSpacePointer_.y;marqueeTarget_=target;selectionPreview_=marquee(target);selectionLast_=p;return;}

    if(quickSelection_){const auto current=quickSelectionCellAt(p);if(!current)return;selectionPreview_=quickSelectCellDragBounds(quickSelectionCell_,*current);selectionLast_=p;return;}

    if(currentTools().selectionKind==2 || currentTools().selectionKind==3){SelectionPoint point{p.x,p.y};if(currentTools().selectionKind==2 && (selectionPath_.empty() || selectionPath_.back().x!=p.x || selectionPath_.back().y!=p.y)){selectionPath_.push_back(point);selectionPathRedo_.clear();}auto path=selectionPath_;if(currentTools().selectionKind==3 && (path.empty() || path.back().x!=p.x || path.back().y!=p.y))path.push_back(point);incoming=currentTools().selectionKind==2?repeatedLassoSelection(path,currentDocument().width(),currentDocument().height(),repeatMode):lassoSelection(path,currentDocument().width(),currentDocument().height(),true,runtimePreferences_.flag("tools.balancedShiftLineEnabled"));}

    else {const TransformPoint pointer{double(p.x),double(p.y)};if(rotate && marqueeTarget_){if(!marqueeRotationStart_){marqueeRotationStart_=marqueeTarget_;marqueePointerStart_=pointer;}auto target=*marqueeRotationStart_;const double cx=target.x+target.width/2,cy=target.y+target.height/2;target.angle+=(std::atan2(pointer.y-cy,pointer.x-cx)-std::atan2(marqueePointerStart_.y-cy,marqueePointerStart_.x-cx))*180/3.141592653589793;marqueeTarget_=target;marqueePointerLast_=pointer;}

      else {if(marqueeRotationStart_){marqueeResizeStart_=marqueeTarget_;marqueePointerStart_=marqueePointerLast_;marqueeRotationStart_.reset();}if(marqueeResizeStart_ && center && !marqueeCtrlRestore_){marqueeCtrlRestore_=marqueeTarget_;auto target=*marqueeTarget_;target.x=selectionStart_.x-std::floor(target.width/2);target.y=selectionStart_.y-std::floor(target.height/2);marqueeResizeStart_=target;marqueePointerStart_=pointer;}else if(marqueeCtrlRestore_ && !center){marqueeResizeStart_=marqueeCtrlRestore_;marqueeCtrlRestore_.reset();marqueePointerStart_=pointer;}if(marqueeResizeStart_)marqueeTarget_=resizeRotatedMarquee(*marqueeResizeStart_,{pointer.x-marqueePointerStart_.x,pointer.y-marqueePointerStart_.y},marqueeDirectionX_,marqueeDirectionY_,constrain);else{ShapeSpec creation;creation.start={double(selectionStart_.x),double(selectionStart_.y)};ShapeDragGeometry geometry;geometry.viewAngle=marqueeViewAngle_;geometry.update(creation,pointer,constrain,center,false);marqueeDirectionX_=geometry.directionX;marqueeDirectionY_=geometry.directionY;marqueeTarget_=creation.bounds;}}

      if(gridSnapActive()&&marqueeTarget_->angle==0){const auto b=snapSelectionBoundsToGrid({marqueeTarget_->x,marqueeTarget_->y,marqueeTarget_->width,marqueeTarget_->height},currentDocument().customGrid());if(std::isfinite(b.x)&&std::isfinite(b.y)&&std::isfinite(b.width)&&std::isfinite(b.height)&&std::abs(b.x)<1000000&&std::abs(b.y)<1000000&&b.width<1000000&&b.height<1000000){marqueeTarget_->x=b.x;marqueeTarget_->y=b.y;marqueeTarget_->width=b.width;marqueeTarget_->height=b.height;}}

      const auto target=*marqueeTarget_;incoming=repeatMode!=repeat::Mode::Off?marquee(target):target.angle==0 && !(currentTools().selectionKind==0 && currentTools().selectionRounded)?(currentTools().selectionKind==1?ellipseSelection(int(target.x),int(target.y),int(target.width),int(target.height),currentDocument().width(),currentDocument().height()):rectangleSelection(int(target.x),int(target.y),int(target.width),int(target.height),currentDocument().width(),currentDocument().height())):rotatedMarqueeSelection(target,currentDocument().width(),currentDocument().height(),currentTools().selectionKind==1,currentTools().selectionRounded?currentTools().selectionCornerRadius:0);}

    selectionPreview_=incoming;

    selectionLast_=p;

    if(currentTools().selectionKind<=1){const auto dimensions=std::to_string(int(marqueeTarget_?marqueeTarget_->width:std::abs(p.x-selectionStart_.x)+1))+" x "+std::to_string(int(marqueeTarget_?marqueeTarget_->height:std::abs(p.y-selectionStart_.y)+1));status_=unicodeText(dimensions);invalidateRect(gfx::Rect(bounds().x,bounds().y2()-Layout::statusHeight*uiScale,bounds().w,Layout::statusHeight*uiScale));}

  }

void Editor::polygonStep(bool redo){auto& source=redo?selectionPathRedo_:selectionPath_;auto& target=redo?selectionPath_:selectionPathRedo_;if(source.empty())return;target.push_back(source.back());source.pop_back();auto incoming=lassoSelection(selectionPath_,currentDocument().width(),currentDocument().height(),true,runtimePreferences_.flag("tools.balancedShiftLineEnabled"));selectionPreview_=incoming;invalidateRect(canvasViewport());}

void Editor::polygonShapePreview(){
 auto& path=shapeSpec_.polygonPath;shapeSpec_.polygonFilled=false;shapeSpec_.polygonBalanced=currentTools().shapeKind==ShapeKind::Polygon&&runtimePreferences_.flag("tools.balancedShiftLineEnabled");
 bool prefix=polygonShapeCacheBalanced_==shapeSpec_.polygonBalanced&&polygonShapeCachePath_.size()<=path.size();
 if(prefix)for(std::size_t i=0;i<polygonShapeCachePath_.size();++i)if(polygonShapeCachePath_[i].x!=path[i].x||polygonShapeCachePath_[i].y!=path[i].y){prefix=false;break;}
 if(!prefix){polygonShapeCachePath_.clear();polygonShapeCache_.clear();}
 for(std::size_t i=std::max<std::size_t>(1,polygonShapeCachePath_.size());i<path.size();++i){auto edge=selectionLine(path[i-1],path[i],shapeSpec_.polygonBalanced);polygonShapeCache_.insert(polygonShapeCache_.end(),edge.begin(),edge.end());}
 polygonShapeCachePath_=path;polygonShapeCacheBalanced_=shapeSpec_.polygonBalanced;shapeSpec_.polygonContour=polygonShapeCache_;
 if(!path.empty()){const SelectionPoint pointer{int(shapePointer_.x),int(shapePointer_.y)};auto append=[&](SelectionPoint a,SelectionPoint b){auto edge=selectionLine(a,b,shapeSpec_.polygonBalanced);shapeSpec_.polygonContour.insert(shapeSpec_.polygonContour.end(),edge.begin(),edge.end());};append(path.back(),pointer);if(path.size()>1&&currentTools().shapeKind==ShapeKind::Polygon)append(pointer,path.front());}
 shapeRequest_=true;shapeTick();
}
void Editor::polygonShapeStep(bool redo){auto& path=shapeSpec_.polygonPath;if(redo){if(polygonShapeRedo_.empty())return;path.push_back(polygonShapeRedo_.back());polygonShapeRedo_.pop_back();}else{if(path.empty())return;polygonShapeRedo_.push_back(path.back());path.pop_back();}polygonShapePreview();refresh();}
void Editor::finishPolygonShape(){
 if(!shapeDragging_||(currentTools().shapeKind!=ShapeKind::Polygon&&currentTools().shapeKind!=ShapeKind::Freeform))return;
 try{shapeSpec_.polygonFilled=true;shapeSpec_.polygonBalanced=currentTools().shapeKind==ShapeKind::Polygon&&runtimePreferences_.flag("tools.balancedShiftLineEnabled");shapeRequest_=true;shapeTick();if(currentDocument().shapeActive()){Document::HistoryLabelScope label(currentDocument(),currentTools().shapeKind==ShapeKind::Freeform?U"绘制自由形状":U"绘制多边形");currentDocument().commitShapePreview();}}
 catch(const std::exception& e){currentDocument().cancelShapePreview();status_=U"多边形失败："+unicodeText(e.what());}
 shapeDragging_=shapeRequest_=false;shapeSpec_.polygonPath.clear();shapeSpec_.polygonContour.clear();polygonShapeRedo_.clear();polygonShapeCachePath_.clear();polygonShapeCache_.clear();if(hasCapture())releaseMouse();refresh();
}
void Editor::curveTick(){
 if(!shapeDragging_||currentTools().shapeKind!=ShapeKind::Curve)return;
 if(shapeIdentity_!=currentDocument().identity()||!currentDocument().shapeActive()){cancelStroke();return;}
 const auto controls=curveEndpoint_?curveDefaultControls(shapeSpec_.start,shapeSpec_.end,currentTools().curveAnchorCount):curveControls_;
 const auto points=bezierCurvePixelPoints(shapeSpec_.start,controls,shapeSpec_.end,currentTools().brushProfiles[0].perfectPixels);auto brush=currentTools().brushProfiles[0];brush.ink=currentInkMode();
 currentDocument().updateGeometricBrushPreview(points,shapeColor_,brush,currentTools().pencilImageBrush?&*currentTools().pencilImageBrush:nullptr,currentTools().pencilImageBrushAngle);invalidateRect(canvasViewport());
}
void Editor::finishCurveShape(){
 if(!shapeDragging_||currentTools().shapeKind!=ShapeKind::Curve||curveEndpoint_)return;
 try{const auto points=bezierCurvePixelPoints(shapeSpec_.start,curveControls_,shapeSpec_.end,currentTools().brushProfiles[0].perfectPixels);auto brush=currentTools().brushProfiles[0];brush.ink=currentInkMode();Document::HistoryLabelScope label(currentDocument(),U"绘制曲线");
 if(currentDocument().layer().kind=="free-tile"&&currentDocument().activeMaskId().empty()){
  // Keep the source target captured on initial press and commit the same
  // source-local brush path used by preview (legacy commitBrushPath).
  if(currentDocument().updateGeometricBrushPreview(points,shapeColor_,brush,currentTools().pencilImageBrush?&*currentTools().pencilImageBrush:nullptr,currentTools().pencilImageBrushAngle))currentDocument().commitShapePreview();else currentDocument().cancelShapePreview();
 }else{currentDocument().cancelShapePreview();currentDocument().paintGeometricBrushPath(points,shapeColor_,brush,currentTools().pencilImageBrush?&*currentTools().pencilImageBrush:nullptr,currentTools().pencilImageBrushAngle);}shapeDragging_=shapeRequest_=false;}
 catch(const std::exception& e){currentDocument().cancelStroke();status_=U"曲线失败："+unicodeText(e.what());}
 shapeDragging_=shapeRequest_=false;curveControls_.clear();if(hasCapture())releaseMouse();refresh();
}
void Editor::shapeTick(){if(shapeDragging_&&shapeDrawingAnchor_)shapeSpec_.bounds=centerDrawingBounds(shapeSpec_.bounds,*shapeDrawingAnchor_);if(shapeDragging_&&currentTools().shapeKind==ShapeKind::Curve){try{shapeRequest_=false;curveTick();}catch(const std::exception& e){currentDocument().cancelShapePreview();shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();status_=U"曲线失败："+unicodeText(e.what());refresh();}return;}if(!shapeDragging_)return;if(currentDocument().identity()!=shapeIdentity_ || !currentDocument().shapeActive()){shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();refresh();return;}if(shapeRequest_){shapeRequest_=false;shapeSpec_.brush=currentTools().brushProfiles[0];shapeSpec_.brush.ink=(currentTools().shapeKind==ShapeKind::Polygon||currentTools().shapeKind==ShapeKind::Freeform)?InkMode::Simple:currentInkMode();shapeSpec_.strokeWidth=currentTools().brushProfiles[0].size;shapeSpec_.cornerRadius=currentTools().shapeRounded?currentTools().shapeRadius:0;try{if(currentTools().shapeKind==ShapeKind::Line&&currentDocument().layer().kind=="free-tile"&&currentDocument().activeMaskId().empty()){
 auto points=selectionLine({int(shapeSpec_.start.x),int(shapeSpec_.start.y)},{int(shapeSpec_.end.x),int(shapeSpec_.end.y)},runtimePreferences_.flag("tools.balancedShiftLineEnabled")||isoLineAlignmentActive());
 if(shapeSpec_.brush.perfectPixels){std::vector<BrushPathPoint> perfect;for(const auto& point:points)appendPerfectPixelSegment(perfect,{point.x,point.y});points.clear();for(const auto& point:perfect)points.push_back({point.x,point.y});}
 currentDocument().updateGeometricBrushPreview(points,shapeColor_,shapeSpec_.brush,currentTools().pencilImageBrush?&*currentTools().pencilImageBrush:nullptr,currentTools().pencilImageBrushAngle);
}else {shapeSpec_.kind=currentTools().shapeKind;currentDocument().updateShapePreview(shapeSpec_,shapeColor_);}invalidateRect(canvasViewport());}catch(const std::exception& e){currentDocument().cancelShapePreview();shapeDragging_=shapeRequest_=false;if(hasCapture())releaseMouse();status_=U"形状失败："+unicodeText(e.what());refresh();}}}

void Editor::useShapeTool(ShapeKind kind){if(currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="tilemap"&&currentDocument().tilemapMode()==tiles::Mode::Paint){status_=U"瓦片绘制模式不支持此工具，请切换像素模式";refresh();return;}if(gradientPending_ || gradientDragging_ || selectionDragging_ || floatingDragging_ || shapeDragging_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().shapeKind=kind;currentTools().shapeTool=true;currentTools().eyedropperTool=false;currentTools().zoomTool=false;currentTools().selectionTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;currentPlayback().playing=false;toolRowScroll_=0;refresh();}

void Editor::gradientColors(){gradientSpec_.first=gradientRight_?currentDocument().palette().secondary:ink_;gradientSpec_.last=gradientRight_?ink_:currentDocument().palette().secondary;gradientSpec_.stops=currentTools().gradientFreeform?currentTools().gradientStops:std::vector<GradientStop>{};if(gradientRight_)for(auto& stop:gradientSpec_.stops)stop.position=1-stop.position;}

bool Editor::resolveGradientForIo(){
 if(gradientIoDialogOpen_)return false;
 if(!currentDocument().gradientActive())return true;
 if(!gradientPending_||gradientDragging_)return false;
 if(currentPlayback().playing||!currentDocument().gradientContextValid()){cancelGradientGesture();status_=U"绘制目标或选区已变化，未应用的渐变已取消。";return false;}
 gradientTick();if(!currentDocument().gradientActive())return false;
 const auto identity=currentDocument().identity(),preview=currentDocument().gradientRevision();const auto mask=currentDocument().activeMaskId();
 PendingGradientDialog popup(font_,skin_,toolIcons_);popup.setDisplay(display(),false);const auto size=popup.initialSize();const auto center=bounds().center();popup.setBounds({center.x-size.w/2,center.y-size.h/2,size.w,size.h});
 struct OpenScope{bool& value;OpenScope(bool& v):value(v){value=true;}~OpenScope(){value=false;}} open(gradientIoDialogOpen_);ui::Timer check(40,&popup);
 if(smoke_&&gradientIoDialogForSmoke_){check.Tick.connect([&]{check.stop();gradientIoDialogForSmoke_(popup);});check.start();}
 popup.openWindowInForeground();
 requestFocus();
 // A stale choice may never authorize a replacement preview or another project.
 if(currentDocument().identity()!=identity||!currentDocument().gradientActive()||currentDocument().gradientRevision()!=preview){refresh();return false;}
 if(currentPlayback().playing||!currentDocument().gradientContextValid()||currentDocument().activeMaskId()!=mask){cancelGradientGesture();status_=U"绘制目标或选区已变化，未应用的渐变已取消。";return false;}
 if(popup.result()==1){cancelGradientGesture();return !currentDocument().gradientActive();}
 if(popup.result()!=2){refresh();return false;}
 try{return applyGradientGesture();}
 catch(const std::exception& error){status_=U"渐变应用失败："+unicodeText(error.what());refresh();return false;}
}

void Editor::gradientTick(){if(!currentDocument().gradientActive()){gradientDragging_=gradientPending_=gradientRequest_=false;return;}if(currentDocument().identity()!=gradientIdentity_ || currentDocument().contentRevision()!=gradientContent_ || currentDocument().layer().id!=gradientLayer_ || currentDocument().frame().id!=gradientFrame_){cancelGradientGesture();return;}if(gradientPending_ && (gradientSpec_.first!=(gradientRight_?currentDocument().palette().secondary:currentDocument().palette().primary) || gradientSpec_.last!=(gradientRight_?currentDocument().palette().primary:currentDocument().palette().secondary))){ink_=currentDocument().palette().primary;gradientRequest_=true;}if(!gradientRequest_)return;gradientRequest_=false;gradientColors();gradientSpec_.radial=currentTools().gradientRadial;gradientSpec_.dither=currentTools().gradientDither;currentDocument().updateGradient(gradientSpec_,currentTools().gradientOptions);invalidateRect(canvasViewport());}

void Editor::gradientChanged(){saveBrushPreferences();gradientRequest_=currentDocument().gradientActive();gradientTick();layoutToolOptions();invalidate();}

void Editor::cancelGradientGesture(){gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;currentDocument().cancelGradient();if(hasCapture())releaseMouse();refresh();}

bool Editor::applyGradientGesture(){gradientRequest_=true;gradientTick();if(!currentDocument().gradientActive())return false;currentDocument().commitGradient();gradientDragging_=gradientPending_=gradientRequest_=false;gradientHandle_=-1;if(hasCapture())releaseMouse();refresh();return true;}

void Editor::useFillTool(){currentTools().magicEraserTool=false;if(currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="tilemap"&&currentDocument().tilemapMode()==tiles::Mode::Paint){status_=U"瓦片绘制模式不支持填充，请切换像素模式";refresh();return;}if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().shapeTool=false;currentTools().rememberGradientTool=false;currentTools().gradientTool=false;currentTools().fillTool=true;currentTools().selectionTool=false;currentTools().handTool=currentTools().eraser=false;currentTools().eyedropperTool=false;currentTools().zoomTool=false;refresh();}

void Editor::useGradientTool(){if(currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="tilemap"&&currentDocument().tilemapMode()==tiles::Mode::Paint){status_=U"瓦片绘制模式不支持此工具，请切换像素模式";refresh();return;}if(shapeDragging_ || selectionDragging_ || floatingDragging_ || gradientPending_)return;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().gradientOptions.visibleLayers=currentTools().fillOptions.visibleLayers;currentTools().gradientOptions.connectivity=currentTools().fillOptions.connectivity;currentTools().shapeTool=false;currentTools().rememberGradientTool=true;currentTools().gradientTool=true;currentTools().fillTool=currentTools().selectionTool=currentTools().handTool=currentTools().eraser=false;currentPlayback().playing=false;currentTools().eyedropperTool=false;currentTools().zoomTool=false;refresh();}

void Editor::sortGradientStops(GradientStop selected){std::stable_sort(currentTools().gradientStops.begin(),currentTools().gradientStops.end(),[](auto a,auto b){return a.position<b.position;});for(int i=0;i<int(currentTools().gradientStops.size());++i)if(currentTools().gradientStops[i].position==selected.position && currentTools().gradientStops[i].color==selected.color)gradientStop_=i;gradientChanged();}

void Editor::addGradientStop(){double gap=-1,position=.5;for(std::size_t i=1;i<currentTools().gradientStops.size();++i)if(currentTools().gradientStops[i].position-currentTools().gradientStops[i-1].position>gap){gap=currentTools().gradientStops[i].position-currentTools().gradientStops[i-1].position;position=(currentTools().gradientStops[i].position+currentTools().gradientStops[i-1].position)/2;}if(gap<.002)return;position=std::clamp(position,.001,.999);GradientSpec s;s.stops=currentTools().gradientStops;GradientStop added{position,GradientSampler(s).forAmount(position,0,0)};currentTools().gradientStops.push_back(added);sortGradientStops(added);}

std::optional<SelectionTransform> Editor::selectionTransformTarget() const {if(auto floating=currentDocument().floatingTransform())return floating;if(!currentDocument().selection())return {};const auto& mask=*currentDocument().selection();return SelectionTransform{double(mask.x),double(mask.y),double(mask.width),double(mask.height)};}

TransformPoint Editor::selectionPivotPreset(const SelectionTransform& target,int index) const {auto coordinate=[](double size,int position){const double last=std::max(.5,size-.5);return (position==0?.5:position==2?last:std::min(last,std::floor(size/2)+.5))/std::max(1.0,size);};return transformPoint(target,coordinate(target.width,index%3),coordinate(target.height,index/3));}

TransformPoint Editor::selectionPivotPoint() const {auto target=selectionTransformTarget();return currentView().pivot.value_or(target?selectionPivotPreset(*target,4):TransformPoint{});}

bool Editor::selectionPivotHit(gfx::Point point) const {if(drawingAnchorActive())return false;if(!currentDocument().selection() || !currentView().selectionPivotVisible || currentView().freeTransform || selectionDragging_)return false;const auto p=selectionPivotPoint();const auto screen=canvasDocumentToDisplay(p);return std::abs(point.x-screen.x)<=10 && std::abs(point.y-screen.y)<=10;}

Point Editor::constrainedSelectionDelta(Point delta,bool shift){if(!shift){selectionAxis_=0;return delta;}const int x=std::abs(delta.x),y=std::abs(delta.y);if(!selectionAxis_ && (x || y))selectionAxis_=x>=y?1:2;if(selectionAxis_==1 && y>x*1.2)selectionAxis_=2;if(selectionAxis_==2 && x>y*1.2)selectionAxis_=1;return selectionAxis_==1?Point{delta.x,0}:Point{0,delta.y};}

void Editor::centerContent(bool horizontal,bool vertical){const auto before=currentDocument().selection();const auto pivotBefore=currentView().pivot;if(currentDocument().centerActiveContent(horizontal,vertical)){currentView().pivot=pivotBefore;const auto after=currentDocument().selection();if(currentView().pivot && before && after){currentView().pivot->x+=after->x-before->x;currentView().pivot->y+=after->y-before->y;}currentView().pivotMask=after;currentPlayback().playing=false;}refresh();}

void Editor::trimCanvas(bool allFrames){try{if(currentDocument().trimCanvas(allFrames,currentView().pivot)){currentPlayback().playing=false;currentView().freeTransform=false;fitCanvas();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::cropCanvas(){try{if(currentDocument().cropCanvas(currentView().pivot)){currentPlayback().playing=false;currentView().freeTransform=false;fitCanvas();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::shrinkSelectionToContent(){currentDocument().commitFloatingPaste();const auto before=currentDocument().selection();if(!before)return;auto next=currentDocument().selectionContentBounds(*before);if(!next){status_=U"选区中没有内容";refresh();return;}if(selectionEqual(before,next))return;currentDocument().commitSelection(before,next);currentView().pivot.reset();selectionPropertiesActive_=true;refresh();}

void Editor::showSelectionPivotPopup(bool drawing){if(!drawing&&!currentDocument().selection())return;auto targetForPopup=[&]()->std::optional<SelectionTransform>{return drawing?std::optional<SelectionTransform>{SelectionTransform{0,0,double(currentDocument().width()),double(currentDocument().height())}}:selectionTransformTarget();};auto currentPoint=[&]{return drawing?drawingAnchorPoint():selectionPivotPoint();};auto assignPoint=[&](TransformPoint point){if(drawing)setDrawingAnchor(point);else currentView().pivot=point;};auto& pivotVisible=drawing?currentView().drawingAnchorVisible:currentView().selectionPivotVisible;ui::PopupWindow popup("",ui::PopupWindow::ClickBehavior::CloseOnClickInOtherWindow);popup.setAutoRemap(false);popup.setWantFocus(true);const auto trigger=(drawing?static_cast<ui::Widget*>(drawingAnchorPresetButton_):selectionControls_[15].first)->bounds();const auto popupBounds=gfx::Rect(std::clamp(trigger.x,bounds().x,std::max(bounds().x,bounds().x2()-90*uiScale)),trigger.y2()+2*uiScale,90*uiScale,83*uiScale);popup.setBounds(popupBounds);class PivotPanel final:public ui::Widget{const Skin& skin;public:PivotPanel(const Skin& value):ui::Widget(ui::kGenericWidget),skin(value){}void onPaint(ui::PaintEvent& ev)override{auto& g=*ev.graphics();UiPaintScale scale(g);const auto rect=uiLogical(clientBounds());g.fillRect(skin["panel"],rect);skin.draw(g,"panel_outer",rect);}};auto content=new PivotPanel(skin_);popup.addChild(content);content->setBounds(popupBounds);auto visible=new PixelButton(font_,skin_,drawing?U"显示绘图锚点":U"显示轴心",[&,this]{pivotVisible=!pivotVisible;if(drawing)saveBrushPreferences();else saveSelectionPreferences();invalidateRect(canvasViewport());});visible->active=pivotVisible;visible->icon=pivotVisible?"check":"checkboxUnchecked";visible->iconSkin=&toolIcons_;visible->bareIconWithCaption=true;content->addChild(visible);visible->setBounds(gfx::Rect(popupBounds.x+6*uiScale,popupBounds.y+6*uiScale,78*uiScale,textControlHeight*uiScale));std::array<PixelButton*,9> presets{};for(int i=0;i<9;++i){auto button=new PixelButton(font_,skin_,U"",[&,this,i]{if(auto target=targetForPopup())assignPoint(selectionPivotPreset(*target,i));invalidateRect(canvasViewport());});const char* anchorIcons[]={"nw","n","ne","w","center","e","sw","s","se"};button->icon=drawing?std::string("anchor-preset-")+anchorIcons[i]:"selection-pivot-preset-"+std::to_string(i);button->iconSkin=&toolIcons_;content->addChild(button);button->setBounds(gfx::Rect(popupBounds.x+(6+(i%3)*17)*uiScale,popupBounds.y+(28+(i/3)*17)*uiScale,15*uiScale,15*uiScale));if(auto target=targetForPopup()){const auto point=selectionPivotPreset(*target,i),current=currentPoint();button->active=std::abs(point.x-current.x)<1e-6 && std::abs(point.y-current.y)<1e-6;}presets[i]=button;button->Click.connect([&,i]{for(int j=0;j<9;++j){presets[j]->active=i==j;presets[j]->invalidate();}});}visible->Click.connect([&,this,visible]{visible->active=pivotVisible;visible->icon=pivotVisible?"check":"checkboxUnchecked";visible->invalidate();});popup.Resize.connect([&,content,visible](ui::ResizeEvent&){const auto area=content->bounds();visible->setBounds(gfx::Rect(area.x+6*uiScale,area.y+6*uiScale,78*uiScale,textControlHeight*uiScale));for(int i=0;i<9;++i)presets[i]->setBounds(gfx::Rect(area.x+(6+(i%3)*17)*uiScale,area.y+(28+(i/3)*17)*uiScale,15*uiScale,15*uiScale));});std::unique_ptr<ui::Timer> verify;if(smoke_){verify=std::make_unique<ui::Timer>(160,&popup);verify->Tick.connect([&]{if(presets[0]->bounds().x!=visible->bounds().x || presets[3]->bounds().x!=visible->bounds().x || presets[6]->bounds().x!=visible->bounds().x)throw std::runtime_error("Pivot popup left alignment");presets[0]->Click();if(auto target=targetForPopup()){const auto expected=selectionPivotPreset(*target,0);if(currentPoint().x!=expected.x || currentPoint().y!=expected.y)status_=U"轴心预设测试失败";}writeSmokeFrame(popup.display()->nativeSurface().get(),assets_.parent_path()/"selection-pivot-smoke.bmp");verify->stop();popup.closeWindow(nullptr);});verify->start();}popup.openWindowInForeground();requestFocus();}

void Editor::startFreeSelectionTransform(){if(!currentDocument().selection() || selectionDragging_ || floatingDragging_)return;
 if(currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile"){
  if(currentView().frameSelection||!freeTileSelectionTargetBounds(currentDocument())||currentDocument().hasSelectedGroups())return;
  for(const auto& id:currentDocument().timelineSelection().layers)if(id!=currentDocument().layer().id)return;
  for(const auto& id:currentDocument().timelineSelection().cels){const auto* c=currentDocument().timeline().findCelById(id);if(!c||c->layerId!=currentDocument().layer().id||c->frameId!=currentDocument().frame().id)return;}
  currentDocument().commitFloatingPaste();useSelectionTool();if(!currentDocument().selection())return;
 }
 auto target=*selectionTransformTarget();if(!currentDocument().beginSelectionContentMove(false,currentView().frameSelection))return;target.quad=std::array<TransformPoint,4>{{transformPoint(target,0,0),transformPoint(target,1,0),transformPoint(target,1,1),transformPoint(target,0,1)}};currentDocument().transformFloatingPaste(target,false);currentView().freeTransform=true;currentTools().selectionTool=true;currentTools().eyedropperTool=false;currentTools().zoomTool=false;selectionPropertiesActive_=true;refresh();}

TransformPoint Editor::transformCanvasPoint(gfx::Point p) const {return canvasDocumentPoint(p);}

std::optional<SelectionTransform> Editor::selectionControlTarget() const {

    auto target=selectionTransformTarget();

    if(target && !target->quad && target->angle==0 && target->shearX==0 && target->shearY==0 && currentDocument().selection()){

      const auto& mask=*currentDocument().selection();target->x=mask.x;target->y=mask.y;target->width=mask.width;target->height=mask.height;

    }

    return target;

  }

std::string Editor::transformHit(gfx::Point p)const {auto target=selectionControlTarget();return target?selectionTransformHit(*target,transformCanvasPoint(p),1.0/canvasScale()):std::string{};}

bool Editor::celClipboardContext()const{return !paletteFocused_ && !currentDocument().timelineSelection().cels.empty();}

void Editor::cutTimelineCels(){try{currentDocument().clearMaskClipboard();currentPlayback().playing=false;if(!currentDocument().cutSelectedCels()){refresh();return;}freeTileInstanceClipboard_.reset();celClipboardSnapshot_=currentDocument().exportCelClipboard();pixelClipboard_.captureStructuredCopyBaseline();pixelClipboard_.clear();layerClipboardSnapshot_.reset();frameClipboardSnapshot_={};status_=U"单元格已剪切";}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

bool Editor::hasApplicationFrameClipboard()const{return !frameClipboardSnapshot_.items.empty();}

bool Editor::applicationCelSelectionOnly()const{return !celClipboardSnapshot_.items.empty() && bool(celClipboardSnapshot_.items.front().selectionPixels);}

bool Editor::hasApplicationCelClipboard()const{return !celClipboardSnapshot_.items.empty();}

std::optional<int> Editor::timelineGifDropIndex(gfx::Point at)const{

    if(!documentOpen_ || homeOpen_ || !columnShown(2) || pending_!=Pending::None)return {};

    const auto grid=timelineFrameViewport(true)|timelineFrameViewport();if(!grid.contains(at))return {};

    return std::clamp(currentView().frames+int(std::floor(double(at.x-grid.x+currentView().frameRemainder)/(timelineFrameWidth()*uiScale))),0,int(currentDocument().timeline().state().frames.size()));

  }

void Editor::clearTimelineGifDrop(){if(gifDropTargetIndex_){gifDropTargetIndex_.reset();invalidateTimelineGrid();}}

bool Editor::handleTimelineGifDrag(os::DragEvent& event,bool drop){

    const auto index=timelineGifDropIndex(event.position());auto data=event.dataProvider();if(!index || !data || !data->contains(os::DragDataItemType::Paths)){clearTimelineGifDrop();return false;}

    // Legacy document-drop-service normalizes/deduplicates before claimPaths;
    // useAppDocumentIO claims the timeline only for a single GIF.
    const auto paths=data->getPaths();if(paths.empty() || !std::all_of(paths.begin(),paths.end(),[](const auto& path){auto ext=std::filesystem::u8path(path).extension().wstring();std::transform(ext.begin(),ext.end(),ext.begin(),[](wchar_t c){return std::towlower(c);});return ext==L".gif";}) || (drop&&paths.size()!=1)){clearTimelineGifDrop();return false;}

    if(!event.sourceSupports(os::DropOperation::Copy)){clearTimelineGifDrop();event.dropResult(os::DropOperation::None);return true;}

    event.dropResult(os::DropOperation::Copy);if(!drop){if(gifDropTargetIndex_!=index){gifDropTargetIndex_=index;invalidateTimelineGrid();}return true;}

    clearTimelineGifDrop();try{for(const auto& path:paths){auto source=openGifAnimation(std::filesystem::u8path(path));if(currentDocument().importGifAnimationLayer(source,*index,&currentView().maskSlots,&currentView().maskAnchor)){currentView().maskSlots.clear();currentView().maskAnchor.reset();clearTimelineRowSelection();currentPlayback().playing=false;currentView().frameSelection=false;timelineSelectionIdentity_=currentDocument().identity();currentView().guides=true;paletteFocused_=false;status_=U"GIF 已导入时间轴";}}}catch(const std::exception& error){status_=unicodeText(error.what());}refresh();event.acceptDrop(true);return true;

  }

void Editor::copyTimelineFrames(){try{currentDocument().clearMaskClipboard();if(currentDocument().copySelectedFrames()){freeTileInstanceClipboard_.reset();frameClipboardSnapshot_=currentDocument().exportFrameClipboard();pixelClipboard_.captureStructuredCopyBaseline();pixelClipboard_.clear();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::cutTimelineFrames(){auto selectionHistory=currentDocument().trackAnimationSelectionHistory(true);try{currentDocument().clearMaskClipboard();currentPlayback().playing=false;if(currentDocument().copySelectedFrames()){auto snapshot=currentDocument().exportFrameClipboard();frameClipboardSnapshot_=std::move(snapshot);freeTileInstanceClipboard_.reset();pixelClipboard_.captureStructuredCopyBaseline();pixelClipboard_.clear();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};currentDocument().cutSelectedFrames();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::pasteTimelineFrames(){try{if(currentDocument().pasteFrameClipboard(frameClipboardSnapshot_)){if(frameClipboardSnapshot_.sourceIdentity==currentDocument().identity()){currentView().maskSlots.clear();currentView().maskAnchor.reset();}clearTimelineRowSelection();currentView().guides=true;currentView().frameSelection=!currentDocument().selectedFrames().empty();}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::copyTimelineCels(){try{currentDocument().clearMaskClipboard();if(currentDocument().copySelectedCels()){freeTileInstanceClipboard_.reset();celClipboardSnapshot_=currentDocument().exportCelClipboard();pixelClipboard_.captureStructuredCopyBaseline();pixelClipboard_.clear();layerClipboardSnapshot_.reset();frameClipboardSnapshot_={};status_=U"单元格已复制";}else{celClipboardSnapshot_={};frameClipboardSnapshot_={};status_=U"没有选中的单元格";}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

void Editor::pasteTimelineCels(){auto selectionHistory=currentDocument().trackAnimationSelectionHistory(false);try{if(!celClipboardSnapshot_.items.empty())currentDocument().pasteCelClipboard(celClipboardSnapshot_);if(currentDocument().floating()){currentPlayback().playing=false;currentTools().selectionTool=true;currentTools().eyedropperTool=currentTools().handTool=false;}}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}

bool Editor::pixelClipboardContext() const {return !paletteFocused_ && (!currentView().frameSelection || !currentDocument().activeMaskId().empty());}
bool Editor::mixedPixelCopyContext(bool cut)const{return currentDocument().hasTilemapContent()&&pixelClipboardContext()&&currentDocument().selection()&&currentDocument().activeMaskId().empty()&&(cut?currentDocument().tilemapSelectionCutAvailable():(currentDocument().layer().kind.empty()||currentDocument().layer().kind=="tilemap"));}
bool Editor::mixedPixelPasteContext()const{return currentDocument().hasTilemapContent()&&pixelClipboardContext()&&currentDocument().activeMaskId().empty()&&currentDocument().layer().kind.empty()&&!currentDocument().hasSelectedGroups()&&!currentDocument().layerEffectivelyLocked(currentDocument().layer())&&!layerClipboardSnapshot_&&!currentView().frameSelection&&(!celClipboardContext()||!hasApplicationCelClipboard());}

void Editor::beginLayerTransform(){if(selectionDragging_ || floatingDragging_)return;if(currentDocument().activeMaskId().empty()&&!currentDocument().hasSelectedGroups()&&currentDocument().layer().kind=="text"){const auto layers=currentDocument().selectedLayerIdsWithGroups();const auto source=currentDocument().timeline().resolveSurface(currentDocument().cel().id);if((layers.empty()||(layers.size()==1&&layers.front()==currentDocument().layer().id))&&source.source&&source.source->text&&source.source->text->boxed)return;}if(!currentDocument().beginLayerTransform()){status_=U"所选图层隐藏、锁定或没有可变换内容";refresh();return;}currentView().pivot.reset();currentView().freeTransform=false;selectionPropertiesActive_=false;useSelectionTool(0);currentTools().selectionMode=0;}

void Editor::useSelectionTool(int kind){if(shapeDragging_ || gradientPending_ || gradientDragging_ || floatingDragging_ || (selectionDragging_ && currentTools().selectionKind==5))return;if(selectionDragging_ || floatingDragging_)endSelectionGesture(!polygonPending_);if(kind>=0)currentTools().selectionKind=kind;currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().textTool=false;currentTools().moveTool=false;currentTools().selectionTool=true;currentTools().shapeTool=false;currentTools().gradientTool=false;currentTools().fillTool=false;currentTools().handTool=false;currentTools().eraser=false;currentPlayback().playing=false;currentTools().eyedropperTool=false;currentTools().zoomTool=false;refresh();}

void Editor::selectAllPixels(){selectionCommandOverride_=true;currentDocument().commitFloatingPaste();useSelectionTool();currentDocument().selectAllPixels();selectionPropertiesActive_=false;currentView().pivot.reset();currentView().pivotMask=currentDocument().selection();currentView().freeTransform=false;refresh();}

void Editor::copyMergedPixels(){try{auto payload=currentDocument().copyMergedPixels();if(!payload){pixelClipboard_.clear();status_=U"没有可复制的合并像素";}else{freeTileInstanceClipboard_.reset();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};frameClipboardSnapshot_={};status_=pixelClipboard_.write(*payload)?U"合并像素已复制":U"已复制到内部剪贴板，系统剪贴板不可用";}}catch(const std::exception& e){status_=U"复制合并失败："+unicodeText(e.what());}refresh();}

void Editor::cutSelectionPixels(){const bool paintPixelBlocked=currentDocument().tilemapPaintSelectionDeleteBlocked();std::optional<SelectionClipboard> copied;currentDocument().cutPixels(copied);selectionPropertiesActive_=false;currentView().pivot.reset();currentView().freeTransform=false;if(paintPixelBlocked)status_=U"请在瓦片集中选择新增、绘制或修改模式；其他像素操作需先栅格化图层。";}

void Editor::copySelectionPixels(bool cut){if(paletteFocused_){if(!cut)copyPaletteColors();return;}if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}if(!currentDocument().selection()){status_=U"需要像素选区";refresh();return;}auto payload=currentDocument().copyPixels();if(!payload){freeTileInstanceClipboard_.reset();pixelClipboard_.clear();status_=U"选区没有可复制像素";if(cut)cutSelectionPixels();refresh();return;}freeTileInstanceClipboard_.reset();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};frameClipboardSnapshot_={};if(!pixelClipboard_.write(*payload))status_=U"已复制到内部剪贴板，系统剪贴板不可用";else status_=U"像素已复制";if(cut)cutSelectionPixels();refresh();}

void Editor::pasteSelectionPixels(){
 if(paletteFocused_){pastePaletteColors();return;}
 if(!pixelClipboardContext()){status_=U"当前色卡或时间轴剪贴板尚未接入";refresh();return;}
 try{
  currentDocument().commitFloatingPaste();auto payload=pixelClipboard_.read();
  if(!payload){if(freeTileInstanceClipboard_&&currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile"){currentDocument().pasteFreeTileInstances(*freeTileInstanceClipboard_);selectionPropertiesActive_=currentView().freeTransform=false;currentView().pivot.reset();refresh();return;}status_=U"剪贴板没有像素图像";refresh();return;}
  const auto viewport=canvasViewport();const double scale=canvasScale();
  const int left=int(std::floor((viewport.x-currentView().canvas.x)/scale)),top=int(std::floor((viewport.y-currentView().canvas.y)/scale)),right=int(std::ceil((viewport.x2()-currentView().canvas.x)/scale)),bottom=int(std::ceil((viewport.y2()-currentView().canvas.y)/scale));
  const auto position=PixelClipboard::resolvePlacement(*payload,currentDocument().width(),currentDocument().height(),left,top,right,bottom);
  if(currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile"){const bool pasted=currentDocument().pasteFreeTilePixels(*payload,position);status_=pasted?U"图像已粘贴到自由瓦片":U"自由瓦片目标不可用或没有可粘贴的变化";if(pasted)tilesetPanelOpen_=true;refresh();return;}
  if(currentDocument().beginFloatingPaste(*payload,position.x,position.y)){currentPlayback().playing=false;currentTools().liquifyTool=currentTools().smoothTool=currentTools().airbrushTool=currentTools().textTool=currentTools().moveTool=currentTools().shapeTool=currentTools().gradientTool=currentTools().fillTool=currentTools().eraser=false;liquifyResetPosition_.reset();currentTools().selectionTool=true;currentTools().eyedropperTool=false;currentTools().zoomTool=false;currentTools().handTool=false;status_=U"浮动粘贴：拖动移动，Enter 确认，Esc 取消";}
  else status_=U"目标图层锁定或剪贴板没有可粘贴像素";
  refresh();
 }catch(const std::exception& e){status_=U"粘贴失败："+unicodeText(e.what());refresh();}
}

int Editor::selectionHit(gfx::Point position) const {if(!currentView().freeTransform&&tabletAssist_.owner==currentDocument().identity()&&tabletAssist_.explicitMove&&currentDocument().selection()){const auto hit=selectionContentHit(currentDocument().selection(),canvasDocumentPoint(position).x,canvasDocumentPoint(position).y,8.0/canvasScale());if(hit)return tabletAssist_.boxMove?1:2;}if(currentView().freeTransform){auto target=selectionTransformTarget();if(target && target->quad){const auto uv=selectionQuadMap(*target->quad,transformCanvasPoint(position),true);return uv.x>=-1e-7 && uv.x<=1+1e-7 && uv.y>=-1e-7 && uv.y<=1+1e-7?2:0;}}return selectionContentHit(currentDocument().selection(),canvasDocumentPoint(position).x,canvasDocumentPoint(position).y,8.0/canvasScale());}

void Editor::endSelectionGesture(bool cancel){if(!selectionDragging_ && !floatingDragging_)return;alignmentGuides_.clear();moveAlignmentTargets_.clear();smartMoveEnabled_=false;if(cancel){wand_.cancel();if(floatingDragging_){if(currentDocument().paintCellMoving())currentDocument().finishPaintCellMove(true);else currentDocument().cancelFloatingPaste();currentView().pivot=selectionPivotBeforeGesture_;}else currentDocument().previewSelection(selectionBefore_);}else if(floatingDragging_&&currentDocument().paintCellMoving()){currentDocument().finishPaintCellMove();}else if(floatingDragging_&&currentDocument().freeTileSelectionPlacementMoving()){currentDocument().commitFloatingPaste();}else if(selectionDragging_){if(selectionBoxDragging_)currentDocument().commitSelectionBox(selectionBefore_);else{auto symmetric=[&](const std::optional<SelectionMask>& incoming){return symmetrySelection(incoming,currentDocument().width(),currentDocument().height(),currentDocument().symmetryAxes,currentDocument().symmetryCenter());};if(currentTools().selectionKind==5)currentDocument().previewSelection(combineSelection(selectionBefore_,symmetric(selectionBrushStroke_.mask(currentDocument().width())),gestureSelectionMode_));if(polygonPending_)currentDocument().previewSelection(combineSelection(selectionBefore_,symmetric(lassoSelection(selectionPath_,currentDocument().width(),currentDocument().height(),true,runtimePreferences_.flag("tools.balancedShiftLineEnabled"))),gestureSelectionMode_));const bool moved=selectionMoved_ || currentTools().selectionKind>=2 || quickSelection_;const auto after=moved?(currentTools().selectionKind==3 || currentTools().selectionKind==5?currentDocument().selection():combineSelection(selectionBefore_,quickSelection_||currentTools().selectionKind==4?selectionPreview_:symmetric(selectionPreview_),gestureSelectionMode_)):gestureSelectionMode_==0?std::optional<SelectionMask>{}:selectionBefore_;if(currentTools().temporaryBrushCapture){currentDocument().previewSelection(selectionBefore_);if(after)finishTemporaryBrushCapture(*after);}else currentDocument().commitSelection(selectionBefore_,after,true);currentView().frameSelection=false;}}selectionDragging_=floatingDragging_=selectionBoxDragging_=polygonPending_=false;selectionPath_.clear();selectionPathRedo_.clear();selectionBrushStroke_={};selectionPreview_.reset();marqueeTarget_.reset();marqueeRotationStart_.reset();marqueeResizeStart_.reset();marqueeCtrlRestore_.reset();marqueeSpaceTarget_.reset();marqueeDrawingAnchor_.reset();quickSelection_=false;selectionRight_=false;selectionAxis_=0;if(!selectionStatusBefore_.empty()){status_=selectionStatusBefore_;selectionStatusBefore_.clear();}transformHandle_.clear();if(hasCapture())releaseMouse();refresh();}

const std::unordered_map<std::size_t,Pixel>* Editor::brushLineBaseline(const BrushLineAnchor* anchor) const {
    if(currentDocument().layer().kind=="free-tile")return nullptr;

    if(!anchor || anchor->revision!=currentDocument().revision())return nullptr;

    if(!anchor->baselinePoints.empty()){anchor->baseline.reserve(anchor->baselinePoints.size());for(const auto& item:anchor->baselinePoints)anchor->baseline.emplace(item);anchor->baselinePoints.clear();}

    return &anchor->baseline;

  }

bool Editor::ordinaryBrushTool() const {return !currentTools().liquifyTool && !currentTools().smoothTool && !currentTools().airbrushTool && !currentTools().textTool && !currentTools().moveTool && !currentTools().selectionTool && !currentTools().shapeTool && !currentTools().gradientTool && !currentTools().fillTool && !currentTools().handTool && !currentTools().zoomTool && !currentTools().eyedropperTool;}

const Editor::BrushLineAnchor* Editor::brushLineAnchor() const {if(currentDocument().layer().kind=="free-tile"&&(currentDocument().freeTilePaintMode()||!currentDocument().activeMaskId().empty()||!currentDocument().layer().freeTiles||currentDocument().layer().freeTiles->sources.empty()))return nullptr;const auto& a=brushFeedback_.brushLineAnchors_[currentTools().eraser?1:0];return a && a->identity==currentDocument().identity() && a->layer==currentDocument().layer().id && a->frame==currentDocument().frame().id?&*a:nullptr;}

void Editor::flushBrushSizePreferences(){if(brushFeedback_.brushPreferencesPending_)saveBrushPreferences();}

bool Editor::modifierBrushSupported() const {
 if(currentTools().liquifyTool||currentTools().airbrushTool||currentTools().smoothTool)return true;

    return (!currentTools().pencilImageBrush || !currentTools().pencilImageBrush->intrinsicSize || (currentTools().selectionTool && currentTools().selectionKind==5)) && ((!currentTools().moveTool && !currentTools().shapeTool && !currentTools().selectionTool && !currentTools().fillTool && !currentTools().gradientTool && !currentTools().handTool && !currentTools().zoomTool && !currentTools().eyedropperTool) ||

      (currentTools().shapeTool && currentTools().shapeKind==ShapeKind::Line) || (currentTools().selectionTool && currentTools().selectionKind==5 && !selectionPropertiesActive_));

  }

void Editor::setModifierBrushSize(int value) {
 value=std::clamp(value,1,64);
 if(currentTools().airbrushTool){if(currentTools().airbrushSettings.scatterRadius==value)return;currentTools().airbrushSettings.scatterRadius=value;saveAirbrushPreferences();layoutToolOptions();invalidateRect(canvasViewport());return;}if(currentTools().smoothTool){if(currentTools().smoothBrush.size==value)return;currentTools().smoothBrush.size=value;saveSmoothPreferences();layoutToolOptions();invalidateRect(canvasViewport());return;}
 if(currentTools().liquifyTool){if(currentTools().liquifyOptions.radius==value)return;currentTools().liquifyOptions.radius=value;saveLiquifyPreferences();layoutToolOptions();invalidateRect(canvasViewport());return;}

    auto& brush=currentTools().brushProfiles[currentTools().eraser?1:0];value=std::clamp(value,1,64);

    if(brush.size==value)return;

    const auto oldDamage=brushPreviewDamage(paletteMousePosition_);const int previous=brush.size;

    brush.size=value;

    // Only the selection brush's angle field changes visibility at size 1.

    if(currentTools().selectionTool && currentTools().selectionKind==5 && brush.shape!=BrushShape::Round && (previous==1)!=(value==1))layoutToolOptions();

    else if(brushSizeInput_ && !brushSizeInput_->hasFocus()){

      updatingBrushFields_=true;brushSizeInput_->setText(std::to_string(value));updatingBrushFields_=false;

    }

    if(brushRange_ && !brushRangeOpacity_){brushRange_->value=value;brushRange_->invalidate();}

    for(const auto& damage:{oldDamage,brushPreviewDamage(paletteMousePosition_)})if(!damage.isEmpty())invalidateRect(damage);

    // Model/preview update immediately; repeated wheel ticks share one disk write.

    brushFeedback_.brushPreferencesPending_=true;brushFeedback_.brushPreferencesDue_=std::chrono::steady_clock::now()+std::chrono::milliseconds(250);

  }

void Editor::finishModifierBrushSize(){if(!brushFeedback_.modifierBrushSize_)return;const bool pressed=brushFeedback_.modifierBrushSize_->pressed;brushFeedback_.modifierBrushSize_.reset();if(pressed && hasCapture())releaseMouse();flushBrushSizePreferences();updateNavigationCursor();}

void Editor::invalidatePanMovement(gfx::Point delta) {if(currentView().rotation.active()){invalidateRect(canvasViewport());return;}

    const auto viewport=canvasViewport();

    gfx::Region drawable;getDrawableRegion(drawable,ui::Widget::kCutTopWindows);

    drawable&=gfx::Region(viewport);

    gfx::Region valid=drawable;valid-=getUpdateRegion();

    if(display())valid-=display()->getInvalidRegion();

    // Reuse Aseprite UI's overlap-safe software scroll, keeping dirty pixels and

    // floating controls out of both source and destination. GPU repaints.

    if(navigation_.panBlit_ && display() && !display()->nativeWindow()->gpuAcceleration() && !currentPlayback().playing &&

       !currentTools().selectionTool && !currentDocument().gradientActive() && !currentDocument().floating()) {

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

    if(cancel) {currentView().canvas.x=navigation_.pan_.origin.x;currentView().canvas.y=navigation_.pan_.origin.y;}

    navigation_.pan_.end();navigation_.panButton_=ui::kButtonNone;layoutCanvasScrollBars();

    if(hasCapture()) releaseMouse();

    updateNavigationCursor();invalidateRect(canvasViewport());

  }

void Editor::selectionAutoPan(gfx::Point pointer){if(!(selectionDragging_ || floatingDragging_) || currentTools().selectionKind==4 || currentTools().selectionKind==5)return;const auto viewport=canvasViewport();auto speed=[](int point,int start,int end){return point<start+28?-std::min(16.0,std::max(2.0,(start+28-point)*.4)):point>end-28?std::min(16.0,std::max(2.0,(point-(end-28))*.4)):0.0;};const int dx=int(std::round(speed(pointer.x,viewport.x,viewport.x2()))),dy=int(std::round(speed(pointer.y,viewport.y,viewport.y2())));if(!dx && !dy)return;panCanvasDisplay(-dx,-dy);constrainCanvas();invalidateRect(viewport);}

void Editor::constrainCanvas() {

    const auto viewport=canvasViewport();

    if(currentView().rotation.active()){const auto center=canvasDocumentToDisplay({currentDocument().width()/2.,currentDocument().height()/2.});const double rad=currentView().rotation.degrees*3.14159265358979323846/180;const int w=int(std::ceil(std::abs(std::cos(rad))*currentView().canvas.w+std::abs(std::sin(rad))*currentView().canvas.h)),h=int(std::ceil(std::abs(std::sin(rad))*currentView().canvas.w+std::abs(std::cos(rad))*currentView().canvas.h));const int x=clampCanvasAxis(center.x-w/2,viewport.x,viewport.w,w)+w/2,y=clampCanvasAxis(center.y-h/2,viewport.y,viewport.h,h)+h/2;const auto d=runtimePreferences_.index("editing.rotationIndicatorPosition.Select")==1?view::Point{double(x-center.x),double(y-center.y)}:currentView().rotation.inverse({double(x-center.x),double(y-center.y)},{0,0});currentView().canvas.x+=int(std::lround(d.x));currentView().canvas.y+=int(std::lround(d.y));layoutCanvasScrollBars();return;}
    currentView().canvas.x=clampCanvasAxis(currentView().canvas.x,viewport.x,viewport.w,currentView().canvas.w);

    currentView().canvas.y=clampCanvasAxis(currentView().canvas.y,viewport.y,viewport.h,currentView().canvas.h);layoutCanvasScrollBars();

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

    if(capture==this)return smoothDragging_||selectionDragging_||floatingDragging_||selectionPivotDragging_||navigation_.pan_.active||eyedropperGesture_.active()||navigation_.zoomDragging_||shapeDragging_||gradientDragging_||fillDragging_||currentDocument().active();

    if(!canvasViewport().contains(position) || const_cast<Editor*>(this)->frontWidgetAt(position,false)!=this)return false;

    // A menu or a separate popup window can cover the same canvas coordinates.

    if(window() && window()->isVisible() && display() && display()->nativeWindow()){

      auto picked=ui::Manager::getDefault()->pickFromScreenPos(display()->nativeWindow()->pointToScreen(position));

      if(picked && picked!=this)return false;

    }

    return true;

  }

bool Editor::selectionPointerVisible(gfx::Point position) const {

    return currentTools().selectionTool && canvasOwnsPointer(position) && std::string(cursorAt(position))=="none";

  }

void Editor::refreshCanvasPointerFeedback() {if(currentView().rotation.active()){invalidateRect(canvasViewport());return;}

    gfx::Rect next;

    if(paletteMousePosition_ && currentTools().selectionTool && canvasOwnsPointer(*paletteMousePosition_)){

      if(currentTools().selectionKind==5 && !spaceHeld_ && !currentTools().handTool && !currentTools().eyedropperTool && !eyedropperHeld_ && !eyedropperGesture_.active())next=canvasViewport();

      else if(selectionPointerVisible(*paletteMousePosition_)){

        const auto p=canvasPoint(*paletteMousePosition_);const double scale=canvasScale();

        const int x=int(std::round(currentView().canvas.x+p.x*scale)),y=int(std::round(currentView().canvas.y+p.y*scale));

        next=gfx::Rect(x-7,y-7,std::max(2,int(std::round(currentView().canvas.x+(p.x+1)*scale))-x)+14,std::max(2,int(std::round(currentView().canvas.y+(p.y+1)*scale))-y)+14)&canvasViewport();

      }

    }

    if(next!=selectionPointerDamage_){

      const auto previous=selectionPointerDamage_;selectionPointerDamage_=next;

      if(!previous.isEmpty())invalidateRect(previous);

      if(!next.isEmpty())invalidateRect(next);

    }else if(currentTools().selectionKind==5 && !next.isEmpty())invalidateRect(next);

  }

gfx::Rect Editor::brushPreviewDamage(std::optional<gfx::Point> position) {

    if(position && (currentTools().airbrushTool||currentTools().smoothTool||(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off)))return canvasViewport();
    if(!position || homeOpen_ || !documentOpen_ || !(ordinaryBrushTool() || (currentTools().shapeTool && currentTools().shapeKind==ShapeKind::Line)) ||

       !canvasViewport().contains(*position))return {};

    // Connected lines and symmetry can cover disjoint parts of the document.

    // Keep their existing conservative redraw until all copies are bounded.

    if(currentView().rotation.active() || brushFeedback_.brushPreviewShift_ || symmetryHas(currentDocument().symmetryAxes))return canvasViewport();

    const auto p=isoSnapBrush(*position);const auto brush=currentTools().brushProfiles[currentTools().eraser?1:0];

    int width=brush.size,height=brush.size;

    if(currentTools().pencilImageBrush){

      const double angle=std::fmod(currentTools().pencilImageBrushAngle,360)*3.14159265358979323846/180;

      const double c=std::abs(std::cos(angle)),s=std::abs(std::sin(angle));

      width=std::max(1,int(std::ceil(currentTools().pencilImageBrush->width*c+currentTools().pencilImageBrush->height*s-1e-9)));

      height=std::max(1,int(std::ceil(currentTools().pencilImageBrush->width*s+currentTools().pencilImageBrush->height*c-1e-9)));

    }

    const double scale=canvasScale();

    const int x=int(std::round(currentView().canvas.x+(p.x-width/2)*scale)),y=int(std::round(currentView().canvas.y+(p.y-height/2)*scale));

    const int right=int(std::round(currentView().canvas.x+(p.x-width/2+width)*scale)),bottom=int(std::round(currentView().canvas.y+(p.y-height/2+height)*scale));

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

    if(!navigation_.pan_.active && (!currentDocument().active() || currentTools().eraser))for(auto p:{previous,position}){const auto damage=brushPreviewDamage(p);if(!damage.isEmpty())invalidateRect(damage);}

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

          7+int((point->x-viewport.x+currentView().frameRemainder)/(12*uiScale));

        const int y=point->y<viewport.y?-1:int((point->y-viewport.y+currentView().layerRemainder)/(12*uiScale));

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

    const bool freeSelection=currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile";
    if(freeSelection&&!freeTileSelectionTargetBounds(currentDocument()))return "unavailable";
    if(selectionPivotDragging_)return "move";

    if(floatingDragging_ && transformHandle_.empty())return selectionCopyDrag_?"copy":"move";

    if(selectionBoxDragging_)return "selection-move";

    if(selectionDragging_ && currentTools().selectionKind!=5)return "none";

    if(selectionDragging_ && currentTools().selectionKind==5)return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    if(!floatingDragging_ && !selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";

    const auto hit=selectionShift_ && !floatingDragging_?std::string{}:transformHandle_.empty()?transformHit(position):transformHandle_;

    if(!hit.empty())if(auto target=selectionTransformTarget())return selectionTransformCursor(hit,*target,position);

    const int inside=selectionHit(position);

    if(!selectionShift_ && (inside==1 || (inside==2 && (currentTools().selectionMode<2 || selectionCtrl_))))

      return selectionCtrl_?"copy":inside==1?"selection-move":"move";

    if(currentTools().selectionTool && currentTools().selectionKind==5) {

      const auto p=canvasPoint(position);

      if(p.x>=0 && p.y>=0 && p.x<currentDocument().width() && p.y<currentDocument().height() && !(currentDocument().rasterToolsAvailable()||currentDocument().maskBrushAvailable()||freeSelection))return "unavailable";

      return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

    }

    const auto p=canvasPoint(position);

    const bool insideCanvas=p.x>=0 && p.y>=0 && p.x<currentDocument().width() && p.y<currentDocument().height();

    if(insideCanvas && !(currentDocument().rasterToolsAvailable()||currentDocument().maskBrushAvailable()||freeSelection))return "unavailable";

    return "none";

  }

const char* Editor::cursorAt(gfx::Point position) const {InteractionScope interactionScope(6,"cursor");
    const auto textResizeCursor=[&](const std::string& hit){
      if(hit.empty()||hit=="inside")return "move";
      const auto direction=currentView().rotation.forward({hit.find('w')!=std::string::npos?-1.:hit.find('e')!=std::string::npos?1.:0.,hit.find('n')!=std::string::npos?-1.:hit.find('s')!=std::string::npos?1.:0.},{0,0});
      const int bucket=(int(std::floor(std::atan2(direction.y,direction.x)*180/3.141592653589793/45+.5))%4+4)%4;
      return bucket==0?"ew-resize":bucket==1?"nwse-resize":bucket==2?"ns-resize":"nesw-resize";
    };
    if(referenceSamplingCursor_)return "eyedropper";
    if(pending_==Pending::SheetImport&&importSheetPreview_&&importSheetPreview_->isVisible()){const auto capture=ui::Manager::getDefault()->getCapture();if(capture==importSheetPreview_||(!capture&&importSheetPreview_->bounds().contains(position)))return "crosshair";}

    if(const auto capture=ui::Manager::getDefault()->getCapture();capture && capture!=this){

      if(previewPanel_ && previewPanel_->hasCapture())return previewPanel_->cursorAt(position);

      return "default";

    }

    if(pending_!=Pending::None){
      if(hasCapture() && sizeDrag_==SizeDrag::Modal)return panelResizeCursor(sizeDragEdges_);
      if(hasCapture() && sizeDrag_==SizeDrag::ModalMove)return "move";
      return panelResizeCursor(panelResizeEdges(dialogDisplayBounds(),position));
    }
    if(sliceDrag_)return sliceDrag_==3?textResizeCursor(sliceHandle_):sliceDrag_==2?(sliceCopy_?"copy":"move"):"crosshair";
    if(textTransforming_)return textResizeCursor(textHandle_);
    if(textCreating_)return "text";
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

    if(moveDragging_||currentDocument().freeTileInstanceMoving())return "move";
    if(shapeDragging_ || gradientDragging_)return "crosshair";

    if(pending_==Pending::None && (fillDragging_ || (currentDocument().active() && !currentDocument().floating())))return legacyPaintCursor(ink_&255,(ink_>>8)&255,(ink_>>16)&255);

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

    if(currentTools().rotateTool&&canvasViewport().contains(position))return "rotate";
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

    // useCanvasCursor: text Alt-copy and configured temporary move precede
    // sampling and ordinary text-box hover. Captured gestures were handled above.
    if(currentTools().textTool&&!currentDocument().active()&&!spaceHeld_&&!currentTools().handTool&&canvasViewport().contains(position)&&!shortcutInputBlocked()){
      auto held=moveHeldKeys_;
      if(brushFeedback_.modifierAlt_)held.insert("Alt");
      if(brushFeedback_.modifierCtrl_&&!held.count("Win"))held.insert("Ctrl");
      if(selectionShift_)held.insert("Shift");
      const auto point=canvasPoint(position);
      if(held.count("Alt")&&!textLayerAtPoint(currentDocument(),point).empty())return "copy";
      if(shortcuts::quickToolMatch(shortcutBindings_,held,[this](const std::string& id){return shortcutSupported(id);})=="tool.move.quick"){
        const bool inside=point.x>=0&&point.y>=0&&point.x<currentDocument().width()&&point.y<currentDocument().height();
        auto selected=currentDocument().selectedLayerIdsWithGroups();if(selected.empty())selected.push_back(currentDocument().layer().id);
        const bool movable=std::any_of(selected.begin(),selected.end(),[this](const auto& id){const auto& layer=currentDocument().timeline().state().layers[currentDocument().timeline().layerIndex(id)];return currentDocument().layerEffectivelyVisible(layer)&&!currentDocument().layerEffectivelyLocked(layer);});
        return !inside||movable?"move":"unavailable";
      }
    }

    if(symmetryDragging_ || (!currentDocument().active() && !spaceHeld_ && !currentTools().handTool && !currentTools().zoomTool && !currentTools().eyedropperTool && !eyedropperHeld_ && symmetryHit(position)))return "move";

    if(sliceTool()&&sliceAlt_)return "copy";
    if(eyedropperGesture_.active() || ((currentTools().eyedropperTool || eyedropperHeld_) && canvasViewport().contains(position) && !currentDocument().active() && !spaceHeld_))return "eyedropper";

    // Selection and transform captures keep their semantic cursor even when

    // the pointer briefly leaves the canvas, matching the legacy pointer

    // capture path.

    if((selectionDragging_ || floatingDragging_ || selectionPivotDragging_) && (currentTools().selectionTool || currentDocument().floating()))

      return selectionCursorAt(position);

    if(!canvasViewport().contains(position)) return "default";

    if(!currentDocument().active() && (spaceHeld_ || currentTools().handTool)) return "grab";

    if(currentTools().zoomTool && !spaceHeld_ && !eyedropperHeld_)return "zoom";

    if(currentTools().selectionTool && !selectionShift_ && !selectionCtrl_ && selectionPivotHit(position))return "default";

    if(sliceTool()){if(currentDocument().selectedSliceIds().size()==1&&!selectionShift_&&!sliceAlt_){const auto it=std::find_if(currentDocument().slices().begin(),currentDocument().slices().end(),[&](const auto& value){return value.id==currentDocument().selectedSliceId();});if(it!=currentDocument().slices().end()){const auto handle=sliceHandleAt(position,it->rect);if(!handle.empty())return textResizeCursor(handle);}}auto p=canvasPoint(position);if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){const auto mapped=repeat::map({double(p.x),double(p.y)},currentDocument().width(),currentDocument().height(),currentView().tileRepeat);if(!mapped)return "crosshair";p={int(mapped->local.x),int(mapped->local.y)};}if(sliceAtPoint(currentDocument().slices(),p.x,p.y))return "move";return "crosshair";}
    if(currentTools().moveTool)return "move";
    if(currentTools().selectionTool || currentDocument().floating())return selectionCursorAt(position);

    const auto point=canvasPoint(position);

    const bool inDocument=point.x>=0 && point.y>=0 && point.x<currentDocument().width() && point.y<currentDocument().height();

    if(currentTools().textTool){
      auto localPoint=point;const auto localDisplay=textBoxDisplayPoint(position);
      if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){
        const auto at=canvasDocumentPoint(position);
        const auto mapped=repeat::map({at.x,at.y},currentDocument().width(),currentDocument().height(),currentView().tileRepeat);
        if(!mapped)return "text";
        localPoint={int(mapped->local.x),int(mapped->local.y)};
      }
      const auto hit=textBoxPointerHit(currentDocument(),skin_,currentView().canvas,canvasScale(),localPoint,localDisplay);
      if(!hit.empty())return textResizeCursor(hit);
      return "text";
    }
    if(inDocument && !(currentDocument().rasterToolsAvailable()||currentDocument().maskBrushAvailable()))return "unavailable";

    // Current cursor color feedback follows the active ordinary layer; legacy's

    // composited replacement sample resolves to ink or the exposed checker.

    if(currentTools().eraser && inDocument) {

      const auto color=checkerboard_.at(point.x,point.y);

      return legacyPaintCursor(gfx::getr(color),gfx::getg(color),gfx::getb(color));

    }

    if(currentTools().shapeTool || currentTools().gradientTool || currentTools().fillTool) {

      if(inDocument && !(currentDocument().rasterToolsAvailable()||currentDocument().maskBrushAvailable()))return "unavailable";

      if(currentTools().shapeTool || currentTools().gradientTool)return "crosshair";

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

void Editor::ensureContentCache() {InteractionScope interactionScope(7,"content-cache");auto displayedOnion=onion_;if(timelineHidden_)displayedOnion.enabled=false;renderer_.setOnionSkin(displayedOnion,currentPlayback().playing);renderer_.sync(currentDocument());}

void Editor::paintSelectionAnts(ui::Graphics& g,gfx::Rect cv,gfx::Rect viewport,int phase) {

    if(!currentView().showSelectionOutline || !currentDocument().selection())return;

    const auto& s=currentDocument().selection();const double scale=canvasScale();gfx::Path path;

    auto segment=[&](int x,int y,int x2,int y2){

      path.moveTo(cv.x+x*scale,cv.y+y*scale);path.lineTo(cv.x+x2*scale,cv.y+y2*scale);

    };

    if(s->mask.empty()) {

      segment(s->x,s->y,s->x+s->width,s->y);segment(s->x,s->y+s->height,s->x+s->width,s->y+s->height);

      segment(s->x,s->y,s->x,s->y+s->height);segment(s->x+s->width,s->y,s->x+s->width,s->y+s->height);

    } else if(const auto* boundaries=selectionBoundaryCache_.get(s,currentDocument().identity(),currentDocument().selectionRevision(),
        int(std::floor((viewport.x-cv.x)/scale))-1,int(std::floor((viewport.y-cv.y)/scale))-1,
        int(std::ceil((viewport.x2()-cv.x)/scale))+1,int(std::ceil((viewport.y2()-cv.y)/scale))+1)) {
      for(const auto& edge:*boundaries)segment(edge[0],edge[1],edge[2],edge[3]);
    } else {
      // Fragmented selections above the cache budget retain the clipped path.
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

    Pixel pixel=0;if(selectionColorIdentity_!=currentDocument().identity() || selectionColorRevision_!=currentDocument().contentRevision() || selectionColorFrame_!=currentDocument().frame().id||selectionColorFloatingRevision_!=currentDocument().floatingOverlayRevision()){selectionColorFloatingRevision_=currentDocument().floatingOverlayRevision();selectionColorTiles_.clear();selectionColorIdentity_=currentDocument().identity();selectionColorRevision_=currentDocument().contentRevision();selectionColorFrame_=currentDocument().frame().id;}

    if(x>=0 && y>=0 && x<currentDocument().width() && y<currentDocument().height()){const auto key=std::make_pair(x/64,y/64);auto it=selectionColorTiles_.find(key);const int left=key.first*64,top=key.second*64,width=std::min(64,currentDocument().width()-left);if(it==selectionColorTiles_.end()){if(selectionColorTiles_.size()>=32)selectionColorTiles_.erase(selectionColorTiles_.begin());const PixelRegion region{left,top,width,std::min(64,currentDocument().height()-top)};const auto overlay=currentDocument().floatingDeferred()?currentDocument().floatingOverlayRegion(region):std::vector<Pixel>{};auto composed=compositeNormalRegion(currentDocument().displayTimeline(),currentDocument().frame().id,{region.x,region.y,region.w,region.h},currentDocument().layer().id,currentDocument().floatingDeferred()?&overlay:nullptr,region.w,region.x,region.y,false);it=selectionColorTiles_.emplace(key,std::move(composed)).first;}pixel=it->second[(y-top)*width+x-left];}

    auto color=pixel>>24?gfx::rgba(pixel&255,(pixel>>8)&255,(pixel>>16)&255,255):checkerboard_.at(x,y);

    return gfx::getr(color)*.2126+gfx::getg(color)*.7152+gfx::getb(color)*.0722>145?gfx::rgba(0,0,0,255):gfx::rgba(255,255,255,255);

  }

void Editor::paintSelectionFeedback(ui::Graphics& g,const gfx::Rect& cv,const gfx::Rect& viewport) {

    if(!currentTools().selectionTool || currentTools().handTool || spaceHeld_)return;

    const double scale=canvasScale();

    auto pixelBox=[&](int x,int y){const int left=int(std::round(cv.x+x*scale)),top=int(std::round(cv.y+y*scale));return gfx::Rect(left,top,std::max(1,int(std::round(cv.x+(x+1)*scale))-left),std::max(1,int(std::round(cv.y+(y+1)*scale))-top));};

    const bool unboundedMarquee=currentTools().selectionKind<=1&&!quickSelection_&&marqueeTarget_&&(tileRepeatIdentity_!=currentDocument().identity()||currentView().tileRepeat==repeat::Mode::Off)&&!(currentDocument().layer().kind=="tilemap"&&currentDocument().tilemapMode()==tiles::Mode::Paint);
    auto pixel=[&](int x,int y){const bool repeatedPath=currentTools().selectionKind==2&&tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off;if(!repeatedPath&&!unboundedMarquee&&(x<0 || y<0 || x>=currentDocument().width() || y>=currentDocument().height()))return;const auto box=pixelBox(x,y);if(box.intersects(viewport)){const auto sample=repeatedPath?repeat::wrap({double(x),double(y)},currentDocument().width(),currentDocument().height(),currentView().tileRepeat):repeat::Point{double(x),double(y)};g.fillRect(selectionPreviewColor(int(sample.x),int(sample.y)),box);}};

    const bool creating=selectionDragging_ && !selectionBoxDragging_;

    const auto* displayPreview=&selectionPreview_;std::optional<SelectionMask> unbounded;
    if(creating&&unboundedMarquee){unbounded=transformBounds(*marqueeTarget_);displayPreview=&unbounded;}
    if(creating && *displayPreview){const auto& mask=**displayPreview;

      if(unboundedMarquee){for(auto at:marqueeContour(*marqueeTarget_,currentTools().selectionKind==1,currentTools().selectionRounded?currentTools().selectionCornerRadius:0))for(auto point:symmetryPoints({at.x,at.y},currentDocument().width(),currentDocument().height(),currentDocument().symmetryAxes,currentDocument().symmetryCenter(),false))pixel(point.x,point.y);}
      else if(currentTools().selectionKind==2 || currentTools().selectionKind==3){auto pathPixel=[&](SelectionPoint at){for(auto point:symmetryPoints({at.x,at.y},currentDocument().width(),currentDocument().height(),currentDocument().symmetryAxes,currentDocument().symmetryCenter(),false))pixel(point.x,point.y);};auto path=selectionPath_;if(currentTools().selectionKind==3 && (path.empty() || path.back().x!=selectionLast_.x || path.back().y!=selectionLast_.y))path.push_back({selectionLast_.x,selectionLast_.y});for(std::size_t i=1;i<path.size();++i)for(auto at:selectionLine(path[i-1],path[i],currentTools().selectionKind==3&&runtimePreferences_.flag("tools.balancedShiftLineEnabled")))pathPixel(at);if(path.size()>1 && (currentTools().selectionKind==3 || runtimePreferences_.flag("tools.lassoPreviewClosed")))for(auto at:selectionLine(path.back(),path.front(),currentTools().selectionKind==3&&runtimePreferences_.flag("tools.balancedShiftLineEnabled")))pathPixel(at);}

      else {const int left=std::max(mask.x,int(std::floor((viewport.x-cv.x)/scale))),top=std::max(mask.y,int(std::floor((viewport.y-cv.y)/scale))),right=std::min(mask.x+mask.width,int(std::ceil((viewport.x2()-cv.x)/scale))),bottom=std::min(mask.y+mask.height,int(std::ceil((viewport.y2()-cv.y)/scale)));for(int y=top;y<bottom;++y)for(int x=left;x<right;++x)if(selectionContains(*displayPreview,x,y) && (currentTools().selectionKind==4 || !selectionContains(*displayPreview,x-1,y) || !selectionContains(*displayPreview,x+1,y) || !selectionContains(*displayPreview,x,y-1) || !selectionContains(*displayPreview,x,y+1))){const bool symmetricMarquee=currentTools().selectionKind<=1&&!quickSelection_&&(tileRepeatIdentity_!=currentDocument().identity()||currentView().tileRepeat==repeat::Mode::Off)&&!(currentDocument().layer().kind=="tilemap"&&currentDocument().tilemapMode()==tiles::Mode::Paint);if(symmetricMarquee)for(auto point:symmetryPoints({x,y},currentDocument().width(),currentDocument().height(),currentDocument().symmetryAxes,currentDocument().symmetryCenter(),false))pixel(point.x,point.y);else pixel(x,y);}}

      if(currentTools().selectionKind<=1 && runtimePreferences_.flag("cursor.selectionSizeVisible")){const auto target=marqueeTarget_.value_or(SelectionTransform{double(mask.x),double(mask.y),double(mask.width),double(mask.height)});const int l=int(std::floor(target.x)),t=int(std::floor(target.y)),r=l+int(target.width)-1,b=t+int(target.height)-1;

        const auto first=unicodeText(std::to_string(l)+", "+std::to_string(t)+" - "+std::to_string(r)+", "+std::to_string(b));const auto second=unicodeText(std::to_string(int(target.width))+" x "+std::to_string(int(target.height)));

        const int width=std::max(font_.inkBounds(first).w,font_.inkBounds(second).w)+4;auto anchor=pixelBox(l,t).origin();const int bx=std::clamp(anchor.x,viewport.x,std::max(viewport.x,viewport.x2()-width*uiScale)),by=std::clamp(anchor.y-26*uiScale,viewport.y,std::max(viewport.y,viewport.y2()-26*uiScale));

        UiPaintScale ui(g,gfx::Point(bx,by));g.fillRect(gfx::rgba(74,74,81,180),gfx::Rect(0,0,width,26));font_.draw(g,first,2,2,gfx::rgba(255,255,255,255));font_.draw(g,second,2,14,gfx::rgba(255,255,255,255));

      }

    }

    if(currentTools().selectionKind==5 || floatingDragging_ || selectionBoxDragging_ || selectionPivotDragging_ || !paletteMousePosition_)return;

    const auto point=*paletteMousePosition_;if(!selectionPointerVisible(point))return;

    const auto hit=transformHit(point);const int content=selectionHit(point);if(!selectionShift_ && selectionPivotHit(point))return;

    if(!creating && !selectionShift_ && (!hit.empty() || content==1 || (content==2 && (currentTools().selectionMode<2 || selectionCtrl_))))return;

    const auto p=canvasPoint(point);auto box=pixelBox(p.x,p.y);const int w=std::max(2,box.w),h=std::max(2,box.h);box.x-=(w-box.w)/2;box.y-=(h-box.h)/2;box.w=w;box.h=h;const auto color=selectionPreviewColor(p.x,p.y);

    for(int sx:{-1,1})for(int sy:{-1,1}){const int x=sx<0?box.x:box.x2(),y=sy<0?box.y:box.y2();g.fillRect(color,gfx::Rect(sx<0?x-6:x,sy<0?y-2:y,6,2));g.fillRect(color,gfx::Rect(sx<0?x-2:x,sy<0?y-6:y,2,6));}

  }

void Editor::paintBrushPreview(ui::Graphics& g,const gfx::Rect& cv,bool outlinePass) {InteractionScope interactionScope(8,"brush-preview");

    const int configured=runtimePreferences_.index("cursor.brushPreviewMode.Select");const int previewMode=(outlinePass || currentDocument().active())?1:configured==3?2:configured;if(previewMode==0)return;

    if(homeOpen_ || !documentOpen_ || pending_!=Pending::None || currentPlayback().playing || spaceHeld_ || navigation_.pan_.active ||

       eyedropperHeld_ || eyedropperGesture_.active() || !(currentDocument().rasterToolsAvailable()||currentDocument().maskBrushAvailable()) || !paletteMousePosition_ ||

       !(ordinaryBrushTool() || (currentTools().shapeTool && currentTools().shapeKind==ShapeKind::Line)) ||

       shapeDragging_ || currentDocument().floating() || !canvasViewport().contains(*paletteMousePosition_))return;

    if(!canvasOwnsPointer(*paletteMousePosition_))return;

    if(currentDocument().active() && !runtimePreferences_.flag("cursor.drawingBrushPreviewEnabled"))return;

    const auto brush=activeStrokeBrush();const auto p=isoSnapBrush(*paletteMousePosition_);

    const auto anchor=runtimePreferences_.flag("tools.shiftLinePreviewEnabled") && brushFeedback_.brushPreviewShift_ && !currentDocument().active() && ordinaryBrushTool()?brushLineAnchor():nullptr;

    Point target=p,lineStart=target;if(anchor){const auto pointer=canvasPoint(*paletteMousePosition_);const auto nearest=repeat::nearestEquivalent({double(anchor->point.x),double(anchor->point.y)},{double(pointer.x),double(pointer.y)},currentDocument().width(),currentDocument().height(),tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off);const auto line=resolveBrushLine({int(nearest.x),int(nearest.y)},pointer,brushFeedback_.modifierCtrl_);lineStart=line.first;target=line.second;}

    const double scale=canvasScale();

    auto box=[&](int x,int y){const int l=int(std::round(cv.x+x*scale)),t=int(std::round(cv.y+y*scale));return gfx::Rect(l,t,std::max(1,int(std::round(cv.x+(x+1)*scale))-l),std::max(1,int(std::round(cv.y+(y+1)*scale))-t));};

    if((currentTools().eraser || previewMode==1 || previewMode==3) && !anchor){

      // Complete outline includes the portion outside the document.

      auto edge=[&](int x,int y,unsigned edges){const auto r=box(x,y);if(!r.intersects(canvasPaintViewport(g.getClipBounds())))return;const auto color=selectionPreviewColor(x,y,false);const int thickness=runtimePreferences_.index("cursor.brushEdgeThickness.Number");

        if(edges&1)g.fillRect(color,gfx::Rect(r.x,r.y,thickness,r.h));

        if(edges&2)g.fillRect(color,gfx::Rect(r.x2()-thickness,r.y,thickness,r.h));

        if(edges&4)g.fillRect(color,gfx::Rect(r.x,r.y,r.w,thickness));

        if(edges&8)g.fillRect(color,gfx::Rect(r.x,r.y2()-thickness,r.w,thickness));};

      if(!currentTools().pencilImageBrush && brushFeedback_.brushPreviewBatch_ && !(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off)){

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

        if(currentTools().eraser || previewMode==1)return;

      }

      std::set<std::pair<int,int>> mask;

      if(currentTools().pencilImageBrush){const auto stamp=prepareImageBrushStamp(*currentTools().pencilImageBrush,brush.size,currentTools().pencilImageBrushAngle,brush.imagePaintMode,p.x,p.y,p.x-currentTools().pencilImageBrush->width/2,p.y-currentTools().pencilImageBrush->height/2);for(auto sample:stamp.samples)mask.emplace(p.x-stamp.width/2+sample.x,p.y-stamp.height/2+sample.y);}

      else for(auto span:brushSpans(brush))for(int x=span.left;x<=span.right;++x)mask.emplace(p.x-brush.size/2+x,p.y-brush.size/2+span.y);

      if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){std::set<std::pair<int,int>> wrapped;for(auto [x,y]:mask){const auto local=repeat::wrap({double(x),double(y)},currentDocument().width(),currentDocument().height(),currentView().tileRepeat);if(local.x>=0&&local.y>=0&&local.x<currentDocument().width()&&local.y<currentDocument().height())wrapped.emplace(int(local.x),int(local.y));}mask=std::move(wrapped);}
      for(auto [x,y]:mask)edge(x,y,(!mask.count({x-1,y})?1:0)|(!mask.count({x+1,y})?2:0)|(!mask.count({x,y-1})?4:0)|(!mask.count({x,y+1})?8:0));

      if(currentTools().eraser || previewMode==1)return;

    }

    const auto replacements=currentDocument().brushPreview(lineStart,target,currentTools().eraser?0:ink_,brush,currentTools().pencilImageBrush?&*currentTools().pencilImageBrush:nullptr,currentTools().pencilImageBrushAngle,brushLineBaseline(anchor),bool(anchor),tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off,bool(anchor)&&isoLineAlignmentActive());

    if(replacements.empty())return;

    PixelRegion region;for(auto [i,value]:replacements)region.include(int(i%currentDocument().width()),int(i/currentDocument().width()));

    std::vector<Pixel> pixels(std::size_t(region.w)*region.h);

    const auto* source=currentDocument().activeSurfaceIfPresent();if(source)raster::validate(*source);
    const bool denseSource=source&&raster::fullCanvas(*source,currentDocument().width(),currentDocument().height());
    if(source)for(int y=0;y<region.h;++y){auto row=pixels.begin()+std::size_t(y)*region.w;if(denseSource)std::copy_n(source->pixels.begin()+std::size_t(region.y+y)*currentDocument().width()+region.x,region.w,row);else for(int x=0;x<region.w;++x)row[x]=raster::readWorld(*source,region.x+x,region.y+y);}

    for(auto [i,value]:replacements)pixels[(i/currentDocument().width()-region.y)*region.w+i%currentDocument().width()-region.x]=value;

    auto composed=compositeNormalRegion(currentDocument().displayTimeline(),currentDocument().frame().id,{region.x,region.y,region.w,region.h},currentDocument().layer().id,&pixels,region.w,region.x,region.y);

    // Port legacy solidCompositePreviewRects: group adjacent equal colors.

    // Keep fillRect's exact alpha rounding, including image-brush samples.

    // Integer zoom has disjoint boxes; fractional zoom retains scalar order.

    if(brushFeedback_.brushPreviewBatch_ && !anchor && scale>=1 && scale==std::floor(scale) && std::uint64_t(region.w)*region.h<=256*256){

      std::vector<std::uint8_t> occupied(pixels.size(),0);

      for(auto [i,value]:replacements)occupied[(i/currentDocument().width()-region.y)*region.w+i%currentDocument().width()-region.x]=1;

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

    for(auto [i,value]:replacements){const int x=int(i%currentDocument().width()),y=int(i/currentDocument().width());auto r=box(x,y);if(!r.intersects(canvasPaintViewport(g.getClipBounds())))continue;

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
    struct CanvasProfile {
      struct Entry {std::uint64_t calls=0;double ms=0;};std::array<Entry,7> entries{};std::filesystem::path path;
      CanvasProfile(){if(const auto value=_wgetenv(L"MOONSPRITE_INTERACTION_PROFILE")){path=value;path+=L".canvas.tsv";}}
      ~CanvasProfile(){if(path.empty())return;try{std::ofstream out(path);out<<"phase\tcalls\ttotal_ms\n";const char* names[]{"clip-setup","decoration","composite","instance-feedback","grids","brush-preview","overlays"};for(int i=0;i<7;++i)out<<names[i]<<'\t'<<entries[i].calls<<'\t'<<entries[i].ms<<'\n';}catch(...){}}
    };
    static CanvasProfile profile;
    struct Phase {
      int index=0;bool enabled=!profile.path.empty();std::chrono::steady_clock::time_point start;
      Phase(){if(enabled)start=std::chrono::steady_clock::now();}
      void finish(){if(enabled){const auto now=std::chrono::steady_clock::now();++profile.entries[index].calls;profile.entries[index].ms+=std::chrono::duration<double,std::milli>(now-start).count();start=now;}}
      void next(int value){finish();index=value;}
      ~Phase(){finish();}
    } phase;


    auto viewport=canvasViewport();viewport.offset(-bounds().x,-bounds().y);

    auto cv=currentView().canvas;cv.offset(-bounds().x,-bounds().y);

    g.saveClip();g.clipRect(viewport);clipColumn(g,-1,true);

    // Transparent children can replay the parent with no canvas pixels left.
    // Preserve non-paint state updates; content/cache work stays lazy until
    // an actual canvas region is exposed.
    if(g.getClipBounds().isEmpty() && !(smoke_ && _wgetenv(L"MOONSPRITE_CANVAS_EMPTY_REFERENCE"))){
      if(documentOpen_){
        if(previewPanel_)previewPanel_->checkerboard=checkerboard_;
        if(currentView().showSelectionOutline && currentDocument().selection() && !homeOpen_ && !smoke_ && !antsTimer_.isRunning())antsTimer_.start();
      }
      g.restoreClip();return;
    }

    g.fillRect(skin_["background"],viewport);

    if(!documentOpen_){g.restoreClip();return;}
    viewport=canvasPaintViewport(viewport);g.save();g.concat(canvasRotationMatrix());

    phase.next(1);
    {

      // Decoration remains 2x, but its origin can move by one device pixel.

      UiPaintScale scale(g,cv.origin());

      skin_.draw(g,"document_frame",gfx::Rect(-3,-3,cv.w/uiScale+6,cv.h/uiScale+6));

      const auto dimensions=std::to_string(currentDocument().width())+" x "+std::to_string(currentDocument().height());

      font_.draw(g,std::u32string(dimensions.begin(),dimensions.end()),0,-15,skin_["muted"]);

    }

    if(previewPanel_)previewPanel_->checkerboard=checkerboard_;

    phase.next(2);
    ensureContentCache();
    // Composite/upload once. Repeated copies share the immutable renderer cache.
    const auto repeated=repeat::offsets(tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off);
    for(const auto copy:repeated){const gfx::Rect target(cv.x+copy.x*cv.w,cv.y+copy.y*cv.h,cv.w,cv.h);if(target.intersects(viewport))renderer_.draw(g,target,canvasScale(),checkerboard_.light,checkerboard_.dark,checkerboard_.size);}

    phase.next(3);
    paintFreeTileInstanceFeedback(g,cv);
    // legacy canvas-render-guides.ts: committed composite remains unchanged.
    if(canvasResizePreview_&&canvasResizeIdentity_==currentDocument().identity()&&canvasResizeRevision_==currentDocument().revision()){
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

    if(tweenEndpointImage_&&tweenEndpointIdentity_==currentDocument().identity()&&tweenEndpointRevision_==currentDocument().revision()){
      const double z=canvasScale();const int x=int(std::floor(cv.x+tweenEndpointX_*z+.5)),y=int(std::floor(cv.y+tweenEndpointY_*z+.5));ui::Paint ghost(gfx::rgba(255,255,255,102));ghost.blendMode(os::BlendMode::SrcOver);g.saveClip();g.clipRect(canvasViewport());g.drawSurface(tweenEndpointImage_.get(),{0,0,tweenEndpointImage_->width(),tweenEndpointImage_->height()},{x,y,std::max(1,int(std::floor(tweenEndpointImage_->width()*z+.5))),std::max(1,int(std::floor(tweenEndpointImage_->height()*z+.5)))},os::Sampling(),&ghost);g.restoreClip();
    }


    const auto baseCanvas=cv;
    for(const auto copy:repeated){
    cv=baseCanvas;cv.offset(copy.x*baseCanvas.w,copy.y*baseCanvas.h);
    if(!cv.intersects(viewport))continue;
    phase.next(4);
    if(currentDocument().showCustomGrid()){

      Pixel packed=0xffff0000;parsePaletteHex(runtimePreferences_.get("appearance.gridColor"),packed);const auto color=gfx::rgba(packed&255,(packed>>8)&255,(packed>>16)&255,packed>>24);const auto settings=currentDocument().customGrid();

      auto clip=canvasPaintViewport(g.getClipBounds());clip&=gfx::Rect(cv.x,cv.y,int(std::ceil(currentDocument().width()*canvasScale())),int(std::ceil(currentDocument().height()*canvasScale())));g.saveClip();g.clipRect(clip);

      for(double x:gridLinePositions(settings.x,settings.width,std::max(0.,(clip.x-cv.x)/canvasScale()),std::min(double(currentDocument().width()),(clip.x2()-cv.x)/canvasScale()),currentView().zoom))g.fillRect(color,gfx::Rect(int(std::floor(cv.x+x*canvasScale()+.5)),clip.y,1,clip.h));

      for(double y:gridLinePositions(settings.y,settings.height,std::max(0.,(clip.y-cv.y)/canvasScale()),std::min(double(currentDocument().height()),(clip.y2()-cv.y)/canvasScale()),currentView().zoom))g.fillRect(color,gfx::Rect(clip.x,int(std::floor(cv.y+y*canvasScale()+.5)),clip.w,1));g.restoreClip();

    }

    if(currentDocument().showPixelGrid()&&shouldRenderPixelGrid(currentView().zoom)){

      Pixel packed=0x8f5c4d45;parsePaletteHex(runtimePreferences_.get("appearance.pixelGridColor"),packed);const auto color=gfx::rgba(packed&255,(packed>>8)&255,(packed>>16)&255,packed>>24);

      const auto clip=canvasPaintViewport(g.getClipBounds()).createIntersection(cv);g.saveClip();g.clipRect(cv);

      for(int x:pixelGridLines(cv.x,canvasScale(),currentDocument().width(),clip.x,clip.x2()))g.fillRect(color,gfx::Rect(x,clip.y,1,clip.h));

      for(int y:pixelGridLines(cv.y,canvasScale(),currentDocument().height(),clip.y,clip.y2()))g.fillRect(color,gfx::Rect(clip.x,y,clip.w,1));g.restoreClip();

    }

    if(currentView().isoViewEnabled)paintIsometricGuides(g,cv);
    phase.next(5);
    paintBrushPreview(g,cv);
    phase.next(6);

    if(symmetryHas(currentDocument().symmetryAxes)){

      const auto c=currentDocument().symmetryCenter();const auto a=currentDocument().symmetryAxes;const double scale=canvasScale();

      const auto color=gfx::rgba(symmetryColor_&255,(symmetryColor_>>8)&255,(symmetryColor_>>16)&255,symmetryColor_>>24);

      auto draw=[&](double x,double y){if(x<0 || y<0 || x>currentDocument().width() || y>currentDocument().height())return;g.fillRect(color,gfx::Rect(int(std::round(cv.x+x*scale)),int(std::round(cv.y+y*scale)),symmetryThickness_,symmetryThickness_));};

      const auto clip=canvasPaintViewport(g.getClipBounds());

      // A sample extends to the right/bottom by the configured thickness.

      // Preserve original sample coordinates/order; skip only invisible samples.

      const int firstX=symmetryClip_?std::max(0,clip.x-cv.x-symmetryThickness_):0,lastX=symmetryClip_?std::min(cv.w,clip.x2()-cv.x):cv.w;

      const int firstY=symmetryClip_?std::max(0,clip.y-cv.y-symmetryThickness_):0,lastY=symmetryClip_?std::min(cv.h,clip.y2()-cv.y):cv.h;

      if(a.horizontal||a.rotational||a.diagonalDown||a.diagonalUp)for(int x=firstX;x<=lastX;++x){const double px=x/scale;if(a.horizontal||a.rotational)draw(px,c.y);if(a.diagonalDown)draw(px,px+c.y-c.x);if(a.diagonalUp)draw(px,c.x+c.y-px);}

      if(a.vertical||a.rotational)for(int y=firstY;y<=lastY;++y)draw(c.x,y/scale);

    }

    if(currentTools().selectionTool && currentTools().selectionKind==5 && selectionBrushPointer_ && canvasOwnsPointer(*selectionBrushPointer_) && !currentTools().eyedropperTool && !eyedropperHeld_ && !eyedropperGesture_.active() && !spaceHeld_ && !currentTools().handTool && ((selectionDragging_ && !selectionBoxDragging_) || transformHit(*selectionBrushPointer_).empty())){const auto pointer=*selectionBrushPointer_;if((selectionDragging_ && !selectionBoxDragging_) || selectionHit(pointer)==0){auto coverage=selectionBrushStroke_;const auto p=canvasPoint(pointer);coverage.collect(currentDocument().width(),currentDocument().height(),{p.x,p.y},{p.x,p.y},currentTools().brushProfiles[0],currentTools().selectionBrushAngle,tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off);drawSelectionBrushCoverage(g,coverage,currentDocument().width(),currentDocument().height(),tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off,cv,canvasScale());}}

    for(const auto copy:repeated){const gfx::Rect target(cv.x+copy.x*cv.w,cv.y+copy.y*cv.h,cv.w,cv.h);g.saveClip();g.clipRect(target);paintAirbrushPreview(g,target);g.restoreClip();}paintLiquifyPreview(g,cv);
    paintSmoothCoverage(g,cv);
    if(currentDocument().gradientActive()){auto handle=[&](TransformPoint p){const int x=gradientRound(cv.x+p.x*canvasScale()),y=gradientRound(cv.y+p.y*canvasScale());g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));};handle(currentTools().gradientRadial?resolveGradientGeometry(gradientSpec_).center:gradientSpec_.start);handle(gradientSpec_.end);}

    if(runtimePreferences_.flag("tools.alignmentGuidesVisible") && (selectionDragging_ || floatingDragging_ || moveDragging_) && !alignmentGuides_.empty()){
      const gfx::Rect boundary(cv.x,cv.y,int(std::ceil(currentDocument().width()*canvasScale())),int(std::ceil(currentDocument().height()*canvasScale())));
      g.saveClip();g.clipRect(boundary);const auto color=gfx::rgba(41,121,255,230);
      for(auto guide:alignmentGuides_){if(guide.axis=='x' && guide.position>=0 && guide.position<=currentDocument().width()){const int x=int(std::floor(cv.x+guide.position*canvasScale()+.5))-(guide.position==currentDocument().width()?1:0);g.fillRect(color,gfx::Rect(x,boundary.y,1,boundary.h));}else if(guide.axis=='y' && guide.position>=0 && guide.position<=currentDocument().height()){const int y=int(std::floor(cv.y+guide.position*canvasScale()+.5))-(guide.position==currentDocument().height()?1:0);g.fillRect(color,gfx::Rect(boundary.x,y,boundary.w,1));}}
      g.restoreClip();
    }
    paintMoveFeedback(g,cv);
    paintTextBox(g,cv);
    paintSelectionFeedback(g,cv,viewport);

    paintSelectionAnts(g,cv,viewport,antsOffset_);

    // Legacy useCanvasSelectionOverlay: one union outline for selected free
    // instances, below an explicit pixel selection and hidden during playback.
    if(currentView().showSelectionOutline&&!currentDocument().selection()&&!currentPlayback().playing){
      PixelRegion selected;for(const auto& id:currentDocument().selectedFreeTileInstances())if(const auto b=currentDocument().freeTileInstanceBounds(id)){selected.include(b->x,b->y);selected.include(b->x+b->w-1,b->y+b->h-1);}
      if(selected.w>0&&selected.h>0){Pixel packed=0xffff0000;parsePaletteHex(runtimePreferences_.get("appearance.freeTileInstanceOutlineColor.Color"),packed);const auto color=gfx::rgba(packed&255,(packed>>8)&255,(packed>>16)&255,packed>>24);const auto coord=[](double n){return int(std::clamp(std::floor(n+.5),-10000000.,10000000.));};const int left=coord(cv.x+selected.x*canvasScale()),top=coord(cv.y+selected.y*canvasScale()),right=coord(cv.x+(selected.x+selected.w)*canvasScale()),bottom=coord(cv.y+(selected.y+selected.h)*canvasScale());g.drawRect(color,{left,top,std::max(1,right-left),std::max(1,bottom-top)});}
    }

    if(currentView().showSelectionOutline && currentDocument().selection() && !homeOpen_ && !smoke_ && !antsTimer_.isRunning())antsTimer_.start();

    if(currentTools().selectionTool && !selectionDragging_){if(auto target=selectionControlTarget()){for(auto uv:std::array<TransformPoint,8>{{{0,0},{.5,0},{1,0},{0,.5},{1,.5},{0,1},{.5,1},{1,1}}}){if(currentView().freeTransform && (uv.x==.5 || uv.y==.5))continue;auto p=transformPoint(*target,uv.x,uv.y);const int x=int(std::round(cv.x+p.x*canvasScale())),y=int(std::round(cv.y+p.y*canvasScale()));g.fillRect(gfx::rgba(0,0,0,255),gfx::Rect(x-5,y-5,10,10));g.fillRect(gfx::rgba(255,255,255,255),gfx::Rect(x-3,y-3,6,6));}}}

    if((drawingAnchorActive()&&currentView().drawingAnchorVisible) || (currentDocument().selection() && currentView().selectionPivotVisible && !currentView().freeTransform && !selectionDragging_)){const auto p=drawingAnchorActive()&&currentView().drawingAnchorVisible?drawingAnchorPoint():selectionPivotPoint();const auto point=gfx::Point(int(std::round(cv.x+p.x*canvasScale())),int(std::round(cv.y+p.y*canvasScale())));UiPaintScale scale(g,point-gfx::Point(9,9));toolIcons_.draw(g,"selection-pivot",gfx::Rect(0,0,9,9),true);}

    }
    cv=baseCanvas;
    g.restore();
    paintSliceOverlay(g);paintViewRotationIndicator(g);
    g.restoreClip();

  }

void Editor::onPaint(ui::PaintEvent& ev) {

    auto& g=*ev.graphics();
    // Bounded opt-in evidence for transparent-child parent background replays.
    struct ReplayTrace {
      std::filesystem::path path;
      struct Sample{std::uint64_t calls=0;double total=0,maximum=0;};
      std::map<std::tuple<bool,int,int,int,int>,Sample> clips;
      ReplayTrace(){if(const auto value=_wgetenv(L"MOONSPRITE_REPAINT_TRACE"))path=value;}
      ~ReplayTrace(){if(path.empty())return;try{std::ofstream out(path);out<<"background\tx\ty\tw\th\tcalls\ttotal_ms\tmax_ms\n";for(const auto& item:clips){const auto& [bg,x,y,w,h]=item.first;out<<bg<<'\t'<<x<<'\t'<<y<<'\t'<<w<<'\t'<<h<<'\t'<<item.second.calls<<'\t'<<item.second.total<<'\t'<<item.second.maximum<<'\n';}}catch(...){}}
    };
    static ReplayTrace replayTrace;
    struct ReplayDuration {
      ReplayTrace::Sample* sample=nullptr;
      std::chrono::steady_clock::time_point start;
      ~ReplayDuration(){if(!sample)return;const auto ms=std::chrono::duration<double,std::milli>(std::chrono::steady_clock::now()-start).count();++sample->calls;sample->total+=ms;sample->maximum=std::max(sample->maximum,ms);}
    } replayDuration;
    if(!replayTrace.path.empty()){
      const auto r=g.getClipBounds();const auto key=std::make_tuple(ev.isTransparentBg(),r.x,r.y,r.w,r.h);
      if(replayTrace.clips.size()<4096 || replayTrace.clips.count(key)){replayDuration.sample=&replayTrace.clips[key];replayDuration.start=std::chrono::steady_clock::now();}
    }
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
 try{if(paletteFocused_){if(!cut)copyPaletteColors();return;}if(currentDocument().freeTileInstanceView()&&(!currentDocument().selection()||(freeTileInstancesPanel_&&freeTileInstancesPanel_->clipboardScope()))){auto clipboard=currentDocument().copyFreeTileInstances();if(!clipboard)return;freeTileInstanceClipboard_=std::move(clipboard);pixelClipboard_.captureStructuredCopyBaseline();layerClipboardSnapshot_.reset();celClipboardSnapshot_={};frameClipboardSnapshot_={};pixelClipboard_.clear();currentDocument().clearMaskClipboard();if(cut)currentDocument().deleteFreeTileInstances(currentDocument().selectedFreeTileInstances());refresh();return;}if(currentDocument().hasTilemapContent()&&currentDocument().layer().kind!="free-tile"&&currentDocument().selection()&&!mixedPixelCopyContext(cut))throw std::runtime_error("瓦片文档当前支持整图层、图层组、整帧与整单元格剪贴板");if(!selectionCommandOverride_&&!currentView().maskSlots.empty()){freeTileInstanceClipboard_.reset();copyMaskTimeline(cut);return;}if(!selectionCommandOverride_&&celClipboardContext()){if(cut)cutTimelineCels();else copyTimelineCels();return;}if(currentDocument().selection()){copySelectionPixels(cut);return;}if(!currentView().maskSlots.empty()){freeTileInstanceClipboard_.reset();copyMaskTimeline(cut);return;}currentDocument().clearMaskClipboard();if(celClipboardContext()){if(cut)cutTimelineCels();else copyTimelineCels();return;}if(currentView().frameSelection){if(cut)cutTimelineFrames();else copyTimelineFrames();return;}
 if(cut&&!currentDocument().canDeleteSelectedLayers())return;auto snapshot=currentDocument().copyLayerClipboard();freeTileInstanceClipboard_.reset();layerClipboardSnapshot_=std::move(snapshot);if(layerClipboardSnapshot_){std::vector<SelectionMask> rectangles;for(const auto& cel:layerClipboardSnapshot_->cels)if(cel.frameId==currentDocument().frame().id&&cel.surface){const auto& surface=*cel.surface;rectangles.push_back({surface.offsetX,surface.offsetY,surface.width,surface.height,{}});}pixelClipboard_.captureLayerCopyBaseline(new_document::layerSize(rectangles));celClipboardSnapshot_={};frameClipboardSnapshot_={};pixelClipboard_.clear();if(cut)currentDocument().deleteSelectedLayers();}refresh();}catch(const std::exception& e){showSaveError(e);}
}
void Editor::pasteEditorClipboard(){try{if(!paletteFocused_){const int target=runtimePreferences_.index("editing.pasteTarget.Select");if(target==1){menuCommands_.invoke("pasteAsNewLayer");return;}if(target==2){pasteAsNewDocument();return;}}if(!paletteFocused_&&(freeTileInstanceClipboard_||layerClipboardSnapshot_||hasApplicationCelClipboard()||hasApplicationFrameClipboard())){const auto external=pixelClipboard_.readSystemSelection();if(!pixelClipboard_.preferStructuredCopy(external)){{struct RestoreFrameScope{bool& current;bool before;~RestoreFrameScope(){current=before;}}restore{currentView().frameSelection,currentView().frameSelection};currentView().frameSelection=false;pasteSelectionPixels();}refresh();return;}}if(!paletteFocused_&&!freeTileInstanceClipboard_&&!layerClipboardSnapshot_&&!hasApplicationCelClipboard()&&!hasApplicationFrameClipboard()&&!currentDocument().hasMaskClipboard()&&currentDocument().layer().kind=="free-tile"&&currentDocument().activeMaskId().empty()){pasteSelectionPixels();return;}if(!paletteFocused_&&!currentDocument().selection()&&!layerClipboardSnapshot_&&!hasApplicationCelClipboard()&&!hasApplicationFrameClipboard()&&currentDocument().hasMaskClipboard()&&(!currentView().maskSlots.empty()||!currentDocument().timelineSelection().cels.empty())){
 bool external=false;if(GetClipboardSequenceNumber()!=currentDocument().maskClipboardSequence())try{external=bool(pixelClipboard_.read());}catch(...){}
 if(external){pasteSelectionPixels();return;}if(!currentView().maskSlots.empty()){const auto target=currentView().maskSlots.back();pasteMaskTimeline(target.first,target.second);return;}const auto* c=currentDocument().timeline().findCelById(currentDocument().timelineSelection().cels.back());if(c){pasteMaskTimeline(c->layerId,c->frameId);return;}}
 if(mixedPixelPasteContext()){pasteSelectionPixels();return;}if(currentDocument().hasTilemapContent()&&!paletteFocused_&&(!currentDocument().activeMaskId().empty()||!(freeTileInstanceClipboard_&&currentDocument().layer().kind=="free-tile"&&currentDocument().layer().freeTiles&&currentDocument().freeTileCel().freeTiles&&currentDocument().activeMaskId().empty())&&!(layerClipboardSnapshot_||(celClipboardContext()?!currentDocument().active()&&!currentDocument().selection()&&hasApplicationCelClipboard()&&!applicationCelSelectionOnly():currentView().frameSelection&&hasApplicationFrameClipboard()))))throw std::runtime_error("瓦片文档当前支持整图层、图层组、整帧与整单元格剪贴板");if(paletteFocused_){pastePaletteColors();return;}if(!currentDocument().activeMaskId().empty()){pasteSelectionPixels();return;}if(freeTileInstanceClipboard_&&currentDocument().layer().kind=="free-tile"&&currentDocument().layer().freeTiles&&currentDocument().freeTileCel().freeTiles&&currentDocument().activeMaskId().empty()){currentDocument().pasteFreeTileInstances(*freeTileInstanceClipboard_);selectionPropertiesActive_=false;currentView().freeTransform=false;currentView().pivot.reset();refresh();return;}if(layerClipboardSnapshot_){currentDocument().pasteLayerClipboard(*layerClipboardSnapshot_);currentView().virtualSlots.clear();currentView().virtualAnchor.reset();refresh();return;}if(celClipboardContext()){pasteTimelineCels();return;}if(currentView().frameSelection){pasteTimelineFrames();return;}pasteSelectionPixels();}catch(const std::exception& e){showSaveError(e);}}
}

namespace moon::editor {
void Editor::smokeMaskSelectionClipboard(){
 smoke_=true;homeOpen_=false;documentOpen_=true;paletteFocused_=false;currentView().frameSelection=false;currentPlayback().playing=false;replaceDocumentForSmoke(Document(4,2));currentDocument().fillSelectionOrCanvas(0xff112233);const auto cel=currentDocument().pixels();const auto owner=currentDocument().layer().id,frame=currentDocument().frame().id;auto require=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};
 require(currentDocument().createAttachedMask(owner,frame),"Mask clipboard UI fixture");currentDocument().clearTimelineSelection();currentDocument().previewSelection({});refresh();requestFocus();
 SelectionClipboard input;input.width=2;input.height=1;input.originX=1;input.originY=0;input.pixels={0x800000ff,0xff000000};input.mask={1,1};auto previous=pixelClipboard_.exchangeSystemImageReaderForSmoke([&]{return std::optional<SelectionClipboard>{input};});
 try{
  const auto baseline=timeline::resolvedMask(currentDocument().timeline().state(),owner,frame)->surface.pixels;const auto history=currentDocument().historyPosition();
  currentView().frameSelection=true;pasteEditorClipboard();require(currentDocument().floating()&&currentDocument().pixels()==cel,"Mask actual paste routing");require(currentTools().selectionTool&&currentDocument().historyPosition()==history,"Mask paste remains unconfirmed");
  ui::KeyMessage cancel(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&cancel);require(!currentDocument().floating()&&timeline::resolvedMask(currentDocument().timeline().state(),owner,frame)->surface.pixels==baseline,"Mask actual Escape baseline");
  pasteEditorClipboard();require(currentDocument().floating(),"Mask actual second paste");ui::KeyMessage confirm(ui::kKeyDownMessage,ui::kKeyEnter,ui::kKeyNoneModifier,0,0);onProcessMessage(&confirm);require(!currentDocument().floating()&&currentDocument().pixels()==cel,"Mask actual Enter target isolation");const auto committed=timeline::resolvedMask(currentDocument().timeline().state(),owner,frame)->surface.pixels;require(committed!=baseline,"Mask actual Enter commits pixels");
  require(currentDocument().historyPosition()==history+2,"Mask Enter content and deselect history");currentDocument().undo();currentDocument().undo();require(timeline::resolvedMask(currentDocument().timeline().state(),owner,frame)->surface.pixels==baseline,"Mask actual paste undo");currentDocument().redo();currentDocument().redo();require(timeline::resolvedMask(currentDocument().timeline().state(),owner,frame)->surface.pixels==committed,"Mask actual paste redo");
  currentView().frameSelection=false;currentDocument().clearTimelineSelection();currentDocument().previewSelection(SelectionMask{1,0,2,1,{}});startFreeSelectionTransform();require(currentDocument().floating()&&currentView().freeTransform,"Mask actual free transform entry");onProcessMessage(&cancel);require(!currentDocument().floating()&&timeline::resolvedMask(currentDocument().timeline().state(),owner,frame)->surface.pixels==committed,"Mask free transform Escape isolation");
  pixelClipboard_.exchangeSystemImageReaderForSmoke(std::move(previous));replaceDocumentForSmoke(Document());currentView().frameSelection=false;refresh();
 }catch(...){pixelClipboard_.exchangeSystemImageReaderForSmoke(std::move(previous));throw;}
}

void Editor::useSmoothTool(){
 if(currentDocument().active()||selectionDragging_||floatingDragging_)return;
 currentDocument().commitFloatingPaste();cancelStroke();currentTools().liquifyTool=false;liquifyResetPosition_.reset();currentTools().smoothTool=false;currentTools().airbrushTool=false;currentTools().rotateTool=currentTools().textTool=currentTools().moveTool=currentTools().selectionTool=currentTools().shapeTool=currentTools().eyedropperTool=currentTools().zoomTool=currentTools().gradientTool=currentTools().fillTool=currentTools().handTool=currentTools().eraser=false;currentTools().smoothTool=true;currentPlayback().playing=false;toolRowScroll_=0;refresh();
}
bool Editor::processSmoothInput(ui::Message* msg){
 if(!currentTools().smoothTool)return false;
 if(msg->type()!=ui::kMouseDownMessage&&msg->type()!=ui::kMouseMoveMessage&&msg->type()!=ui::kMouseUpMessage)return false;
 auto* m=static_cast<ui::MouseMessage*>(msg);auto point=canvasPoint(m->position());
 if(tileRepeatIdentity_==currentDocument().identity()&&currentView().tileRepeat!=repeat::Mode::Off){
  const auto mapped=repeat::map({double(point.x),double(point.y)},currentDocument().width(),currentDocument().height(),currentView().tileRepeat);
  if(mapped)point={int(mapped->local.x),int(mapped->local.y)};
  else if(smoothDragging_&&msg->type()==ui::kMouseUpMessage)point={smoothLast_.x,smoothLast_.y};
  else return canvasViewport().contains(m->position())||smoothDragging_;
 }
 if(spaceHeld_||currentTools().handTool||eyedropperHeld_||eyedropperGesture_.active()){if(smoothDragging_){cancelStroke();return true;}return false;}
 if(canvasViewport().contains(m->position()))smoothPointer_=m->position();else if(!smoothDragging_)smoothPointer_.reset();
 if(smoothDragging_){
  if(!hasCapture()||currentPlayback().playing||currentDocument().active()||!currentDocument().rasterToolsAvailable()||!currentDocument().layer().kind.empty()||!currentDocument().activeMaskId().empty()||!selectionEqual(currentDocument().selection(),smoothSelection_)||currentDocument().identity()!=smoothIdentity_||currentDocument().contentRevision()!=smoothContent_||currentDocument().layer().id!=smoothLayer_||currentDocument().frame().id!=smoothFrame_){smoothDragging_=false;smoothArea_={};if(hasCapture())releaseMouse();refresh();return true;}
  if(msg->type()==ui::kMouseMoveMessage||(msg->type()==ui::kMouseUpMessage&&m->button()==ui::kButtonLeft)){
   {dynamicsRasterDistance_=std::max(std::abs(point.x-smoothLast_.x),std::abs(point.y-smoothLast_.y));auto b=currentTools().smoothBrush;const auto resolved=resolveDynamics();b.size=resolved.size;smoothArea_.collect(currentDocument().width(),currentDocument().height(),smoothLast_,{point.x,point.y},b,dynamics::rounded(dynamics::wrapAngle(currentTools().smoothAngle+resolved.angle)),currentDocument().selection());}smoothLast_={point.x,point.y};
   if(msg->type()==ui::kMouseUpMessage){auto visited=std::move(smoothArea_.visited);smoothArea_={};smoothDragging_=false;if(hasCapture())releaseMouse();try{const bool changed=currentDocument().applySmoothBrush(visited,currentTools().smoothStrength,smoothStarted_);if(changed)usageStatistics_.recordDrawing(true,std::max<usage::Milliseconds>(1,usage::now()-usageStrokeStarted_));usageStrokeStarted_=0;}catch(const std::exception& e){status_=unicodeText(e.what());}refresh();}else invalidateRect(canvasViewport());
  }return true;
 }
 if(msg->type()==ui::kMouseDownMessage&&canvasViewport().contains(m->position())){
  if(!m->left()||currentPlayback().playing||currentDocument().active()||!currentDocument().rasterToolsAvailable()||!currentDocument().layer().kind.empty()||!currentDocument().activeMaskId().empty()||!canvasDocumentContains(m->position()))return true;
  hideTimelineSelectionGuides();paletteFocused_=false;requestFocus();currentPlayback().playing=false;smoothDragging_=true;smoothStarted_=std::chrono::steady_clock::now();usageStrokeStarted_=usage::now();smoothIdentity_=currentDocument().identity();smoothContent_=currentDocument().contentRevision();smoothLayer_=currentDocument().layer().id;smoothFrame_=currentDocument().frame().id;smoothSelection_=currentDocument().selection();smoothLast_={point.x,point.y};smoothArea_={};{auto b=currentTools().smoothBrush;const auto resolved=resolveDynamics(true);b.size=resolved.size;smoothArea_.collect(currentDocument().width(),currentDocument().height(),smoothLast_,smoothLast_,b,dynamics::rounded(dynamics::wrapAngle(currentTools().smoothAngle+resolved.angle)),currentDocument().selection());}captureMouse();invalidateRect(canvasViewport());return true;
 }
 if(msg->type()==ui::kMouseMoveMessage){invalidateRect(canvasViewport());return canvasViewport().contains(m->position());}
 return msg->type()==ui::kMouseUpMessage&&canvasViewport().contains(m->position());
}
void Editor::paintSmoothCoverage(ui::Graphics& g,const gfx::Rect& cv){
 if(!currentTools().smoothTool||!smoothPointer_||currentPlayback().playing||currentDocument().active()||!currentDocument().rasterToolsAvailable()||!currentDocument().layer().kind.empty()||!currentDocument().activeMaskId().empty()||spaceHeld_||currentTools().handTool||eyedropperHeld_||eyedropperGesture_.active()||!canvasOwnsPointer(*smoothPointer_))return;
 auto coverage=smoothArea_;auto p=canvasPoint(*smoothPointer_);const auto mode=tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off;
 if(mode!=repeat::Mode::Off){const auto mapped=repeat::map({double(p.x),double(p.y)},currentDocument().width(),currentDocument().height(),mode);if(!mapped)return;p={int(mapped->local.x),int(mapped->local.y)};}
 coverage.collect(currentDocument().width(),currentDocument().height(),{p.x,p.y},{p.x,p.y},currentTools().smoothBrush,currentTools().smoothAngle,currentDocument().selection(),true);const double scale=canvasScale();
 auto draw=[&](int x,int y){const int l=int(std::round(cv.x+x*scale)),t=int(std::round(cv.y+y*scale)),r=int(std::round(cv.x+(x+1)*scale)),b=int(std::round(cv.y+(y+1)*scale));g.fillRect(gfx::rgba(230,0,255,89),gfx::Rect(l,t,std::max(1,r-l),std::max(1,b-t)));};
 for(const auto copy:repeat::offsets(mode)){
  g.saveClip();if(mode!=repeat::Mode::Off)g.clipRect(gfx::Rect(cv.x+copy.x*cv.w,cv.y+copy.y*cv.h,cv.w,cv.h));
  for(auto key:coverage.visited)draw(int(key%currentDocument().width())+copy.x*currentDocument().width(),int(key/currentDocument().width())+copy.y*currentDocument().height());
  if(mode==repeat::Mode::Off)for(auto [x,y]:coverage.outsidePreview)draw(x,y);
  g.restoreClip();
 }
}


void Editor::paintAirbrushPreview(ui::Graphics& g,const gfx::Rect& cv){
 if(!currentTools().airbrushTool||!paletteMousePosition_||spaceHeld_||eyedropperHeld_||!canvasOwnsPointer(*paletteMousePosition_)||!canvasViewport().contains(*paletteMousePosition_)||(airbrushDragging_&&!runtimePreferences_.flag("cursor.drawingBrushPreviewEnabled")))return;
 const auto* previewSource=currentDocument().activeSurfaceIfPresent();
 const auto axes=currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile"?SymmetryAxes{}:currentDocument().symmetryAxes;
 auto pointer=canvasPoint(*paletteMousePosition_);const auto mode=tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off;const auto mapped=repeat::map({double(pointer.x),double(pointer.y)},currentDocument().width(),currentDocument().height(),mode);if(!mapped)return;pointer={int(mapped->local.x),int(mapped->local.y)};
 auto previewPoints=[&](SymmetryPixel p){auto points=symmetryPoints(p,currentDocument().width(),currentDocument().height(),axes,currentDocument().symmetryCenter(),mode==repeat::Mode::Off);if(mode!=repeat::Mode::Off)for(auto& q:points){const auto local=repeat::wrap({double(q.x),double(q.y)},currentDocument().width(),currentDocument().height(),mode);q={int(local.x),int(local.y)};}points.erase(std::remove_if(points.begin(),points.end(),[&](auto q){return q.x<0||q.y<0||q.x>=currentDocument().width()||q.y>=currentDocument().height();}),points.end());return points;};
 auto center=gridSnapPoint(pointer);BrushOptions scatter;scatter.size=currentTools().airbrushSettings.scatterRadius*2+1;std::unordered_set<std::size_t> area;for(auto row:brushSpans(scatter,129))for(int x=row.left;x<=row.right;++x)for(auto p:previewPoints({center.x-scatter.size/2+x,center.y-scatter.size/2+row.y}))if(!airbrushDragging_||!currentDocument().selection()||selectionContains(currentDocument().selection(),p.x,p.y))area.insert(std::size_t(p.y)*currentDocument().width()+p.x);
 const double z=canvasScale();auto box=[&](int x,int y){int l=int(std::round(cv.x+x*z)),t=int(std::round(cv.y+y*z));return gfx::Rect(l,t,std::max(1,int(std::round(cv.x+(x+1)*z))-l),std::max(1,int(std::round(cv.y+(y+1)*z))-t));};auto inside=[&](int x,int y){return x>=0&&y>=0&&x<currentDocument().width()&&y<currentDocument().height()&&area.count(std::size_t(y)*currentDocument().width()+x);};
 for(auto key:area){int x=int(key%currentDocument().width()),y=int(key/currentDocument().width());auto r=box(x,y);auto pixel=(previewSource?raster::readWorld(*previewSource,x,y):Pixel(0));const auto color=(299*(pixel&255)+587*((pixel>>8)&255)+114*((pixel>>16)&255))/1000>145?gfx::rgba(0,0,0,255):gfx::rgba(255,255,255,255);if(!inside(x-1,y))g.fillRect(color,{r.x,r.y,1,r.h});if(!inside(x+1,y))g.fillRect(color,{r.x2()-1,r.y,1,r.h});if(!inside(x,y-1))g.fillRect(color,{r.x,r.y,r.w,1});if(!inside(x,y+1))g.fillRect(color,{r.x,r.y2()-1,r.w,1});}
 BrushOptions particle;particle.size=currentTools().airbrushSettings.particleRadius*2-1;particle.shape=currentTools().airbrushSettings.shape;const auto footprint=selectionBrushFootprint(particle,particle.shape==BrushShape::Round?0:currentTools().airbrushSettings.angle);for(auto row:footprint.spans)for(int x=row.left;x<=row.right;++x)for(auto p:previewPoints({center.x-footprint.width/2+x,center.y-footprint.height/2+row.y}))if(!airbrushDragging_||!currentDocument().selection()||selectionContains(currentDocument().selection(),p.x,p.y)){auto value=brushComposite((previewSource?raster::readWorld(*previewSource,p.x,p.y):Pixel(0)),strokeColor_?strokeColor_:ink_,100);g.fillRect(gfx::rgba(value&255,(value>>8)&255,(value>>16)&255,value>>24),box(p.x,p.y));}
}

}

namespace moon::editor {
bool Editor::drawingAnchorEligible()const{return (currentTools().selectionTool&&currentTools().selectionKind<=1)||(currentTools().shapeTool&&(currentTools().shapeKind==ShapeKind::Rectangle||currentTools().shapeKind==ShapeKind::RectangleOutline||currentTools().shapeKind==ShapeKind::Ellipse||currentTools().shapeKind==ShapeKind::EllipseOutline));}
bool Editor::drawingAnchorActive()const{return currentView().drawFromCanvasCenter&&drawingAnchorEligible();}
TransformPoint Editor::drawingAnchorPoint()const{return {std::floor(currentView().drawingAnchor.x*currentDocument().width()*2+.5)/2,std::floor(currentView().drawingAnchor.y*currentDocument().height()*2+.5)/2};}
void Editor::setDrawingAnchor(TransformPoint point){if(!std::isfinite(point.x)||!std::isfinite(point.y))return;currentView().drawingAnchor={std::floor(point.x*2+.5)/2/currentDocument().width(),std::floor(point.y*2+.5)/2/currentDocument().height()};saveBrushPreferences();invalidateRect(canvasViewport());}
void Editor::showDrawingAnchorPopup(){if(drawingAnchorActive()&&!currentDocument().active())showSelectionPivotPopup(true);}
void Editor::layoutDrawingAnchor(int& x){if(!drawingAnchorEligible())return;x+=4;for(auto control:{drawingAnchorButton_,drawingAnchorPresetButton_}){placePropertyControl(control,x,15);control->setVisible(true);control->setEnabled(pending_==Pending::None&&!currentDocument().active()&&!selectionDragging_&&!floatingDragging_&&!shapeDragging_);x+=15+uiGap;}drawingAnchorButton_->active=currentView().drawFromCanvasCenter;drawingAnchorPresetButton_->setEnabled(drawingAnchorButton_->isEnabled()&&currentView().drawFromCanvasCenter);}
}
