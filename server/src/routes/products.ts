import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const productsRouter = Router();
productsRouter.use(requireAuth);

const schema = z.object({
  name: z.string().min(1),
  sku: z.string().optional().nullable(),
  unitId: z.number().int(),
  minStock: z.number().optional(),
  costPrice: z.number().optional(),
});

productsRouter.get("/", async (_req, res) => {
  const products = await prisma.product.findMany({
    include: { unit: true },
    orderBy: { name: "asc" },
  });
  res.json(products);
});

productsRouter.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const product = await prisma.product.create({ data: parsed.data, include: { unit: true } });
  res.status(201).json(product);
});

productsRouter.put("/:id", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const product = await prisma.product.update({
    where: { id: Number(req.params.id) },
    data: parsed.data,
    include: { unit: true },
  });
  res.json(product);
});

productsRouter.delete("/:id", async (req, res) => {
  await prisma.product.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});
