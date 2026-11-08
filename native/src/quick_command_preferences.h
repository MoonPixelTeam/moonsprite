#pragma once
#include <string>
#include <vector>

namespace moon::quick {
// Legacy file-preferences.ts stores order separately from enabled state.
struct Command { std::string id; bool enabled=false; };
enum class Edge { Top, Right, Bottom, Left, None };
struct Bar {
  std::string id;
  std::u16string name;
  Edge edge=Edge::Top;
  double position=.5;
  bool expanded=false;
  std::vector<Command> commands;
};
const std::vector<std::string>& commandIds();
std::vector<Command> defaultCommands(unsigned group=0);
std::vector<Bar> defaultBars();
// Invalid JSON falls back exactly as the legacy preference parsers do.
std::vector<Command> parseCommands(const std::string& json);
std::vector<Bar> parseBars(const std::string& json,
                         const std::vector<Command>& fallback=defaultCommands());
std::string encodeBars(const std::vector<Bar>& bars);
struct Rect { double x,y,width,height; };
struct Drag { Edge startEdge; double grabOffset; };
struct Position { Edge edge; double position; };
// Inputs use one coordinate space; the UI adapter must convert physical pixels.
Position moveBar(const Drag&, Rect container, Rect measuredBar,
                 double pointerX, double pointerY, unsigned enabledCommands);
}
