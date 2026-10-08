import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./db.js";

async function main() {
  const adminEmail = "admin@warehouse.local";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const hash = await bcrypt.hash("admin123", 10);
    await prisma.user.create({
      data: { email: adminEmail, name: "Администратор", password: hash, role: "ADMIN" },
    });
    console.log(`Создан пользователь: ${adminEmail} / admin123`);
  }

  const units = [
    { name: "Килограмм", shortName: "кг" },
    { name: "Литр", shortName: "л" },
    { name: "Штука", shortName: "шт" },
  ];
  for (const u of units) {
    await prisma.unit.upsert({ where: { name: u.name }, update: {}, create: u });
  }

  const warehouses = ["Основной склад", "Кухня"];
  for (const name of warehouses) {
    await prisma.warehouse.upsert({ where: { name }, update: {}, create: { name } });
  }

  await prisma.supplier.upsert({
    where: { name: "ТОО Снаб Трейд" },
    update: {},
    create: { name: "ТОО Снаб Трейд", phone: "+7 700 000 00 00" },
  });

  const kg = await prisma.unit.findUniqueOrThrow({ where: { name: "Килограмм" } });
  const pcs = await prisma.unit.findUniqueOrThrow({ where: { name: "Штука" } });

  const products = [
    { name: "Мука пшеничная", unitId: kg.id, sku: "FLOUR-001", minStock: 10, costPrice: 350 },
    { name: "Сахар", unitId: kg.id, sku: "SUGAR-001", minStock: 5, costPrice: 400 },
    { name: "Куриное филе", unitId: kg.id, sku: "CHKN-001", minStock: 8, costPrice: 1800 },
    { name: "Яйцо куриное", unitId: pcs.id, sku: "EGG-001", minStock: 30, costPrice: 45 },
  ];
  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (!existing) await prisma.product.create({ data: p });
  }

  console.log("Сид завершён.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
