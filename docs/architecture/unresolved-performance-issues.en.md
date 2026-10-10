# Unresolved Performance Issues

[中文](unresolved-performance-issues.md) | English

> This is the long-term tracking entry for “gets slower over time”, input latency, and preview lag. It records incidents that happened but do not yet have a closed root-cause loop. Fixed JS/business cache defects are tracked in [the memory leak and accumulation audit](memory-leak-audit.md).
>
> **Current conclusion**: evidence narrows the scope from business event handlers to the WebView2/Chromium compositor and frame-feedback path, but does not identify which page behavior triggers it, and does not show that upgrading the runtime removes it. “It became smooth after reload” is a reset control only, never a fix result.

## Maintenance rules

Update the matching item’s latest evidence and the log below for every new field observation or experiment. Do not create parallel lists. A subjective report without raw data, runtime version, PIDs, and the fixed operation sequence records an observation but cannot change an issue state.

Allowed states are `confirmed`, `suspected`, `needs-reproduction`, `blocked`, and `fixed`.

### Fixed sampling fields

Every reproduction run must record the run ID, timestamp, full runtime version, host and renderer PIDs, project summary, operation sequence, whether the page or app was restarted, tracker counts and samples, FrameSorter state, compositor CPU, mouse/wheel renderer wait percentiles, raw traces, analysis JSON, and the user’s interaction assessment.

### Fixed reproduction state machine

1. Record runtime, PIDs, project summary, and page session ID. Open the same project and collect a 60-second cold baseline.
2. Execute the fixed sequence “canvas hover → fast move → wheel zoom → timeline drag → brush stroke → play/stop”, 60 seconds per step, sampling every second.
3. Save the live state as soon as a threshold is reached, without reloading. Apply one intervention and repeat the exact sequence.
4. Page reload and app restart are reset controls and must be labelled separately; they cannot pass a fix.

### Acceptance gates

A fix must, on the same project and operation sequence, keep `removal_trackers_` from monotonically growing for ten minutes, keep FrameSorter pending bounded with the queue head leaving within two frame periods after begin/ACK, reduce compositor CPU by at least 50% without sustained five-second 80% single-core peaks, keep mouse and wheel renderer wait at P95 ≤50 ms and max ≤100 ms, and allow the next input while the preview is still catching up. The result must hold without a page reload or app restart.

## Current evidence index

| Evidence category | Raw files | Purpose |
|---|---|---|
| Incident conclusion | [investigation-conclusion.json](../../output/zoom-latency-20261008/investigation-conclusion.json), [current-findings.md](../../output/zoom-latency-20261008/current-findings.md) | investigation scope, timeline, and conclusion boundary |
| Input waits | [desktop-live-latency.json](../../output/zoom-latency-20261008/desktop-live-latency.json), [trace-input-findings.json](../../output/zoom-latency-20261008/trace-input-findings.json), [desktop-live-trace-summary.json](../../output/zoom-latency-20261008/desktop-live-trace-summary.json) | renderer waits, compositor CPU, and event percentiles |
| Native trackers | [before-protocol-reset-collection.json](../../output/zoom-latency-20261008/before-protocol-reset-collection.json), [protocol-current-collection.json](../../output/zoom-latency-20261008/protocol-current-collection.json), [compositor-native-stacks.json](../../output/zoom-latency-20261008/compositor-native-stacks.json) | counts, capacity, state samples, and native stacks |
| FrameSorter/ACK | [protocol-current-sorter.json](../../output/zoom-latency-20261008/protocol-current-sorter.json), [frame-acks-ordered.json](../../output/zoom-latency-20261008/frame-acks-ordered.json), [raf-acks.json](../../output/zoom-latency-20261008/raf-acks.json) | pending, queue head, begin/ACK, and sort progress |
| Intervention controls | [after-visibility-collection.json](../../output/zoom-latency-20261008/after-visibility-collection.json), [after-devtools-close-collection.json](../../output/zoom-latency-20261008/after-devtools-close-collection.json), [after-continuous-raf-collection.json](../../output/zoom-latency-20261008/after-continuous-raf-collection.json) | failed minimize, DevTools, and empty-RAF controls |
| Complex project samples | [airattack-20261008-timeline](../../output/airattack-20261008-timeline/), [brush-heavy-20261008](../../output/brush-heavy-20261008/), [large-pan-trace.json](../../output/large-pan-trace.json), [large-draw-complex-before.json](../../output/large-draw-complex-before.json), [timeline-live-before.json](../../output/timeline-live-before.json) | large canvas, many layers/frames, drawing, and timeline scenes |
| Business cache fixes | [memory-leak-audit.md](memory-leak-audit.md), [memory-audit-fixes-20261008](../../output/memory-audit-fixes-20261008/) | separates JS/business cache evidence from native WebView state |
| Page-level attribution (U-09) | [root-cause-20261009.md](../../output/live-lag-20261009/root-cause-20261009.md), [session-trend.tsv](../../output/live-lag-20261009/session-trend.tsv), [profile-attribution.json](../../output/live-lag-20261009/profile-attribution.json), [trace-compositor.json](../../output/live-lag-20261009/trace-compositor.json), [session-trend.mjs](../../output/live-lag-20261009/session-trend.mjs), [profile-attribution.mjs](../../output/live-lag-20261009/profile-attribution.mjs), [trace-compositor.mjs](../../output/live-lag-20261009/trace-compositor.mjs) | splits business/engine cost across a 24.577-second incident, per-minute load curve, and the fixed per-frame heavy path |

