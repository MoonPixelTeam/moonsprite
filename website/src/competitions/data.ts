import type { Language } from '../content'
type Text = Record<Language, string>
export type CompetitionWork = { id: string; image: string; title: Text; award: 'gold' | 'silver' | 'selection'; featured: boolean }
export const competition = {
  id: 'moonlit-worlds-2026',
  title: { zh: '月下奇想', en: 'Worlds under the moon' },
  subtitle: { zh: 'MoonSprite 像素创作赛 · 2026', en: 'MoonSprite Pixel Art Competition · 2026' },
  theme: { zh: '用有限的像素，描绘一个值得停留的世界。', en: 'Build a world worth staying in, one pixel at a time.' },
  dates: { zh: '2026.08.01 — 2026.08.31', en: 'Aug 1 — Aug 31, 2026' },
  status: 'completed',
  demo: true,
  cover: '/assets/hero/home-banner-coast.png',
} as const
// Demonstration event using existing site artwork. Replace this collection for a real event.
export const competitionWorks: CompetitionWork[] = [
  { id: 'lunar-base', image: '/assets/hero/hero-1.png', title: { zh: '月面基地', en: 'Lunar base' }, award: 'gold', featured: true },
  { id: 'green-cliffs', image: '/assets/hero/hero-2.png', title: { zh: '绿崖彗星', en: 'Comet over green cliffs' }, award: 'silver', featured: true },
  { id: 'hilltop-castle', image: '/assets/hero/hero-3.png', title: { zh: '山丘城堡', en: 'Hilltop castle' }, award: 'silver', featured: true },
  { id: 'moonlit-path', image: '/assets/hero/hero-4.png', title: { zh: '月光林道', en: 'Moonlit path' }, award: 'selection', featured: true },
  { id: 'cloud-tower', image: '/assets/hero/hero-5.png', title: { zh: '云中红塔', en: 'Tower in the clouds' }, award: 'selection', featured: true },
  { id: 'prairie-storm', image: '/assets/hero/hero-6.png', title: { zh: '草原雷暴', en: 'Prairie storm' }, award: 'selection', featured: true },
]
export const awardLabels: Record<CompetitionWork['award'], Text> = {
  gold: { zh: '金奖', en: 'Gold' }, silver: { zh: '银奖', en: 'Silver' }, selection: { zh: '入选作品', en: 'Official selection' },
}
