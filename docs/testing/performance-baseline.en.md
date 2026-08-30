# Performance Baseline

[中文](performance-baseline.md) | English

The performance goal is continuous feedback during pixel editing, canvas movement, and zoom. Benchmark data detects regressions; it is not intended for comparing absolute results across hardware.

Record every updated result in the canonical [performance history](performance-history.md) (Chinese audit ledger). This file defines only fixed scenarios, measurement methods, and thresholds.

## Performance Impact Levels

P0-P4 select the performance suite. Ordinary requests still do not run benchmarks. Every `dev.X` or stable release performs at least one P3 audit; use P4 for critical dependency upgrades, large refactors, or an explicit user request. `pnpm check:performance -- <relevant files...>` selects scenarios automatically; targeted P3 runs only the lightweight representative suite for the declared files and never expands to the full matrix. Releases use `pnpm check:performance:release -- <relevant files...>` to enforce at least P3 and run the complete release matrix; explicit `--all` also permits the repository-wide P4 matrix. Omitting files fails immediately. Report, analysis, acceptance, and credential scripts use script tests only and do not trigger Canvas benchmarks. Raise the level manually when a change affects a larger scope, loop complexity, memory allocation, or high-frequency subscriptions.

| Level | Typical scope | Required validation | Performance history |
| --- | --- | --- | --- |
| P0 | Documentation, comments, tests, maintenance scripts | No performance benchmark | Do not record |
| P1 | Ordinary dialogs, menus, shortcuts, file rules, low-frequency state | Type check and related functional tests | Do not record |
| P2 | Selection and whole-image adjustment algorithms, canvas input, palette dragging, localized layer operations | One representative size and related scenario, or the matching algorithm benchmark | Record relevant metrics |
| P3 | Canvas rendering, pixel algorithms, composition cache, high-frequency Zustand subscriptions; minimum release level | Standard-canvas scan, multi-content projects at 800/2048/4000, complex 1024 animation project, and React profiling sentinels | Record complete results; declare a historical regression only from stable samples |
| P4 | Critical dependency upgrade, large refactor, baseline adjustment, major milestone | Complete canvas benchmark with median of three runs, algorithm benchmark, and Windows desktop validation | Record medians and real-device conclusion |

When impact is uncertain, use the higher level. A bug fix that changes only correctness and does not enter a hot path may use P1. When one task spans multiple levels, use the highest.

## Current Automated Benchmarks

Run:

```powershell
pnpm bench:selection
```

On 2026-08-02, commit `8c58f9b` from before the change was checked out again on the current development machine and alternated with the current commit. The median of six combined samples per commit replaces the initial 2026-07-31 observation, which lacked an environment snapshot, and is the baseline for later comparisons on the same machine:

| Operation | Average duration | Observation threshold |
| --- | ---: | ---: |
| Magic-wand selection on contiguous noise background | 18.23 ms | 22 ms |
| Generate complex selection boundary | 9.29 ms | 12 ms |

Observation thresholds are not hard failure lines across machines. On the same machine, explain a median above the threshold for three consecutive runs or more than 5% above the latest valid baseline. Block merging above 15%.

The `11.97 ms / 5.94 ms` values recorded on 2026-07-31 remain in performance history, but the current machine cannot reproduce them and the run did not preserve environment, machine load, or complete raw samples, so they no longer gate regressions.

### Whole-Image Adjustments

Run:

```powershell
pnpm exec vitest bench src/renderer/src/core/adjustments-performance.bench.ts --run
```

When adjustment core changes, select this targeted suite at P2; ordinary debugging does not run it. The suite repeats brightness/contrast, hue/saturation, color balance, curves, and curves-histogram scans ten times each on a `4000 x 4000` RGBA project. It also uses a `1024 x 1024` high-color-entropy image so low-color-count caching cannot hide algorithm cost. Compare historical regressions only against an accepted baseline from the same environment; a development fix in this area does not automatically rewrite the machine baseline.

### Canvas Interaction

Run:

```powershell
pnpm bench:canvas -- --size=512 --scenario=pan,zoom
pnpm bench:canvas -- --full
pnpm bench:canvas:large
pnpm bench:canvas:profile -- --size=1024 --scenario=zoom,draw,bucket-fill --repeat=3
```

Supported standard sizes are `128`, `512`, and `1024`; large-canvas sizes are `800`, `2048`, and `4000`. Ordinary scenarios include `pan`, `zoom`, `rotated-zoom`, `draw`, `shape`, `marquee`, `bucket-fill`, and `gradient`. The complex animation project covers drawing, independent undo/redo, and playback. Large-canvas projects additionally cover both whole-image overview and 100% local editing views.

Every scenario uses an independent browser Context and deterministic project state. Before timing, complex undo scenarios create six real drawing-history entries and verify that all six undo and redo operations succeed. A large-canvas project simulates a content-heavy user project: two full-size layers, 24/48/64 local-content layers distributed across the canvas, groups, opacity, and one closed fill area capped at `1024 x 1024`. Unique pixel allocation is protected by a `192 MiB` limit before allocation. The current design uses approximately 12 MiB at size 800, 62 MiB at 2048, and 166 MiB at 4000.

