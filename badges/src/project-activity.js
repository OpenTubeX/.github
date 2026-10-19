import { text } from './render.js'

export const activityUrl = 'https://repobeats.axiom.co/api/embed/7abf4173ece7177b69cfb890c44de4385c4a45f1.svg'
const colors = {
  '#61adf4': '#89DED2', '#406cc4': '#4A9D93',
  '#cf54fc': '#89DED2', '#7b58c9': '#4A9D93',
  '#ff7a35': '#89DED2', '#ba473e': '#E8F2F0',
  '#487b41': '#89DED2', '#459631': '#89DED2', '#cf3e3e': '#F3B9BE',
  '#777': '#D5E8E4'
}
const attributes = {
  svg: ['width', 'height', 'viewBox', 'fill', 'xmlns'],
  g: ['transform'], rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'opacity'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'fill-rule', 'clip-rule'],
  defs: [], linearGradient: ['id', 'x1', 'x2', 'y1', 'y2', 'gradientUnits'],
  stop: ['offset', 'stop-color'], text: ['x', 'y', 'class', 'fill', 'stroke-width', 'text-anchor']
}
const escapeXml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])

// Reconstruct only the static SVG vocabulary used by this fixed feed. Never
// forward upstream scripts, links, styles, event handlers, or external assets.
export function renderProjectActivity(source) {
  const fallback = source === null
  let content = ''
  let summary = 'Project activity: Unavailable'
  if (!fallback) {
    if (source.length > 500000) throw new Error('Activity SVG too large')
    const clean = source.replace(/<style>[\s\S]*?<\/style>/g, '').trim()
    const tokens = clean.match(/<[^>]*>|[^<]+/g) ?? []
    const stack = []
    const labels = []
    let textAttributes
    for (const token of tokens) {
      if (!token.startsWith('<')) {
        if (!textAttributes) {
          if (token.trim()) throw new Error('Unexpected activity SVG text')
          continue
        }
        const value = token.trim().replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity])
        labels.push(value)
        const size = textAttributes.class?.includes('smaller') ? 12 : 14
        const weight = textAttributes.class?.includes('bold') ? 'SemiBold' : 'Medium'
        const color = textAttributes.fill === '#CF3E3E' ? '#F3B9BE' : textAttributes.class?.includes('smaller') ? '#D5E8E4' : '#E8F2F0'
        const width = text(value, 0, 0, size, weight).width
        const x = Number(textAttributes.x) - (textAttributes['text-anchor'] === 'end' ? width : 0)
        content += text(value, x, Number(textAttributes.y), size, weight, color).svg
        continue
      }
      const match = /^<(\/?)([A-Za-z]+)([\s\S]*?)(\/?)>$/.exec(token)
      if (!match || !Object.hasOwn(attributes, match[2])) throw new Error('Unsupported activity SVG element')
      const [, closing, name, raw, selfClosing] = match
      if (closing) {
        if (raw.trim() || stack.pop() !== name) throw new Error('Invalid activity SVG nesting')
        if (name === 'text') textAttributes = undefined
        else if (stack.length) content += `</${name}>`
        continue
      }
      const attrs = {}
      let remaining = raw
      while (remaining.trim()) {
        const attr = /^\s+([\w-]+)="([^"<>]*)"/.exec(remaining)
        if (!attr || !attributes[name].includes(attr[1])) throw new Error('Unsupported activity SVG attribute')
        const [, key, value] = attr
        if (key !== 'xmlns' && !/^[\w\s.,():#%+\/-]*$/.test(value)) throw new Error('Invalid activity SVG attribute')
        if (key === 'xmlns' && value !== 'http://www.w3.org/2000/svg') throw new Error('Invalid SVG namespace')
        if (['fill', 'stroke', 'stop-color'].includes(key) && !/^(none|#[\da-f]{3,8}|rgba?\([\d.,\s]+\)|url\(#[\w:-]+\))$/i.test(value)) throw new Error('Invalid SVG paint')
        attrs[key] = value
        remaining = remaining.slice(attr[0].length)
      }
      if (stack.length === 0) {
        if (name !== 'svg' || attrs.viewBox !== '0 0 814 318') throw new Error('Unexpected activity SVG layout')
      } else if (name === 'text') {
        if (!Number.isFinite(Number(attrs.x)) || !Number.isFinite(Number(attrs.y))) throw new Error('Invalid text position')
        textAttributes = attrs
      } else {
        for (const key of ['fill', 'stroke', 'stop-color']) {
          if (!attrs[key]) continue
          const color = attrs[key].toLowerCase()
          if (color.startsWith('rgba(0,0,0,')) attrs[key] = 'none'
          else if (/rgba\(255,\s*255,\s*255,/.test(color)) attrs[key] = key === 'fill' ? 'none' : '#4A9D93'
          else if (color.startsWith('rgba(236,')) attrs[key] = '#89DED2'
          else attrs[key] = colors[color] ?? (color.startsWith('#') ? '#89DED2' : attrs[key])
        }
        if (name === 'rect' && attrs.rx === '4.5') attrs.rx = '10'
        content += `<${name}${Object.entries(attrs).map(([key, value]) => ` ${key}="${escapeXml(value)}"`).join('')}${selfClosing ? '/' : ''}>`
      }
      if (!selfClosing) stack.push(name)
    }
    if (stack.length || !labels.some(label => /^\d+ Contributions in the Last 30 Days$/.test(label)) || !labels.includes('Top Contributors')) throw new Error('Incomplete activity SVG')
    summary = `Project activity: ${labels.join('; ')}`
  } else {
    content = text('Project activity is temporarily unavailable', 26, 80, 18).svg
  }
  const title = escapeXml(summary)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="862" height="402" viewBox="0 0 862 402" role="img" aria-label="${title}"><title>${title}</title><defs><linearGradient id="activity-ocean" x2="1" y2="1"><stop stop-color="#0B3D3E"/><stop offset="1" stop-color="#145A58"/></linearGradient></defs><rect x=".5" y=".5" width="861" height="401" rx="12" fill="url(#activity-ocean)" stroke="#4A9D93" stroke-opacity=".65"/><g transform="translate(24 24)" fill="none">${content}</g>${text('Activity over the last 30 days / Data by Repobeats', 24, 380, 12, 'Medium', '#D5E8E4').svg}</svg>`
}

export async function projectActivity(env, fetch) {
  const response = await fetch(activityUrl, { headers: { Accept: 'image/svg+xml' }, signal: AbortSignal.timeout(10000) })
  if (!response.ok) throw new Error(`Repobeats status ${response.status}`)
  // Bound the response before decoding or processing it.
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 500000) throw new Error('Activity SVG too large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer())
}
