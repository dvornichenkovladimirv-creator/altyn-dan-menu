import { useLocalStorage } from './hooks/useLocalStorage'
import { ProjectManager } from './components/ProjectManager'
import { Tracker } from './components/Tracker'
import { EntryList } from './components/EntryList'
import { Summary } from './components/Summary'
import type { Project, TimeEntry } from './types'
import { PROJECT_COLORS } from './constants'

const DEFAULT_PROJECTS: Project[] = [
  { id: 'default-work', name: 'Работа', color: PROJECT_COLORS[0] },
  { id: 'default-meetings', name: 'Встречи', color: PROJECT_COLORS[1] },
]

function App() {
  const [projects, setProjects] = useLocalStorage<Project[]>('tt.projects', DEFAULT_PROJECTS)
  const [entries, setEntries] = useLocalStorage<TimeEntry[]>('tt.entries', [])

  const runningEntry = entries.find((e) => e.endedAt === null)

  function handleStart(projectId: string, description: string) {
    if (runningEntry) return
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), projectId, description, startedAt: Date.now(), endedAt: null },
    ])
  }

  function handleStop() {
    setEntries((prev) =>
      prev.map((e) => (e.endedAt === null ? { ...e, endedAt: Date.now() } : e)),
    )
  }

  function handleUpdate(id: string, patch: Partial<TimeEntry>) {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  function handleDelete(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  function handleAddManual(entry: TimeEntry) {
    setEntries((prev) => [...prev, entry])
  }

  function handleAddProject(project: Project) {
    setProjects((prev) => [...prev, project])
  }

  function handleRemoveProject(id: string) {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    setEntries((prev) => prev.filter((e) => e.projectId !== id))
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold">Учёт рабочего времени</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Данные хранятся локально в вашем браузере.
        </p>
      </header>

      <Tracker
        projects={projects}
        runningEntry={runningEntry}
        onStart={handleStart}
        onStop={handleStop}
      />

      <ProjectManager projects={projects} onAdd={handleAddProject} onRemove={handleRemoveProject} />

      <Summary entries={entries} projects={projects} />

      <EntryList
        entries={entries}
        projects={projects}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onAddManual={handleAddManual}
      />
    </div>
  )
}

export default App
