import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest, parseData } from '../src/index.js'
import { definitions, renderBadge } from '../src/render.js'
import sources, { githubSources, metric } from '../src/sources.js'

function harness(upstream = { message: '29k' }, env = {}) {
  const entries = new Map()
  const calls = []
  const pending = []
  const dependencies = {
    fetch: async (url, options) => {
      calls.push({ url, options })
      if (upstream instanceof Error) throw upstream
      if (typeof upstream === 'function') return upstream(url)
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
      const response = await handleRequest(new Request(`https://badges.example${path}`, { method }), env, { waitUntil: promise => pending.push(promise) }, dependencies)
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
  for (const key of ['download', 'download-outline', 'features', 'website', 'source', 'discussions', 'privacy', 'screenshots', 'how-it-works', 'download-links', 'contributing', 'localization', 'contact', 'license-link', 'matrix-link', 'fluxer-link', 'matrix']) {
    assert.equal((await h.request(`/${key}.svg`)).status, 200)
  }
  assert.equal(h.calls.length, 0)
  assert.equal(h.entries.size, 0)
})

test('live values are rendered and cached for five minutes, including HEAD requests', async () => {
  const h = harness({ message: 'v1.2.3' })
  const first = await h.request('/aur.svg')
  assert.match(await first.text(), /<title>AUR: v1.2.3<\/title>/)
  assert.equal(first.headers.get('Cache-Control'), 'public, max-age=300')
  assert.equal(h.calls[0].url, sources.aur)
  assert.equal((await h.request('/aur.svg', 'HEAD')).headers.get('Content-Type'), 'image/svg+xml; charset=utf-8')
  assert.equal(await (await h.request('/aur.svg', 'HEAD')).text(), '')
  assert.equal(h.calls.length, 1)
})

test('query strings cannot change the feed or bypass the cache', async () => {
  const h = harness()
  await h.request('/aur.svg?url=https://untrusted.example&color=red')
  await h.request('/aur.svg?nocache=1')
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].url, sources.aur)
  assert.ok(h.entries.has('https://badges.example/aur.svg'))
})

test('HEAD on a cache miss fetches valid data and caches a complete SVG', async () => {
  const h = harness({ message: '112' })
  assert.equal(await (await h.request('/fluxer.svg', 'HEAD')).text(), '')
  assert.match(await (await h.request('/fluxer.svg')).text(), /Fluxer: 112/)
  assert.equal(h.calls.length, 1)
})

test('upstream failures display Unavailable with a short cache instead of a sample', async () => {
  for (const upstream of [new Error('Timed out'), { message: 'inaccessible' }, { message: 'not found' }, { message: 'Unable to select next GitHub token from pool' }, { isError: true, message: 'passing' }, { message: '' }, { message: 123 }, { message: 'x'.repeat(65) }]) {
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
  for (const key of ['build', 'e2e', 'codeql']) assert.equal(new URL(sources[key]).searchParams.get('branch'), 'development')
  assert.equal(new URL(sources.translations).searchParams.get('server'), 'https://weblate.opentubex.org')
})

test('GitHub badges read the GitHub API directly with the configured token', async () => {
  const responses = {
    '/repos/OpenTubeX/OpenTubeX/releases/latest': { tag_name: 'v0.36.1-beta' },
    '/repos/OpenTubeX/OpenTubeX/releases?per_page=100&page=1': Array.from({ length: 100 }, () => ({ assets: [{ download_count: 300 }, { download_count: 4 }] })),
    '/repos/OpenTubeX/OpenTubeX/releases?per_page=100&page=2': [{ assets: [{ download_count: 1000 }] }],
    '/repos/microsoft/winget-pkgs/contents/manifests/o/OpenTubeX/OpenTubeX': [{ type: 'dir', name: '0.9.0' }, { type: 'dir', name: '0.10.1' }, { type: 'file', name: '9.9.9' }],
    '/repos/OpenTubeX/OpenTubeX': { stargazers_count: 1234, license: { spdx_id: 'AGPL-3.0' } }
  }
  const upstream = url => {
    const { origin, pathname, search } = new URL(url)
    assert.equal(origin, 'https://api.github.com')
    return Response.json(responses[pathname + search])
  }
  for (const [key, title] of [['release', 'Release: v0.36.1-beta'], ['downloads', 'Downloads: 31k'], ['winget', 'WinGet: v0.10.1'], ['stars', 'Stars: 1.2k'], ['license', 'License: AGPL-3.0']]) {
    const h = harness(upstream, { GITHUB_TOKEN: 'secret' })
    assert.match(await (await h.request(`/${key}.svg`)).text(), new RegExp(`<title>${title}</title>`))
    for (const call of h.calls) assert.equal(call.options.headers.Authorization, 'Bearer secret')
  }
  assert.deepEqual(Object.keys(githubSources).filter(key => Object.hasOwn(sources, key)), [])
})

test('GitHub API errors produce a readable fallback without a token', async () => {
  const h = harness(() => new Response('rate limited', { status: 403 }))
  const response = await h.request('/release.svg')
  assert.match(await response.text(), /<title>Release: Unavailable<\/title>/)
  assert.equal(h.calls[0].options.headers.Authorization, undefined)
})

test('the last real value is shown while a feed is failing', async () => {
  let failing = false
  const h = harness(() => failing ? new Response('', { status: 502 }) : Response.json({ message: 'v1.2.3' }))
  await h.request('/aur.svg')
  failing = true
  h.entries.delete('https://badges.example/aur.svg')
  const response = await h.request('/aur.svg')
  assert.match(await response.text(), /<title>AUR: v1.2.3<\/title>/)
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30')
})

test('counts use compact metric notation', () => {
  for (const [count, text] of [[0, '0'], [999, '999'], [1000, '1k'], [1250, '1.3k'], [30449, '30k'], [999999, '1M']]) assert.equal(metric(count), text)
})

test('star history paginates weekly counts, caches and preserves stale charts', async () => {
  let failing = false
  const h = harness(url => {
    if (failing) return new Response('', { status: 503 })
    const page = new URL(url).searchParams.get('page')
    return Response.json(page === '1'
      ? Array.from({ length: 30 }, (_, i) => ({ week: 1700000000 + (30 - i) * 604800, total: 2 }))
      : [{ week: 1700000000, total: 3 }])
  }, { GITHUB_TOKEN: 'secret' })
  const response = await h.request('/star-history.svg', 'HEAD')
  assert.equal(await response.text(), '')
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=21600')
  const svg = await (await h.request('/star-history.svg?ignore=1')).text()
  assert.match(svg, /Star history: 63 stars/)
  assert.equal(h.calls.length, 2)
  assert.equal(h.calls[0].options.headers['X-GitHub-Api-Version'], '2026-03-10')
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer secret')
  assert.ok(!/<text|<image|NaN|undefined/.test(svg))
  failing = true
  h.entries.delete('https://badges.example/star-history.svg')
  assert.equal(await (await h.request('/star-history.svg')).text(), svg)
})

test('star history rejects invalid upstream data and handles an empty history', async () => {
  for (const data of [{}, [{ week: 'invalid', total: 1 }], [{ week: 1700000000, total: -1 }]]) {
    const h = harness(data)
    const response = await h.request('/star-history.svg')
    assert.match(await response.text(), /Star history: Unavailable/)
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30')
  }
  for (const data of [[], [{ week: 1700000000, total: 0 }], [{ week: 1700000000, total: 1 }]]) {
    const svg = await (await harness(data).request('/star-history.svg')).text()
    assert.ok(!/NaN|Infinity|undefined/.test(svg))
    assert.match(svg, /Star history: [01] stars/)
  }
})
