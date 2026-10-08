import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireAuth } from "../auth.js";

export const unitsRouter = Router();
unitsRouter.use(requireAuth);

const unitSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
});

unitsRouter.get("/", async (_req, res) => {
  const units = await prisma.unit.findMany({ orderBy: { name: "asc" } });
  res.json(units);
});

unitsRouter.post("/", async (req, res) => {
  const parsed = unitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const unit = await prisma.unit.create({ data: parsed.data });
  res.status(201).json(unit);
});

unitsRouter.put("/:id", async (req, res) => {
  const parsed = unitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Неверные данные" });
  const unit = await prisma.unit.update({ where: { id: Number(req.params.id) }, data: parsed.data });
  res.json(unit);
});

unitsRouter.delete("/:id", async (req, res) => {
  await prisma.unit.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});
