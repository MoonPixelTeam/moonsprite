#pragma once
#include <optional>
#include <cstdint>
#include "gfx/point.h"
#include <string>
#include "canvas_references.h"
#include "selection_transform.h"
namespace ui {class Message;class Graphics;}
namespace moon::editor {
class Editor;
class CanvasReferenceController {
public:
 static void paint(Editor&,ui::Graphics&);
 static bool process(Editor&,ui::Message*);
 static std::optional<std::uint32_t> sample(Editor&,gfx::Point);
 static const char* cursor(const Editor&,gfx::Point);
 static void close(Editor&);
 static void dispose(Editor&);
 static bool command(Editor&,const std::string&);
 static bool dragging(const Editor&);
 static void check(Editor&);
 static void completeImport(Editor&);
 static void tick(Editor&);
 static ReferencePlacement screen(const Editor&,const ReferencePlacement&,bool);
 static ReferencePlacement document(const Editor&,const ReferencePlacement&);
 static TransformPoint point(const Editor&,gfx::Point,bool);
 static void finish(Editor&,bool);
 static void properties(Editor&,const std::string&,gfx::Point);
 static void addMenu(Editor&,gfx::Point);
 static void paste(Editor&,TransformPoint,double,const std::string& replace={});
 static void importFile(Editor&,TransformPoint,double);
 static bool borderHit(const Editor&,const ReferencePlacement&,gfx::Point);
};
}
