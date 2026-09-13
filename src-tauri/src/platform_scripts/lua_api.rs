use std::{
    cell::{Cell, RefCell},
    collections::HashMap,
    rc::{Rc, Weak},
    sync::atomic::{AtomicU64, Ordering},
    time::{Duration, Instant},
};

use mlua::{
    AnyUserData, Error as LuaError, Function, HookTriggers, Lua, LuaOptions, MultiValue,
    RegistryKey, Result as LuaResult, StdLib, Table, Thread, ThreadStatus, UserData,
    UserDataFields, UserDataMethods, Value, Variadic, VmState,
};
use serde_json::{Number as JsonNumber, Value as JsonValue};

use super::{
    LuaScriptBatch, LuaScriptContext, LuaScriptCreatedDocument, LuaScriptCreatedLayer,
    LuaScriptDialog, LuaScriptDialogAction, LuaScriptDialogControl, LuaScriptOperation,
    LuaScriptPixelChange, LuaScriptSelectionContext, LuaScriptSurfaceChange,
    LuaScriptSurfaceSnapshot, MAX_CHANGED_PIXELS, MAX_EXECUTION_MILLIS, MAX_IMAGE_PIXELS,
    MAX_INSTRUCTIONS, MAX_LUA_MEMORY_BYTES, MAX_OUTPUT_BYTES,
};

#[path = "mse_api.rs"]
mod mse_api;

const HOOK_INSTRUCTION_INTERVAL: u32 = 10_000;
const MAX_ALLOCATED_IMAGE_PIXELS: usize = MAX_IMAGE_PIXELS * 4;
const DIALOG_CALLBACKS_GLOBAL: &str = "__moonsprite_dialog_callbacks";
static NEXT_SCRIPT_OBJECT_ID: AtomicU64 = AtomicU64::new(1);

fn next_script_object_id(prefix: &str) -> String {
    format!(
        "{prefix}-{}",
        NEXT_SCRIPT_OBJECT_ID.fetch_add(1, Ordering::Relaxed)
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ScriptPixelMode {
    Rgba,
    Grayscale,
    Indexed,
}

impl ScriptPixelMode {
    fn from_context(context: &LuaScriptContext) -> Result<Self, String> {
        match context.color_mode.as_str() {
            "rgba" if context.layer_format == "rgba" => Ok(Self::Rgba),
            "grayscale" if context.layer_format == "rgba" => Ok(Self::Grayscale),
            "indexed" if context.layer_format == "indexed" => Ok(Self::Indexed),
            _ => Err("The active image color mode is not supported by this Lua runtime.".into()),
        }
    }

    fn from_aseprite_value(value: i64) -> LuaResult<Self> {
        match value {
            0 => Ok(Self::Rgba),
            1 => Ok(Self::Grayscale),
            2 => Ok(Self::Indexed),
            _ => Err(LuaError::RuntimeError(
                "Image color mode must be ColorMode.RGB, GRAY, or INDEXED.".into(),
            )),
        }
    }

    fn aseprite_value_from_document(self, value: u32) -> u32 {
        match self {
            Self::Rgba | Self::Indexed => value,
            Self::Grayscale => {
                let gray = value & 0xff;
                let alpha = (value >> 24) & 0xff;
                gray | (alpha << 8)
            }
        }
    }

    fn document_value_from_aseprite(self, value: u32) -> u32 {
        match self {
            Self::Rgba | Self::Indexed => value,
            Self::Grayscale => {
                let gray = value & 0xff;
                let alpha = (value >> 8) & 0xff;
                gray | (gray << 8) | (gray << 16) | (alpha << 24)
            }
        }
    }

    fn aseprite_color_mode(self) -> i32 {
        match self {
            Self::Rgba => 0,
            Self::Grayscale => 1,
            Self::Indexed => 2,
        }
    }

    fn document_format(self) -> &'static str {
        match self {
            Self::Rgba | Self::Grayscale => "rgba",
            Self::Indexed => "indexed",
        }
    }

    fn document_color_mode(self) -> &'static str {
        match self {
            Self::Rgba => "rgba",
            Self::Grayscale => "grayscale",
            Self::Indexed => "indexed",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ScriptPoint {
    x: i32,
    y: i32,
}

impl UserData for ScriptPoint {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("x", |_, point| Ok(point.x));
        fields.add_field_method_get("y", |_, point| Ok(point.y));
        fields.add_field_method_set("x", |_, point, value: i32| {
            point.x = value;
            Ok(())
        });
        fields.add_field_method_set("y", |_, point, value: i32| {
            point.y = value;
            Ok(())
        });
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ScriptRectangle {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

impl UserData for ScriptRectangle {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("x", |_, rect| Ok(rect.x));
        fields.add_field_method_get("y", |_, rect| Ok(rect.y));
        fields.add_field_method_get("width", |_, rect| Ok(rect.width));
        fields.add_field_method_get("height", |_, rect| Ok(rect.height));
    }
}

fn point_from_value(value: Value) -> LuaResult<ScriptPoint> {
    match value {
        Value::UserData(value) if value.is::<ScriptPoint>() => Ok(*value.borrow::<ScriptPoint>()?),
        Value::Table(table) => Ok(ScriptPoint {
            x: table.get::<Option<i32>>("x")?.unwrap_or(0),
            y: table.get::<Option<i32>>("y")?.unwrap_or(0),
        }),
        Value::Nil => Ok(ScriptPoint { x: 0, y: 0 }),
        _ => Err(LuaError::RuntimeError(
            "Expected a Point value or a table with x/y fields.".into(),
        )),
    }
}

#[derive(Clone, Copy, Debug)]
struct ScriptColor {
    red: u8,
    green: u8,
    blue: u8,
    alpha: u8,
}

impl ScriptColor {
    fn from_rgba(value: u32) -> Self {
        Self {
            red: (value & 0xff) as u8,
            green: ((value >> 8) & 0xff) as u8,
            blue: ((value >> 16) & 0xff) as u8,
            alpha: ((value >> 24) & 0xff) as u8,
        }
    }

    fn rgba(self) -> u32 {
        pack_rgba(self.red, self.green, self.blue, self.alpha)
    }

    fn hsv(self) -> (f64, f64, f64) {
        rgb_to_hsv(self.red, self.green, self.blue)
    }

    fn set_hsv(&mut self, hue: f64, saturation: f64, value: f64) {
        let (red, green, blue) = hsv_to_rgb(hue, saturation, value);
        self.red = red;
        self.green = green;
        self.blue = blue;
    }

    fn serialized(self) -> JsonValue {
        JsonValue::Object(serde_json::Map::from_iter([
            ("r".into(), JsonValue::Number(self.red.into())),
            ("g".into(), JsonValue::Number(self.green.into())),
            ("b".into(), JsonValue::Number(self.blue.into())),
            ("a".into(), JsonValue::Number(self.alpha.into())),
        ]))
    }
}

impl UserData for ScriptColor {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("red", |_, color| Ok(color.red));
        fields.add_field_method_get("green", |_, color| Ok(color.green));
        fields.add_field_method_get("blue", |_, color| Ok(color.blue));
        fields.add_field_method_get("alpha", |_, color| Ok(color.alpha));
        fields.add_field_method_get("rgbaPixel", |_, color| Ok(color.rgba()));
        fields.add_field_method_get("hsvHue", |_, color| Ok(color.hsv().0));
        fields.add_field_method_get("hsvSaturation", |_, color| Ok(color.hsv().1));
        fields.add_field_method_get("hsvValue", |_, color| Ok(color.hsv().2));
        fields.add_field_method_set("red", |_, color, value: i64| {
            color.red = clamp_u8(value);
            Ok(())
        });
        fields.add_field_method_set("green", |_, color, value: i64| {
            color.green = clamp_u8(value);
            Ok(())
        });
        fields.add_field_method_set("blue", |_, color, value: i64| {
            color.blue = clamp_u8(value);
            Ok(())
        });
        fields.add_field_method_set("alpha", |_, color, value: i64| {
            color.alpha = clamp_u8(value);
            Ok(())
        });
        fields.add_field_method_set("hsvHue", |_, color, value: f64| {
            let (_, saturation, brightness) = color.hsv();
            color.set_hsv(value, saturation, brightness);
            Ok(())
        });
        fields.add_field_method_set("hsvSaturation", |_, color, value: f64| {
            let (hue, _, brightness) = color.hsv();
            color.set_hsv(hue, value, brightness);
            Ok(())
        });
        fields.add_field_method_set("hsvValue", |_, color, value: f64| {
            let (hue, saturation, _) = color.hsv();
            color.set_hsv(hue, saturation, value);
            Ok(())
        });
    }
}

#[derive(Clone, Debug)]
struct ScriptPaletteEntry {
    id: u32,
    color: ScriptColor,
}

#[derive(Clone, Debug)]
struct ScriptPalette {
    entries: Vec<ScriptPaletteEntry>,
    document: Weak<RefCell<ScriptDocumentState>>,
}

impl UserData for ScriptPalette {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("size", |_, palette| Ok(palette.entries.len()));
    }

    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        methods.add_method("getColor", |lua, palette, value: i64| {
            let id = value.max(0) as u32;
            let entry = palette
                .entries
                .iter()
                .find(|entry| entry.id == id)
                .or_else(|| palette.entries.get(id as usize));
            match entry {
                Some(entry) => Ok(Value::UserData(lua.create_userdata(entry.color)?)),
                None => Ok(Value::Nil),
            }
        });
        methods.add_method("getColorIndex", |_, palette, value: Value| {
            let color = script_color_from_value(value)?;
            palette
                .entries
                .iter()
                .min_by_key(|entry| {
                    let channel = |left: u8, right: u8| {
                        let difference = left as i32 - right as i32;
                        difference * difference
                    };
                    channel(entry.color.red, color.red)
                        + channel(entry.color.green, color.green)
                        + channel(entry.color.blue, color.blue)
                        + channel(entry.color.alpha, color.alpha)
                })
                .map(|entry| entry.id)
                .ok_or_else(|| LuaError::RuntimeError("The sprite palette is empty.".into()))
        });
        methods.add_method_mut("setColor", |_, palette, (value, color): (i64, Value)| {
            let id = value.max(0) as u32;
            let color = script_color_from_value(color)?;
            let entry_index = palette
                .entries
                .iter()
                .position(|entry| entry.id == id)
                .or_else(|| ((id as usize) < palette.entries.len()).then_some(id as usize))
                .ok_or_else(|| LuaError::RuntimeError("Palette index is out of range.".into()))?;
            let entry = &mut palette.entries[entry_index];
            entry.color = color;
            if let Some(document) = palette.document.upgrade() {
                document
                    .borrow_mut()
                    .queue_mse_operation(LuaScriptOperation {
                        path: "palette.update".into(),
                        arguments: serde_json::json!({
                            "id": entry.id,
                            "color": color.serialized(),
                        }),
                    });
            }
            Ok(())
        });
    }
}

fn script_palette_entries(document: &ScriptDocumentState) -> Vec<ScriptPaletteEntry> {
    document
        .mse_snapshot
        .get("palette")
        .and_then(|palette| palette.get("entries"))
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .filter_map(|entry| {
            let color = entry.get("color")?;
            Some(ScriptPaletteEntry {
                id: entry.get("id")?.as_u64()?.min(u32::MAX as u64) as u32,
                color: ScriptColor {
                    red: color.get("r")?.as_u64()?.min(255) as u8,
                    green: color.get("g")?.as_u64()?.min(255) as u8,
                    blue: color.get("b")?.as_u64()?.min(255) as u8,
                    alpha: color
                        .get("a")
                        .and_then(JsonValue::as_u64)
                        .unwrap_or(255)
                        .min(255) as u8,
                },
            })
        })
        .collect()
}

#[derive(Clone, Debug)]
struct ScriptFrame {
    id: String,
    number: u32,
    duration_ms: u32,
    disabled: bool,
    document: Weak<RefCell<ScriptDocumentState>>,
}

impl UserData for ScriptFrame {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("frameNumber", |_, frame| Ok(frame.number));
        fields.add_field_method_get(
            "duration",
            |_, frame| Ok(frame.duration_ms as f64 / 1_000.0),
        );
        fields.add_field_method_set("duration", |_, frame, seconds: f64| {
            if !seconds.is_finite() || seconds <= 0.0 {
                return Err(LuaError::RuntimeError(
                    "Frame.duration must be a positive number of seconds.".into(),
                ));
            }
            let duration = (seconds * 1_000.0).round().clamp(1.0, 60_000.0) as u32;
            if let Some(document) = frame.document.upgrade() {
                document
                    .borrow_mut()
                    .queue_mse_operation(LuaScriptOperation {
                        path: "animation.setFrameDuration".into(),
                        arguments: serde_json::json!({ "frame": frame.id, "duration": duration }),
                    });
            }
            frame.duration_ms = duration;
            Ok(())
        });
        fields.add_field_method_get("isDisabled", |_, frame| Ok(frame.disabled));
    }
}

fn script_frames(document: &Rc<RefCell<ScriptDocumentState>>) -> Vec<ScriptFrame> {
    let state = document.borrow();
    state
        .mse_snapshot
        .get("animation")
        .and_then(|animation| animation.get("frames"))
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(index, frame)| {
            Some(ScriptFrame {
                id: frame.get("id")?.as_str()?.to_string(),
                number: frame
                    .get("number")
                    .and_then(JsonValue::as_u64)
                    .unwrap_or(index as u64 + 1)
                    .min(u32::MAX as u64) as u32,
                duration_ms: frame
                    .get("duration")
                    .and_then(JsonValue::as_u64)
                    .unwrap_or(100)
                    .clamp(1, 60_000) as u32,
                disabled: frame
                    .get("disabled")
                    .and_then(JsonValue::as_bool)
                    .unwrap_or(false),
                document: Rc::downgrade(document),
            })
        })
        .collect()
}

fn frame_number_from_value(value: &Value, fallback: u32) -> LuaResult<u32> {
    match value {
        Value::Nil => Ok(fallback.max(1)),
        Value::Integer(value) => Ok((*value).max(1) as u32),
        Value::Number(value) if value.is_finite() => Ok(value.round().max(1.0) as u32),
        Value::UserData(value) if value.is::<ScriptFrame>() => {
            Ok(value.borrow::<ScriptFrame>()?.number.max(1))
        }
        _ => Err(LuaError::RuntimeError(
            "Expected a frame number or Frame value.".into(),
        )),
    }
}

fn script_frame_for_number(
    document: &Rc<RefCell<ScriptDocumentState>>,
    number: u32,
) -> ScriptFrame {
    script_frames(document)
        .into_iter()
        .find(|frame| frame.number == number)
        .unwrap_or_else(|| ScriptFrame {
            id: format!("frame-{number}"),
            number,
            duration_ms: 100,
            disabled: false,
            document: Rc::downgrade(document),
        })
}

#[derive(Clone, Debug)]
struct ScriptTag {
    id: String,
    name: String,
    start_frame_id: String,
    end_frame_id: String,
    direction: String,
    repeat_count: Option<u32>,
    document: Weak<RefCell<ScriptDocumentState>>,
}

impl ScriptTag {
    fn queue_update(&self) {
        if let Some(document) = self.document.upgrade() {
            document
                .borrow_mut()
                .queue_mse_operation(LuaScriptOperation {
                    path: "animation.updateLoop".into(),
                    arguments: serde_json::json!({
                        "id": self.id,
                        "name": self.name,
                        "startFrameId": self.start_frame_id,
                        "endFrameId": self.end_frame_id,
                        "direction": self.direction,
                        "repeatCount": self.repeat_count,
                    }),
                });
        }
    }

    fn frame(&self, id: &str) -> Option<ScriptFrame> {
        let document = self.document.upgrade()?;
        script_frames(&document)
            .into_iter()
            .find(|frame| frame.id == id)
    }
}

impl UserData for ScriptTag {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("name", |_, tag| Ok(tag.name.clone()));
        fields.add_field_method_set("name", |_, tag, value: String| {
            tag.name = value;
            tag.queue_update();
            Ok(())
        });
        fields.add_field_method_get("fromFrame", |_, tag| Ok(tag.frame(&tag.start_frame_id)));
        fields.add_field_method_set("fromFrame", |_, tag, value: Value| {
            let document = tag
                .document
                .upgrade()
                .ok_or_else(|| LuaError::RuntimeError("The tag is no longer available.".into()))?;
            let number = frame_number_from_value(&value, 1)?;
            let frame = script_frame_for_number(&document, number);
            tag.start_frame_id = frame.id;
            tag.queue_update();
            Ok(())
        });
        fields.add_field_method_get("toFrame", |_, tag| Ok(tag.frame(&tag.end_frame_id)));
        fields.add_field_method_set("toFrame", |_, tag, value: Value| {
            let document = tag
                .document
                .upgrade()
                .ok_or_else(|| LuaError::RuntimeError("The tag is no longer available.".into()))?;
            let number = frame_number_from_value(&value, 1)?;
            let frame = script_frame_for_number(&document, number);
            tag.end_frame_id = frame.id;
            tag.queue_update();
            Ok(())
        });
        fields.add_field_method_get("repeats", |_, tag| Ok(tag.repeat_count.unwrap_or(0)));
        fields.add_field_method_set("repeats", |_, tag, value: i64| {
            tag.repeat_count = (value > 0).then_some(value as u32);
            tag.queue_update();
            Ok(())
        });
        fields.add_field_method_get("aniDir", |_, tag| {
            Ok(if tag.direction == "reverse" { 1 } else { 0 })
        });
        fields.add_field_method_set("aniDir", |_, tag, value: i64| {
            tag.direction = if value == 1 { "reverse" } else { "forward" }.into();
            tag.queue_update();
            Ok(())
        });
    }
}