## Severity order

### U-01 · P0 · WebView native compositor state keeps accumulating

- **Status**: `confirmed` (native retention reproduced on 155; not fixed).
- **First seen**: 2026-10-08, the real development window.
- **Latest evidence**: 2026-10-09, runId=`run39108`, Runtime **155.0.4283.45**, Host **39108** / Renderer **33964**, page session `d35cd59a-5de7-442e-8636-9d30e2083909`. Read-only scanning found **128,699 removal trackers, capacity 131,072**; all 32 distributed samples were `kScheduledForTermination`. Layouts were verified against the current PDB/binary, not copied from 154. [Report](../../output/live-lag-20261009/run39108-findings.md), [objects](../../output/live-lag-20261009/current155-objects-collection.json), [tracker fields](../../output/live-lag-20261009/current155-trackers-2.json).
- **User effect**: pointer previews and subsequent wheel operations fall behind over time; reload temporarily restores responsiveness.
- **Workload**: currently 512×512, ten layers, two groups, one frame, no effects. Large canvases, complex content, many layers and frames remain required for long-run acceptance.
- **Historical evidence**: approximately 177,116 retained records on 154; the earlier 155 Host 34616 / Renderer 38136 had 18.764/24.577 seconds of compositor CPU. Zero after page initialization is a reset control. [Old trackers](../../output/zoom-latency-20261008/before-protocol-reset-collection.json), [old trace](../../output/live-lag-20261009/performance-analysis.json).
- **Mechanism evidence**: current 155 `DestroyTrackers` scans the vector and removes termination state 2 only. State 1 remains on the frame-end/reclamation path. `ScheduleTerminate` compares last-ended with last-sorted, which advances through `AddSortedFrame`. U-02 simultaneously found a 298-frame completed head prefix that had not flushed. [Binary](../../output/live-lag-20261009/edge155-sorter-disassembly.txt), [reclamation](../../output/live-lag-20261009/edge155-reclamation-disassembly.txt). This establishes the retention location; an intervention has not yet quantified its causal contribution to latency.
- **Failed controls**: raw off, native cursor, hover suppression, GPU promotion removal, minimize/restore, DevTools close and continuous empty RAF did not recover the earlier incident. The current raw adjustment still visibly lagged and was reverted.
- **Corrections**: main-thread RunTask's earlier 61.3% is wall time; CPU is about 35.2%. Short task gaps do not rule out a self-sustaining loop. Continuous commits and low memory are correlations, not established causes. Current available memory is about 3.7 GB, so the earlier memory-pressure explanation cannot be assumed.
- **Unknowns**: the initial missing/late ACK trigger, first stall time, and responsibilities of application/HMR/diagnostics/Runtime.
- **Scene transition**: removing the temporary Vite module at 21:21 was followed by a page reload: old session ended at 13:21:20.413 UTC and renderer.started returned three seconds later. PIDs stayed unchanged. Tracker=0/pending=2 afterwards is a **reload control**, not lifecycle intervention or a fix. [Timeline](../../output/live-lag-20261009/run39108-page-reset.json).
- **Isolated interface acceptance**: the Runtime 155 [isolated report](../../output/live-lag-20261009/isolated-recovery-findings.md) confirms official controller `SetIsVisible(false/true)` preserves page identity/timeOrigin, normal frame-statistics counters resume after reset, and input P95 stays near 10 ms. A single 12-second JS block did not reproduce long-term retention. CDP frozen/active/bringToFront left the isolated page hidden; withdraw it as a general recovery recommendation. **No incident recovery or performance improvement has been demonstrated.**
- **Only next step**: prepare the original window's native controller visibility channel before the next incident. During real retention, save before, perform one false/true cycle, then compare same-page trackers, sorting progress, CPU and input. The running product does not yet expose this channel; do not edit Rust or add/remove Vite modules during an incident. Success establishes a recovery mechanism first, not a permanent fix.
- **Channel prepared (2026-10-09)**: the product now exposes `platform_diagnostics::set_webview_visible(visible)`, which drives `ICoreWebView2Controller::SetIsVisible` directly (webview2-com 0.38.2, `SetIsVisible(bool)` / `IsVisible(*mut BOOL)`, `src/platform_diagnostics.rs:270`). This was written **with no incident open**, so it does not touch the "no Rust edits and no Vite module changes during an incident" constraint: it is preparation, not field surgery. Three design constraints: (1) every transition logs the requested value together with what the controller **actually reports back** (`prior`/`settled`) in a `webview.visibility-intervention` event, because a refused hide (a modal child, or a browser already inside a visibility transition) has to be distinguishable from a failed experiment; (2) the `claim_visibility_intervention` gate allows one false/true pair per session and refuses a repeat outright instead of silently stacking a second toggle on it, since two interventions cannot be told apart afterwards; (3) only a failed dispatch returns the claim — a timeout deliberately does not, because the controller may have changed state anyway and a retry would stack a second toggle on top. The command is registered in `lib.rs`; the gate and the payload shape have unit tests.
- **Caveat**: the channel is **not live in the running PID 1660 instance** — that binary predates this change. Validation needs a **freshly built instance**, or the next real incident. Per the constraint above, that incident still runs: save a before trace in lag mode, call `set_webview_visible(false)`, hold idle for 60 seconds, call `set_webview_visible(true)`, save an after trace, then compare same-page trackers, sorting progress, CPU and input waits.
- **Acceptance**: shared gates; retention must stop during continuous same-page use and input recovery must coincide with native-state recovery.

