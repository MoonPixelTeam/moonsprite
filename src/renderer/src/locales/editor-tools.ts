import type { FillKind, LineKind, MoveKind, ShapeKind, ToolId } from '@shared/types-brush'
import type { SelectionKind, SelectionMode } from '@shared/types-selection'
import type { AppLocale } from './contracts'

interface ToolCopy { label: string; description: string }

const zhTools: Record<ToolId, ToolCopy> = {
  'magic-eraser': { label: '魔术橡皮擦', description: '单击清除当前图层中所有同色像素；可设置容差、连续区域与取样范围。' },
  smooth: { label: '平滑笔刷', description: '涂抹修整像素毛刺和细小断点；紫色表示作用范围。' },
  pencil: { label: '铅笔工具', description: '按住拖动绘制像素；按住 Shift 可从上次落点连接直线。' },
  airbrush: { label: '喷枪工具', description: '按住持续喷涂粒子；可调整粒子大小、散布范围、密度和产生频率。' },
  eraser: { label: '橡皮擦工具', description: '按住拖动擦除当前图层中的像素。' },
  selection: { label: '选区工具', description: '创建、组合或变换选区；再次单击可展开选区工具。' },
  move: { label: '移动工具', description: '拖动当前图层、所选图层或选区中的内容。' },
  shape: { label: '形状工具', description: '绘制矩形、椭圆、自由形状或多边形；再次单击可选择形状。' },
  line: { label: '直线工具', description: '拖动创建一条像素直线；按住 Shift 可约束方向。' },
  text: { label: '文本工具', description: '单击画布创建可编辑文本图层；可设置字体、字号、间距和渲染方式。' },
  fill: { label: '油漆桶工具', description: '单击填充连续区域；右键使用背景色。' },
  eyedropper: { label: '吸管工具', description: '单击或拖动读取画布颜色；右键设置背景色。' },
  hand: { label: '抓手工具', description: '按住拖动画布视图，不会修改像素内容。' },
  zoom: { label: '缩放工具', description: '拖动或单击调整视图缩放，右键执行反向缩放。' },
  rotate: { label: '旋转视图工具', description: '围绕旋转指向标拖动，只旋转当前画布视图。' },
  liquify: { label: '液化工具', description: '拖动推动当前栅格层像素；半径和强度可在属性栏调整。' }
}

const enTools: Record<ToolId, ToolCopy> = {
  'magic-eraser': { label: 'Magic Eraser', description: 'Click to erase matching colors on the current layer. Configure tolerance, contiguous regions and sampling.' },
  smooth: { label: 'Smooth Brush', description: 'Brush over pixel edges to clean small irregularities and gaps. Purple marks the affected area.' },
  pencil: { label: 'Pencil Tool', description: 'Drag to draw pixels. Hold Shift to connect a line from the previous point.' },
  airbrush: { label: 'Airbrush Tool', description: 'Hold to spray particles continuously. Adjust particle size, spread, density, and frequency.' },
  eraser: { label: 'Eraser Tool', description: 'Drag to erase pixels from the current layer.' },
  selection: { label: 'Selection Tool', description: 'Create, combine, or transform selections. Click again to open the selection tools.' },
  move: { label: 'Move Tool', description: 'Drag the current layer, selected layers, or selected content.' },
  shape: { label: 'Shape Tool', description: 'Draw rectangles, ellipses, freeform shapes, or polygons. Click again to choose a shape.' },
  line: { label: 'Line Tool', description: 'Drag to create a pixel line. Hold Shift to constrain its direction.' },
  text: { label: 'Text Tool', description: 'Click the canvas to create an editable text layer with font, size, spacing, and rendering controls.' },
  fill: { label: 'Paint Bucket Tool', description: 'Click to fill a contiguous area. Right-click to use the background color.' },
  eyedropper: { label: 'Eyedropper Tool', description: 'Click or drag to sample canvas colors. Right-click to set the background color.' },
  hand: { label: 'Hand Tool', description: 'Drag the canvas view without changing pixel content.' },
  zoom: { label: 'Zoom Tool', description: 'Drag or click to zoom the view. Right-click to zoom in the opposite direction.' },
  rotate: { label: 'Rotate View Tool', description: 'Drag around the rotation indicator to rotate only the current canvas view.' },
  liquify: { label: 'Liquify Tool', description: 'Drag to push pixels on the current raster layer. Adjust radius and strength in the options bar.' }
}