fn script_tags(document: &Rc<RefCell<ScriptDocumentState>>) -> Vec<ScriptTag> {
    let state = document.borrow();
    state
        .mse_snapshot
        .get("animation")
        .and_then(|animation| animation.get("loops"))
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tag| {
            Some(ScriptTag {
                id: tag.get("id")?.as_str()?.to_string(),
                name: tag
                    .get("name")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("Tag")
                    .to_string(),
                start_frame_id: tag.get("startFrameId")?.as_str()?.to_string(),
                end_frame_id: tag.get("endFrameId")?.as_str()?.to_string(),
                direction: tag
                    .get("direction")
                    .and_then(JsonValue::as_str)
                    .unwrap_or("forward")
                    .to_string(),
                repeat_count: tag
                    .get("repeatCount")
                    .and_then(JsonValue::as_u64)
                    .map(|value| value.min(u32::MAX as u64) as u32),
                document: Rc::downgrade(document),
            })
        })
        .collect()
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ScriptImageData {
    mode: ScriptPixelMode,
    width: usize,
    height: usize,
    pixels: Vec<u32>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct ActiveSurfaceSnapshot {
    mode: ScriptPixelMode,
    width: usize,
    height: usize,
    offset_x: i32,
    offset_y: i32,
    pixels: Vec<u32>,
}

impl ActiveSurfaceSnapshot {
    fn serialized(&self) -> LuaScriptSurfaceSnapshot {
        LuaScriptSurfaceSnapshot {
            format: self.mode.document_format().into(),
            width: self.width as u32,
            height: self.height as u32,
            offset_x: self.offset_x,
            offset_y: self.offset_y,
            pixels: self
                .pixels
                .iter()
                .copied()
                .map(|value| self.mode.document_value_from_aseprite(value))
                .collect(),
        }
    }
}

#[derive(Clone, Debug)]
struct ScriptLayerData {
    id: String,
    name: String,
    kind: String,
    opacity: u8,
    visible: bool,
    locked: bool,
    continuous: bool,
    parent_group_id: Option<String>,
    stack_index: u32,
}

#[derive(Clone, Debug)]
struct ScriptCreatedLayerState {
    layer: Rc<RefCell<ScriptLayerData>>,
    image: Rc<RefCell<ScriptImageData>>,
    offset_x: i32,
    offset_y: i32,
    frame_number: u32,
}

#[derive(Clone, Debug)]
struct ScriptKnownCelState {
    id: String,
    layer_id: String,
    frame_id: String,
    frame_number: u32,
    image: Rc<RefCell<ScriptImageData>>,
    offset_x: i32,
    offset_y: i32,
}

#[derive(Clone, Debug)]
struct ScriptKnownCelSnapshot {
    state: Rc<RefCell<ScriptKnownCelState>>,
    image: ScriptImageData,
    offset_x: i32,
    offset_y: i32,
}

#[derive(Clone, Debug)]
struct ScriptCreatedDocumentState {
    name: String,
    width: u32,
    height: u32,
    mode: ScriptPixelMode,
    layers: Vec<Rc<RefCell<ScriptCreatedLayerState>>>,
    active_layer: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ActiveSurfaceRef {
    Target,
    CreatedLayer(usize),
    CreatedDocument { document: usize, layer: usize },
}

#[derive(Clone, Debug)]
struct ScriptStateCheckpoint {
    surface: ActiveSurfaceSnapshot,
    created_layer_count: usize,
    created_document_count: usize,
    active_surface: ActiveSurfaceRef,
    active_image: Rc<RefCell<ScriptImageData>>,
    active_offset_x: i32,
    active_offset_y: i32,
    active_layer: Rc<RefCell<ScriptLayerData>>,
    known_cels: Vec<ScriptKnownCelSnapshot>,
}

#[derive(Debug)]
struct PendingBatch {
    label: String,
    explicit: bool,
    before: ScriptStateCheckpoint,
    operations: Vec<LuaScriptOperation>,
}

#[derive(Debug)]
struct ScriptDocumentState {
    document_id: String,
    document_name: String,
    document_width: u32,
    document_height: u32,
    document_file_path: String,
    mse_snapshot: JsonValue,
    selection: Option<LuaScriptSelectionContext>,
    target_mode: ScriptPixelMode,
    target_image: Rc<RefCell<ScriptImageData>>,
    target_offset_x: i32,
    target_offset_y: i32,
    active_surface: ActiveSurfaceRef,
    active_image: Rc<RefCell<ScriptImageData>>,
    offset_x: i32,
    offset_y: i32,
    active_layer: Rc<RefCell<ScriptLayerData>>,
    known_cels: Vec<Rc<RefCell<ScriptKnownCelState>>>,
    frame_number: u32,
    transparent_color: u32,
    created_layers: Vec<Rc<RefCell<ScriptCreatedLayerState>>>,
    created_documents: Vec<Rc<RefCell<ScriptCreatedDocumentState>>>,
    default_label: String,
    pending: Option<PendingBatch>,
    batches: Vec<LuaScriptBatch>,
    total_change_count: usize,
}

impl ScriptDocumentState {
    fn snapshot(&self) -> ActiveSurfaceSnapshot {
        let image = self.target_image.borrow();
        ActiveSurfaceSnapshot {
            mode: image.mode,
            width: image.width,
            height: image.height,
            offset_x: self.target_offset_x,
            offset_y: self.target_offset_y,
            pixels: image.pixels.clone(),
        }
    }

    fn checkpoint(&self) -> ScriptStateCheckpoint {
        ScriptStateCheckpoint {
            surface: self.snapshot(),
            created_layer_count: self.created_layers.len(),
            created_document_count: self.created_documents.len(),
            active_surface: self.active_surface,
            active_image: self.active_image.clone(),
            active_offset_x: self.offset_x,
            active_offset_y: self.offset_y,
            active_layer: self.active_layer.clone(),
            known_cels: self
                .known_cels
                .iter()
                .map(|state| {
                    let state_ref = state.borrow();
                    let image = state_ref.image.borrow().clone();
                    ScriptKnownCelSnapshot {
                        state: state.clone(),
                        image,
                        offset_x: state_ref.offset_x,
                        offset_y: state_ref.offset_y,
                    }
                })
                .collect(),
        }
    }

    fn restore_surface(&mut self, snapshot: &ActiveSurfaceSnapshot) {
        *self.target_image.borrow_mut() = ScriptImageData {
            mode: snapshot.mode,
            width: snapshot.width,
            height: snapshot.height,
            pixels: snapshot.pixels.clone(),
        };
        self.target_offset_x = snapshot.offset_x;
        self.target_offset_y = snapshot.offset_y;
        if self.active_surface == ActiveSurfaceRef::Target {
            self.active_image = self.target_image.clone();
            self.offset_x = snapshot.offset_x;
            self.offset_y = snapshot.offset_y;
        }
    }

    fn restore_checkpoint(&mut self, checkpoint: &ScriptStateCheckpoint) {
        self.restore_surface(&checkpoint.surface);
        self.created_layers.truncate(checkpoint.created_layer_count);
        self.created_documents
            .truncate(checkpoint.created_document_count);
        self.active_surface = checkpoint.active_surface;
        self.active_image = checkpoint.active_image.clone();
        self.offset_x = checkpoint.active_offset_x;
        self.offset_y = checkpoint.active_offset_y;
        self.active_layer = checkpoint.active_layer.clone();
        for snapshot in &checkpoint.known_cels {
            let mut state = snapshot.state.borrow_mut();
            *state.image.borrow_mut() = snapshot.image.clone();
            state.offset_x = snapshot.offset_x;
            state.offset_y = snapshot.offset_y;
        }
    }

    fn restore_invocation(&mut self, checkpoint: &ScriptStateCheckpoint) {
        self.restore_checkpoint(checkpoint);
        self.pending = None;
        self.batches.clear();
        self.total_change_count = 0;
    }

    fn replace_active_image(&mut self, image: Rc<RefCell<ScriptImageData>>) {
        self.active_image = image.clone();
        match self.active_surface {
            ActiveSurfaceRef::Target => self.target_image = image,
            ActiveSurfaceRef::CreatedLayer(index) => {
                if let Some(layer) = self.created_layers.get(index) {
                    layer.borrow_mut().image = image;
                }
            }
            ActiveSurfaceRef::CreatedDocument { document, layer } => {
                if let Some(layer) = self
                    .created_documents
                    .get(document)
                    .and_then(|sprite| sprite.borrow().layers.get(layer).cloned())
                {
                    layer.borrow_mut().image = image;
                }
            }
        }
    }

    fn set_active_position(&mut self, x: i32, y: i32) {
        self.offset_x = x;
        self.offset_y = y;
        match self.active_surface {
            ActiveSurfaceRef::Target => {
                self.target_offset_x = x;
                self.target_offset_y = y;
            }
            ActiveSurfaceRef::CreatedLayer(index) => {
                if let Some(layer) = self.created_layers.get(index) {
                    let mut layer = layer.borrow_mut();
                    layer.offset_x = x;
                    layer.offset_y = y;
                }
            }
            ActiveSurfaceRef::CreatedDocument { document, layer } => {
                if let Some(layer) = self
                    .created_documents
                    .get(document)
                    .and_then(|sprite| sprite.borrow().layers.get(layer).cloned())
                {
                    let mut layer = layer.borrow_mut();
                    layer.offset_x = x;
                    layer.offset_y = y;
                }
            }
        }
    }

    fn active_sprite_ref(&self) -> Option<usize> {
        match self.active_surface {
            ActiveSurfaceRef::CreatedDocument { document, .. } => Some(document),
            _ => None,
        }
    }

    fn active_frame_number(&self) -> u32 {
        match self.active_surface {
            ActiveSurfaceRef::Target => self.frame_number,
            ActiveSurfaceRef::CreatedLayer(index) => self
                .created_layers
                .get(index)
                .map(|layer| layer.borrow().frame_number)
                .unwrap_or(self.frame_number),
            ActiveSurfaceRef::CreatedDocument { document, layer } => self
                .created_documents
                .get(document)
                .and_then(|sprite| sprite.borrow().layers.get(layer).cloned())
                .map(|layer| layer.borrow().frame_number)
                .unwrap_or(1),
        }
    }

    fn serialize_created_layer(
        &self,
        layer: &Rc<RefCell<ScriptCreatedLayerState>>,
    ) -> LuaScriptCreatedLayer {
        let layer = layer.borrow();
        let metadata = layer.layer.borrow();
        let image = layer.image.borrow();
        LuaScriptCreatedLayer {
            id: metadata.id.clone(),
            name: metadata.name.clone(),
            opacity: metadata.opacity,
            visible: metadata.visible,
            locked: metadata.locked,
            frame_number: layer.frame_number,
            parent_group_id: metadata.parent_group_id.clone(),
            stack_index: metadata.stack_index,
            surface: ActiveSurfaceSnapshot {
                mode: image.mode,
                width: image.width,
                height: image.height,
                offset_x: layer.offset_x,
                offset_y: layer.offset_y,
                pixels: image.pixels.clone(),
            }
            .serialized(),
        }
    }

    fn created_layers_since(&self, index: usize) -> Vec<LuaScriptCreatedLayer> {
        self.created_layers[index..]
            .iter()
            .map(|layer| self.serialize_created_layer(layer))
            .collect()
    }

    fn created_documents_since(&self, index: usize) -> Vec<LuaScriptCreatedDocument> {
        self.created_documents[index..]
            .iter()
            .map(|sprite| {
                let sprite = sprite.borrow();
                LuaScriptCreatedDocument {
                    name: sprite.name.clone(),
                    width: sprite.width,
                    height: sprite.height,
                    color_mode: sprite.mode.document_color_mode().into(),
                    layers: sprite
                        .layers
                        .iter()
                        .map(|layer| self.serialize_created_layer(layer))
                        .collect(),
                }
            })
            .collect()
    }

    fn ensure_pending(&mut self) {
        if self.pending.is_none() {
            self.pending = Some(PendingBatch {
                label: self.default_label.clone(),
                explicit: false,
                before: self.checkpoint(),
                operations: Vec::new(),
            });
        }
    }

    fn queue_mse_operation(&mut self, operation: LuaScriptOperation) {
        self.ensure_pending();
        if let Some(batch) = &mut self.pending {
            batch.operations.push(operation);
        }
    }

    fn begin_explicit_transaction(&mut self, label: String) -> LuaResult<()> {
        if self.pending.as_ref().is_some_and(|batch| batch.explicit) {
            return Err(LuaError::RuntimeError(
                "Nested app.transaction() calls are not supported yet.".into(),
            ));
        }
        self.flush_pending()?;
        self.pending = Some(PendingBatch {
            label: clean_label(&label, &self.default_label),
            explicit: true,
            before: self.checkpoint(),
            operations: Vec::new(),
        });
        Ok(())
    }

    fn finish_explicit_transaction(&mut self) -> LuaResult<()> {
        if !self.pending.as_ref().is_some_and(|batch| batch.explicit) {
            return Err(LuaError::RuntimeError(
                "app.transaction() finished without an active transaction.".into(),
            ));
        }
        self.flush_pending()
    }

    fn rollback_explicit_transaction(&mut self) {
        let Some(batch) = self.pending.take() else {
            return;
        };
        if !batch.explicit {
            self.pending = Some(batch);
            return;
        }
        self.restore_checkpoint(&batch.before);
        self.pending = None;
    }

    fn flush_pending(&mut self) -> LuaResult<()> {
        let Some(mut batch) = self.pending.take() else {
            return Ok(());
        };
        let after = self.snapshot();
        let mut known_changed_count = 0usize;
        for before in &batch.before.known_cels {
            let state = before.state.borrow();
            let image = state.image.borrow();
            let image_changed = before.image != *image;
            let position_changed =
                before.offset_x != state.offset_x || before.offset_y != state.offset_y;
            if !image_changed && !position_changed {
                continue;
            }
            known_changed_count = known_changed_count.saturating_add(
                if before.image.mode == image.mode
                    && before.image.width == image.width
                    && before.image.height == image.height
                {
                    before
                        .image
                        .pixels
                        .iter()
                        .zip(image.pixels.iter())
                        .filter(|(left, right)| left != right)
                        .count()
                } else {
                    before.image.pixels.len().max(image.pixels.len())
                },
            );
            batch.operations.push(LuaScriptOperation {
                path: "animation.setCelSurface".into(),
                arguments: serde_json::json!({
                    "layerId": state.layer_id,
                    "frameId": state.frame_id,
                    "celId": state.id,
                    "before": ActiveSurfaceSnapshot {
                        mode: before.image.mode,
                        width: before.image.width,
                        height: before.image.height,
                        offset_x: before.offset_x,
                        offset_y: before.offset_y,
                        pixels: before.image.pixels.clone(),
                    }.serialized(),
                    "after": ActiveSurfaceSnapshot {
                        mode: image.mode,
                        width: image.width,
                        height: image.height,
                        offset_x: state.offset_x,
                        offset_y: state.offset_y,
                        pixels: image.pixels.clone(),
                    }.serialized(),
                }),
            });
        }
        if batch.before.surface == after && batch.operations.is_empty() {
            return Ok(());
        }
        let same_geometry = batch.before.surface.mode == after.mode
            && batch.before.surface.width == after.width
            && batch.before.surface.height == after.height
            && batch.before.surface.offset_x == after.offset_x
            && batch.before.surface.offset_y == after.offset_y;
        let changed_count = if same_geometry {
            batch
                .before
                .surface
                .pixels
                .iter()
                .zip(after.pixels.iter())
                .filter(|(before, after)| before != after)
                .count()
        } else {
            batch.before.surface.pixels.len().max(after.pixels.len())
        };
        let changed_count = changed_count.saturating_add(known_changed_count);
        if self.total_change_count.saturating_add(changed_count) > MAX_CHANGED_PIXELS {
            return Err(LuaError::RuntimeError(format!(
                "The script changed more than {MAX_CHANGED_PIXELS} pixels."
            )));
        }
        self.total_change_count += changed_count;
        if same_geometry {
            let changes = batch
                .before
                .surface
                .pixels
                .iter()
                .copied()
                .zip(after.pixels.iter().copied())
                .enumerate()
                .filter_map(|(index, (before, after))| {
                    (before != after).then_some(LuaScriptPixelChange {
                        index: index as u32,
                        before: self.target_mode.document_value_from_aseprite(before),
                        after: self.target_mode.document_value_from_aseprite(after),
                    })
                })
                .collect::<Vec<_>>();
            if !changes.is_empty() {
                self.batches.push(LuaScriptBatch {
                    label: batch.label,
                    changes,
                    surface_change: None,
                    operations: batch.operations,
                });
            } else if !batch.operations.is_empty() {
                self.batches.push(LuaScriptBatch {
                    label: batch.label,
                    changes: Vec::new(),
                    surface_change: None,
                    operations: batch.operations,
                });
            }
        } else {
            self.batches.push(LuaScriptBatch {
                label: batch.label,
                changes: Vec::new(),
                surface_change: Some(LuaScriptSurfaceChange {
                    before: batch.before.surface.serialized(),
                    after: after.serialized(),
                }),
                operations: batch.operations,
            });
        }
        Ok(())
    }
}

#[derive(Clone, Debug)]
struct ScriptImage {
    data: Rc<RefCell<ScriptImageData>>,
    document: Weak<RefCell<ScriptDocumentState>>,
    allocated_pixels: Rc<Cell<usize>>,
    transparent_color: u32,
}

impl ScriptImage {
    fn prepare_mutation(&self) {
        if let Some(document) = self.document.upgrade() {
            document.borrow_mut().ensure_pending();
        }
    }
}

impl UserData for ScriptImage {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("width", |_, image| Ok(image.data.borrow().width));
        fields.add_field_method_get("height", |_, image| Ok(image.data.borrow().height));
        fields.add_field_method_get("colorMode", |_, image| {
            Ok(image.data.borrow().mode.aseprite_color_mode())
        });
    }

    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        methods.add_method("getPixel", |_, image, (x, y): (i32, i32)| {
            let state = image.data.borrow();
            if x < 0 || y < 0 || x as usize >= state.width || y as usize >= state.height {
                return Ok(0_u32);
            }
            Ok(state.pixels[y as usize * state.width + x as usize])
        });
        methods.add_method("drawPixel", |_, image, (x, y, value): (i32, i32, Value)| {
            set_image_pixel(image, x, y, value)
        });
        methods.add_method("putPixel", |_, image, (x, y, value): (i32, i32, Value)| {
            set_image_pixel(image, x, y, value)
        });
        methods.add_method("clear", |_, image, value: Option<Value>| {
            let mode = image.data.borrow().mode;
            let value = match value {
                Some(value) => pixel_value_from_lua(value, mode)?,
                None => 0,
            };
            if image
                .data
                .borrow()
                .pixels
                .iter()
                .all(|current| *current == value)
            {
                return Ok(());
            }
            image.prepare_mutation();
            image.data.borrow_mut().pixels.fill(value);
            Ok(())
        });
        methods.add_method(
            "drawImage",
            |_, image, (source, point): (AnyUserData, Option<Value>)| {
                let source = source.borrow::<ScriptImage>()?;
                let source_data = source.data.borrow().clone();
                let point = point_from_value(point.unwrap_or(Value::Nil))?;
                let target_mode = image.data.borrow().mode;
                if source_data.mode != target_mode {
                    return Err(LuaError::RuntimeError(
                        "drawImage() requires images with matching color modes.".into(),
                    ));
                }
                image.prepare_mutation();
                let mut target = image.data.borrow_mut();
                for source_y in 0..source_data.height {
                    let target_y = point.y + source_y as i32;
                    if target_y < 0 || target_y as usize >= target.height {
                        continue;
                    }
                    for source_x in 0..source_data.width {
                        let target_x = point.x + source_x as i32;
                        if target_x < 0 || target_x as usize >= target.width {
                            continue;
                        }
                        let source_pixel =
                            source_data.pixels[source_y * source_data.width + source_x];
                        let target_index = target_y as usize * target.width + target_x as usize;
                        let destination = target.pixels[target_index];
                        target.pixels[target_index] = composite_image_pixel(
                            target_mode,
                            source_pixel,
                            destination,
                            image.transparent_color,
                        );
                    }
                }
                Ok(())
            },
        );
        methods.add_method("clone", |lua, image, ()| {
            let pixel_count = image.data.borrow().width * image.data.borrow().height;
            reserve_image_pixels(&image.allocated_pixels, pixel_count)?;
            lua.create_userdata(ScriptImage {
                data: Rc::new(RefCell::new(image.data.borrow().clone())),
                document: image.document.clone(),
                allocated_pixels: image.allocated_pixels.clone(),
                transparent_color: image.transparent_color,
            })
        });
    }
}

fn set_image_pixel(image: &ScriptImage, x: i32, y: i32, value: Value) -> LuaResult<()> {
    let mode = image.data.borrow().mode;
    let value = pixel_value_from_lua(value, mode)?;
    {
        let state = image.data.borrow();
        if x < 0 || y < 0 || x as usize >= state.width || y as usize >= state.height {
            return Ok(());
        }
        if state.pixels[y as usize * state.width + x as usize] == value {
            return Ok(());
        }
    }
    image.prepare_mutation();
    let mut state = image.data.borrow_mut();
    let index = y as usize * state.width + x as usize;
    state.pixels[index] = value;
    Ok(())
}

fn composite_image_pixel(
    mode: ScriptPixelMode,
    source: u32,
    destination: u32,
    transparent_color: u32,
) -> u32 {
    match mode {
        ScriptPixelMode::Indexed => {
            if source == transparent_color {
                destination
            } else {
                source
            }
        }
        ScriptPixelMode::Rgba => composite_rgba(source, destination),
        ScriptPixelMode::Grayscale => composite_graya(source, destination),
    }
}

fn composite_rgba(source: u32, destination: u32) -> u32 {
    let source_alpha = (source >> 24) & 0xff;
    if source_alpha == 0 {
        return destination;
    }
    if source_alpha == 255 {
        return source;
    }
    let destination_alpha = (destination >> 24) & 0xff;
    let inverse = 255 - source_alpha;
    let output_alpha = source_alpha + (destination_alpha * inverse + 127) / 255;
    if output_alpha == 0 {
        return 0;
    }
    let blend = |shift: u32| {
        let source_channel = (source >> shift) & 0xff;
        let destination_channel = (destination >> shift) & 0xff;
        let numerator =
            source_channel * source_alpha * 255 + destination_channel * destination_alpha * inverse;
        ((numerator + output_alpha * 127) / (output_alpha * 255)).min(255)
    };
    blend(0) | (blend(8) << 8) | (blend(16) << 16) | (output_alpha << 24)
}

fn composite_graya(source: u32, destination: u32) -> u32 {
    let source_alpha = (source >> 8) & 0xff;
    if source_alpha == 0 {
        return destination;
    }
    if source_alpha == 255 {
        return source;
    }
    let destination_alpha = (destination >> 8) & 0xff;
    let inverse = 255 - source_alpha;
    let output_alpha = source_alpha + (destination_alpha * inverse + 127) / 255;
    if output_alpha == 0 {
        return 0;
    }
    let numerator =
        (source & 0xff) * source_alpha * 255 + (destination & 0xff) * destination_alpha * inverse;
    let gray = ((numerator + output_alpha * 127) / (output_alpha * 255)).min(255);
    gray | (output_alpha << 8)
}

