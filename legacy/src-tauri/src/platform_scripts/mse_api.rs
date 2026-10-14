use std::{cell::RefCell, collections::BTreeMap, rc::Rc};

use mlua::{Error as LuaError, Function, Lua, Result as LuaResult, Table, Value, Variadic};
use serde_json::{Map as JsonMap, Number as JsonNumber, Value as JsonValue};

use super::{LuaScriptOperation, ScriptColor, ScriptDocumentState, ScriptPoint, ScriptRectangle};

pub(super) const API_VERSION: &str = "0.2.0";

const MAX_JSON_DEPTH: usize = 24;
const MAX_JSON_ENTRIES: usize = 262_144;

#[derive(Clone, Copy)]
struct MethodDefinition {
    name: &'static str,
    read_only: bool,
}

struct ModuleDefinition {
    name: &'static str,
    read_only: bool,
    methods: &'static [MethodDefinition],
}

macro_rules! methods {
    ($(($name:literal, $read_only:literal)),+ $(,)?) => {
        &[$(MethodDefinition { name: $name, read_only: $read_only }),+]
    };
}

const DOCUMENT_METHODS: &[MethodDefinition] = methods![
    ("info", true),
    ("activeLayer", true),
    ("create", false),
    ("open", false),
    ("save", false),
];
const LAYER_METHODS: &[MethodDefinition] = methods![
    ("list", true),
    ("get", true),
    ("create", false),
    ("duplicate", false),
    ("remove", false),
    ("update", false),
];
const ANIMATION_METHODS: &[MethodDefinition] = methods![
    ("frames", true),
    ("setFrame", false),
    ("loops", true),
    ("createLoop", false),
    ("updateLoop", false),
    ("removeLoop", false),
    ("play", false),
];
const PALETTE_METHODS: &[MethodDefinition] = methods![
    ("list", true),
    ("get", true),
    ("create", false),
    ("update", false),
    ("remove", false),
    ("extract", false),
];
const TILE_METHODS: &[MethodDefinition] = methods![
    ("listSets", true),
    ("getSet", true),
    ("createSet", false),
    ("createLayer", false),
    ("place", false),
    ("edit", false),
];
const FREE_TILE_METHODS: &[MethodDefinition] = methods![
    ("listSources", true),
    ("getSource", true),
    ("createSource", false),
    ("createLayer", false),
    ("place", false),
    ("edit", false),
];
const BRUSH_METHODS: &[MethodDefinition] = methods![
    ("list", true),
    ("get", true),
    ("importImage", false),
    ("createFromSelection", false),
    ("remove", false),
];
const SELECTION_METHODS: &[MethodDefinition] = methods![
    ("info", true),
    ("set", false),
    ("clear", false),
    ("invert", false),
    ("transform", false),
];
const SLICE_METHODS: &[MethodDefinition] = methods![
    ("list", true),
    ("get", true),
    ("create", false),
    ("update", false),
    ("remove", false),
];
const STYLE_METHODS: &[MethodDefinition] = methods![
    ("get", true),
    ("apply", false),
    ("copy", false),
    ("paste", false),
    ("clear", false),
    ("setEnabled", false),
];
const WORKSPACE_METHODS: &[MethodDefinition] = methods![
    ("listPanels", true),
    ("getPanel", true),
    ("setPanel", false),
    ("showPanel", false),
    ("hidePanel", false),
];
const IO_METHODS: &[MethodDefinition] =
    methods![("export", false), ("save", false), ("open", false)];
const UI_METHODS: &[MethodDefinition] =
    methods![("notify", false), ("alert", false), ("dialog", false)];

const MODULES: &[ModuleDefinition] = &[
    ModuleDefinition {
        name: "document",
        read_only: false,
        methods: DOCUMENT_METHODS,
    },
    ModuleDefinition {
        name: "layers",
        read_only: false,
        methods: LAYER_METHODS,
    },
    ModuleDefinition {
        name: "animation",
        read_only: false,
        methods: ANIMATION_METHODS,
    },
    ModuleDefinition {
        name: "palette",
        read_only: false,
        methods: PALETTE_METHODS,
    },
    ModuleDefinition {
        name: "tiles",
        read_only: false,
        methods: TILE_METHODS,
    },
    ModuleDefinition {
        name: "freeTiles",
        read_only: false,
        methods: FREE_TILE_METHODS,
    },
    ModuleDefinition {
        name: "brushes",
        read_only: false,
        methods: BRUSH_METHODS,
    },
    ModuleDefinition {
        name: "selection",
        read_only: false,
        methods: SELECTION_METHODS,
    },
    ModuleDefinition {
        name: "slices",
        read_only: false,
        methods: SLICE_METHODS,
    },
    ModuleDefinition {
        name: "styles",
        read_only: false,
        methods: STYLE_METHODS,
    },
    ModuleDefinition {
        name: "workspace",
        read_only: false,
        methods: WORKSPACE_METHODS,
    },
    ModuleDefinition {
        name: "io",
        read_only: false,
        methods: IO_METHODS,
    },
    ModuleDefinition {
        name: "ui",
        read_only: false,
        methods: UI_METHODS,
    },
];

