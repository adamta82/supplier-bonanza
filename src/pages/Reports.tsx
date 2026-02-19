import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function Reports() {
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*");
      return data || [];
    },
  });

  const { data: sales } = useQuery({
    queryKey: ["sales-all"],
    queryFn: async () => {
      const { data } = await supabase.from("sales_records").select("*");
      return data || [];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchases-all"],
    queryFn: async () => {
      const { data } = await supabase.from("purchase_records").select("*");
      return data || [];
    },
  });

  const { data: agreements } = useQuery({
    queryKey: ["agreements-with-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("bonus_agreements").select("*, bonus_tiers(*)").eq("is_active", true);
      return data || [];
    },
  });

  const { data: transactionBonuses } = useQuery({
    queryKey: ["transaction-bonuses-all"],
    queryFn: async () => {
      const { data } = await supabase.from("transaction_bonuses").select("*");
      return data || [];
    },
  });

  // Calculate profitability per supplier
  const supplierReport = suppliers?.map((supplier) => {
    // Direct profit from sales
    const supplierSales = sales?.filter((s) => s.supplier_id === supplier.id || s.supplier_name === supplier.name) || [];
    const totalSales = supplierSales.reduce((sum, s) => sum + ((s.sale_price || 0) * (s.quantity || 1)), 0);
    const totalCost = supplierSales.reduce((sum, s) => sum + ((s.cost_price || 0) * (s.quantity || 1)), 0);
    const directProfit = totalSales - totalCost;

    // Purchase volume
    const supplierPurchases = purchases?.filter((p) => p.supplier_id === supplier.id || p.supplier_name === supplier.name) || [];
    const purchaseVolume = supplierPurchases.reduce((sum, p) => sum + (p.total_amount || 0), 0);

    // Calculate bonuses
    const supplierAgreements = agreements?.filter((a) => a.supplier_id === supplier.id) || [];
    let totalBonus = 0;

    supplierAgreements.forEach((agreement: any) => {
      // Skip goods bonuses - only money bonuses count in profit
      if (agreement.bonus_payment_type !== "money") return;

      if (agreement.bonus_type === "annual_target" || (agreement.bonus_type === "marketing" && agreement.bonus_tiers?.length > 0)) {
        const sortedTiers = (agreement.bonus_tiers || []).sort((a: any, b: any) => b.target_value - a.target_value);
        for (const tier of sortedTiers) {
          if (purchaseVolume >= tier.target_value) {
            totalBonus += purchaseVolume * (tier.bonus_percentage / 100);
            break;
          }
        }
      } else if (agreement.fixed_percentage) {
        totalBonus += purchaseVolume * (agreement.fixed_percentage / 100);
      } else if (agreement.fixed_amount) {
        totalBonus += agreement.fixed_amount;
      }
    });

    // Transaction bonuses
    const supplierTransactions = transactionBonuses?.filter((t) => t.supplier_id === supplier.id) || [];
    const transBonus = supplierTransactions.reduce((sum, t) => sum + (t.bonus_value || 0), 0);
    totalBonus += transBonus;

    const weLoveProfit = directProfit + totalBonus;

    return {
      id: supplier.id,
      name: supplier.name,
      purchaseVolume,
      totalSales,
      directProfit,
      totalBonus,
      weLoveProfit,
      directMargin: totalSales > 0 ? ((directProfit / totalSales) * 100).toFixed(1) : "0",
      weLoveMargin: totalSales > 0 ? ((weLoveProfit / totalSales) * 100).toFixed(1) : "0",
    };
  }) || [];

  const chartData = supplierReport
    .filter((s) => s.totalSales > 0 || s.purchaseVolume > 0)
    .sort((a, b) => b.weLoveProfit - a.weLoveProfit);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">דוחות רווחיות</h1>

      {/* Profitability chart */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>רווחיות לפי ספק - ישיר מול וילוב</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} />
                <Tooltip formatter={(value: number) => `₪${value.toLocaleString()}`} />
                <Legend />
                <Bar dataKey="directProfit" name="רווח ישיר" fill="hsl(217, 71%, 45%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="weLoveProfit" name="רווח וילוב" fill="hsl(142, 71%, 40%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Detailed table */}
      <Card>
        <CardHeader>
          <CardTitle>טבלת רווחיות מפורטת</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ספק</TableHead>
                <TableHead>מחזור רכישות</TableHead>
                <TableHead>מחזור מכירות</TableHead>
                <TableHead>רווח ישיר</TableHead>
                <TableHead>% ישיר</TableHead>
                <TableHead>סה"כ בונוסים</TableHead>
                <TableHead>רווח וילוב</TableHead>
                <TableHead>% וילוב</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {supplierReport.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">אין נתונים. העלה נתוני רכישות ומכירות.</TableCell></TableRow>
              ) : (
                supplierReport.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium"><Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.name}</Link></TableCell>
                    <TableCell>₪{s.purchaseVolume.toLocaleString()}</TableCell>
                    <TableCell>₪{s.totalSales.toLocaleString()}</TableCell>
                    <TableCell className={s.directProfit >= 0 ? "text-success" : "text-destructive"}>₪{s.directProfit.toLocaleString()}</TableCell>
                    <TableCell>{s.directMargin}%</TableCell>
                    <TableCell className="text-primary font-medium">₪{s.totalBonus.toLocaleString()}</TableCell>
                    <TableCell className={s.weLoveProfit >= 0 ? "text-success font-bold" : "text-destructive font-bold"}>₪{s.weLoveProfit.toLocaleString()}</TableCell>
                    <TableCell className="font-medium">{s.weLoveMargin}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