const zhMoves: Record<MoveKind, ToolCopy> = {
  move: zhTools.move,
  slice: { label: '切片工具', description: '拖动创建导出切片；选择已有切片后可移动、缩放并在属性栏命名。' }
}

const enMoves: Record<MoveKind, ToolCopy> = {
  move: enTools.move,
  slice: { label: 'Slice Tool', description: 'Drag to create export slices. Select an existing slice to move, resize, or name it in the options bar.' }
}

const zhLines: Record<LineKind, ToolCopy> = {
  line: zhTools.line,
  curve: { label: '曲线工具', description: '先拖动确定起点和终点，再依次移动两个控制锚点实时调整曲线并单击确认。' }
}

const enLines: Record<LineKind, ToolCopy> = {
  line: enTools.line,
  curve: { label: 'Curve Tool', description: 'Drag to set the endpoints, then move the two control anchors in sequence for a live curve preview and click to confirm.' }
}

const zhFills: Record<FillKind, ToolCopy> = {
  bucket: { label: '油漆桶工具', description: '单击填充连续区域；右键使用背景色。' },
  gradient: { label: '渐变工具', description: '按住拖动创建前景色到背景色的线性渐变；右键反向渐变。' }
}

const enFills: Record<FillKind, ToolCopy> = {
  bucket: { label: 'Paint Bucket Tool', description: 'Click to fill a contiguous area. Right-click to use the background color.' },
  gradient: { label: 'Gradient Tool', description: 'Drag to create a linear foreground-to-background gradient. Right-click reverses it.' }
}

const zhSelections: Record<SelectionKind, ToolCopy> = {
  rectangle: { label: '矩形框选工具', description: '拖动建立矩形选区；按住 Shift 可创建正方形选区。' },
  ellipse: { label: '椭圆框选工具', description: '拖动建立椭圆选区；按住 Shift 可创建圆形选区。' },
  lasso: { label: '套索工具', description: '按住并沿目标边缘自由拖动，松开后闭合选区。' },
  'polygon-lasso': { label: '多边形套索工具', description: '逐点单击建立边界，双击、点击起点或按 Enter 完成。' },
  brush: { label: '选区笔刷', description: '像笔刷一样拖动涂抹，松开后将笔触范围转为选区；支持新建、加选、减选和交集模式。' },
  magic: { label: '魔棒工具', description: '单击选择颜色相近的连续区域，可在属性栏调整容差。' }
}

const enSelections: Record<SelectionKind, ToolCopy> = {
  rectangle: { label: 'Rectangular Selection Tool', description: 'Drag to create a rectangular selection. Hold Shift to create a square.' },
  ellipse: { label: 'Elliptical Selection Tool', description: 'Drag to create an elliptical selection. Hold Shift to create a circle.' },
  lasso: { label: 'Lasso Tool', description: 'Drag freely around the target edge, then release to close the selection.' },
  'polygon-lasso': { label: 'Polygonal Lasso Tool', description: 'Click to add boundary points. Double-click, click the start point, or press Enter to finish.' },
  brush: { label: 'Selection Brush', description: 'Brush over pixels to create a selection when released. Supports replace, add, subtract, and intersect modes.' },
  magic: { label: 'Magic Wand Tool', description: 'Click to select a contiguous area of similar colors. Adjust tolerance in the options bar.' }
}

