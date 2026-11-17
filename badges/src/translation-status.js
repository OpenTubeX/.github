import { widgetThemes } from './widget-theme.js'
import { text, icon } from './render.js'

export const weblateUrl = 'https://hosted.weblate.org/api/components/opentubex/application/statistics/'

const columns = 4
const cellWidth = 166
const cellHeight = 22
const rowPitch = 27
// Shorten Weblate's longest names so they fit a cell.
const abbreviations = [[' Han script', ''], ['United Kingdom', 'UK'], ['United States', 'US']]
const gridTop = 92

const isCount = value => Number.isSafeInteger(value) && value >= 0

// Hosted Weblate allows 100 anonymous API requests per day and IP, which Workers
// share with other customers. Set WEBLATE_TOKEN to a Hosted Weblate API key to
// raise that limit.
export async function translationStatus(env, fetch) {
  const languages = []
  for (let url = weblateUrl, page = 0; url; page++) {
    if (page === 10 || !url.startsWith(weblateUrl)) throw new Error('Invalid Weblate pagination')
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'opentubex-badges',
        ...(env.WEBLATE_TOKEN ? { Authorization: `Token ${env.WEBLATE_TOKEN}` } : {})
      },
      signal: AbortSignal.timeout(10000)
    })
    if (!response.ok) throw new Error(`Weblate status ${response.status}`)
    const data = await response.json()
    if (!Array.isArray(data?.results) || (data.next !== null && typeof data.next !== 'string')) throw new Error('Invalid Weblate statistics')
    for (const { name, total, translated } of data.results) {
      if (typeof name !== 'string' || !name || name.length > 64 || !isCount(total) || !isCount(translated) || translated > total) {
        throw new Error('Invalid Weblate statistics')
      }
      languages.push({ name, total, translated })
    }
    url = data.next
  }
  if (!languages.length) throw new Error('No Weblate languages')
  return languages.sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

// Round down like Weblate, so an almost finished language never shows 100%.
const percent = (translated, total) => total ? Math.floor(translated / total * 100) : 0

function fit(value, maxWidth, size, weight) {
  if (text(value, 0, 0, size, weight).width <= maxWidth) return value
  let shortened = value
  while (shortened && text(`${shortened.trimEnd()}…`, 0, 0, size, weight).width > maxWidth) shortened = shortened.slice(0, -1)
  return `${shortened.trimEnd()}…`
}

export function renderTranslationStatus(languages, theme = 'dark') {
  const palette = widgetThemes[theme]
  const label = (value, x, y, size = 13, weight = 'Medium', color = palette.muted) => text(value, x, y, size, weight, color).svg
  const strings = languages ? Math.max(...languages.map(language => language.total)) : 0
  const overall = languages ? percent(languages.reduce((sum, { translated }) => sum + translated, 0), languages.reduce((sum, { total }) => sum + total, 0)) : 0
  const title = languages ? `Translation status: ${overall}% translated into ${languages.length} languages` : 'Translation status: Unavailable'
  let content = icon('translate', 26, 24, palette.accent, 22) + label('Translations', 60, 43, 21, 'SemiBold', palette.foreground)
  content += label(languages ? `${strings.toLocaleString('en-US')} strings in ${languages.length} languages on Hosted Weblate` : 'Hosted Weblate', 26, 70)
  const count = languages ? `${overall}% translated` : 'Unavailable'
  const countText = text(count, 0, 0, 16, 'SemiBold', palette.countText)
  content += `<rect x="${690 - countText.width}" y="24" width="${countText.width + 24}" height="34" rx="10" fill="${palette.countBackground}"/>`
  content += label(count, 702 - countText.width, 46, 16, 'SemiBold', palette.countText)
  let height = 132
  if (languages) {
    languages.forEach(({ name, total, translated }, index) => {
      const x = 26 + (index % columns) * (cellWidth + 8)
      const y = gridTop + Math.floor(index / columns) * rowPitch
      const value = `${percent(translated, total)}%`
      const valueWidth = text(value, 0, 0, 11, 'Medium').width
      const progress = total ? translated / total * cellWidth : 0
      const shape = `x="${x}" y="${y}" width="${cellWidth}" height="${cellHeight}" rx="6"`
      content += `<clipPath id="cell${index}"><rect ${shape}/></clipPath><rect ${shape} fill="${palette.cell}"/>`
      if (progress) content += `<rect x="${x}" y="${y}" width="${progress.toFixed(2)}" height="${cellHeight}" fill="${palette.accent}" fill-opacity=".3" clip-path="url(#cell${index})"/>`
      content += `<rect x="${x + .5}" y="${y + .5}" width="${cellWidth - 1}" height="${cellHeight - 1}" rx="5.5" fill="none" stroke="${palette.border}" stroke-opacity=".8"/>`
      const shortName = abbreviations.reduce((result, [long, short]) => result.replace(long, short), name)
      content += label(fit(shortName, cellWidth - valueWidth - 20, 12, 'Medium'), x + 8, y + 15, 12, 'Medium', palette.foreground)
      content += label(value, x + cellWidth - 8 - valueWidth, y + 15, 11)
    })
    height = gridTop + Math.ceil(languages.length / columns) * rowPitch - rowPitch + cellHeight + 26
  } else {
    content += label('Translation status is temporarily unavailable', 26, 108, 15)
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="${height}" viewBox="0 0 740 ${height}" role="img" aria-label="${title}"><title>${title}</title><desc>Share of source strings translated into each language on Hosted Weblate.</desc><defs><linearGradient id="ocean" x2="1" y2="1"><stop stop-color="${palette.backgroundStart}"/><stop offset="1" stop-color="${palette.backgroundEnd}"/></linearGradient></defs><rect x=".5" y=".5" width="739" height="${height - 1}" rx="12" fill="url(#ocean)" stroke="${palette.border}" stroke-opacity=".65"/>${content}</svg>`
}
