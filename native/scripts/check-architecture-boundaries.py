"""Check owned include modules and literal root-CMake target edges.

Conservative: all conditional branches are inspected. Literal set variables are
resolved; this does not execute CMake, preprocess C++, or prove object lifetimes.
Unmapped target/source expressions fail instead of silently escaping coverage.
"""
from pathlib import Path
import collections
import fnmatch
import json
import re
import runpy

ROOT = Path(__file__).resolve().parents[1]
source_graph = runpy.run_path(str(ROOT / "scripts/check-editor-boundaries.py"))["source_graph"]


def module_for(value, rules):
    normalized = value.replace("\\", "/").casefold()
    for rule in rules:
        if any(fnmatch.fnmatchcase(normalized, pattern.casefold()) for pattern in rule["patterns"]):
            return rule["module"]
    return None


def cmake_tokens(source):
    """Tokenize the supported literal CMake syntax, preserving quoted hashes."""
    tokens, token, i, quoted = [], "", 0, False
    while i < len(source):
        ch = source[i]
        bracket = re.match(r"\[(=*)\[", source[i:]) if not quoted else None
        if bracket:
            end = source.find("]" + bracket[1] + "]", i + len(bracket[0]))
            if end < 0:
                raise ValueError("Unterminated CMake bracket argument")
            token += source[i + len(bracket[0]):end]
            i = end + len(bracket[1]) + 2
            continue
        if ch == '"':
            quoted = not quoted
        elif ch == "\\" and i + 1 < len(source):
            i += 1
            token += source[i]
        elif ch == "#" and not quoted:
            bracket = re.match(r"#\[(=*)\[", source[i:])
            if bracket:
                end = source.find("]" + bracket[1] + "]", i + len(bracket[0]))
                if end < 0:
                    raise ValueError("Unterminated CMake bracket comment")
                i = end + len(bracket[1]) + 2
                continue
            end = source.find("\n", i)
            i = len(source) if end < 0 else end
            continue
        elif ch.isspace() and not quoted:
            if token:
                tokens.append(token)
                token = ""
        else:
            token += ch
        i += 1
    if quoted:
        raise ValueError("Unterminated CMake quoted argument")
    if token:
        tokens.append(token)
    return tokens


def cmake_commands(source):
    """Read commands with balanced parentheses, quoted strings and comments."""
    i = 0
    while i < len(source):
        if source[i].isspace():
            i += 1
            continue
        if source[i] == "#":
            bracket = re.match(r"#\[(=*)\[", source[i:])
            if bracket:
                end = source.find("]" + bracket[1] + "]", i + len(bracket[0]))
                if end < 0:
                    raise ValueError("Unterminated CMake bracket comment")
                i = end + len(bracket[1]) + 2
            else:
                end = source.find("\n", i)
                i = len(source) if end < 0 else end + 1
            continue
        command = re.match(r"([A-Za-z_][A-Za-z_0-9]*)\s*\(", source[i:])
        if not command:
            raise ValueError("Cannot parse root CMake near " + source[i:i + 60])
        name = command[1].casefold()
        start = i + len(command[0])
        i, depth, quoted, escaped = start, 1, False, False
        while i < len(source) and depth:
            ch = source[i]
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                quoted = not quoted
            elif not quoted and ch == "#":
                bracket = re.match(r"#\[(=*)\[", source[i:])
                if bracket:
                    end = source.find("]" + bracket[1] + "]", i + len(bracket[0]))
                    if end < 0:
                        raise ValueError("Unterminated CMake bracket comment")
                    i = end + len(bracket[1]) + 2
                else:
                    end = source.find("\n", i)
                    i = len(source) if end < 0 else end
                continue
            elif not quoted and re.match(r"\[(=*)\[", source[i:]):
                bracket = re.match(r"\[(=*)\[", source[i:])
                end = source.find("]" + bracket[1] + "]", i + len(bracket[0]))
                if end < 0:
                    raise ValueError("Unterminated CMake bracket argument")
                i = end + len(bracket[1]) + 2
                continue
            elif not quoted and ch == "(":
                depth += 1
            elif not quoted and ch == ")":
                depth -= 1
            i += 1
        if depth or quoted:
            raise ValueError("Unterminated CMake command " + name)
        if name in {"set", "add_library", "add_executable", "target_sources", "target_link_libraries"}:
            yield name, cmake_tokens(source[start:i - 1])