#[derive(Clone, Debug)]
struct ScriptSelection {
    selection: Option<LuaScriptSelectionContext>,
}

impl ScriptSelection {
    fn is_empty(&self) -> bool {
        self.selection.as_ref().is_none_or(|selection| {
            selection.width == 0
                || selection.height == 0
                || selection
                    .mask
                    .as_ref()
                    .is_some_and(|mask| mask.iter().all(|value| *value == 0))
        })
    }

    fn contains(&self, point: ScriptPoint) -> bool {
        let Some(selection) = &self.selection else {
            return false;
        };
        let local_x = point.x - selection.x;
        let local_y = point.y - selection.y;
        if local_x < 0
            || local_y < 0
            || local_x as u32 >= selection.width
            || local_y as u32 >= selection.height
        {
            return false;
        }
        selection.mask.as_ref().is_none_or(|mask| {
            let index = local_y as usize * selection.width as usize + local_x as usize;
            mask.get(index).copied().unwrap_or(0) != 0
        })
    }
}

impl UserData for ScriptSelection {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("isEmpty", |_, selection| Ok(selection.is_empty()));
        fields.add_field_method_get("bounds", |_, selection| {
            Ok(selection
                .selection
                .as_ref()
                .map(|selection| ScriptRectangle {
                    x: selection.x,
                    y: selection.y,
                    width: selection.width,
                    height: selection.height,
                })
                .unwrap_or(ScriptRectangle {
                    x: 0,
                    y: 0,
                    width: 0,
                    height: 0,
                }))
        });
    }

    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        methods.add_method("contains", |_, selection, value: Value| {
            Ok(selection.contains(point_from_value(value)?))
        });
    }
}

#[derive(Clone, Debug)]
struct ScriptLayer {
    data: Rc<RefCell<ScriptLayerData>>,
    document: Weak<RefCell<ScriptDocumentState>>,
    allocated_pixels: Rc<Cell<usize>>,
    transparent_color: u32,
}

impl ScriptLayer {
    fn new(
        data: Rc<RefCell<ScriptLayerData>>,
        document: &Rc<RefCell<ScriptDocumentState>>,
        allocated_pixels: Rc<Cell<usize>>,
        transparent_color: u32,
    ) -> Self {
        Self {
            data,
            document: Rc::downgrade(document),
            allocated_pixels,
            transparent_color,
        }
    }

    fn queue_update(&self, key: &str, value: JsonValue) {
        let Some(document) = self.document.upgrade() else {
            return;
        };
        let created = {
            let state = document.borrow();
            state
                .created_layers
                .iter()
                .any(|layer| Rc::ptr_eq(&layer.borrow().layer, &self.data))
                || state.created_documents.iter().any(|sprite| {
                    sprite
                        .borrow()
                        .layers
                        .iter()
                        .any(|layer| Rc::ptr_eq(&layer.borrow().layer, &self.data))
                })
        };
        if created {
            return;
        }
        let mut arguments = serde_json::Map::new();
        arguments.insert(
            "id".into(),
            JsonValue::String(self.data.borrow().id.clone()),
        );
        arguments.insert(key.into(), value);
        document
            .borrow_mut()
            .queue_mse_operation(LuaScriptOperation {
                path: "layers.update".into(),
                arguments: JsonValue::Object(arguments),
            });
    }
}

impl UserData for ScriptLayer {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("id", |_, layer| Ok(layer.data.borrow().id.clone()));
        fields.add_field_method_get("name", |_, layer| Ok(layer.data.borrow().name.clone()));
        fields.add_field_method_set("name", |_, layer, value: String| {
            layer.data.borrow_mut().name = value.clone();
            layer.queue_update("name", JsonValue::String(value));
            Ok(())
        });
        fields.add_field_method_get("opacity", |_, layer| Ok(layer.data.borrow().opacity));
        fields.add_field_method_set("opacity", |_, layer, value: i64| {
            let value = clamp_u8(value);
            layer.data.borrow_mut().opacity = value;
            layer.queue_update("opacity", JsonValue::Number(value.into()));
            Ok(())
        });
        fields.add_field_method_get("isVisible", |_, layer| Ok(layer.data.borrow().visible));
        fields.add_field_method_set("isVisible", |_, layer, value: bool| {
            layer.data.borrow_mut().visible = value;
            layer.queue_update("visible", JsonValue::Bool(value));
            Ok(())
        });
        fields.add_field_method_get("isEditable", |_, layer| Ok(!layer.data.borrow().locked));
        fields.add_field_method_set("isEditable", |_, layer, value: bool| {
            layer.data.borrow_mut().locked = !value;
            layer.queue_update("locked", JsonValue::Bool(!value));
            Ok(())
        });
        fields.add_field_method_get("isContinuous", |_, layer| {
            Ok(layer.data.borrow().continuous)
        });
        fields.add_field_method_set("isContinuous", |_, layer, value: bool| {
            layer.data.borrow_mut().continuous = value;
            Ok(())
        });
        fields.add_field_method_get("isLocked", |_, layer| Ok(layer.data.borrow().locked));
        fields.add_field_method_set("isLocked", |_, layer, value: bool| {
            layer.data.borrow_mut().locked = value;
            layer.queue_update("locked", JsonValue::Bool(value));
            Ok(())
        });
        fields.add_field_method_get("isImage", |_, layer| {
            Ok(layer.data.borrow().kind == "raster")
        });
        fields.add_field_method_get(
            "isGroup",
            |_, layer| Ok(layer.data.borrow().kind == "group"),
        );
        fields.add_field_method_get("isTilemap", |_, layer| {
            Ok(layer.data.borrow().kind == "tilemap")
        });
        fields.add_field_method_get("stackIndex", |_, layer| Ok(layer.data.borrow().stack_index));
        fields.add_field_method_set("stackIndex", |_, layer, value: i64| {
            layer.data.borrow_mut().stack_index = value.max(1) as u32;
            Ok(())
        });
        fields.add_field_method_get("parent", |lua, layer| {
            match layer.data.borrow().parent_group_id.clone() {
                Some(id) => Ok(Value::String(lua.create_string(&id)?)),
                None => Ok(Value::Nil),
            }
        });
        fields.add_field_method_set("parent", |_, layer, value: Value| {
            layer.data.borrow_mut().parent_group_id = match value {
                Value::Nil => None,
                Value::String(value) => Some(value.to_string_lossy()),
                _ => {
                    return Err(LuaError::RuntimeError(
                        "Layer.parent currently accepts another layer parent value or nil.".into(),
                    ));
                }
            };
            Ok(())
        });
        fields.add_field_method_get("cels", |lua, layer| {
            let cels = lua.create_table()?;
            let Some(document) = layer.document.upgrade() else {
                return Ok(cels);
            };
            let (is_active, active_frame, mut known_cels) = {
                let state = document.borrow();
                (
                    Rc::ptr_eq(&layer.data, &state.active_layer),
                    state.active_frame_number(),
                    state.known_cels.clone(),
                )
            };
            if is_active {
                known_cels.sort_by_key(|cel| cel.borrow().frame_number);
                let mut active_added = false;
                for known in known_cels {
                    let frame_number = known.borrow().frame_number;
                    if !active_added && active_frame < frame_number {
                        cels.push(lua.create_userdata(ScriptCel {
                            document: document.clone(),
                            allocated_pixels: layer.allocated_pixels.clone(),
                            transparent_color: layer.transparent_color,
                            frame_number: active_frame,
                            layer: layer.data.clone(),
                            known: None,
                        })?)?;
                        active_added = true;
                    }
                    cels.push(lua.create_userdata(ScriptCel {
                        document: document.clone(),
                        allocated_pixels: layer.allocated_pixels.clone(),
                        transparent_color: layer.transparent_color,
                        frame_number,
                        layer: layer.data.clone(),
                        known: Some(known),
                    })?)?;
                }
                if !active_added {
                    cels.push(lua.create_userdata(ScriptCel {
                        document: document.clone(),
                        allocated_pixels: layer.allocated_pixels.clone(),
                        transparent_color: layer.transparent_color,
                        frame_number: active_frame,
                        layer: layer.data.clone(),
                        known: None,
                    })?)?;
                }
            }
            Ok(cels)
        });
    }

    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        methods.add_method("cel", |lua, layer, frame: Option<Value>| {
            let document = layer.document.upgrade().ok_or_else(|| {
                LuaError::RuntimeError("The layer is no longer available.".into())
            })?;
            let frame_number = match frame {
                None | Some(Value::Nil) => document.borrow().active_frame_number(),
                Some(value) => {
                    frame_number_from_value(&value, document.borrow().active_frame_number())?
                }
            };
            let (target, known) = {
                let document = document.borrow();
                let active_layer = Rc::ptr_eq(&layer.data, &document.active_layer);
                (
                    active_layer && frame_number == document.active_frame_number(),
                    active_layer
                        .then(|| {
                            document
                                .known_cels
                                .iter()
                                .find(|cel| cel.borrow().frame_number == frame_number)
                                .cloned()
                        })
                        .flatten(),
                )
            };
            if !target && known.is_none() {
                return Ok(Value::Nil);
            }
            Ok(Value::UserData(lua.create_userdata(ScriptCel {
                document,
                allocated_pixels: layer.allocated_pixels.clone(),
                transparent_color: layer.transparent_color,
                frame_number,
                layer: layer.data.clone(),
                known,
            })?))
        });
    }
}

fn script_layers(
    document: &Rc<RefCell<ScriptDocumentState>>,
    allocated_pixels: &Rc<Cell<usize>>,
    transparent_color: u32,
) -> Vec<ScriptLayer> {
    let state = document.borrow();
    let active = state.active_layer.clone();
    let active_id = active.borrow().id.clone();
    state
        .mse_snapshot
        .get("layers")
        .and_then(JsonValue::as_array)
        .into_iter()
        .flatten()
        .enumerate()
        .filter_map(|(index, layer)| {
            let id = layer.get("id")?.as_str()?.to_string();
            let data = if id == active_id {
                active.clone()
            } else {
                Rc::new(RefCell::new(ScriptLayerData {
                    id,
                    name: layer
                        .get("name")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("Layer")
                        .to_string(),
                    kind: layer
                        .get("kind")
                        .and_then(JsonValue::as_str)
                        .unwrap_or("raster")
                        .to_string(),
                    opacity: layer
                        .get("opacity")
                        .and_then(JsonValue::as_u64)
                        .unwrap_or(255)
                        .min(255) as u8,
                    visible: layer
                        .get("visible")
                        .and_then(JsonValue::as_bool)
                        .unwrap_or(true),
                    locked: layer
                        .get("locked")
                        .and_then(JsonValue::as_bool)
                        .unwrap_or(false),
                    continuous: true,
                    parent_group_id: layer
                        .get("groupId")
                        .and_then(JsonValue::as_str)
                        .map(str::to_string),
                    stack_index: index as u32 + 1,
                }))
            };
            Some(ScriptLayer::new(
                data,
                document,
                allocated_pixels.clone(),
                transparent_color,
            ))
        })
        .collect()
}

#[derive(Clone, Debug)]
struct ScriptRange {
    document: Rc<RefCell<ScriptDocumentState>>,
    allocated_pixels: Rc<Cell<usize>>,
    transparent_color: u32,
}

impl ScriptRange {
    fn string_ids(&self, key: &str) -> Vec<String> {
        self.document
            .borrow()
            .mse_snapshot
            .get("range")
            .and_then(|range| range.get(key))
            .and_then(JsonValue::as_array)
            .into_iter()
            .flatten()
            .filter_map(JsonValue::as_str)
            .map(str::to_string)
            .collect()
    }
}

impl UserData for ScriptRange {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("isEmpty", |_, range| {
            Ok(range.string_ids("layerIds").is_empty()
                && range.string_ids("frameIds").is_empty()
                && range.string_ids("cellKeys").is_empty())
        });
        fields.add_field_method_get("type", |_, range| {
            Ok(if !range.string_ids("cellKeys").is_empty() {
                1
            } else if !range.string_ids("frameIds").is_empty() {
                2
            } else if !range.string_ids("layerIds").is_empty() {
                3
            } else {
                0
            })
        });
        fields.add_field_method_get("frames", |lua, range| {
            let selected = range.string_ids("frameIds");
            let frames = lua.create_table()?;
            for frame in script_frames(&range.document)
                .into_iter()
                .filter(|frame| selected.contains(&frame.id))
            {
                frames.push(lua.create_userdata(frame)?)?;
            }
            Ok(frames)
        });
        fields.add_field_method_get("layers", |lua, range| {
            let selected = range.string_ids("layerIds");
            let layers = lua.create_table()?;
            for layer in script_layers(
                &range.document,
                &range.allocated_pixels,
                range.transparent_color,
            )
            .into_iter()
            .filter(|layer| selected.contains(&layer.data.borrow().id))
            {
                layers.push(lua.create_userdata(layer)?)?;
            }
            Ok(layers)
        });
        fields.add_field_method_get("cels", |lua, range| {
            let cels = lua.create_table()?;
            let selected = range.string_ids("cellKeys");
            if selected.is_empty() {
                return Ok(cels);
            }
            let (active_layer, active_frame, active_frame_id, known_cels) = {
                let document = range.document.borrow();
                let active_frame = document.active_frame_number();
                (
                    document.active_layer.clone(),
                    active_frame,
                    script_frame_for_number(&range.document, active_frame).id,
                    document.known_cels.clone(),
                )
            };
            let active_layer_id = active_layer.borrow().id.clone();
            if selected.contains(&format!("{active_layer_id}:{active_frame_id}")) {
                cels.push(lua.create_userdata(ScriptCel {
                    document: range.document.clone(),
                    allocated_pixels: range.allocated_pixels.clone(),
                    transparent_color: range.transparent_color,
                    frame_number: active_frame,
                    layer: active_layer.clone(),
                    known: None,
                })?)?;
            }
            for known in known_cels {
                let state = known.borrow();
                if !selected.contains(&format!("{}:{}", state.layer_id, state.frame_id)) {
                    continue;
                }
                let frame_number = state.frame_number;
                drop(state);
                cels.push(lua.create_userdata(ScriptCel {
                    document: range.document.clone(),
                    allocated_pixels: range.allocated_pixels.clone(),
                    transparent_color: range.transparent_color,
                    frame_number,
                    layer: active_layer.clone(),
                    known: Some(known),
                })?)?;
            }
            Ok(cels)
        });
    }
}

#[derive(Clone, Debug)]
struct ScriptCel {
    document: Rc<RefCell<ScriptDocumentState>>,
    allocated_pixels: Rc<Cell<usize>>,
    transparent_color: u32,
    frame_number: u32,
    layer: Rc<RefCell<ScriptLayerData>>,
    known: Option<Rc<RefCell<ScriptKnownCelState>>>,
}

impl UserData for ScriptCel {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("image", |lua, cel| {
            let data = cel
                .known
                .as_ref()
                .map(|state| state.borrow().image.clone())
                .unwrap_or_else(|| cel.document.borrow().active_image.clone());
            lua.create_userdata(ScriptImage {
                data,
                document: Rc::downgrade(&cel.document),
                allocated_pixels: cel.allocated_pixels.clone(),
                transparent_color: cel.transparent_color,
            })
        });
        fields.add_field_method_set("image", |lua, cel, value: AnyUserData| {
            let image = value.borrow::<ScriptImage>()?;
            let image_data = image.data.borrow();
            if image_data.mode != cel.document.borrow().target_mode {
                return Err(LuaError::RuntimeError(
                    "The assigned cel image must use the sprite color mode.".into(),
                ));
            }
            if image_data.width.saturating_mul(image_data.height) > MAX_IMAGE_PIXELS {
                return Err(LuaError::RuntimeError(format!(
                    "Images cannot exceed {MAX_IMAGE_PIXELS} pixels."
                )));
            }
            drop(image_data);
            cel.document.borrow_mut().ensure_pending();
            if let Some(state) = &cel.known {
                state.borrow_mut().image = image.data.clone();
            } else {
                cel.document
                    .borrow_mut()
                    .replace_active_image(image.data.clone());
                let app = lua.globals().get::<Table>("app")?;
                app.set("activeImage", value)?;
            }
            Ok(())
        });
        fields.add_field_method_get("position", |_, cel| {
            if let Some(state) = &cel.known {
                let state = state.borrow();
                Ok(ScriptPoint {
                    x: state.offset_x,
                    y: state.offset_y,
                })
            } else {
                let document = cel.document.borrow();
                Ok(ScriptPoint {
                    x: document.offset_x,
                    y: document.offset_y,
                })
            }
        });
        fields.add_field_method_set("position", |_, cel, value: Value| {
            let point = point_from_value(value)?;
            if let Some(state) = &cel.known {
                let mut state = state.borrow_mut();
                if state.offset_x == point.x && state.offset_y == point.y {
                    return Ok(());
                }
                cel.document.borrow_mut().ensure_pending();
                state.offset_x = point.x;
                state.offset_y = point.y;
            } else {
                let mut document = cel.document.borrow_mut();
                if document.offset_x == point.x && document.offset_y == point.y {
                    return Ok(());
                }
                document.ensure_pending();
                document.set_active_position(point.x, point.y);
            }
            Ok(())
        });
        fields.add_field_method_get("bounds", |_, cel| {
            if let Some(state) = &cel.known {
                let state = state.borrow();
                let image = state.image.borrow();
                Ok(ScriptRectangle {
                    x: state.offset_x,
                    y: state.offset_y,
                    width: image.width as u32,
                    height: image.height as u32,
                })
            } else {
                let document = cel.document.borrow();
                let image = document.active_image.borrow();
                Ok(ScriptRectangle {
                    x: document.offset_x,
                    y: document.offset_y,
                    width: image.width as u32,
                    height: image.height as u32,
                })
            }
        });
        fields.add_field_method_get("id", |_, cel| {
            Ok(cel
                .known
                .as_ref()
                .map(|state| state.borrow().id.clone())
                .unwrap_or_else(|| "active-cel".into()))
        });
        fields.add_field_method_get("frameNumber", |_, cel| Ok(cel.frame_number));
        fields.add_field_method_get("frame", |_, cel| {
            Ok(script_frame_for_number(&cel.document, cel.frame_number))
        });
        fields.add_field_method_get("layer", |_, cel| {
            Ok(ScriptLayer::new(
                cel.layer.clone(),
                &cel.document,
                cel.allocated_pixels.clone(),
                cel.transparent_color,
            ))
        });
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ScriptSpriteKind {
    Root,
    CreatedDocument(usize),
}

#[derive(Clone, Debug)]
struct ScriptSprite {
    kind: ScriptSpriteKind,
    document: Rc<RefCell<ScriptDocumentState>>,
    allocated_pixels: Rc<Cell<usize>>,
    transparent_color: u32,
}

impl ScriptSprite {
    fn dimensions(&self) -> (u32, u32) {
        let document = self.document.borrow();
        match self.kind {
            ScriptSpriteKind::Root => (document.document_width, document.document_height),
            ScriptSpriteKind::CreatedDocument(index) => document
                .created_documents
                .get(index)
                .map(|sprite| {
                    let sprite = sprite.borrow();
                    (sprite.width, sprite.height)
                })
                .unwrap_or((0, 0)),
        }
    }

    fn mode(&self) -> ScriptPixelMode {
        let document = self.document.borrow();
        match self.kind {
            ScriptSpriteKind::Root => document.target_mode,
            ScriptSpriteKind::CreatedDocument(index) => document
                .created_documents
                .get(index)
                .map(|sprite| sprite.borrow().mode)
                .unwrap_or(document.target_mode),
        }
    }

