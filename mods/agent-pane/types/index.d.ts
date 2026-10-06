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