pub(super) fn install(lua: &Lua, document: Rc<RefCell<ScriptDocumentState>>) -> LuaResult<()> {
    let mse = lua.create_table()?;
    mse.set("apiVersion", API_VERSION)?;

    let status = lua.create_table()?;
    status.set("name", "MoonSprite")?;
    status.set("namespace", "mse")?;
    status.set("apiVersion", API_VERSION)?;
    status.set("runtimeVersion", env!("CARGO_PKG_VERSION"))?;
    status.set("stage", "experimental")?;
    status.set("compatibility", "MoonSprite-specific API")?;
    mse.set("status", status)?;

    let capabilities = lua.create_table()?;
    for module in MODULES {
        let capability = lua.create_table()?;
        capability.set("status", "stable")?;
        capability.set("readOnly", module.read_only)?;
        let methods = lua.create_table()?;
        for (index, method) in module.methods.iter().enumerate() {
            let entry = lua.create_table()?;
            entry.set("name", method.name)?;
            entry.set("implemented", true)?;
            entry.set("readOnly", method.read_only)?;
            methods.set(index + 1, entry)?;
        }
        capability.set("methods", methods)?;
        capabilities.set(module.name, capability)?;
    }
    mse.set("capabilities", capabilities)?;
    mse.set(
        "isSupported",
        lua.create_function(|_, path: String| Ok(is_supported_path(&path)))?,
    )?;

    for module in MODULES {
        let table = lua.create_table()?;
        for method in module.methods {
            let path = format!("{}.{}", module.name, method.name);
            table.set(method.name, create_method(lua, &path, document.clone())?)?;
        }
        mse.set(module.name, table)?;
    }

    lua.globals().set("mse", mse)?;
    Ok(())
}

fn is_supported_path(path: &str) -> bool {
    let path = path.trim().strip_prefix("mse.").unwrap_or(path.trim());
    matches!(
        path,
        "apiVersion" | "status" | "capabilities" | "isSupported"
    ) || MODULES.iter().any(|module| {
        module
            .methods
            .iter()
            .any(|method| path == format!("{}.{}", module.name, method.name))
    })
}

fn create_method(
    lua: &Lua,
    path: &str,
    document: Rc<RefCell<ScriptDocumentState>>,
) -> LuaResult<Function> {
    match path {
        "document.info" => {
            lua.create_function(move |lua, _: Variadic<Value>| document_info(lua, &document))
        }
        "document.activeLayer" => {
            snapshot_path_function(lua, document, &["document", "activeLayer"])
        }
        "layers.list" => snapshot_path_function(lua, document, &["layers"]),
        "layers.get" => collection_lookup_function(lua, document, &["layers"]),
        "animation.frames" => snapshot_path_function(lua, document, &["animation", "frames"]),
        "animation.loops" => snapshot_path_function(lua, document, &["animation", "loops"]),
        "palette.list" => snapshot_path_function(lua, document, &["palette", "entries"]),
        "palette.get" => collection_lookup_function(lua, document, &["palette", "entries"]),
        "tiles.listSets" => snapshot_path_function(lua, document, &["tiles", "sets"]),
        "tiles.getSet" => collection_lookup_function(lua, document, &["tiles", "sets"]),
        "freeTiles.listSources" => snapshot_path_function(lua, document, &["freeTiles", "sources"]),
        "freeTiles.getSource" => {
            collection_lookup_function(lua, document, &["freeTiles", "sources"])
        }
        "brushes.list" => snapshot_path_function(lua, document, &["brushes"]),
        "brushes.get" => collection_lookup_function(lua, document, &["brushes"]),
        "selection.info" => {
            lua.create_function(move |lua, _: Variadic<Value>| selection_info(lua, &document))
        }
        "slices.list" => snapshot_path_function(lua, document, &["slices"]),
        "slices.get" => collection_lookup_function(lua, document, &["slices"]),
        "styles.get" => style_lookup_function(lua, document),
        "workspace.listPanels" => snapshot_path_function(lua, document, &["workspace", "panels"]),
        "workspace.getPanel" => collection_lookup_function(lua, document, &["workspace", "panels"]),
        "ui.alert" => lua.create_function(|lua, args: Variadic<Value>| {
            let app = lua.globals().get::<Table>("app")?;
            app.get::<Function>("alert")?.call::<Value>(args)
        }),
        "ui.dialog" => lua.create_function(|lua, args: Variadic<Value>| {
            lua.globals().get::<Function>("Dialog")?.call::<Value>(args)
        }),
        _ => operation_function(lua, document, path),
    }
}

