import { useState } from 'react'
import type { Project, TimeEntry } from '../types'
import { formatClock, formatDuration, fromDatetimeLocal, toDatetimeLocal } from '../utils/time'

interface Props {
  entry: TimeEntry
  projects: Project[]
  onUpdate: (id: string, patch: Partial<TimeEntry>) => void
  onDelete: (id: string) => void
}

export function EntryRow({ entry, projects, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const project = projects.find((p) => p.id === entry.projectId)
  const duration = (entry.endedAt ?? Date.now()) - entry.startedAt

  if (editing) {
    return (
      <li className="flex flex-col gap-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
        <input
          className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
          value={entry.description}
          onChange={(e) => onUpdate(entry.id, { description: e.target.value })}
          placeholder="Описание"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
            value={entry.projectId}
            onChange={(e) => onUpdate(entry.id, { projectId: e.target.value })}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
            value={toDatetimeLocal(entry.startedAt)}
            onChange={(e) => onUpdate(entry.id, { startedAt: fromDatetimeLocal(e.target.value) })}
          />
          <span className="text-sm text-slate-400">—</span>
          <input
            type="datetime-local"
            className="rounded border border-slate-300 bg-transparent px-2 py-1 text-sm dark:border-slate-700"
            value={entry.endedAt ? toDatetimeLocal(entry.endedAt) : ''}
            disabled={entry.endedAt === null}
            onChange={(e) => onUpdate(entry.id, { endedAt: fromDatetimeLocal(e.target.value) })}
          />
          <button
            onClick={() => setEditing(false)}
            className="ml-auto rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Готово
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: project?.color ?? '#64748b' }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{entry.description || 'Без описания'}</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">
          {project?.name ?? 'Без проекта'} · {formatClock(entry.startedAt)}
          {entry.endedAt ? ` – ${formatClock(entry.endedAt)}` : ' – сейчас'}
        </p>
      </div>
      <span className="font-mono text-sm tabular-nums text-slate-600 dark:text-slate-300">
        {formatDuration(duration)}
      </span>
      <div className="hidden gap-1 group-hover:flex">
        <button
          onClick={() => setEditing(true)}
          aria-label="Редактировать запись"
          className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          ✎
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          aria-label="Удалить запись"
          className="rounded px-2 py-1 text-xs text-red-500 hover:bg-red-100 dark:hover:bg-red-950"
        >
          ✕
        </button>
      </div>
    </li>
  )
}