### U-02 · P0 · FrameSorter stops flushing after matched ACKs

- **Current 155 reproduction (run39108)**: two stable read-only snapshots 157.729 seconds apart retain pending=300, completed prefix=298, head begin=2/ACK=2, head=220, tail=153 and total_frames=403245. Current AddNewFrame/result disassembly supports the eviction-without-flush candidate; initial ACK loss and recovery causality remain unproven. [Snapshot 1](../../output/live-lag-20261009/current155-sorter.json), [snapshot 2](../../output/live-lag-20261009/current155-sorter-2.json), [155 binary](../../output/live-lag-20261009/edge155-sorter-disassembly.txt).
- **Per-entry decomposition on the live build (2026-10-09, offline re-parse of the snapshots above)**: [sorter-stall-155.json](../../output/live-lag-20261009/sorter-stall-155.json) shows entries **0–297 all complete** (`Begin==Ack`); only the **last two** (index 298, 299) are `Begin=1 / Ack=0` — begun and never acknowledged. So the blocked entries are the **two ACK-less frames at the tail**, while the head itself is long complete. Every field (Pending/Head/Tail/TotalFrames) is identical across the two snapshots 157.729 seconds apart, so the queue neither advances nor self-heals. This is stronger than the earlier reference-algorithm model: the blocking entries and their exact begin/ack counts are read from the **running 155 process**, not inferred from 154 offsets. The [page-reset snapshot](../../output/live-lag-20261009/current155-sorter-after.json) (pending=2, total_frames reset to 8619) is a **reload control, not evidence of self-recovery**.
- **State**: `confirmed`
- **Evidence**: [protocol-current-sorter.json](../../output/zoom-latency-20261008/protocol-current-sorter.json), [frame-acks-ordered.json](../../output/zoom-latency-20261008/frame-acks-ordered.json), and [raf-acks.json](../../output/zoom-latency-20261008/raf-acks.json). About 298 of roughly 300 pending frames had matched begin/ACK; the queue head itself had begin=2 and ACK=2 but remained pending, while `last_sorted_frame_id` stayed at an early frame or zero.
- **Current judgment**: sorting or flush stops after completion feedback, preventing tracker reclamation. This is the closest mechanism-level clue, not a proven cause.
- **Offline progress (2026-10-09)**: both saved incidents contain 300 pending frames, 298 complete states, and a complete prefix of 297. In the saved Chromium reference, eviction in `AddNewFrame` does not flush the newly exposed head; `AddFrameResult` flushes only when its own ACK belongs to that head. One missing ACK followed by overflow can therefore leave an already-complete head without another ACK to wake it.
- **Model result and limits**: 10,001 reference-model frames with the first ACK missing leave 300 complete pending frames and zero outputs. A hypothetical flush after eviction leaves zero pending and outputs 10,000 frames. All-ACK and late-ACK-within-limit controls behave normally. This is a mechanism hypothesis, not a live WebView change or proof of the original trigger, Edge 155 behavior, or a production fix. [Replay](../../output/zoom-latency-20261008/sorter-overflow-replay.py), [results](../../output/zoom-latency-20261008/sorter-overflow-replay.json).
- **Old binary check**: version-matched 154 PDB locates `AddNewFrame` at RVA `0xd30010`; [read-only disassembly](../../output/zoom-latency-20261008/edge-add-new-frame-disassembly.txt) shows a size/limit comparison at `d30366`, state/info deletion at `d3045c`/`d30467`, and head advancement at `d304e6`. This supports the reference path; current-runtime behavior still needs independent verification.
- **Ruled out**: “all frames lack ACK”; the first-content-paint flag was not always zero.
- **Isolated experiment limits**: the intentional main-thread block produced approximately 11,998 ms of input wait, but afterwards input P95 recovered to 9.8 ms and trackers stayed at zero. Persistent sorting stalls were not reproduced. Official controller visibility changes reset normal statistics, without proving recovery of an abnormal queue. Unstable high-frame-rate tree/deque reads are excluded; single-field counters are not complete FIFO snapshots. [Raw data and failed runs](../../output/live-lag-20261009/isolated-recovery-findings.md).
- **Next experiment**: use the verified official controller intervention in a truly reproduced window and compare sorting, reclamation and input while preserving page identity. Prepare the native channel first; never use live HMR edits or outdated private layouts. Do not repeat ordinary JS mouse sampling or single-long-task controls.
- **Pass condition**: the head leaves within two frames and pending stays bounded, with tracker and input metrics improving as well.

