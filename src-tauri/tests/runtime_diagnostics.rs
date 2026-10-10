// Exercise the actual file writer without launching a desktop application.
#[allow(dead_code)]
#[path = "../src/platform_diagnostics.rs"]
mod platform_diagnostics;
#[allow(dead_code)]
#[path = "../src/platform_browser_trace.rs"]
mod platform_browser_trace;

use platform_diagnostics::runtime_version_detail;
use platform_diagnostics::{claim_visibility_intervention, visibility_probe_detail};
use std::sync::atomic::AtomicBool;

// A successful lookup must land in `runtimeVersion` and leave the error null.
#[test]
fn runtime_version_detail_reports_resolved_value() {
    let detail = runtime_version_detail(&Ok("155.0.4283.45".to_string()));
    assert_eq!(detail["runtimeVersion"], "155.0.4283.45");
    assert!(detail["runtimeVersionError"].is_null());
}

// A failed lookup must not vanish: the reason is kept as text so a session
// without a version is still distinguishable from one that never ran.
#[test]
fn runtime_version_detail_keeps_failure_reason() {
    let detail = runtime_version_detail(&Err("no runtime".to_string()));
    assert!(detail["runtimeVersion"].is_null());
    assert_eq!(detail["runtimeVersionError"], "no runtime");
}

// Hiding the WebView is the withholding half of the pair; the log must say so,
// and must record the state the controller actually settled into rather than the
// state that was requested.
#[test]
fn visibility_probe_names_each_half_and_flags_a_refused_change() {
    let withheld = visibility_probe_detail(false, false, Some(false));
    assert_eq!(withheld["role"], "withhold");
    assert_eq!(withheld["applied"], true);
    assert_eq!(withheld["prior"], false);

    let restored = visibility_probe_detail(true, true, Some(false));
    assert_eq!(restored["role"], "restore");
    assert_eq!(restored["applied"], true);
    assert_eq!(restored["prior"], false);

    let refused = visibility_probe_detail(false, true, Some(true));
    assert_eq!(refused["applied"], false);
    assert_eq!(refused["observed"], true);
}

// One false/true pair per session: a repeat would overlap the first toggle and
// make both traces unattributable. A dispatch that failed before changing
// anything must give the claim back.
#[test]
fn visibility_intervention_is_claimed_once_and_released_on_failure() {
    let consumed = AtomicBool::new(false);
    assert!(claim_visibility_intervention(&consumed).is_ok());
    assert!(claim_visibility_intervention(&consumed).is_err());

    // The failure path stores the flag back to false, which must re-enable the
    // single allowance.
    consumed.store(false, std::sync::atomic::Ordering::Release);
    assert!(claim_visibility_intervention(&consumed).is_ok());
}
