import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

const schema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
});

suppliersRouter.get("/", async (_req, res) => {
  const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  res.json(suppliers);
});

suppliersRouter.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const supplier = await prisma.supplier.create({ data: parsed.data });
  res.status(201).json(supplier);
});

suppliersRouter.put("/:id", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const supplier = await prisma.supplier.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(supplier);
});

suppliersRouter.delete("/:id", async (req, res) => {
  await prisma.supplier.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});
