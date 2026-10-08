import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const DOCUMENT_TYPES = ["RECEIPT", "WRITEOFF", "TRANSFER", "INVENTORY"] as const;
const PREFIX: Record<string, string> = {
  RECEIPT: "PR",
  WRITEOFF: "WO",
  TRANSFER: "TR",
  INVENTORY: "INV",
};

const itemSchema = z.object({
  productId: z.number().int(),
  quantity: z.number().optional(),
  price: z.number().optional(),
  countedQty: z.number().optional(),
});

const documentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  date: z.string().optional(),
  comment: z.string().optional().nullable(),
  supplierId: z.number().int().optional().nullable(),
  fromWarehouseId: z.number().int().optional().nullable(),
  toWarehouseId: z.number().int().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

class DocumentError extends Error {}

documentsRouter.get("/", async (req, res) => {
  const { type } = req.query;
  const documents = await prisma.document.findMany({
    where: type ? { type: String(type) } : undefined,
    include: {
      items: { include: { product: { include: { unit: true } } } },
      supplier: true,
      fromWarehouse: true,
      toWarehouse: true,
    },
    orderBy: { id: "desc" },
  });
  res.json(documents);
});

documentsRouter.get("/:id", async (req, res) => {
  const document = await prisma.document.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      items: { include: { product: { include: { unit: true } } } },
      supplier: true,
      fromWarehouse: true,
      toWarehouse: true,
    },
  });
  if (!document) return res.status(404).json({ error: "Документ не найден" });
  res.json(document);
});

async function nextDocumentNumber(type: string): Promise<string> {
  const count = await prisma.document.count({ where: { type } });
  const year = new Date().getFullYear();
  return `${PREFIX[type]}-${year}-${String(count + 1).padStart(5, "0")}`;
}

/** Fetch-or-create the stock balance row for a product at a warehouse, inside a transaction. */
async function getOrCreateBalance(tx: Prisma.TransactionClient, productId: number, warehouseId: number) {
  const existing = await tx.stockBalance.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
  });
  if (existing) return existing;
  return tx.stockBalance.create({ data: { productId, warehouseId, quantity: 0, avgCost: 0 } });
}