fn operation_function(
    lua: &Lua,
    document: Rc<RefCell<ScriptDocumentState>>,
    path: &str,
) -> LuaResult<Function> {
    let path = path.to_string();
    lua.create_function(move |_, args: Variadic<Value>| {
        document
            .borrow_mut()
            .queue_mse_operation(LuaScriptOperation {
                path: path.clone(),
                arguments: arguments_to_json(args)?,
            });
        Ok(true)
    })
}

fn snapshot_path_function(
    lua: &Lua,
    document: Rc<RefCell<ScriptDocumentState>>,
    path: &'static [&'static str],
) -> LuaResult<Function> {
    lua.create_function(move |lua, _: Variadic<Value>| {
        json_to_lua(
            lua,
            &snapshot_value(&document, path).unwrap_or(JsonValue::Null),
            0,
        )
    })
}

fn collection_lookup_function(
    lua: &Lua,
    document: Rc<RefCell<ScriptDocumentState>>,
    path: &'static [&'static str],
) -> LuaResult<Function> {
    lua.create_function(move |lua, args: Variadic<Value>| {
        let key = args
            .first()
            .map(lua_scalar_key)
            .transpose()?
            .unwrap_or_default();
        let collection = snapshot_value(&document, path).unwrap_or(JsonValue::Array(Vec::new()));
        let value = collection
            .as_array()
            .and_then(|entries| {
                entries
                    .iter()
                    .find(|entry| json_scalar_key(entry.get("id")) == key)
            })
            .cloned()
            .unwrap_or(JsonValue::Null);
        json_to_lua(lua, &value, 0)
    })
}

fn style_lookup_function(
    lua: &Lua,
    document: Rc<RefCell<ScriptDocumentState>>,
) -> LuaResult<Function> {
    lua.create_function(move |lua, args: Variadic<Value>| {
        let requested = args
            .first()
            .map(lua_scalar_key)
            .transpose()?
            .unwrap_or_default();
        let snapshot = document.borrow().mse_snapshot.clone();
        let active_id = snapshot
            .pointer("/document/activeLayer/id")
            .map(|value| json_scalar_key(Some(value)))
            .unwrap_or_default();
        let id = if requested.is_empty() {
            active_id
        } else {
            requested
        };
        let value = snapshot
            .get("layers")
            .and_then(JsonValue::as_array)
            .and_then(|layers| {
                layers
                    .iter()
                    .find(|layer| json_scalar_key(layer.get("id")) == id)
            })
            .and_then(|layer| layer.get("styles"))
            .cloned()
            .unwrap_or(JsonValue::Null);
        json_to_lua(lua, &value, 0)
    })
}

fn snapshot_value(document: &Rc<RefCell<ScriptDocumentState>>, path: &[&str]) -> Option<JsonValue> {
    let snapshot = document.borrow().mse_snapshot.clone();
    let mut current = &snapshot;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current.clone())
}

fn arguments_to_json(args: Variadic<Value>) -> LuaResult<JsonValue> {
    let mut entries = 0;
    if args.is_empty() {
        return Ok(JsonValue::Null);
    }
    if args.len() == 1 {
        return lua_to_json(args[0].clone(), 0, &mut entries);
    }
    args.into_iter()
        .map(|value| lua_to_json(value, 0, &mut entries))
        .collect::<LuaResult<Vec<_>>>()
        .map(JsonValue::Array)
}

