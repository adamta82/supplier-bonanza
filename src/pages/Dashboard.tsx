import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, ShoppingCart, Award, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";

const COLORS = ["hsl(217, 71%, 45%)", "hsl(38, 92%, 50%)", "hsl(142, 71%, 40%)", "hsl(0, 72%, 51%)", "hsl(280, 60%, 50%)"];

export default function Dashboard() {
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
      const { data } = await supabase.from("purchase_records").select("supplier_name, total_amount");
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

  // Calculate totals
  const totalPurchases = purchases?.reduce((sum, p) => sum + (p.total_amount || 0), 0) || 0;
  const totalTransactionBonus = transactionBonuses?.reduce((sum, t) => sum + (t.bonus_value || 0), 0) || 0;
  const activeAgreements = agreements?.length || 0;

  // Purchases by supplier for chart
  const purchasesBySupplier = purchases?.reduce((acc, p) => {
    const name = p.supplier_name || "לא ידוע";
    acc[name] = (acc[name] || 0) + (p.total_amount || 0);
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(purchasesBySupplier || {})
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Bonus type distribution
  const bonusTypeLabels: Record<string, string> = {
    annual_target: "שנתי/יעדים",
    marketing: "שיווק",
    transaction: "עסקה",
    annual_fixed: "שנתי קבוע",
    network: "רשתי",
  };

  const bonusByType = agreements?.reduce((acc, a) => {
    const label = bonusTypeLabels[a.bonus_type] || a.bonus_type;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const pieData = Object.entries(bonusByType || {}).map(([name, value]) => ({ name, value }));

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

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>מחזור רכישות לפי ספק</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                  <YAxis type="category" dataKey="name" width={120} />
                  <Tooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
                  <Bar dataKey="amount" fill="hsl(217, 71%, 45%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-12">אין נתוני רכישות עדיין. העלה קובץ Excel כדי לראות נתונים.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>התפלגות בונוסים לפי סוג</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-muted-foreground text-center py-12">אין הסכמי בונוסים עדיין.</p>
            )}
          </CardContent>
        </Card>
      </div>

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