documentsRouter.post("/", async (req, res) => {
  const parsed = documentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Неверные данные" });
  }
  const data = parsed.data;

  if (data.type === "RECEIPT" && !data.toWarehouseId) {
    return res.status(400).json({ error: "Укажите склад поступления" });
  }
  if (data.type === "WRITEOFF" && !data.fromWarehouseId) {
    return res.status(400).json({ error: "Укажите склад списания" });
  }
  if (data.type === "TRANSFER" && (!data.fromWarehouseId || !data.toWarehouseId)) {
    return res.status(400).json({ error: "Укажите склад-отправитель и склад-получатель" });
  }
  if (data.type === "TRANSFER" && data.fromWarehouseId === data.toWarehouseId) {
    return res.status(400).json({ error: "Склад-отправитель и склад-получатель не могут совпадать" });
  }
  if (data.type === "INVENTORY" && !data.toWarehouseId) {
    return res.status(400).json({ error: "Укажите склад для инвентаризации" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(data.type);
      const document = await tx.document.create({
        data: {
          type: data.type,
          number,
          date: data.date ? new Date(data.date) : new Date(),
          comment: data.comment ?? null,
          supplierId: data.supplierId ?? null,
          fromWarehouseId: data.fromWarehouseId ?? null,
          toWarehouseId: data.toWarehouseId ?? null,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity ?? 0,
              price: item.price ?? 0,
              countedQty: item.countedQty ?? null,
            })),
          },
        },
        include: { items: true },
      });

      if (data.type === "RECEIPT") {
        const warehouseId = data.toWarehouseId!;
        for (const item of document.items) {
          if (!item.quantity || item.quantity <= 0) {
            throw new DocumentError("Количество прихода должно быть больше нуля");
          }
          const balance = await getOrCreateBalance(tx, item.productId, warehouseId);
          const totalQty = balance.quantity + item.quantity;
          const avgCost =
            totalQty > 0
              ? (balance.quantity * balance.avgCost + item.quantity * item.price) / totalQty
              : 0;
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: { quantity: totalQty, avgCost },
          });
          await tx.product.update({ where: { id: item.productId }, data: { costPrice: item.price } });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId,
              direction: "IN",
              quantity: item.quantity,
              cost: item.price,
              documentId: document.id,
            },
          });
        }
      }

      if (data.type === "WRITEOFF") {
        const warehouseId = data.fromWarehouseId!;
        for (const item of document.items) {
          if (!item.quantity || item.quantity <= 0) {
            throw new DocumentError("Количество списания должно быть больше нуля");
          }
          const balance = await getOrCreateBalance(tx, item.productId, warehouseId);
          if (balance.quantity < item.quantity) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            throw new DocumentError(
              `Недостаточно остатка "${product?.name ?? item.productId}" на складе (есть ${balance.quantity}, требуется ${item.quantity})`,
            );
          }
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: { quantity: balance.quantity - item.quantity },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId,
              direction: "OUT",
              quantity: item.quantity,
              cost: balance.avgCost,
              documentId: document.id,
            },
          });
        }
      }

      if (data.type === "TRANSFER") {
        const fromId = data.fromWarehouseId!;
        const toId = data.toWarehouseId!;
        for (const item of document.items) {
          if (!item.quantity || item.quantity <= 0) {
            throw new DocumentError("Количество перемещения должно быть больше нуля");
          }
          const fromBalance = await getOrCreateBalance(tx, item.productId, fromId);
          if (fromBalance.quantity < item.quantity) {
            const product = await tx.product.findUnique({ where: { id: item.productId } });
            throw new DocumentError(
              `Недостаточно остатка "${product?.name ?? item.productId}" на складе-отправителе (есть ${fromBalance.quantity}, требуется ${item.quantity})`,
            );
          }
          await tx.stockBalance.update({
            where: { id: fromBalance.id },
            data: { quantity: fromBalance.quantity - item.quantity },
          });

          const toBalance = await getOrCreateBalance(tx, item.productId, toId);
          const totalQty = toBalance.quantity + item.quantity;
          const avgCost =
            totalQty > 0
              ? (toBalance.quantity * toBalance.avgCost + item.quantity * fromBalance.avgCost) / totalQty
              : 0;
          await tx.stockBalance.update({
            where: { id: toBalance.id },
            data: { quantity: totalQty, avgCost },
          });

          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId: fromId,
              direction: "OUT",
              quantity: item.quantity,
              cost: fromBalance.avgCost,
              documentId: document.id,
            },
          });
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              warehouseId: toId,
              direction: "IN",
              quantity: item.quantity,
              cost: fromBalance.avgCost,
              documentId: document.id,
            },
          });
        }
      }

      if (data.type === "INVENTORY") {
        const warehouseId = data.toWarehouseId!;
        for (const item of document.items) {
          if (item.countedQty === null || item.countedQty === undefined || item.countedQty < 0) {
            throw new DocumentError("Укажите фактическое количество для инвентаризации");
          }
          const balance = await getOrCreateBalance(tx, item.productId, warehouseId);
          const diff = item.countedQty - balance.quantity;
          if (diff !== 0) {
            await tx.stockMovement.create({
              data: {
                productId: item.productId,
                warehouseId,
                direction: diff > 0 ? "IN" : "OUT",
                quantity: Math.abs(diff),
                cost: balance.avgCost,
                documentId: document.id,
              },
            });
          }
          await tx.stockBalance.update({
            where: { id: balance.id },
            data: { quantity: item.countedQty },
          });
        }
      }

      return document;
    });

    const full = await prisma.document.findUnique({
      where: { id: result.id },
      include: {
        items: { include: { product: { include: { unit: true } } } },
        supplier: true,
        fromWarehouse: true,
        toWarehouse: true,
      },
    });
    res.status(201).json(full);
  } catch (err) {
    if (err instanceof DocumentError) {
      return res.status(400).json({ error: err.message });
    }
    throw err;
  }
});
