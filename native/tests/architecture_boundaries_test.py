"""Exercise actual module/CMake guards using isolated source fixtures."""
from pathlib import Path
import copy
import json
import runpy
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
CHECKER = runpy.run_path(str(ROOT / "scripts/check-architecture-boundaries.py"))
POLICY = json.loads((ROOT / "docs/architecture-boundaries.json").read_text(encoding="utf-8"))


class ArchitectureBoundariesTest(unittest.TestCase):
    def setUp(self):
        temporary = ROOT / "build/test-tmp"
        temporary.mkdir(parents=True, exist_ok=True)
        self.fixture = tempfile.TemporaryDirectory(prefix="architecture-boundaries-", dir=temporary)
        self.addCleanup(self.fixture.cleanup)
        self.root = Path(self.fixture.name)
        self.policy = copy.deepcopy(POLICY)
        self.policy.pop("definitionOwners", None)
        self.write("src/plain.cpp", '#include "plain.h"\n')
        self.write("src/plain.h", "#pragma once\n")
        self.cmake("add_library(moon-core src/plain.cpp)\n")

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def cmake(self, text):
        self.write("CMakeLists.txt", text)

    def errors(self):
        return CHECKER["inspect"](self.root, self.policy)[0]

    def test_valid_core_and_application_dependency(self):
        self.write("src/commands.cpp", '#include "plain.h"\n')
        self.policy["targets"]["moon-commands"] = "application"
        self.cmake("add_library(moon-core src/plain.cpp)\nadd_library(moon-commands src/commands.cpp)\n"
                   "target_link_libraries(moon-commands PRIVATE moon-core)\n")
        self.assertEqual(self.errors(), [])

    def test_target_ownership_rejects_windows_in_arbitrary_filename(self):
        self.write("src/plain.cpp", "#include <Windows.h>\n")
        self.assertTrue(any("forbidden external include Windows.h" in e for e in self.errors()))

    def test_target_ownership_rejects_ui_through_unclassified_header(self):
        self.write("src/plain.h", '#include "nested/helper.hpp"\n')
        self.write("src/nested/helper.hpp", "#include <ui/widget.h>\n")
        self.assertTrue(any("plain.cpp [core]: forbidden include plain.h [ui]" in e for e in self.errors()))

    def test_explicit_core_header_never_inherits_platform_classification(self):
        self.write("src/document_extra.h", "#include <windows.h>\n")
        self.assertTrue(any("document_extra.h [core]: forbidden external" in e for e in self.errors()))

    def test_core_cannot_link_windows_or_ui(self):
        self.cmake("add_library(moon-core src/plain.cpp)\n"
                   "target_link_libraries(moon-core PUBLIC user32 PRIVATE ui-lib)\n")
        errors = self.errors()
        self.assertTrue(any("forbidden link to user32" in e for e in errors))
        self.assertTrue(any("forbidden link to ui-lib" in e for e in errors))

    def test_unknown_target_and_library_are_rejected(self):
        self.cmake("add_library(unmapped src/plain.cpp)\n"
                   "target_link_libraries(unmapped PRIVATE unknown-library)\n")
        errors = self.errors()
        self.assertTrue(any("Unmapped owned CMake target: unmapped" in e for e in errors))
        self.assertTrue(any("unmapped link dependency unknown-library" in e for e in errors))

    def test_unowned_implementation_is_rejected(self):
        self.write("src/forgotten.cpp", "// not in a production target\n")
        self.assertIn("Implementation has no production target owner: forgotten.cpp", self.errors())

    def test_test_target_cannot_hide_missing_production_owner(self):
        self.cmake("add_executable(example-tests src/plain.cpp)\n")
        self.assertIn("Implementation has no production target owner: plain.cpp", self.errors())

    def test_literal_variable_chain_and_lists(self):
        self.cmake('set(SOURCE_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/src")\n'
                   'set(SOURCE "${SOURCE_ROOT}/plain.cpp")\n'
                   'add_library(moon-core "${SOURCE}")\n')
        self.assertEqual(self.errors(), [])

    def test_unknown_source_and_generator_expressions_fail_closed(self):
        self.cmake('add_library(moon-core src/plain.cpp "${UNKNOWN}/other.cpp")\n'
                   'target_sources(moon-core PRIVATE "$<$<CONFIG:Debug>:src/hidden.cpp>")\n')
        self.assertEqual(sum("unresolved expression" in e for e in self.errors()), 2)

    def test_generated_dependency_glue_requires_explicit_path(self):
        self.cmake("add_library(moon-core src/plain.cpp)\n"
                   'target_sources(laf-os PRIVATE "${CMAKE_CURRENT_BINARY_DIR}/generated/moonsprite_laf_window.cpp")\n')
        self.assertEqual(self.errors(), [])
        self.cmake("add_library(moon-core src/plain.cpp)\n"
                   'target_sources(laf-os PRIVATE "${CMAKE_CURRENT_BINARY_DIR}/generated/unknown.cpp")\n')
        self.assertTrue(any("no approved ownership" in e for e in self.errors()))

    def test_comments_brackets_quotes_and_parentheses(self):
        source = ('#[=[ ignored ) " ( ]=]\n'
                  'set(NAME "file#hash(with)parens")\n'
                  'set(BRACKET [==[ literal # ) " ( ]==])\n'
                  'add_library(moon-core # inline )\n'
                  'src/plain.cpp #[[ ignored ) ]] )\n')
        self.assertEqual(list(CHECKER["cmake_commands"](source)), [
            ("set", ["NAME", "file#hash(with)parens"]),
            ("set", ["BRACKET", ' literal # ) " ( ']),
            ("add_library", ["moon-core", "src/plain.cpp"]),
        ])
        self.cmake(source)
        self.assertEqual(self.errors(), [])

    def test_definition_owner_accepts_only_the_dedicated_unit(self):
        self.policy["definitionOwners"] = {"Document::applyEdit": "plain.cpp"}
        self.write("src/plain.cpp", "void Document::applyEdit(const Edit& edit,bool forward){}\n")
        self.assertEqual(self.errors(), [])
        self.write("src/other.cpp", "void Document::applyEdit(const Edit& edit,bool forward){}\n")
        self.cmake("add_library(moon-core src/plain.cpp src/other.cpp)\n")
        self.assertTrue(any("must be owned once" in error for error in self.errors()))

    def test_definition_owner_rejects_missing_or_relocated_cost(self):
        self.policy["definitionOwners"] = {"Document::Edit::bytes": "cost.cpp"}
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        self.write("src/plain.cpp", "std::size_t Document::Edit::bytes() const {return 0;}\n")
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        self.write("src/plain.cpp", "#include \"plain.h\"\n")
        self.write("src/cost.cpp", "std::size_t Document::Edit::bytes() const {return 0;}\n")
        self.cmake("add_library(moon-core src/plain.cpp src/cost.cpp)\n")
        self.assertEqual(self.errors(), [])

    def test_optional_cost_owner_is_required_and_unique(self):
        self.policy["definitionOwners"] = {"Document::PaletteHistory::exclusiveBytes": "cost.cpp"}
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        body = "std::optional<std::size_t> Document::PaletteHistory::exclusiveBytes()const{return {};}\n"
        self.write("src/plain.cpp", body)
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        self.write("src/plain.cpp", '#include "plain.h"\n')
        self.write("src/cost.cpp", body)
        self.cmake("add_library(moon-core src/plain.cpp src/cost.cpp)\n")
        self.assertEqual(self.errors(), [])
        self.write("src/plain.cpp", body)
        self.assertTrue(any("must be owned once" in error for error in self.errors()))

    def test_bool_terminal_dispatch_owner_is_required_and_unique(self):
        self.policy["definitionOwners"] = {"Document::applyTerminalHistory": "apply.cpp"}
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        body = "bool Document::applyTerminalHistory(const Edit& edit,bool forward){return false;}\n"
        self.write("src/plain.cpp", body)
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        self.write("src/plain.cpp", '#include "plain.h"\n')
        self.write("src/apply.cpp", body)
        self.cmake("add_library(moon-core src/plain.cpp src/apply.cpp)\n")
        self.assertEqual(self.errors(), [])
        self.write("src/plain.cpp", body)
        self.assertTrue(any("must be owned once" in error for error in self.errors()))

    def test_palette_capture_owner_is_required_and_unique(self):
        self.policy["definitionOwners"] = {"Document::capturePaletteEdit": "palette.cpp"}
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        body = "PaletteState Document::capturePaletteEdit(int kind,int id)const{return {};}\n"
        self.write("src/plain.cpp", body)
        self.assertTrue(any("must be owned once" in error for error in self.errors()))
        self.write("src/plain.cpp", '#include "plain.h"\n')
        self.write("src/palette.cpp", body)
        self.cmake("add_library(moon-core src/plain.cpp src/palette.cpp)\n")
        self.assertEqual(self.errors(), [])
        self.write("src/plain.cpp", body)
        self.assertTrue(any("must be owned once" in error for error in self.errors()))

    def test_prepared_owner_and_noexcept_exchange_are_required_and_unique(self):
        for symbol, body in [
            ("Document::preparePaletteEdit", "std::unique_ptr<Document::PaletteReplay> Document::preparePaletteEdit(const Edit& e,bool f)const{return {};}\n"),
            ("Document::exchangeHistoryLeaf", "void Document::exchangeHistoryLeaf(HistoryReplayPlan& plan)noexcept{}\n"),
        ]:
            with self.subTest(symbol=symbol):
                self.policy["definitionOwners"] = {symbol: "plain.cpp"}
                self.write("src/plain.cpp", "// missing owner\n")
                self.write("src/other.cpp", "// no duplicate\n")
                self.cmake("add_library(moon-core src/plain.cpp src/other.cpp)\n")
                self.assertTrue(any("must be owned once" in e for e in self.errors()))
                self.write("src/plain.cpp", body)
                self.assertEqual(self.errors(), [])
                self.write("src/other.cpp", body)
                self.assertTrue(any("must be owned once" in e for e in self.errors()))

    def test_unterminated_syntax_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            list(CHECKER["cmake_commands"]('add_library(moon-core "src/plain.cpp)'))


if __name__ == "__main__":
    unittest.main()
