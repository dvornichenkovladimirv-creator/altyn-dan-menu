import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type DocumentType, type Product, type Supplier, type Warehouse } from "../api";
import { Button, Card, Input, Label, PageHeader, Select, SecondaryButton } from "../components/ui";

type Row = { productId: string; quantity: string; price: string; countedQty: string };
const emptyRow: Row = { productId: "", quantity: "", price: "", countedQty: "" };

const typeLabels: Record<DocumentType, string> = {
  RECEIPT: "Приёмка",
  WRITEOFF: "Списание",
  TRANSFER: "Перемещение",
  INVENTORY: "Инвентаризация",
};

export function DocumentNew() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [type, setType] = useState<DocumentType>("RECEIPT");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [comment, setComment] = useState("");
  const [rows, setRows] = useState<Row[]>([{ ...emptyRow }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get<Product[]>("/products"),
      api.get<Warehouse[]>("/warehouses"),
      api.get<Supplier[]>("/suppliers"),
    ]).then(([p, w, s]) => {
      setProducts(p);
      setWarehouses(w);
      setSuppliers(s);
    });
  }, []);

  function updateRow(index: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { ...emptyRow }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError(null);
    const items = rows
      .filter((r) => r.productId)
      .map((r) => ({
        productId: Number(r.productId),
        quantity: r.quantity ? Number(r.quantity) : undefined,
        price: r.price ? Number(r.price) : undefined,
        countedQty: r.countedQty ? Number(r.countedQty) : undefined,
      }));
    if (items.length === 0) {
      setError("Добавьте хотя бы одну позицию");
      return;
    }

    setSaving(true);
    try {
      const doc = await api.post<{ id: number }>("/documents", {
        type,
        comment: comment || undefined,
        supplierId: type === "RECEIPT" && supplierId ? Number(supplierId) : undefined,
        fromWarehouseId:
          type === "WRITEOFF" || type === "TRANSFER" ? Number(fromWarehouseId) || undefined : undefined,
        toWarehouseId:
          type === "RECEIPT" || type === "TRANSFER" || type === "INVENTORY"
            ? Number(toWarehouseId) || undefined
            : undefined,
        items,
      });
      navigate(`/documents/${doc.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  const needsFrom = type === "WRITEOFF" || type === "TRANSFER";
  const needsTo = type === "RECEIPT" || type === "TRANSFER" || type === "INVENTORY";

  return (
    <div>
      <PageHeader title="Новый документ" />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}

      <Card className="p-5 mb-5">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Тип документа</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
              {Object.entries(typeLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </div>

          {needsFrom && (
            <div>
              <Label>Со склада</Label>
              <Select value={fromWarehouseId} onChange={(e) => setFromWarehouseId(e.target.value)}>
                <option value="">Выберите...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {needsTo && (
            <div>
              <Label>{type === "INVENTORY" ? "Склад" : "На склад"}</Label>
              <Select value={toWarehouseId} onChange={(e) => setToWarehouseId(e.target.value)}>
                <option value="">Выберите...</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {type === "RECEIPT" && (
            <div>
              <Label>Поставщик</Label>
              <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Не указан</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <div className="mt-4">
          <Label>Комментарий</Label>
          <Input value={comment} onChange={(e) => setComment(e.target.value)} />
        </div>
      </Card>

      <Card className="p-5">
        <div className="font-medium mb-3">Позиции</div>
        <table className="w-full text-sm mb-3">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1 pr-2">Товар</th>
              {type === "INVENTORY" ? (
                <th className="py-1 pr-2">Фактическое кол-во</th>
              ) : (
                <>
                  <th className="py-1 pr-2">Количество</th>
                  {type === "RECEIPT" && <th className="py-1 pr-2">Цена</th>}
                </>
              )}
              <th className="py-1 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="py-1 pr-2">
                  <Select value={row.productId} onChange={(e) => updateRow(i, { productId: e.target.value })}>
                    <option value="">Выберите товар...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.unit.shortName})
                      </option>
                    ))}
                  </Select>
                </td>
                {type === "INVENTORY" ? (
                  <td className="py-1 pr-2">
                    <Input
                      type="number"
                      value={row.countedQty}
                      onChange={(e) => updateRow(i, { countedQty: e.target.value })}
                    />
                  </td>
                ) : (
                  <>
                    <td className="py-1 pr-2">
                      <Input
                        type="number"
                        value={row.quantity}
                        onChange={(e) => updateRow(i, { quantity: e.target.value })}
                      />
                    </td>
                    {type === "RECEIPT" && (
                      <td className="py-1 pr-2">
                        <Input
                          type="number"
                          value={row.price}
                          onChange={(e) => updateRow(i, { price: e.target.value })}
                        />
                      </td>
                    )}
                  </>
                )}
                <td className="py-1">
                  <button
                    onClick={() => removeRow(i)}
                    className="text-red-500 hover:text-red-700 px-2"
                    type="button"
                  >
                    &times;
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <SecondaryButton onClick={addRow} type="button">
          + Добавить позицию
        </SecondaryButton>
      </Card>

      <div className="mt-5">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Сохранение..." : "Создать документ"}
        </Button>
      </div>
    </div>
  );
}
