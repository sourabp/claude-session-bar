export type Run = { text: string; color?: string; bold?: boolean }

declare module 'claude-code' {
  interface PluginState {
    'session-bar': { prompt: Run[][]; usage: string[] }
  }
}
