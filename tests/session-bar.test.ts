import { expect, mock, test } from 'claude-code/testing'

const USAGE = {
  startedAt: 0,
  context: { tokens: 142000, window: 1000000, percent: 14 },
  rateLimits: [{ kind: 'five_hour', percentUsed: 23, resetsAt: '2026-10-16T09:00:00Z' }],
}

const STARSHIP_OUT = '\x1b[1;36mclaude-session-bar\x1b[0m on \x1b[1;35m main\x1b[0m\n\x1b[1;32m❯\x1b[0m '

const CWD = '/work/claude-session-bar'

type World = {
  starship: 'ok' | 'missing'
  rateLimits?: typeof USAGE.rateLimits
  onStarship?: () => void
}

const out = (stdout: string) => ({
  value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

// Answers the host calls the mod reads; `starship` decides what the starship binary does.
const world = (on: any, w: World) => {
  mock.env(on, { HOME: '/home/me' })
  on('session.start', async () => ({ cwd: CWD }))
  on('session.cwd', async () => ({ value: CWD }))
  on('session.model', async () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', async () => ({ value: { ...USAGE, rateLimits: w.rateLimits ?? USAGE.rateLimits } }))
  on('fs.stat', async () => ({ deny: 'ENOENT' }))
  on('process.run', async (_$: any, e: any) => {
    const [bin, sub] = e.argv
    if (bin === 'starship') {
      w.onStarship?.()
      return w.starship === 'missing' ? { deny: 'spawn starship ENOENT' } : out(STARSHIP_OUT)
    }
    if (bin === 'git' && sub === 'rev-parse') return out('main\n')
    return out('')
  })
}

const start = (_$: any) =>
  _$.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })

const draw = async ($: any) => {
  const ui = await $.ui.mount({
    plugin: 'session-bar',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: { hasSurvey: false },
  })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text)
  await ui.unmount()
  return texts.join('')
}

test('auto: draws the starship prompt and the usage row', async ($, on) => {
  world(on, { starship: 'ok' })
  await start($)

  const text = await draw($)
  expect(text).toContain('claude-session-bar')
  expect(text).toContain(' main')
  expect(text).not.toContain('❯')
  expect(text).toContain('claude-opus-5-5')
  expect(text).toContain('ctx 142k/1M 14%')
  expect(text).toContain('5h 23%')
})

test('auto: falls back to the built-in line when starship is missing', async ($, on) => {
  world(on, { starship: 'missing' })
  await start($)

  const text = await draw($)
  expect(text).toContain('on  main')
  expect(text).toContain('ctx 142k/1M 14%')
})

test('builtin: never runs starship', { options: { prompt: 'builtin' } }, async ($, on) => {
  let isStarshipRun = false
  world(on, { starship: 'ok', onStarship: () => (isStarshipRun = true) })
  await start($)

  expect(await draw($)).toContain('on  main')
  expect(isStarshipRun).toBe(false)
})

test('starship: leaves the top row empty when starship is missing', { options: { prompt: 'starship' } }, async ($, on) => {
  world(on, { starship: 'missing' })
  await start($)

  const text = await draw($)
  expect(text).not.toContain('on  main')
  expect(text).toContain('claude-opus-5-5')
})

test('shows limits n/a when the API reports no rate-limit windows', async ($, on) => {
  world(on, { starship: 'ok', rateLimits: [] })
  await start($)

  expect(await draw($)).toContain('limits n/a')
})
