import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest, parseData } from '../src/index.js'
import { definitions, renderBadge } from '../src/render.js'
import sources from '../src/sources.js'

function harness(upstream = { message: '29k' }) {
  const entries = new Map()
  const calls = []
  const pending = []
  const dependencies = {
    fetch: async (url, options) => {
      calls.push({ url, options })
      if (upstream instanceof Error) throw upstream
      return Response.json(upstream)
    },
    cache: {
      match: async request => entries.get(request.url)?.clone(),
      put: async (request, response) => { entries.set(request.url, response) }
    }
  }
  return {
    calls,
    entries,
    async request(path, method = 'GET') {
      const response = await handleRequest(new Request(`https://badges.example${path}`, { method }), {}, { waitUntil: promise => pending.push(promise) }, dependencies)
      await Promise.all(pending)
      return response
    }
  }
}

test('each public badge is a rounded standalone SVG with an accessible name', async () => {
  for (const [key, definition] of Object.entries(definitions)) {
    const h = harness({ message: definition.workflow ? 'passing' : '1.2.3' })
    const response = await h.request(`/${key}.svg`)
    const svg = await response.text()
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Content-Type'), 'image/svg+xml; charset=utf-8')
    assert.ok(svg.includes(`aria-label="${definition.label}`), key)
    assert.ok(svg.includes(`<title>${definition.label}`), key)
    assert.ok(svg.includes(`rx="${definition.kind === 'cta' ? 12 : 10}"`), key)
    assert.ok(!svg.includes('<text'), 'lettering must not depend on installed fonts')
    assert.ok(!svg.includes('<image'), 'logos must not load external assets')
    assert.ok(!svg.includes('undefined'), key)
  }
})

test('static badges need no upstream or cache requests', async () => {
  const h = harness(new Error('Offline'))
  for (const key of ['download', 'download-outline', 'features', 'website', 'source', 'discussions', 'privacy', 'matrix-link', 'fluxer-link', 'matrix']) {
    assert.equal((await h.request(`/${key}.svg`)).status, 200)
  }
  assert.equal(h.calls.length, 0)
  assert.equal(h.entries.size, 0)
})

test('live values are rendered and cached for five minutes, including HEAD requests', async () => {
  const h = harness({ message: '42k' })
  const first = await h.request('/downloads.svg')
  assert.match(await first.text(), /<title>Downloads: 42k<\/title>/)
  assert.equal(first.headers.get('Cache-Control'), 'public, max-age=300')
  assert.equal(h.calls[0].url, sources.downloads)
  assert.equal((await h.request('/downloads.svg', 'HEAD')).headers.get('Content-Type'), 'image/svg+xml; charset=utf-8')
  assert.equal(await (await h.request('/downloads.svg', 'HEAD')).text(), '')
  assert.equal(h.calls.length, 1)
})

test('query strings cannot change the feed or bypass the cache', async () => {
  const h = harness()
  await h.request('/downloads.svg?url=https://untrusted.example&color=red')
  await h.request('/downloads.svg?nocache=1')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].url, sources.downloads)
  assert.ok(h.entries.has('https://badges.example/downloads.svg'))
})

test('HEAD on a cache miss fetches valid data and caches a complete SVG', async () => {
  const h = harness({ message: '112' })
  assert.equal(await (await h.request('/stars.svg', 'HEAD')).text(), '')
  assert.match(await (await h.request('/stars.svg')).text(), /Stars: 112/)
  assert.equal(h.calls.length, 1)
})

test('upstream failures display Unavailable with a short cache instead of a sample', async () => {
  for (const upstream of [new Error('Timed out'), { message: 'inaccessible' }, { message: 'not found' }, { isError: true, message: 'passing' }, { message: '' }, { message: 123 }, { message: 'x'.repeat(65) }]) {
    const h = harness(upstream)
    const response = await h.request('/build.svg')
    const svg = await response.text()
    assert.match(svg, /<title>Build: Unavailable<\/title>/)
    assert.ok(!svg.includes('Passing'))
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30')
  }
})

test('HTTP failures and invalid JSON also produce a readable fallback', async () => {
  for (const fetch of [async () => new Response('Bad gateway', { status: 502 }), async () => new Response('not json')]) {
    const response = await handleRequest(new Request('https://badges.example/release.svg'), {}, { waitUntil() {} }, { fetch, cache: { async match() {}, async put() {} } })
    assert.match(await response.text(), /Release: Unavailable/)
  }
})

test('workflow states retain their meaning and distinct presentation', () => {
  for (const [message, state, value] of [
    ['passing', 'passing', 'Passing'], ['success', 'passing', 'Passing'],
    ['failing', 'failing', 'Failing'], ['timed out', 'failing', 'Failing'],
    ['in progress', 'pending', 'Running'], ['queued', 'pending', 'Queued'],
    ['cancelled', 'unknown', 'Cancelled'], ['no status', 'unknown', 'No status']
  ]) {
    assert.deepEqual(parseData({ message }, definitions.build), { state, value })
    const svg = renderBadge(definitions.build, value, state)
    assert.ok(svg.includes('stroke-width="1.6"'), 'status includes a symbol as well as text')
  }
})

test('untrusted values cannot inject SVG markup', () => {
  const svg = renderBadge(definitions.release, '\"><script>alert(1)</script>&')
  assert.ok(svg.includes('&quot;&gt;&lt;script&gt;'))
  assert.ok(!svg.includes('<script>'))
  assert.ok(!svg.includes('onload='))
})

test('unknown routes and methods do not fetch data', async () => {
  const h = harness()
  for (const path of ['/', '/__proto__.svg', '/anything.svg', '/stars.svg/extra', '/src/index.js']) {
    assert.equal((await h.request(path)).status, 404)
  }
  const response = await h.request('/stars.svg', 'POST')
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('Allow'), 'GET, HEAD')
  assert.equal(h.calls.length, 0)
})

test('all dynamic sources use fixed HTTPS JSON feeds and preserve data selection', () => {
  for (const [key, source] of Object.entries(sources)) {
    assert.ok(Object.hasOwn(definitions, key))
    const url = new URL(source)
    assert.equal(url.origin, 'https://img.shields.io')
    assert.ok(url.pathname.endsWith('.json'))
  }
  assert.equal(new URL(sources.release).searchParams.get('filter'), '!*-nightly-*')
  for (const key of ['build', 'e2e', 'codeql']) assert.equal(new URL(sources[key]).searchParams.get('branch'), 'development')
  assert.equal(new URL(sources.translations).searchParams.get('server'), 'https://weblate.opentubex.org')
})
