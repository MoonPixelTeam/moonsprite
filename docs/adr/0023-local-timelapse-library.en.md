# ADR 0023: Store timelapse frames in a local immutable chunk library

English | [中文](0023-local-timelapse-library.md)

## Status

Accepted for project format v20.

## Context

Logs with 4666–4718 frames show repeated transfers of about 365–370 MB during recovery saves and main-thread tasks of about 236–326 ms. Immutable recordings should not be copied and rewritten with every save.

## Decision

- Desktop recordings share the application-data `timelapse-v1` root; Windows defaults to `%APPDATA%/art.moonpx.moonsprite/timelapse-v1`. Each live document writes under a distinct UUID; copies may share existing immutable references.
- Append PNGs to chunks of at most 64 MiB, with a 32 MiB frame limit. Return byte ranges and CRC32 only after syncing bytes, then release frontend PNG bytes. Native IO runs in blocking worker tasks.
- Project and recovery manifests store ordered frame metadata and references. New processes use new chunks without truncating old tails. Validate paths, ranges and checksums when reading. Unreferenced tails are not replayed automatically.
- Migrate legacy embedded PNGs on demand; browsers without the native bridge retain embedded storage. Failed writes retain bytes, explicit flushes retry, and errors reach the UI and diagnostics. Prepared frame queues exceeding 64 MiB pause new recording with a visible message while retaining prior frames.
- Ordinary saves do not hydrate historical PNGs. Playback and export load individual frames. Save As with “Include timelapse recording” explicitly embeds all recording bytes while retaining the live document's references.

## Consequences and limitations

Ordinary files retain complete artwork, but local recordings require the original library. Include recordings when sharing or moving computers. Missing libraries allow artwork to open but cause playback and packing errors. Older readers do not support v20.

Portable packing can still require substantial memory and time; initial legacy migration needs a one-time write. Recovery covers the last successfully saved manifest, not references created since that checkpoint. No automatic deletion or garbage collection is implemented, protecting references held by old projects and backups; disk use grows with recordings. Custom directories, cleanup UI and separate per-stroke capture preparation optimization are outside this implementation.
