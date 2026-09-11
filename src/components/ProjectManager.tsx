import { useState } from 'react'
import type { Project } from '../types'
import { nextColor } from '../constants'

interface Props {
  projects: Project[]
  onAdd: (project: Project) => void
  onRemove: (id: string) => void
}

export function ProjectManager({ projects, onAdd, onRemove }: Props) {
  const [name, setName] = useState('')

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-3 font-semibold">Проекты</h2>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const trimmed = name.trim()
          if (!trimmed) return
          onAdd({ id: crypto.randomUUID(), name: trimmed, color: nextColor(projects.length) })
          setName('')
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Новый проект"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          Добавить
        </button>
      </form>
      <ul className="flex flex-wrap gap-2">
        {projects.map((p) => (
          <li
            key={p.id}
            className="flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-3 pr-1.5 text-sm dark:border-slate-700"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name}
            <button
              onClick={() => onRemove(p.id)}
              aria-label={`Удалить проект ${p.name}`}
              className="rounded-full px-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              ×
            </button>
          </li>
        ))}
        {projects.length === 0 && (
          <li className="text-sm text-slate-400">Добавьте первый проект, чтобы начать учёт.</li>
        )}
      </ul>
    </div>
  )
}
