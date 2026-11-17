import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleRequest } from '../src/index.js'
import { renderTranslationStatus, translationStatus, weblateUrl } from '../src/translation-status.js'

const language = (name, translated, total = 3635) => ({ name, code: name.slice(0, 2), total, translated, translated_percent: 0 })
const pages = {
  [weblateUrl]: { count: 3, next: `${weblateUrl}?page=2`, results: [language('German', 3634), language('English (United States)', 3635)] },
  [`${weblateUrl}?page=2`]: { count: 3, next: null, results: [language('Afrikaans', 763)] }
}

test('translation status follows Weblate pages, sorts by name and sends the configured token', async () => {
  const calls = []
  const languages = await translationStatus({ WEBLATE_TOKEN: 'secret' }, async (url, options) => {
    calls.push(options.headers.Authorization)
    return Response.json(pages[url])
  })
  assert.deepEqual(languages.map(({ name }) => name), ['Afrikaans', 'English (United States)', 'German'])
  assert.deepEqual(calls, ['Token secret', 'Token secret'])
  await translationStatus({}, async (url, options) => {
    assert.equal(options.headers.Authorization, undefined)
    return Response.json(pages[url])
  })
})

test('translation status rejects failures, invalid statistics and foreign or endless pagination', async () => {
  for (const response of [
    new Response('', { status: 429 }),
    Response.json({ results: [] }),
    Response.json({ next: null, results: [language('German', 4000)] }),
    Response.json({ next: null, results: [{ ...language('German', 1), name: '' }] }),
    Response.json({ next: null, results: [{ ...language('German', 1), total: -1 }] }),
    Response.json({ next: 'https://example.com/api/', results: [language('German', 1)] }),
    Response.json({ next: weblateUrl, results: [language('German', 1)] })
  ]) await assert.rejects(translationStatus({}, async () => response.clone()))
})

test('translation status shows rounded-down totals for every language', () => {
  const svg = renderTranslationStatus([language('German', 3634), language('Afrikaans', 0), language('Lao', 0, 0)])
  assert.match(svg, /<title>Translation status: 49% translated into 3 languages<\/title>/)
  assert.equal((svg.match(/<clipPath /g) ?? []).length, 3)
  assert.ok(!/<text|NaN|Infinity|undefined/.test(svg))
  assert.match(renderTranslationStatus(null, 'light'), /<title>Translation status: Unavailable<\/title>/)
})

test('translation status route renders both themes from one cached Weblate response each', async () => {
  const entries = new Map()
  let calls = 0
  const dependencies = {
    cache: { match: async key => entries.get(key.url)?.clone(), put: async (key, response) => { entries.set(key.url, response) } },
    fetch: async url => { calls++; return Response.json(pages[url]) }
  }
  const request = async suffix => {
    const pending = []
    const response = await handleRequest(new Request(`https://badges.example/translation-status${suffix}.svg`), {}, { waitUntil: promise => pending.push(promise) }, dependencies)
    await Promise.all(pending)
    return response
  }
  const dark = await request('')
  assert.equal(dark.headers.get('Cache-Control'), 'public, max-age=21600')
  assert.match(await dark.text(), /#0C0C0C/)
  assert.match(await (await request('-light')).text(), /#FAF8F7/)
  await request('')
  assert.equal(calls, 4)
})
