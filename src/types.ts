export interface Project {
  id: string
  name: string
  color: string
}

export interface TimeEntry {
  id: string
  projectId: string
  description: string
  startedAt: number // epoch ms
  endedAt: number | null // null while running
}
