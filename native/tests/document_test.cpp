#include "document.h"
#include "canvas_view.h"
#include <cstdlib>
#include <iostream>
#include <limits>
#include <stdexcept>
#define CHECK(x) do { if (!(x)) throw std::runtime_error(#x); } while (false)
using namespace moon;
constexpr Pixel ink = 0xff3379ff;
void dot(Document& d, int x, int y, Pixel p = ink) { d.beginStroke({x,y},p); d.commitStroke(); }
int main() {
  try {
    // legacy canvas-render-brush-path.test: preview equals a committed footprint
    // while leaving source pixels, selection, revisions and history untouched.
    for(auto shape:{BrushShape::Round,BrushShape::Square,BrushShape::Line})for(int size:{1,2,7,16})for(bool erasing:{false,true}){
      Document d(24,18);if(erasing){d.beginStroke({12,9},ink,{64,100,BrushShape::Square});d.commitStroke();}
      const auto before=d.pixels();const auto revision=d.contentRevision(),history=d.historySize();const bool dirty=d.dirty();
      const BrushOptions brush{size,47,shape};const auto preview=d.brushPreview({2,3},{20,12},erasing?0:ink,brush);
      CHECK(d.pixels()==before && d.contentRevision()==revision && d.historySize()==history && d.dirty()==dirty);
      d.beginStroke({2,3},erasing?0:ink,brush);d.updateStroke({20,12});d.commitStroke();auto expected=before;for(auto [i,p]:preview)expected[i]=p;CHECK(expected==d.pixels());
    }
    {Document d(8,4);d.previewSelection(SelectionMask{0,0,1,1,{}});CHECK(d.brushPreview({4,2},{4,2},ink,{}).empty());CHECK(d.brushPreview({4,2},{4,2},ink,{},nullptr,0,nullptr,false).size()==1);}
    {Document d(8,4);PatternBrush b;b.width=2;b.height=1;b.coverage={255,255};b.colors={0x800000ff,0xff00ff00};
      for(bool erase:{false,true}){auto before=d.pixels();auto preview=d.brushPreview({1,1},{6,2},erase?0:ink,{1,50},&b,90);d.beginStroke({1,1},erase?0:ink,{1,50},&b,90);d.updateStroke({6,2});d.commitStroke();for(auto [i,p]:preview)before[i]=p;CHECK(before==d.pixels());}}
    {Document d(16,12);d.symmetryAxes={true,true};auto preview=d.brushPreview({2,2},{7,5},ink,{3,50});d.beginStroke({2,2},ink,{3,50});d.updateStroke({7,5});d.commitStroke();std::vector<Pixel> expected(16*12);for(auto [i,p]:preview)expected[i]=p;CHECK(expected==d.pixels());}
    {Document d(2,1);dot(d,0,0);d.addLayer();const auto layer=d.layer().id;dot(d,1,0);d.selectTimelineLayer(layer);d.selectFrameHeader(d.frame().id,1);d.commitSelection({},SelectionMask{0,0,1,1,{}});const auto before=d.frame().id;const auto h=d.historySize();d.addFrame(true);const auto made=d.frame().id;CHECK(made!=before && d.pixels()[1]==ink && !d.selection() && d.selectedFrames().empty() && d.timelineSelection().cels.empty() && d.timelineSelection().layers==std::vector<std::string>{layer} && d.historySize()==h+1);d.undo();CHECK(d.frame().id==before && !d.selection() && d.selectedFrames().empty());d.redo();CHECK(d.frame().id==made && d.pixels()[1]==ink && !d.selection());d.selectTimelineCel(d.cel().id);d.commitSelection({},SelectionMask{0,0,2,1,{}});d.addFrame();CHECK(d.pixels()[0]==0 && d.pixels()[1]==0 && !d.selection() && d.timelineSelection().cels.empty() && d.timelineSelection().celAnchor.empty() && d.frameSelectionAnchor().empty());}
    {Document d(1,1);d.addFrame();d.addFrame();const auto frames=d.timeline().state().frames;d.selectFrameHeader(frames.front().id);d.selectFrameHeader(frames.back().id,2);const auto history=d.historySize();d.deleteSelectedFrames();CHECK(d.timeline().state().frames.size()==1 && d.timeline().state().frames.front().id==frames.back().id && d.selectedFrames().empty() && d.historySize()==history+1);d.undo();CHECK(d.timeline().state().frames.size()==3);d.redo();CHECK(d.timeline().state().frames.size()==1);}
    {Document d(1,1);for(int i=0;i<4;++i)d.addLayer();const auto layers=d.timeline().state().layers;d.selectTimelineLayer(layers[1].id);d.selectTimelineLayer(layers[3].id,1);d.selectLayer(layers[0].id);const auto selection=d.timelineSelection().layers;const auto h=d.historySize();CHECK(d.canDeleteSelectedLayers());d.deleteSelectedLayers();CHECK(d.timeline().state().layers.size()==3 && d.layer().id==layers[4].id && d.timelineSelection().layers==std::vector<std::string>{layers[4].id} && d.historySize()==h+1);d.undo();CHECK(d.timeline().state().layers.size()==5 && d.layer().id==layers[0].id && d.timelineSelection().layers==selection);d.redo();d.undo();d.selectTimelineLayer(layers[2].id);d.selectLayer(layers[0].id);d.deleteSelectedLayers();CHECK(d.timeline().state().layers.size()==4 && d.layer().id==layers[3].id);d.undo();d.selectLayer(layers[2].id);d.setLayerLocked(true);d.selectTimelineLayer(layers[2].id);d.selectLayer(layers[0].id);CHECK(!d.canDeleteSelectedLayers() && d.canDeleteLayers());const auto locked=d.historySize();d.deleteSelectedLayers();CHECK(d.historySize()==locked && d.timeline().state().layers.size()==5);d.clearTimelineSelection();CHECK(!d.canDeleteSelectedLayers());d.deleteLayer();CHECK(d.timeline().state().layers.size()==4);}
    {
      Document d(1,1);d.addLayer();d.addLayer();d.addFrame();const auto original=d.timeline().state().layers;const auto frame=d.frame().id;
      d.selectTimelineLayer(original[1].id);d.selectTimelineLayer(original[2].id,1);d.selectLayer(original[2].id);const auto selection=d.timelineSelection();const auto h=d.historySize();d.addLayer();const auto made=d.layer().id;
      CHECK(d.timeline().state().layers[1].id==made && d.frame().id==frame && d.timelineSelection().layers.empty() && d.timelineSelection().cels.empty() && d.selectedFrames().empty() && d.historySize()==h+1);
      CHECK(d.timeline().findCel(made,frame) && d.pixels()[0]==0 && !d.layer().locked && d.layer().visible && d.layer().opacity==1);
      d.undo();CHECK(d.timeline().state().layers.size()==3 && d.layer().id==original[0].id && d.timelineSelection().layers.empty());d.redo();CHECK(d.layer().id==made && d.timeline().state().layers[1].id==made && d.timelineSelection().layers.empty());
      d.selectFrameHeader(frame);d.selectLayer(original[2].id);d.addLayer();CHECK(d.timeline().state().layers.front().id==d.layer().id && d.selectedFrames().empty());
      d.selectTimelineCel(d.timeline().findCel(original[2].id,frame)->id);d.addLayer();CHECK(d.timeline().state().layers.front().id==d.layer().id && d.timelineSelection().cels.empty());
    }
    {Document d(1,1);const auto first=d.layer().id;d.addLayer();const auto second=d.layer().id;const auto active=d.layer().id;d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);const auto selected=d.timelineSelection();const auto history=d.historySize();d.beginLockGesture();d.previewLockGesture(first,true);d.previewLockGesture(second,true);d.previewLockGesture(second,false);CHECK(d.historySize()==history && d.commitLockGesture());CHECK(d.historySize()==history+1 && d.timeline().state().layers[1].locked && !d.timeline().state().layers[0].locked && d.layer().id==active && d.timelineSelection().layers==selected.layers);d.undo();CHECK(!d.timeline().state().layers[1].locked);d.redo();CHECK(d.timeline().state().layers[1].locked);d.beginLockGesture();d.previewLockGesture(first,false);d.previewLockGesture(first,true);CHECK(!d.commitLockGesture() && d.historySize()==history+1);d.selectLayer(first);dot(d,0,0);CHECK(d.pixels()[0]==0 && d.historySize()==history+1);d.beginLockGesture();d.previewLockGesture(first,false);CHECK(d.commitLockGesture());dot(d,0,0);CHECK(d.pixels()[0]==ink);}
    {
      Document d(1,1);const auto first=d.layer().id;d.setLayerOpacity(.3);d.addLayer();const auto second=d.layer().id;d.setLayerOpacity(.7);d.addLayer();const auto locked=d.layer().id;d.setLayerLocked(true);
      d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);d.selectTimelineLayer(locked,1);const auto selection=d.timelineSelection().layers;const auto history=d.historySize();
      auto opacity=[&](const std::string& id){for(const auto& l:d.timeline().state().layers)if(l.id==id)return l.opacity;throw std::runtime_error("missing opacity layer");};
      d.beginLayerOpacity();d.previewLayerOpacity(.5);CHECK(opacity(first)==.5 && opacity(second)==.5 && opacity(locked)==1 && d.historySize()==history);d.cancelLayerOpacity();CHECK(opacity(first)==.3 && opacity(second)==.7 && !d.active());
      d.beginLayerOpacity();d.previewLayerOpacity(std::numeric_limits<double>::quiet_NaN());CHECK(opacity(first)==.3);d.previewLayerOpacity(-1);d.commitLayerOpacity();CHECK(opacity(first)==0 && opacity(second)==0 && opacity(locked)==1 && d.historySize()==history+1 && d.timelineSelection().layers==selection);d.undo();CHECK(opacity(first)==.3 && opacity(second)==.7 && d.layer().id==locked);d.redo();CHECK(opacity(first)==0 && opacity(second)==0);
      d.beginLayerOpacity();d.previewLayerOpacity(0);d.commitLayerOpacity();CHECK(d.historySize()==history+1);
      d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);d.selectLayer(locked);d.beginLayerOpacity();d.previewLayerOpacity(.9);d.commitLayerOpacity();CHECK(opacity(first)==0 && opacity(second)==0 && opacity(locked)==1 && d.historySize()==history+1);
      d.addLayer();const auto outside=d.layer().id;d.beginLayerOpacity();d.previewLayerOpacity(2);d.previewLayerOpacity(.8);d.commitLayerOpacity();CHECK(opacity(outside)==.8 && opacity(first)==0 && opacity(second)==0);
    }
    {Document d(1,1);const auto first=d.layer().id;d.addLayer();const auto second=d.layer().id;const auto active=d.layer().id;d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);const auto selected=d.timelineSelection();const auto history=d.historySize();d.beginVisibilityGesture();d.previewVisibilityGesture(first,false);d.previewVisibilityGesture(second,false);d.previewVisibilityGesture(second,true);CHECK(d.historySize()==history && d.commitVisibilityGesture());CHECK(d.historySize()==history+1 && !d.timeline().state().layers[1].visible && d.timeline().state().layers[0].visible && d.layer().id==active && d.timelineSelection().layers==selected.layers);d.undo();CHECK(d.timeline().state().layers[1].visible);d.redo();CHECK(!d.timeline().state().layers[1].visible);d.beginVisibilityGesture();d.previewVisibilityGesture(first,true);d.previewVisibilityGesture(first,false);CHECK(!d.commitVisibilityGesture() && d.historySize()==history+1);}

    {
      Document d(1,1);d.addFrame();d.addFrame();const auto frames=d.timeline().state().frames;
      d.selectFrameHeader(frames[0].id);d.selectFrameHeader(frames[1].id,1);d.selectFrame(frames[2].id);const auto selected=d.selectedFrames();const auto h=d.historySize();
      d.beginFrameDuration();d.previewFrameDuration(250);CHECK(d.timeline().state().frames[0].duration==100 && d.timeline().state().frames[1].duration==100 && d.frame().duration==250);d.commitFrameDuration();CHECK(d.historySize()==h+1 && d.selectedFrames()==selected);d.undo();CHECK(d.frame().duration==100);d.redo();CHECK(d.frame().duration==250);
      d.selectFrame(frames[0].id);d.beginFrameDuration();d.previewFrameDuration(0);d.commitFrameDuration();const auto noOp=d.historySize();d.beginFrameDuration();d.previewFrameDuration(70000);d.previewFrameDuration(375);d.commitFrameDuration();CHECK(d.historySize()==noOp+1 && d.timeline().state().frames[0].duration==375 && d.timeline().state().frames[1].duration==375 && d.timeline().state().frames[2].duration==250);d.undo();CHECK(d.timeline().state().frames[0].duration==100 && d.timeline().state().frames[1].duration==100);d.redo();CHECK(d.selectedFrames()==selected);
      d.beginFrameDuration();d.previewFrameDuration(375);const auto unchanged=d.historySize();d.commitFrameDuration();CHECK(d.historySize()==unchanged);d.beginFrameDuration();d.previewFrameDuration(-10);CHECK(d.frame().duration==1);d.previewFrameDuration(70000);CHECK(d.frame().duration==60000);d.commitFrameDuration();
    }
    {Document d(1,1);const auto first=d.layer().id;d.addLayer();const auto second=d.layer().id;const auto active=d.layer().id;d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);const auto selected=d.timelineSelection();const auto history=d.historySize();d.beginAutoLinkGesture();d.previewAutoLinkGesture(first,true);d.previewAutoLinkGesture(second,true);d.previewAutoLinkGesture(second,false);CHECK(d.historySize()==history && d.commitAutoLinkGesture());CHECK(d.historySize()==history+1 && d.timeline().state().layers[1].autoLinkAnimationCels && !d.timeline().state().layers[0].autoLinkAnimationCels && d.layer().id==active && d.timelineSelection().layers==selected.layers);d.undo();CHECK(!d.timeline().state().layers[1].autoLinkAnimationCels);d.redo();CHECK(d.timeline().state().layers[1].autoLinkAnimationCels);d.beginAutoLinkGesture();d.previewAutoLinkGesture(first,false);d.previewAutoLinkGesture(first,true);CHECK(!d.commitAutoLinkGesture() && d.historySize()==history+1);}

    {
      Document d(1,1);const auto first=d.frame().id;d.addFrame();const auto second=d.frame().id;d.addFrame();const auto third=d.frame().id;d.selectFrame(first);auto history=d.historySize();CHECK(!d.selectedFramesDisabled());CHECK(d.setSelectedFramesDisabled(true));CHECK(d.frame().disabled && d.frame().id==first && d.historySize()==history+1);CHECK(!d.setSelectedFramesDisabled(true));d.selectFrameHeader(first);d.selectFrameHeader(second,1);CHECK(!d.selectedFramesDisabled());history=d.historySize();CHECK(d.setSelectedFramesDisabled(true));CHECK(d.selectedFramesDisabled() && d.historySize()==history+1);d.undo();CHECK(d.timeline().state().frames[0].disabled && !d.timeline().state().frames[1].disabled);d.redo();d.copySelectedFrames();CHECK(d.pasteCopiedFrames());CHECK(d.timeline().state().frames[2].disabled && d.timeline().state().frames[3].disabled);CHECK(!d.timeline().state().frames.back().disabled);CHECK(d.setSelectedFramesDisabled(false));CHECK(!d.selectedFramesDisabled());d.undo();CHECK(d.selectedFramesDisabled());
      auto state=d.timeline().state();PaletteState palette=d.palette();auto reopened=Document::fromImported(1,1,state,palette,"disabled",U"disabled",std::make_shared<const std::vector<std::uint8_t>>());CHECK(reopened.timeline().state().frames.front().disabled);
      timeline::LoopSection section;section.id="disabled-loop";section.startFrameId=first;section.endFrameId=third;auto ids=timeline::loopPlaybackFrames(state,section);CHECK(ids.size()==1 && ids.front()==third);section.direction="reverse";CHECK(timeline::loopPlaybackFrames(state,section)==ids);
    }

    {
      Document d(1,1);auto layer=d.layer().id;dot(d,0,0,0xff112233);auto first=d.frame().id;auto root=d.cel().id;d.addLinkedFrame();auto linked=d.frame().id;auto alias=d.cel().id;d.addFrame();auto blank=d.frame().id;auto blankCel=d.cel().id;
      d.selectTimelineCel(d.timeline().findCel(layer,blank)->id);d.selectTimelineCel(root,1);const auto anchor=d.timelineSelection().celAnchor;auto history=d.historySize();CHECK(d.canReverseSelectedCels() && d.reverseSelectedCels());CHECK(d.historySize()==history+1);CHECK(anchor==root);CHECK(d.timelineSelection().celAnchor==blankCel);CHECK(d.timeline().findCel(layer,blank)->id==root && d.timeline().findCel(layer,first)->surface->pixels[0]==0);CHECK(d.timeline().findCelById(alias)->linkedCelId==root && d.timeline().resolveSurface(alias).surface->pixels[0]==0xff112233);CHECK(d.timeline().findCelById(alias)->frameId==linked);d.undo();CHECK(d.timeline().findCel(layer,first)->id==root);d.redo();CHECK(d.timeline().findCel(layer,blank)->id==root);d.setLayerLocked(true);history=d.historySize();CHECK(!d.canReverseSelectedCels() && !d.reverseSelectedCels() && d.historySize()==history);
    }

    {
      Document d(1,1);const auto layer=d.layer().id;const auto first=d.cel().id;d.addFrame();const auto center=d.cel().id;const auto centerFrame=d.frame().id;d.addFrame();const auto last=d.cel().id;
      d.selectTimelineCel(last);CHECK(!d.canReverseSelectedCels() && !d.reverseSelectedCels());d.selectTimelineCel(center,1);d.selectTimelineCel(first,1);const auto frames=d.timeline().state().frames;CHECK(d.reverseSelectedCels());CHECK(d.timeline().findCelById(center)->frameId==centerFrame);CHECK(d.timelineSelection().celAnchor==last);for(std::size_t i=0;i<frames.size();++i)CHECK(d.timeline().state().frames[i].id==frames[i].id && d.timeline().state().frames[i].duration==frames[i].duration);
    }


    {
      // Frame clipboard inserts after the final selected slot and activates first.
      Document d(1,1);for(int i=1;i<4;++i)d.addFrame();const auto frames=d.timeline().state().frames;
      d.selectFrame(frames[0].id);dot(d,0,0);d.selectFrameHeader(frames[0].id);CHECK(d.copySelectedFrames() && d.hasFrameClipboard());
      d.selectFrameHeader(frames[3].id);d.selectFrameHeader(frames[1].id,1);const auto before=d.selectedFrames();const auto active=d.frame().id;const auto h=d.historySize();
      CHECK(d.pasteCopiedFrames());CHECK(d.timeline().state().frames[3].id==frames[3].id && d.activeFrameIndex()==4 && d.pixels()[0]==ink && d.historySize()==h+1);
      CHECK(d.selectedFrames().empty() && d.timelineSelection().cels==std::vector<std::string>{d.cel().id});d.undo();CHECK(d.frame().id==active && d.selectedFrames()==before && d.timelineSelection().cels.empty());d.redo();CHECK(d.activeFrameIndex()==4 && d.timelineSelection().cels==std::vector<std::string>{d.cel().id});d.undo();
      d.selectFrameHeader(frames[2].id);d.selectFrameHeader(frames[0].id,1);CHECK(d.copySelectedFrames());d.selectFrameHeader(frames[3].id);CHECK(d.pasteCopiedFrames());CHECK(d.activeFrameIndex()==4 && d.selectedFrames().size()==2 && d.timelineSelection().cels.empty());CHECK(d.timeline().state().frames[4].id==d.frame().id);d.undo();CHECK(d.selectedFrames()==std::vector<std::string>{frames[3].id});d.redo();CHECK(d.activeFrameIndex()==4 && d.selectedFrames().size()==2);
    }
    {
      Document d(1,1);auto layer=d.layer().id;dot(d,0,0,0xff112233);auto first=d.frame().id;d.addFrame();auto empty=d.frame().id;d.addFrame();dot(d,0,0,0xff445566);auto middle=d.frame().id;d.addFrame();dot(d,0,0,0xff778899);auto last=d.frame().id;
      d.selectTimelineCel(d.timeline().findCel(layer,last)->id);d.selectTimelineCel(d.timeline().findCel(layer,first)->id,1);auto history=d.historySize();CHECK(d.canConnectSelectedCels() && d.connectSelectedCels());CHECK(d.historySize()==history+1);auto root=d.timeline().findCel(layer,first)->id;CHECK(d.timeline().findCel(layer,last)->linkedCelId==root && d.timeline().findCel(layer,empty)->linkedCelId==root);CHECK(!d.timeline().findCel(layer,middle)->linkedCelId && d.timeline().resolveSurface(d.timeline().findCel(layer,middle)->id).surface->pixels[0]==0xff445566);d.selectFrame(last);dot(d,0,0,0xffabcdef);d.selectFrame(first);CHECK(d.pixels()[0]==0xffabcdef);d.undo();d.undo();CHECK(!d.timeline().findCel(layer,last)->linkedCelId && !d.timeline().findCel(layer,empty)->linkedCelId);d.redo();CHECK(d.timeline().findCel(layer,last)->linkedCelId==root && !d.connectSelectedCels());
      Document blank(1,1);auto one=blank.cel().id;blank.addFrame();blank.selectTimelineCel(one);blank.selectTimelineCel(blank.cel().id,1);CHECK(!blank.canConnectSelectedCels() && !blank.connectSelectedCels());
    }

    {
      // workspace-animation-reverse.test.ts: contiguous and sparse selected slots.
      for(const auto& indexes:std::vector<std::vector<int>>{{0,1,2,3,4},{0,2,4}}){
        Document d(1,1);for(int i=1;i<5;++i)d.addFrame();
        auto original=d.timeline().state().frames;
        for(int i=0;i<5;++i){d.selectFrame(original[i].id);d.setFrameDuration(80+i*10);dot(d,0,0,ink+i);}
        original=d.timeline().state().frames;
        timeline::LoopSection loop;loop.name=U"reverse";loop.startFrameId=original[0].id;loop.endFrameId=original[2].id;d.createLoopSection(loop);
        d.selectFrameHeader(original[indexes[0]].id);for(std::size_t i=1;i<indexes.size();++i)d.selectFrameHeader(original[indexes[i]].id,1);
        const auto selection=d.selectedFrames();const auto active=d.frame().id;const auto history=d.historySize();
        CHECK(d.canReverseSelectedFrames());d.reverseSelectedFrames();auto expected=original;
        for(std::size_t i=0;i<indexes.size();++i)expected[indexes[i]]=original[indexes[indexes.size()-1-i]];
        auto verify=[&](const auto& frames){for(int i=0;i<5;++i){CHECK(d.timeline().state().frames[i].id==frames[i].id);CHECK(d.timeline().state().frames[i].duration==frames[i].duration);d.selectFrame(original[i].id);CHECK(d.pixels()[0]==ink+i);}d.selectFrame(active);};
        verify(expected);CHECK(d.historySize()==history+1);CHECK(d.frame().id==active);
        CHECK(d.timeline().state().loopSections[0].startFrameId==expected[0].id && d.timeline().state().loopSections[0].endFrameId==expected[2].id);
        const auto afterSelection=d.selectedFrames();d.undo();verify(original);CHECK(d.selectedFrames()==selection);CHECK(d.timeline().state().loopSections[0].startFrameId==original[0].id);
        d.redo();verify(expected);CHECK(d.selectedFrames()==afterSelection);
        d.clearFrameSelection();const auto noOp=d.historySize();CHECK(!d.canReverseSelectedFrames());d.reverseSelectedFrames();CHECK(d.historySize()==noOp);
        d.selectFrameHeader(active);d.reverseSelectedFrames();CHECK(d.historySize()==noOp);
      }
      Document linked(1,1);dot(linked,0,0);const auto root=linked.cel().id;const auto first=linked.frame().id;linked.addLinkedFrame();const auto alias=linked.cel().id;const auto last=linked.frame().id;
      linked.selectFrameHeader(first);linked.selectFrameHeader(last,1);linked.reverseSelectedFrames();CHECK(linked.timeline().state().frames.front().id==last);CHECK(linked.timeline().findCelById(alias)->linkedCelId==root);CHECK(linked.timeline().resolveSurface(alias).surface->pixels[0]==ink);
      linked.undo();CHECK(linked.timeline().state().frames.front().id==first && linked.timeline().findCelById(alias)->linkedCelId==root);linked.redo();CHECK(linked.timeline().findCelById(alias)->linkedCelId==root);
    }
    {
      Document d(1,1);dot(d,0,0,0xff123456);auto root=d.cel().id;auto first=d.frame().id;d.addLinkedFrame();auto alias=d.cel().id;auto second=d.frame().id;d.addLinkedFrame();auto third=d.cel().id;
      d.selectTimelineCel(alias);auto history=d.historySize();CHECK(d.canDisconnectSelectedCels() && d.disconnectSelectedCels());CHECK(d.historySize()==history+1 && !d.timeline().findCelById(alias)->linkedCelId && d.timeline().findCelById(third)->linkedCelId);d.selectFrame(second);dot(d,0,0,0xffabcdef);d.selectFrame(first);CHECK(d.pixels()[0]==0xff123456);d.undo();d.undo();CHECK(d.timeline().findCelById(alias)->linkedCelId);
      d.selectTimelineCel(root);history=d.historySize();CHECK(d.canDisconnectSelectedCels() && d.disconnectSelectedCels());CHECK(!d.timeline().findCelById(alias)->linkedCelId && !d.timeline().findCelById(third)->linkedCelId);CHECK(d.timeline().resolveSurface(alias).surface->pixels[0]==0xff123456);d.undo();CHECK(d.timeline().findCelById(alias)->linkedCelId && d.timeline().findCelById(third)->linkedCelId);d.redo();CHECK(!d.canDisconnectSelectedCels() && !d.disconnectSelectedCels());
    }

    {
      // clipboard-service clearAnimation when copy finds no selected cells.
      Document d(1,1);dot(d,0,0,0xff123456);d.selectTimelineCel(d.cel().id);CHECK(d.copySelectedCels() && d.hasCelClipboard());
      d.clearTimelineSelection();const auto history=d.historySize();const auto revision=d.contentRevision();CHECK(!d.copySelectedCels());CHECK(!d.hasCelClipboard() && d.exportCelClipboard().items.empty());CHECK(!d.pasteCopiedCels());CHECK(d.historySize()==history && d.contentRevision()==revision && d.pixels()[0]==0xff123456);
      d.selectFrameHeader(d.frame().id);CHECK(d.copySelectedFrames());d.clearTimelineSelection();CHECK(!d.copySelectedCels());CHECK(!d.pasteCopiedFrames());
    }

    {
      Document source(2,1);dot(source,0,0,0x80112233);auto first=source.frame().id;source.addLinkedFrame();auto second=source.frame().id;
      source.selectTimelineCel(source.timeline().findCel(source.layer().id,first)->id);source.selectTimelineCel(source.timeline().findCel(source.layer().id,second)->id,1);CHECK(source.copySelectedCels());auto snapshot=source.exportCelClipboard();source.selectFrame(first);dot(source,0,0,0xffabcdef);
      Document target(2,1);target.selectTimelineCel(target.cel().id);auto history=target.historySize();CHECK(target.pasteCelClipboard(snapshot));CHECK(target.timeline().state().frames.size()==2 && target.historySize()==history+1);
      const auto& frames=target.timeline().state().frames;auto a=target.timeline().findCel(target.layer().id,frames[0].id);auto b=target.timeline().findCel(target.layer().id,frames[1].id);CHECK(a->id!=snapshot.items[0].cel.id && b->linkedCelId==a->id);CHECK(target.timeline().resolveSurface(b->id).surface->pixels[0]==0x80112233);target.undo();CHECK(target.timeline().state().frames.size()==1 && target.pixels()[0]==0);target.redo();CHECK(target.pixels()[0]==0x80112233);
      Document small(1,1);auto revision=small.contentRevision();bool failed=false;try{small.pasteCelClipboard(snapshot);}catch(const std::exception&){failed=true;}CHECK(failed && small.contentRevision()==revision && !small.canUndo());
      Document locked(2,1);locked.setLayerLocked(true);auto count=locked.historySize();failed=false;try{locked.pasteCelClipboard(snapshot);}catch(const std::exception&){failed=true;}CHECK(failed && locked.historySize()==count && locked.timeline().state().frames.size()==1);
    }

    {Document d(1,1);d.markSaved();CHECK(d.animationLoop());auto h=d.historySize();d.setAnimationLoop(false);CHECK(!d.animationLoop() && d.dirty() && d.historySize()==h+1);d.setAnimationLoop(false);CHECK(d.historySize()==h+1);d.undo();CHECK(d.animationLoop() && d.dirty());d.redo();CHECK(!d.animationLoop() && d.dirty());d.setAnimationLoop(true);CHECK(d.animationLoop());h=d.historySize();auto rev=d.revision();d.setAnimationLoop(true);CHECK(d.historySize()==h && d.revision()==rev);d.undo();CHECK(!d.animationLoop());d.redo();CHECK(d.animationLoop());}
    {Document d(1,1);dot(d,0,0,0xff123456);const auto first=d.frame().id;d.addLinkedFrame();const auto second=d.frame().id;d.addLinkedFrame();const auto third=d.frame().id;const auto layer=d.layer().id;d.selectTimelineCel(d.timeline().findCel(layer,first)->id);auto h=d.historySize();CHECK(d.cutSelectedCels());CHECK(d.historySize()==h+1 && d.pixels()[0]==0 && d.timelineSelection().cels.empty());CHECK(!d.timeline().findCel(layer,second)->linkedCelId);CHECK(d.timeline().findCel(layer,third)->linkedCelId==d.timeline().findCel(layer,second)->id);d.selectFrame(third);CHECK(d.pixels()[0]==0xff123456);d.undo();CHECK(d.timeline().findCel(layer,second)->linkedCelId==d.timeline().findCel(layer,first)->id && d.timelineSelection().cels.empty());d.redo();d.selectTimelineCel(d.timeline().findCel(layer,first)->id);CHECK(d.pasteCopiedCels() && d.pixels()[0]==0xff123456);d.selectTimelineCel(d.timeline().findCel(layer,third)->id);CHECK(d.cutSelectedCels() && d.pixels()[0]==0);d.selectFrame(second);CHECK(d.pixels()[0]==0xff123456);d.setLayerLocked(true);d.selectTimelineCel(d.cel().id);auto rev=d.revision();bool rejected=false;try{d.cutSelectedCels();}catch(const std::runtime_error&){rejected=true;}CHECK(rejected && d.revision()==rev && d.pixels()[0]==0xff123456);d.setLayerLocked(false);d.selectTimelineCel(d.timeline().findCel(layer,third)->id);CHECK(d.cutSelectedCels());CHECK(d.timelineSelection().cels.empty());}
    {
      Document d(1,1);auto first=d.frame().id;auto bottom=d.layer().id;dot(d,0,0,0xff101010);d.addLayer();auto top=d.layer().id;dot(d,0,0,0xff202020);d.addFrame();auto second=d.frame().id;dot(d,0,0,0xff303030);
      d.selectTimelineCel(d.timeline().findCel(top,first)->id);d.selectTimelineCel(d.timeline().findCel(bottom,second)->id,1);CHECK(d.copySelectedCels());
      d.selectTimelineCel(d.timeline().findCel(top,second)->id);CHECK(d.pasteCopiedCels());CHECK(d.timeline().state().frames.size()==3);CHECK(d.timeline().resolveSurface(d.timeline().findCel(top,second)->id).surface->pixels[0]==0xff202020);auto third=d.timeline().state().frames[2].id;CHECK(d.timeline().resolveSurface(d.timeline().findCel(bottom,third)->id).surface->pixels[0]==0);d.undo();CHECK(d.timeline().state().frames.size()==2);
    }
    {
      Document d(1,1);auto layer=d.layer().id;dot(d,0,0,0xff112233);auto first=d.frame().id;d.addLinkedFrame();auto linked=d.frame().id;d.addFrame();auto empty=d.frame().id;
      d.selectTimelineCel(d.timeline().findCel(layer,linked)->id);CHECK(d.copySelectedCels());d.selectTimelineCel(d.timeline().findCel(layer,empty)->id);CHECK(d.pasteCopiedCels());CHECK(!d.cel().linkedCelId && d.pixels()[0]==0xff112233);
      d.selectTimelineCel(d.timeline().findCel(layer,empty)->id);dot(d,0,0,0xffabcdef);CHECK(d.copySelectedCels());d.selectTimelineCel(d.timeline().findCel(layer,first)->id);CHECK(d.pasteCopiedCels());CHECK(d.timeline().resolveSurface(d.timeline().findCel(layer,linked)->id).surface->pixels[0]==0xff112233);d.undo();CHECK(d.timeline().findCel(layer,linked)->linkedCelId);
    }
    {
      Document d(2,1);auto first=d.frame().id;auto layer=d.layer().id;dot(d,0,0,0xff123456);d.addFrame();auto second=d.frame().id;
      d.selectTimelineCel(d.timeline().findCel(layer,first)->id);CHECK(d.copySelectedCels());d.selectFrame(first);dot(d,0,0,0xffabcdef);d.deleteFrame();
      d.selectTimelineCel(d.timeline().findCel(layer,second)->id);auto history=d.historySize();CHECK(d.pasteCopiedCels());CHECK(d.pixels()[0]==0xff123456 && d.historySize()==history+1);d.undo();CHECK(d.pixels()[0]==0);d.redo();CHECK(d.pixels()[0]==0xff123456);
      d.setLayerLocked(true);auto revision=d.contentRevision();bool failed=false;try{d.pasteCopiedCels();}catch(const std::exception&){failed=true;}CHECK(failed && d.contentRevision()==revision);d.setLayerLocked(false);
    }
    {
      Document d(1,1);auto layer=d.layer().id;auto first=d.frame().id;dot(d,0,0,0xff556677);d.addLinkedFrame();auto second=d.frame().id;
      d.selectTimelineCel(d.timeline().findCel(layer,first)->id);d.selectTimelineCel(d.timeline().findCel(layer,second)->id,1);CHECK(d.copySelectedCels());
      d.selectTimelineCel(d.timeline().findCel(layer,second)->id);auto count=d.timeline().state().frames.size();CHECK(d.pasteCopiedCels());CHECK(d.timeline().state().frames.size()==count+1);
      const auto& frames=d.timeline().state().frames;auto a=d.timeline().findCel(layer,frames[1].id);auto b=d.timeline().findCel(layer,frames[2].id);CHECK(b->linkedCelId==a->id && d.timeline().resolveSurface(b->id).surface->pixels[0]==0xff556677);d.undo();CHECK(d.timeline().state().frames.size()==count);d.redo();CHECK(d.timeline().state().frames.size()==count+1);
    }

    {Document d(1,1);d.addLayer();d.addLayer();auto layers=d.timeline().state().layers;d.selectTimelineLayer(layers[0].id);d.selectTimelineLayer(layers[2].id,1);d.selectLayer(layers[0].id);d.setLayerLocked(true);auto history=d.historySize();d.deleteLayer();CHECK(d.timeline().state().layers.size()==3 && d.historySize()==history);d.setLayerLocked(false);d.selectTimelineLayer(layers[0].id);d.selectTimelineLayer(layers[2].id,2);history=d.historySize();d.deleteLayer();CHECK(d.timeline().state().layers.size()==3 && d.historySize()==history);d.selectTimelineLayer(layers[1].id,1);d.deleteLayer();CHECK(d.timeline().state().layers.size()==1);d.undo();CHECK(d.timeline().state().layers.size()==3 && d.timelineSelection().layers.size()==2);}
    {
      // workspace-cut.test.ts: full-frame clipboard survives cut, undo and redo.
      Document d(2,1);const auto first=d.frame().id;dot(d,0,0,0xff112233);d.setFrameDuration(275);
      d.addFrame();const auto second=d.frame().id;dot(d,1,0,0xff445566);
      d.selectFrameHeader(first);d.setLayerLocked(true);const auto history=d.historySize();
      CHECK(d.cutSelectedFrames());CHECK(d.timeline().state().frames.size()==1 && d.frame().id==second);
      CHECK(d.historySize()==history+1);d.undo();CHECK(d.timeline().state().frames.size()==2 && d.selectedFrames()==std::vector<std::string>{first});
      d.redo();CHECK(d.timeline().state().frames.size()==1);CHECK(d.pasteCopiedFrames());
      CHECK(d.frame().duration==275 && d.pixels()[0]==0xff112233);const auto pasted=d.frame().id;d.undo();CHECK(d.timeline().state().frames.size()==1 && d.timeline().state().cels.size()==d.timeline().state().layers.size());d.redo();CHECK(d.timeline().state().frames.size()==2 && d.frame().id==pasted && d.pixels()[0]==0xff112233);
      Document last(2,1);dot(last,1,0,0xff445566);
      // Last frame cannot be removed, but legacy still captures its clipboard.
      const auto one=last.frame().id;last.selectFrameHeader(one);const auto count=last.historySize();const auto revision=last.contentRevision();
      CHECK(!last.cutSelectedFrames());CHECK(last.frame().id==one && last.timeline().state().frames.size()==1 && last.historySize()==count && last.contentRevision()==revision);
      CHECK(last.pasteCopiedFrames());CHECK(last.pixels()[1]==0xff445566);
    }

    {
      Document d(2,2);const auto firstLayer=d.layer().id;const auto firstFrame=d.frame().id;
      CHECK(!d.layer().autoLinkAnimationCels);d.beginStroke({0,0},0xff123456);d.commitStroke();
      const auto source=d.cel().id;d.addLayer();const auto active=d.layer().id;
      d.setLayerAutoLinkAnimationCels(firstLayer,true);CHECK(d.layer().id==active);
      CHECK(d.timeline().state().layers[1].autoLinkAnimationCels);d.undo();CHECK(!d.timeline().state().layers[1].autoLinkAnimationCels);d.redo();
      d.addFrame();const auto second=d.frame().id;
      CHECK(d.timeline().findCel(firstLayer,second)->linkedCelId==source);CHECK(!d.cel().linkedCelId);
      d.selectLayer(firstLayer);d.beginStroke({1,1},0xffabcdef);d.commitStroke();d.selectFrame(firstFrame);CHECK(d.pixels()[3]==0xffabcdef);
      d.selectFrame(second);d.addFrame(true);CHECK(d.cel().linkedCelId==source);
      d.undo();CHECK(d.frame().id==second);d.redo();CHECK(d.cel().linkedCelId==source);
      d.setLayerAutoLinkAnimationCels(firstLayer,false);CHECK(d.cel().linkedCelId==source);d.addFrame(true);CHECK(!d.cel().linkedCelId);
      Document empty(1,1);empty.setLayerAutoLinkAnimationCels(empty.layer().id,true);empty.addFrame();CHECK(!empty.cel().linkedCelId);
    }
    {
      const auto builtin=Document::withBuiltinPalette();
      CHECK(builtin.palette().entries.size()==32 && builtin.palette().slots.size()==32);
      CHECK(builtin.palette().slots.front()==1 && builtin.palette().slots.back()==32 && builtin.palette().nextId==33);
      CHECK(builtin.paletteEntry(1)->color==0xffffffff && builtin.paletteEntry(2)->color==0xffeae0d9);
      CHECK(!builtin.dirty() && !builtin.canUndo() && builtin.palette().selected.empty());
    }
    {
      Document original(3,2);dot(original,1,1);const auto identity=original.identity();
      timeline::State imported{{original.layer()},{original.frame()},{original.cel()}};
      imported.layers[0].id="saved-layer";imported.cels[0].layerId="saved-layer";imported.cels[0].id="saved-cel";
      auto bytes=std::make_shared<const std::vector<std::uint8_t>>(std::vector<std::uint8_t>{1,2,3});
      auto candidate=Document::fromImported(3,2,imported,original.palette(),"saved-project",U"中文工程",bytes);
      CHECK(candidate.identity()!=identity && candidate.projectId()=="saved-project" && candidate.name()==U"中文工程");
      CHECK(candidate.pixels()==original.pixels() && !candidate.dirty() && !candidate.canUndo() && candidate.sourceArchive()==bytes);
      CHECK(candidate.cel().id=="saved-cel" && candidate.layer().id=="saved-layer");
      dot(candidate,0,0);candidate.undo();CHECK(candidate.dirty() && candidate.pixels()==original.pixels());
      imported.cels[0].surface->offsetX=1;bool refused=false;
      try {
    {Document d(1,1);const auto first=d.layer().id;d.addLayer();const auto second=d.layer().id;const auto active=d.layer().id;d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);const auto selected=d.timelineSelection();const auto history=d.historySize();d.beginLockGesture();d.previewLockGesture(first,true);d.previewLockGesture(second,true);d.previewLockGesture(second,false);CHECK(d.historySize()==history && d.commitLockGesture());CHECK(d.historySize()==history+1 && d.timeline().state().layers[1].locked && !d.timeline().state().layers[0].locked && d.layer().id==active && d.timelineSelection().layers==selected.layers);d.undo();CHECK(!d.timeline().state().layers[1].locked);d.redo();CHECK(d.timeline().state().layers[1].locked);d.beginLockGesture();d.previewLockGesture(first,false);d.previewLockGesture(first,true);CHECK(!d.commitLockGesture() && d.historySize()==history+1);d.selectLayer(first);dot(d,0,0);CHECK(d.pixels()[0]==0 && d.historySize()==history+1);d.beginLockGesture();d.previewLockGesture(first,false);CHECK(d.commitLockGesture());dot(d,0,0);CHECK(d.pixels()[0]==ink);}Document::fromImported(3,2,imported,original.palette(),"saved-project",U"test",bytes);} catch(const std::invalid_argument&){refused=true;}
      CHECK(refused && original.identity()==identity && original.dirty() && original.canUndo());
    }
    {Document d(1,1);const auto first=d.layer().id;const auto original=d.layer().name;d.addLayer();const auto second=d.layer().id;const auto secondName=d.layer().name;d.setLayerLocked(true);d.selectTimelineLayer(first);d.selectTimelineLayer(second,1);const auto selected=d.timelineSelection().layers;const auto history=d.historySize(),content=d.contentRevision();d.beginLayerProperties();d.previewLayerName(U"  新名称　");CHECK(d.layer().name==U"  新名称　" && d.historySize()==history && d.contentRevision()==content);d.previewLayerOpacity(.4);d.commitLayerOpacity();CHECK(d.historySize()==history+1 && d.layer().name==U"新名称" && d.timeline().state().layers[1].name==U"新名称" && d.layer().opacity==1 && d.timeline().state().layers[1].opacity==.4);d.undo();CHECK(d.layer().name==secondName && d.timeline().state().layers[1].name==original && d.timelineSelection().layers==selected);d.redo();d.beginLayerProperties();d.previewLayerName(U" \t\u3000");d.commitLayerOpacity();CHECK(d.historySize()==history+1 && d.layer().name==U"新名称");d.beginLayerProperties();d.previewLayerName(U"取消");d.cancelLayerOpacity();CHECK(d.layer().name==U"新名称");d.selectLayer(first);d.clearTimelineSelection();d.beginLayerProperties();d.previewLayerName(U"独立");d.commitLayerOpacity();CHECK(d.layer().name==U"独立" && d.timeline().state().layers[0].name==U"新名称");}
    {Document d(2,2);const auto rev=d.revision(),cr=d.contentRevision();d.beginLayerOpacity();for(int i=0;i<80;++i)d.previewLayerOpacity(i/100.0);CHECK(!d.dirty()&&d.historySize()==0&&d.revision()==rev&&d.contentRevision()>cr&&d.active());d.cancelLayerOpacity();CHECK(d.layer().opacity==1&&!d.dirty()&&!d.active());d.beginLayerOpacity();d.previewLayerOpacity(.2);d.previewLayerOpacity(.4);d.commitLayerOpacity();CHECK(d.historySize()==1&&d.dirty()&&d.layer().opacity==.4);d.undo();CHECK(d.layer().opacity==1);d.redo();CHECK(d.layer().opacity==.4);}
    {Document d(2,2);dot(d,0,0);const auto pixels=d.pixels();const auto h=d.historySize();d.setLayerOpacity(.5);CHECK(d.layer().opacity==.5 && d.pixels()==pixels && d.historySize()==h+1);d.undo();CHECK(d.layer().opacity==1);d.redo();CHECK(d.layer().opacity==.5);d.setLayerVisible(false);CHECK(!d.layer().visible);d.undo();CHECK(d.layer().visible);d.setLayerOpacity(2);CHECK(d.layer().opacity==1);const auto size=d.historySize();d.setLayerOpacity(1);CHECK(d.historySize()==size);}
    // legacy createDocument: first frame 100ms, stable layer/cel association,
    // initial cel and the drawing adapter expose the same pixel allocation.
    {
      Document doc(7,5),other(7,5);
      const auto layer=doc.layer().id,cel=doc.cel().id;
      CHECK(layer!=other.layer().id && cel!=other.cel().id);
      CHECK(doc.frame().id=="frame-1" && doc.frame().duration==100);
      CHECK(doc.cel().layerId==layer && doc.cel().frameId==doc.frame().id);
      CHECK(doc.cel().surface->width==7 && doc.cel().surface->height==5);
      CHECK(doc.cel().surface->offsetX==0 && doc.cel().surface->offsetY==0);
      CHECK(doc.layer().visible && !doc.layer().locked && doc.layer().opacity==1);
      CHECK(&doc.pixels()==&doc.cel().surface->pixels && !doc.dirty());
      dot(doc,2,3);const auto revision=doc.contentRevision();
      CHECK(doc.cel().surface->pixels[23]==ink && doc.dirty());
      doc.undo();CHECK(doc.cel().surface->pixels[23]==0 && doc.dirty());
      doc.redo();CHECK(doc.cel().surface->pixels[23]==ink && doc.contentRevision()>revision);
      doc.markSaved();doc.beginStroke({1,1},ink);doc.cancelStroke();
      CHECK(!doc.dirty() && doc.cel().surface->pixels[8]==0);
      CHECK(doc.layer().id==layer && doc.cel().id==cel && doc.cel().layerId==layer);
    }

    // Direct legacy integer ellipse golden mask and original-pixel coverage.
    {
      Document brush(12,12);BrushOptions options{5,100,BrushShape::Round};
      brush.beginStroke({6,6},ink,options);brush.commitStroke();
      const char* mask[]={"01110","11111","11111","11111","01110"};
      for(int y=0;y<5;++y) for(int x=0;x<5;++x) CHECK((brush.pixels()[(y+4)*12+x+4]==ink)==(mask[y][x]=='1'));
      brush.undo();options={4,100,BrushShape::Square};brush.beginStroke({0,0},ink,options);brush.commitStroke();
      for(int y=0;y<12;++y) for(int x=0;x<12;++x) CHECK((brush.pixels()[y*12+x]==ink)==(x<2 && y<2));
      brush.undo();options={4,100,BrushShape::Line};brush.beginStroke({6,6},ink,options);brush.commitStroke();
      for(int y=0;y<12;++y) for(int x=0;x<12;++x) CHECK((brush.pixels()[y*12+x]==ink)==(y==6 && x>=4 && x<8));
      brush.undo();options={1,50,BrushShape::Round};brush.beginStroke({3,3},0xff0000ff,options);brush.updateStroke({7,3});brush.updateStroke({3,3});brush.commitStroke();
      CHECK(brush.pixels()[3*12+4]==0x800000ff);CHECK(brush.historySize()==1);
      brush.beginStroke({3,3},0xff0000ff,options);brush.updateStroke({7,3});brush.cancelStroke();CHECK(brush.pixels()[3*12+4]==0x800000ff);
      brush.beginStroke({4,3},0,options);brush.commitStroke();CHECK(brush.pixels()[3*12+4]==0x400000ff);brush.undo();CHECK(brush.pixels()[3*12+4]==0x800000ff);
      const auto before=brush.pixels();options.opacity=0;brush.beginStroke({0,0},ink,options);CHECK(!brush.commitStroke());CHECK(brush.pixels()==before && brush.canRedo());
      CHECK(brushComposite(0xffff0000,0xff0000ff,50)==0xff7f0080);
      CHECK(brushComposite(0xff0000ff,0,100)==0);
      for(int size=1;size<=64;++size) for(auto shape:{BrushShape::Round,BrushShape::Square,BrushShape::Line}) {
        auto spans=brushSpans({size,100,shape});CHECK(!spans.empty());for(const auto& span:spans) CHECK(span.y>=0 && span.y<size && span.left>=0 && span.right<size);
      }
    }
    // Legacy workspace-palette-history.test.ts / PalettePanel.selection.test.ts:
    // stable duplicate IDs, allocator rollback, shared history and role isolation.
    {
      Document p;const auto pixels=p.pixels();const auto revision=p.contentRevision();
      CHECK(p.palette().order()==std::vector<int>({1,2}));
      CHECK(p.paletteEntry(1)->color==0xff211b18);CHECK(p.paletteEntry(2)->color==0xffff7929);
      p.selectPalette(1);p.selectPalette(2,true);CHECK(p.palette().selected==std::vector<int>({1,2}));
      p.selectPalette(2,true);CHECK(p.palette().primaryId==1);
      const auto primary=p.palette().primary;p.selectSecondaryPalette(2);CHECK(p.palette().primary==primary);
      CHECK(!p.dirty() && p.historySize()==0);
      const int duplicate=p.addPaletteColor(primary);CHECK(duplicate==3 && p.palette().nextId==4);
      CHECK(p.historySize()==1 && p.palette().primary==primary);
      p.undo();CHECK(p.palette().nextId==3 && !p.paletteEntry(3));p.redo();CHECK(p.paletteEntry(3)->color==primary);
      p.deletePaletteColors({1,3});CHECK(p.palette().order()==std::vector<int>({2}));
      CHECK(p.paletteEntry(1) && p.paletteEntry(3));CHECK(p.palette().slots[0]==0 && p.palette().slots[2]==0);
      p.undo();CHECK(p.palette().order()==std::vector<int>({1,2,3}));
      p.selectPalette(1);p.updatePaletteColor(1,ink);CHECK(p.palette().primary==ink);
      p.undo();CHECK(p.paletteEntry(1)->color==primary && p.palette().primary==primary);
      p.redo();CHECK(p.paletteEntry(1)->color==ink);
      p.renamePaletteColor(1,U"  名称  ");CHECK(p.paletteEntry(1)->name==U"名称");p.undo();CHECK(p.paletteEntry(1)->name==U"墨黑");p.redo();
      const auto count=p.historySize();p.renamePaletteColor(1,U"名称");p.updatePaletteColor(1,ink);CHECK(p.historySize()==count);
      CHECK(p.pixels()==pixels && p.contentRevision()==revision);
      dot(p,0,0);p.undo();CHECK(p.pixels()==pixels);p.undo();CHECK(p.paletteEntry(1)->name==U"墨黑");
      p.redo();p.redo();CHECK(p.pixels()[0]==ink);
      p.setPaletteRole(0xff123456,false,true);CHECK(p.paletteEntry(1)->color==ink);
      p.selectPalette(1);p.setPaletteRole(0xff654321,false,false);CHECK(p.paletteEntry(1)->color==0xff654321);
      p.undo();CHECK(p.paletteEntry(1)->color==ink);
      p.clearPaletteSelection();const auto original=p.palette().primary;
      const int transparent=p.addPaletteColor(0,false);CHECK(p.palette().selected.empty() && p.palette().primary==original);
      p.undo();p.redo();CHECK(p.palette().selected.empty() && p.palette().primary==original);
      CHECK(p.addPaletteColor(0,false)!=transparent);
      while(p.palette().order().size()<8) p.addPaletteColor(ink,false);
      const auto order=p.palette().order();p.selectPalette(order[1]);p.selectPaletteRange(order[6],4);
      CHECK(p.palette().selected==std::vector<int>({order[1],order[2],order[5],order[6]}));
    }
    {
      // legacy palette-duplicates.test.ts: holes must retain their grid positions.
      Document p;while(p.palette().order().size()<6) p.addPaletteColor(ink,false);
      p.deletePaletteColors({5});const auto slots=p.palette().slots;
      p.selectPalette(1);p.selectPaletteRange(6,3);
      CHECK(p.palette().selected==std::vector<int>({1,2,3,4,6}));
      p.selectPalette(1);p.selectPaletteSlotRange(4,3);
      CHECK(p.palette().selected==std::vector<int>({1,2,4}));
      CHECK(p.palette().primaryId==4 && p.palette().slots==slots);
      const int added=p.addPaletteColor(ink,false,7);
      CHECK(p.palette().slots[4]==0 && p.palette().slots[7]==added);
      p.undo();CHECK(p.palette().slots==slots && !p.paletteEntry(added));
      p.redo();CHECK(p.palette().slots[4]==0 && p.palette().slots[7]==added);
    }
    Document d; const auto empty = d.pixels();
    dot(d,3,4); CHECK(d.pixels()[4*32+3] == ink); CHECK(d.historySize()==1);
    d.undo(); CHECK(d.pixels()==empty); CHECK(d.dirty());
    d.redo(); CHECK(d.dirty()); d.markSaved(); CHECK(!d.dirty());
    d.beginStroke({1,2},ink); d.updateStroke({10,2}); d.commitStroke();
    for(int x=1;x<=10;++x) CHECK(d.pixels()[2*32+x]==ink);
    d.undo(); CHECK(d.dirty()); CHECK(d.canRedo());
    d.beginStroke({0,0},ink); d.updateStroke({31,31}); d.cancelStroke();
    CHECK(d.dirty()); CHECK(d.canRedo());
    dot(d,3,4); CHECK(d.canRedo()); // no-op must preserve redo
    dot(d,0,0,0); CHECK(d.canRedo());
    d.redo(); d.markSaved(); d.undo(); dot(d,6,6);
    CHECK(d.dirty()); CHECK(!d.canRedo()); // history navigation and subsequent edits remain dirty
    const auto before = d.pixels(); dot(d,3,4,0); CHECK(d.pixels()[4*32+3]==0);
    d.undo(); CHECK(d.pixels()==before);
    Document corner;
    corner.beginStroke({2,2},ink); corner.updateStroke({2,8}); corner.updateStroke({8,8}); corner.commitStroke();
    CHECK(corner.pixels()[6*32+2]==ink); CHECK(corner.pixels()[8*32+6]==ink); CHECK(corner.pixels()[5*32+5]==0);
    corner.undo(); CHECK(corner.pixels()==empty);
    Document edge;
    edge.beginStroke({-5,4},ink); edge.updateStroke({36,4}); edge.commitStroke();
    for(int y=0;y<32;++y) for(int x=0;x<32;++x) CHECK(edge.pixels()[y*32+x]==(y==4?ink:0));
    edge.undo(); edge.beginStroke({-3,-3},ink); edge.updateStroke({-1,35}); CHECK(!edge.commitStroke());
    CHECK(edge.pixels()==empty); CHECK(edge.canRedo());
    edge.beginStroke({std::numeric_limits<int>::min(),10},ink);
    edge.updateStroke({std::numeric_limits<int>::max(),10}); edge.commitStroke();
    CHECK(edge.pixels()[10*32]==ink); CHECK(edge.pixels()[10*32+31]==ink);
    Document diagonal;
    diagonal.beginStroke({0,0},ink); diagonal.updateStroke({32,3}); diagonal.commitStroke();
    CHECK(diagonal.pixels()[2*32+26]==ink); CHECK(diagonal.pixels()[3*32+26]==0);
    Document forward,reverse;
    forward.beginStroke({0,0},ink);forward.updateStroke({4,2});forward.commitStroke();
    reverse.beginStroke({4,2},ink);reverse.updateStroke({0,0});reverse.commitStroke();
    CHECK(forward.pixels()[1]==ink); CHECK(reverse.pixels()[33]==ink);
    CHECK(forward.pixels()!=reverse.pixels());
    const auto singlePass=forward.pixels();
    forward.beginStroke({0,0},ink);forward.updateStroke({4,2});CHECK(!forward.commitStroke());
    CHECK(forward.pixels()==singlePass);
    edge.beginStroke({0,0},ink); edge.undo(); CHECK(!edge.active());
    CHECK(floorDivide(-1,8)==-1); CHECK(floorDivide(7,8)==0); CHECK(floorDivide(8,8)==1);
    CHECK(nextCanvasScale(8,1)==10); CHECK(nextCanvasScale(8,-1)==6);
    CHECK(nextCanvasScale(1,-1)==0.666667); CHECK(nextCanvasScale(64,1)==64);
    CHECK(clampCanvasAxis(-999,10,300,100)==-40);
    CHECK(clampCanvasAxis(999,10,300,100)==260);
    CHECK(clampCanvasAxis(-999,10,300,600)==-440);
    CHECK(clampCanvasAxis(999,10,300,600)==160);
    CHECK(clampCanvasAxis(75,10,300,100)==75);
    CanvasPan pan;pan.begin({100,90},{25,-30});
    const auto dragged=pan.move({137,65});CHECK(dragged.x==62 && dragged.y==-55);
    CHECK(pan.origin.x==25 && pan.origin.y==-30); // cancellation origin stays intact
    pan.end();CHECK(!pan.active);
    for(double scale:canvasZoomLevels) for(int direction:{-1,1}) {
      const double next=nextCanvasScale(scale,direction);
      for(Point anchor:{Point{13,21},Point{-30,-20},Point{320,241}}) {
        const Point origin{-17,5};
        const auto moved=zoomedCanvasOrigin(origin,anchor,scale,next);
        CHECK(std::abs((anchor.x-moved.x)-double(anchor.x-origin.x)*next/scale)<=0.5);
        CHECK(std::abs((anchor.y-moved.y)-double(anchor.y-origin.y)*next/scale)<=0.5);
        if(next>=1) {
          const auto pixel=canvasPixel({moved.x+int(3*next),moved.y+int(4*next)},moved,next);
          CHECK(pixel.x==3 && pixel.y==4);
        }
        CHECK(canvasPixel({moved.x-1,moved.y-1},moved,next).x<0);
      }
    }
    // Direct legacy selection.ts forEachRasterLinePoint oracle, deliberately
    // different from the optimized bounded native implementation.
    for(int ax=-2;ax<10;++ax) for(int ay=-2;ay<10;++ay)
      for(int bx=-2;bx<10;++bx) for(int by=-2;by<10;++by) {
        Document actual(8,8);actual.beginStroke({ax,ay},ink);actual.updateStroke({bx,by});actual.commitStroke();
        std::vector<Pixel> expected(64);
        int x=ax,y=ay,dx=std::abs(bx-ax),dy=std::abs(by-ay),sx=ax<bx?1:-1,sy=ay<by?1:-1,error=dx-dy;
        while(true) {
          if(x>=0 && y>=0 && x<8 && y<8) expected[y*8+x]=ink;
          if(x==bx && y==by) break;
          const int doubled=error*2;
          if(doubled>-dy) {error-=dy;x+=sx;}
          if(doubled<dx) {error+=dx;y+=sy;}
        }
        CHECK(actual.pixels()==expected);
      }
    Document revisions(1024,1024);
    auto epoch=revisions.contentRevision();
    revisions.beginStroke({5,7},ink);
    CHECK(revisions.contentRevision()==epoch+1);
    CHECK(revisions.lastContentChange().w==1 && revisions.lastContentChange().h==1);
    revisions.updateStroke({5,7});CHECK(revisions.contentRevision()==epoch+1);
    revisions.cancelStroke();CHECK(revisions.contentRevision()==epoch+2 && !revisions.dirty());
    {
      Document p;while(p.palette().order().size()<8)p.addPaletteColor(ink,false);
      const auto before=p.palette().slots;const auto pixels=p.pixels();p.selectPaletteBox(0,5,4);
      CHECK(p.palette().selected==std::vector<int>({1,2,5,6}));
      const auto history=p.historySize();p.repositionPaletteColors(before,p.palette().selected,2,1,4);
      CHECK(p.palette().slots==std::vector<int>({3,4,1,2,7,8,5,6}));CHECK(p.historySize()==history+1);
      p.undo();CHECK(p.palette().slots==before);p.redo();CHECK(p.palette().slots[2]==1);
      p.undo();p.pastePaletteColors({0x00123456,0xffabcdef},{0,7});CHECK(p.paletteEntry(1)->color==0x00123456);CHECK(p.paletteEntry(8)->color==0xffabcdef);
      p.undo();CHECK(p.paletteEntry(1)->color!=0x00123456);p.redo();CHECK(p.paletteEntry(1)->color==0x00123456);CHECK(p.pixels()==pixels);
      p.deletePaletteColors({2});p.pastePaletteColors({0xff876543},{1});const auto added=p.palette().slots[1];CHECK(added!=2 && p.paletteEntry(added)->color==0xff876543);p.undo();CHECK(p.palette().slots[1]==0 && !p.paletteEntry(added));p.redo();CHECK(p.palette().slots[1]==added);
    }
    Document bounded(8,8,1,2);
    dot(bounded,1,1);dot(bounded,2,2);CHECK(bounded.historySize()==1);
    bounded.undo();CHECK(bounded.pixels()[9]==ink && bounded.pixels()[18]==0);
    bounded.redo();CHECK(bounded.pixels()[18]==ink);
    Document countBounded(8,8,100000,2);
    dot(countBounded,1,1);dot(countBounded,2,2);dot(countBounded,3,3);CHECK(countBounded.historySize()==2);
    CHECK(nextCanvasScale(0.0625,-1)==0.0625);
    bool rejected=false; try { Document invalid(0,32); } catch(const std::invalid_argument&) { rejected=true; } CHECK(rejected);
    std::cout << "PASS: transactions, cancel, no-op, corners, clipping, redo branches, saved identities, coordinates\n";
    return 0;
  } catch(const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
