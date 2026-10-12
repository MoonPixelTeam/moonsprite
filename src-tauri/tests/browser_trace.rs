#[allow(dead_code)]
#[path = "../src/platform_browser_trace.rs"]
mod platform_browser_trace;
#[allow(dead_code)]
#[path = "../src/platform_diagnostics.rs"]
mod platform_diagnostics;

use platform_browser_trace::{capture_kind, CaptureBudget, CaptureKind};
use platform_browser_trace::{drain_stream_with_limit, finish, start, trace_config, Protocol};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use std::{
    collections::VecDeque,
    sync::{
        mpsc::{self, Receiver, Sender},
        Mutex,
    },
};
struct Fake {
    calls: Mutex<Vec<&'static str>>,
    chunks: Mutex<VecDeque<Result<Value, String>>>,
    event: Mutex<Option<Sender<Result<String, String>>>>,
    conflict: bool,
}
impl Fake {
    fn new(chunks: Vec<Result<Value, String>>) -> Self {
        Self {
            calls: Mutex::new(vec![]),
            chunks: Mutex::new(chunks.into()),
            event: Mutex::new(None),
            conflict: false,
        }
    }
}
impl Protocol for Fake {
    fn call(&self, method: &'static str, _: Value) -> Result<Value, String> {
        self.calls.lock().unwrap().push(method);
        match method {
            "Tracing.start" if self.conflict => Err("Tracing already started".into()),
            "Tracing.end" => {
                self.event
                    .lock()
                    .unwrap()
                    .as_ref()
                    .unwrap()
                    .send(Ok(
                        json!({"stream":"owned-stream", "dataLossOccurred":false}).to_string(),
                    ))
                    .unwrap();
                Ok(json!({}))
            }
            "IO.read" => self.chunks.lock().unwrap().pop_front().unwrap(),
            _ => Ok(json!({})),
        }
    }
    fn subscribe(&self) -> Result<(i64, Receiver<Result<String, String>>), String> {
        self.calls.lock().unwrap().push("subscribe");
        let (tx, rx) = mpsc::channel();
        *self.event.lock().unwrap() = Some(tx);
        Ok((42, rx))
    }
    fn unsubscribe(&self, token: i64) -> Result<(), String> {
        assert_eq!(token, 42);
        self.calls.lock().unwrap().push("unsubscribe");
        Ok(())
    }
}
#[test]
fn does_not_end_or_take_over_external_recording() {
    let mut p = Fake::new(vec![]);
    p.conflict = true;
    assert!(start(&p).is_err());
    assert_eq!(
        *p.calls.lock().unwrap(),
        ["subscribe", "Tracing.start", "unsubscribe"]
    );
}
#[test]
fn streams_real_recorder_output_and_closes_every_owned_resource() {
    let p = Fake::new(vec![
        Ok(json!({"data":"{\"traceEvents\":[", "eof":false})),
        Ok(json!({"data":"]}", "eof":true})),
    ]);
    let r = start(&p).unwrap();
    let path =
        std::env::temp_dir().join(format!("moonsprite-trace-test-{}.json", std::process::id()));
    let mut file = std::fs::File::create(&path).unwrap();
    let result = finish(&p, r, Some(&mut file)).unwrap();
    drop(file);
    let parsed: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(parsed, json!({"traceEvents":[]}));
    assert_eq!(result["bytes"], 18);
    assert_eq!(
        *p.calls.lock().unwrap(),
        [
            "subscribe",
            "Tracing.start",
            "Tracing.end",
            "IO.read",
            "IO.read",
            "IO.close",
            "unsubscribe"
        ]
    );
    std::fs::remove_file(path).unwrap();
}
#[test]
fn read_failure_still_closes_stream_and_subscription() {
    let p = Fake::new(vec![Err("disk/protocol failure".into())]);
    let r = start(&p).unwrap();
    let path = std::env::temp_dir().join(format!(
        "moonsprite-trace-error-test-{}.json",
        std::process::id()
    ));
    let mut file = std::fs::File::create(&path).unwrap();
    assert!(finish(&p, r, Some(&mut file)).is_err());
    assert!(p
        .calls
        .lock()
        .unwrap()
        .ends_with(&["IO.close", "unsubscribe"]));
    drop(file);
    std::fs::remove_file(path).unwrap();
}
#[test]
fn byte_limit_and_no_progress_are_errors_in_production_streamer() {
    let p = Fake::new(vec![Ok(json!({"data":"123456", "eof":false}))]);
    assert!(drain_stream_with_limit(&p, "test", None, 5)
        .unwrap_err()
        .contains("exceeded"));
    let p = Fake::new(vec![Ok(json!({"data":"", "eof":false}))]);
    assert!(drain_stream_with_limit(&p, "test", None, 5)
        .unwrap_err()
        .contains("no progress"));
}
#[test]
fn externally_ended_owned_trace_does_not_end_a_new_trace() {
    let p = Fake::new(vec![]);
    let r = start(&p).unwrap();
    p.event
        .lock()
        .unwrap()
        .as_ref()
        .unwrap()
        .send(Ok(json!({"stream":"old"}).to_string()))
        .unwrap();
    finish(&p, r, None).unwrap();
    assert!(!p.calls.lock().unwrap().contains(&"Tracing.end"));
    assert!(p
        .calls
        .lock()
        .unwrap()
        .ends_with(&["IO.close", "unsubscribe"]));
}
#[test]
fn circular_recording_excludes_pixels_and_high_frequency_profiler() {
    let config = trace_config();
    assert_eq!(config["traceConfig"]["traceBufferSizeInKb"], 16384);
    assert_eq!(config["traceConfig"]["recordMode"], "recordContinuously");
    let categories = config["traceConfig"]["includedCategories"].to_string();
    assert!(!categories.contains("screenshot"));
    assert!(!categories.contains("cpu_profiler"));
    assert!(!categories.contains("benchmark"));
    assert!(!config["traceConfig"]["includedCategories"]
        .as_array()
        .unwrap()
        .contains(&json!("devtools.timeline")));
}

