# Linked Paint movement / static Cut / gradient late-move cancellation — 2026-10-25

Same-layer explicit linkedCelId chains now support Paint cell move/copy through their resolved canonical full-grid owner. Selected owner or leaf activity and exact link topology remain intact, using existing offset cell layout history and shared cache/thumbnail invalidation. RuntimeShared, private linked surfaces and layer/group aliases remain gated. Save/reopen exercises the complete offset grid including invisible texels.

Static Paint Cut reads the resolved pixels and mask, then completes selection while legacy Paint pixel deletion stays refused. Locked Cut still copies and completes selection; transparent Cut clears the image clipboard and completes selection. No pixel edit or history entry is created. Other linked pixel Cut modes remain gated. Legacy linked-layers.ts:23,95 and animation-cel-resolver-cache.ts:30 reject cross-layer tilemap association; this is an unsupported legacy domain, not a migration gap. Earlier batch reports describing it as a remaining migration gap are corrected by this finding.

The reachable gradient stop editor now cancels a late native no-button move just as GradientStopsEditor.tsx:105 does: clear drag and pending deletion, release capture, retain already moved values. No geometry or threshold change. Actual dialog checks cover a clicked stop, moved stop with pending deletion, ignored later moves and normal pressed removal. Existing color editor verification remains in place.

Source registration and actual behavior validation are separate. Build/test results will be recorded after execution. Full legacy alignment remains incomplete.


Validation: serial core build 86220 exited 0. Initial tilemap-document executable exited -1073741571 (0xC00000FD) because adding a large Document fixture enlarged the existing main stack. Only the new fixture was moved into a separate noinline function; production stack/settings were unchanged. Target rebuild 48814 exited 0. Actual tilemap-document and tilemap-project executables each exited 0. This checks owner/leaf chains, zero/negative origin, transformed and null refs, repeated previews, Escape, Undo/Redo, keyboard clamp, locks/visibility, runtime-alias refusal and exact save/reopen cache/topology.

Official serial build 28881 exited 0. Actual UI process 34472 exited 1 at the transparent Cut assertion: PixelClipboard.clear clears its internal image, while read can still retrieve the preceding OS image. The fixture now uses the existing smoke reader override only for that internal-clear assertion, restoring it immediately; no product clipboard behavior changed. Incremental official build 39186 exited 0. Actual UI process 37700 exited 0 with --workspace-check --named-workspace-only --linked-gradient-cancel-only. It verifies real linked-leaf move/copy/Cancel/Undo, all chain views and stamps, existing linked flip commands, CtrlC/Delete/CtrlX/menu Cut, transparent internal clipboard clearing, and the actual gradient editor's stale no-button cancellation, retained moved position, cleared pending deletion and normal pressed removal. Existing gradient color editor interactions also passed.

Provenance coverage 483 files exited 0; strict exited 1 and remains INCOMPLETE. Scoped diff check exited 0. These document checks are separate from actual executable acceptance. Runtime-shared/private-surface/layer/group alias movement and other linked pixel Cut modes remain gated; no screenshot/DPI acceptance or full migration claim. Earlier linked-movement gap notes are superseded only for this batch's explicit same-layer chain domain.

Evidence: native/build/linked-gradient-final-20261025.json. Formal executable SHA256 01FD8D162F9E29CDDF48FBEF3D0B50F3D68A3EAB96A4809AC11A85FDCE35B1DF. Prior official process 35792 closed normally before rebuilding; no process was force-killed.

Original native/start-native.bat exited 0; formal PID 37348 Responding=True. No checks or builds followed launch.
