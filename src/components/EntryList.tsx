import { useState } from 'react'
import type { Project, TimeEntry } from '../types'
import { EntryRow } from './EntryRow'
import { formatDateLabel, formatDuration, startOfDay } from '../utils/time'

interface Props {
  entries: TimeEntry[]
  projects: Project[]
  onUpdate: (id: string, patch: Partial<TimeEntry>) => void
  onDelete: (id: string) => void
  onAddManual: (entry: TimeEntry) => void
}

export function EntryList({ entries, projects, onUpdate, onDelete, onAddManual }: Props) {
  const [showManual, setShowManual] = useState(false)

  const groups = new Map<number, TimeEntry[]>()
  for (const entry of entries) {
    const day = startOfDay(new Date(entry.startedAt))
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day)!.push(entry)
  }
  const days = [...groups.keys()].sort((a, b) => b - a)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Записи</h2>
        <button
          onClick={() => setShowManual((v) => !v)}
          className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {showManual ? 'Отмена' : '+ Добавить вручную'}
        </button>
      </div>

      {showManual && (
        <ManualEntryForm
          projects={projects}
          onSubmit={(entry) => {
            onAddManual(entry)
            setShowManual(false)
          }}
        />
      )}

      {days.length === 0 && (
        <p className="py-6 text-center text-sm text-slate-400">Пока нет записей. Запустите таймер выше.</p>
      )}

      <div className="flex flex-col gap-4">
        {days.map((day) => {
          const dayEntries = groups
            .get(day)!
            .sort((a, b) => b.startedAt - a.startedAt)
          const total = dayEntries.reduce(
            (sum, e) => sum + ((e.endedAt ?? Date.now()) - e.startedAt),
            0,
          )
          return (
            <div key={day}>
              <div className="mb-1 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-400">
                <span>{formatDateLabel(day)}</span>
                <span className="font-mono">{formatDuration(total)}</span>
              </div>
              <ul className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
                {dayEntries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    projects={projects}
                    onUpdate={onUpdate}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ManualEntryForm({
  projects,
  onSubmit,
}: {
  projects: Project[]
  onSubmit: (entry: TimeEntry) => void
}) {
  const now = Date.now()
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [start, setStart] = useState(new Date(now - 3600_000).toISOString().slice(0, 16))
  const [end, setEnd] = useState(new Date(now).toISOString().slice(0, 16))

  return (
    <form
      className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
      onSubmit={(e) => {
        e.preventDefault()
        if (!projectId) return
        const startedAt = new Date(start).getTime()
        const endedAt = new Date(end).getTime()
        if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt <= startedAt) return
        onSubmit({ id: crypto.randomUUID(), projectId, description: description.trim(), startedAt, endedAt })
      }}
    >
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Описание"
        className="rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
        >
          {projects.length === 0 && <option value="">Нет проектов</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
        />
        <span className="text-sm text-slate-400">—</span>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-700"
        />
        <button
          type="submit"
          disabled={!projectId}
          className="ml-auto rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Сохранить
        </button>
      </div>
    </form>
  )
}
