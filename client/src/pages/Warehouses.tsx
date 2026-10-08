import { useEffect, useState } from "react";
import { api, type Warehouse } from "../api";
import { Button, DangerButton, Input, Label, PageHeader, Card } from "../components/ui";
import { Modal } from "../components/Modal";

export function Warehouses() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });

  async function load() {
    setLoading(true);
    try {
      setWarehouses(await api.get<Warehouse[]>("/warehouses"));
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
      await api.post("/warehouses", form);
      setShowModal(false);
      setForm({ name: "", address: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить склад?")) return;
    try {
      await api.del(`/warehouses/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    }
  }

  return (
    <div>
      <PageHeader title="Склады" action={<Button onClick={() => setShowModal(true)}>+ Добавить</Button>} />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Название</th>
              <th className="px-4 py-2">Адрес</th>
              <th className="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={3}>Загрузка...</td></tr>
            ) : warehouses.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={3}>Нет данных</td></tr>
            ) : (
              warehouses.map((w) => (
                <tr key={w.id} className="border-t">
                  <td className="px-4 py-2">{w.name}</td>
                  <td className="px-4 py-2">{w.address || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DangerButton onClick={() => handleDelete(w.id)}>Удалить</DangerButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <Modal title="Новый склад" onClose={() => setShowModal(false)}>
          <Label>Название</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-3" />
          <Label>Адрес</Label>
          <Input
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="mb-5"
          />
          <Button onClick={handleCreate} className="w-full">Сохранить</Button>
        </Modal>
      )}
    </div>
  );
}
