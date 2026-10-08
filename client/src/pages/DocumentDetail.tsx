import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, type Document, type DocumentType } from "../api";
import { Card, PageHeader } from "../components/ui";

const typeLabels: Record<DocumentType, string> = {
  RECEIPT: "Приёмка",
  WRITEOFF: "Списание",
  TRANSFER: "Перемещение",
  INVENTORY: "Инвентаризация",
};

export function DocumentDetail() {
  const { id } = useParams();
  const [doc, setDoc] = useState<Document | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Document>(`/documents/${id}`)
      .then(setDoc)
      .catch((err) => setError(err instanceof Error ? err.message : "Ошибка загрузки"));
  }, [id]);

  if (error) return <div className="rounded-md bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>;
  if (!doc) return <div className="text-gray-500">Загрузка...</div>;

  return (
    <div>
      <PageHeader title={`${typeLabels[doc.type]} ${doc.number}`} />
      <Link to="/documents" className="text-sm text-brand-600 hover:underline mb-4 inline-block">
        ← К списку документов
      </Link>

      <Card className="p-4 mb-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-gray-500">Дата:</span> {new Date(doc.date).toLocaleString("ru-RU")}
        </div>
        {doc.supplier && (
          <div>
            <span className="text-gray-500">Поставщик:</span> {doc.supplier.name}
          </div>
        )}
        {doc.fromWarehouse && (
          <div>
            <span className="text-gray-500">Со склада:</span> {doc.fromWarehouse.name}
          </div>
        )}
        {doc.toWarehouse && (
          <div>
            <span className="text-gray-500">На склад:</span> {doc.toWarehouse.name}
          </div>
        )}
        {doc.comment && (
          <div className="col-span-2">
            <span className="text-gray-500">Комментарий:</span> {doc.comment}
          </div>
        )}
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">Товар</th>
              <th className="px-4 py-2">Ед.</th>
              {doc.type === "INVENTORY" ? (
                <th className="px-4 py-2">Фактическое кол-во</th>
              ) : (
                <>
                  <th className="px-4 py-2">Количество</th>
                  {doc.type === "RECEIPT" && <th className="px-4 py-2">Цена</th>}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {doc.items.map((item) => (
              <tr key={item.id} className="border-t">
                <td className="px-4 py-2">{item.product.name}</td>
                <td className="px-4 py-2">{item.product.unit.shortName}</td>
                {doc.type === "INVENTORY" ? (
                  <td className="px-4 py-2">{item.countedQty}</td>
                ) : (
                  <>
                    <td className="px-4 py-2">{item.quantity}</td>
                    {doc.type === "RECEIPT" && (
                      <td className="px-4 py-2">{item.price.toLocaleString("ru-RU")} ₸</td>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
