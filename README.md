# claude-session-bar

A Claude Code [mod](https://code.claude.com/docs/en/plugins/mods/overview) that draws a band above the prompt:

```
~/…/tawuniya/service_migration on  main * via 🐍 v3.11.15 (analytics-sdk-python) on ☁️  (us-east-1)
claude-opus-5-5 · ctx 142k/1M 14% · 5h 23% ↻14:30 · 7d 41% ↻09:00
```

- **Top row:** your real [starship](https://starship.rs) prompt, colors included. Without starship, a built-in line shows the directory, git branch and dirty flag, Python version and venv, and AWS profile/region.
- **Bottom row:** current model, context-window fill, and the account's rate-limit windows (5-hour, 7-day) with reset times.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install session-bar --marketplace sourabp/claude-session-bar
```

From a shell:

```
claude plugin install session-bar --marketplace sourabp/claude-session-bar
```

Answer `y` to add the marketplace, then pick a scope.

## Configuration

Run `/config` and find the **Prompt source** row for this plugin (or set `pluginConfigs["session-bar"].options.prompt` in `settings.json`).

| Value | Behavior |
| --- | --- |
| `auto` (default) | Use starship if it is installed and works, otherwise the built-in line. |
| `starship` | Starship only. The top row is empty if starship is missing. |
| `builtin` | Never run starship. |

Starship reads your usual `~/.config/starship.toml`.

## Notes

- Requires Claude Code v2.1.287 or later. The mod API is early access and may change between releases.
- The band refreshes on session start, on prompt submit and when a turn completes, not on every keystroke. A `cd` made inside Claude's shell shows up after the turn.
- Environment-based segments (venv, AWS) read the environment Claude Code started in. Activating a venv inside Claude's shell does not change them.
- `limits n/a` means the API reported no rate-limit windows. That is expected off a Claude subscription (API key or gateway auth) and before the first response.
- **Security:** mods run with your full permissions and are not sandboxed. Read the code before installing. This one runs `starship`, `git` and `python3 --version`, reads a few environment variables (`HOME`, `VIRTUAL_ENV`, `AWS_PROFILE`, `AWS_REGION`, `AWS_DEFAULT_REGION`), and reads session state. It makes no network calls.

## Development

```
claude --plugin-dir ./claude-session-bar
claude plugin validate ./claude-session-bar
```

## License

MIT
