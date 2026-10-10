//! Bounded browser evidence, independent of the renderer's event loop.
#[cfg(windows)]
use crate::platform_diagnostics::dispatch_webview_diagnostic;
use crate::platform_diagnostics::WebviewDiagnosticAction;
use serde_json::{json, Value};
use std::{
    fs::{self, File, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{
        mpsc::{self, Receiver, SyncSender},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

const COMPLETE: &str = "Tracing.tracingComplete";
pub(crate) const MAX_TRACE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_CAPTURES: usize = 3;
const POST_TRIGGER: Duration = Duration::from_secs(5);
const COOLDOWN: Duration = Duration::from_secs(120);

pub(crate) trait Protocol {
    fn call(&self, method: &'static str, params: Value) -> Result<Value, String>;
    fn subscribe(&self) -> Result<(i64, Receiver<Result<String, String>>), String>;
    fn unsubscribe(&self, token: i64) -> Result<(), String>;
}
pub(crate) struct WebviewProtocol(pub tauri::WebviewWindow);
impl WebviewProtocol {
    fn dispatch(
        &self,
        action: WebviewDiagnosticAction,
        reply: Receiver<Result<String, String>>,
    ) -> Result<String, String> {
        #[cfg(not(windows))]
        {
            drop((action, reply));
            return Err("Native browser trace requires Windows WebView2".into());
        }
        #[cfg(windows)]
        {
            dispatch_webview_diagnostic(&self.0, action).map_err(|e| e.to_string())?;
            reply
                .recv_timeout(Duration::from_secs(15))
                .map_err(|e| format!("WebView protocol response timeout/disconnected: {e}"))?
        }
    }
}
impl Protocol for WebviewProtocol {
    fn call(&self, method: &'static str, params: Value) -> Result<Value, String> {
        let (tx, rx) = mpsc::channel();
        let text = self.dispatch(
            WebviewDiagnosticAction::Call {
                method,
                params: params.to_string(),
                reply: tx,
            },
            rx,
        )?;
        serde_json::from_str(&text).map_err(|e| format!("Invalid {method} response: {e}"))
    }
    fn subscribe(&self) -> Result<(i64, Receiver<Result<String, String>>), String> {
        let (events, rx) = mpsc::channel();
        let (reply, result) = mpsc::channel();
        let token = self
            .dispatch(
                WebviewDiagnosticAction::Subscribe {
                    event: COMPLETE,
                    events,
                    reply,
                },
                result,
            )?
            .parse::<i64>()
            .map_err(|e| e.to_string())?;
        Ok((token, rx))
    }
    fn unsubscribe(&self, token: i64) -> Result<(), String> {
        let (reply, rx) = mpsc::channel();
        self.dispatch(
            WebviewDiagnosticAction::Unsubscribe {
                event: COMPLETE,
                token,
                reply,
            },
            rx,
        )
        .map(|_| ())
    }
}

pub(crate) fn trace_config() -> Value {
    json!({ "transferMode": "ReturnAsStream", "streamFormat": "json", "streamCompression": "none",
        "traceConfig": { "recordMode": "recordContinuously", "traceBufferSizeInKb": 16384,
            "includedCategories": ["input", "latencyInfo"] } })
}
pub(crate) struct Recording {
    token: i64,
    complete: Receiver<Result<String, String>>,
    pub(crate) started_ms: u64,
}
pub(crate) fn now_ms() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|t| t.as_millis() as u64)
        .map_err(|e| e.to_string())
}
pub(crate) fn start(protocol: &impl Protocol) -> Result<Recording, String> {
    let started_ms = now_ms()?;
    let (token, complete) = protocol.subscribe()?;
    if let Err(error) = protocol.call("Tracing.start", trace_config()) {
        // Failed start never grants ownership: do not end another DevTools recording.
        let cleanup = protocol.unsubscribe(token);
        return Err(format!(
            "Tracing.start failed (not owned): {error}; unsubscribe: {cleanup:?}"
        ));
    }
    Ok(Recording {
        token,
        complete,
        started_ms,
    })
}
pub(crate) fn cleanup_late_start(window: tauri::WebviewWindow) {
    let app = window.app_handle().clone();
    let report = app.clone();
    let result = std::thread::Builder::new()
        .name("late-trace-cleanup".into())
        .spawn(move || {
            let protocol = WebviewProtocol(window);
            let cleanup = (|| {
                let started_ms = now_ms()?;
                let (token, complete) = protocol.subscribe()?;
                finish(
                    &protocol,
                    Recording {
                        token,
                        complete,
                        started_ms,
                    },
                    None,
                )
            })();
            update(
                &app,
                &app.state::<BrowserTraceState>().status,
                json!({"state":"late-start-cleanup", "error":cleanup.as_ref().err()}),
            );
        });
    if let Err(error) = result {
        update(
            &report,
            &report.state::<BrowserTraceState>().status,
            json!({"state":"late-start-cleanup-failed", "error":error.to_string()}),
        );
    }
}

// IO is streamed to disk; never retain a trace-sized String/Value in the host.
pub(crate) fn drain_stream(
    protocol: &impl Protocol,
    handle: &str,
    mut output: Option<&mut File>,
) -> Result<u64, String> {
    drain_stream_with_limit(protocol, handle, output.as_deref_mut(), MAX_TRACE_BYTES)
}
pub(crate) fn drain_stream_with_limit(
    protocol: &impl Protocol,
    handle: &str,
    mut output: Option<&mut File>,
    limit: u64,
) -> Result<u64, String> {
    let started = Instant::now();
    let mut bytes = 0u64;
    loop {
        if started.elapsed() > Duration::from_secs(60) {
            return Err("Trace export exceeded 60 seconds".into());
        }
        let chunk = protocol.call("IO.read", json!({"handle": handle, "size": 256 * 1024}))?;
        if chunk["base64Encoded"].as_bool() == Some(true) {
            return Err("Unexpected binary JSON trace chunk".into());
        }
        let data = chunk["data"].as_str().ok_or("IO.read missing data")?;
        bytes = bytes.saturating_add(data.len() as u64);
        if bytes > limit {
            return Err(format!(
                "Trace export exceeded {limit} bytes; partial file retained"
            ));
        }
        if let Some(file) = output.as_deref_mut() {
            file.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        }
        if chunk["eof"].as_bool() == Some(true) {
            return Ok(bytes);
        }
        if data.is_empty() {
            return Err("IO.read made no progress".into());
        }
    }
}
pub(crate) fn finish(
    protocol: &impl Protocol,
    recording: Recording,
    output: Option<&mut File>,
) -> Result<Value, String> {
    let result = (|| {
        // DevTools may have already stopped our recording. Never end a later one.
        let event = match recording.complete.try_recv() {
            Ok(event) => event?,
            Err(mpsc::TryRecvError::Disconnected) => {
                return Err("Trace event channel disconnected".into())
            }
            Err(mpsc::TryRecvError::Empty) => {
                protocol.call("Tracing.end", json!({}))?;
                recording
                    .complete
                    .recv_timeout(Duration::from_secs(30))
                    .map_err(|e| format!("No tracingComplete: {e}"))??
            }
        };
        let event: Value = serde_json::from_str(&event).map_err(|e| e.to_string())?;
        let handle = event["stream"]
            .as_str()
            .ok_or("tracingComplete missing stream")?;
        let drained = if output.is_some() {
            drain_stream(protocol, handle, output)
        } else {
            Ok(0)
        };
        let closed = protocol.call("IO.close", json!({ "handle": handle }));
        let bytes = drained?;
        closed?;
        Ok(
            json!({ "bytes": bytes, "dataLossOccurred": event["dataLossOccurred"], "endedAtUnixMs": now_ms()? }),
        )
    })();
    let cleanup = protocol.unsubscribe(recording.token);
    match (result, cleanup) {
        (Ok(value), Ok(())) => Ok(value),
        (Err(e), _) => Err(e),
        (Ok(_), Err(e)) => Err(format!("Trace subscription cleanup failed: {e}")),
    }
}

enum Command {
    Enable(bool),
    Shutdown(mpsc::Sender<Result<(), String>>),
    Capture {
        reason: String,
        context: Value,
        reply: Option<mpsc::Sender<Result<Value, String>>>,
    },
}
#[derive(Default)]
pub(crate) struct BrowserTraceState {
    control: Mutex<Option<SyncSender<Command>>>,
    status: Arc<Mutex<Value>>,
}
fn update(app: &AppHandle, status: &Arc<Mutex<Value>>, value: Value) {
    if let Ok(mut state) = status.lock() {
        *state = value.clone();
    }
    let event = json!({"version": 1, "kind": "native-browser-trace", "name": "lag.browser-trace", "detail": value});
    if let Err(error) = crate::platform_diagnostics::append_events_to_file(
        app,
        &app.state::<crate::platform_diagnostics::DiagnosticState>(),
        vec![event],
    ) {
        eprintln!("Trace status write failed: {error}");
    }
}
pub(crate) fn set_enabled(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<BrowserTraceState>();
    let mut control = state
        .control
        .lock()
        .map_err(|_| "Browser trace state unavailable")?;
    if control.is_none() && enabled {
        let window = app
            .get_webview_window("main")
            .ok_or("Main WebView unavailable")?;
        let (tx, rx) = mpsc::sync_channel(8);
        let app = app.clone();
        let status = state.status.clone();
        std::thread::Builder::new()
            .name("browser-trace".into())
            .spawn(move || run(app, WebviewProtocol(window), rx, status))
            .map_err(|e| e.to_string())?;
        *control = Some(tx);
    }
    if let Some(control) = control.as_ref() {
        control
            .try_send(Command::Enable(enabled))
            .map_err(|e| format!("Browser trace control busy: {e}"))?;
    }
    Ok(())
}
pub(crate) fn trigger(app: &AppHandle, reason: &str, context: Value) -> Result<(), String> {
    send_capture(app, reason, context, None)
}
fn send_capture(
    app: &AppHandle,
    reason: &str,
    context: Value,
    reply: Option<mpsc::Sender<Result<Value, String>>>,
) -> Result<(), String> {
    if reason.len() > 128 || context.to_string().len() > 16 * 1024 {
        return Err("Trace trigger metadata too large".into());
    }
    let state = app.state::<BrowserTraceState>();
    let control = state
        .control
        .lock()
        .map_err(|_| "Browser trace state unavailable")?;
    control
        .as_ref()
        .ok_or("Browser trace is not enabled")?
        .try_send(Command::Capture {
            reason: reason.into(),
            context,
            reply,
        })
        .map_err(|e| format!("Browser trace trigger busy: {e}"))
}
#[tauri::command]
pub async fn capture_browser_trace(
    app: AppHandle,
    reason: String,
    context: Value,
) -> Result<Value, String> {
    let (tx, rx) = mpsc::channel();
    send_capture(&app, &reason, context, Some(tx))?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(120))
            .map_err(|e| format!("Trace capture response: {e}"))?
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn browser_trace_status(app: AppHandle) -> Result<Value, String> {
    app.state::<BrowserTraceState>()
        .status
        .lock()
        .map(|s| s.clone())
        .map_err(|_| "Browser trace status unavailable".into())
}
pub(crate) async fn shutdown(app: AppHandle) -> Result<(), String> {
    let (tx, rx) = mpsc::channel();
    let control = app
        .state::<BrowserTraceState>()
        .control
        .lock()
        .map_err(|_| "Trace control unavailable")?
        .take();
    let Some(control) = control else {
        return Ok(());
    };
    control
        .try_send(Command::Shutdown(tx))
        .map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        rx.recv_timeout(Duration::from_secs(3))
            .map_err(|e| format!("Trace exit cleanup: {e}"))?
    })
    .await
    .map_err(|e| e.to_string())?
}
fn process_inventory() -> Value {
    use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .without_tasks()
            .with_exe(UpdateKind::OnlyIfNotSet)
            .with_cmd(UpdateKind::OnlyIfNotSet),
    );
    let mut included = std::collections::BTreeSet::from([Pid::from_u32(std::process::id())]);
    for _ in 0..8 {
        let children: Vec<_> = system
            .processes()
            .iter()
            .filter(|(_, p)| p.parent().is_some_and(|p| included.contains(&p)))
            .map(|(pid, _)| *pid)
            .take(32)
            .collect();
        included.extend(children);
        if included.len() >= 32 {
            break;
        }
    }
    json!(included.iter().take(32).filter_map(|pid| {
        let p = system.process(*pid)?;
        let runtime = p.exe().and_then(|exe| exe.parent()).and_then(|dir| dir.file_name()).and_then(|v| v.to_str()).filter(|v| v.chars().all(|c| c.is_ascii_digit() || c == '.'));
        let role = p.cmd().iter().filter_map(|s| s.to_str()).find_map(|s| s.strip_prefix("--type=")).unwrap_or("host-or-browser");
        Some(json!({"pid":pid.as_u32(),"parentPid":p.parent().map(|p|p.as_u32()),"role":role,"runtimeVersion":runtime}))
    }).collect::<Vec<_>>())
}

