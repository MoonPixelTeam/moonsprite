/** Canvas touch cannot own a document gesture in stylus-only tablet mode. */
export function acceptsTabletCanvasPointer(pointerType: string, tablet: boolean): boolean {
  return !tablet || pointerType !== 'touch'
}