const zhShapes: Record<ShapeKind, ToolCopy> = {
  'rectangle-outline': { label: '矩形工具', description: '拖动绘制只有描边的矩形。' },
  rectangle: { label: '矩形填充工具', description: '拖动绘制使用前景色填充的矩形。' },
  'ellipse-outline': { label: '椭圆工具', description: '拖动绘制只有描边的椭圆。' },
  ellipse: { label: '椭圆填充工具', description: '拖动绘制使用前景色填充的椭圆。' },
  freeform: { label: '自由形状工具', description: '按住自由绘制闭合边界，松开后使用当前颜色创建填充形状。' },
  polygon: { label: '多边形形状工具', description: '逐点单击创建多边形，双击、点击起点或按 Enter 完成并填充。' }
}

const enShapes: Record<ShapeKind, ToolCopy> = {
  'rectangle-outline': { label: 'Rectangle Tool', description: 'Drag to draw an outlined rectangle.' },
  rectangle: { label: 'Filled Rectangle Tool', description: 'Drag to draw a rectangle filled with the foreground color.' },
  'ellipse-outline': { label: 'Ellipse Tool', description: 'Drag to draw an outlined ellipse.' },
  ellipse: { label: 'Filled Ellipse Tool', description: 'Drag to draw an ellipse filled with the foreground color.' },
  freeform: { label: 'Freeform Shape Tool', description: 'Drag a closed boundary freely, then release to create a filled shape with the current color.' },
  polygon: { label: 'Polygon Shape Tool', description: 'Click to add polygon points. Double-click, click the start point, or press Enter to finish and fill it.' }
}

const localizedToolDescription = (locale: AppLocale, label: string): string => ({
  'zh-CN': `使用${label}。`, 'en-US': `Use ${label}.`, 'ja-JP': `${label}を使用します。`, 'ko-KR': `${label}를 사용합니다.`, 'es-ES': `Usar ${label}.`, 'fr-FR': `Utiliser ${label}.`, 'de-DE': `${label} verwenden.`, 'pt-BR': `Usar ${label}.`, 'ru-RU': `Использовать: ${label}.`
})[locale]
const localizedCopies = <T extends string>(base: Record<T, ToolCopy>, labels: Partial<Record<T, string>>, locale: AppLocale): Record<T, ToolCopy> => Object.fromEntries((Object.entries(base) as Array<[T, ToolCopy]>).map(([id, copy]) => {
  const label = labels[id as T] ?? copy.label
  return [id, { label, description: localizedToolDescription(locale, label) }]
})) as Record<T, ToolCopy>