pub(crate) fn export(
    app: &AppHandle,
    protocol: &impl Protocol,
    recording: Recording,
    reason: &str,
    context: Value,
    index: usize,
) -> Result<Value, String> {
    let setup = (|| {
        Ok::<_, String>((
            crate::platform_diagnostics::diagnostic_dir(app)?,
            format!("browser-trace-{}-{}-{index}", std::process::id(), now_ms()?),
        ))
    })();
    let (dir, stem) = match setup {
        Ok(paths) => paths,
        Err(e) => {
            let cleanup = finish(protocol, recording, None);
            return Err(format!(
                "Trace export setup failed: {e}; cleanup: {cleanup:?}"
            ));
        }
    };
    let partial: PathBuf = dir.join(format!("{stem}.json.partial"));
    let path = dir.join(format!("{stem}.json"));
    let started_ms = recording.started_ms;
    let browser_version = protocol.call("Browser.getVersion", json!({}));
    // Always end our own recording even if disk creation fails.
    let opened = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&partial);
    let result = match opened {
        Ok(mut file) => finish(protocol, recording, Some(&mut file)).and_then(|value| {
            file.flush().map_err(|e| e.to_string())?;
            fs::rename(&partial, &path).map_err(|e| e.to_string())?;
            Ok(value)
        }),
        Err(error) => {
            let cleanup = finish(protocol, recording, None);
            Err(format!(
                "Trace file creation failed: {error}; cleanup: {cleanup:?}"
            ))
        }
    };
    let manifest = json!({"version": 1, "hostPid": std::process::id(), "appVersion": env!("CARGO_PKG_VERSION"), "startedAtUnixMs": started_ms,
        "incidentId": stem, "reason": reason, "context": context, "trace": path, "partial": partial,
        "browserVersion": browser_version.as_ref().ok(), "browserVersionError": browser_version.as_ref().err(),
        "processes": process_inventory(),
        "config": trace_config(), "maxExportBytes": MAX_TRACE_BYTES, "maxSessionCaptures": MAX_CAPTURES,
        "result": result.as_ref().ok(), "error": result.as_ref().err(), "privateTrackerCountsAvailable": false});
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(dir.join(format!("{stem}.manifest.json")))
        .map_err(|e| format!("Trace manifest creation failed: {e}; capture: {result:?}"))?;
    serde_json::to_writer_pretty(&mut file, &manifest).map_err(|e| e.to_string())?;
    file.flush().map_err(|e| e.to_string())?;
    result.map(|_| manifest)
}

