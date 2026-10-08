import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const navItems = [
  { to: "/", label: "Дашборд" },
  { to: "/products", label: "Номенклатура" },
  { to: "/warehouses", label: "Склады" },
  { to: "/suppliers", label: "Поставщики" },
  { to: "/units", label: "Единицы измерения" },
  { to: "/documents", label: "Документы" },
  { to: "/reports/stock", label: "Остатки" },
  { to: "/reports/movements", label: "Журнал движений" },
];

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 flex-shrink-0 bg-brand-700 text-white flex flex-col">
        <div className="p-5 text-xl font-bold border-b border-brand-600">СкладКонтроль</div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-brand-600 font-medium" : "hover:bg-brand-600/60"
                }`
              }
              end={item.to === "/"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-brand-600 text-sm">
          <div className="font-medium">{user?.name}</div>
          <div className="text-brand-100 text-xs mb-2">{user?.role}</div>
          <button
            onClick={handleLogout}
            className="w-full rounded-md bg-brand-600 hover:bg-brand-500 px-3 py-1.5 text-sm"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
