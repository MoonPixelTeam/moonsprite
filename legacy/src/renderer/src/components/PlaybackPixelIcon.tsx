const playbackIconPaths = {
  first: 'M2 2v6h1V2zM7 2h2v1H7zM6 3h3v1H6zM5 4h4v2H5zM6 6h3v1H6zM7 7h2v1H7z',
  previous: 'M5 2h2v1H5zM8 2v6h1V2zM4 3h3v1H4zM3 4h4v2H3zM4 6h3v1H4zM5 7h2v1H5z',
  play: 'M3 2h2v1H3zM3 3h3v1H3zM3 4h4v2H3zM3 6h3v1H3zM3 7h2v1H3z',
  pause: 'M2 2h6v6H2z',
  next: 'M2 2v6h1V2zM4 2h2v1H4zM4 3h3v1H4zM4 4h4v2H4zM4 6h3v1H4zM4 7h2v1H4z',
  last: 'M2 2h2v1H2zM8 2v6h1V2zM2 3h3v1H2zM2 4h4v2H2zM2 6h3v1H2zM2 7h2v1H2z'
} as const

export type PlaybackPixelIconKind = keyof typeof playbackIconPaths

export function PlaybackPixelIcon({ kind }: { kind: PlaybackPixelIconKind }) {
  return <svg className="pixel-playback-icon" width="22" height="22" viewBox="0 0 11 11" shapeRendering="crispEdges" aria-hidden="true"><path fill="currentColor" d={playbackIconPaths[kind]} /></svg>
}
