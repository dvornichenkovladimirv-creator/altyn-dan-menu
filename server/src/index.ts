import "dotenv/config";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { unitsRouter } from "./routes/units.js";
import { warehousesRouter } from "./routes/warehouses.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { productsRouter } from "./routes/products.js";
import { documentsRouter } from "./routes/documents.js";
import { reportsRouter } from "./routes/reports.js";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/units", unitsRouter);
app.use("/api/warehouses", warehousesRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/products", productsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/reports", reportsRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Внутренняя ошибка сервера" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