#[test]
fn cpu_bursts_cannot_exhaust_incident_and_manual_evidence() {
    let mut budget = CaptureBudget::default();
    let start = Instant::now();
    budget.check(CaptureKind::Cpu, start).unwrap();
    budget.consume(CaptureKind::Cpu, start);
    // Reproduce the historical sequence: three CPU bursts, then a real lag.
    for seconds in [360, 480] {
        assert!(budget
            .check(CaptureKind::Cpu, start + Duration::from_secs(seconds))
            .is_err());
    }
    let incident = start + Duration::from_secs(960);
    budget.check(CaptureKind::Incident, incident).unwrap();
    budget.consume(CaptureKind::Incident, incident);
    assert!(budget
        .check(CaptureKind::Incident, incident + Duration::from_secs(120))
        .is_err());
    budget.check(CaptureKind::Manual, incident).unwrap();
    budget.consume(CaptureKind::Manual, incident);
    assert_eq!(budget.total(), 3);
    for kind in [CaptureKind::Cpu, CaptureKind::Incident, CaptureKind::Manual] {
        assert!(budget
            .check(kind, incident + Duration::from_secs(120))
            .is_err());
    }
}

#[test]
fn incident_and_manual_save_do_not_inherit_cpu_cooldown() {
    let mut budget = CaptureBudget::default();
    let now = Instant::now();
    budget.consume(CaptureKind::Cpu, now);
    budget
        .check(CaptureKind::Incident, now + Duration::from_secs(1))
        .unwrap();
    budget.consume(CaptureKind::Incident, now + Duration::from_secs(1));
    budget
        .check(CaptureKind::Manual, now + Duration::from_secs(2))
        .unwrap();
}

#[test]
fn repeated_incidents_observe_cooldown_and_reserve_manual_slot() {
    let mut budget = CaptureBudget::default();
    let now = Instant::now();
    budget.consume(CaptureKind::Incident, now);
    assert!(budget
        .check(CaptureKind::Incident, now + Duration::from_secs(119))
        .is_err());
    let later = now + Duration::from_secs(120);
    budget.check(CaptureKind::Incident, later).unwrap();
    budget.consume(CaptureKind::Incident, later);
    assert!(budget.check(CaptureKind::Cpu, later).is_err());
    assert!(budget
        .check(CaptureKind::Incident, later + Duration::from_secs(120))
        .is_err());
    budget.check(CaptureKind::Manual, later).unwrap();
}

#[test]
fn manual_requests_remain_bounded_and_rejected_requests_spend_nothing() {
    let mut budget = CaptureBudget::default();
    let now = Instant::now();
    for index in 0..3 {
        let at = now + Duration::from_secs(index * 120);
        budget.check(CaptureKind::Manual, at).unwrap();
        budget.consume(CaptureKind::Manual, at);
        assert!(budget.check(CaptureKind::Manual, at).is_err());
        assert_eq!(budget.total(), index as usize + 1);
    }
    assert!(budget
        .check(CaptureKind::Manual, now + Duration::from_secs(360))
        .is_err());
}

#[test]
fn heartbeat_timeout_has_incident_priority_even_when_cpu_is_hot() {
    assert_eq!(
        capture_kind(
            "native-cpu-or-heartbeat",
            &json!({"heartbeatAgeMs": 30_000, "sustainedHotSamples": 2})
        ),
        CaptureKind::Incident
    );
    assert_eq!(
        capture_kind(
            "native-cpu-or-heartbeat",
            &json!({"heartbeatAgeMs": 29_999, "sustainedHotSamples": 2})
        ),
        CaptureKind::Cpu
    );
    assert_eq!(
        capture_kind("native-cpu-or-heartbeat", &json!({"heartbeatAgeMs": null})),
        CaptureKind::Cpu
    );
    assert_eq!(
        capture_kind("renderer-incident", &json!({})),
        CaptureKind::Incident
    );
    assert_eq!(capture_kind("manual-save", &json!({})), CaptureKind::Manual);
    assert_eq!(capture_kind("unknown", &json!({})), CaptureKind::Cpu);
}
