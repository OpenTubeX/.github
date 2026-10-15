import { definitions, renderBadge } from './render.js'
import sources from './sources.js'

const SUCCESS_TTL = 300
const ERROR_TTL = 30

export function parseData(data, definition) {
  if (typeof data?.message !== 'string' || data.isError || /inaccessible|invalid|not found|rate.limit|upstream|too many requests/i.test(data.message)) {
    throw new Error('Badge data unavailable')
  }
  const message = data.message.trim()
  if (!message || message.length > 64) throw new Error('Invalid badge value')
  if (!definition.workflow) return { value: message }
  if (/^(passing|success)$/i.test(message)) return { value: 'Passing', state: 'passing' }
  if (/^(failing|failure|timed out|action required)$/i.test(message)) return { value: 'Failing', state: 'failing' }
  if (/^(running|in progress|queued|pending|waiting|requested)$/i.test(message)) return { value: /queued|pending|waiting|requested/i.test(message) ? 'Queued' : 'Running', state: 'pending' }
  return { value: message[0].toUpperCase() + message.slice(1), state: 'unknown' }
}

function svgResponse(svg, ttl, status = 200) {
  return new Response(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'"
    }
  })
}

export async function handleRequest(request, env, ctx, dependencies = {}) {
  const url = new URL(request.url)
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  const match = /^\/([a-z0-9-]+)\.svg$/.exec(url.pathname)
  const key = match?.[1]
  if (!key || !Object.hasOwn(definitions, key)) return new Response('Badge not found', { status: 404 })
  const definition = definitions[key]
  if (!Object.hasOwn(sources, key)) {
    const response = svgResponse(renderBadge(definition), 86400)
    return request.method === 'HEAD' ? new Response(null, response) : response
  }
  // Ignore query strings so callers cannot bypass the upstream request cache.
  const cacheKey = new Request(`${url.origin}/${key}.svg`)
  const cache = dependencies.cache ?? caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit
  const upstreamFetch = dependencies.fetch ?? fetch
  let response
  try {
    const upstream = await upstreamFetch(sources[key], {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10000)
    })
    if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`)
    const { value, state } = parseData(await upstream.json(), definition)
    response = svgResponse(renderBadge(definition, value, state), SUCCESS_TTL)
  } catch {
    // Keep the image readable when a feed is down; never display a sample value.
    response = svgResponse(renderBadge(definition, 'Unavailable', 'unknown'), ERROR_TTL)
  }
  ctx.waitUntil(cache.put(cacheKey, response.clone()))
  return request.method === 'HEAD' ? new Response(null, response) : response
}

export default { fetch: handleRequest }
