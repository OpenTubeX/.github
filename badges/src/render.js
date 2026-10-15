import fonts from './font-data.js'
import brandIcons from './brand-icons.js'

const paths = {
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 15v6h14v-6"/>',
  release: '<path d="M3 3h8l10 10-8 8L3 11Z"/><circle cx="7" cy="7" r="1"/>',
  star: '<path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1.1 6.2-5.7-3-5.7 3 1.1-6.2-4.5-4.4 6.3-.9Z"/>',
  build: '<path d="m14 4 6 6M4 20l7-7M13 5l-3 3 6 6 3-3M3 17l4 4M5 3l4 4m-6 0 4-4"/>',
  tests: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18m-12 6 2 2 4-4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-5"/>',
  translate: '<path d="M3 5h12M9 3v2m4 0c-1 6-4 9-9 12m1-9c1 4 4 7 8 9m1 4 5-12 5 12m-8-4h6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  code: '<path d="m7 6-6 6 6 6m10-12 6 6-6 6m-4-14-2 16"/>',
  discussion: '<path d="M14 15H7l-4 4V5h14v10Zm-4 4h7l4 3V8h-4"/>',
  license: '<path d="M12 3v18M7 21h10M4 7l8-3 8 3M4 7l-3 7h6Zm16 0-3 7h6Z"/>',
  package: '<path d="m12 3 9 5v9l-9 5-9-5V8Zm0 9v10M3 8l9 4 9-4M7 5l9 5"/>'
}

export const definitions = {
  download: { label: 'Download OpenTubeX', icon: 'download', kind: 'cta' },
  'download-outline': { label: 'Download OpenTubeX', icon: 'download', kind: 'outline' },
  features: { label: 'Explore features', icon: 'compass', kind: 'outline' },
  website: { label: 'Website', icon: 'globe', kind: 'outline' },
  source: { label: 'Source code', icon: 'code', kind: 'outline' },
  discussions: { label: 'Discussions', icon: 'discussion', kind: 'outline' },
  privacy: { label: 'Privacy', icon: 'shield', kind: 'outline' },
  'matrix-link': { label: 'Join Matrix', icon: 'matrix', kind: 'outline' },
  'fluxer-link': { label: 'Join Fluxer', icon: 'fluxer', kind: 'outline' },
  matrix: { label: 'Matrix', icon: 'matrix', value: '#opentubex' },
  downloads: { label: 'Downloads', icon: 'download' },
  stars: { label: 'Stars', icon: 'star' },
  release: { label: 'Release', icon: 'release' },
  license: { label: 'License', icon: 'license' },
  build: { label: 'Build', icon: 'build', workflow: true },
  e2e: { label: 'E2E tests', icon: 'tests', workflow: true },
  codeql: { label: 'CodeQL', icon: 'shield', workflow: true },
  translations: { label: 'Translated', icon: 'translate' },
  fluxer: { label: 'Fluxer', icon: 'fluxer' },
  winget: { label: 'WinGet', icon: 'package' },
  aur: { label: 'AUR', icon: 'arch' }
}

const states = {
  passing: { background: '#147A70', foreground: '#FFFFFF', symbol: '<path d="m-3 0 2 2 4-4"/>' },
  failing: { background: '#FCE2E3', foreground: '#843C43', symbol: '<path d="m-2.5-2.5 5 5m-5 0 5-5"/>' },
  pending: { background: '#FFF1CB', foreground: '#725000', symbol: '<path d="M0-3v3l2 1"/><circle r="5"/>' },
  unknown: { background: '#D5E8E4', foreground: '#3D5A5B', symbol: '<path d="M-3 0h6"/>' }
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
}

function text(value, x, baseline, size = 13, weight = 'Medium', color = '#E8F2F0') {
  const scale = size / 1000
  let width = 0
  let paths = ''
  for (const char of value) {
    const glyph = fonts[weight][char] ?? fonts[weight]['?']
    paths += `<path transform="translate(${width} 0)" d="${glyph.path}"/>`
    width += glyph.width
  }
  return { svg: `<g fill="${color}" transform="translate(${x} ${baseline}) scale(${scale} ${-scale})">${paths}</g>`, width: width * scale }
}

function icon(name, x, y, color, size) {
  if (brandIcons[name]) {
    return brandIcons[name]
      .replace('<svg ', `<svg x="${x}" y="${y}" width="${size}" height="${size}" `)
      .replace(/white|#ffffff|#fff/gi, color)
  }
  return `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</g>`
}

export function renderBadge(definition, value = definition.value, state) {
  const cta = definition.kind === 'cta'
  const outline = definition.kind === 'outline'
  const height = cta ? 44 : 32
  const radius = cta ? 12 : 10
  const label = text(definition.label, cta ? 42 : 36, cta ? 27 : 20.5, cta ? 15 : 13, cta ? 'SemiBold' : 'Medium', outline ? '#0B3D3E' : cta ? '#FFFFFF' : '#E8F2F0')
  const split = Math.ceil((cta ? 42 : 36) + label.width + 13)
  let width = split + (cta ? 7 : 0)
  let content = icon(definition.icon, cta ? 16 : 12, cta ? 13 : 8, cta ? '#E8F2F0' : outline ? '#147A70' : '#89DED2', cta ? 18 : 16) + label.svg
  if (value !== undefined) {
    const status = states[state]
    const foreground = status?.foreground ?? '#0B3D3E'
    const message = text(value, split + 12 + (status ? 18 : 0), 20.5, 13, 'SemiBold', foreground)
    width = Math.ceil(split + 24 + (status ? 18 : 0) + message.width)
    content = `<rect x="${split}" width="${width - split}" height="${height}" fill="${status?.background ?? '#D5E8E4'}"/>` + content
    if (status) content += `<g transform="translate(${split + 17} 16)" fill="none" stroke="${foreground}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${status.symbol}</g>`
    content += message.svg
  }
  const title = escapeXml(definition.label + (value !== undefined ? `: ${value}` : ''))
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}"><title>${title}</title><defs><linearGradient id="ocean" x2="1" y2="1"><stop stop-color="#0B3D3E"/><stop offset="1" stop-color="${cta ? '#147A70' : '#145A58'}"/></linearGradient><clipPath id="corners"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath></defs><g clip-path="url(#corners)"><rect width="${width}" height="${height}" fill="${outline ? '#E8F2F0' : 'url(#ocean)'}"/>${content}</g><rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="${radius - .5}" fill="none" stroke="${outline ? '#A9CEC7' : '#4A9D93'}" stroke-opacity=".65"/></svg>`
}
