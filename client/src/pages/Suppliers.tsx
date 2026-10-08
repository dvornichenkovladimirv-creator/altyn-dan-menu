import { useEffect, useState } from "react";
import { api, type Supplier } from "../api";
import { Button, DangerButton, Input, Label, PageHeader, Card } from "../components/ui";
import { Modal } from "../components/Modal";

export function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });

  async function load() {
    setLoading(true);
    try {
      setSuppliers(await api.get<Supplier[]>("/suppliers"));
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
      await api.post("/suppliers", form);
      setShowModal(false);
      setForm({ name: "", phone: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить поставщика?")) return;
    try {
      await api.del(`/suppliers/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    }
  }

  return (
    <div>
      <PageHeader title="Поставщики" action={<Button onClick={() => setShowModal(true)}>+ Добавить</Button>} />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Название</th>
              <th className="px-4 py-2">Телефон</th>
              <th className="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={3}>Загрузка...</td></tr>
            ) : suppliers.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={3}>Нет данных</td></tr>
            ) : (
              suppliers.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-4 py-2">{s.name}</td>
                  <td className="px-4 py-2">{s.phone || "—"}</td>
                  <td className="px-4 py-2 text-right">
                    <DangerButton onClick={() => handleDelete(s.id)}>Удалить</DangerButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <Modal title="Новый поставщик" onClose={() => setShowModal(false)}>
          <Label>Название</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-3" />
          <Label>Телефон</Label>
          <Input
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            className="mb-5"
          />
          <Button onClick={handleCreate} className="w-full">Сохранить</Button>
        </Modal>
      )}
    </div>
  );
}
