import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Clock, TrendingUp } from "lucide-react";
import { fmtNum } from "@/lib/utils";

const VAT_RATE = 0.18;
const addVAT = (amount: number) => amount * (1 + VAT_RATE);

export default function Alerts() {
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*");
      return data || [];
    },
  });

  const { data: agreements } = useQuery({
    queryKey: ["agreements-with-tiers"],
    queryFn: async () => {
      const { data } = await supabase.from("bonus_agreements").select("*, bonus_tiers(*), suppliers(name)").eq("is_active", true);
      return data || [];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchases-all"],
    queryFn: async () => {
      const { data } = await supabase.from("purchase_records").select("supplier_id, supplier_name, total_amount");
      return data || [];
    },
  });

  const { data: transactionBonuses } = useQuery({
    queryKey: ["transaction-bonuses-all"],
    queryFn: async () => {
      const { data } = await supabase.from("transaction_bonuses").select("supplier_id, total_value, counts_toward_target");
      return data || [];
    },
  });

  // Build alerts
  const alerts = (agreements || [])
    .filter((a: any) => a.bonus_tiers?.length > 0)
    .map((agreement: any) => {
      const supplier = suppliers?.find((s) => s.id === agreement.supplier_id);
      const supplierName = agreement.suppliers?.name || supplier?.name || "לא ידוע";

      // Calculate current volume for this supplier
      const supplierPurchases = purchases?.filter(
        (p) => p.supplier_id === agreement.supplier_id || p.supplier_name === supplierName
      ) || [];
      let currentVolume = addVAT(supplierPurchases.reduce((sum, p) => sum + (p.total_amount || 0), 0));

      // Add transaction bonuses that count toward target
      const supplierTransactions = transactionBonuses?.filter(
        (t) => t.supplier_id === agreement.supplier_id && t.counts_toward_target
      ) || [];
      currentVolume += supplierTransactions.reduce((sum, t) => sum + (t.total_value || 0), 0);

      // Find current tier and next tier
      const sortedTiers = (agreement.bonus_tiers || []).sort((a: any, b: any) => a.target_value - b.target_value);
      
      let currentTierIndex = -1;
      for (let i = sortedTiers.length - 1; i >= 0; i--) {
        if (currentVolume >= sortedTiers[i].target_value) {
          currentTierIndex = i;
          break;
        }
      }

      const nextTier = sortedTiers[currentTierIndex + 1];
      if (!nextTier) return null; // Already at highest tier

      const remaining = nextTier.target_value - currentVolume;
      const progress = (currentVolume / nextTier.target_value) * 100;

      // Days remaining
      let daysRemaining: number | null = null;
      if (agreement.period_end) {
        const endDate = new Date(agreement.period_end);
        const today = new Date();
        daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      const urgency = progress >= 80 ? "high" : progress >= 60 ? "medium" : "low";

      return {
        id: agreement.id,
        supplierId: agreement.supplier_id,
        supplierName,
        currentVolume,
        nextTarget: nextTier.target_value,
        nextPercentage: nextTier.bonus_percentage,
        remaining,
        progress: Math.min(progress, 100),
        daysRemaining,
        periodEnd: agreement.period_end,
        urgency,
        currentPercentage: currentTierIndex >= 0 ? sortedTiers[currentTierIndex].bonus_percentage : 0,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      // Sort by period_end: nearest first, nulls last
      if (a.periodEnd && b.periodEnd) return a.periodEnd.localeCompare(b.periodEnd);
      if (a.periodEnd && !b.periodEnd) return -1;
      if (!a.periodEnd && b.periodEnd) return 1;
      return b.progress - a.progress;
    });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">התראות יעדים</h1>
      <p className="text-muted-foreground">ספקים שקרובים ליעד או למדרגה הבאה - כדאי להזמין!</p>

      {alerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            אין התראות. הוסף הסכמי בונוסים עם מדרגות יעד והעלה נתוני רכישות.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert: any) => (
            <Card key={alert.id} className={alert.urgency === "high" ? "border-warning/50 bg-warning/5" : ""}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {alert.urgency === "high" && <AlertTriangle className="w-5 h-5 text-warning" />}
                    <div>
                      <h3 className="font-bold text-lg">
                        <Link to={`/suppliers/${alert.supplierId}`} className="hover:underline text-primary">
                          {alert.supplierName}
                        </Link>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        מדרגה נוכחית: {alert.currentPercentage}% | מדרגה הבאה: {alert.nextPercentage}%
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {alert.daysRemaining !== null && (
                      <Badge variant={alert.daysRemaining < 30 ? "destructive" : "secondary"} className="gap-1">
                        <Clock className="w-3 h-3" />
                        {alert.daysRemaining > 0 ? `${alert.daysRemaining} ימים` : "פג תוקף"}
                      </Badge>
                    )}
                    <Badge variant={alert.urgency === "high" ? "default" : "secondary"} className="gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {alert.progress.toFixed(0)}%
                    </Badge>
                  </div>
                </div>

                <Progress value={alert.progress} className="h-3 mb-3" />

                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">מחזור נוכחי:</span>
                    <p className="font-bold">₪{alert.currentVolume.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">יעד מדרגה הבאה:</span>
                    <p className="font-bold">₪{alert.nextTarget.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">חסר להזמנה:</span>
                    <p className="font-bold text-primary">₪{alert.remaining.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
