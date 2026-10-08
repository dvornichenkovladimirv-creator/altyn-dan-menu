import { Router } from "express";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

/** Current stock balances, optionally filtered by warehouse. */
reportsRouter.get("/stock", async (req, res) => {
  const { warehouseId } = req.query;
  const balances = await prisma.stockBalance.findMany({
    where: {
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      quantity: { not: 0 },
    },
    include: {
      product: { include: { unit: true } },
      warehouse: true,
    },
    orderBy: [{ warehouse: { name: "asc" } }, { product: { name: "asc" } }],
  });

  const rows = balances.map((b) => ({
    warehouseId: b.warehouseId,
    warehouseName: b.warehouse.name,
    productId: b.productId,
    productName: b.product.name,
    unit: b.product.unit.shortName,
    quantity: b.quantity,
    avgCost: b.avgCost,
    total: b.quantity * b.avgCost,
  }));

  const totalValue = rows.reduce((sum, r) => sum + r.total, 0);
  res.json({ rows, totalValue });
});

/** Movement journal, filterable by product/warehouse/date range. */
reportsRouter.get("/movements", async (req, res) => {
  const { productId, warehouseId, from, to } = req.query;
  const movements = await prisma.stockMovement.findMany({
    where: {
      productId: productId ? Number(productId) : undefined,
      warehouseId: warehouseId ? Number(warehouseId) : undefined,
      createdAt: {
        gte: from ? new Date(String(from)) : undefined,
        lte: to ? new Date(String(to)) : undefined,
      },
    },
    include: {
      product: { include: { unit: true } },
      warehouse: true,
      document: true,
    },
    orderBy: { id: "desc" },
    take: 500,
  });
  res.json(movements);
});

/** Dashboard summary. */
reportsRouter.get("/summary", async (_req, res) => {
  const [productCount, warehouseCount, documentCount, balances, recentDocuments] = await Promise.all([
    prisma.product.count(),
    prisma.warehouse.count(),
    prisma.document.count(),
    prisma.stockBalance.findMany(),
    prisma.document.findMany({
      orderBy: { id: "desc" },
      take: 5,
      include: { items: true, fromWarehouse: true, toWarehouse: true },
    }),
  ]);
  const totalStockValue = balances.reduce((sum, b) => sum + b.quantity * b.avgCost, 0);
  res.json({ productCount, warehouseCount, documentCount, totalStockValue, recentDocuments });
});
