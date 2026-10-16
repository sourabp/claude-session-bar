import { atom, read, update } from 'claude-code'

const promptRuns = atom({ plugin: 'session-bar', key: 'prompt' }, [])
const usageSegs = atom({ plugin: 'session-bar', key: 'usage' }, [])

const BASIC = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

const hex = n => n.toString(16).padStart(2, '0')

const color256 = n => {
  if (n < 16) return BASIC[n % 8]
  if (n >= 232) {
    const g = 8 + (n - 232) * 10
    return `#${hex(g)}${hex(g)}${hex(g)}`
  }
  const i = n - 16
  const level = v => (v === 0 ? 0 : 55 + v * 40)
  return `#${hex(level(Math.floor(i / 36)))}${hex(level(Math.floor(i / 6) % 6))}${hex(level(i % 6))}`
}

// Parses starship's SGR output (colors, bold) into runs of styled text.
const parseAnsi = text => {
  const runs = []
  let style = {}
  let last = 0
  const push = s => s && runs.push({ text: s, ...style })

  for (const m of text.matchAll(/\x1b\[([0-9;]*)m/g)) {
    push(text.slice(last, m.index))
    last = m.index + m[0].length

    const codes = m[1] === '' ? [0] : m[1].split(';').map(Number)
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]
      if (c === 0) style = {}
      else if (c === 1) style = { ...style, bold: true }
      else if (c === 22) style = { ...style, bold: false }
      else if (c === 39) style = { ...style, color: undefined }
      else if ((c >= 30 && c <= 37) || (c >= 90 && c <= 97)) style = { ...style, color: BASIC[c % 10] }
      else if (c === 38 && codes[i + 1] === 5) {
        style = { ...style, color: color256(codes[i + 2]) }
        i += 2
      } else if (c === 38 && codes[i + 1] === 2) {
        style = { ...style, color: `#${hex(codes[i + 2])}${hex(codes[i + 3])}${hex(codes[i + 4])}` }
        i += 4
      }
    }
  }

  push(text.slice(last))
  return runs
}

const plain = runs => runs.map(r => r.text).join('').trim()

const run = async ($, argv, cwd) => {
  try {
    const r = await $.process.run(argv, { cwd })
    return r.exitCode === 0 ? r.stdout.trim() : ''
  } catch {
    return ''
  }
}

// The real starship prompt; [] when starship is missing or fails.
const starship = async ($, cwd) => {
  try {
    const r = await $.process.run(['starship', 'prompt', '--terminal-width', '120'], {
      cwd,
      env: { STARSHIP_SHELL: '', PWD: cwd },
    })
    if (r.exitCode !== 0) return []

    return r.stdout
      .split('\n')
      .map(parseAnsi)
      .filter(runs => plain(runs) !== '' && plain(runs) !== '❯')
  } catch {
    return []
  }
}

const shortDir = (cwd, home) => {
  const p = home && cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd
  const parts = p.split('/').filter(Boolean)
  return parts.length > 3 ? '…/' + parts.slice(-3).join('/') : p
}

// A starship-like line from what the session can read itself.
const builtin = async ($, cwd) => {
  const home = await $.env.get('HOME')
  const segs = [{ text: shortDir(cwd, home), color: 'cyan', bold: true }]

  const branch = await run($, ['git', 'rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  if (branch) {
    const dirty = await run($, ['git', 'status', '--porcelain'], cwd)
    segs.push({ text: `on  ${branch}${dirty ? ' *' : ''}`, color: 'magenta', bold: true })
  }

  const hasPython = await $.fs.stat(`${cwd}/pyproject.toml`).then(() => true, () => false)
  const venvPath = await $.env.get('VIRTUAL_ENV')
  if (hasPython || venvPath) {
    const v = (await run($, ['python3', '--version'], cwd)).replace('Python ', '')
    const venv = venvPath ? venvPath.split('/').pop() : ''
    const name = venv === '.venv' ? cwd.split('/').pop() : venv
    segs.push({ text: `via 🐍 v${v}${name ? ` (${name})` : ''}`, color: 'yellow', bold: true })
  }

  const profile = await $.env.get('AWS_PROFILE')
  const region = (await $.env.get('AWS_REGION')) ?? (await $.env.get('AWS_DEFAULT_REGION'))
  if (profile || region) {
    const text = `on ☁️  ${profile ? profile + ' ' : ''}${region ? `(${region})` : ''}`.trim()
    segs.push({ text, color: 'yellow', bold: true })
  }

  return [segs.map((s, i) => ({ ...s, text: (i ? ' ' : '') + s.text }))]
}

const promptLines = async ($, source) => {
  const cwd = await $.session.cwd()

  if (source !== 'builtin') {
    const lines = await starship($, cwd)
    if (lines.length || source === 'starship') return lines
  }

  return builtin($, cwd)
}

const compact = n => {
  if (n === undefined) return '?'
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

const LABELS = { five_hour: '5h', seven_day: '7d', spend_limit: 'spend' }

const resetAt = iso => {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return ` ↻${hh}:${mm}`
}

const usageLine = (model, context, rateLimits) => {
  const pct = context.percent === undefined ? '' : ` ${context.percent}%`
  const out = [model, `ctx ${compact(context.tokens)}/${compact(context.window)}${pct}`]

  if (rateLimits?.length) {
    for (const r of rateLimits) {
      out.push(`${LABELS[r.kind] ?? r.kind} ${r.percentUsed}%${resetAt(r.resetsAt)}`)
    }
  } else {
    out.push('limits n/a')
  }

  return out
}

const refresh = async ($, source) => {
  const [model, usage, lines] = await Promise.all([
    $.session.model(),
    $.session.usage(),
    promptLines($, source),
  ])
  await update($, promptRuns, () => lines)
  await update($, usageSegs, () => usageLine(model, usage.context, usage.rateLimits))
}

export function register(on, options) {
  const source = options?.prompt ?? 'auto'

  on('session.start', async ($, e, next) => {
    await refresh($, source).catch(() => {})
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await refresh($, source).catch(() => {})
    return next(e)
  })

  // Pushed when context moves or a rate-limit window moves a point.
  on('session.measure', async ($, e, next) => {
    const model = await $.session.model()
    await update($, usageSegs, () => usageLine(model, e.context, e.rateLimits))
    return next(e)
  })

  // /model changes the main loop's model between turns.
  on('prompt.submit', async ($, e, next) => {
    await refresh($, source).catch(() => {})
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const lines = await read($, promptRuns)
    const usage = await read($, usageSegs)
    if (!lines.length && !usage.length) return next(e)

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        {lines.map((runs, i) => (
          <Box key={`l${i}`}>
            {runs.map((r, j) => (
              <Text key={String(j)} color={r.color} bold={r.bold}>
                {r.text}
              </Text>
            ))}
          </Box>
        ))}
        {usage.length ? (
          <Box key="usage">
            <Text dimColor>{usage.join(' · ')}</Text>
          </Box>
        ) : null}
      </Box>
    )
  })
}
