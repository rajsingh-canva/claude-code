export type PaneAgent = {
  id: string
  type: string
  description: string
  // What SendMessage addresses it by, when it has one
  name?: string
  status: 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'
  isTeammate: boolean
  startedAt: number
  finishedAt?: number
  // Model requests made in its current run
  steps: number
  // The model it runs on, as its spawn answered and its latest request used
  model?: string
  // The effort of its latest request, when one was set
  effort?: string
  // Output tokens in its current run
  outputTokens?: number
  // Input tokens its latest request sent, cached ones included: how full its context is
  contextTokens?: number
}

declare module 'claude-code' {
  interface PluginState {
    'agent-pane': {
      agents: PaneAgent[]
      // The agent opened in the pane; '' shows the list
      selected: string
      // The message being typed to the open agent
      draft: string
      // What became of the last message sent
      notice: string
      // The person closed the pane, so spawns no longer reopen it
      isDismissed: boolean
    }
  }
}