    fn active_layer(&self) -> Rc<RefCell<ScriptLayerData>> {
        let document = self.document.borrow();
        match self.kind {
            ScriptSpriteKind::Root => document.active_layer.clone(),
            ScriptSpriteKind::CreatedDocument(index) => document
                .created_documents
                .get(index)
                .and_then(|sprite| {
                    let sprite = sprite.borrow();
                    sprite.layers.get(sprite.active_layer).cloned()
                })
                .map(|layer| layer.borrow().layer.clone())
                .unwrap_or_else(|| document.active_layer.clone()),
        }
    }
}

impl UserData for ScriptSprite {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("width", |_, sprite| Ok(sprite.dimensions().0));
        fields.add_field_method_get("height", |_, sprite| Ok(sprite.dimensions().1));
        fields.add_field_method_get("filename", |_, sprite| {
            let document = sprite.document.borrow();
            Ok(match sprite.kind {
                ScriptSpriteKind::Root => document.document_file_path.clone(),
                ScriptSpriteKind::CreatedDocument(_) => String::new(),
            })
        });
        fields.add_field_method_get("name", |_, sprite| {
            let document = sprite.document.borrow();
            Ok(match sprite.kind {
                ScriptSpriteKind::Root => document.document_name.clone(),
                ScriptSpriteKind::CreatedDocument(index) => document
                    .created_documents
                    .get(index)
                    .map(|sprite| sprite.borrow().name.clone())
                    .unwrap_or_default(),
            })
        });
        fields.add_field_method_set("name", |_, sprite, value: String| {
            let mut document = sprite.document.borrow_mut();
            match sprite.kind {
                ScriptSpriteKind::Root => document.document_name = value,
                ScriptSpriteKind::CreatedDocument(index) => {
                    if let Some(created) = document.created_documents.get(index) {
                        created.borrow_mut().name = value;
                    }
                }
            }
            Ok(())
        });
        fields.add_field_method_get("colorMode", |_, sprite| {
            Ok(sprite.mode().aseprite_color_mode())
        });
        fields.add_field_method_get("transparentColor", |_, sprite| Ok(sprite.transparent_color));
        fields.add_field_method_get("palettes", |lua, sprite| {
            let palettes = lua.create_table()?;
            let entries = script_palette_entries(&sprite.document.borrow());
            palettes.set(
                1,
                lua.create_userdata(ScriptPalette {
                    entries,
                    document: Rc::downgrade(&sprite.document),
                })?,
            )?;
            Ok(palettes)
        });
        fields.add_field_method_get("palette", |_, sprite| {
            Ok(ScriptPalette {
                entries: script_palette_entries(&sprite.document.borrow()),
                document: Rc::downgrade(&sprite.document),
            })
        });
        fields.add_field_method_get("activeLayer", |_, sprite| {
            Ok(ScriptLayer::new(
                sprite.active_layer(),
                &sprite.document,
                sprite.allocated_pixels.clone(),
                sprite.transparent_color,
            ))
        });
        fields.add_field_method_get("activeCel", |_, sprite| {
            let document = sprite.document.borrow();
            Ok(ScriptCel {
                document: sprite.document.clone(),
                allocated_pixels: sprite.allocated_pixels.clone(),
                transparent_color: sprite.transparent_color,
                frame_number: document.active_frame_number(),
                layer: sprite.active_layer(),
                known: None,
            })
        });
        fields.add_field_method_get("activeFrame", |_, sprite| {
            let number = sprite.document.borrow().active_frame_number();
            Ok(script_frame_for_number(&sprite.document, number))
        });
        fields.add_field_method_get("frames", |lua, sprite| {
            let frames = lua.create_table()?;
            for frame in script_frames(&sprite.document) {
                frames.push(lua.create_userdata(frame)?)?;
            }
            Ok(frames)
        });
        fields.add_field_method_get("layers", |lua, sprite| {
            let layers = lua.create_table()?;
            for layer in script_layers(
                &sprite.document,
                &sprite.allocated_pixels,
                sprite.transparent_color,
            ) {
                layers.push(lua.create_userdata(layer)?)?;
            }
            Ok(layers)
        });
        fields.add_field_method_get("tags", |lua, sprite| {
            let tags = lua.create_table()?;
            for tag in script_tags(&sprite.document) {
                tags.push(lua.create_userdata(tag)?)?;
            }
            Ok(tags)
        });
        fields.add_field_method_get("selection", |_, sprite| {
            let selection = match sprite.kind {
                ScriptSpriteKind::Root => sprite.document.borrow().selection.clone(),
                ScriptSpriteKind::CreatedDocument(_) => None,
            };
            Ok(ScriptSelection { selection })
        });
        fields.add_field_method_get("spec", |lua, sprite| {
            let spec = lua.create_table()?;
            let (width, height) = sprite.dimensions();
            spec.set("width", width)?;
            spec.set("height", height)?;
            spec.set("colorMode", sprite.mode().aseprite_color_mode())?;
            spec.set("transparentColor", sprite.transparent_color)?;
            Ok(spec)
        });
    }

    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        methods.add_method("newTag", |lua, sprite, args: Variadic<Value>| {
            let fallback = sprite.document.borrow().active_frame_number();
            let from_number = args
                .first()
                .map(|value| frame_number_from_value(value, fallback))
                .transpose()?
                .unwrap_or(fallback);
            let to_number = args
                .get(1)
                .map(|value| frame_number_from_value(value, from_number))
                .transpose()?
                .unwrap_or(from_number);
            let from = script_frame_for_number(&sprite.document, from_number);
            let to = script_frame_for_number(&sprite.document, to_number);
            let tag = ScriptTag {
                id: next_script_object_id("lua-tag"),
                name: "Tag".into(),
                start_frame_id: from.id,
                end_frame_id: to.id,
                direction: "forward".into(),
                repeat_count: None,
                document: Rc::downgrade(&sprite.document),
            };
            sprite
                .document
                .borrow_mut()
                .queue_mse_operation(LuaScriptOperation {
                    path: "animation.createLoop".into(),
                    arguments: serde_json::json!({
                        "id": tag.id,
                        "name": tag.name,
                        "startFrameId": tag.start_frame_id,
                        "endFrameId": tag.end_frame_id,
                        "direction": tag.direction,
                        "repeatCount": tag.repeat_count,
                    }),
                });
            lua.create_userdata(tag)
        });
        methods.add_method("deleteTag", |_, sprite, value: AnyUserData| {
            let tag = value.borrow::<ScriptTag>()?;
            sprite
                .document
                .borrow_mut()
                .queue_mse_operation(LuaScriptOperation {
                    path: "animation.removeLoop".into(),
                    arguments: serde_json::json!({ "id": tag.id }),
                });
            Ok(())
        });
        methods.add_method("newLayer", |lua, sprite, ()| {
            let (width, height) = sprite.dimensions();
            let mode = sprite.mode();
            let pixel_count = width as usize * height as usize;
            reserve_image_pixels(&sprite.allocated_pixels, pixel_count)?;
            let image = Rc::new(RefCell::new(ScriptImageData {
                mode,
                width: width as usize,
                height: height as usize,
                pixels: vec![
                    if mode == ScriptPixelMode::Indexed {
                        sprite.transparent_color
                    } else {
                        0
                    };
                    pixel_count
                ],
            }));
            let layer = Rc::new(RefCell::new(ScriptLayerData {
                id: next_script_object_id("lua-layer"),
                name: "Layer".into(),
                kind: "raster".into(),
                opacity: 255,
                visible: true,
                locked: false,
                continuous: true,
                parent_group_id: sprite.active_layer().borrow().parent_group_id.clone(),
                stack_index: sprite.active_layer().borrow().stack_index.saturating_add(1),
            }));
            let state = Rc::new(RefCell::new(ScriptCreatedLayerState {
                layer: layer.clone(),
                image: image.clone(),
                offset_x: 0,
                offset_y: 0,
                frame_number: 1,
            }));
            {
                let mut document = sprite.document.borrow_mut();
                document.ensure_pending();
                match sprite.kind {
                    ScriptSpriteKind::Root => {
                        let index = document.created_layers.len();
                        document.created_layers.push(state);
                        document.active_surface = ActiveSurfaceRef::CreatedLayer(index);
                    }
                    ScriptSpriteKind::CreatedDocument(document_index) => {
                        let created = document
                            .created_documents
                            .get(document_index)
                            .cloned()
                            .ok_or_else(|| {
                                LuaError::RuntimeError("Sprite is no longer available.".into())
                            })?;
                        let mut created = created.borrow_mut();
                        let layer_index = created.layers.len();
                        created.layers.push(state);
                        created.active_layer = layer_index;
                        document.active_surface = ActiveSurfaceRef::CreatedDocument {
                            document: document_index,
                            layer: layer_index,
                        };
                    }
                }
                document.active_image = image;
                document.offset_x = 0;
                document.offset_y = 0;
                document.active_layer = layer.clone();
            }
            refresh_active_globals(
                lua,
                &sprite.document,
                &sprite.allocated_pixels,
                sprite.transparent_color,
            )?;
            lua.create_userdata(ScriptLayer::new(
                layer,
                &sprite.document,
                sprite.allocated_pixels.clone(),
                sprite.transparent_color,
            ))
        });
        methods.add_method("newCel", |lua, sprite, args: Variadic<Value>| {
            let layer = match args.first() {
                Some(Value::UserData(layer)) => layer.borrow::<ScriptLayer>()?.data.clone(),
                _ => {
                    return Err(LuaError::RuntimeError(
                        "newCel() expects a layer as its first argument.".into(),
                    ));
                }
            };
            let frame_number = match args.get(1) {
                None | Some(Value::Nil) => 1,
                Some(value) => frame_number_from_value(value, 1)?,
            }
            .max(1);
            let supplied_image = match args.get(2) {
                Some(Value::UserData(image)) => {
                    let image = image.borrow::<ScriptImage>()?;
                    let image_data = image.data.borrow();
                    if image_data.mode != sprite.mode() {
                        return Err(LuaError::RuntimeError(
                            "newCel() image must use the sprite color mode.".into(),
                        ));
                    }
                    Some(image.data.clone())
                }
                Some(Value::Nil) | None => None,
                _ => {
                    return Err(LuaError::RuntimeError(
                        "newCel() expects an Image as its third argument.".into(),
                    ));
                }
            };
            let position = match args.get(3) {
                None | Some(Value::Nil) => ScriptPoint { x: 0, y: 0 },
                Some(value) => point_from_value(value.clone())?,
            };
            let (width, height) = sprite.dimensions();
            let mode = sprite.mode();
            let mut document = sprite.document.borrow_mut();
            document.ensure_pending();
            let (active_surface, state) = match sprite.kind {
                ScriptSpriteKind::Root => {
                    let index = document
                        .created_layers
                        .iter()
                        .position(|candidate| Rc::ptr_eq(&candidate.borrow().layer, &layer))
                        .ok_or_else(|| {
                            LuaError::RuntimeError(
                                "newCel() requires a layer from this sprite.".into(),
                            )
                        })?;
                    (
                        ActiveSurfaceRef::CreatedLayer(index),
                        document.created_layers[index].clone(),
                    )
                }
                ScriptSpriteKind::CreatedDocument(document_index) => {
                    let created = document
                        .created_documents
                        .get(document_index)
                        .cloned()
                        .ok_or_else(|| {
                            LuaError::RuntimeError("Sprite is no longer available.".into())
                        })?;
                    let mut created = created.borrow_mut();
                    let layer_index = created
                        .layers
                        .iter()
                        .position(|candidate| Rc::ptr_eq(&candidate.borrow().layer, &layer))
                        .ok_or_else(|| {
                            LuaError::RuntimeError(
                                "newCel() requires a layer from this sprite.".into(),
                            )
                        })?;
                    created.active_layer = layer_index;
                    (
                        ActiveSurfaceRef::CreatedDocument {
                            document: document_index,
                            layer: layer_index,
                        },
                        created.layers[layer_index].clone(),
                    )
                }
            };
            let image = supplied_image.unwrap_or_else(|| {
                Rc::new(RefCell::new(ScriptImageData {
                    mode,
                    width: width as usize,
                    height: height as usize,
                    pixels: vec![
                        if mode == ScriptPixelMode::Indexed {
                            sprite.transparent_color
                        } else {
                            0
                        };
                        width as usize * height as usize
                    ],
                }))
            });
            {
                let mut state = state.borrow_mut();
                state.image = image.clone();
                state.offset_x = position.x;
                state.offset_y = position.y;
                state.frame_number = frame_number;
            }
            document.active_surface = active_surface;
            document.active_image = image;
            document.offset_x = position.x;
            document.offset_y = position.y;
            document.active_layer = layer.clone();
            drop(document);
            refresh_active_globals(
                lua,
                &sprite.document,
                &sprite.allocated_pixels,
                sprite.transparent_color,
            )?;
            lua.create_userdata(ScriptCel {
                document: sprite.document.clone(),
                allocated_pixels: sprite.allocated_pixels.clone(),
                transparent_color: sprite.transparent_color,
                frame_number,
                layer,
                known: None,
            })
        });
    }
}

#[derive(Clone, Debug)]
struct DialogControlState {
    model: LuaScriptDialogControl,
}

#[derive(Clone, Debug)]
struct DialogState {
    title: String,
    controls: Vec<DialogControlState>,
    visible: bool,
    closed: bool,
}

#[derive(Debug, Default)]
struct ScriptUiState {
    next_dialog_id: u64,
    next_control_id: u64,
    dialogs: HashMap<String, DialogState>,
    order: Vec<String>,
    blocking_dialog_id: Option<String>,
}

impl ScriptUiState {
    fn snapshots(&self) -> Vec<LuaScriptDialog> {
        self.order
            .iter()
            .filter_map(|id| {
                let dialog = self.dialogs.get(id)?;
                (dialog.visible && !dialog.closed).then(|| LuaScriptDialog {
                    id: id.clone(),
                    title: dialog.title.clone(),
                    controls: dialog
                        .controls
                        .iter()
                        .map(|control| control.model.clone())
                        .collect(),
                })
            })
            .collect()
    }
}

#[derive(Clone, Debug)]
struct ScriptDialog {
    id: String,
    ui: Rc<RefCell<ScriptUiState>>,
}

impl UserData for ScriptDialog {
    fn add_fields<F: UserDataFields<Self>>(fields: &mut F) {
        fields.add_field_method_get("id", |_, dialog| Ok(dialog.id.clone()));
        fields.add_field_method_get("data", |lua, dialog| dialog_data(lua, dialog));
        fields.add_field_method_get("bounds", |_, _| {
            Ok(ScriptRectangle {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            })
        });
    }

    fn add_methods<M: UserDataMethods<Self>>(methods: &mut M) {
        for (name, kind) in [
            ("button", "button"),
            ("check", "check"),
            ("color", "color"),
            ("combobox", "combobox"),
            ("entry", "entry"),
            ("label", "label"),
            ("number", "number"),
            ("radio", "radio"),
            ("separator", "separator"),
            ("slider", "slider"),
        ] {
            methods.add_method(name, move |lua, dialog, spec: Option<Table>| {
                let spec = spec.unwrap_or(lua.create_table()?);
                add_dialog_control(lua, dialog, kind, spec)?;
                lua.create_userdata(dialog.clone())
            });
        }
        methods.add_method("show", |lua, dialog, options: Option<Table>| {
            let wait = match options.as_ref() {
                Some(options) => table_boolean(options, "wait")?.unwrap_or(true),
                None => true,
            };
            let mut ui = dialog.ui.borrow_mut();
            let state = ui
                .dialogs
                .get_mut(&dialog.id)
                .ok_or_else(|| LuaError::RuntimeError("Dialog is no longer available.".into()))?;
            state.visible = true;
            state.closed = false;
            if wait {
                ui.blocking_dialog_id = Some(dialog.id.clone());
            }
            drop(ui);
            lua.create_userdata(dialog.clone())
        });
        methods.add_method("close", |_, dialog, ()| {
            close_dialog(&dialog.ui, &dialog.id);
            Ok(())
        });
        methods.add_method("modify", |lua, dialog, spec: Table| {
            modify_dialog_control(lua, dialog, spec)?;
            lua.create_userdata(dialog.clone())
        });
        methods.add_method("newrow", |lua, dialog, ()| {
            lua.create_userdata(dialog.clone())
        });
        methods.add_method("repaint", |_, _, ()| Ok(()));
    }
}

fn table_string(table: &Table, key: &str) -> LuaResult<Option<String>> {
    match table.get::<Value>(key)? {
        Value::String(value) => Ok(Some(value.to_string_lossy())),
        Value::Integer(value) => Ok(Some(value.to_string())),
        Value::Number(value) => Ok(Some(value.to_string())),
        Value::Boolean(value) => Ok(Some(value.to_string())),
        _ => Ok(None),
    }
}

fn table_number(table: &Table, key: &str) -> LuaResult<Option<f64>> {
    match table.get::<Value>(key)? {
        Value::Integer(value) => Ok(Some(value as f64)),
        Value::Number(value) if value.is_finite() => Ok(Some(value)),
        Value::String(value) => Ok(value.to_str()?.parse::<f64>().ok()),
        _ => Ok(None),
    }
}

fn table_boolean(table: &Table, key: &str) -> LuaResult<Option<bool>> {
    match table.get::<Value>(key)? {
        Value::Boolean(value) => Ok(Some(value)),
        _ => Ok(None),
    }
}

fn table_options(table: &Table) -> LuaResult<Vec<String>> {
    match table.get::<Value>("options")? {
        Value::Table(options) => options
            .sequence_values::<Value>()
            .filter_map(Result::ok)
            .filter_map(|value| match value {
                Value::String(value) => Some(value.to_string_lossy()),
                Value::Integer(value) => Some(value.to_string()),
                Value::Number(value) => Some(value.to_string()),
                _ => None,
            })
            .collect::<Vec<_>>()
            .pipe(Ok),
        _ => Ok(Vec::new()),
    }
}

trait Pipe: Sized {
    fn pipe<T>(self, function: impl FnOnce(Self) -> T) -> T {
        function(self)
    }
}

impl<T> Pipe for T {}

fn callback_key(dialog_id: &str, control_id: &str, event: &str) -> String {
    format!("{dialog_id}:{control_id}:{event}")
}

fn store_callback(
    lua: &Lua,
    dialog_id: &str,
    control_id: &str,
    event: &str,
    value: Value,
) -> LuaResult<()> {
    if let Value::Function(function) = value {
        let callbacks = lua.globals().get::<Table>(DIALOG_CALLBACKS_GLOBAL)?;
        callbacks.set(callback_key(dialog_id, control_id, event), function)?;
    }
    Ok(())
}

fn initial_control_value(kind: &str, spec: &Table, options: &[String]) -> LuaResult<JsonValue> {
    Ok(match kind {
        "check" | "radio" => JsonValue::Bool(table_boolean(spec, "selected")?.unwrap_or(false)),
        "color" => script_color_from_value(spec.get::<Value>("color")?)?.serialized(),
        "slider" => {
            let value = table_number(spec, "value")?
                .or(table_number(spec, "min")?)
                .unwrap_or(0.0);
            json_number(value)
        }
        "number" => json_number(
            table_number(spec, "text")?
                .or(table_number(spec, "value")?)
                .unwrap_or(0.0),
        ),
        "entry" => JsonValue::String(table_string(spec, "text")?.unwrap_or_default()),
        "combobox" => JsonValue::String(
            table_string(spec, "option")?
                .or_else(|| options.first().cloned())
                .unwrap_or_default(),
        ),
        _ => JsonValue::Null,
    })
}

fn add_dialog_control(lua: &Lua, dialog: &ScriptDialog, kind: &str, spec: Table) -> LuaResult<()> {
    let data_key = table_string(&spec, "id")?.filter(|value| !value.trim().is_empty());
    let options = table_options(&spec)?;
    let mut ui = dialog.ui.borrow_mut();
    ui.next_control_id = ui.next_control_id.saturating_add(1);
    let internal_id = data_key
        .clone()
        .unwrap_or_else(|| format!("control-{}", ui.next_control_id));
    let state = ui
        .dialogs
        .get_mut(&dialog.id)
        .ok_or_else(|| LuaError::RuntimeError("Dialog is no longer available.".into()))?;
    if state
        .controls
        .iter()
        .any(|control| control.model.id == internal_id)
    {
        return Err(LuaError::RuntimeError(format!(
            "Dialog control id '{internal_id}' is already in use."
        )));
    }
    let model = LuaScriptDialogControl {
        id: internal_id.clone(),
        data_key,
        kind: kind.into(),
        label: table_string(&spec, "label")?.unwrap_or_default(),
        text: table_string(&spec, "text")?.unwrap_or_default(),
        value: initial_control_value(kind, &spec, &options)?,
        min: table_number(&spec, "min")?,
        max: table_number(&spec, "max")?,
        step: table_number(&spec, "step")?,
        decimals: table_number(&spec, "decimals")?.map(|value| value.max(0.0) as u32),
        options,
        enabled: table_boolean(&spec, "enabled")?.unwrap_or(true),
        visible: table_boolean(&spec, "visible")?.unwrap_or(true),
    };
    state.controls.push(DialogControlState { model });
    drop(ui);
    for event in ["onclick", "onchange", "onrelease"] {
        store_callback(
            lua,
            &dialog.id,
            &internal_id,
            event,
            spec.get::<Value>(event)?,
        )?;
    }
    Ok(())
}

