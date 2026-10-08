import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Document, type DocumentType } from "../api";
import { Button, Card, PageHeader, Select } from "../components/ui";

const typeLabels: Record<DocumentType, string> = {
  RECEIPT: "Приёмка",
  WRITEOFF: "Списание",
  TRANSFER: "Перемещение",
  INVENTORY: "Инвентаризация",
};

export function DocumentsList() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");

  async function load(type: string) {
    setLoading(true);
    try {
      setDocuments(await api.get<Document[]>(`/documents${type ? `?type=${type}` : ""}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  return (
    <div>
      <PageHeader
        title="Документы"
        action={
          <Link to="/documents/new">
            <Button>+ Новый документ</Button>
          </Link>
        }
      />
      {error && <div className="mb-4 rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>}

      <div className="mb-4 max-w-xs">
        <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Все типы</option>
          {Object.entries(typeLabels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Номер</th>
              <th className="px-4 py-2">Тип</th>
              <th className="px-4 py-2">Дата</th>
              <th className="px-4 py-2">Склады</th>
              <th className="px-4 py-2">Позиций</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-3" colSpan={5}>Загрузка...</td></tr>
            ) : documents.length === 0 ? (
              <tr><td className="px-4 py-3 text-gray-400" colSpan={5}>Нет документов</td></tr>
            ) : (
              documents.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-2">
                    <Link to={`/documents/${d.id}`} className="text-brand-600 hover:underline">
                      {d.number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{typeLabels[d.type]}</td>
                  <td className="px-4 py-2">{new Date(d.date).toLocaleString("ru-RU")}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {d.fromWarehouse?.name ?? ""}
                    {d.fromWarehouse && d.toWarehouse ? " → " : ""}
                    {d.toWarehouse?.name ?? ""}
                  </td>
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