### U-09 · P0 · Page-level long-lived state accumulation plus a fixed per-frame heavy path

- **Status**: `suspected` (progressive degradation confirmed; page-level accumulation mechanism unresolved).
- **User effect**: any canvas size can lag after roughly 30–60 minutes; closing/switching projects does not recover it, while page reload/restart temporarily does.
- **Scope**: cross-project persistence points to page/process state, but retained old-document references or global business caches remain possible. Switching projects alone cannot rule out document, undo, or document-indexed caches.
- **Earlier Host 34616 / Renderer 38136 measurements** (24.577 seconds; separate from run39108):

  | Item | Result | Boundary |
  |---|---:|---|
  | Application profile self time | 341.8 ms, 1.4% of the recording window | Not 1.4% of main-thread CPU; sampled self time does not cover all engine work |
  | Main RunTask | Wall 15,074 ms / 61.3%; CPU about 35.2% | Report CPU and wall time separately |
  | Commit | 1,471 calls / wall 6,215.9 ms | Offline re-parse gives a 20,414.7 ms span ≈ **72 Hz**, median gap 10.86 ms; the same window holds 17,976 `MouseMove` events (98% of all input) ⇒ commits are **input-driven**; idle stretches run at ≈3.5 Hz with no self-sustaining idle loop. The count alone still establishes neither creator nor complete CPU attribution |
  | Compositor | CPU 18,763.8 ms / 76.3% of one core | 96.4% of task gaps below 0.1 ms does not rule out a self-sustaining loop |
  | Wheel pre-main wait | P95 1,764.357 ms / max 4,844.909 ms | A 1.3–2.0 ms JS capture mean cannot rule out earlier browser queuing |
  | Available memory | 0.81 GB | Pressure context, not causal proof of rerasterization; run39108 had about 3.7 GB |

- **Page paths still worth checking**: profile identifies renderFrame, brush overlay, geometry reads and React scheduling. These can amplify an existing backlog, but aggregate costs and LoAF locations are not causal interventions. Missing `canvas.stage.draw` entries establish only that logging conditions were not met, not zero drawing cost.
- **Not excluded**: guards and observer disconnect reduce ordinary duplicate registration risk but cannot rule out HMR retention or diagnostic effects. A bounded heap/DOM count does not prove complete reference release. BrushDynamics subscriber evidence limits notification cost in that sample only.
- **New native evidence**: run39108 has 128,699 pending-reclamation records and a 298-frame completed prefix that did not flush. Prioritize U-01/U-02's causal recovery control; do not restart to reproduce or repeat ordinary mouse sampling.
- **Sequence**: compare native recovery and input first, then compare dev/production under the same workload to test how HMR/diagnostics affect triggering. Dev-only reproduction does not prove HMR; production reproduction does not rule out an additional HMR amplifier in development.
- **Acceptance**: retention/release curves and input latency must improve together under the shared long-run gates. Reload recovery, small application profile costs, or bounded heap alone cannot close this item.

### U-03 · P1 · Renderer input backpressure