fn run(
    app: AppHandle,
    protocol: WebviewProtocol,
    commands: Receiver<Command>,
    status: Arc<Mutex<Value>>,
) {
    let mut recording = None;
    let mut captures = 0usize;
    let mut last_capture: Option<Instant> = None;
    while let Ok(command) = commands.recv() {
        match command {
            Command::Shutdown(reply) => {
                let result = recording
                    .take()
                    .map(|r| finish(&protocol, r, None).map(|_| ()))
                    .unwrap_or(Ok(()));
                if reply.send(result).is_err() {
                    eprintln!("Trace exit acknowledgement expired");
                }
                return;
            }
            Command::Enable(enabled) => {
                if !enabled {
                    let result = recording.take().map(|r| finish(&protocol, r, None));
                    update(
                        &app,
                        &status,
                        json!({"state": "off", "cleanupError": result.and_then(Result::err)}),
                    );
                } else if recording.is_none() && captures < MAX_CAPTURES {
                    match start(&protocol) {
                        Ok(r) => {
                            recording = Some(r);
                            update(
                                &app,
                                &status,
                                json!({"state": "recording", "captures": captures, "bufferKiB": 16384}),
                            );
                        }
                        Err(e) => update(
                            &app,
                            &status,
                            json!({"state": "unavailable", "error": e, "retry": "explicit-re-enable"}),
                        ),
                    }
                } else if captures >= MAX_CAPTURES {
                    update(
                        &app,
                        &status,
                        json!({"state": "budget-exhausted", "captures": captures, "maxSessionCaptures": MAX_CAPTURES}),
                    );
                }
            }
            Command::Capture {
                reason,
                context,
                reply,
            } => {
                let result = if recording.is_none() {
                    Err("Browser trace not recording".into())
                } else if last_capture.is_some_and(|t| t.elapsed() < COOLDOWN) {
                    Err("Browser trace cooldown (120 seconds)".into())
                } else {
                    update(
                        &app,
                        &status,
                        json!({"state": "post-trigger", "reason": reason}),
                    );
                    // Native clock continues to run even when renderer input is queued.
                    let until = Instant::now() + POST_TRIGGER;
                    let mut shutdown_reply = None;
                    let cancelled = loop {
                        match commands.recv_timeout(until.saturating_duration_since(Instant::now()))
                        {
                            Ok(Command::Enable(false))
                            | Err(mpsc::RecvTimeoutError::Disconnected) => break true,
                            Ok(Command::Shutdown(reply)) => {
                                shutdown_reply = Some(reply);
                                break true;
                            }
                            Ok(Command::Capture {
                                reply: Some(reply), ..
                            }) => {
                                if reply
                                    .send(Err("Capture already in progress".into()))
                                    .is_err()
                                {
                                    eprintln!("Duplicate trace request expired");
                                }
                            }
                            Err(mpsc::RecvTimeoutError::Timeout) => break false,
                            _ => {}
                        }
                    };
                    let active = recording.take();
                    if let Some(active) = active {
                        if cancelled {
                            let cleanup = finish(&protocol, active, None);
                            if let Some(exit_reply) = shutdown_reply {
                                if exit_reply.send(cleanup.clone().map(|_| ())).is_err() {
                                    eprintln!("Trace exit acknowledgement expired");
                                }
                                if let Some(reply) = reply {
                                    if reply.send(Err("Host exiting".into())).is_err() {
                                        eprintln!("Capture caller exited");
                                    }
                                }
                                return;
                            }
                            cleanup.and(Err("Capture cancelled because lag mode stopped".into()))
                        } else {
                            captures += 1;
                            last_capture = Some(Instant::now());
                            export(&app, &protocol, active, &reason, context, captures)
                        }
                    } else {
                        Err("Trace ownership unavailable".into())
                    }
                };
                if let Some(reply) = reply {
                    if reply.send(result.clone()).is_err() {
                        eprintln!("Trace capture caller expired");
                    }
                }
                update(
                    &app,
                    &status,
                    json!({"state": if result.is_ok() { "saved" } else { "capture-rejected-or-failed" }, "capture": result.as_ref().ok(), "error": result.as_ref().err(), "captures": captures}),
                );
                if result.is_ok() && captures < MAX_CAPTURES {
                    match start(&protocol) {
                        Ok(r) => {
                            recording = Some(r);
                        }
                        Err(e) => {
                            update(&app, &status, json!({"state": "unavailable", "error": e}))
                        }
                    }
                }
            }
        }
    }
    if let Some(active) = recording {
        if let Err(e) = finish(&protocol, active, None) {
            update(
                &app,
                &status,
                json!({"state": "cleanup-failed", "error": e}),
            );
        }
    }
}