fn modify_dialog_control(lua: &Lua, dialog: &ScriptDialog, spec: Table) -> LuaResult<()> {
    let requested = table_string(&spec, "id")?
        .ok_or_else(|| LuaError::RuntimeError("Dialog.modify() requires an id.".into()))?;
    let mut ui = dialog.ui.borrow_mut();
    let state = ui
        .dialogs
        .get_mut(&dialog.id)
        .ok_or_else(|| LuaError::RuntimeError("Dialog is no longer available.".into()))?;
    let control = state
        .controls
        .iter_mut()
        .find(|control| {
            control.model.id == requested
                || control.model.data_key.as_deref() == Some(requested.as_str())
        })
        .ok_or_else(|| LuaError::RuntimeError(format!("Unknown dialog control '{requested}'.")))?;
    if let Some(label) = table_string(&spec, "label")? {
        control.model.label = label;
    }
    if let Some(text) = table_string(&spec, "text")? {
        control.model.text = text.clone();
        if matches!(control.model.kind.as_str(), "entry" | "number") {
            control.model.value = if control.model.kind == "number" {
                text.parse::<f64>()
                    .ok()
                    .map(json_number)
                    .unwrap_or(JsonValue::Null)
            } else {
                JsonValue::String(text)
            };
        }
    }
    if let Some(value) = table_number(&spec, "value")? {
        control.model.value = json_number(value);
    }
    if let Some(selected) = table_boolean(&spec, "selected")? {
        control.model.value = JsonValue::Bool(selected);
    }
    if let Some(option) = table_string(&spec, "option")? {
        control.model.value = JsonValue::String(option);
    }
    if let Some(enabled) = table_boolean(&spec, "enabled")? {
        control.model.enabled = enabled;
    }
    if let Some(visible) = table_boolean(&spec, "visible")? {
        control.model.visible = visible;
    }
    let control_id = control.model.id.clone();
    drop(ui);
    for event in ["onclick", "onchange", "onrelease"] {
        store_callback(
            lua,
            &dialog.id,
            &control_id,
            event,
            spec.get::<Value>(event)?,
        )?;
    }
    Ok(())
}

fn dialog_data<'lua>(lua: &'lua Lua, dialog: &ScriptDialog) -> LuaResult<Table> {
    let data = lua.create_table()?;
    let ui = dialog.ui.borrow();
    let state = ui
        .dialogs
        .get(&dialog.id)
        .ok_or_else(|| LuaError::RuntimeError("Dialog is no longer available.".into()))?;
    for control in &state.controls {
        let Some(key) = &control.model.data_key else {
            continue;
        };
        data.set(key.as_str(), json_to_lua(lua, &control.model.value)?)?;
    }
    Ok(data)
}

fn json_number(value: f64) -> JsonValue {
    JsonNumber::from_f64(value)
        .map(JsonValue::Number)
        .unwrap_or(JsonValue::Null)
}

fn json_to_lua(lua: &Lua, value: &JsonValue) -> LuaResult<Value> {
    Ok(match value {
        JsonValue::Null => Value::Nil,
        JsonValue::Bool(value) => Value::Boolean(*value),
        JsonValue::Number(value) => value
            .as_i64()
            .map(Value::Integer)
            .or_else(|| value.as_f64().map(Value::Number))
            .unwrap_or(Value::Nil),
        JsonValue::String(value) => Value::String(lua.create_string(value)?),
        JsonValue::Object(value)
            if value.contains_key("r") && value.contains_key("g") && value.contains_key("b") =>
        {
            Value::UserData(lua.create_userdata(ScriptColor {
                red: clamp_u8(value.get("r").and_then(JsonValue::as_i64).unwrap_or(0)),
                green: clamp_u8(value.get("g").and_then(JsonValue::as_i64).unwrap_or(0)),
                blue: clamp_u8(value.get("b").and_then(JsonValue::as_i64).unwrap_or(0)),
                alpha: clamp_u8(value.get("a").and_then(JsonValue::as_i64).unwrap_or(255)),
            })?)
        }
        _ => Value::Nil,
    })
}

fn normalize_dialog_value(control: &LuaScriptDialogControl, value: &JsonValue) -> JsonValue {
    match control.kind.as_str() {
        "check" | "radio" => JsonValue::Bool(value.as_bool().unwrap_or(false)),
        "color" => value
            .as_object()
            .filter(|value| {
                value.contains_key("r") && value.contains_key("g") && value.contains_key("b")
            })
            .map(|value| JsonValue::Object(value.clone()))
            .unwrap_or_else(|| control.value.clone()),
        "slider" | "number" => {
            let mut number = value.as_f64().unwrap_or(0.0);
            if let Some(min) = control.min {
                number = number.max(min);
            }
            if let Some(max) = control.max {
                number = number.min(max);
            }
            json_number(number)
        }
        "combobox" => {
            let value = value.as_str().unwrap_or_default();
            if control.options.is_empty() || control.options.iter().any(|option| option == value) {
                JsonValue::String(value.into())
            } else {
                control.value.clone()
            }
        }
        "entry" => JsonValue::String(value.as_str().unwrap_or_default().into()),
        _ => control.value.clone(),
    }
}

fn prepare_dialog_action(
    ui: &Rc<RefCell<ScriptUiState>>,
    action: &LuaScriptDialogAction,
) -> LuaResult<(Option<String>, bool)> {
    let mut ui = ui.borrow_mut();
    let blocking_dialog_id = ui.blocking_dialog_id.clone();
    let dialog = ui
        .dialogs
        .get_mut(&action.dialog_id)
        .ok_or_else(|| LuaError::RuntimeError("Dialog is no longer available.".into()))?;
    let control_kind = action.control_id.as_deref().and_then(|control_id| {
        dialog
            .controls
            .iter()
            .find(|control| control.model.id == control_id)
            .map(|control| control.model.kind.clone())
    });
    if action.event == "click" && control_kind.as_deref() == Some("button") {
        for control in &mut dialog.controls {
            if control.model.kind == "button" {
                control.model.value = JsonValue::Bool(
                    action.control_id.as_deref() == Some(control.model.id.as_str()),
                );
            }
        }
    }
    let resume = blocking_dialog_id.as_deref() == Some(action.dialog_id.as_str())
        && (action.event == "close" || control_kind.as_deref() == Some("button"));
    if resume {
        dialog.closed = true;
        ui.blocking_dialog_id = None;
    }
    Ok((control_kind, resume))
}

fn apply_dialog_values(
    ui: &Rc<RefCell<ScriptUiState>>,
    dialog_id: &str,
    values: &HashMap<String, JsonValue>,
) -> LuaResult<()> {
    let mut ui = ui.borrow_mut();
    let dialog = ui
        .dialogs
        .get_mut(dialog_id)
        .ok_or_else(|| LuaError::RuntimeError("Dialog is no longer available.".into()))?;
    for control in &mut dialog.controls {
        let Some(data_key) = &control.model.data_key else {
            continue;
        };
        if let Some(value) = values.get(data_key) {
            control.model.value = normalize_dialog_value(&control.model, value);
        }
    }
    Ok(())
}

fn callback_for_action(lua: &Lua, action: &LuaScriptDialogAction) -> LuaResult<Option<Function>> {
    let callbacks = lua.globals().get::<Table>(DIALOG_CALLBACKS_GLOBAL)?;
    let Some(control_id) = action.control_id.as_deref() else {
        if action.event == "close" {
            return callbacks.get::<Option<Function>>(callback_key(
                &action.dialog_id,
                "__dialog__",
                "onclose",
            ));
        }
        return Ok(None);
    };
    let events: &[&str] = match action.event.as_str() {
        "click" => &["onclick", "onchange"],
        "change" => &["onchange", "onclick"],
        "release" => &["onrelease", "onchange"],
        _ => &[],
    };
    for event in events {
        if let Some(callback) =
            callbacks.get::<Option<Function>>(callback_key(&action.dialog_id, control_id, event))?
        {
            return Ok(Some(callback));
        }
    }
    Ok(None)
}

fn close_dialog(ui: &Rc<RefCell<ScriptUiState>>, dialog_id: &str) {
    let mut ui = ui.borrow_mut();
    if let Some(dialog) = ui.dialogs.get_mut(dialog_id) {
        dialog.closed = true;
    }
    if ui.blocking_dialog_id.as_deref() == Some(dialog_id) {
        ui.blocking_dialog_id = None;
    }
}

#[derive(Debug)]
struct ExecutionBudget {
    started_at: RefCell<Instant>,
    instruction_count: Cell<u64>,
}

impl ExecutionBudget {
    fn reset(&self) {
        *self.started_at.borrow_mut() = Instant::now();
        self.instruction_count.set(0);
    }
}

#[derive(Debug)]
pub(super) struct LuaInvocation {
    pub(super) output: Vec<String>,
    pub(super) batches: Vec<LuaScriptBatch>,
    pub(super) created_layers: Vec<LuaScriptCreatedLayer>,
    pub(super) created_documents: Vec<LuaScriptCreatedDocument>,
    pub(super) dialogs: Vec<LuaScriptDialog>,
    pub(super) active_layer_id: Option<String>,
    pub(super) active_frame_number: Option<u32>,
    pub(super) elapsed_ms: u64,
}

fn known_cels_from_context(
    context: &LuaScriptContext,
    mode: ScriptPixelMode,
) -> Result<Vec<Rc<RefCell<ScriptKnownCelState>>>, String> {
    let mut total_pixels = context.pixels.len();
    let mut result = Vec::new();
    for cel in &context.active_layer_cels {
        if cel.frame_number == context.frame_number {
            continue;
        }
        let surface = &cel.surface;
        let pixel_count = surface.width as usize * surface.height as usize;
        if surface.format != mode.document_format()
            || pixel_count == 0
            || pixel_count > MAX_IMAGE_PIXELS
            || surface.pixels.len() != pixel_count
        {
            return Err("A Lua animation cel payload is invalid.".into());
        }
        total_pixels = total_pixels.saturating_add(pixel_count);
        if total_pixels > MAX_IMAGE_PIXELS * 4 {
            return Err(format!(
                "Lua animation cels cannot exceed {} pixels per session.",
                MAX_IMAGE_PIXELS * 4
            ));
        }
        result.push(Rc::new(RefCell::new(ScriptKnownCelState {
            id: cel.id.clone(),
            layer_id: context.layer_id.clone(),
            frame_id: cel.frame_id.clone(),
            frame_number: cel.frame_number.max(1),
            image: Rc::new(RefCell::new(ScriptImageData {
                mode,
                width: surface.width as usize,
                height: surface.height as usize,
                pixels: surface
                    .pixels
                    .iter()
                    .copied()
                    .map(|value| mode.aseprite_value_from_document(value))
                    .collect(),
            })),
            offset_x: surface.offset_x,
            offset_y: surface.offset_y,
        })));
    }
    Ok(result)
}

pub(super) struct LuaSession {
    lua: Lua,
    document: Rc<RefCell<ScriptDocumentState>>,
    ui: Rc<RefCell<ScriptUiState>>,
    output: Rc<RefCell<Vec<String>>>,
    budget: Rc<ExecutionBudget>,
    allocated_pixels: Rc<Cell<usize>>,
    main_thread: Option<RegistryKey>,
    script_name: String,
}

impl LuaSession {
    pub(super) fn new(context: LuaScriptContext, script_name: &str) -> Result<Self, String> {
        let pixel_count = context.layer_width as usize * context.layer_height as usize;
        if pixel_count == 0 || context.pixels.len() != pixel_count {
            return Err("The active image pixel payload is invalid.".into());
        }
        if pixel_count > MAX_IMAGE_PIXELS {
            return Err(format!(
                "Lua scripts currently support images up to {MAX_IMAGE_PIXELS} pixels."
            ));
        }
        if let Some(selection) = &context.selection {
            let selection_pixels = selection.width as usize * selection.height as usize;
            if selection
                .mask
                .as_ref()
                .is_some_and(|mask| mask.len() != selection_pixels)
            {
                return Err("The active selection payload is invalid.".into());
            }
        }
        let mode = ScriptPixelMode::from_context(&context)?;
        let known_cels = known_cels_from_context(&context, mode)?;
        let active_image = Rc::new(RefCell::new(ScriptImageData {
            mode,
            width: context.layer_width as usize,
            height: context.layer_height as usize,
            pixels: context
                .pixels
                .iter()
                .copied()
                .map(|value| mode.aseprite_value_from_document(value))
                .collect(),
        }));
        let active_layer = Rc::new(RefCell::new(ScriptLayerData {
            id: context.layer_id.clone(),
            name: context.layer_name.clone(),
            kind: "raster".into(),
            opacity: context.layer_opacity,
            visible: context.layer_visible,
            locked: context.layer_locked,
            continuous: true,
            parent_group_id: context.layer_group_id.clone(),
            stack_index: context.layer_stack_index.max(1),
        }));
        let document = Rc::new(RefCell::new(ScriptDocumentState {
            document_id: context.document_id.clone(),
            document_name: context.document_name.clone(),
            document_width: context.document_width,
            document_height: context.document_height,
            document_file_path: context.document_file_path.clone(),
            mse_snapshot: context.mse_snapshot.clone(),
            selection: context.selection.clone(),
            target_mode: mode,
            target_image: active_image.clone(),
            target_offset_x: context.layer_offset_x,
            target_offset_y: context.layer_offset_y,
            active_surface: ActiveSurfaceRef::Target,
            active_image,
            offset_x: context.layer_offset_x,
            offset_y: context.layer_offset_y,
            active_layer,
            known_cels,
            frame_number: context.frame_number,
            transparent_color: context.transparent_color,
            created_layers: Vec::new(),
            created_documents: Vec::new(),
            default_label: clean_label(script_name, "Lua script"),
            pending: None,
            batches: Vec::new(),
            total_change_count: 0,
        }));
        let ui = Rc::new(RefCell::new(ScriptUiState::default()));
        let output = Rc::new(RefCell::new(Vec::new()));
        let allocated_pixels = Rc::new(Cell::new(
            context.pixels.len()
                + context
                    .active_layer_cels
                    .iter()
                    .filter(|cel| cel.frame_number != context.frame_number)
                    .map(|cel| cel.surface.pixels.len())
                    .sum::<usize>(),
        ));
        let budget = Rc::new(ExecutionBudget {
            started_at: RefCell::new(Instant::now()),
            instruction_count: Cell::new(0),
        });
        let lua = Lua::new_with(
            StdLib::COROUTINE | StdLib::TABLE | StdLib::STRING | StdLib::UTF8 | StdLib::MATH,
            LuaOptions::default(),
        )
        .map_err(|error| error.to_string())?;
        lua.set_memory_limit(MAX_LUA_MEMORY_BYTES)
            .map_err(|error| error.to_string())?;
        let hook_budget = budget.clone();
        lua.set_hook(
            HookTriggers::new().every_nth_instruction(HOOK_INSTRUCTION_INTERVAL),
            move |_, _| {
                let next = hook_budget.instruction_count.get() + HOOK_INSTRUCTION_INTERVAL as u64;
                hook_budget.instruction_count.set(next);
                if next > MAX_INSTRUCTIONS
                    || hook_budget.started_at.borrow().elapsed()
                        > Duration::from_millis(MAX_EXECUTION_MILLIS)
                {
                    return Err(LuaError::RuntimeError(
                        "Lua script execution limit exceeded.".into(),
                    ));
                }
                Ok(VmState::Continue)
            },
        );
        install_sandbox_globals(
            &lua,
            &context,
            script_name,
            document.clone(),
            ui.clone(),
            output.clone(),
            allocated_pixels.clone(),
        )
        .map_err(|error| error.to_string())?;
        Ok(Self {
            lua,
            document,
            ui,
            output,
            budget,
            allocated_pixels,
            main_thread: None,
            script_name: script_name.into(),
        })
    }

    pub(super) fn execute_source(&mut self, source: &str) -> Result<LuaInvocation, String> {
        let script_name = self.script_name.clone();
        let function = self
            .lua
            .load(source)
            .set_name(&script_name)
            .into_function()
            .map_err(|error| error.to_string())?;
        let thread = self
            .lua
            .create_thread(function)
            .map_err(|error| error.to_string())?;
        let thread_budget = self.budget.clone();
        thread.set_hook(
            HookTriggers::new().every_nth_instruction(HOOK_INSTRUCTION_INTERVAL),
            move |_, _| {
                let next = thread_budget.instruction_count.get() + HOOK_INSTRUCTION_INTERVAL as u64;
                thread_budget.instruction_count.set(next);
                if next > MAX_INSTRUCTIONS
                    || thread_budget.started_at.borrow().elapsed()
                        > Duration::from_millis(MAX_EXECUTION_MILLIS)
                {
                    return Err(LuaError::RuntimeError(
                        "Lua script execution limit exceeded.".into(),
                    ));
                }
                Ok(VmState::Continue)
            },
        );
        self.main_thread = Some(
            self.lua
                .create_registry_value(thread.clone())
                .map_err(|error| error.to_string())?,
        );
        let result = self.invoke(move |_| {
            let _: MultiValue = thread.resume(())?;
            Ok(())
        });
        self.clear_finished_main_thread();
        result
    }

