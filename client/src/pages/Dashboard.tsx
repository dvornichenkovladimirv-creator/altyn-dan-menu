import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Summary } from "../api";
import { Card, PageHeader } from "../components/ui";

const typeLabels: Record<string, string> = {
  RECEIPT: "Приёмка",
  WRITEOFF: "Списание",
  TRANSFER: "Перемещение",
  INVENTORY: "Инвентаризация",
};

export function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Summary>("/reports/summary")
      .then(setSummary)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, []);

  return (
    <div>
      <PageHeader title="Дашборд" />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard label="Товаров" value={summary?.productCount ?? "—"} />
        <StatCard label="Складов" value={summary?.warehouseCount ?? "—"} />
        <StatCard label="Документов" value={summary?.documentCount ?? "—"} />
        <StatCard
          label="Стоимость остатков"
          value={summary ? `${summary.totalStockValue.toLocaleString("ru-RU")} ₸` : "—"}
        />
      </div>

      <Card>
        <div className="px-4 py-3 border-b font-medium flex justify-between items-center">
          <span>Последние документы</span>
          <Link to="/documents" className="text-sm text-brand-600 hover:underline">
            Все документы →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Номер</th>
              <th className="px-4 py-2">Тип</th>
              <th className="px-4 py-2">Дата</th>
              <th className="px-4 py-2">Позиций</th>
            </tr>
          </thead>
          <tbody>
            {!summary || summary.recentDocuments.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={4}>Нет документов</td></tr>
            ) : (
              summary.recentDocuments.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link to={`/documents/${d.id}`} className="text-brand-600 hover:underline">
                      {d.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{typeLabels[d.type]}</td>
                  <td className="px-4 py-2">{new Date(d.date).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-2">{d.items.length}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-800 mt-1">{value}</div>
    </Card>
  );
}