const jaTools = localizedCopies(enTools, { pencil: '鉛筆ツール', airbrush: 'エアブラシツール', eraser: '消しゴムツール', selection: '選択ツール', move: '移動ツール', shape: '図形ツール', line: '直線ツール', text: 'テキストツール', fill: '塗りつぶしツール', eyedropper: 'スポイトツール', hand: '手のひらツール', zoom: 'ズームツール', rotate: 'ビュー回転ツール', liquify: 'ゆがみツール' }, 'ja-JP')
const koTools = localizedCopies(enTools, { pencil: '연필 도구', airbrush: '에어브러시 도구', eraser: '지우개 도구', selection: '선택 도구', move: '이동 도구', shape: '도형 도구', line: '직선 도구', text: '텍스트 도구', fill: '페인트 통 도구', eyedropper: '스포이트 도구', hand: '손 도구', zoom: '확대/축소 도구', rotate: '보기 회전 도구', liquify: '픽셀 유동화 도구' }, 'ko-KR')
const esTools = localizedCopies(enTools, { pencil: 'Herramienta lápiz', airbrush: 'Herramienta aerógrafo', eraser: 'Herramienta borrador', selection: 'Herramienta selección', move: 'Herramienta mover', shape: 'Herramienta formas', line: 'Herramienta línea', text: 'Herramienta texto', fill: 'Bote de pintura', eyedropper: 'Cuentagotas', hand: 'Herramienta mano', zoom: 'Herramienta zoom', rotate: 'Rotar vista', liquify: 'Herramienta Licuar' }, 'es-ES')
const frTools = localizedCopies(enTools, { pencil: 'Outil crayon', airbrush: 'Aérographe', eraser: 'Gomme', selection: 'Outil de sélection', move: 'Outil déplacement', shape: 'Outil forme', line: 'Outil ligne', text: 'Outil texte', fill: 'Pot de peinture', eyedropper: 'Pipette', hand: 'Main', zoom: 'Zoom', rotate: 'Rotation de la vue', liquify: 'Outil Fluidité' }, 'fr-FR')
const deTools = localizedCopies(enTools, { pencil: 'Bleistift', airbrush: 'Airbrush', eraser: 'Radierer', selection: 'Auswahlwerkzeug', move: 'Verschieben', shape: 'Formwerkzeug', line: 'Linie', text: 'Textwerkzeug', fill: 'Füllwerkzeug', eyedropper: 'Pipette', hand: 'Hand', zoom: 'Zoom', rotate: 'Ansicht drehen', liquify: 'Verflüssigen' }, 'de-DE')
const ptTools = localizedCopies(enTools, { pencil: 'Ferramenta lápis', airbrush: 'Aerógrafo', eraser: 'Borracha', selection: 'Ferramenta de seleção', move: 'Ferramenta mover', shape: 'Ferramenta forma', line: 'Ferramenta linha', text: 'Ferramenta texto', fill: 'Balde de tinta', eyedropper: 'Conta-gotas', hand: 'Mão', zoom: 'Zoom', rotate: 'Girar visualização', liquify: 'Ferramenta Dissolver' }, 'pt-BR')
const ruTools = localizedCopies(enTools, { pencil: 'Карандаш', airbrush: 'Аэрограф', eraser: 'Ластик', selection: 'Выделение', move: 'Перемещение', shape: 'Фигуры', line: 'Линия', text: 'Текст', fill: 'Заливка', eyedropper: 'Пипетка', hand: 'Рука', zoom: 'Масштаб', rotate: 'Поворот вида', liquify: 'Пластика' }, 'ru-RU')

const jaMoves = localizedCopies(enMoves, { move: '移動ツール', slice: 'スライスツール' }, 'ja-JP'); const koMoves = localizedCopies(enMoves, { move: '이동 도구', slice: '슬라이스 도구' }, 'ko-KR'); const esMoves = localizedCopies(enMoves, { move: 'Mover', slice: 'Cortar' }, 'es-ES'); const frMoves = localizedCopies(enMoves, { move: 'Déplacement', slice: 'Tranche' }, 'fr-FR'); const deMoves = localizedCopies(enMoves, { move: 'Verschieben', slice: 'Slice' }, 'de-DE'); const ptMoves = localizedCopies(enMoves, { move: 'Mover', slice: 'Fatia' }, 'pt-BR'); const ruMoves = localizedCopies(enMoves, { move: 'Перемещение', slice: 'Срез' }, 'ru-RU')
const jaLines = localizedCopies(enLines, { line: '直線ツール', curve: '曲線ツール' }, 'ja-JP'); const koLines = localizedCopies(enLines, { line: '직선 도구', curve: '곡선 도구' }, 'ko-KR'); const esLines = localizedCopies(enLines, { line: 'Línea', curve: 'Curva' }, 'es-ES'); const frLines = localizedCopies(enLines, { line: 'Ligne', curve: 'Courbe' }, 'fr-FR'); const deLines = localizedCopies(enLines, { line: 'Linie', curve: 'Kurve' }, 'de-DE'); const ptLines = localizedCopies(enLines, { line: 'Linha', curve: 'Curva' }, 'pt-BR'); const ruLines = localizedCopies(enLines, { line: 'Линия', curve: 'Кривая' }, 'ru-RU')
const jaFills = localizedCopies(enFills, { bucket: '塗りつぶし', gradient: 'グラデーション' }, 'ja-JP'); const koFills = localizedCopies(enFills, { bucket: '페인트 통', gradient: '그라디언트' }, 'ko-KR'); const esFills = localizedCopies(enFills, { bucket: 'Bote de pintura', gradient: 'Degradado' }, 'es-ES'); const frFills = localizedCopies(enFills, { bucket: 'Pot de peinture', gradient: 'Dégradé' }, 'fr-FR'); const deFills = localizedCopies(enFills, { bucket: 'Fülleimer', gradient: 'Verlauf' }, 'de-DE'); const ptFills = localizedCopies(enFills, { bucket: 'Balde de tinta', gradient: 'Gradiente' }, 'pt-BR'); const ruFills = localizedCopies(enFills, { bucket: 'Заливка', gradient: 'Градиент' }, 'ru-RU')