    pub(super) fn rebase(&mut self, context: LuaScriptContext) -> Result<(), String> {
        let pixel_count = context.layer_width as usize * context.layer_height as usize;
        if pixel_count == 0 || context.pixels.len() != pixel_count || pixel_count > MAX_IMAGE_PIXELS
        {
            return Err("The active image pixel payload is invalid.".into());
        }
        if let Some(selection) = &context.selection {
            let selection_pixels = selection.width as usize * selection.height as usize;
            if selection
                .mask
                .as_ref()
                .is_some_and(|mask| mask.len() != selection_pixels)
            {
                return Err("The active selection payload is invalid.".into());
            }
        }
        let mode = ScriptPixelMode::from_context(&context)?;
        let known_cels = known_cels_from_context(&context, mode)?;
        let mut document = self.document.borrow_mut();
        if document.document_id != context.document_id || mode != document.target_mode {
            return Err("The Lua script target is no longer available.".into());
        }
        let active_image = document.active_image.clone();
        *active_image.borrow_mut() = ScriptImageData {
            mode,
            width: context.layer_width as usize,
            height: context.layer_height as usize,
            pixels: context
                .pixels
                .iter()
                .copied()
                .map(|value| mode.aseprite_value_from_document(value))
                .collect(),
        };
        let active_layer = document.active_layer.clone();
        *active_layer.borrow_mut() = ScriptLayerData {
            id: context.layer_id.clone(),
            name: context.layer_name.clone(),
            kind: "raster".into(),
            opacity: context.layer_opacity,
            visible: context.layer_visible,
            locked: context.layer_locked,
            continuous: true,
            parent_group_id: context.layer_group_id.clone(),
            stack_index: context.layer_stack_index.max(1),
        };
        document.document_name = context.document_name.clone();
        document.document_width = context.document_width;
        document.document_height = context.document_height;
        document.document_file_path = context.document_file_path.clone();
        document.mse_snapshot = context.mse_snapshot.clone();
        document.selection = context.selection.clone();
        document.target_image = active_image.clone();
        document.target_offset_x = context.layer_offset_x;
        document.target_offset_y = context.layer_offset_y;
        document.active_surface = ActiveSurfaceRef::Target;
        document.active_image = active_image;
        document.offset_x = context.layer_offset_x;
        document.offset_y = context.layer_offset_y;
        document.active_layer = active_layer;
        document.known_cels = known_cels;
        document.frame_number = context.frame_number;
        document.transparent_color = context.transparent_color;
        document.created_layers.clear();
        document.created_documents.clear();
        document.pending = None;
        document.batches.clear();
        document.total_change_count = 0;
        drop(document);
        self.allocated_pixels.set(
            context.pixels.len()
                + context
                    .active_layer_cels
                    .iter()
                    .filter(|cel| cel.frame_number != context.frame_number)
                    .map(|cel| cel.surface.pixels.len())
                    .sum::<usize>(),
        );
        refresh_active_globals(
            &self.lua,
            &self.document,
            &self.allocated_pixels,
            context.transparent_color,
        )
        .map_err(|error| error.to_string())?;
        let app = self
            .lua
            .globals()
            .get::<Table>("app")
            .map_err(|error| error.to_string())?;
        app.set(
            "fgColor",
            self.lua
                .create_userdata(ScriptColor::from_rgba(context.foreground))
                .map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        app.set(
            "bgColor",
            self.lua
                .create_userdata(ScriptColor::from_rgba(context.background))
                .map_err(|error| error.to_string())?,
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub(super) fn dispatch(
        &mut self,
        action: LuaScriptDialogAction,
    ) -> Result<LuaInvocation, String> {
        if !matches!(
            action.event.as_str(),
            "click" | "change" | "release" | "close"
        ) {
            return Err("Unsupported Lua dialog event.".into());
        }
        let ui = self.ui.clone();
        let main_thread = self
            .main_thread
            .as_ref()
            .map(|key| self.lua.registry_value::<Thread>(key))
            .transpose()
            .map_err(|error| error.to_string())?;
        let result = self.invoke(move |lua| {
            apply_dialog_values(&ui, &action.dialog_id, &action.values)?;
            let (_, resume_main_thread) = prepare_dialog_action(&ui, &action)?;
            if let Some(callback) = callback_for_action(lua, &action)? {
                callback.call::<()>(())?;
            }
            if action.event == "close" {
                close_dialog(&ui, &action.dialog_id);
            }
            if resume_main_thread {
                let thread = main_thread.as_ref().ok_or_else(|| {
                    LuaError::RuntimeError(
                        "The blocking dialog continuation is unavailable.".into(),
                    )
                })?;
                let _: MultiValue = thread.resume(())?;
            }
            Ok(())
        });
        self.clear_finished_main_thread();
        result
    }

    fn clear_finished_main_thread(&mut self) {
        let finished = self
            .main_thread
            .as_ref()
            .and_then(|key| self.lua.registry_value::<Thread>(key).ok())
            .is_some_and(|thread| {
                matches!(
                    thread.status(),
                    ThreadStatus::Finished | ThreadStatus::Error
                )
            });
        if finished {
            if let Some(key) = self.main_thread.take() {
                let _ = self.lua.remove_registry_value(key);
            }
        }
    }

    fn invoke(
        &mut self,
        operation: impl FnOnce(&Lua) -> LuaResult<()>,
    ) -> Result<LuaInvocation, String> {
        let baseline = self.document.borrow().checkpoint();
        self.document.borrow_mut().batches.clear();
        self.document.borrow_mut().pending = None;
        self.document.borrow_mut().total_change_count = 0;
        self.output.borrow_mut().clear();
        self.budget.reset();
        let started_at = Instant::now();
        if let Err(error) = operation(&self.lua) {
            self.document.borrow_mut().restore_invocation(&baseline);
            return Err(error.to_string());
        }
        if let Err(error) = self.document.borrow_mut().flush_pending() {
            self.document.borrow_mut().restore_invocation(&baseline);
            return Err(error.to_string());
        }
        let elapsed_ms = started_at.elapsed().as_millis().min(u64::MAX as u128) as u64;
        let output = std::mem::take(&mut *self.output.borrow_mut());
        let (created_layers, created_documents) = {
            let document = self.document.borrow();
            (
                document.created_layers_since(baseline.created_layer_count),
                document.created_documents_since(baseline.created_document_count),
            )
        };
        let structural_pixel_count = created_layers
            .iter()
            .map(|layer| layer.surface.pixels.len())
            .chain(created_documents.iter().flat_map(|document| {
                document
                    .layers
                    .iter()
                    .map(|layer| layer.surface.pixels.len())
            }))
            .sum::<usize>();
        if structural_pixel_count > MAX_CHANGED_PIXELS {
            self.document.borrow_mut().restore_invocation(&baseline);
            return Err(format!(
                "The script changed more than {MAX_CHANGED_PIXELS} pixels."
            ));
        }
        let batches = std::mem::take(&mut self.document.borrow_mut().batches);
        let dialogs = self.ui.borrow().snapshots();
        let app = self
            .lua
            .globals()
            .get::<Table>("app")
            .map_err(|error| error.to_string())?;
        let active_layer_id = match app
            .get::<Value>("activeLayer")
            .map_err(|error| error.to_string())?
        {
            Value::UserData(value) if value.is::<ScriptLayer>() => Some(
                value
                    .borrow::<ScriptLayer>()
                    .map_err(|error| error.to_string())?
                    .data
                    .borrow()
                    .id
                    .clone(),
            ),
            _ => None,
        };
        let active_frame_number = match app
            .get::<Value>("activeFrame")
            .map_err(|error| error.to_string())?
        {
            Value::Integer(value) => Some(value.max(1) as u32),
            Value::Number(value) if value.is_finite() => Some(value.round().max(1.0) as u32),
            Value::UserData(value) if value.is::<ScriptFrame>() => Some(
                value
                    .borrow::<ScriptFrame>()
                    .map_err(|error| error.to_string())?
                    .number
                    .max(1),
            ),
            _ => None,
        };
        Ok(LuaInvocation {
            output,
            batches,
            created_layers,
            created_documents,
            dialogs,
            active_layer_id,
            active_frame_number,
            elapsed_ms,
        })
    }
}

fn install_sandbox_globals(
    lua: &Lua,
    context: &LuaScriptContext,
    script_name: &str,
    document: Rc<RefCell<ScriptDocumentState>>,
    ui: Rc<RefCell<ScriptUiState>>,
    output: Rc<RefCell<Vec<String>>>,
    allocated_pixels: Rc<Cell<usize>>,
) -> LuaResult<()> {
    let globals = lua.globals();
    for name in [
        "debug", "dofile", "io", "loadfile", "os", "package", "require",
    ] {
        globals.set(name, Value::Nil)?;
    }

    globals.set(DIALOG_CALLBACKS_GLOBAL, lua.create_table()?)?;

    let color_mode = lua.create_table()?;
    color_mode.set("RGB", 0)?;
    color_mode.set("GRAY", 1)?;
    color_mode.set("INDEXED", 2)?;
    color_mode.set("TILEMAP", 3)?;
    globals.set("ColorMode", color_mode)?;

    let ani_dir = lua.create_table()?;
    ani_dir.set("FORWARD", 0)?;
    ani_dir.set("REVERSE", 1)?;
    ani_dir.set("PING_PONG", 2)?;
    ani_dir.set("PING_PONG_REVERSE", 3)?;
    globals.set("AniDir", ani_dir)?;

    let range_type = lua.create_table()?;
    range_type.set("EMPTY", 0)?;
    range_type.set("CELS", 1)?;
    range_type.set("FRAMES", 2)?;
    range_type.set("LAYERS", 3)?;
    globals.set("RangeType", range_type)?;

    globals.set(
        "Color",
        lua.create_function(|lua, args: Variadic<Value>| lua.create_userdata(create_color(args)?))?,
    )?;
    globals.set(
        "Point",
        lua.create_function(|lua, args: Variadic<Value>| {
            let point = match args.as_slice() {
                [Value::Integer(x), Value::Integer(y), ..] => ScriptPoint {
                    x: *x as i32,
                    y: *y as i32,
                },
                [Value::Number(x), Value::Number(y), ..] => ScriptPoint {
                    x: x.round() as i32,
                    y: y.round() as i32,
                },
                [value, ..] => point_from_value(value.clone())?,
                _ => ScriptPoint { x: 0, y: 0 },
            };
            lua.create_userdata(point)
        })?,
    )?;
    globals.set(
        "Rectangle",
        lua.create_function(|lua, args: Variadic<Value>| {
            let values = args
                .iter()
                .map(|value| match value {
                    Value::Integer(value) => *value as i32,
                    Value::Number(value) => value.round() as i32,
                    _ => 0,
                })
                .collect::<Vec<_>>();
            lua.create_userdata(ScriptRectangle {
                x: *values.first().unwrap_or(&0),
                y: *values.get(1).unwrap_or(&0),
                width: (*values.get(2).unwrap_or(&0)).max(0) as u32,
                height: (*values.get(3).unwrap_or(&0)).max(0) as u32,
            })
        })?,
    )?;

    let image_document = Rc::downgrade(&document);
    let image_allocated_pixels = allocated_pixels.clone();
    let transparent_color = context.transparent_color;
    globals.set(
        "Image",
        lua.create_function(move |lua, args: Variadic<Value>| {
            let image = create_image(
                args,
                image_document.clone(),
                image_allocated_pixels.clone(),
                transparent_color,
            )?;
            lua.create_userdata(image)
        })?,
    )?;

    let dialog_ui = ui.clone();
    globals.set(
        "__moonsprite_create_dialog",
        lua.create_function(move |lua, options: Option<Value>| {
            let (options, title) = match options {
                Some(Value::Table(options)) => {
                    let title = table_string(&options, "title")?.unwrap_or_default();
                    (Some(options), title)
                }
                Some(Value::String(title)) => (None, title.to_string_lossy()),
                _ => (None, String::new()),
            };
            let mut ui = dialog_ui.borrow_mut();
            ui.next_dialog_id = ui.next_dialog_id.saturating_add(1);
            let id = format!("dialog-{}", ui.next_dialog_id);
            ui.order.push(id.clone());
            ui.dialogs.insert(
                id.clone(),
                DialogState {
                    title,
                    controls: Vec::new(),
                    visible: false,
                    closed: false,
                },
            );
            drop(ui);
            if let Some(options) = options {
                store_callback(
                    lua,
                    &id,
                    "__dialog__",
                    "onclose",
                    options.get::<Value>("onclose")?,
                )?;
            }
            lua.create_userdata(ScriptDialog {
                id,
                ui: dialog_ui.clone(),
            })
        })?,
    )?;
    lua.load(
        r#"
            function Dialog(options)
                local native = __moonsprite_create_dialog(options)
                local proxy = { __native = native }
                local methods = {}
                for _, name in ipairs({
                    "button", "check", "color", "combobox", "entry", "label",
                    "number", "radio", "separator", "slider", "modify", "newrow", "repaint"
                }) do
                    methods[name] = function(self, spec)
                        native[name](native, spec)
                        return self
                    end
                end
                methods.close = function(self)
                    native:close()
                    return self
                end
                methods.show = function(self, show_options)
                    native:show(show_options)
                    local wait = show_options == nil or show_options.wait ~= false
                    if wait and coroutine.isyieldable() then
                        coroutine.yield("__moonsprite_dialog_wait", native.id)
                    end
                    return self
                end
                return setmetatable(proxy, {
                    __index = function(_, key)
                        if methods[key] ~= nil then return methods[key] end
                        return native[key]
                    end
                })
            end
        "#,
    )
    .exec()?;

    let print_output = output.clone();
    globals.set(
        "print",
        lua.create_function(move |_, values: Variadic<Value>| {
            push_output(
                &print_output,
                values.iter().map(value_text).collect::<Vec<_>>().join("\t"),
            );
            Ok(())
        })?,
    )?;

    let app = lua.create_table()?;
    app.set("pixelColor", create_pixel_color_table(lua)?)?;
    app.set(
        "fgColor",
        lua.create_userdata(ScriptColor::from_rgba(context.foreground))?,
    )?;
    app.set(
        "bgColor",
        lua.create_userdata(ScriptColor::from_rgba(context.background))?,
    )?;
    app.set("params", lua.create_table()?)?;
    app.set("isUIAvailable", true)?;

    let alert_output = output.clone();
    app.set(
        "alert",
        lua.create_function(move |_, value: Value| {
            let message = match value {
                Value::Table(table) => {
                    let title = table_string(&table, "title")?.unwrap_or_default();
                    let text = match table.get::<Value>("text")? {
                        Value::Table(lines) => lines
                            .sequence_values::<Value>()
                            .filter_map(Result::ok)
                            .map(|value| value_text(&value))
                            .collect::<Vec<_>>()
                            .join("\n"),
                        value => value_text(&value),
                    };
                    if title.trim().is_empty() {
                        text
                    } else {
                        format!("{}: {}", title.trim(), text)
                    }
                }
                value => value_text(&value),
            };
            push_output(&alert_output, message);
            Ok(1)
        })?,
    )?;

    let transaction_document = document.clone();
    let default_label = clean_label(script_name, "Lua script");
    app.set(
        "transaction",
        lua.create_function(move |_, args: Variadic<Value>| -> LuaResult<MultiValue> {
            let (label, function): (String, Function) = match args.as_slice() {
                [Value::Function(function), ..] => (default_label.clone(), function.clone()),
                [Value::String(label), Value::Function(function), ..] => {
                    (label.to_string_lossy(), function.clone())
                }
                _ => {
                    return Err(LuaError::RuntimeError(
                        "app.transaction() expects a function or a label and function.".into(),
                    ));
                }
            };
            transaction_document
                .borrow_mut()
                .begin_explicit_transaction(label)?;
            match function.call::<MultiValue>(()) {
                Ok(values) => {
                    transaction_document
                        .borrow_mut()
                        .finish_explicit_transaction()?;
                    Ok(values)
                }
                Err(error) => {
                    transaction_document
                        .borrow_mut()
                        .rollback_explicit_transaction();
                    Err(error)
                }
            }
        })?,
    )?;
    app.set("refresh", lua.create_function(|_, ()| Ok(()))?)?;

    let command = lua.create_table()?;
    command.set("Undo", lua.create_function(|_, ()| Ok(()))?)?;
    command.set("Redo", lua.create_function(|_, ()| Ok(()))?)?;
    app.set("command", command)?;

    let use_tool_document = document.clone();
    let use_tool_allocated = allocated_pixels.clone();
    app.set(
        "useTool",
        lua.create_function(move |_, spec: Table| {
            apply_use_tool(
                &use_tool_document,
                &use_tool_allocated,
                transparent_color,
                spec,
            )
        })?,
    )?;

    let mouse_button = lua.create_table()?;
    mouse_button.set("left", 1)?;
    mouse_button.set("right", 2)?;
    mouse_button.set("middle", 3)?;
    globals.set("MouseButton", mouse_button)?;

    globals.set("app", app.clone())?;
    refresh_active_globals(lua, &document, &allocated_pixels, context.transparent_color)?;

    let sprite_document = document.clone();
    let sprite_allocated = allocated_pixels.clone();
    globals.set(
        "Sprite",
        lua.create_function(move |lua, args: Variadic<Value>| {
            let (width, height) = match args.as_slice() {
                [width, height, ..] => (
                    numeric_value(width)?.round() as i64,
                    numeric_value(height)?.round() as i64,
                ),
                [Value::Table(spec), ..] => (
                    table_number(spec, "width")?.unwrap_or(0.0).round() as i64,
                    table_number(spec, "height")?.unwrap_or(0.0).round() as i64,
                ),
                _ => {
                    return Err(LuaError::RuntimeError(
                        "Sprite expects a width and height.".into(),
                    ));
                }
            };
            if width < 1 || height < 1 {
                return Err(LuaError::RuntimeError(
                    "Sprite dimensions must be positive.".into(),
                ));
            }
            let pixel_count = (width as usize)
                .checked_mul(height as usize)
                .ok_or_else(|| LuaError::RuntimeError("Sprite dimensions are too large.".into()))?;
            if pixel_count > MAX_IMAGE_PIXELS {
                return Err(LuaError::RuntimeError(format!(
                    "Sprites cannot exceed {MAX_IMAGE_PIXELS} pixels."
                )));
            }
            reserve_image_pixels(&sprite_allocated, pixel_count)?;
            let mode = sprite_document.borrow().target_mode;
            let image = Rc::new(RefCell::new(ScriptImageData {
                mode,
                width: width as usize,
                height: height as usize,
                pixels: vec![
                    if mode == ScriptPixelMode::Indexed {
                        transparent_color
                    } else {
                        0
                    };
                    pixel_count
                ],
            }));
            let layer = Rc::new(RefCell::new(ScriptLayerData {
                id: next_script_object_id("lua-layer"),
                name: "Layer 1".into(),
                kind: "raster".into(),
                opacity: 255,
                visible: true,
                locked: false,
                continuous: true,
                parent_group_id: None,
                stack_index: 1,
            }));
            let layer_state = Rc::new(RefCell::new(ScriptCreatedLayerState {
                layer: layer.clone(),
                image: image.clone(),
                offset_x: 0,
                offset_y: 0,
                frame_number: 1,
            }));
            let document_index = {
                let mut document = sprite_document.borrow_mut();
                document.ensure_pending();
                let index = document.created_documents.len();
                document.created_documents.push(Rc::new(RefCell::new(
                    ScriptCreatedDocumentState {
                        name: "Sprite".into(),
                        width: width as u32,
                        height: height as u32,
                        mode,
                        layers: vec![layer_state],
                        active_layer: 0,
                    },
                )));
                document.active_surface = ActiveSurfaceRef::CreatedDocument {
                    document: index,
                    layer: 0,
                };
                document.active_image = image;
                document.offset_x = 0;
                document.offset_y = 0;
                document.active_layer = layer;
                index
            };
            refresh_active_globals(lua, &sprite_document, &sprite_allocated, transparent_color)?;
            lua.create_userdata(ScriptSprite {
                kind: ScriptSpriteKind::CreatedDocument(document_index),
                document: sprite_document.clone(),
                allocated_pixels: sprite_allocated.clone(),
                transparent_color,
            })
        })?,
    )?;
    mse_api::install(lua, document.clone())?;
    Ok(())
}

fn refresh_active_globals(
    lua: &Lua,
    document: &Rc<RefCell<ScriptDocumentState>>,
    allocated_pixels: &Rc<Cell<usize>>,
    transparent_color: u32,
) -> LuaResult<()> {
    let (sprite_kind, active_image, active_layer, frame_number) = {
        let document = document.borrow();
        (
            document
                .active_sprite_ref()
                .map(ScriptSpriteKind::CreatedDocument)
                .unwrap_or(ScriptSpriteKind::Root),
            document.active_image.clone(),
            document.active_layer.clone(),
            document.active_frame_number(),
        )
    };
    let sprite = lua.create_userdata(ScriptSprite {
        kind: sprite_kind,
        document: document.clone(),
        allocated_pixels: allocated_pixels.clone(),
        transparent_color,
    })?;
    let layer = lua.create_userdata(ScriptLayer::new(
        active_layer.clone(),
        document,
        allocated_pixels.clone(),
        transparent_color,
    ))?;
    let cel = lua.create_userdata(ScriptCel {
        document: document.clone(),
        allocated_pixels: allocated_pixels.clone(),
        transparent_color,
        frame_number,
        layer: active_layer,
        known: None,
    })?;
    let image = lua.create_userdata(ScriptImage {
        data: active_image,
        document: Rc::downgrade(document),
        allocated_pixels: allocated_pixels.clone(),
        transparent_color,
    })?;
    let app = lua.globals().get::<Table>("app")?;
    app.set("activeSprite", sprite.clone())?;
    app.set("sprite", sprite)?;
    app.set("activeImage", image)?;
    app.set("activeLayer", layer)?;
    app.set("activeCel", cel)?;
    app.set(
        "activeFrame",
        lua.create_userdata(script_frame_for_number(document, frame_number))?,
    )?;
    app.set("frame", frame_number)?;
    app.set(
        "range",
        lua.create_userdata(ScriptRange {
            document: document.clone(),
            allocated_pixels: allocated_pixels.clone(),
            transparent_color,
        })?,
    )?;
    Ok(())
}

fn apply_use_tool(
    document: &Rc<RefCell<ScriptDocumentState>>,
    _allocated_pixels: &Rc<Cell<usize>>,
    transparent_color: u32,
    spec: Table,
) -> LuaResult<()> {
    let tool = table_string(&spec, "tool")?
        .unwrap_or_default()
        .to_lowercase();
    if !matches!(tool.as_str(), "line" | "eraser") {
        return Err(LuaError::RuntimeError(format!(
            "app.useTool() does not support the '{tool}' tool yet."
        )));
    }
    let points = match spec.get::<Value>("points")? {
        Value::Table(points) => points
            .sequence_values::<Value>()
            .map(|value| point_from_value(value?))
            .collect::<LuaResult<Vec<_>>>()?,
        _ => Vec::new(),
    };
    if points.is_empty() {
        return Ok(());
    }
    let (image, mode, offset_x, offset_y) = {
        let mut document = document.borrow_mut();
        document.ensure_pending();
        let image = document.active_image.clone();
        let mode = image.borrow().mode;
        (image, mode, document.offset_x, document.offset_y)
    };
    let value = if tool == "eraser" {
        if mode == ScriptPixelMode::Indexed {
            transparent_color
        } else {
            0
        }
    } else {
        pixel_value_from_lua(spec.get::<Value>("color")?, mode)?
    };
    let mut image = image.borrow_mut();
    let mut draw = |point: ScriptPoint| {
        let x = point.x - offset_x;
        let y = point.y - offset_y;
        if x >= 0 && y >= 0 && (x as usize) < image.width && (y as usize) < image.height {
            let index = y as usize * image.width + x as usize;
            image.pixels[index] = value;
        }
    };
    if points.len() == 1 {
        draw(points[0]);
        return Ok(());
    }
    for pair in points.windows(2) {
        let mut x0 = pair[0].x;
        let mut y0 = pair[0].y;
        let x1 = pair[1].x;
        let y1 = pair[1].y;
        let dx = (x1 - x0).abs();
        let sx = if x0 < x1 { 1 } else { -1 };
        let dy = -(y1 - y0).abs();
        let sy = if y0 < y1 { 1 } else { -1 };
        let mut error = dx + dy;
        loop {
            draw(ScriptPoint { x: x0, y: y0 });
            if x0 == x1 && y0 == y1 {
                break;
            }
            let twice = error * 2;
            if twice >= dy {
                error += dy;
                x0 += sx;
            }
            if twice <= dx {
                error += dx;
                y0 += sy;
            }
        }
    }
    Ok(())
}

fn create_image(
    args: Variadic<Value>,
    document: Weak<RefCell<ScriptDocumentState>>,
    allocated_pixels: Rc<Cell<usize>>,
    transparent_color: u32,
) -> LuaResult<ScriptImage> {
    if let [Value::UserData(value), ..] = args.as_slice() {
        if value.is::<ScriptImage>() {
            let source = value.borrow::<ScriptImage>()?;
            let data = source.data.borrow().clone();
            reserve_image_pixels(&allocated_pixels, data.width * data.height)?;
            return Ok(ScriptImage {
                data: Rc::new(RefCell::new(data)),
                document,
                allocated_pixels,
                transparent_color,
            });
        }
    }
    let (width, height, mode) = match args.as_slice() {
        [Value::Table(spec), ..] => {
            let width = table_number(spec, "width")?.unwrap_or(0.0).round() as i64;
            let height = table_number(spec, "height")?.unwrap_or(0.0).round() as i64;
            let fallback_mode = document
                .upgrade()
                .map(|document| document.borrow().target_mode.aseprite_color_mode() as f64)
                .unwrap_or(0.0);
            let mode = table_number(spec, "colorMode")?
                .unwrap_or(fallback_mode)
                .round() as i64;
            (width, height, ScriptPixelMode::from_aseprite_value(mode)?)
        }
        [width, height, color_mode, ..] => (
            numeric_value(width)?.round() as i64,
            numeric_value(height)?.round() as i64,
            ScriptPixelMode::from_aseprite_value(numeric_value(color_mode)?.round() as i64)?,
        ),
        [width, height, ..] => {
            let mode = document
                .upgrade()
                .map(|document| document.borrow().target_mode)
                .unwrap_or(ScriptPixelMode::Rgba);
            (
                numeric_value(width)?.round() as i64,
                numeric_value(height)?.round() as i64,
                mode,
            )
        }
        _ => {
            return Err(LuaError::RuntimeError(
                "Image expects width, height, and an optional color mode.".into(),
            ));
        }
    };
    if width < 1 || height < 1 {
        return Err(LuaError::RuntimeError(
            "Image dimensions must be positive.".into(),
        ));
    }
    let pixel_count = (width as usize)
        .checked_mul(height as usize)
        .ok_or_else(|| LuaError::RuntimeError("Image dimensions are too large.".into()))?;
    if pixel_count > MAX_IMAGE_PIXELS {
        return Err(LuaError::RuntimeError(format!(
            "Images cannot exceed {MAX_IMAGE_PIXELS} pixels."
        )));
    }
    reserve_image_pixels(&allocated_pixels, pixel_count)?;
    Ok(ScriptImage {
        data: Rc::new(RefCell::new(ScriptImageData {
            mode,
            width: width as usize,
            height: height as usize,
            pixels: vec![
                if mode == ScriptPixelMode::Indexed {
                    transparent_color
                } else {
                    0
                };
                pixel_count
            ],
        })),
        document,
        allocated_pixels,
        transparent_color,
    })
}

fn reserve_image_pixels(allocated: &Cell<usize>, pixel_count: usize) -> LuaResult<()> {
    let next = allocated.get().saturating_add(pixel_count);
    if next > MAX_ALLOCATED_IMAGE_PIXELS {
        return Err(LuaError::RuntimeError(format!(
            "Lua images cannot allocate more than {MAX_ALLOCATED_IMAGE_PIXELS} pixels per session."
        )));
    }
    allocated.set(next);
    Ok(())
}

fn numeric_value(value: &Value) -> LuaResult<f64> {
    match value {
        Value::Integer(value) => Ok(*value as f64),
        Value::Number(value) if value.is_finite() => Ok(*value),
        _ => Err(LuaError::RuntimeError("Expected a numeric value.".into())),
    }
}

fn clamp_u8(value: i64) -> u8 {
    value.clamp(0, 255) as u8
}

fn rgb_to_hsv(red: u8, green: u8, blue: u8) -> (f64, f64, f64) {
    let red = red as f64 / 255.0;
    let green = green as f64 / 255.0;
    let blue = blue as f64 / 255.0;
    let max = red.max(green).max(blue);
    let min = red.min(green).min(blue);
    let delta = max - min;
    let hue = if delta == 0.0 {
        0.0
    } else if max == red {
        60.0 * ((green - blue) / delta).rem_euclid(6.0)
    } else if max == green {
        60.0 * (((blue - red) / delta) + 2.0)
    } else {
        60.0 * (((red - green) / delta) + 4.0)
    };
    let saturation = if max == 0.0 { 0.0 } else { delta / max };
    (hue, saturation, max)
}

fn hsv_to_rgb(hue: f64, saturation: f64, value: f64) -> (u8, u8, u8) {
    let hue = hue.rem_euclid(360.0);
    let saturation = saturation.clamp(0.0, 1.0);
    let value = value.clamp(0.0, 1.0);
    let chroma = value * saturation;
    let segment = hue / 60.0;
    let secondary = chroma * (1.0 - (segment.rem_euclid(2.0) - 1.0).abs());
    let (red, green, blue) = match segment.floor() as i32 {
        0 => (chroma, secondary, 0.0),
        1 => (secondary, chroma, 0.0),
        2 => (0.0, chroma, secondary),
        3 => (0.0, secondary, chroma),
        4 => (secondary, 0.0, chroma),
        _ => (chroma, 0.0, secondary),
    };
    let match_value = value - chroma;
    let channel = |channel: f64| ((channel + match_value) * 255.0).round().clamp(0.0, 255.0) as u8;
    (channel(red), channel(green), channel(blue))
}

fn pack_rgba(red: u8, green: u8, blue: u8, alpha: u8) -> u32 {
    red as u32 | ((green as u32) << 8) | ((blue as u32) << 16) | ((alpha as u32) << 24)
}

fn pack_graya(gray: u8, alpha: u8) -> u32 {
    gray as u32 | ((alpha as u32) << 8)
}

fn pixel_value_from_lua(value: Value, mode: ScriptPixelMode) -> LuaResult<u32> {
    match value {
        Value::Integer(value) => Ok(value as u32),
        Value::Number(value) if value.is_finite() => Ok(value.round() as i64 as u32),
        Value::UserData(value) if value.is::<ScriptColor>() => {
            let color = *value.borrow::<ScriptColor>()?;
            match mode {
                ScriptPixelMode::Rgba => Ok(color.rgba()),
                ScriptPixelMode::Grayscale => {
                    let gray = ((color.red as u32 * 77
                        + color.green as u32 * 150
                        + color.blue as u32 * 29
                        + 128)
                        >> 8) as u8;
                    Ok(pack_graya(gray, color.alpha))
                }
                ScriptPixelMode::Indexed => Err(LuaError::RuntimeError(
                    "Indexed images require a palette index, for example app.pixelColor.index(1)."
                        .into(),
                )),
            }
        }
        _ => Err(LuaError::RuntimeError(
            "Pixel values must be integers or Color values.".into(),
        )),
    }
}

fn script_color_from_value(value: Value) -> LuaResult<ScriptColor> {
    let mut color = ScriptColor {
        red: 0,
        green: 0,
        blue: 0,
        alpha: 255,
    };
    match value {
        Value::UserData(value) if value.is::<ScriptColor>() => {
            color = *value.borrow::<ScriptColor>()?;
        }
        Value::Table(table) => {
            let hue = table_number(&table, "h")?;
            let saturation = table_number(&table, "s")?;
            let brightness = table_number(&table, "v")?;
            if hue.is_some() || saturation.is_some() || brightness.is_some() {
                let (red, green, blue) = hsv_to_rgb(
                    hue.unwrap_or(0.0),
                    saturation.unwrap_or(0.0),
                    brightness.unwrap_or(0.0),
                );
                color.red = red;
                color.green = green;
                color.blue = blue;
            } else {
                color.red = clamp_u8(table.get::<Option<i64>>("r")?.unwrap_or(0));
                color.green = clamp_u8(table.get::<Option<i64>>("g")?.unwrap_or(0));
                color.blue = clamp_u8(table.get::<Option<i64>>("b")?.unwrap_or(0));
            }
            color.alpha = clamp_u8(table.get::<Option<i64>>("a")?.unwrap_or(255));
        }
        Value::String(value) => {
            let text = value.to_str()?.trim().trim_start_matches('#').to_string();
            let parsed = match text.len() {
                6 => u32::from_str_radix(&text, 16)
                    .map(|rgb| ScriptColor {
                        red: ((rgb >> 16) & 0xff) as u8,
                        green: ((rgb >> 8) & 0xff) as u8,
                        blue: (rgb & 0xff) as u8,
                        alpha: 255,
                    })
                    .ok(),
                8 => u32::from_str_radix(&text, 16)
                    .map(|rgba| ScriptColor {
                        red: ((rgba >> 24) & 0xff) as u8,
                        green: ((rgba >> 16) & 0xff) as u8,
                        blue: ((rgba >> 8) & 0xff) as u8,
                        alpha: (rgba & 0xff) as u8,
                    })
                    .ok(),
                _ => None,
            };
            color = parsed.ok_or_else(|| {
                LuaError::RuntimeError("Color strings must use #RRGGBB or #RRGGBBAA.".into())
            })?;
        }
        Value::Integer(value) => color = ScriptColor::from_rgba(value as u32),
        Value::Number(value) => color = ScriptColor::from_rgba(value as u32),
        Value::Nil => {}
        _ => {
            return Err(LuaError::RuntimeError(
                "Color expects a table, hexadecimal string, or packed RGBA value.".into(),
            ));
        }
    }
    Ok(color)
}

fn create_color(args: Variadic<Value>) -> LuaResult<ScriptColor> {
    script_color_from_value(args.first().cloned().unwrap_or(Value::Nil))
}

fn create_pixel_color_table(lua: &Lua) -> LuaResult<Table> {
    let pixel_color = lua.create_table()?;
    pixel_color.set(
        "rgba",
        lua.create_function(
            |_, (red, green, blue, alpha): (i64, i64, i64, Option<i64>)| {
                Ok(pack_rgba(
                    clamp_u8(red),
                    clamp_u8(green),
                    clamp_u8(blue),
                    clamp_u8(alpha.unwrap_or(255)),
                ))
            },
        )?,
    )?;
    pixel_color.set(
        "rgbaR",
        lua.create_function(|_, value: u32| Ok(value & 0xff))?,
    )?;
    pixel_color.set(
        "rgbaG",
        lua.create_function(|_, value: u32| Ok((value >> 8) & 0xff))?,
    )?;
    pixel_color.set(
        "rgbaB",
        lua.create_function(|_, value: u32| Ok((value >> 16) & 0xff))?,
    )?;
    pixel_color.set(
        "rgbaA",
        lua.create_function(|_, value: u32| Ok((value >> 24) & 0xff))?,
    )?;
    pixel_color.set(
        "graya",
        lua.create_function(|_, (gray, alpha): (i64, Option<i64>)| {
            Ok(pack_graya(clamp_u8(gray), clamp_u8(alpha.unwrap_or(255))))
        })?,
    )?;
    pixel_color.set(
        "grayaV",
        lua.create_function(|_, value: u32| Ok(value & 0xff))?,
    )?;
    pixel_color.set(
        "grayaA",
        lua.create_function(|_, value: u32| Ok((value >> 8) & 0xff))?,
    )?;
    pixel_color.set(
        "index",
        lua.create_function(|_, value: i64| Ok(value.max(0) as u32))?,
    )?;
    Ok(pixel_color)
}

fn clean_label(label: &str, fallback: &str) -> String {
    let label = label.trim();
    let label = if label.is_empty() { fallback } else { label };
    label.chars().take(128).collect()
}

fn value_text(value: &Value) -> String {
    match value {
        Value::Nil => "nil".into(),
        Value::Boolean(value) => value.to_string(),
        Value::Integer(value) => value.to_string(),
        Value::Number(value) => value.to_string(),
        Value::String(value) => value.to_string_lossy(),
        Value::Table(_) => "table".into(),
        Value::Function(_) => "function".into(),
        Value::Thread(_) => "thread".into(),
        Value::UserData(_) => "userdata".into(),
        Value::LightUserData(_) => "lightuserdata".into(),
        Value::Error(error) => error.to_string(),
        Value::Other(_) => "value".into(),
    }
}

fn push_output(output: &Rc<RefCell<Vec<String>>>, text: String) {
    let mut output = output.borrow_mut();
    let current_bytes = output.iter().map(String::len).sum::<usize>();
    if current_bytes >= MAX_OUTPUT_BYTES {
        return;
    }
    let remaining = MAX_OUTPUT_BYTES - current_bytes;
    output.push(text.chars().take(remaining).collect());
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rgba(red: u8, green: u8, blue: u8, alpha: u8) -> u32 {
        pack_rgba(red, green, blue, alpha)
    }

    fn context() -> LuaScriptContext {
        LuaScriptContext {
            document_id: "document-1".into(),
            document_name: "Test".into(),
            document_width: 4,
            document_height: 4,
            document_file_path: "C:/test.moonsprite".into(),
            color_mode: "rgba".into(),
            layer_id: "layer-1".into(),
            layer_name: "Layer 1".into(),
            layer_width: 2,
            layer_height: 2,
            layer_offset_x: 1,
            layer_offset_y: 1,
            layer_opacity: 255,
            layer_visible: true,
            layer_locked: false,
            layer_format: "rgba".into(),
            layer_group_id: None,
            layer_stack_index: 1,
            frame_number: 1,
            pixels: vec![rgba(10, 20, 30, 255); 4],
            active_layer_cels: Vec::new(),
            selection: Some(LuaScriptSelectionContext {
                x: 1,
                y: 1,
                width: 2,
                height: 2,
                mask: Some(vec![255, 0, 0, 255]),
            }),
            transparent_color: 0,
            foreground: rgba(255, 255, 255, 255),
            background: rgba(0, 0, 0, 255),
            mse_snapshot: serde_json::json!({
                "document": {
                    "id": "document-1",
                    "name": "Test",
                    "width": 4,
                    "height": 4,
                    "colorMode": "rgba",
                    "frame": 1,
                    "activeLayer": { "id": "layer-1", "name": "Layer 1", "width": 2, "height": 2, "x": 1, "y": 1 }
                },
                "layers": [{ "id": "layer-1", "name": "Layer 1", "width": 2, "height": 2, "x": 1, "y": 1, "styles": null }],
                "animation": { "frames": [{ "id": "frame-1", "number": 1, "duration": 100, "active": true }], "loops": [] },
                "palette": { "entries": [{ "id": 1, "name": "White", "color": { "r": 255, "g": 255, "b": 255, "a": 255 } }] },
                "tiles": { "sets": [{ "id": "tileset-1", "name": "Tiles", "tileWidth": 8, "tileHeight": 8, "tileIds": ["tile-1"] }] },
                "freeTiles": { "sources": [] },
                "brushes": [{ "id": "brush-1", "name": "Brush", "source": "project" }],
                "slices": [{ "id": "slice-1", "name": "Slice", "x": 0, "y": 0, "width": 2, "height": 2 }],
                "workspace": { "panels": [{ "id": "layers", "visible": true, "dock": "right" }] }
            }),
        }
    }

    #[test]
    fn runs_the_builtin_moon_phase_example_as_an_animation_document() {
        let mut session = LuaSession::new(context(), "moon-phase.lua").unwrap();
        let result = session
            .execute_source(include_str!("../../resources/scripts/moon-phase.lua"))
            .expect("the built-in moon phase script should execute");

        assert_eq!(result.created_documents.len(), 1);
        let document = &result.created_documents[0];
        assert_eq!(document.name, "Moon Phases");
        assert_eq!(document.width, 32);
        assert_eq!(document.height, 32);
        assert_eq!(document.layers.len(), 8);
        assert_eq!(
            document
                .layers
                .iter()
                .map(|layer| layer.frame_number)
                .collect::<Vec<_>>(),
            (1..=8).collect::<Vec<_>>()
        );
        assert!(document.layers.iter().any(|layer| layer
            .surface
            .pixels
            .iter()
            .any(|pixel| *pixel != 0)));
    }

    #[test]
    fn exposes_pixel_api_selection_and_transactions() {
        let mut session = LuaSession::new(context(), "paint.lua").unwrap();
        let result = session
            .execute_source(
                r#"
                    assert(app.activeSprite.width == 4)
                    assert(app.activeLayer.name == "Layer 1")
                    assert(app.activeSprite.selection:contains(Point(1, 1)))
                    assert(not app.activeSprite.selection:contains(Point(2, 1)))
                    app.transaction("Paint blue", function()
                        app.activeImage:drawPixel(1, 0, app.pixelColor.rgba(1, 2, 3, 255))
                    end)
                    print(app.activeImage:getPixel(1, 0))
                "#,
            )
            .expect("script should execute");

        assert_eq!(result.output, vec![rgba(1, 2, 3, 255).to_string()]);
        assert_eq!(result.batches.len(), 1);
        assert_eq!(result.batches[0].label, "Paint blue");
        assert_eq!(result.batches[0].changes[0].index, 1);
        assert_eq!(result.batches[0].changes[0].after, rgba(1, 2, 3, 255));
    }

    #[test]
    fn exposes_mse_namespace_capabilities_and_read_only_information() {
        let mut session = LuaSession::new(context(), "mse-info.lua").unwrap();
        session
            .execute_source(
                r#"
                    assert(type(mse) == "table")
                    assert(mse.apiVersion == "0.2.0")
                    assert(mse.status.namespace == "mse")
                    assert(mse.status.stage == "experimental")
                    assert(mse.capabilities.document.status == "stable")
                    assert(mse.capabilities.document.methods[1].name == "info")
                    assert(mse.capabilities.document.methods[1].implemented == true)
                    assert(mse.capabilities.tiles.status == "stable")
                    assert(mse.isSupported("document.info"))
                    assert(mse.isSupported("mse.document.info"))
                    assert(mse.isSupported("tiles.createLayer"))

                    local document = mse.document.info()
                    assert(document.id == "document-1")
                    assert(document.name == "Test")
                    assert(document.width == 4 and document.height == 4)
                    assert(document.colorMode == "rgba")
                    assert(document.activeLayer.id == "layer-1")
                    assert(document.activeLayer.width == 2)
                    assert(document.activeLayer.x == 1 and document.activeLayer.y == 1)

                    local selection = mse.selection.info()
                    assert(selection.exists and not selection.empty)
                    assert(selection.hasMask)
                    assert(selection.selectedPixels == 2)
                    assert(selection.bounds.x == 1 and selection.bounds.y == 1)
                    assert(selection.bounds.width == 2 and selection.bounds.height == 2)

                    assert(#mse.layers.list() == 1)
                    assert(mse.layers.get("layer-1").name == "Layer 1")
                    assert(mse.animation.frames()[1].duration == 100)
                    assert(mse.palette.get(1).name == "White")
                    assert(mse.tiles.getSet("tileset-1").tileIds[1] == "tile-1")
                    assert(mse.brushes.get("brush-1").name == "Brush")
                    assert(mse.slices.get("slice-1").width == 2)
                    assert(mse.workspace.getPanel("layers").visible)
                "#,
            )
            .expect("mse read-only API should execute");
    }

    #[test]
    fn queues_mse_operations_inside_the_current_transaction() {
        let mut session = LuaSession::new(context(), "mse-operations.lua").unwrap();
        let result = session
            .execute_source(
                r#"
                    app.transaction("MSE update", function()
                        assert(mse.layers.update("layer-1", { name = "Renamed", opacity = 128 }))
                        assert(mse.selection.set(Rectangle(1, 2, 3, 4)))
                        assert(mse.palette.create(Color { r = 4, g = 5, b = 6, a = 255 }))
                        assert(mse.ui.notify("done"))
                    end)
                "#,
            )
            .expect("implemented mse operations should queue");

        assert_eq!(result.batches.len(), 1);
        assert_eq!(result.batches[0].label, "MSE update");
        assert_eq!(result.batches[0].operations.len(), 4);
        assert_eq!(result.batches[0].operations[0].path, "layers.update");
        assert_eq!(result.batches[0].operations[1].arguments["width"], 3);
        assert_eq!(result.batches[0].operations[2].arguments["r"], 4);
        assert_eq!(result.batches[0].operations[3].arguments, "done");
    }

    #[test]
    fn keeps_dialog_callbacks_in_the_same_lua_vm_and_replaces_the_cel_surface() {
        let mut session = LuaSession::new(context(), "dialog.lua").unwrap();
        let initial = session
            .execute_source(
                r#"
                    local dlg = Dialog { title = "Options" }
                    dlg:slider { id = "amount", label = "Amount", min = 1, max = 8, value = 2 }
                    dlg:check { id = "enabled", text = "Enabled", selected = true }
                    dlg:button {
                        id = "apply",
                        text = "Apply",
                        onclick = function()
                            app.transaction(function()
                                local image = Image(app.activeSprite.width, app.activeSprite.height, app.activeImage.colorMode)
                                image:drawImage(app.activeCel.image, Point(app.activeCel.bounds.x, app.activeCel.bounds.y))
                                if dlg.data.enabled then
                                    image:drawPixel(dlg.data.amount, 0, app.pixelColor.rgba(255, 0, 0, 255))
                                end
                                app.activeCel.image = image
                                app.activeCel.position = Point(0, 0)
                            end)
                        end
                    }
                    dlg:show { wait = false }
                "#,
            )
            .expect("dialog script should start");

        assert_eq!(initial.dialogs.len(), 1);
        assert!(initial.batches.is_empty());
        let dialog = &initial.dialogs[0];
        let result = session
            .dispatch(LuaScriptDialogAction {
                dialog_id: dialog.id.clone(),
                control_id: Some("apply".into()),
                event: "click".into(),
                values: HashMap::from([
                    ("amount".into(), JsonValue::Number(3.into())),
                    ("enabled".into(), JsonValue::Bool(true)),
                ]),
            })
            .expect("button callback should execute");

        assert_eq!(result.batches.len(), 1);
        let surface = result.batches[0]
            .surface_change
            .as_ref()
            .expect("image replacement should return a surface change");
        assert_eq!((surface.before.width, surface.before.height), (2, 2));
        assert_eq!((surface.before.offset_x, surface.before.offset_y), (1, 1));
        assert_eq!((surface.after.width, surface.after.height), (4, 4));
        assert_eq!((surface.after.offset_x, surface.after.offset_y), (0, 0));
        assert_eq!(surface.after.pixels[3], rgba(255, 0, 0, 255));
    }

    #[test]
    fn rebases_modeless_dialog_callbacks_to_the_current_cel_surface() {
        let mut session = LuaSession::new(context(), "rebase.lua").unwrap();
        let initial = session
            .execute_source(
                r#"
                    local dlg = Dialog { title = "Rebase" }
                    dlg:button {
                        id = "apply",
                        text = "Apply",
                        onclick = function()
                            app.transaction(function()
                                app.activeImage:putPixel(0, 0, app.pixelColor.rgba(255, 0, 0, 255))
                            end)
                        end
                    }
                    dlg:show { wait = false }
                "#,
            )
            .expect("dialog script should start");
        let action = LuaScriptDialogAction {
            dialog_id: initial.dialogs[0].id.clone(),
            control_id: Some("apply".into()),
            event: "click".into(),
            values: HashMap::new(),
        };
        let first = session
            .dispatch(action.clone())
            .expect("first callback should execute");
        assert_eq!(first.batches[0].changes[0].before, rgba(10, 20, 30, 255));
        assert_eq!(first.batches[0].changes[0].after, rgba(255, 0, 0, 255));

        let mut current = context();
        current.pixels[0] = rgba(0, 0, 255, 255);
        session.rebase(current).expect("same target should rebase");
        let second = session
            .dispatch(action)
            .expect("callback after undo should execute");

        assert_eq!(second.batches[0].changes[0].before, rgba(0, 0, 255, 255));
        assert_eq!(second.batches[0].changes[0].after, rgba(255, 0, 0, 255));
    }

    #[test]
    fn supports_color_radio_and_new_layer_compatibility_api() {
        let mut session = LuaSession::new(context(), "box.lua").unwrap();
        let initial = session
            .execute_source(
                r#"
                    local c = app.fgColor
                    local shifted = Color { h = c.hsvHue, s = c.hsvSaturation + 0.2, v = c.hsvValue - 0.1, a = 255 }
                    assert(shifted.hsvSaturation >= c.hsvSaturation)
                    local dlg = Dialog("Box")
                    dlg:color { id = "stroke", label = "Stroke", color = Color { r = 2, g = 3, b = 4, a = 255 } }
                    dlg:radio { id = "three", label = "Corner", text = "3 px", selected = false }
                    dlg:radio { id = "two", text = "2 px", selected = true }
                    dlg:button {
                        id = "ok",
                        text = "Create",
                        onclick = function()
                            local sprite = app.activeSprite
                            local layer = sprite:newLayer()
                            layer.name = "Cube"
                            sprite:newCel(layer, 1)
                            app.transaction(function()
                                app.activeImage:putPixel(0, 0, dlg.data.stroke)
                            end)
                            app.command.Undo()
                            app.command.Redo()
                        end
                    }
                    dlg:show { wait = false }
                "#,
            )
            .expect("box compatibility dialog should start");

        assert!(initial.dialogs[0]
            .controls
            .iter()
            .any(|control| control.kind == "color"));
        assert_eq!(
            initial.dialogs[0]
                .controls
                .iter()
                .filter(|control| control.kind == "radio")
                .count(),
            2
        );
        let result = session
            .dispatch(LuaScriptDialogAction {
                dialog_id: initial.dialogs[0].id.clone(),
                control_id: Some("ok".into()),
                event: "click".into(),
                values: HashMap::from([
                    (
                        "stroke".into(),
                        ScriptColor {
                            red: 20,
                            green: 30,
                            blue: 40,
                            alpha: 255,
                        }
                        .serialized(),
                    ),
                    ("three".into(), JsonValue::Bool(false)),
                    ("two".into(), JsonValue::Bool(true)),
                ]),
            })
            .expect("box callback should create a layer");

        assert_eq!(result.created_layers.len(), 1);
        assert_eq!(result.created_layers[0].name, "Cube");
        assert_eq!(
            result.created_layers[0].surface.pixels[0],
            rgba(20, 30, 40, 255)
        );
    }

    #[test]
    fn resumes_blocking_dialogs_and_creates_sprites_with_use_tool() {
        let mut session = LuaSession::new(context(), "guidelines.lua").unwrap();
        let initial = session
            .execute_source(
                r#"
                    local dialog = Dialog("Guidelines")
                    dialog:color { id = "color", label = "Color", color = Color { r = 255, g = 0, b = 0 } }
                    dialog:button { id = "ok", text = "Create" }
                    dialog:show()
                    local data = dialog.data
                    if data.ok then
                        local sprite = Sprite(6, 4)
                        app.useTool {
                            tool = "line",
                            color = data.color,
                            points = { Point(0, 0), Point(5, 0) },
                            button = MouseButton.left,
                        }
                        app.useTool {
                            tool = "eraser",
                            points = { Point(2, 0), Point(2, 0) },
                            button = MouseButton.left,
                        }
                    end
                "#,
            )
            .expect("blocking dialog should yield");
        assert_eq!(initial.dialogs.len(), 1);
        let result = session
            .dispatch(LuaScriptDialogAction {
                dialog_id: initial.dialogs[0].id.clone(),
                control_id: Some("ok".into()),
                event: "click".into(),
                values: HashMap::from([(
                    "color".into(),
                    ScriptColor {
                        red: 255,
                        green: 0,
                        blue: 0,
                        alpha: 255,
                    }
                    .serialized(),
                )]),
            })
            .expect("button should resume the source script");

        assert!(result.dialogs.is_empty());
        assert_eq!(result.created_documents.len(), 1);
        let surface = &result.created_documents[0].layers[0].surface;
        assert_eq!((surface.width, surface.height), (6, 4));
        assert_eq!(surface.pixels[0], rgba(255, 0, 0, 255));
        assert_eq!(surface.pixels[2], 0);
        assert_eq!(surface.pixels[5], rgba(255, 0, 0, 255));
    }

    #[test]
    fn rolls_back_a_failed_transaction_caught_by_the_script() {
        let mut session = LuaSession::new(context(), "rollback.lua").unwrap();
        let result = session
            .execute_source(
                r#"
                    app.transaction("First", function()
                        app.activeImage:drawPixel(0, 1, app.pixelColor.rgba(0, 0, 255, 255))
                    end)
                    local ok = pcall(function()
                        app.transaction("Broken", function()
                            app.activeImage:drawPixel(0, 0, app.pixelColor.rgba(255, 0, 0, 255))
                            error("stop")
                        end)
                    end)
                    assert(not ok)
                    app.activeImage:drawPixel(1, 1, app.pixelColor.rgba(0, 255, 0, 255))
                "#,
            )
            .expect("script should recover from pcall");

        assert_eq!(result.batches.len(), 2);
        assert_eq!(result.batches[0].label, "First");
        assert_eq!(result.batches[0].changes[0].index, 2);
        assert_eq!(result.batches[1].label, "rollback.lua");
        assert_eq!(result.batches[1].changes[0].index, 3);
        assert_eq!(result.batches[1].changes[0].after, rgba(0, 255, 0, 255));
    }

    #[test]
    fn removes_file_process_and_debug_libraries() {
        let mut session = LuaSession::new(context(), "sandbox.lua").unwrap();
        session
            .execute_source(
                "assert(io == nil and os == nil and package == nil and debug == nil and dofile == nil and loadfile == nil and require == nil)",
            )
            .expect("sandbox globals should be unavailable");
    }

    #[test]
    fn interrupts_scripts_that_exceed_the_instruction_budget() {
        let mut session = LuaSession::new(context(), "loop.lua").unwrap();
        let error = session
            .execute_source("while true do end")
            .expect_err("loop should be interrupted");

        assert!(error.contains("execution limit"));
    }

    #[test]
    fn supports_ase_new_cel_image_and_position_arguments() {
        let mut session = LuaSession::new(context(), "new-cel.lua").unwrap();
        let result = session
            .execute_source(
                r#"
                    local image = Image(2, 2, ColorMode.RGB)
                    image:putPixel(0, 0, app.pixelColor.rgba(1, 2, 3, 255))
                    local layer = app.activeSprite:newLayer()
                    local cel = app.activeSprite:newCel(layer, 1, image, Point(-2, 3))
                    assert(cel.frameNumber == 1)
                    assert(cel.position.x == -2 and cel.position.y == 3)
                    assert(cel.image:getPixel(0, 0) == app.pixelColor.rgba(1, 2, 3, 255))
                "#,
            )
            .expect("Aseprite newCel arguments should execute");

        assert_eq!(result.created_layers.len(), 1);
        let surface = &result.created_layers[0].surface;
        assert_eq!((surface.offset_x, surface.offset_y), (-2, 3));
        assert_eq!(surface.pixels[0], rgba(1, 2, 3, 255));
    }

    #[test]
    fn supports_ase_layer_editability_and_continuity_fields() {
        let mut session = LuaSession::new(context(), "layer-fields.lua").unwrap();
        let result = session
            .execute_source(
                r#"
                    local layer = app.activeSprite:newLayer()
                    layer.isEditable = false
                    layer.isContinuous = true
                    layer.opacity = 127.5
                    assert(not layer.isEditable)
                    assert(layer.isContinuous)
                    app.activeSprite:newCel(layer, 1)
                "#,
            )
            .expect("Aseprite layer fields should execute");

        assert_eq!(result.created_layers.len(), 1);
        assert!(result.created_layers[0].locked);
        assert_eq!(result.created_layers[0].opacity, 127);
    }

    #[test]
    fn runs_modeless_shadow_script_with_layer_placement_and_palette_compatibility() {
        let mut session = LuaSession::new(context(), "shadow.lua").unwrap();
        let initial = session
            .execute_source(
                r#"
                    local dlg = Dialog("Shadow")
                    dlg:slider { id="squash", min=10, max=100, value=40 }
                    dlg:slider { id="skew", min=-200, max=200, value=100 }
                    dlg:color { id="shadowColor", color=Color { r=0, g=0, b=0, a=255 } }
                    dlg:button {
                        id="generate",
                        text="Generate",
                        onclick=function()
                            local sprite = app.activeSprite
                            local layer = app.activeLayer
                            local frame = app.activeFrame
                            assert(layer.isImage)
                            local cel = layer:cel(frame)
                            assert(cel ~= nil)
                            local srcImage = cel.image
                            local srcPos = cel.position
                            app.transaction(function()
                                local shadowImage = Image(sprite.spec)
                                shadowImage:clear()
                                local c = dlg.data.shadowColor
                                local drawColor = app.pixelColor.rgba(c.red, c.green, c.blue, c.alpha)
                                shadowImage:drawPixel(srcPos.x, srcPos.y, drawColor)
                                local shadowLayer = sprite:newLayer()
                                shadowLayer.name = layer.name .. " Shadow"
                                shadowLayer.parent = layer.parent
                                shadowLayer.stackIndex = layer.stackIndex
                                sprite:newCel(shadowLayer, frame, shadowImage, Point(0, 0))
                                app.activeLayer = layer
                                app.refresh()
                            end)
                        end
                    }
                    dlg:show { wait=false }
                "#,
            )
            .expect("shadow dialog should open");

        let result = session
            .dispatch(LuaScriptDialogAction {
                dialog_id: initial.dialogs[0].id.clone(),
                control_id: Some("generate".into()),
                event: "click".into(),
                values: HashMap::new(),
            })
            .expect("shadow callback should execute");

        assert_eq!(result.created_layers.len(), 1);
        assert_eq!(result.created_layers[0].name, "Layer 1 Shadow");
        assert_eq!(result.created_layers[0].stack_index, 1);
        assert_eq!(result.created_layers[0].parent_group_id, None);
        assert_eq!(result.active_layer_id.as_deref(), Some("layer-1"));
        assert_eq!(result.active_frame_number, Some(1));
        assert_ne!(result.created_layers[0].surface.pixels[5], 0);
    }

    #[test]
    fn reads_and_writes_non_active_frame_cels() {
        let mut source = context();
        source.mse_snapshot["animation"]["frames"] = serde_json::json!([
            { "id": "frame-1", "number": 1, "duration": 100, "active": true },
            { "id": "frame-2", "number": 2, "duration": 120, "active": false }
        ]);
        source.active_layer_cels = vec![
            super::super::LuaScriptCelContext {
                id: "cel-1".into(),
                frame_id: "frame-1".into(),
                frame_number: 1,
                surface: LuaScriptSurfaceSnapshot {
                    format: "rgba".into(),
                    width: 2,
                    height: 2,
                    offset_x: 1,
                    offset_y: 1,
                    pixels: source.pixels.clone(),
                },
            },
            super::super::LuaScriptCelContext {
                id: "cel-2".into(),
                frame_id: "frame-2".into(),
                frame_number: 2,
                surface: LuaScriptSurfaceSnapshot {
                    format: "rgba".into(),
                    width: 2,
                    height: 2,
                    offset_x: 3,
                    offset_y: 4,
                    pixels: vec![rgba(20, 30, 40, 255); 4],
                },
            },
        ];
        let changed = rgba(1, 2, 3, 255);
        let mut session = LuaSession::new(source, "multi-frame.lua").unwrap();
        let result = session
            .execute_source(&format!(
                r#"
                    local layer = app.activeLayer
                    assert(#layer.cels == 2)
                    local cel = layer:cel(app.activeSprite.frames[2])
                    assert(cel ~= nil and cel.id == "cel-2")
                    assert(cel.position.x == 3 and cel.position.y == 4)
                    app.transaction("Edit frame 2", function()
                        cel.image:putPixel(1, 0, {changed})
                        cel.position = Point(5, 6)
                    end)
                "#
            ))
            .expect("a non-active frame cel should be editable");

        assert_eq!(result.batches.len(), 1);
        assert!(result.batches[0].changes.is_empty());
        assert_eq!(result.batches[0].operations.len(), 1);
        let operation = &result.batches[0].operations[0];
        assert_eq!(operation.path, "animation.setCelSurface");
        assert_eq!(operation.arguments["layerId"], "layer-1");
        assert_eq!(operation.arguments["frameId"], "frame-2");
        assert_eq!(operation.arguments["celId"], "cel-2");
        assert_eq!(operation.arguments["before"]["offsetX"], 3);
        assert_eq!(operation.arguments["after"]["offsetX"], 5);
        assert_eq!(operation.arguments["after"]["offsetY"], 6);
        assert_eq!(operation.arguments["after"]["pixels"][1], changed);
    }

    #[test]
    fn exposes_common_frame_tag_layer_and_range_compatibility_objects() {
        let mut source = context();
        source.mse_snapshot["layers"] = serde_json::json!([
            { "id": "layer-1", "name": "Layer 1", "kind": "raster", "opacity": 255, "visible": true, "locked": false },
            { "id": "layer-2", "name": "Layer 2", "kind": "raster", "opacity": 255, "visible": true, "locked": false }
        ]);
        source.mse_snapshot["animation"] = serde_json::json!({
            "frames": [
                { "id": "frame-1", "number": 1, "duration": 100, "active": true },
                { "id": "frame-2", "number": 2, "duration": 200, "disabled": true, "active": false }
            ],
            "loops": [{
                "id": "loop-1", "name": "Walk", "startFrameId": "frame-1",
                "endFrameId": "frame-2", "direction": "forward", "repeatCount": 3
            }]
        });
        source.mse_snapshot["range"] = serde_json::json!({
            "layerIds": ["layer-1", "layer-2"],
            "frameIds": ["frame-1", "frame-2"],
            "cellKeys": []
        });
        let mut session = LuaSession::new(source, "animation.lua").unwrap();
        let result = session
            .execute_source(
                r#"
                    local sprite = app.activeSprite
                    assert(#sprite.layers == 2)
                    assert(#sprite.frames == 2)
                    assert(sprite.frames[2].frameNumber == 2)
                    assert(sprite.frames[2].isDisabled)
                    assert(app.activeFrame.frameNumber == 1)
                    assert(#sprite.tags == 1)
                    assert(sprite.tags[1].fromFrame.frameNumber == 1)
                    assert(sprite.tags[1].toFrame.frameNumber == 2)
                    assert(sprite.tags[1].repeats == 3)
                    assert(#app.range.layers == 2)
                    assert(#app.range.frames == 2)
                    sprite.frames[2].duration = 0.25
                    sprite.tags[1].name = "Walk 2"
                    app.activeFrame = sprite.frames[2]
                "#,
            )
            .expect("animation compatibility objects should execute");

        assert_eq!(result.active_frame_number, Some(2));
        assert_eq!(result.batches.len(), 1);
        assert_eq!(result.batches[0].operations.len(), 2);
        assert_eq!(
            result.batches[0].operations[0].path,
            "animation.setFrameDuration"
        );
        assert_eq!(result.batches[0].operations[1].path, "animation.updateLoop");
    }
}
