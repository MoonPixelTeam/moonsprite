#[allow(dead_code)]
#[path = "../src/platform_browser_trace.rs"]
mod platform_browser_trace;
#[allow(dead_code)]
#[path = "../src/platform_diagnostics.rs"]
mod platform_diagnostics;

use platform_browser_trace::{drain_stream_with_limit, finish, start, trace_config, Protocol};
use serde_json::{json, Value};
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
