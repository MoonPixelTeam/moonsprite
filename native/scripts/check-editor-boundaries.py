"""Guard dependency direction and source ownership after the Editor extraction."""
from pathlib import Path
import re

native = Path(__file__).resolve().parents[1]
src = native / "src"
files = {p.name: p for p in src.iterdir() if p.suffix in {".h", ".cpp"}}
errors = []
graph = {}
for name, path in files.items():
    source = path.read_text(encoding="utf-8")
    includes = re.findall(r'^\s*#include\s+"([^"\n]+)"', source, re.M)
    graph[name] = [item for item in includes if item in files]
    for item in includes:
        if item.endswith(".cpp"):
            errors.append(f"{name}: implementation include {item}")
        if item.startswith("editor") and not name.startswith(("editor", "main")):
            errors.append(f"{name}: lower layer depends on Editor: {item}")
    if name.startswith(("document", "timeline_model", "layer_compositor", "cel_properties", "editor_recovery")) and "dialog" not in name:
        for item in includes:
            if item.startswith(("ui/", "os/", "native_widgets", "editor.h", "editor_support")):
                errors.append(f"{name}: document/recovery layer depends on UI: {item}")

visiting, visited = set(), set()
def visit(name, chain):
    if name in visiting:
        errors.append("Include cycle: " + " -> ".join(chain + [name]))
        return
    if name in visited:
        return
    visiting.add(name)
    for target in graph[name]:
        visit(target, chain + [name])
    visiting.remove(name)
    visited.add(name)
for name in graph:
    visit(name, [])

widgets = files["native_widgets.h"].read_text(encoding="utf-8")
if re.search(r"timeline(?:Cel|Selected|ParentPainted|DisplayColor|CaptionPadding)", widgets):
    errors.append("Shared buttons must not own timeline-specific view state")
main = files["main.cpp"].read_text(encoding="utf-8")
declaration = files["editor.h"].read_text(encoding="utf-8")
if '#include "editor_support.h"' in declaration or '#include "editor_implementation.h"' in declaration:
    errors.append("Editor declaration must not import its implementation/support widgets")
lifecycle_includes = re.findall(r'^\s*#include\s+"([^"\n]+)"', files["editor_lifecycle.cpp"].read_text(encoding="utf-8"), re.M)
if not lifecycle_includes or lifecycle_includes[0] != "editor.h":
    errors.append("Compile Editor declaration first to detect hidden include-order dependencies")
if re.search(r'\b(?:class Editor|Editor::|void smoke\w*\()', main):
    errors.append("main.cpp must contain startup/CLI dispatch, not Editor implementation")
recovery = files["editor_session.cpp"].read_text(encoding="utf-8")
if re.search(r'std::swap\(document,\*slot.stored\)', recovery):
    errors.append("Inactive recovery must operate on its document, not swap active Editor state")
refresh = files["editor_refresh.cpp"].read_text(encoding="utf-8").split("void Editor::syncDocumentViewState", 1)[1]
if re.search(r'\.(?:setHistoryEntryLimit|setPaletteColorSynchronization)\(', refresh):
    errors.append("Refresh must not mutate document preferences/history limits")
if errors:
    raise SystemExit("\n".join(errors))
print(f"Editor boundaries: {len(files)} sources; no include cycles, implementation includes or reverse UI dependencies.")
