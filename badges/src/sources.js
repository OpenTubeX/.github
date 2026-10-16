const REPO = '/repos/OpenTubeX/OpenTubeX'

async function github(path, env, fetch) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'opentubex-badges',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {})
    },
    signal: AbortSignal.timeout(10000)
  })
  if (!response.ok) throw new Error(`GitHub status ${response.status}`)
  return response.json()
}

function compareVersions(a, b) {
  const left = a.split('.').map(Number)
  const right = b.split('.').map(Number)
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0)
    if (difference) return difference
  }
  return 0
}

export function metric(count) {
  const units = ['', 'k', 'M', 'G']
  let i = 0
  while (count >= 999.5 && i < units.length - 1) {
    count /= 1000
    i++
  }
  return `${i && count < 10 ? Math.round(count * 10) / 10 : Math.round(count)}${units[i]}`
}

// shields.io's shared GitHub token pool runs dry, so GitHub data is fetched directly.
// Set GITHUB_TOKEN to a fine-grained token with public read-only access.
export const githubSources = {
  async release(env, fetch) {
    return { message: (await github(`${REPO}/releases/latest`, env, fetch)).tag_name }
  },
  async downloads(env, fetch) {
    let total = 0
    for (let page = 1; ; page++) {
      const releases = await github(`${REPO}/releases?per_page=100&page=${page}`, env, fetch)
      for (const release of releases) for (const asset of release.assets) total += asset.download_count
      if (releases.length < 100) return { message: metric(total) }
    }
  },
  async winget(env, fetch) {
    const entries = await github('/repos/microsoft/winget-pkgs/contents/manifests/o/OpenTubeX/OpenTubeX', env, fetch)
    const versions = entries.filter(entry => entry.type === 'dir' && /^\d+(\.\d+)*$/.test(entry.name)).map(entry => entry.name)
    if (!versions.length) throw new Error('No WinGet versions')
    return { message: `v${versions.sort(compareVersions).at(-1)}` }
  },
  async stars(env, fetch) {
    return { message: metric((await github(REPO, env, fetch)).stargazers_count) }
  },
  async license(env, fetch) {
    return { message: (await github(REPO, env, fetch)).license?.spdx_id }
  }
}

export default {
  "build": "https://img.shields.io/github/actions/workflow/status/OpenTubeX/OpenTubeX/build.yml.json?branch=development",
  "e2e": "https://img.shields.io/github/actions/workflow/status/OpenTubeX/OpenTubeX/e2e.yml.json?branch=development",
  "codeql": "https://img.shields.io/github/actions/workflow/status/OpenTubeX/OpenTubeX/codeql.yml.json?branch=development",
  "translations": "https://img.shields.io/weblate/progress/opentubex.json?server=https%3A%2F%2Fweblate.opentubex.org",
  "fluxer": "https://img.shields.io/badge/dynamic/json.json?url=https%3A%2F%2Fapi.fluxer.app%2Finvites%2FPHdJoM1G&query=%24.member_count&suffix=+members",
  "aur": "https://img.shields.io/aur/version/opentubex-bin.json"
}
