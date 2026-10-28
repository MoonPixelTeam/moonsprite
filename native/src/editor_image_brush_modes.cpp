
#include "editor_implementation.h"
#include "editor.h"
namespace moon::editor {
#if defined(_MSC_VER)
__declspec(noinline)
#else
__attribute__((noinline))
#endif
void Editor::smokeImageBrushPaintModes(){
 auto require=[](bool ok,const char* text){if(!ok)throw std::runtime_error(text);};
 const auto originalDirectory=workspacePresetTestDirectory_;const auto testDirectory=assets_.parent_path()/"image-mode-test-owned"/(std::to_string(GetCurrentProcessId())+"-"+std::to_string(GetTickCount64()));std::filesystem::create_directories(testDirectory);workspacePresetTestDirectory_=testDirectory;struct RestoreDirectory{std::function<void()> fn;~RestoreDirectory(){fn();}}restoreDirectory{[&]{workspacePresetTestDirectory_=originalDirectory;}};
 smoke_=true;homeOpen_=false;documentOpen_=true;pending_=Pending::None;playing_=false;document=Document(8,4);runShortcutCommand("tool.pencil");PatternBrush image;image.width=2;image.height=1;image.coverage={255,255};image.colors={0x800000ff,0xff00ff00};pencilImageBrush_=image;pencilImageBrushId_="temporary:pattern-mode-ui";brushFeedback_.brushProfiles_[0].imagePaintMode=PatternPaintMode::Paint;brushFeedback_.brushProfiles_[1].imagePaintMode=PatternPaintMode::Paint;toolRowScroll_=1000000;layoutToolOptions();require(imagePaintModeDropdown_&&imagePaintModeDropdown_->isVisible()&&imagePaintModeDropdown_->isEnabled(),"Image paint mode selector actually visible for intrinsic pencil");
 const auto pixels=document.canvasPixels();const auto h=document.historyPosition();imagePaintModeDropdown_->setSelectedIndex(1,true);require(activeStrokeBrush().imagePaintMode==PatternPaintMode::Source&&brushFeedback_.brushProfiles_[1].imagePaintMode==PatternPaintMode::Paint,"Pencil image mode actual dropdown preserves eraser profile");
 runShortcutCommand("tool.eraser");layoutToolOptions();require(imagePaintModeDropdown_->isVisible()&&imagePaintModeDropdown_->selectedIndex()==0,"Eraser mode profile restored");imagePaintModeDropdown_->setSelectedIndex(2,true);require(activeStrokeBrush().imagePaintMode==PatternPaintMode::Target,"Eraser actual target selector");
 brushFeedback_.brushProfiles_[0].imagePaintMode=brushFeedback_.brushProfiles_[1].imagePaintMode=PatternPaintMode::Paint;loadFillPatternPreferences();require(brushFeedback_.brushProfiles_[0].imagePaintMode==PatternPaintMode::Source&&brushFeedback_.brushProfiles_[1].imagePaintMode==PatternPaintMode::Target,"Image paint modes persisted by tool");
 require(document.canvasPixels()==pixels&&document.historyPosition()==h&&!document.dirty(),"Image paint modes are properties without history");
 pencilImageBrush_->intrinsicSize=false;layoutToolOptions();require(!imagePaintModeDropdown_->isVisible(),"Image paint mode selector excludes scaled internal images");pencilImageBrush_.reset();pencilImageBrushId_.clear();runShortcutCommand("tool.pencil");refresh();
}
}