- **State**: `confirmed` as a user-visible consequence, not a closed cause
- **Evidence**: [trace-input-findings.json](../../output/zoom-latency-20261008/trace-input-findings.json) and [desktop-live-latency.json](../../output/zoom-latency-20261008/desktop-live-latency.json): mouse renderer wait P95 about 886.108 ms and wheel P95 about 2,143.909 ms, while app handlers were usually millisecond-scale.
- **Current judgment**: the wait is before or around delivery to the renderer main thread and likely follows U-01/U-02.
- **Next experiment**: record raw event, renderer enqueue, handler start/end, and next RAF/swap timestamps in one trace and split by event type.
- **Pass condition**: mouse, wheel, and timeline drag P95 ≤50 ms, and the next input is accepted while preview work is pending.

### U-04 · P1 · Trigger combination is not stable

- **State**: `needs-reproduction`
- **Evidence**: repeated user reports in large canvases, dozens of layers, hundreds of frames, complex content, styles, large brushes, playback, and empty cels; no deterministic minimal fixture yet.
- **Next experiment**: run a 2×2×2×2 matrix of canvas 512/4096, layers 8/40, frames 1/297, and empty/complex content, with the same four interactions and unified metrics.
- **Pass condition**: identify a minimal trigger and reproduce it three times with similar tracker growth and input P95.

### U-05 · P2 · Lifecycle recovery path is unclear

- **State**: `blocked`
- **Evidence**: `getCurrentWebview().hide/show()` was denied by `core:webview:allow-webview-hide`; the frozen/active Protocol Monitor comparison was not run during an accumulating incident.
- **Next experiment**: only after U-01 reaches its threshold, use the supported CDP Page lifecycle frozen→active call and save before/after sorter, tracker, and input data.
- **Pass condition**: classify it as temporary relief unless bounded long-run metrics also recover.

### U-06 · P2 · Runtime-version dependency is unknown

- **State**: `needs-reproduction`
- **Current environment**: signed WebView2 **155.0.4283.45** at `C:\Program Files (x86)\Microsoft\EdgeWebView\Application\155.0.4283.45`.
- **Latest incident**: runId=`live-lag-20261009` confirms lag still occurs on 155. Wheel generation-to-renderer-main P95 **1,764.357 ms**, max **4,844.909 ms** (81 samples with that component). [Analysis](../../output/live-lag-20261009/performance-analysis.json) does not establish the same private-state root cause as 154.
- **Next experiment**: complete the U-04 matrix and a ten-minute run on 155; if controllable, pair the same project on 154 and 155, or pin a known-good runtime via `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` for comparison.
- **Runtime version must travel with the incident**: the version previously appeared only inside trace manifests, so a session without a saved trace had no version at all. The host now writes the actual Runtime version to the diagnostic log at startup (`runtime.version`), independent of whether a trace was captured.
- **Pinning channel (confirmed available, not yet enabled)**: WebView2 officially supports the `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER` environment variable to override the runtime folder at environment-creation time, ahead of the registry; Tauri also sets it on the fixed-version distribution path. This is the real escape hatch for bypassing a runtime build. This entry registers only that the channel exists and how it is used — pinning is **not** recorded as a fix, because 154 has not been shown to be free of the problem.
- **Feature-flag finding**: no public Chromium feature flag was found that disables `FrameSequenceTrackerCollection` / `FrameSorter`, so `additionalBrowserArgs` is deliberately left unset. Note that wry passes `--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection` by default, and setting that field **overrides** those defaults; inventing an unverified flag carries side-effect risk.
- **Pass condition**: explicitly report “not reproduced on 155”, “still reproduced on 155”, or “metrics improved but cause unknown”, always including the runtime.

### U-07 · P2 · Native/page memory and frame observability gap

