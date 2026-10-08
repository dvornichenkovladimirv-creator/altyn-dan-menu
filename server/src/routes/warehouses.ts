import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const warehousesRouter = Router();
warehousesRouter.use(requireAuth);

const schema = z.object({
  name: z.string().min(1),
  address: z.string().optional().nullable(),
});

warehousesRouter.get("/", async (_req, res) => {
  const warehouses = await prisma.warehouse.findMany({ orderBy: { name: "asc" } });
  res.json(warehouses);
});

warehousesRouter.post("/", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const warehouse = await prisma.warehouse.create({ data: parsed.data });
  res.status(201).json(warehouse);
});

warehousesRouter.put("/:id", async (req, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const warehouse = await prisma.warehouse.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(warehouse);
});

warehousesRouter.delete("/:id", async (req, res) => {
  await prisma.warehouse.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});
