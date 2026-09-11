import type { Project, TimeEntry } from '../types'
import { formatDuration, startOfDay, startOfWeek } from '../utils/time'

interface Props {
  entries: TimeEntry[]
  projects: Project[]
}

function durationOf(entry: TimeEntry): number {
  return (entry.endedAt ?? Date.now()) - entry.startedAt
}

function totalSince(entries: TimeEntry[], since: number): number {
  return entries.filter((e) => e.startedAt >= since).reduce((sum, e) => sum + durationOf(e), 0)
}

export function Summary({ entries, projects }: Props) {
  const todayStart = startOfDay(new Date())
  const weekStart = startOfWeek(new Date())

  const todayTotal = totalSince(entries, todayStart)
  const weekTotal = totalSince(entries, weekStart)

  const weekEntries = entries.filter((e) => e.startedAt >= weekStart)
  const byProject = new Map<string, number>()
  for (const e of weekEntries) {
    byProject.set(e.projectId, (byProject.get(e.projectId) ?? 0) + durationOf(e))
  }
  const rows = [...byProject.entries()]
    .map(([projectId, ms]) => ({ project: projects.find((p) => p.id === projectId), ms }))
    .sort((a, b) => b.ms - a.ms)
  const maxMs = Math.max(1, ...rows.map((r) => r.ms))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 font-semibold">Сводка</h2>
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">Сегодня</p>
          <p className="font-mono text-lg tabular-nums">{formatDuration(todayTotal)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-xs text-slate-500 dark:text-slate-400">Эта неделя</p>
          <p className="font-mono text-lg tabular-nums">{formatDuration(weekTotal)}</p>
        </div>
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">По проектам за неделю</p>
      <div className="flex flex-col gap-2">
        {rows.length === 0 && <p className="text-sm text-slate-400">Нет данных за эту неделю.</p>}
        {rows.map(({ project, ms }) => (
          <div key={project?.id ?? 'unknown'} className="flex items-center gap-2">
            <span className="w-24 shrink-0 truncate text-sm">{project?.name ?? 'Удалён'}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full"
                style={{ width: `${(ms / maxMs) * 100}%`, backgroundColor: project?.color ?? '#64748b' }}
              />
            </div>
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-slate-500">
              {formatDuration(ms)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