- **State**: `confirmed` as a diagnostic gap
- **Evidence**: the page sampler records pointermove/pointerdown/wheel wait to the capture listener, long tasks, LoAF/event entries when available, and a backing estimate for up to 128 canvases. The native sampler previously ran every 10 seconds with an 8-second cache and returned CPU/memory for at most 32 processes. Neither path includes tracker counts, FrameSorter pending/head/tail, GPU compositor counters, or one timeline from input to swap.
- **Current judgment**: the old collector could prove that a stall occurred but could not capture the native mechanism most strongly implicated here, and it could miss short incidents. Diagnostic/HMR wrappers can also contaminate a live run.
- **Sampling decision**: the one-second experiment was reverted. Faster process enumeration cannot expose thread stacks or frame feedback and its added cost was not measured. Native sampling remains at ten seconds with an eight-second cache. Passing compilation and two native lifecycle tests does not validate a performance fix.
- **Test gap**: most `raf-leak-verification.test.ts` cases repeat ideal cleanup snippets without importing production components. `memory-leak-test.test.ts` mixes synthetic and native RAF IDs, does not decrement completed callbacks, and treats unavailable heap data as zero. These tests cannot prove this incident fixed; genuine production-cache tests remain separate evidence.
- **2026-10-09 progress**: native acquisition and overhead acceptance passed. Public CDP still does not expose private tracker/FrameSorter counts; the original root cause remains open.
- **New confirmed gap**: runId=`live-lag-20261009` consumed all three automatic native exports on high-CPU triggers at 16:35, 16:41 and 16:43; severe incidents after 16:51 returned `Browser trace not recording` / `captures:3`. An independent DevTools window supplied a preserved 24.577-second trace. Capture quota/trigger policy and real high-frequency-input overhead need correction and acceptance; native code was not changed and the window was not restarted. [Incident record](../../output/live-lag-20261009/findings.md).
- **Next experiment**: use a real project in a clean 155 long-run session, preserve the first incident's native timeline, and compare normal/abnormal EventLatency and input-related Swap/Presentation flows to find the first feedback gap. Reload is not causal validation.
- **Pass condition**: enabling it adds ≤5% CPU/input P95 overhead and leaves no wrapper, listener, RAF, or cache references after disposal.

### U-08 · P2 · Diagnostic/HMR contamination is mixed with business triggering

- **State**: `suspected`
- **Evidence**: after page initialization, Host/Renderer PIDs stayed the same while trackers fell from about 177,116 to zero; earlier RAF wrappers and listeners could not be proven fully removed from source alone.
- **Next experiment**: compare a clean `pnpm dev` session and a one-shot diagnostic session with the same project and operation sequence; destroy the page session after each run.
- **Pass condition**: only issues reproducible in the clean session enter production fixes; diagnostic-only effects remain contamination candidates.

## Native capture implementation and acceptance

Implemented on 2026-10-09: the existing lag collector saves current WebView2 input, compositor and presentation evidence through the host. The original progressive slowdown remains unresolved; this section accepts acquisition only.

1. Use WebView2's official `CallDevToolsProtocolMethod` on the current controller, without DevTools, remote ports, or restart. Check real `Tracing`/`IO` capabilities and record failures explicitly.
2. Start a 16 MiB circular buffer only in lag mode. Final resident categories are `input` and `latencyInfo`. Actual traces contain Compositor, CrRendererMain, EventLatency, InputLatency, Swap, SubmitCompositorFrameToPresentationCompositorFrame and PresentedFrameInformation. This preserves input-related frame feedback, rather than every frame's BeginFrame/Commit. Screenshots, heap dumps and high-frequency CPU profiling stay off.
3. Renderer incidents, two consecutive native samples above 75% of one core for a process, or an overdue visible-page heartbeat trigger saving the buffer and five seconds afterwards. Help → Open diagnostic logs also saves it. Limit to three captures per host launch, at least 120 seconds apart, 128 MiB per export and 60 seconds of stream reading. Retain partial files/errors; never delete old traces.
4. Export a manifest with incident/session IDs, runtime/PIDs, page/HMR state, project metadata, start/stop/error state, and truncation. Public CDP does not expose private tracker/FrameSorter counts; do not promise those values.
5. Dispose callbacks/timers on stop, page recreation, and exit. Do not take over traces owned by DevTools or other windows; report write errors, without reload, cache clearing, or project changes.
6. An isolated real WebView2 **155.0.4283.45** reuses the production COM bridge, circular recorder and streaming exporter for three enabled/disabled pairs, 60 seconds each. Workload: 4K canvas, 2,000 rectangles, continuous RAF painting, approximately 20 Hz protocol input and wheel. See [final acceptance](../../output/native-trace-20261009-input/analysis.json) and [complete checks](../../output/native-trace-20261009/check-final.txt). This is acquisition acceptance, not real-project long-run or OS mouse-input acceptance.

Rejected configurations remain recorded: [broad categories](../../output/native-trace-20261009/analysis.json) added **35.0%** median CPU; [per-frame categories](../../output/native-trace-20261009-lite/analysis.json) added **17.2%**. The final analysis preserves all three pairs, event coverage, runtime and raw file paths. After disabling, the native worker reports `off` with `cleanupError=null`. Type checking, 159 JS tests, 20 native tests and the Rust risk budget passed. The complete check includes existing dirty D3 files rather than omitting them.

