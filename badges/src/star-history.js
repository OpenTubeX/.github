import { text, icon } from './render.js'

export function starAxisTicks(total) {
  const targetStep = Math.max(1, total / 6)
  const magnitude = 10 ** Math.floor(Math.log10(targetStep))
  const step = [1, 2, 5, 10].find(value => value * magnitude >= targetStep) * magnitude
  const intervals = Math.max(1, Math.ceil(total / step))
  return Array.from({ length: intervals + 1 }, (_, index) => index * step)
}

export function renderStarHistory(points) {
  const total = points?.at(-1)?.count ?? 0
  const title = points ? `Star history: ${total} stars on OpenTubeX/OpenTubeX` : 'Star history: Unavailable'
  const label = (value, x, y, size = 13, weight = 'Medium', color = '#D5E8E4') => text(value, x, y, size, weight, color).svg
  let content = icon('star', 26, 24, '#89DED2', 22) + label('Star history', 60, 43, 21, 'SemiBold', '#E8F2F0')
  content += label('OpenTubeX / OpenTubeX', 26, 70)
  const count = points ? `${total.toLocaleString('en-US')} stars` : 'Unavailable'
  const countText = text(count, 0, 0, 16, 'SemiBold', '#0B3D3E')
  content += `<rect x="${690 - countText.width}" y="24" width="${countText.width + 24}" height="34" rx="10" fill="#D5E8E4"/>`
  content += label(count, 702 - countText.width, 46, 16, 'SemiBold', '#0B3D3E')
  if (points?.length) {
    const start = points[0].time
    const end = Math.max(points.at(-1).time, start + 604800000)
    const ticks = starAxisTicks(total)
    const ceiling = ticks.at(-1)
    const x = time => 66 + (time - start) / (end - start) * 620
    const y = count => 290 - count / ceiling * 184
    for (const value of ticks) {
      content += `<path d="M66 ${y(value)}H686" stroke="#A9CEC7" stroke-opacity=".18"/>`
      const tickLabel = value.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 1 })
      content += label(tickLabel, 54 - text(tickLabel, 0, 0, 12).width, y(value) + 4, 12)
    }
    const coordinates = points.map(point => `${x(point.time).toFixed(2)} ${y(point.count).toFixed(2)}`)
    const line = `M${coordinates.join(' L')}`
    content += `<path d="${line} L${x(points.at(-1).time)} 290 H66 Z" fill="url(#area)"/>`
    content += `<path d="${line}" fill="none" stroke="#89DED2" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`
    content += `<circle cx="${x(points.at(-1).time)}" cy="${y(total)}" r="4" fill="#E8F2F0" stroke="#89DED2" stroke-width="2"/>`
    for (let i = 0; i <= 3; i++) {
      const time = start + (end - start) * i / 3
      const date = new Date(time).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
      const width = text(date, 0, 0, 12).width
      content += label(date, x(time) - width / 2, 316, 12)
    }
  } else {
    content += label(points ? 'No stars yet' : 'Star history is temporarily unavailable', 66, 200, 18)
  }
  content += label('Cumulative stars by week', 26, 352, 12)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="740" height="376" viewBox="0 0 740 376" role="img" aria-label="${title}"><title>${title}</title><desc>Weekly cumulative GitHub stars. Stars that have been removed are not included.</desc><defs><linearGradient id="ocean" x2="1" y2="1"><stop stop-color="#0B3D3E"/><stop offset="1" stop-color="#145A58"/></linearGradient><linearGradient id="area" x2="0" y2="1"><stop stop-color="#89DED2" stop-opacity=".24"/><stop offset="1" stop-color="#89DED2" stop-opacity="0"/></linearGradient></defs><rect x=".5" y=".5" width="739" height="375" rx="12" fill="url(#ocean)" stroke="#4A9D93" stroke-opacity=".65"/>${content}</svg>`
}
