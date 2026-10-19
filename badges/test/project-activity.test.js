import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { activityUrl, projectActivity, renderProjectActivity } from '../src/project-activity.js'
import { text } from '../src/render.js'
import { handleRequest } from '../src/index.js'

const fixture = readFileSync(new URL('./fixtures/repobeats.svg', import.meta.url), 'utf8')

test('activity preserves every metric, chart bar and contributor in the styled SVG', () => {
  const svg = renderProjectActivity(fixture)
  for (const label of ['267 Contributions in the Last 30 Days', '3 Opened/Closed Issue Ratio', '16 Pull Requests Opened', '242 Pushes', 'D3SOX', 'rootedetc', 'SadieVane']) assert.ok(svg.includes(label), label)
  assert.equal((svg.match(/width="7.7"/g) ?? []).length, (fixture.match(/width="7.7"/g) ?? []).length)
  assert.equal((svg.match(/ opacity="/g) ?? []).length, (fixture.match(/ opacity="/g) ?? []).length)
  assert.ok(!/<text|<style|<image|NaN|undefined/.test(svg))
  assert.match(svg, /rx="12"/)
  assert.match(svg, /#202426/)
})

test('activity rejects active markup, external resources and changed feed layouts', () => {
  for (const source of [
    fixture.replace('<style>', '<script>'),
    fixture.replace('width="814"', 'onload="alert(1)" width="814"'),
    fixture.replace('fill="#777"', 'fill="url(https://example.com/a)"'),
    fixture.replace('<style>', '<foreignObject>'),
    fixture.replace('0 0 814 318', '0 0 900 400'),
    fixture.replace('Top Contributors', 'Changed heading'),
    '<svg></svg>', 'x'.repeat(500001)
  ]) assert.throws(() => renderProjectActivity(source))
})

test('activity fetch uses a fixed source and rejects failures and oversized responses', async () => {
  assert.equal(await projectActivity({}, async (url, options) => {
    assert.equal(url, activityUrl)
    assert.equal(options.headers.Accept, 'image/svg+xml')
    return new Response(fixture)
  }), fixture)
  for (const response of [new Response('', { status: 503 }), new Response('x'.repeat(500001))]) {
    await assert.rejects(projectActivity({}, async () => response))
  }
})

test('activity route supports HEAD, shared caching, stale charts and first-request failure', async () => {
  const entries = new Map()
  let calls = 0
  let failing = false
  const dependencies = {
    cache: { match: async key => entries.get(key.url)?.clone(), put: async (key, response) => { entries.set(key.url, response) } },
    fetch: async () => { calls++; return failing ? new Response('bad', { status: 502 }) : new Response(fixture) }
  }
  const request = async (query = '', method = 'GET') => {
    const pending = []
    const result = await handleRequest(new Request(`https://badges.example/project-activity.svg${query}`, { method }), {}, { waitUntil: promise => pending.push(promise) }, dependencies)
    await Promise.all(pending)
    return result
  }
  const head = await request('', 'HEAD')
  assert.equal(await head.text(), '')
  assert.equal(head.headers.get('Cache-Control'), 'public, max-age=21600')
  const svg = await (await request('?url=https://example.com')).text()
  assert.match(svg, /267 Contributions/)
  assert.equal(calls, 1)
  failing = true
  entries.delete('https://badges.example/project-activity.svg')
  assert.equal(await (await request()).text(), svg)
  entries.clear()
  const response = await request()
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=30')
  assert.match(await response.text(), /Project activity: Unavailable/)
})


test('activity decodes XML entities exactly once in labels and glyphs', () => {
  for (const [encoded, decoded] of [
    ['&amp; &lt; &gt; &quot; &apos;', `& < > " '`],
    ['&amp;lt; &amp;gt; &amp;quot; &amp;apos;', '&lt; &gt; &quot; &apos;'],
    ['&amp;amp;lt;', '&amp;lt;'],
    ['&amp;lt;script&amp;gt;', '&lt;script&gt;']
  ]) {
    const svg = renderProjectActivity(fixture.replace('D3SOX', encoded))
    const title = /<title>(.*?)<\/title>/.exec(svg)[1]
    assert.ok(title.includes(encoded), `${encoded} must survive the decode/encode round trip`)
    assert.ok(svg.includes(text(decoded, 0, 19, 12, 'SemiBold', '#D5E8E4').svg), 'glyphs must show the once-decoded text')
    assert.ok(!svg.includes('<script>'))
  }
})