Offline work continues on the U-02 missing-ACK/overflow hypothesis; current-runtime events or a repeatable trigger are still required to close the real incident.
Final configuration passed: host plus descendant median CPU **42.96% → 43.51% of one core**, a **1.27%** relative increase; median input P95 **10.10 ms → 10.10 ms**, **0%** increase. These are three 60-second pairs in one isolated window, not a guarantee of real-project long-run overhead or a fix for U-01/U-02. Frame arrays retain their first 10,000 intervals; input samples cover the full run.

## Fixed issues outside this list

F-01–F-04 in `memory-leak-audit.md` have business-side data: 4K temporary composite allocation 384 MiB → 64 MiB (−83.3%), three-composite median 534.4 ms → 461.2 ms (about −13.7%), and post-dispose property cache 64 MiB → 0, with targeted tests and D3 checks passing. These prove JS/business cache control, not WebView native tracker or FrameSorter recovery.

## Maintenance log

| Date | Change | Evidence/conclusion |
|---|---|---|
| 2026-10-09 | Created U-01–U-08 | Preserved the 154-runtime incident, reset control, failed interventions, and the 155-runtime retest boundary |
| 2026-10-09 | Audited the incident collector and test evidence | Faster sampling was reverted; native/browser trace coverage is required, and snippet-based tests cannot close the incident |
| 2026-10-09 | Replayed FrameSorter overflow hypothesis | Both old snapshots have a 297-frame complete prefix; the reference model stalls at the 300-frame limit after one missing ACK; original trigger and 155 behavior remain unproven |
| 2026-10-09 | Native capture completed; runId=`native-trace-20261009-input`, WebView2 155.0.4283.45 | Three enabled/disabled 60-second pairs: CPU +1.27%, input P95 +0%; native trace and cleanup passed; U-01/U-02 unresolved |
| 2026-10-09 | Preserved-window recording; runId=`live-lag-20261009`, WebView2 155.0.4283.45, Host 34616 / Renderer 38136 | Lag recurs on 155; Compositor RunTask CPU 18.764/24.577 seconds; wheel pre-main wait P95 1.764 seconds, max 4.845 seconds; automatic capture quota expired before severe incidents. Mouse coalesced feedback and delivery delays are reported separately; private trackers and root cause remain open |
| 2026-10-09 | 155 native-stack addendum, still `live-lag-20261009` | 76/180 compositor samples passed through `FrameSequenceTrackerCollection::DestroyTrackers`, 100/180 through `Scheduler::FinishImplFrame`; scope narrowed to Chromium reclamation scanning, but creator, 155 tracker count and safe app-side fix remain unconfirmed |
| 2026-10-09 | Read-only offline attribution of the `live-lag-20261009` incident (before reload); registered **U-09** | Business JS is only 1.4% of the main thread (341.8 ms / 24,577 ms); main-thread `Commit` 1,471 calls ≈ 60 Hz continuous committing; 96.4% of the 32,573 compositor task gaps are under 0.1 ms with no self-sustaining idle loop; five per-frame heavy-path coordinates and 292.7 ms/24.5 s of layout read cost obtained. U-01's high CPU is repositioned as a downstream result of continuous commits plus exhausted memory headroom, alongside — not instead of — tracker accumulation  **Historical inference superseded by the run39108 corrections.** |
| 2026-10-09 | User added reproduction conditions; U-09 scope corrected | **Any canvas size** lags within 30–60 minutes; **closing the project still lags and any project opened afterwards still lags**, restoring only on page reload or restart ⇒ the cause must be page-level or process-level long-lived state, **ruling out the document, undo history, and per-document caches**; the live sampling window has been lost and must be reproduced in a clean session  **Historical inference superseded by the run39108 corrections.** |
| 2026-10-09 | Exclusions and corrections | Ruled out diagnostic-collector self-leak (idempotency guard + correct teardown + observer disconnect) and `BrushDynamicsTelemetryCapture` (its only subscriber mounts in the pressure popover, `notify` totals 9.2 ms); **corrected** this round's earlier "DOM growth drives degradation" judgment — DOM rose 1,026→3,060 then plateaued, a one-time step; **corrected** the 7.38 GB write interpretation — that field includes IPC pipe bytes, not file writes  **Historical inference superseded by the run39108 corrections.** |
| 2026-10-09 | Analysis artifact persistence status (updated) | The earlier analysis files now exist on disk. The earlier unpersisted-artifact statement is obsolete; no regeneration is required. run39108 has a separate report and raw snapshots. |
| 2026-10-09 | run39108 native-object reproduction and evidence corrections, Runtime 155.0.4283.45, Host 39108 / Renderer 33964 | 128,699 trackers, all 32 samples state=1; two sorter snapshots 157.729 seconds apart retain 300 pending/298 complete-prefix frames. U-02 becomes confirmed, not fixed. Raw control failed and code was reverted; early traces/logs preserved with SHA256. Corrected wall/CPU, memory causality, project-switch cache exclusion and diagnostic-guard overclaims. |
| 2026-10-09 | Agent temporary-module removal triggered run39108 page reload | Old session ended at 13:21:20.413 UTC; renderer.started/new session at 13:21:23.148 UTC. PIDs unchanged, activeDocument=false, then tracker=0/pending=2. Scene lost; no lifecycle-recovery or performance pass can be claimed. Raw logs and before/after snapshots preserved; no module additions/removals during future incidents. |
| 2026-10-09 | Isolated public-interface acceptance, runId=`isolated-sorter-run2/4/5`, Runtime 155.0.4283.45 | [Report and raw data](../../output/live-lag-20261009/isolated-recovery-findings.md): a 12-second main-thread block did not reproduce retention; three CDP commands failed to reliably restore visibility; official controller false/true preserves page identity/timeOrigin, normal counters 11,270→4→5,171, input P95 10.10→10.00 ms. Unstable native snapshots excluded. Interface/normal-path acceptance only; U-01/U-02 remain unresolved and the current product has no native control channel. |
| 2026-10-09 | Aseprite comparison and bounded preview surface reuse, runId=`aseprite-comparison-20261009/native-run-bounded`, Runtime 155.0.4283.45 | [Fixed comparison list and data](../../output/aseprite-comparison-20261009/comparison.md): 512/1024-pixel synchronized preview draw means −16.19%/−12.70%; no stable benefit at 256. Three pairs per size reduce resize operations 354→0; 12 scenarios and 58,080,000 RGBA bytes have zero differences. Extra capacity capped at 25%; D3 checks passed. Reduces preview resource rebuilding without proving U-01/U-02's trigger or long-term retention is fixed. |
| 2026-10-09 | Commit-source breakdown (offline re-parse of the `live-lag-20261009` incident trace); added [commit-rate-analysis.py](../../output/live-lag-20261009/analyze-commit-rate.py) | Main-thread `Commit` **1,471 over a 20,414.7 ms span ≈ 72 Hz**, median inter-commit gap 10.86 ms; the same window holds **18,312 input events** (`MouseMove` **17,976**, 98%) ≈ 747/s. The largest true input gap is only **628.9 ms** and contains 3 main-thread commits. **Correction**: this round's earlier "57 Hz self-sustaining idle commits" was an artifact of counting the compositor thread; by the main-thread measure the idle stretches hold 7 commits in 1.99 s (≈3.5 Hz), so **this incident has no self-sustaining idle commit loop**. A static scan likewise found no runaway resident rAF or infinite CSS animation. Conclusion: frame production is **input-driven**, but "much input" explains the frame count, not why the tracking records cannot be reclaimed. |
| 2026-10-09 | Host records the Runtime version at startup, `platform_diagnostics::record_runtime_version` | Every incident now carries a `runtime.version` event and no longer depends on a saved trace manifest. `runtime_version_detail` has a targeted test; `cargo check` and test-target type check pass. No business render path changed. |
| 2026-10-09 | Per-entry decomposition of U-02, runId=`run39108`, Runtime 155.0.4283.45 | [sorter-stall-155.json](../../output/live-lag-20261009/sorter-stall-155.json): entries 0–297 are all `Begin==Ack`; only the last two (298, 299) are `Begin=1/Ack=0`. The blocking entries are the **two ACK-less frames at the tail**, while the head is long complete; the two snapshots 157.729 seconds apart are field-identical, so the queue does not self-heal. Read from the running 155 process, not inferred from 154 offsets. The original cause of the missing ACKs and the recovery causality remain unproven. |
| 2026-10-09 | Native controller visibility channel wired in (prepared with no incident open), `platform_diagnostics::set_webview_visible` + `WebviewDiagnosticAction::SetVisible` | Drives `ICoreWebView2Controller::SetIsVisible`, reads `IsVisible` back, and logs `requested`/`observed`/`applied`/`prior` as a `webview.visibility-intervention` event. A once-per-session gate admits one false/true pair, refuses a repeat, and deliberately keeps the claim on timeout so a retry cannot stack a second toggle. Command registered, gate and payload tested, `cargo check --tests` clean. **The PID 1660 instance predates this change**, so the channel needs a fresh build. This is U-01 **preparation**, not a demonstrated recovery. |

Every future entry must add a run ID, full runtime version, raw data links, and the reason for any state change.

Compare dev/production using the same Runtime, project, workload and diagnostic configuration. Compare trigger probabilities; do not treat the result as a binary proof or exclusion of HMR.
