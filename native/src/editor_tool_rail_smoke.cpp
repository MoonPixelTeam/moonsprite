#include "editor_implementation.h"
#include "editor.h"

namespace moon::editor {

void Editor::smokeToolRailMatrix() {
  const auto path=assets_.parent_path()/"tool-rail-stage.txt";
  std::ofstream(path,std::ios::trunc)<<"begin\n";
  smoke_=true; homeOpen_=false; documentOpen_=true; pending_=Pending::None;
  document=Document(16,12); setBounds(gfx::Rect(0,0,1280,960)); fitCanvas(); refresh();
  auto require=[&](bool ok,const char* why){if(!ok)throw std::runtime_error(why);};
  auto choose=[&](std::size_t group,int choice,const char* id){
    showToolGroup(group,true,choice);
    if(activeRailTool()!=id)
      throw std::runtime_error(std::string("tool rail click did not activate ")+id+" actual="+activeRailTool());
  };
  auto groupOf=[&](const char* id){
    for(std::size_t g=0;g<legacyToolGroups().size();++g)
      for(std::size_t i=0;i<legacyToolGroups()[g].size();++i)
        if(std::string(legacyToolGroups()[g][i].id)==id)return std::pair<std::size_t,int>{g,int(i)};
    throw std::runtime_error(std::string("missing legacy tool ")+id);
  };

  // Exercise every default raster entry through the same rail/flyout route used by users.
  for(std::size_t g=0;g<legacyToolGroups().size();++g) {
    const auto& entries=legacyToolGroups()[g];
    for(std::size_t i=0;i<entries.size();++i)
      if(isToolAvailableForSession(entries[i].id)) choose(g,int(i),entries[i].id);
  }
  require(isToolAvailableForSession("fill.bucket") && isToolAvailableForSession("fill.gradient"),"raster fill matrix");
  {auto [g,i]=groupOf("fill.bucket");showToolGroup(g,true,i);useFillTool();}
  require(fillToleranceInput_ && !fillToleranceInput_->hasFlags(ui::HIDDEN) &&
          fillContiguousButton_ && fillConnectivityButton_ && fillReferenceButton_,"bucket controls not connected");
  {auto [g,i]=groupOf("fill.gradient");showToolGroup(g,true,i);useGradientTool();}
  require(gradientType_ && !gradientType_->hasFlags(ui::HIDDEN) && gradientRadialButton_ &&
          gradientTolerance_ && gradientContiguous_ && gradientReference_ && gradientConnectivity_ &&
          gradientDither_ && gradientFreeformButton_ && gradientMode_,"gradient controls not connected");
  {auto [g,i]=groupOf("shape.rectangle");showToolGroup(g,true,i);useShapeTool(ShapeKind::Rectangle);}
  require(shapeTool_ && shapeRoundedButton_ && shapeRatioButton_,"shape controls not connected");
  {auto [g,i]=groupOf("eyedropper");showToolGroup(g,true,i);useEyedropperTool();}
  require(eyedropperSourceButton_ && eyedropperForegroundButton_ && eyedropperBackgroundButton_ &&
          eyedropperReplaceButton_,"eyedropper controls not connected");
  std::ofstream(path,std::ios::app)<<"raster enabled\n";

  // Active mask keeps the legacy broad tool matrix, while special layers retain Magic Eraser's gate.
  smokeAttachedMasks();

  // Tilemap context is exercised by the existing tilemap migration smoke; this rail
  // check records the shared route without fabricating a tilemap layer in the editor.
  std::ofstream(path,std::ios::app)<<"mask enabled\ntilemap route delegated\ncomplete\n";
  document=Document(); refresh();
}

}
