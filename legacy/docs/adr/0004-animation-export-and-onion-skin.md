# ADR-0004: Animation Export And Onion Skin

[中文](0004-animation-export-and-onion-skin.zh-CN.md) | English

## Status

Accepted

## Context

Animation preview assistance must not mutate the active document or enter the
document undo history. GIF export also needs deterministic frame selection,
direction ordering, per-frame duration, and a format implementation that does
not depend on a browser-only download API or an untracked binary dependency.

## Decision

- Onion skin settings are persisted as editor preferences and are rendered from
  adjacent animation cels into independent cached surfaces.
- Onion skin never changes layer pixels, active cel data, document history, or
  the serialized project schema.
- GIF export uses a small in-repo GIF89a encoder. It reserves palette index 0
  for transparent pixels, preserves up to 255 exact opaque colors, and falls
  back to a deterministic 6x6x6 RGB cube when the animation exceeds that
  palette size.
- Export frame ranges are one-based in the UI and clamped to the timeline.
  Direction expansion happens after range selection and before encoding.

## Consequences

GIF output is deterministic and works in the desktop renderer without adding a
runtime package. GIF is limited to indexed color and binary transparency, so
semi-transparent pixels are thresholded during export. Onion skin can add
rendering work, but only while enabled and its surfaces are invalidated by the
document revision or preference changes.
