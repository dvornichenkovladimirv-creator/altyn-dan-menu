import { useEffect, useState } from "react";
import { api, type Product, type Unit } from "../api";
import { Button, DangerButton, Input, Label, PageHeader, Card, Select } from "../components/ui";
import { Modal } from "../components/Modal";

const emptyForm = { name: "", sku: "", unitId: "", minStock: "0", costPrice: "0" };

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([api.get<Product[]>("/products"), api.get<Unit[]>("/units")]);
      setProducts(p);
      setUnits(u);
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
    if (!form.unitId) {
      setError("Выберите единицу измерения");
      return;
    }
    try {
      await api.post("/products", {
        name: form.name,
        sku: form.sku || null,
        unitId: Number(form.unitId),
        minStock: Number(form.minStock),
        costPrice: Number(form.costPrice),
      });
      setShowModal(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Удалить товар?")) return;
    try {
      await api.del(`/products/${id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    }
  }

  return (
    <div>
      <PageHeader title="Номенклатура" action={<Button onClick={() => setShowModal(true)}>+ Добавить</Button>} />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Название</th>
              <th className="px-4 py-2">Артикул</th>
              <th className="px-4 py-2">Ед. изм.</th>
              <th className="px-4 py-2">Мин. остаток</th>
              <th className="px-4 py-2">Себестоимость</th>
              <th className="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={6}>Загрузка...</td></tr>
            ) : products.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={6}>Нет данных</td></tr>
            ) : (
              products.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2">{p.name}</td>
                  <td className="px-4 py-2">{p.sku || "—"}</td>
                  <td className="px-4 py-2">{p.unit.shortName}</td>
                  <td className="px-4 py-2">{p.minStock}</td>
                  <td className="px-4 py-2">{p.costPrice.toLocaleString("ru-RU")} ₸</td>
                  <td className="px-4 py-2 text-right">
                    <DangerButton onClick={() => handleDelete(p.id)}>Удалить</DangerButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {showModal && (
        <Modal title="Новый товар" onClose={() => setShowModal(false)}>
          <Label>Название</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mb-3" />
          <Label>Артикул</Label>
          <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="mb-3" />
          <Label>Единица измерения</Label>
          <Select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} className="mb-3">
            <option value="">Выберите...</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.shortName})
              </option>
            ))}
          </Select>
          <Label>Минимальный остаток</Label>
          <Input
            type="number"
            value={form.minStock}
            onChange={(e) => setForm({ ...form, minStock: e.target.value })}
            className="mb-3"
          />
          <Label>Себестоимость</Label>
          <Input
            type="number"
            value={form.costPrice}
            onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
            className="mb-5"
          />
          <Button onClick={handleCreate} className="w-full">Сохранить</Button>
        </Modal>
      )}
    </div>
  );
}
