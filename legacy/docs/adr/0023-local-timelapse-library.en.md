# ADR 0023: Store timelapse frames in a local immutable chunk library

English | [中文](0023-local-timelapse-library.md)

## Status

Accepted for project format v20.

## Context

Logs with 4666–4718 frames show repeated transfers of about 365–370 MB during recovery saves and main-thread tasks of about 236–326 ms. Immutable recordings should not be copied and rewritten with every save.

## Decision

- New recordings use `timelapse-v1` beside the executable, independently of the working directory. Missing chunks fall back to the legacy application-data library without moving or deleting old data. Corruption and access errors do not silently fall back; write errors include the destination path. Each live document writes under a distinct UUID; copies may share existing immutable references.
- Append PNGs to chunks of at most 64 MiB, with a 32 MiB frame limit. Return byte ranges and CRC32 only after syncing bytes, then release frontend PNG bytes. Native IO runs in blocking worker tasks.
- Project and recovery manifests store ordered frame metadata and references. New processes use new chunks without truncating old tails. Validate paths, ranges and checksums when reading. Unreferenced tails are not replayed automatically.
- Migrate legacy embedded PNGs on demand; browsers without the native bridge retain embedded storage. Failed writes retain bytes, explicit flushes retry, and errors reach the UI and diagnostics. Prepared frame queues exceeding 64 MiB pause new recording with a visible message while retaining prior frames.
- Ordinary saves do not hydrate historical PNGs. Playback and export load individual frames. Save As with “Include timelapse recording” explicitly embeds all recording bytes while retaining the live document's references.

- Downscaled capture composites only the required output sample points, avoiding a source-size intermediate image. Operation boundaries freeze changed 64×64 pixel tiles while queued frames share unchanged immutable tiles. Full-frame assembly and PNG encoding run in the worker, with main-thread fallback when unavailable or failed. The queue conservatively budgets full-frame sizes; worker message cloning still has main-thread costs.

## Consequences and limitations

Ordinary files retain complete artwork, but local recordings require the original library. Include recordings when sharing or moving computers. Missing libraries allow artwork to open but cause playback and packing errors. Older readers do not support v20.

Portable packing can still require substantial memory and time; initial legacy migration needs a one-time write. Recovery covers the last successfully saved manifest, not references created since that checkpoint. No automatic deletion or garbage collection is implemented, protecting references held by old projects and backups; disk use grows with recordings. Old recordings may still depend on the legacy application-data directory; pack recordings before moving the application. Custom directories and cleanup UI are not implemented.
