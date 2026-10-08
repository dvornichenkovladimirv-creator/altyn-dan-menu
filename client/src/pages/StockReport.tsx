import { useEffect, useState } from "react";
import { api, type StockRow, type Warehouse } from "../api";
import { Card, PageHeader, Select } from "../components/ui";

export function StockReport() {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [totalValue, setTotalValue] = useState(0);
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
      .get<{ rows: StockRow[]; totalValue: number }>(
        `/reports/stock${warehouseId ? `?warehouseId=${warehouseId}` : ""}`,
      )
      .then((res) => {
        setRows(res.rows);
        setTotalValue(res.totalValue);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [warehouseId]);

  return (
    <div>
      <PageHeader title="Остатки на складах" />
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
              <th className="px-4 py-2">Склад</th>
              <th className="px-4 py-2">Товар</th>
              <th className="px-4 py-2">Кол-во</th>
              <th className="px-4 py-2">Ед.</th>
              <th className="px-4 py-2">Средняя цена</th>
              <th className="px-4 py-2">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={6}>Загрузка...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={6}>Нет остатков</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.warehouseId}-${r.productId}`} className="border-t">
                  <td className="px-4 py-2">{r.warehouseName}</td>
                  <td className="px-4 py-2">{r.productName}</td>
                  <td className="px-4 py-2">{r.quantity}</td>
                  <td className="px-4 py-2">{r.unit}</td>
                  <td className="px-4 py-2">{r.avgCost.toLocaleString("ru-RU")} ₸</td>
                  <td className="px-4 py-2 font-medium">{r.total.toLocaleString("ru-RU")} ₸</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-gray-50 font-semibold">
                <td className="px-4 py-2" colSpan={5}>Итого</td>
                <td className="px-4 py-2">{totalValue.toLocaleString("ru-RU")} ₸</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}
