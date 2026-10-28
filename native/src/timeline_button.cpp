#include "timeline_button.h"
#include "ui_scale.h"
#include "color_picker_layout.h"
#include "ui/paint_event.h"
#include "ui/graphics.h"
namespace moon {
void TimelineButton::paintTimelineContent(ui::Graphics& g,gfx::Rect rc,gfx::Point physicalOffset) {
  UiPaintScale scale(g,physicalOffset);
    const bool row=skinStyle=="timeline-row";const bool material=skin_.draw(g,row?"timeline.row":"timeline.button",rc);if(!material)g.fillRect(skin_[row?"timelineBackground":"panel"],rc);
    // Timeline states tint only the cell interior; grid and glyphs stay intact.
    if(row && (active || timelineBackgroundHover))skin_.draw(g,timelineBackgroundHover?"timeline.hover":"timeline.active",gfx::Rect(rc.x+1,rc.y+1,rc.w-1,rc.h-1));
    auto textBounds=rc;
    if(row){
      // Fill all ancestor bands before painting any shared grid borders.
      for(const auto& color:timelineAncestorColors){
        const int width=std::min(timelineIndentWidth,std::max(0,textBounds.w));
        if(color&&(*color>>24)){auto c=*color;g.fillRect(gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,c>>24),{textBounds.x,textBounds.y,width,textBounds.h});}
        textBounds.x+=width;textBounds.w-=width;
      }
      if(timelineDisplayColor&&(*timelineDisplayColor>>24)){auto c=*timelineDisplayColor;g.fillRect(gfx::rgba(c&255,(c>>8)&255,(c>>16)&255,c>>24),textBounds);}
    }
    if(!row && !material){g.drawRect(skin_["timelineGrid"],rc);g.drawRect(skin_["timelineEdge"],gfx::Rect(rc.x+1,rc.y+1,rc.w-2,rc.h-2));}
    if(iconSkin && !icon.empty())iconSkin->draw(g,icon+(isEnabled()?"":"-disabled"),gfx::Rect(rc.x+1+(rc.w-12)/2,rc.y+1+(rc.h-12)/2,11,11),true);
    if(timelineCel)skin_.draw(g,"timeline.dot",gfx::Rect(rc.x+(rc.w-7)/2+1,rc.y+(rc.h-7)/2+1,7,7),true);
    if(active && !row)g.drawRect(skin_["accent"],gfx::Rect(rc.x+1,rc.y+1,rc.w-2,rc.h-2));
    if(row){
      auto band=rc;
      for(std::size_t level=0;level<timelineAncestorColors.size()&&band.w>0;++level){
        const int width=std::min(timelineIndentWidth,band.w);
        const auto color=timelineAncestorColors[level];
        if(color&&(*color>>24)){
          // Colored ancestors remain continuous; only close a finished group.
          g.fillRect(skin_["timelineGrid"],{band.x,band.y,1,band.h});
          if(timelineNextRowDepth<=int(level))g.fillRect(skin_["timelineGrid"],{band.x,band.y2(),width+1,1});
        }else skin_.draw(g,"timeline.cell",gfx::Rect(band.x,band.y,width+1,band.h+1));
        band.x+=width;band.w-=width;
      }
    }
    if(row && textBounds.w>0)skin_.draw(g,"timeline.cell",gfx::Rect(textBounds.x,textBounds.y,textBounds.w+1,textBounds.h+1));
    if(timelineImage){const int side=std::min(rc.w,rc.h)-2;const gfx::Rect target(rc.x+(rc.w-side)/2,rc.y+(rc.h-side)/2,side,side);g.drawSurface(timelineImage.get(),gfx::Rect(0,0,timelineImage->width(),timelineImage->height()),target,os::Sampling(),nullptr);}
    if(!caption.empty()){
      g.saveClip();g.clipRect(textBounds);
      const auto ink=font_.inkBounds(caption);
      const int x=centerCaption?rc.x+1+(rc.w-1-ink.w)/2-ink.x:rc.x+1+timelineCaptionPadding-(timelineCaptionPadding?ink.x:0);
      const int y=centerCaption?rc.y+1+(rc.h-1-ink.h)/2-ink.y:rc.y+(rc.h-10)/2;
      auto inkColor=skin_["timelineInk"];
      if(row&&timelineDisplayColor&&(*timelineDisplayColor>>24)){
        const auto c=*timelineDisplayColor;const int alpha=c>>24;const auto base=skin_[active||timelineBackgroundHover?"background":"timelineBackground"];
        auto blend=[&](int foreground,int background){return (foreground*alpha+background*(255-alpha)+127)/255;};
        inkColor=pickerLightMarker(blend(c&255,gfx::getr(base)),blend((c>>8)&255,gfx::getg(base)),blend((c>>16)&255,gfx::getb(base)))?gfx::rgba(255,255,255):gfx::rgba(0,0,0);
      }
      font_.draw(g,caption,x,y,inkColor);g.restoreClip();
    }return;
  }

void TimelineButton::onPaint(ui::PaintEvent& ev){
  if(skinStyle!="timeline" && skinStyle!="timeline-row"){PixelButton::onPaint(ev);return;}
  if(timelineParentPainted)return;
  auto& g=*ev.graphics();
  const auto viewport=paletteViewport?std::optional<gfx::Rect>(paletteViewport().offset(-bounds().origin())):std::nullopt;
  g.saveClip();if(viewport)g.clipRect(*viewport);
  paintTimelineContent(g,uiLogical(clientBounds()));g.restoreClip();
}
}