A release P3 audit first scans the standard, complex, and large-canvas matrices once, then runs three consecutive samples for 100% local pan and draw at `2048/4000`, the complex `1024` project, and representative React profiling scenarios. A one-pass scan discovers candidates and absolute-budget warnings but cannot alone declare a historical regression. Canvas and React metrics apply 5%/15% historical comparisons only when both the current run and accepted baseline have at least three samples. In optimization retests, "adjacent metrics" means frame, draw, input, or React-region metrics collected within the same size and scenario; fixed sentinels and the next release scan cover other scenarios.

Canvas benchmarks use two production builds that must not be mixed. `performance-production` uses an ordinary React production build and `vite preview`, analyzing only frames, drawing, input, and long tasks. `performance-profile` uses a React profiling production build and a separate output directory, analyzing only React root and region commits. An audit fails immediately if the Profiler build captures no React commits. Development-server data must not enter the machine baseline. Both builds use local Chrome or Edge, a `1280 x 800` viewport, and fixed gestures. Output includes:

- `p50`, `p95`, and `p99` frame intervals plus the percentage above 25 ms.
- Canvas main-draw `p95` and maximum duration.
- Pointer-handler `p95` and maximum duration.
- Longest main-thread task captured by `PerformanceObserver`.
- Root-commit and UI-region-commit `p95` from the React profiling build.
- Layer count, frame count, and unique pixel bytes for each project, so input-size changes are visible.

Headless Chromium does not lock `requestAnimationFrame` to 60 Hz, so frame intervals are useful only for relative comparison on the same machine. Main-draw and pointer-handler durations can identify code hotspots. Final experience still requires manual verification in Windows WebView2.

The 2026-08-02 values below predate the split production/Profiler builds and the large-canvas Harness. They remain only as historical observations and do not enter machine regression decisions in `performance-baseline-data.json`. Establish the new-structure baseline after the first accepted formal release audit.

Median of three runs on 2026-08-02:

| Canvas | Scenario | Frame `p95` | >25 ms | Main draw `p95` | Pointer handling `p95` | Worst frame |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 128 x 128 | Pan | 3.70 ms | 0.307% | 0.30 ms | 0.20 ms | 117.9 ms |
| 128 x 128 | Continuous drawing | 3.70 ms | 0.286% | 0.90 ms | 0.40 ms | 99.9 ms |
| 512 x 512 | Pan | 3.70 ms | 0.327% | 0.30 ms | 0.20 ms | 96.4 ms |
| 512 x 512 | Continuous drawing | 3.70 ms | 0.284% | 1.20 ms | 0.40 ms | 117.9 ms |
| 1024 x 1024 | Pan | 3.70 ms | 0.316% | 0.30 ms | 0.20 ms | 103.6 ms |
| 1024 x 1024 | Zoom | 3.70 ms | 0.640% | 0.40 ms | 0.20 ms | 35.7 ms |
| 1024 x 1024 | Zoom after rotation | 3.70 ms | 0.213% | 0.50 ms | 0.20 ms | 29.0 ms |
| 1024 x 1024 | Continuous drawing | 3.70 ms | 0.285% | 1.10 ms | 0.40 ms | 121.4 ms |

Main-draw and pointer functions were both well below 16.7 ms, but asynchronous long tasks of roughly 96-121 ms occurred after operation commits. After region-aware React Profiler recording was added on 2026-08-02, the docked-panel refresh boundary was narrowed and then the application shell was split. The current median React commit `p95` for continuous drawing at 1024 x 1024 is 8.6 ms, with a 59 ms longest task. React commit `p95` for zoom after rotation is 1.3 ms. Remaining long tasks occur mainly in artwork preview and runtime scheduling after a continuous drawing commit, outside the Canvas main-draw function.

React Profiler is enabled only for the `performance-profile` build when the benchmark URL includes `?moonsprite-perf=1`. The ordinary application build removes the performance Harness at compile time and pays no measurement overhead. Compare `reactCommitP95`, `longestReactCommit`, and `reactByRegion` output only against history from the same machine and profiling build.

## Planned Benchmark Coverage

- Ants-border caching and updates for complex magic-wand selections.
- Continuous drawing with large procedural texture brushes and pressure input.
- Continuous dragging in the palette triangle and color wheel.
- Multi-layer composition, blend modes, and opacity changes.
- 60 Hz/120 Hz frame time and React commit duration on real Windows WebView2.

## Frontend Startup Bundle Size

After the first dynamic-loading pass on 2026-08-01, the production Web build was:

| Item | Before | Current | Change |
| --- | ---: | ---: | ---: |
| Main entry JS | about 722.54 kB | 624.44 kB | reduced by about 98.10 kB |
| Main entry gzip | about 216.55 kB | 188.59 kB | reduced by about 27.96 kB |

Independently loaded modules include `CanvasStage`, `HomeWorkspace`, and `ComponentLibrary`. Before splitting more bundles, measure actual first-screen and project-open load time rather than optimizing chunk count alone.

## Measurement Rules

- Use fixed input data and random seeds.
- Measure algorithm duration, Canvas redraw, and complete pointer-event latency separately.
- The machine baseline records OS, CPU and logical-core count, physical memory, GPU/driver, power plan, Node, and browser versions. Do not declare a historical regression when any stable environment field differs.
- Performance optimization must not change pixel results or interaction contracts.
- Record the reason and date whenever benchmark input, thresholds, or measurement methods change.
- P0/P1 ordinary development runs no performance benchmarks and creates no history entry. Releases run at least P3. Add performance history only for P2-P4 work, explicit performance optimization, regression analysis, and baseline adjustment.
