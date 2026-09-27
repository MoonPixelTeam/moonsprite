use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, Sender},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System, UpdateKind};
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub(crate) struct LagDiagnosticState {
    cached: Mutex<Option<(Instant, Value)>>,
    monitor: Mutex<Option<Monitor>>,
    heartbeat: Mutex<Option<(Instant, bool)>>,
}

struct Monitor {
    stop: Sender<()>,
    active: Arc<AtomicBool>,
}
impl Drop for Monitor {
    fn drop(&mut self) {
        self.active.store(false, Ordering::Release);
        // A disconnected receiver already means the worker has stopped.
        if self.stop.send(()).is_err() {
            self.active.store(false, Ordering::Release);
        }
    }
}

// This worker owns its clock and writes through the native bounded log writer:
// a stalled renderer does not prevent collecting process evidence.
#[tauri::command]
pub fn set_lag_capture(app: AppHandle, enabled: bool) -> Result<(), String> {
    let state = app.state::<LagDiagnosticState>();
    let mut monitor = state
        .monitor
        .lock()
        .map_err(|_| "卡顿采集控制状态不可用".to_string())?;
    if !enabled {
        *monitor = None;
        return Ok(());
    }
    if monitor
        .as_ref()
        .is_some_and(|m| m.active.load(Ordering::Acquire))
    {
        return Ok(());
    }
    *state
        .heartbeat
        .lock()
        .map_err(|_| "界面心跳状态不可用".to_string())? = Some((Instant::now(), true));
    let (stop, receiver) = mpsc::channel();
    let active = Arc::new(AtomicBool::new(true));
    let worker_active = active.clone();
    let worker_app = app.clone();
    std::thread::Builder::new().name("lag-evidence".into()).spawn(move || {
        let result = (|| -> Result<(), String> {
            loop {
                if !worker_active.load(Ordering::Acquire) { break; }
                let state = worker_app.state::<LagDiagnosticState>();
                let sample = collect_resources(&state)?;
                let heartbeat = state.heartbeat.lock().map_err(|_| "界面心跳状态不可用".to_string())?;
                let age = heartbeat.as_ref().map(|(at, _)| at.elapsed().as_millis() as u64);
                let visible = heartbeat.as_ref().map(|(_, visible)| *visible);
                drop(heartbeat);
                let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64;
                let event = json!({ "version": 1, "kind": "native-lag-sample", "name": "lag.native-sample", "timestampMs": timestamp,
                    "detail": { "rendererHeartbeatAgeMs": age, "rendererVisibleAtLastHeartbeat": visible,
                        "rendererHeartbeatOverdue": visible == Some(true) && age.is_some_and(|age| age >= 30_000),
                        "sample": sample } });
                if !worker_active.load(Ordering::Acquire) { break; }
                crate::platform_diagnostics::append_events_to_file(&worker_app, &worker_app.state::<crate::platform_diagnostics::DiagnosticState>(), vec![event])?;
                match receiver.recv_timeout(Duration::from_secs(10)) {
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    _ => break,
                }
            }
            Ok(())
        })();
        worker_active.store(false, Ordering::Release);
        if let Err(error) = result {
            eprintln!("Native lag capture stopped: {error}");
            let event = json!({ "version": 1, "kind": "error", "name": "lag.native-error", "detail": { "message": error } });
            if let Err(write_error) = crate::platform_diagnostics::append_events_to_file(&worker_app, &worker_app.state::<crate::platform_diagnostics::DiagnosticState>(), vec![event]) {
                eprintln!("Native lag error write failed: {write_error}");
            }
        }
    }).map_err(|error| format!("无法启动卡顿采集：{error}"))?;
    *monitor = Some(Monitor { stop, active });
    Ok(())
}

#[tauri::command]
pub async fn sample_lag_resources(app: AppHandle, renderer_visible: bool) -> Result<Value, String> {
    // Heartbeat is updated before resource locking; slow sampling cannot be
    // mistaken for a renderer which stopped sending heartbeats.
    *app.state::<LagDiagnosticState>()
        .heartbeat
        .lock()
        .map_err(|_| "界面心跳状态不可用".to_string())? = Some((Instant::now(), renderer_visible));
    tauri::async_runtime::spawn_blocking(move || {
        collect_resources(&app.state::<LagDiagnosticState>())
    })
    .await
    .map_err(|error| format!("卡顿资源采集任务失败：{error}"))?
}

