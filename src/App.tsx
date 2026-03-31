import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Suppliers from "@/pages/Suppliers";
import SupplierDetail from "@/pages/SupplierDetail";
import Agreements from "@/pages/Agreements";
import Transactions from "@/pages/Transactions";
import UploadPage from "@/pages/Upload";
import Reports from "@/pages/Reports";
import HistoricalData from "@/pages/HistoricalData";
import ShekelCampaign from "@/pages/ShekelCampaign";
import Alerts from "@/pages/Alerts";
import Errors from "@/pages/Errors";
import Reconciliation from "@/pages/Reconciliation";
import Users from "@/pages/Users";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import AIAssistant from "@/pages/AIAssistant";

const queryClient = new QueryClient();

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/suppliers/:id" element={<SupplierDetail />} />
        <Route path="/agreements" element={<Agreements />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/historical" element={<HistoricalData />} />
        <Route path="/shekel-campaign" element={<ShekelCampaign />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/errors" element={<Errors />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="/users" element={<Users />} />
        <Route path="/ai-assistant" element={<AIAssistant />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/*" element={<ProtectedRoutes />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default App;