export const editorToolCopyByLocale: Record<AppLocale, Record<ToolId, ToolCopy>> = {
  'zh-CN': zhTools,
  'en-US': enTools,
  'ja-JP': jaTools,
  'ko-KR': koTools,
  'es-ES': esTools,
  'fr-FR': frTools,
  'de-DE': deTools,
  'pt-BR': ptTools,
  'ru-RU': ruTools
}
export const moveToolCopyByLocale: Record<AppLocale, Record<MoveKind, ToolCopy>> = {
  'zh-CN': zhMoves,
  'en-US': enMoves,
  'ja-JP': jaMoves,
  'ko-KR': koMoves,
  'es-ES': esMoves,
  'fr-FR': frMoves,
  'de-DE': deMoves,
  'pt-BR': ptMoves,
  'ru-RU': ruMoves
}
export const lineToolCopyByLocale: Record<AppLocale, Record<LineKind, ToolCopy>> = {
  'zh-CN': zhLines,
  'en-US': enLines,
  'ja-JP': jaLines,
  'ko-KR': koLines,
  'es-ES': esLines,
  'fr-FR': frLines,
  'de-DE': deLines,
  'pt-BR': ptLines,
  'ru-RU': ruLines
}
export const selectionToolCopyByLocale: Record<AppLocale, Record<SelectionKind, ToolCopy>> = {
  'zh-CN': zhSelections,
  'en-US': enSelections,
  'ja-JP': localizedCopies(enSelections, { rectangle: '長方形選択', ellipse: '楕円選択', lasso: 'なげなわ', 'polygon-lasso': '多角形なげなわ', brush: '選択ブラシ', magic: '自動選択' }, 'ja-JP'),
  'ko-KR': localizedCopies(enSelections, { rectangle: '사각형 선택', ellipse: '타원 선택', lasso: '올가미', 'polygon-lasso': '다각형 올가미', brush: '선택 브러시', magic: '자동 선택' }, 'ko-KR'),
  'es-ES': localizedCopies(enSelections, { rectangle: 'Selección rectangular', ellipse: 'Selección elíptica', lasso: 'Lazo', 'polygon-lasso': 'Lazo poligonal', brush: 'Pincel de selección', magic: 'Varita mágica' }, 'es-ES'),
  'fr-FR': localizedCopies(enSelections, { rectangle: 'Sélection rectangulaire', ellipse: 'Sélection elliptique', lasso: 'Lasso', 'polygon-lasso': 'Lasso polygonal', brush: 'Pinceau de sélection', magic: 'Baguette magique' }, 'fr-FR'),
  'de-DE': localizedCopies(enSelections, { rectangle: 'Rechteckauswahl', ellipse: 'Ellipsenauswahl', lasso: 'Lasso', 'polygon-lasso': 'Polygon-Lasso', brush: 'Auswahlpinsel', magic: 'Zauberstab' }, 'de-DE'),
  'pt-BR': localizedCopies(enSelections, { rectangle: 'Seleção retangular', ellipse: 'Seleção elíptica', lasso: 'Laço', 'polygon-lasso': 'Laço poligonal', brush: 'Pincel de seleção', magic: 'Varinha mágica' }, 'pt-BR'),
  'ru-RU': localizedCopies(enSelections, { rectangle: 'Прямоугольное выделение', ellipse: 'Эллиптическое выделение', lasso: 'Лассо', 'polygon-lasso': 'Многоугольное лассо', brush: 'Кисть выделения', magic: 'Волшебная палочка' }, 'ru-RU')
}
export const shapeToolCopyByLocale: Record<AppLocale, Record<ShapeKind, ToolCopy>> = {
  'zh-CN': zhShapes,
  'en-US': enShapes,
  'ja-JP': localizedCopies(enShapes, { 'rectangle-outline': '長方形', rectangle: '塗りつぶし長方形', 'ellipse-outline': '楕円', ellipse: '塗りつぶし楕円', freeform: '自由形状', polygon: '多角形' }, 'ja-JP'),
  'ko-KR': localizedCopies(enShapes, { 'rectangle-outline': '사각형', rectangle: '채운 사각형', 'ellipse-outline': '타원', ellipse: '채운 타원', freeform: '자유 도형', polygon: '다각형' }, 'ko-KR'),
  'es-ES': localizedCopies(enShapes, { 'rectangle-outline': 'Rectángulo', rectangle: 'Rectángulo relleno', 'ellipse-outline': 'Elipse', ellipse: 'Elipse rellena', freeform: 'Forma libre', polygon: 'Polígono' }, 'es-ES'),
  'fr-FR': localizedCopies(enShapes, { 'rectangle-outline': 'Rectangle', rectangle: 'Rectangle plein', 'ellipse-outline': 'Ellipse', ellipse: 'Ellipse pleine', freeform: 'Forme libre', polygon: 'Polygone' }, 'fr-FR'),
  'de-DE': localizedCopies(enShapes, { 'rectangle-outline': 'Rechteck', rectangle: 'Gefülltes Rechteck', 'ellipse-outline': 'Ellipse', ellipse: 'Gefüllte Ellipse', freeform: 'Freie Form', polygon: 'Polygon' }, 'de-DE'),
  'pt-BR': localizedCopies(enShapes, { 'rectangle-outline': 'Retângulo', rectangle: 'Retângulo preenchido', 'ellipse-outline': 'Elipse', ellipse: 'Elipse preenchida', freeform: 'Forma livre', polygon: 'Polígono' }, 'pt-BR'),
  'ru-RU': localizedCopies(enShapes, { 'rectangle-outline': 'Прямоугольник', rectangle: 'Залитый прямоугольник', 'ellipse-outline': 'Эллипс', ellipse: 'Залитый эллипс', freeform: 'Свободная форма', polygon: 'Многоугольник' }, 'ru-RU')
}
export const fillToolCopyByLocale: Record<AppLocale, Record<FillKind, ToolCopy>> = {
  'zh-CN': zhFills,
  'en-US': enFills,
  'ja-JP': jaFills,
  'ko-KR': koFills,
  'es-ES': esFills,
  'fr-FR': frFills,
  'de-DE': deFills,
  'pt-BR': ptFills,
  'ru-RU': ruFills
}
export const selectionModeLabelsByLocale: Record<AppLocale, Record<SelectionMode, string>> = {
  'zh-CN': { replace: '新建', add: '加选', subtract: '减选', intersect: '交集' },
  'en-US': { replace: 'Replace', add: 'Add', subtract: 'Subtract', intersect: 'Intersect' },
  'ja-JP': { replace: '置換', add: '追加', subtract: '削除', intersect: '交差' },
  'ko-KR': { replace: '바꾸기', add: '추가', subtract: '빼기', intersect: '교차' },
  'es-ES': { replace: 'Reemplazar', add: 'Añadir', subtract: 'Restar', intersect: 'Intersecar' },
  'fr-FR': { replace: 'Remplacer', add: 'Ajouter', subtract: 'Soustraire', intersect: 'Intersection' },
  'de-DE': { replace: 'Ersetzen', add: 'Hinzufügen', subtract: 'Subtrahieren', intersect: 'Schnittmenge' },
  'pt-BR': { replace: 'Substituir', add: 'Adicionar', subtract: 'Subtrair', intersect: 'Interseção' },
  'ru-RU': { replace: 'Заменить', add: 'Добавить', subtract: 'Вычесть', intersect: 'Пересечение' }
}
