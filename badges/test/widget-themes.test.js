import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { handleRequest } from '../src/index.js'
import { renderStarHistory } from '../src/star-history.js'
import { renderProjectActivity } from '../src/project-activity.js'

const activity = readFileSync(new URL('./fixtures/repobeats.svg', import.meta.url), 'utf8')
const history = [{ time: 1700000000000, count: 3 }, { time: 1700604800000, count: 116 }]

test('widget themes preserve all data and geometry, including empty and error states', () => {
  for (const [render, values] of [[renderStarHistory, [history, [], null]], [renderProjectActivity, [activity, null]]]) {
    for (const value of values) {
      const dark = render(value)
      const light = render(value, 'light')
      assert.match(dark, /stop-color="#090C10"/)
      assert.match(light, /stop-color="#F5FAF8"/)
      assert.match(light, /fill="#(?:0B3D3E|3D5A5B)"/)
      const withoutColors = svg => svg.replace(/#[\da-f]{6}/gi, '#COLOR')
      assert.equal(withoutColors(dark), withoutColors(light))
      assert.ok(!/NaN|undefined/.test(light))
    }
  }
})

test('light and dark widget routes retain independent caches and stale fallbacks', async () => {
  for (const key of ['star-history', 'project-activity']) {
    const cache = new Map()
    let failing = false
    let calls = 0
    const dependencies = {
      cache: { match: async request => cache.get(request.url)?.clone(), put: async (request, response) => { cache.set(request.url, response) } },
      fetch: async () => {
        calls++
        if (failing) return new Response('', { status: 503 })
        return key === 'project-activity' ? new Response(activity) : Response.json([{ week: 1700000000, total: 116 }])
      }
    }
    const request = async (suffix = '', query = '', method = 'GET') => {
      const pending = []
      const response = await handleRequest(new Request(`https://badges.example/${key}${suffix}.svg${query}`, { method }), {}, { waitUntil: promise => pending.push(promise) }, dependencies)
      await Promise.all(pending)
      return response
    }
    const dark = await (await request()).text()
    const light = await (await request('-light')).text()
    assert.notEqual(dark, light)
    assert.match(light, /stop-color="#F5FAF8"/)
    assert.equal(await (await request('-light', '?theme=dark')).text(), light)
    assert.equal(await (await request('-light', '', 'HEAD')).text(), '')
    assert.equal(calls, 2)
    failing = true
    for (const [suffix, expected] of [['', dark], ['-light', light]]) {
      cache.delete(`https://badges.example/${key}${suffix}.svg`)
      assert.equal(await (await request(suffix)).text(), expected)
    }
    cache.clear()
    const fallback = await request('-light')
    assert.equal(fallback.headers.get('Cache-Control'), 'public, max-age=30')
    const svg = await fallback.text()
    assert.match(svg, /Unavailable/)
    assert.match(svg, /stop-color="#F5FAF8"/)
  }
})

test('a new deployment cannot reuse rendered widgets from the previous deployment', async () => {
  const entries = new Map()
  let calls = 0
  let failing = false
  const dependencies = {
    cache: { match: async key => entries.get(key.url)?.clone(), put: async (key, response) => { entries.set(key.url, response) } },
    fetch: async () => {
      calls++
      return failing ? new Response('', { status: 503 }) : Response.json([{ week: 1700000000, total: 116 }])
    }
  }
  const request = async (id, query = '') => {
    const pending = []
    const response = await handleRequest(new Request(`https://badges.example/star-history.svg${query}`), { CF_VERSION_METADATA: { id } }, { waitUntil: p => pending.push(p) }, dependencies)
    await Promise.all(pending)
    return response.text()
  }
  await request('old')
  // Reproduce an old deployment's already-rendered success and stale images.
  for (const key of entries.keys()) entries.set(key, new Response('<svg>old teal design</svg>'))
  const fresh = await request('new')
  assert.ok(!fresh.includes('old teal design'))
  assert.match(fresh, /#090C10/)
  assert.equal(calls, 2)
  assert.equal(await request('new', '?v=anything'), fresh)
  assert.equal(calls, 2, 'client query strings cannot bypass the upstream cache')
  failing = true
  assert.match(await request('another'), /Unavailable/, 'do not resurrect an old design from the stale cache')
})
