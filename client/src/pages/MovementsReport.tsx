import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Movement, type Warehouse } from "../api";
import { Card, PageHeader, Select } from "../components/ui";

export function MovementsReport() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Warehouse[]>("/warehouses").then(setWarehouses);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get<Movement[]>(`/reports/movements${warehouseId ? `?warehouseId=${warehouseId}` : ""}`)
      .then(setMovements)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [warehouseId]);

  return (
    <div>
      <PageHeader title="Журнал движений" />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="mb-4 max-w-xs">
        <Select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">Все склады</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Дата</th>
              <th className="px-4 py-2">Склад</th>
              <th className="px-4 py-2">Товар</th>
              <th className="px-4 py-2">Движение</th>
              <th className="px-4 py-2">Кол-во</th>
              <th className="px-4 py-2">Документ</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={6}>Загрузка...</td></tr>
            ) : movements.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={6}>Нет движений</td></tr>
            ) : (
              movements.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-4 py-2">{new Date(m.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-2">{m.warehouse.name}</td>
                  <td className="px-4 py-2">{m.product.name}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        m.direction === "IN" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                      }`}
                    >
                      {m.direction === "IN" ? "Приход" : "Расход"}
                    </span>
                  </td>
                  <td className="px-4 py-2">{m.quantity}</td>
                  <td className="px-4 py-2">
                    <Link to={`/documents/${m.documentId}`} className="text-brand-600 hover:underline">
                      {m.document.number}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
