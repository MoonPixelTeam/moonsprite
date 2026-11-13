#include "editor.h"
#include "isometric_settings_dialog.h"
#include "isometric_settings_json.h"
#include "ui_frame_capture.h"
#include "os/skia/skia_surface.h"
#include "include/core/SkShader.h"
namespace moon::editor {
void Editor::initializeIsometric(){
 if(auto it=runtimePreferences_.values.find("isoView.json");it!=runtimePreferences_.values.end())isoSettings_=iso::decodeSettings(it->second);
 auto available=[this]{return documentOpen_&&!homeOpen_&&pending_==Pending::None&&!historyGestureBusy()&&!isoSettingsOpen_;};
 menuCommands_.bind("perspectiveDefault",{[this]{currentView().isoViewEnabled=false;refresh();},available,[this]{return !currentView().isoViewEnabled;}});
 menuCommands_.bind("toggleIsoView",{[this]{currentView().isoViewEnabled=true;refresh();},available,[this]{return currentView().isoViewEnabled;}});
 menuCommands_.bind("openIsoViewSettings",{[this]{showIsometricSettings();},available,{}});
}
void Editor::saveIsometricSettings(iso::Settings value){
 value=iso::normalize(value);auto next=runtimePreferences_;next.values["isoView.json"]=iso::encodeSettings(value);
 if(!smoke_){if(!runtimePreferencesReadable_)throw std::runtime_error("原首选项读取失败，未覆盖");const auto text=next.encode();const auto path=palettePreferencePath().parent_path()/"editor-preferences.txt";std::filesystem::create_directories(path.parent_path());writeExportBytesAtomic(path,{text.begin(),text.end()});}
 runtimePreferences_=std::move(next);isoSettings_=value;refresh();
}
void Editor::showIsometricSettings(int verify){
 if(isoSettingsOpen_||!documentOpen_||homeOpen_||pending_!=Pending::None||historyGestureBusy())return;
 struct Scope{bool& open;Scope(bool& o):open(o){open=true;}~Scope(){open=false;}} scope(isoSettingsOpen_);
 std::vector<Pixel> palette;for(const auto& c:currentDocument().palette().entries)if(c.id)palette.push_back(c.color);
 IsometricSettingsDialog popup(font_,skin_,toolIcons_,isoSettings_,smoke_?assets_.parent_path()/"iso-color-smoke-size.txt":palettePreferencePath().parent_path()/"iso-color-size.txt",std::move(palette),[this](auto value){isoSettings_=value;invalidateRect(canvasViewport());},[this,verify](auto value){if(verify==3)throw std::runtime_error("ISO intentional save failure");saveIsometricSettings(value);});
 popup.setDisplay(display(),false);const auto area=canvasViewport();const auto floor=popup.minimumDialogSize(0);const gfx::Size size{std::max(400*uiScale,floor.w),floor.h};const auto screen=display()->bounds();popup.setBounds({std::clamp(area.x+12*uiScale,screen.x,std::max(screen.x,screen.x2()-size.w)),std::clamp(area.y+12*uiScale,screen.y,std::max(screen.y,screen.y2()-size.h)),size.w,size.h});
 if(!smoke_)popup.configureGeometry(palettePreferencePath().parent_path()/"iso-view-geometry.json");
 ui::Timer timer(90,&popup);std::exception_ptr failure;int step=0;const auto baseline=isoSettings_;
 if(verify){timer.Tick.connect([&]{try{if(step==0){popup.smokeStep(0);if(isoSettings_.stairStep!=3)throw std::runtime_error("ISO live preview");}else if(step==1){writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"isometric-dialog-smoke.bmp");popup.smokeStep(1);if(isoSettings_!=baseline)throw std::runtime_error("ISO preview off rollback");}else if(step==2){popup.smokeStep(4);}else {popup.smokeStep(verify==1?2:verify==2?3:verify==3?5:6);timer.stop();}++step;}catch(...){failure=std::current_exception();timer.stop();popup.closeWindow(nullptr);}});timer.start();}
 popup.openWindowInForeground();timer.stop();requestFocus();if(failure)std::rethrow_exception(failure);
}
void Editor::paintIsometricGuides(ui::Graphics& g,const gfx::Rect& cv){
 const auto clip=canvasPaintViewport(g.getClipBounds()).createIntersection(cv);if(clip.isEmpty())return;
 const double scale=canvasScale(),spacing=iso::isoGuideSpacingForZoom(currentView().zoom,isoSettings_.unitSize);
 const auto segments=iso::isoGuideSegments(currentDocument().width(),currentDocument().height(),{(clip.x-cv.x)/scale,(clip.y-cv.y)/scale,(clip.x2()-cv.x)/scale,(clip.y2()-cv.y)/scale},{spacing,isoSettings_.stairStep,{isoSettings_.originX,isoSettings_.originY}});if(segments.empty())return;
 const auto color=isoSettings_.color();if(!(color>>24))return;g.saveClip();g.clipRect(cv);
 const double w=isoSettings_.stairStep*spacing,h=spacing;
 if(isoSettings_.pixel&&currentView().zoom>=1&&w<=8192&&h<=8192&&w*h<=4*1024*1024){
  const auto rgb=color&0xffffff;
  if(!isoGuideTile_||isoGuideTileStep_!=isoSettings_.stairStep||isoGuideTileSpacing_!=spacing||isoGuideTileColor_!=rgb){
   const auto pattern=iso::isoGuidePixelPattern(isoSettings_.stairStep,spacing);auto tile=os::instance()->makeRgbaSurface(int(w),int(h));if(!tile)throw std::runtime_error("Cannot allocate ISO guide tile");tile->clear();{os::SurfaceLock lock(tile.get());for(auto p:pattern.pixels)tile->putPixel(gfx::rgba(rgb&255,(rgb>>8)&255,(rgb>>16)&255,255),int(p.x),int(p.y));}tile->setImmutable();isoGuideTile_=std::move(tile);isoGuideTileStep_=isoSettings_.stairStep;isoGuideTileSpacing_=spacing;isoGuideTileColor_=rgb;
  }
  const auto matrix=SkMatrix::MakeAll(float(scale),0,float(cv.x+isoSettings_.originX*scale+g.getInternalDeltaX()),0,float(scale),float(cv.y+isoSettings_.originY*scale+g.getInternalDeltaY()),0,0,1);
  ui::Paint paint(gfx::rgba(255,255,255,color>>24));paint.blendMode(os::BlendMode::SrcOver);paint.skPaint().setShader(static_cast<os::SkiaSurface*>(isoGuideTile_.get())->bitmap().makeShader(SkTileMode::kRepeat,SkTileMode::kRepeat,SkSamplingOptions(),matrix));g.drawRect(cv,paint);
 }else{
  gfx::Path path;for(const auto& line:segments){path.moveTo(cv.x+line.start.x*scale,cv.y+line.start.y*scale);path.lineTo(cv.x+line.end.x*scale,cv.y+line.end.y*scale);}
  ui::Paint paint(gfx::rgba(color&255,(color>>8)&255,(color>>16)&255,color>>24));paint.style(ui::Paint::Stroke);paint.strokeWidth(float(isoSettings_.thickness*uiScale));paint.antialias(true);paint.blendMode(os::BlendMode::SrcOver);g.drawPath(path,paint);
 }
 g.restoreClip();
}
Point Editor::isoSnapPoint(Point p)const{if(!isoGridSnapActive())return p;const auto q=iso::snapIsoPointToGridVertex({double(p.x),double(p.y)},isoSettings_.stairStep,isoSettings_.unitSize,{isoSettings_.originX,isoSettings_.originY});return {int(q.x),int(q.y)};}
iso::Point Editor::isoPointerAt(gfx::Point position,bool continuous)const{
 const auto at=canvasDocumentPoint(position);iso::Point p{at.x,at.y};if(!continuous)p={std::floor(p.x),std::floor(p.y)};
 // Legacy source editing consumes local pointer samples; raster strokes keep
 // repeated coordinates so the seam is rasterized before wrapping the stamps.
 if(currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile"){
  const auto local=repeat::wrap({p.x,p.y},currentDocument().width(),currentDocument().height(),tileRepeatIdentity_==currentDocument().identity()?currentView().tileRepeat:repeat::Mode::Off);p={local.x,local.y};
 }return p;
}
Point Editor::isoSnapBrush(gfx::Point position)const{
 if(!isoGridSnapActive()){if(isoLineAlignmentActive()&&currentDocument().activeMaskId().empty()&&currentDocument().layer().kind=="free-tile"){const auto p=isoPointerAt(position,false);return {int(p.x),int(p.y)};}return gridSnapBrush(canvasPoint(position));}const auto q=iso::snapIsoPointToGridVertex(isoPointerAt(position,true),isoSettings_.stairStep,isoSettings_.unitSize,{isoSettings_.originX,isoSettings_.originY});return {int(q.x),int(q.y)};
}
std::pair<Point,Point> Editor::resolveBrushLine(Point from,Point to,bool constrained)const{
 from=isoGridSnapActive()?isoSnapPoint(from):gridSnapPoint(from);
 if(isoGridSnapActive()){auto line=iso::isoGridLineSegment({double(from.x),double(from.y)},{double(to.x),double(to.y)},isoSettings_.stairStep);return {{int(line.from.x),int(line.from.y)},{int(line.to.x),int(line.to.y)}};}
 if(isoLineAlignmentActive()){const auto p=iso::isoLineEndpoint({double(from.x),double(from.y)},{double(to.x),double(to.y)},isoSettings_.stairStep);to={int(p.x),int(p.y)};}
 else if(constrained){auto p=constrainShapeLine({double(from.x),double(from.y)},{double(to.x),double(to.y)},runtimePreferences_.index("tools.lineDirectionStep.Number"));to={int(p.x),int(p.y)};}
 return {from,gridSnapPoint(to)};
}
void Editor::beginIsometricBrush(ui::MouseMessage* mouse,Point point,bool initial){
 isoBrushGrid_=isoGridSnapActive();isoBrushPath_.clear();isoHoveredEdge_.reset();
 // Grid tracing retains subpixel pointer coordinates; ordinary alignment uses pixels.
 isoBrushPointer_=isoBrushGrid_?isoPointerAt(mouse->position(),true):iso::Point{double(point.x),double(point.y)};
 isoBrushState_={};isoBrushState_.anchor=isoBrushState_.endpoint={double(point.x),double(point.y)};isoBrushState_.rawAnchor=isoBrushState_.rawEndpoint=isoBrushPointer_;isoBrushState_.directionSamples=0;
 const auto b=activeStrokeBrush();const auto value=dynamicsStroke_?dynamicsLast_:dynamics::Resolved{b.size,1,std::nullopt,0};
 isoBrushLast_={point.x,point.y,value.size,dynamics::rounded(b.opacity*value.opacity),dynamics::wrapAngle(currentTools().pencilImageBrushAngle+value.angle),currentTools().eraser?std::nullopt:value.gradient};
 if(!isoBrushGrid_){isoBrushPath_.push_back(isoBrushLast_);if(initial)currentDocument().paintAlignedStrokePath(isoBrushPath_,true);}
}
void Editor::updateIsometricBrush(ui::MouseMessage* mouse,Point point){
 const auto b=activeStrokeBrush();auto value=dynamicsStroke_?dynamics::resolve(currentTools().brushDynamics,dynamicsInput_,b.size):dynamics::Resolved{b.size,1,std::nullopt,0};
 const bool intrinsic=currentTools().pencilImageBrush&&currentTools().pencilImageBrush->intrinsicSize,pressure=currentTools().brushDynamics.effects[0].sensor==dynamics::Sensor::Pressure;
 if(intrinsic)value.size=b.size;
 auto smooth=[&](int start,iso::Point from,iso::Point to){return intrinsic||pressure?value.size:dynamics::smoothSize(start,value.size,b.size,std::max(std::abs(to.x-from.x),std::abs(to.y-from.y)));};
 BrushPathPoint target{point.x,point.y,value.size,dynamics::rounded(b.opacity*value.opacity),dynamics::wrapAngle(currentTools().pencilImageBrushAngle+value.angle),currentTools().eraser?std::nullopt:value.gradient};
 if(isoBrushGrid_){
  const auto pointer=isoPointerAt(mouse->position(),true);iso::TraceOptions options;options.stairStep=isoSettings_.stairStep;options.spacing=isoSettings_.unitSize;options.origin={isoSettings_.originX,isoSettings_.originY};options.hoveredEdgeKey=isoHoveredEdge_;
  const auto traced=iso::traceIsoGridPointerEdges(isoBrushPointer_,pointer,options);isoBrushPointer_=pointer;isoHoveredEdge_=traced.hoveredEdgeKey;
  for(const auto& edge:traced.edges){auto from=target;from.x=int(edge.from.x);from.y=int(edge.from.y);from.size=isoBrushLast_.size;from.opacity=isoBrushLast_.opacity;target.x=int(edge.to.x);target.y=int(edge.to.y);target.size=smooth(from.size,edge.from,edge.to);currentDocument().paintAlignedStrokePath({from,target},false);isoBrushLast_=target;}
 }else{
  if(isoBrushPath_.empty())return;const auto& anchor=isoBrushPath_[isoBrushPath_.size()>1?isoBrushPath_.size()-2:0];const auto& endpoint=isoBrushPath_.back();isoBrushState_.anchor={double(anchor.x),double(anchor.y)};isoBrushState_.endpoint={double(endpoint.x),double(endpoint.y)};
  const auto advanced=iso::advanceIsoAlignedStrokeSegment(isoBrushState_,isoPointerAt(mouse->position(),false),isoSettings_.stairStep);target.x=int(advanced.endpoint.x);target.y=int(advanced.endpoint.y);const bool locked=advanced.lockedEndpoint||advanced.lockedEndpoints&&!advanced.lockedEndpoints->empty();target.size=smooth(locked?endpoint.size:anchor.size,advanced.anchor,advanced.endpoint);iso::updateIsoAlignedStrokePath(isoBrushPath_,advanced,target);isoBrushState_=advanced;currentDocument().paintAlignedStrokePath(isoBrushPath_,true);isoBrushLast_=target;
 }
 dynamicsLast_={isoBrushLast_.size,value.opacity,value.gradient,value.angle};
}
void Editor::smokeIsometric(){
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;currentPlayback().playing=false;replaceDocumentForSmoke(Document(64,64));const auto settings=isoSettings_;const auto original=currentDocument().pixels();const auto history=currentDocument().historySize();
 auto require=[](bool ok,const char* reason){if(!ok)throw std::runtime_error(reason);};
 require(menuCommands_.invoke("toggleIsoView")&&currentView().isoViewEnabled,"ISO menu enable");menuCommands_.invoke("toggleIsoView");require(currentView().isoViewEnabled,"ISO menu selects rather than toggles");require(runShortcutCommand("toggleIsoView")&&!currentView().isoViewEnabled,"ISO shortcut toggle");menuCommands_.invoke("toggleIsoView");
 auto parsed=iso::decodeSettings(R"({"guideLineStyle":"pixel","guideOriginX":12.9,"guideOriginY":-4.9,"guideUnitSize":999,"guideThickness":20,"guideColors":{"solid":{"r":1,"g":2,"b":3,"a":4},"pixel":{"r":5,"g":6,"b":7,"a":8}},"snapToGrid":true})");require(parsed.originX==12&&parsed.originY==-4&&parsed.unitSize==256&&parsed.thickness==8&&parsed.solidColor==0x04030201&&parsed.pixelColor==0x08070605&&parsed.snapToGrid,"ISO legacy preference fixture");require(iso::decodeSettings(iso::encodeSettings(parsed))==parsed,"ISO preferences roundtrip");require(iso::decodeSettings("invalid")==iso::Settings{},"ISO malformed preferences");require(iso::decodeSettings(R"({"guideColor":{"r":41,"g":121,"b":255,"a":30}})").solidColor==0x1e14ff39,"ISO old blue preference migration");
 showIsometricSettings(1);require(isoSettings_==settings,"ISO cancel baseline");showIsometricSettings(2);require(isoSettings_.stairStep==3&&isoSettings_.pixel&&isoSettings_.snapToGrid&&isoSettings_.originX==-4,"ISO apply controls");require(iso::decodeSettings(runtimePreferences_.values.at("isoView.json"))==isoSettings_,"ISO stored settings");require(currentDocument().pixels()==original&&currentDocument().historySize()==history&&!currentDocument().dirty(),"ISO view must not mutate document");
 const auto applied=isoSettings_;showIsometricSettings(3);require(isoSettings_==applied,"ISO save failure/cancel baseline");showIsometricSettings(4);require(isoSettings_==applied,"ISO backdrop baseline");
 isoSettings_={};currentView().isoViewEnabled=true;currentView().rotation={};currentView().zoom=4;fitCanvas();refresh();
 // Verify the actual repeated shader against legacy pixel geometry, including
 // clip edges, shifted origin, alpha and Graphics' nonzero physical offset.
 for(double zoom:{1.,2.,4.})for(int delta:{0,7}){
  currentView().zoom=zoom;isoSettings_.pixel=true;isoSettings_.unitSize=8;isoSettings_.originX=-3;isoSettings_.originY=5;isoSettings_.pixelColor=0x80332211;
  const double scale=canvasScale();const gfx::Rect cv{11,13,int(64*scale),int(64*scale)};auto surface=os::instance()->makeRgbaSurface(cv.x2()+delta+3,cv.y2()+delta+3);surface->clear();
  {ui::Graphics graphics(nullptr,surface,delta,delta);paintIsometricGuides(graphics,cv);}
  const auto pattern=iso::isoGuidePixelPattern(2,8);os::SurfaceLock lock(surface.get());
  for(int y=0;y<surface->height();++y)for(int x=0;x<surface->width();++x){const gfx::Point p{x-delta,y-delta};bool expected=false;if(cv.contains(p)){const iso::Point local{iso::detail::modulo(std::floor((p.x-cv.x)/scale)-isoSettings_.originX,pattern.width),iso::detail::modulo(std::floor((p.y-cv.y)/scale)-isoSettings_.originY,pattern.height)};expected=std::find(pattern.pixels.begin(),pattern.pixels.end(),local)!=pattern.pixels.end();}const auto actual=surface->getPixel(x,y);require(gfx::geta(actual)==(expected?128:0),"ISO rendered pixel pattern and clip");if(expected)require(std::abs(gfx::getr(actual)-17)<=1&&std::abs(gfx::getg(actual)-34)<=1&&std::abs(gfx::getb(actual)-51)<=1,"ISO rendered guide color");}
 }
 commands_[1]->Click();currentTools().brushDynamics={};currentTools().pencilImageBrush.reset();currentTools().brushProfiles[0]={1,100,BrushShape::Square};currentTools().brushProfiles[1]={1,100,BrushShape::Square};isoSettings_={};currentView().zoom=4;fitCanvas();refresh();requestFocus();manager()->generateMessages();manager()->dispatchMessages();
 auto at=[&](double x,double y){return canvasDocumentToDisplay({x,y});};
 auto send=[&](ui::MessageType type,double x,double y){ui::MouseMessage message(type,os::PointerType::Mouse,ui::kButtonLeft,ui::kKeyNoneModifier,at(x,y));message.setDisplay(display());onProcessMessage(&message);if(type==ui::kMouseDownMessage&&currentDocument().strokeActive())enableFlags(ui::HAS_CAPTURE);if(type==ui::kMouseUpMessage)disableFlags(ui::HAS_CAPTURE);};
 isoSettings_.snapToGrid=true;send(ui::kMouseDownMessage,16.25,16.25);require(currentDocument().strokeActive()&&currentDocument().pixels()==original,"ISO actual grid mouse down no stamp");
 send(ui::kMouseMoveMessage,32.25,24.25);const auto edge=currentDocument().pixels();require(edge!=original,"ISO actual grid pointer paints edge");send(ui::kMouseMoveMessage,32.25,24.25);require(currentDocument().pixels()==edge,"ISO actual same edge hover");send(ui::kMouseUpMessage,32.25,24.25);require(currentDocument().historySize()==history+1&&!currentDocument().strokeActive(),"ISO actual mouse release commits once");currentDocument().undo();require(currentDocument().pixels()==original,"ISO actual undo");currentDocument().redo();require(currentDocument().pixels()==edge,"ISO actual redo");
 send(ui::kMouseDownMessage,16.25,32.25);send(ui::kMouseMoveMessage,32.25,40.25);ui::KeyMessage escape(ui::kKeyDownMessage,ui::kKeyEsc,ui::kKeyNoneModifier,0,0);onProcessMessage(&escape);require(!currentDocument().strokeActive()&&currentDocument().pixels()==edge,"ISO actual Escape rollback");disableFlags(ui::HAS_CAPTURE);
 isoSettings_.snapToGrid=false;send(ui::kMouseDownMessage,8.25,40.25);send(ui::kMouseMoveMessage,24.25,48.25);send(ui::kMouseMoveMessage,8.25,56.25);require(currentDocument().pixels()[48*64+24]==edge[48*64+24],"ISO actual alignment reconsideration clears old endpoint");send(ui::kMouseUpMessage,8.25,56.25);require(currentDocument().historySize()==history+2,"ISO actual aligned history");
 isoSettings_={};isoSettings_.pixel=true;currentView().zoom=4;fitCanvas();refresh();manager()->flushRedraw();manager()->dispatchMessages();manager()->flipAllDisplays();writeSmokeFrame(display()->nativeSurface().get(),assets_.parent_path()/"isometric-guides-smoke.bmp");
 isoSettings_=settings;currentView().isoViewEnabled=false;replaceDocumentForSmoke(Document());refresh();
}
}