fn collect_resources(state: &LagDiagnosticState) -> Result<Value, String> {
    let mut cached = state
        .cached
        .lock()
        .map_err(|_| "卡顿采集状态不可用".to_string())?;
    if let Some((time, value)) = cached.as_ref() {
        if time.elapsed().as_secs() < 8 {
            let mut value = value.clone();
            value["summary"]["nativeSampleAgeMs"] = json!(time.elapsed().as_millis() as u64);
            return Ok(value);
        }
    }
    let started = Instant::now();
    let mut system = System::new();
    system.refresh_memory();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().without_tasks(),
    );
    let root = Pid::from_u32(std::process::id());
    let mut included = BTreeSet::from([root]);
    // Bound both traversal and retained process output, even with extensions.
    for _ in 0..8 {
        let children: Vec<_> = system
            .processes()
            .iter()
            .filter(|(_, p)| p.parent().is_some_and(|parent| included.contains(&parent)))
            .map(|(pid, _)| *pid)
            .filter(|pid| !included.contains(pid))
            .take(32)
            .collect();
        if children.is_empty() {
            break;
        }
        included.extend(children);
        if included.len() >= 32 {
            break;
        }
    }
    let pids: Vec<_> = included.into_iter().take(32).collect();
    system.refresh_processes_specifics(
        ProcessesToUpdate::Some(&pids),
        true,
        ProcessRefreshKind::nothing()
            .without_tasks()
            .with_memory()
            .with_cpu()
            .with_disk_usage()
            .with_cmd(UpdateKind::OnlyIfNotSet)
            .with_exe(UpdateKind::OnlyIfNotSet),
    );
    let mut resident = 0u64;
    let processes: Vec<_> = pids.iter().filter_map(|pid| {
            let process = system.process(*pid)?;
            resident = resident.saturating_add(process.memory());
            let role = if *pid == root { "host" } else {
                let kind = process.cmd().iter().filter_map(|s| s.to_str()).find_map(|s| s.strip_prefix("--type="));
                match kind { Some("renderer") => "renderer", Some("gpu-process") => "gpu", Some("utility") => "utility", _ => "child-or-browser" }
            };
            let version = process.exe().and_then(|p| p.parent()).and_then(|p| p.file_name())
                .and_then(|s| s.to_str()).filter(|s| !s.is_empty() && s.len() <= 40 && s.chars().all(|c| c.is_ascii_digit() || c == '.'));
            Some(json!({ "pid": pid.as_u32(), "parentPid": process.parent().map(|p| p.as_u32()),
                "role": role, "runtimeVersion": version, "startTimeUnixSeconds": process.start_time(),
                "residentBytes": process.memory(), "virtualBytes": process.virtual_memory(),
                "cpuTimeMs": process.accumulated_cpu_time(),
                "ioReadBytes": process.disk_usage().total_read_bytes, "ioWrittenBytes": process.disk_usage().total_written_bytes }))
        }).collect();
    let value = json!({ "summary": {
            "systemTotalBytes": system.total_memory(), "systemAvailableBytes": system.available_memory(),
            "systemSwapTotalBytes": system.total_swap(), "systemSwapUsedBytes": system.used_swap(),
            "processCount": processes.len(), "processLimit": 32, "processLimitReached": pids.len() == 32,
            "treeResidentBytes": resident, "collectionMs": started.elapsed().as_secs_f64() * 1000.0,
            "nativeSampleAgeMs": 0, "sampledAtUnixMs": SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?.as_millis() as u64, "cpuMeasurement": "cumulative-process-ms-use-deltas",
            "commitLimitAvailable": false, "gpuMemoryCounters": false
        }, "processes": processes });
    *cached = Some((Instant::now(), value.clone()));
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn monitor_drop_stops_without_waiting_for_sampling() -> Result<(), Box<dyn std::error::Error>> {
        let (stop, receiver) = mpsc::channel();
        let active = Arc::new(AtomicBool::new(true));
        let monitor = Monitor {
            stop,
            active: active.clone(),
        };
        drop(monitor);
        assert!(!active.load(Ordering::Acquire));
        receiver.recv_timeout(Duration::from_millis(100))?;
        Ok(())
    }
    #[test]
    fn real_resource_sample_is_bounded_and_cached() -> Result<(), String> {
        let state = LagDiagnosticState::default();
        let first = collect_resources(&state)?;
        let second = collect_resources(&state)?;
        let processes = first["processes"].as_array().ok_or("missing processes")?;
        assert!(processes.len() <= 32);
        assert!(processes.iter().any(
            |p| p["pid"].as_u64() == Some(u64::from(std::process::id())) && p["role"] == "host"
        ));
        assert_eq!(
            first["summary"]["sampledAtUnixMs"],
            second["summary"]["sampledAtUnixMs"]
        );
        assert_eq!(first["processes"], second["processes"]);
        assert!(first["summary"]["systemTotalBytes"]
            .as_u64()
            .is_some_and(|n| n > 0));
        Ok(())
    }
}