fn lua_to_json(value: Value, depth: usize, entries: &mut usize) -> LuaResult<JsonValue> {
    if depth > MAX_JSON_DEPTH {
        return Err(LuaError::RuntimeError(
            "mse arguments are nested too deeply.".into(),
        ));
    }
    *entries = entries.saturating_add(1);
    if *entries > MAX_JSON_ENTRIES {
        return Err(LuaError::RuntimeError(
            "mse arguments contain too many values.".into(),
        ));
    }
    match value {
        Value::Nil => Ok(JsonValue::Null),
        Value::Boolean(value) => Ok(JsonValue::Bool(value)),
        Value::Integer(value) => Ok(JsonValue::Number(value.into())),
        Value::Number(value) => JsonNumber::from_f64(value)
            .map(JsonValue::Number)
            .ok_or_else(|| {
                LuaError::RuntimeError("mse arguments must contain finite numbers.".into())
            }),
        Value::String(value) => Ok(JsonValue::String(value.to_string_lossy())),
        Value::Table(table) => table_to_json(table, depth + 1, entries),
        Value::UserData(value) => {
            if let Ok(color) = value.borrow::<ScriptColor>() {
                return Ok(JsonValue::Object(JsonMap::from_iter([
                    ("r".into(), JsonValue::from(color.red)),
                    ("g".into(), JsonValue::from(color.green)),
                    ("b".into(), JsonValue::from(color.blue)),
                    ("a".into(), JsonValue::from(color.alpha)),
                ])));
            }
            if let Ok(point) = value.borrow::<ScriptPoint>() {
                return Ok(JsonValue::Object(JsonMap::from_iter([
                    ("x".into(), JsonValue::from(point.x)),
                    ("y".into(), JsonValue::from(point.y)),
                ])));
            }
            if let Ok(rectangle) = value.borrow::<ScriptRectangle>() {
                return Ok(JsonValue::Object(JsonMap::from_iter([
                    ("x".into(), JsonValue::from(rectangle.x)),
                    ("y".into(), JsonValue::from(rectangle.y)),
                    ("width".into(), JsonValue::from(rectangle.width)),
                    ("height".into(), JsonValue::from(rectangle.height)),
                ])));
            }
            Err(LuaError::RuntimeError(
                "unsupported userdata in mse arguments.".into(),
            ))
        }
        _ => Err(LuaError::RuntimeError(
            "unsupported value in mse arguments.".into(),
        )),
    }
}

fn table_to_json(table: Table, depth: usize, entries: &mut usize) -> LuaResult<JsonValue> {
    let mut integer_entries = BTreeMap::<usize, JsonValue>::new();
    let mut object_entries = JsonMap::new();
    let mut has_integer = false;
    let mut has_object = false;
    for pair in table.pairs::<Value, Value>() {
        let (key, value) = pair?;
        match key {
            Value::Integer(index) if index > 0 => {
                has_integer = true;
                integer_entries.insert(index as usize, lua_to_json(value, depth, entries)?);
            }
            Value::String(key) => {
                has_object = true;
                object_entries.insert(key.to_string_lossy(), lua_to_json(value, depth, entries)?);
            }
            _ => {
                return Err(LuaError::RuntimeError(
                    "mse table keys must be strings or positive integers.".into(),
                ))
            }
        }
    }
    if has_integer && has_object {
        return Err(LuaError::RuntimeError(
            "mse tables cannot mix array and object keys.".into(),
        ));
    }
    if has_integer {
        let length = integer_entries.keys().next_back().copied().unwrap_or(0);
        if integer_entries.len() != length {
            return Err(LuaError::RuntimeError(
                "mse array arguments must not contain gaps.".into(),
            ));
        }
        return Ok(JsonValue::Array(
            (1..=length)
                .map(|index| integer_entries.remove(&index).unwrap())
                .collect(),
        ));
    }
    Ok(JsonValue::Object(object_entries))
}

