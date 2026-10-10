// Isolated, real WebView2 acceptance. Reuses the production COM bridge,
// circular recorder and streaming exporter; never opens an editor project.
#[allow(dead_code)]
#[path = "../src/platform_browser_trace.rs"]
mod platform_browser_trace;
#[allow(dead_code)]
#[path = "../src/platform_diagnostics.rs"]
mod platform_diagnostics;
use platform_browser_trace::{Protocol, WebviewProtocol};
use serde_json::{json, Value};
use std::{
    collections::BTreeSet,
    path::PathBuf,
    time::{Duration, Instant},
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

const WORKLOAD: &str = r#"(() => {
document.body.style.cssText='margin:0;background:#161d2b;color:white;overflow:hidden';
document.body.innerHTML='<div style="position:absolute;z-index:2;pointer-events:none">MoonSprite 浏览器采集独立验收 · 当前工程保持打开</div><canvas style="width:720px;height:520px"></canvas>';
const c=document.querySelector('canvas');c.width=c.height=4096;const x=c.getContext('2d');
x.fillStyle='#18384b';x.fillRect(0,0,4096,4096);for(let i=0;i<2000;i++){x.fillStyle=`hsl(${i%360} 60% 45%)`;x.fillRect((i*127)%4096,(i*239)%4096,32,32)}
window.metrics={frames:[],input:[],moves:0,wheels:0};let last=performance.now(),n=0,px=200,py=200;
document.addEventListener('pointermove',e=>{px=e.clientX*4096/720;py=e.clientY*4096/520;const m=window.metrics;m.moves++;if(m.input.length<10000)m.input.push(Math.max(0,performance.now()-e.timeStamp))});
document.addEventListener('wheel',e=>{window.metrics.wheels++;const m=window.metrics;if(m.input.length<10000)m.input.push(Math.max(0,performance.now()-e.timeStamp));c.style.transform=`scale(${1+(n%5)*.001})`},{passive:true});
function draw(now){const m=window.metrics;if(m.frames.length<10000)m.frames.push(now-last);last=now;n++;x.fillStyle=n%2?'#fafa22':'#4477ff';x.fillRect(px,py,128,128);c.style.opacity=String(.97+(n%3)*.01);requestAnimationFrame(draw)}requestAnimationFrame(draw);
return 'ready'
})()"#;
fn cpu_snapshot() -> (u64, u64) {
    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing()
            .without_tasks()
            .with_cpu()
            .with_memory(),
    );
    let mut pids = BTreeSet::from([Pid::from_u32(std::process::id())]);
    for _ in 0..8 {
        let children: Vec<_> = sys
            .processes()
            .iter()
            .filter(|(_, p)| p.parent().is_some_and(|pid| pids.contains(&pid)))
            .map(|(pid, _)| *pid)
            .collect();
        pids.extend(children);
    }
    pids.iter()
        .filter_map(|pid| sys.process(*pid))
        .fold((0, 0), |(cpu, mem), p| {
            (cpu + p.accumulated_cpu_time(), mem + p.memory())
        })
}
fn evaluate(protocol: &impl Protocol, expression: &str) -> Result<Value, String> {
    let value = protocol.call(
        "Runtime.evaluate",
        json!({"expression":expression,"returnByValue":true}),
    )?;
    if value.get("exceptionDetails").is_some() {
        return Err(value.to_string());
    }
    Ok(value["result"]["value"].clone())
}
fn workload(protocol: &impl Protocol, seconds: u64) -> Result<Value, String> {
    evaluate(
        protocol,
        "window.metrics={frames:[],input:[],moves:0,wheels:0};true",
    )?;
    let before = cpu_snapshot();
    let at = Instant::now();
    let mut step = 0u64;
    while at.elapsed() < Duration::from_secs(seconds) {
        protocol.call(
            "Input.dispatchMouseEvent",
            json!({"type":"mouseMoved","x":50+(step*17)%620,"y":70+(step*13)%400}),
        )?;
        if step % 10 == 0 {
            protocol.call("Input.dispatchMouseEvent", json!({"type":"mouseWheel","x":300,"y":200,"deltaX":0,"deltaY":if step%20==0 {40} else {-40}}))?;
        }
        step += 1;
        std::thread::sleep(Duration::from_millis(50));
    }
    let elapsed = at.elapsed().as_secs_f64();
    let after = cpu_snapshot();
    let metrics = evaluate(protocol, "JSON.parse(JSON.stringify(window.metrics))")?;
    Ok(
        json!({"elapsedSeconds":elapsed,"cpuTimeMs":after.0.saturating_sub(before.0),"oneCoreCpuPercent":after.0.saturating_sub(before.0) as f64/elapsed/10.0,"residentBefore":before.1,"residentAfter":after.1,"metrics":metrics}),
    )
}
fn acceptance(
    app: &tauri::AppHandle,
    window: tauri::WebviewWindow,
    output: PathBuf,
) -> Result<(), String> {
    let protocol = WebviewProtocol(window);
    // Navigation is settled once, before either side of the comparison.
    std::thread::sleep(Duration::from_secs(2));
    evaluate(&protocol, WORKLOAD)?;
    workload(&protocol, 3)?;
    let version = protocol.call("Browser.getVersion", json!({}))?;
    let mut runs = vec![];
    for pair in 0..3 {
        for enabled in if pair == 1 { [true, false] } else { [false, true] } {
            let recording = if enabled {
                Some(platform_browser_trace::start(&protocol)?)
            } else {
                None
            };
            let data = workload(&protocol, 60)?;
            let capture = if let Some(recording) = recording {
                Some(platform_browser_trace::export(
                    app,
                    &protocol,
                    recording,
                    "acceptance",
                    json!({"pair":pair,"workload":"4096 canvas, 2000 rects, RAF, 20Hz input, wheel"}),
                    pair + 1,
                )?)
            } else {
                None
            };
            let run = json!({"pair":pair,"enabled":enabled,"data":data,"capture":capture});
            runs.push(run);
            std::fs::write(
                output.join("acceptance.json"),
                serde_json::to_vec_pretty(&json!({"version":version,"runs":runs}))
                    .map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
            println!("pair {pair} enabled={enabled} complete");
        }
    }
    // Smoke-test the production control worker / command path and its status.
    platform_browser_trace::set_enabled(app, true)?;
    workload(&protocol, 3)?;
    let captured = tauri::async_runtime::block_on(platform_browser_trace::capture_browser_trace(
        app.clone(),
        "worker-acceptance".into(),
        json!({"workload":"command smoke"}),
    ))?;
    platform_browser_trace::set_enabled(app, false)?;
    std::thread::sleep(Duration::from_secs(1));
    std::fs::write(output.join("worker.json"), serde_json::to_vec_pretty(&json!({"capture":captured,"status":platform_browser_trace::browser_trace_status(app.clone())?})).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    Ok(())
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let output = std::env::var_os("MOONSPRITE_TRACE_ACCEPTANCE_DIR")
        .map(PathBuf::from)
        .ok_or("MOONSPRITE_TRACE_ACCEPTANCE_DIR required")?;
    std::fs::create_dir_all(&output)?;
    let mut context = tauri::generate_context!();
    context.config_mut().identifier = "art.moonpx.moonsprite.trace-acceptance".into();
    context.config_mut().app.windows.clear();
    tauri::Builder::default()
        .manage(platform_diagnostics::DiagnosticState::default())
        .manage(platform_browser_trace::BrowserTraceState::default())
        .setup(move |app| {
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::External("about:blank".parse()?),
            )
            .title("MoonSprite 原生采集验收（独立窗口）")
            .inner_size(720.0, 540.0)
            .data_directory(output.join("profile"))
            .build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let result = acceptance(&handle, window, output.clone());
                if let Err(error) = &result {
                    eprintln!("Acceptance failed: {error}");
                    if let Err(e) = std::fs::write(output.join("failure.txt"), error) {
                        eprintln!("Failure report: {e}");
                    }
                }
                handle.exit(if result.is_ok() { 0 } else { 1 });
            });
            Ok(())
        })
        .run(context)?;
    Ok(())
}