def inspect(native, policy=None):
    policy = policy or json.loads((native / "docs/architecture-boundaries.json").read_text(encoding="utf-8"))
    errors = []
    targets, sources, links = {}, collections.defaultdict(set), collections.defaultdict(set)
    variables = {"CMAKE_CURRENT_SOURCE_DIR": native.resolve().as_posix(),
                 "CMAKE_CURRENT_BINARY_DIR": (native / "build").resolve().as_posix()}

    def resolve(value):
        for _ in range(32):
            replaced = re.sub(r"\$\{([^}]+)\}", lambda m: variables.get(m[1], m[0]), value)
            if replaced == value:
                break
            value = replaced
        if "${" in value or "$<" in value:
            raise ValueError("unresolved expression " + value)
        return value.replace("\\", "/")

    keywords = {"PUBLIC", "PRIVATE", "INTERFACE", "STATIC", "SHARED", "MODULE", "OBJECT",
                "IMPORTED", "GLOBAL", "ALIAS", "EXCLUDE_FROM_ALL", "WIN32", "MACOSX_BUNDLE"}
    for name, args in cmake_commands((native / "CMakeLists.txt").read_text(encoding="utf-8")):
        if not args:
            continue
        if name == "set":
            values = args[1:]
            if "CACHE" in values:
                values = values[:values.index("CACHE")]
            variables[args[0]] = ";".join(values)
            continue
        target = args[0]
        if "${" in target or "$<" in target:
            errors.append("Unresolved CMake target: " + target)
            continue
        if name in {"add_library", "add_executable"}:
            module = policy["targets"].get(target)
            if not module and any(fnmatch.fnmatchcase(target, pattern) for pattern in policy["testTargets"]):
                module = "test"
            if not module:
                errors.append("Unmapped owned CMake target: " + target)
                module = "unmapped"
            targets[target] = module
        elif target not in targets and module_for(target, policy["externalTargets"]):
            # Dependencies declared by add_subdirectory may receive owned glue.
            targets[target] = module_for(target, policy["externalTargets"])
        if name == "target_link_libraries":
            for value in args[1:]:
                if value in keywords or value in {"debug", "optimized", "general"}:
                    continue
                try:
                    links[target].update(resolve(value).split(";"))
                except ValueError as error:
                    errors.append(f"{target}: {error}")
        elif name in {"add_library", "add_executable", "target_sources"}:
            for value in args[1:]:
                if value in keywords:
                    continue
                try:
                    paths = resolve(value).split(";")
                except ValueError as error:
                    errors.append(f"{target}: {error}")
                    continue
                for path in paths:
                    absolute = (native / path).resolve()
                    try:
                        relative = absolute.relative_to(native.resolve()).as_posix()
                    except ValueError:
                        errors.append(f"{target}: source outside native root: {path}")
                        continue
                    if relative.startswith("src/"):
                        sources[target].add(relative[4:])
                    elif relative.startswith("tests/") and targets.get(target) == "test":
                        if not absolute.is_file():
                            errors.append(f"{target}: test source missing: {relative}")
                    elif any(fnmatch.fnmatchcase(relative, pattern) for pattern in policy.get("externalSources", {}).get(target, [])):
                        if not absolute.is_file():
                            errors.append(f"{target}: external source missing: {relative}")
                    elif relative not in policy.get("generatedSources", {}).get(target, []):
                        errors.append(f"{target}: source has no approved ownership: {relative}")

    def permitted(owner, dependency):
        return dependency in policy["allowed"].get(owner, [])

    for target, dependencies in links.items():
        owner = targets.get(target)
        if not owner:
            errors.append("Links specified for undeclared target: " + target)
            continue
        for dependency in dependencies:
            module = targets.get(dependency) or module_for(dependency, policy["externalTargets"])
            if not module:
                errors.append(f"{target}: unmapped link dependency {dependency}")
            elif not permitted(owner, module):
                errors.append(f"{target} [{owner}]: forbidden link to {dependency} [{module}]")

    files, graph, includes, graph_errors = source_graph(native)
    errors += graph_errors
    owners = collections.defaultdict(set)
    for target, entries in sources.items():
        if targets.get(target) == "test":
            continue
        for entry in entries:
            if entry not in files:
                errors.append(f"{target}: declared owned source missing: src/{entry}")
            owners[entry].add(targets.get(target, "unmapped"))
    modules, inferred = {}, set()
    for name, path in files.items():
        if owners[name]:
            if len(owners[name]) != 1:
                errors.append(f"{name}: conflicting target owners {sorted(owners[name])}")
            modules[name] = sorted(owners[name])[0]
        else:
            module = module_for(name, policy["headers"])
            if not module:
                module = "shared"
                inferred.add(name)
            modules[name] = module
            if path.suffix in {".cpp", ".c"}:
                errors.append("Implementation has no production target owner: " + name)

    # Unowned interface headers inherit their actual platform/UI requirements.
    # Explicit core/application contracts never change module to hide an edge.
    ranking = {"shared": 0, "core": 0, "application": 1, "codec": 2, "platform": 3, "extension": 4, "ui": 5}
    for _ in range(len(inferred) + 1):
        changed = False
        for name in inferred:
            candidates = [modules[value] for value in graph[name]]
            candidates += [module_for(value, policy["externalHeaders"]) for value in includes[name]]
            module = max([modules[name]] + [v for v in candidates if v], key=lambda value: ranking.get(value, 99))
            if module != modules[name]:
                modules[name], changed = module, True
        if not changed:
            break

    for name, dependencies in graph.items():
        for dependency in dependencies:
            if not permitted(modules[name], modules[dependency]):
                errors.append(f"{name} [{modules[name]}]: forbidden include {dependency} [{modules[dependency]}]")
        for include in includes[name]:
            module = module_for(include, policy["externalHeaders"])
            if module and not permitted(modules[name], module):
                errors.append(f"{name} [{modules[name]}]: forbidden external include {include} [{module}]")
    # History capture, replay and retained-cost definitions must keep their dedicated owner.
    # This is a source boundary check, not proof of replay/byte equivalence.
    for symbol, owner in policy.get("definitionOwners", {}).items():
        definition = re.compile(r"^\s*(?:void|bool|PaletteState|std::size_t|std::optional\s*<\s*std::size_t\s*>|std::unique_ptr\s*<[^;\n{}]+>)\s+" + re.escape(symbol) +
                                r"\s*\([^;{}]*\)\s*(?:const\s*)?(?:noexcept\s*)?\{", re.MULTILINE)
        found = [name for name, path in files.items()
                 for _ in definition.finditer(path.read_text(encoding="utf-8"))]
        if found != [owner]:
            errors.append(f"Definition {symbol} must be owned once by {owner}; found {found}")
    return sorted(set(errors)), {"targets": len(targets), "sources": len(files), "modules": dict(collections.Counter(modules.values()))}


if __name__ == "__main__":
    errors, summary = inspect(ROOT)
    print("Architecture coverage: " + json.dumps(summary, ensure_ascii=False, sort_keys=True))
    if errors:
        raise SystemExit("\n".join(errors))
    print("Architecture boundaries: owned source modules, system includes and CMake links passed.")
