import { useEffect, useState } from "react";
import { api, type Unit } from "../api";
import { Button, DangerButton, Input, Label, PageHeader, Card } from "../components/ui";
import { Modal } from "../components/Modal";

export function Units() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", shortName: "" });

  async function load() {
    setLoading(true);
    try {
      setUnits(await api.get<Unit[]>("/units"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate() {
    try {
      await api.post("/units", form);
      setShowModal(false);
      setForm({ name: "", shortName: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить единицу измерения?")) return;
    try {
      await api.del(`/units/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    }
  }

  return (
    <div>
      <PageHeader title="Единицы измерения" action={<Button onClick={() => setShowModal(true)}>+ Добавить</Button>} />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Название</th>
              <th className="px-4 py-2">Сокращение</th>
              <th className="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={3}>Загрузка...</td></tr>
            ) : units.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={3}>Нет данных</td></tr>
            ) : (
              units.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-2">{u.name}</td>
                  <td className="px-4 py-2">{u.shortName}</td>
                  <td className="px-4 py-2 text-right">
                    <DangerButton onClick={() => handleDelete(u.id)}>Удалить</DangerButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <Modal title="Новая единица измерения" onClose={() => setShowModal(false)}>
          <Label>Название</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-3" />
          <Label>Сокращение</Label>
          <Input
            value={form.shortName}
            onChange={(e) => setForm({ ...form, shortName: e.target.value })}
            className="mb-5"
          />
          <Button onClick={handleCreate} className="w-full">Сохранить</Button>
        </Modal>
      )}
    </div>
  );
}