fn json_to_lua(lua: &Lua, value: &JsonValue, depth: usize) -> LuaResult<Value> {
    if depth > MAX_JSON_DEPTH {
        return Err(LuaError::RuntimeError(
            "mse snapshot is nested too deeply.".into(),
        ));
    }
    match value {
        JsonValue::Null => Ok(Value::Nil),
        JsonValue::Bool(value) => Ok(Value::Boolean(*value)),
        JsonValue::Number(value) => value
            .as_i64()
            .map(Value::Integer)
            .or_else(|| value.as_f64().map(Value::Number))
            .ok_or_else(|| LuaError::RuntimeError("invalid numeric value in mse snapshot.".into())),
        JsonValue::String(value) => Ok(Value::String(lua.create_string(value)?)),
        JsonValue::Array(values) => {
            let table = lua.create_table_with_capacity(values.len(), 0)?;
            for (index, value) in values.iter().enumerate() {
                table.set(index + 1, json_to_lua(lua, value, depth + 1)?)?;
            }
            Ok(Value::Table(table))
        }
        JsonValue::Object(values) => {
            let table = lua.create_table_with_capacity(0, values.len())?;
            for (key, value) in values {
                table.set(key.as_str(), json_to_lua(lua, value, depth + 1)?)?;
            }
            Ok(Value::Table(table))
        }
    }
}

fn lua_scalar_key(value: &Value) -> LuaResult<String> {
    match value {
        Value::Nil => Ok(String::new()),
        Value::String(value) => Ok(value.to_string_lossy()),
        Value::Integer(value) => Ok(value.to_string()),
        Value::Number(value) if value.is_finite() => Ok(value.to_string()),
        _ => Err(LuaError::RuntimeError(
            "mse lookup expects a string or numeric id.".into(),
        )),
    }
}

fn json_scalar_key(value: Option<&JsonValue>) -> String {
    match value {
        Some(JsonValue::String(value)) => value.clone(),
        Some(JsonValue::Number(value)) => value.to_string(),
        _ => String::new(),
    }
}

fn document_info(lua: &Lua, document: &Rc<RefCell<ScriptDocumentState>>) -> LuaResult<Table> {
    let snapshot = {
        let document = document.borrow();
        let layer = document.active_layer.borrow();
        let image = document.active_image.borrow();
        (
            document.document_id.clone(),
            document.document_name.clone(),
            document.document_file_path.clone(),
            document.document_width,
            document.document_height,
            image.mode.document_color_mode().to_string(),
            document.active_frame_number(),
            layer.id.clone(),
            layer.name.clone(),
            image.width as u32,
            image.height as u32,
            document.offset_x,
            document.offset_y,
            layer.opacity,
            layer.visible,
            layer.locked,
            image.mode.document_format().to_string(),
        )
    };
    let info = lua.create_table()?;
    info.set("id", snapshot.0)?;
    info.set("name", snapshot.1)?;
    info.set("filePath", snapshot.2)?;
    info.set("width", snapshot.3)?;
    info.set("height", snapshot.4)?;
    info.set("colorMode", snapshot.5)?;
    info.set("frame", snapshot.6)?;
    let active_layer = lua.create_table()?;
    active_layer.set("id", snapshot.7)?;
    active_layer.set("name", snapshot.8)?;
    active_layer.set("width", snapshot.9)?;
    active_layer.set("height", snapshot.10)?;
    active_layer.set("x", snapshot.11)?;
    active_layer.set("y", snapshot.12)?;
    active_layer.set("opacity", snapshot.13)?;
    active_layer.set("visible", snapshot.14)?;
    active_layer.set("locked", snapshot.15)?;
    active_layer.set("format", snapshot.16)?;
    info.set("activeLayer", active_layer)?;
    Ok(info)
}

fn selection_info(lua: &Lua, document: &Rc<RefCell<ScriptDocumentState>>) -> LuaResult<Table> {
    let selection = document.borrow().selection.clone();
    let (exists, empty, x, y, width, height, has_mask, selected_pixels) = match selection {
        Some(selection) => {
            let selected_pixels = selection
                .mask
                .as_ref()
                .map(|mask| mask.iter().filter(|value| **value != 0).count() as u64)
                .unwrap_or_else(|| selection.width as u64 * selection.height as u64);
            (
                true,
                selected_pixels == 0,
                selection.x,
                selection.y,
                selection.width,
                selection.height,
                selection.mask.is_some(),
                selected_pixels,
            )
        }
        None => (false, true, 0, 0, 0, 0, false, 0),
    };
    let info = lua.create_table()?;
    info.set("exists", exists)?;
    info.set("empty", empty)?;
    info.set("hasMask", has_mask)?;
    info.set("selectedPixels", selected_pixels)?;
    let bounds = lua.create_table()?;
    bounds.set("x", x)?;
    bounds.set("y", y)?;
    bounds.set("width", width)?;
    bounds.set("height", height)?;
    info.set("bounds", bounds)?;
    Ok(info)
}
