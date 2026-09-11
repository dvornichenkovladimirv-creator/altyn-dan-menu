import { useEffect, useState } from 'react'
import type { Project, TimeEntry } from '../types'
import { formatDuration } from '../utils/time'

interface Props {
  projects: Project[]
  runningEntry: TimeEntry | undefined
  onStart: (projectId: string, description: string) => void
  onStop: () => void
}

export function Tracker({ projects, runningEntry, onStart, onStop }: Props) {
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!runningEntry) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [runningEntry])

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id)
  }, [projects, projectId])

  if (runningEntry) {
    const project = projects.find((p) => p.id === runningEntry.projectId)
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="h-3 w-3 shrink-0 animate-pulse rounded-full"
            style={{ backgroundColor: project?.color ?? '#64748b' }}
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{runningEntry.description || 'Без описания'}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{project?.name ?? 'Без проекта'}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-2xl tabular-nums">
            {formatDuration(now - runningEntry.startedAt)}
          </span>
          <button
            onClick={onStop}
            className="rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition hover:bg-red-700"
          >
            Стоп
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center"
      onSubmit={(e) => {
        e.preventDefault()
        if (!projectId) return
        onStart(projectId, description.trim())
        setDescription('')
      }}
    >
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Чем занимаетесь?"
        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-slate-700"
      />
      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="rounded-lg border border-slate-300 bg-transparent px-3 py-2 outline-none focus:border-indigo-500 dark:border-slate-700"
      >
        {projects.length === 0 && <option value="">Нет проектов</option>}
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={!projectId}
        className="rounded-lg bg-indigo-600 px-5 py-2 font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Старт
      </button>
    </form>
  )
}
