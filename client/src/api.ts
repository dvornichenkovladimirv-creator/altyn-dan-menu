const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.error ?? `Ошибка запроса (${res.status})`);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>(path),
  post: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T,>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T,>(path: string) => request<T>(path, { method: "DELETE" }),
};

export type Unit = { id: number; name: string; shortName: string };
export type Warehouse = { id: number; name: string; address?: string | null };
export type Supplier = { id: number; name: string; phone?: string | null };
export type Product = {
  id: number;
  name: string;
  sku?: string | null;
  unitId: number;
  unit: Unit;
  minStock: number;
  costPrice: number;
};

export type DocumentType = "RECEIPT" | "WRITEOFF" | "TRANSFER" | "INVENTORY";

export type DocumentItem = {
  id: number;
  productId: number;
  product: Product;
  quantity: number;
  price: number;
  countedQty: number | null;
};

export type Document = {
  id: number;
  type: DocumentType;
  number: string;
  date: string;
  comment?: string | null;
  supplierId?: number | null;
  supplier?: Supplier | null;
  fromWarehouseId?: number | null;
  fromWarehouse?: Warehouse | null;
  toWarehouseId?: number | null;
  toWarehouse?: Warehouse | null;
  items: DocumentItem[];
};

export type StockRow = {
  warehouseId: number;
  warehouseName: string;
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  avgCost: number;
  total: number;
};

export type Movement = {
  id: number;
  productId: number;
  product: Product;
  warehouseId: number;
  warehouse: Warehouse;
  direction: "IN" | "OUT";
  quantity: number;
  cost: number;
  documentId: number;
  document: Document;
  createdAt: string;
};

export type Summary = {
  productCount: number;
  warehouseCount: number;
  documentCount: number;
  totalStockValue: number;
  recentDocuments: Document[];
};
