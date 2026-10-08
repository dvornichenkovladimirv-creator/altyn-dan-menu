import { Routes, Route } from "react-router-dom";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Warehouses } from "./pages/Warehouses";
import { Suppliers } from "./pages/Suppliers";
import { Units } from "./pages/Units";
import { DocumentsList } from "./pages/DocumentsList";
import { DocumentNew } from "./pages/DocumentNew";
import { DocumentDetail } from "./pages/DocumentDetail";
import { StockReport } from "./pages/StockReport";
import { MovementsReport } from "./pages/MovementsReport";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/products" element={<Products />} />
        <Route path="/warehouses" element={<Warehouses />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/units" element={<Units />} />
        <Route path="/documents" element={<DocumentsList />} />
        <Route path="/documents/new" element={<DocumentNew />} />
        <Route path="/documents/:id" element={<DocumentDetail />} />
        <Route path="/reports/stock" element={<StockReport />} />
        <Route path="/reports/movements" element={<MovementsReport />} />
      </Route>
    </Routes>
  );
}
