import { definitions, renderBadge } from './render.js'
import { projectActivity, renderProjectActivity } from './project-activity.js'
import { renderStarHistory } from './star-history.js'
import sources, { githubSources, starHistory } from './sources.js'

const SUCCESS_TTL = 300
const ERROR_TTL = 30
const STALE_TTL = 30 * 86400

export function parseData(data, definition) {
  if (typeof data?.message !== 'string' || data.isError || /inaccessible|invalid|not found|rate.limit|upstream|too many requests|token/i.test(data.message)) {
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
  const theme = key?.endsWith('-light') ? 'light' : 'dark'
  const widgetKey = theme === 'light' ? key.slice(0, -6) : key
  const widget = widgetKey === 'star-history'
    ? { load: starHistory, render: renderStarHistory }
    : widgetKey === 'project-activity' ? { load: projectActivity, render: renderProjectActivity } : null
  if (!key || (!widget && !Object.hasOwn(definitions, key))) return new Response('Badge not found', { status: 404 })
  const definition = definitions[key]
  if (!widget && !Object.hasOwn(sources, key) && !Object.hasOwn(githubSources, key)) {
    const response = svgResponse(renderBadge(definition), 86400)
    return request.method === 'HEAD' ? new Response(null, response) : response
  }
  // Ignore query strings so callers cannot bypass the upstream request cache.
  // Rendered widgets must not survive a deployment that changes their design.
  const cacheUrl = new URL(`${url.origin}/${key}.svg`)
  if (widget && env?.CF_VERSION_METADATA?.id) cacheUrl.searchParams.set('version', env.CF_VERSION_METADATA.id)
  const cacheKey = new Request(cacheUrl)
  const cache = dependencies.cache ?? caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return request.method === 'HEAD' ? new Response(null, hit) : hit
  const upstreamFetch = dependencies.fetch ?? fetch
  const staleUrl = new URL(cacheUrl)
  const staleKey = new Request(`${staleUrl}${staleUrl.search ? '&' : '?'}stale`)
  let response
  try {
    let data
    let svg
    if (widget) {
      svg = widget.render(await widget.load(env ?? {}, upstreamFetch), theme)
    } else {
      if (Object.hasOwn(githubSources, key)) {
        data = await githubSources[key](env ?? {}, upstreamFetch)
      } else {
        const upstream = await upstreamFetch(sources[key], {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000)
        })
        if (!upstream.ok) throw new Error(`Upstream status ${upstream.status}`)
        data = await upstream.json()
      }
      const { value, state } = parseData(data, definition)
      svg = renderBadge(definition, value, state)
    }
    response = svgResponse(svg, widget ? 21600 : SUCCESS_TTL)
    ctx.waitUntil(cache.put(staleKey, svgResponse(svg, STALE_TTL)))
  } catch (error) {
    console.error(`${key}: ${error.message}`)
    // Show the last real value while a feed is down; never display a sample value.
    const stale = await cache.match(staleKey)
    response = svgResponse(stale ? await stale.text() : widget ? widget.render(null, theme) : renderBadge(definition, 'Unavailable', 'unknown'), ERROR_TTL)
  }
  ctx.waitUntil(cache.put(cacheKey, response.clone()))
  return request.method === 'HEAD' ? new Response(null, response) : response
}

export default { fetch: handleRequest }
