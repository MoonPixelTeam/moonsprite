#include "panel_docking.h"
#include <sstream>
#include <stdexcept>
#include <iostream>
using namespace moon::panels;
static void check(bool value){if(!value)throw std::runtime_error("Panel docking regression");}
int main(){
 try{
  Model m;std::array<bool,4> visible{true,true,true,true};Rect area{20,38,820,429};
  auto initial=m.layout(area,visible);check(initial.panel[0].x==20&&initial.panel[2].y+initial.panel[2].h==467);
  m.place(1,Dock::Left,m.groupOf(0),true,true);check(m.groups.size()==3&&m.groupOf(0)==m.groupOf(1));check(!m.shown(0,visible)&&m.shown(1,visible));
  auto grouped=m.layout(area,visible);check(grouped.panel[0]==grouped.panel[1]);m.select(0);check(m.shown(0,visible)&&!m.shown(1,visible));
  visible[0]=false;check(m.shown(1,visible));visible[0]=true;
  m.place(1,Dock::Right);check(m.groupOf(0)!=m.groupOf(1));check(m.layout(area,visible).canvas.w<grouped.canvas.w);
  visible[1]=false;check(m.layout(area,visible).canvas.w==grouped.canvas.w);visible[1]=true;
  m.place(3,Dock::Bottom,m.groupOf(2),false,false);auto bottom=m.layout(area,visible);check(bottom.panel[3].x<bottom.panel[2].x);check(bottom.panel[3].w==m.groups[m.groupOf(3)].width);
  auto geometry=m.layout(area,visible);auto r=geometry.panel[0];auto target=m.targetAt(r.x+10,r.y+8,2,geometry,area);check(target.merge&&target.group==m.groupOf(0));
  m.place(2,Dock::Floating,-1,true,false,{5000,-5000,210,160});auto clamped=m.layout(area,visible).panel[2];check(area.contains(clamped.x,clamped.y)&&clamped.x+clamped.w<=area.x+area.w);
  auto preferred=m.groups[m.groupOf(2)].floating;check(preferred.x==5000&&preferred.y==-5000);
  m.select(0);m.place(1,Dock::Left,m.groupOf(0),true,true);m.placeGroup(0,Dock::Right);check(m.groupOf(0)==m.groupOf(1)&&m.groups[m.groupOf(0)].dock==Dock::Right);
  auto& floater=m.groups[m.groupOf(2)];floater.floating={420,160,210,160};floater.floatingArea=area;auto full=m.layout(area,visible).panel[2];auto small=m.layout({20,38,600,329},visible).panel[2];check(small.x<full.x&&small.y<full.y&&small.w==full.w&&small.h==full.h);check(m.layout(area,visible).panel[2]==full);
  // User reference: tab insertion is ordered on either side, including same-group reorder.
  m.place(3,Dock::Right,m.groupOf(0),true,true,{200,90,220,180},0);
  check(m.groups[m.groupOf(0)].tabs.front()==3);
  m.place(1,Dock::Right,m.groupOf(0),true,true,{200,90,220,180},0);
  check(m.groups[m.groupOf(0)].tabs.front()==1 && m.groups[m.groupOf(0)].active==1);
  m.place(1,Dock::Right,m.groupOf(0),true,true,{200,90,220,180},3);
  check(m.groups[m.groupOf(0)].tabs.back()==1);
  auto splitModel=Model{};auto splitGeometry=splitModel.layout(area,visible);auto splitRect=splitGeometry.panel[1];
  auto split=splitModel.targetAt(splitRect.x+splitRect.w/2,splitRect.y+splitRect.h-2,0,splitGeometry,area);
  check(!split.merge && split.after && split.preview.w==splitRect.w && split.preview.h==splitRect.h/2);
  // A split-edge candidate must not swallow the visible target header.
  auto heading=splitModel.targetAt(splitRect.x+10,splitRect.y+8,0,splitGeometry,area,&split);
  check(heading.merge && heading.group==splitModel.groupOf(1));
  for(bool after:{false,true}){
   Model self;self.place(1,Dock::Left,self.groupOf(0),true,true);auto g=self.layout(area,visible);auto r=g.panel[1];
   auto t=self.targetAt(r.x+r.w/2,after?r.y+r.h-2:r.y+20,1,g,area);
   check(!t.merge && t.group==self.groupOf(1) && t.after==after);
   self.place(1,t.dock,t.group,t.after,t.merge);check(self.groupOf(0)!=self.groupOf(1));
   auto split=self.layout(area,visible);check(after?split.panel[1].y>split.panel[0].y:split.panel[1].y<split.panel[0].y);
  }
  Model screenModel;screenModel.place(0,Dock::Floating,-1,true,false,{0,0,116,90});
  screenModel.groups[screenModel.groupOf(0)].floatingArea={0,0,900,600};
  auto screen=screenModel.layout(area,visible,2,{0,0,900,600}).panel[0];check(screen.x==0 && screen.y==0 && screen.w==116 && screen.h==90);
  screenModel.groups[screenModel.groupOf(0)].floating={10,12,1600,800};screen=screenModel.layout(area,visible,2,{0,0,900,600}).panel[0];check(screen.w==1600 && screen.h==800);
  for(int width:{220,298,380,640})for(int height:{100,180,300}){
   Model compact;compact.place(1,Dock::Right);const Rect view{20,41,width,height};auto g=compact.layout(view,visible);
   check(g.canvas.x>=view.x && g.canvas.y>=view.y && g.canvas.x+g.canvas.w<=view.x+view.w && g.canvas.y+g.canvas.h<=view.y+view.h);
   check(g.panel[0].x+g.panel[0].w<=g.canvas.x && g.canvas.x+g.canvas.w<=g.panel[1].x);
   check(g.panel[1].x+g.panel[1].w<=view.x+view.w && g.panel[2].y>=g.canvas.y+g.canvas.h);
  }
  std::stringstream stored;m.write(stored);Model restored;check(restored.read(stored));std::stringstream roundtrip;restored.write(roundtrip);std::stringstream expected;m.write(expected);check(roundtrip.str()==expected.str());
  const auto before=roundtrip.str();std::stringstream invalid("panels-v1 1 120 140 109 .2 1\n0 0 1 140 20 50 180 120 4 0 1 1 3\n");check(!restored.read(invalid));std::stringstream unchanged;restored.write(unchanged);check(unchanged.str()==before);
  std::cout<<"Panel docking, groups, visibility, layout and persistence passed\n";return 0;
 }catch(const std::exception& e){std::cerr<<e.what()<<'\n';return 1;}
}
