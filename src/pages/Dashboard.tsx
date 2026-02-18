import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, ShoppingCart, Award, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

type SortOption = "name-asc" | "name-desc" | "amount-desc" | "amount-asc";

export default function Dashboard() {
  const [sortBy, setSortBy] = useState<SortOption>("name-asc");
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*");
      return data || [];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchases-summary"],
    queryFn: async () => {
      const { data } = await supabase.rpc("get_purchases_by_supplier");
      return data || [];
    },
  });

  const { data: agreements } = useQuery({
    queryKey: ["active-agreements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bonus_agreements")
        .select("*, suppliers(name), bonus_tiers(*)")
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: transactionBonuses } = useQuery({
    queryKey: ["transaction-bonuses-sum"],
    queryFn: async () => {
      const { data } = await supabase.from("transaction_bonuses").select("bonus_value");
      return data || [];
    },
  });

  const totalPurchases = purchases?.reduce((sum, p) => sum + (p.total_amount || 0), 0) || 0;
  const totalTransactionBonus = transactionBonuses?.reduce((sum, t) => sum + (t.bonus_value || 0), 0) || 0;
  const activeAgreements = agreements?.length || 0;

  // Purchases by supplier for supplier cards
  const purchasesBySupplier = purchases?.reduce((acc, p) => {
    const name = p.supplier_name || "לא ידוע";
    acc[name] = (acc[name] || 0) + (p.total_amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const sortedSuppliers = useMemo(() => {
    if (!suppliers) return [];
    return [...suppliers].sort((a, b) => {
      const amountA = purchasesBySupplier?.[a.name] || 0;
      const amountB = purchasesBySupplier?.[b.name] || 0;
      switch (sortBy) {
        case "name-asc": return (a.name || "").localeCompare(b.name || "", "he");
        case "name-desc": return (b.name || "").localeCompare(a.name || "", "he");
        case "amount-desc": return amountB - amountA;
        case "amount-asc": return amountA - amountB;
        default: return 0;
      }
    });
  }, [suppliers, purchasesBySupplier, sortBy]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">דשבורד ראשי</h1>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">סה"כ רכישות</p>
                <p className="text-2xl font-bold mt-1">₪{totalPurchases.toLocaleString()}</p>
              </div>
              <ShoppingCart className="w-10 h-10 text-primary opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">הסכמים פעילים</p>
                <p className="text-2xl font-bold mt-1">{activeAgreements}</p>
              </div>
              <Award className="w-10 h-10 text-accent opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">בונוס עסקאות</p>
                <p className="text-2xl font-bold mt-1">₪{totalTransactionBonus.toLocaleString()}</p>
              </div>
              <TrendingUp className="w-10 h-10 text-success opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">ספקים</p>
                <p className="text-2xl font-bold mt-1">{suppliers?.length || 0}</p>
              </div>
              <AlertTriangle className="w-10 h-10 text-warning opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>ספקים</CardTitle>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="מיון" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">שם (א-ת)</SelectItem>
              <SelectItem value="name-desc">שם (ת-א)</SelectItem>
              <SelectItem value="amount-desc">סכום (גבוה לנמוך)</SelectItem>
              <SelectItem value="amount-asc">סכום (נמוך לגבוה)</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {sortedSuppliers.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {sortedSuppliers.map((s: any) => (
                <Link
                  key={s.id}
                  to={`/suppliers/${s.id}`}
                  className="block p-4 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all"
                >
                  <div className="font-semibold text-base mb-1">{s.name}</div>
                  {s.supplier_number && (
                    <div className="text-xs text-muted-foreground">מס׳ {s.supplier_number}</div>
                  )}
                  {purchasesBySupplier?.[s.name] ? (
                    <div className="text-sm font-medium mt-2 text-primary">
                      ₪{purchasesBySupplier[s.name].toLocaleString()}
                    </div>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">אין ספקים עדיין.</p>
          )}
        </CardContent>
      </Card>

      {/* Quick links */}
      <Card>
        <CardHeader>
          <CardTitle>פעולות מהירות</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Link to="/suppliers" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition">הוסף ספק</Link>
          <Link to="/agreements" className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 transition">הוסף הסכם בונוס</Link>
          <Link to="/upload" className="px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm hover:opacity-90 transition">העלה קובץ Excel</Link>
          <Link to="/alerts" className="px-4 py-2 bg-warning text-warning-foreground rounded-lg text-sm hover:opacity-90 transition">התראות יעדים</Link>
        </CardContent>
      </Card>
    </div>
  );
}
