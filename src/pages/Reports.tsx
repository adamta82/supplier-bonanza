import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { fmtNum } from "@/lib/utils";

const VAT_RATE = 0.18;
const addVAT = (amount: number) => amount * (1 + VAT_RATE);

type SortField = "name" | "purchaseVolume" | "totalSales" | "directProfit" | "directMargin" | "totalBonus" | "finalProfit" | "finalMargin";
type SortDir = "asc" | "desc";

type Exclusion = { keyword: string; mode: "include" | "exclude"; counts_toward_target: boolean };

function parseExclusions(raw: any): Exclusion[] {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw || []);
  } catch {
    return [];
  }
}

function calcAgreementBonus(agreement: any, purchases: any[], transactionBonuses: any[]) {
  if (agreement.bonus_type === "transaction") {
    return transactionBonuses
      .filter((b: any) => b.agreement_id === agreement.id)
      .reduce((s: number, b: any) => s + (b.bonus_value || 0), 0);
  }

  const excl = parseExclusions(agreement.exclusions);

  const matchesExclusion = (desc: string) => {
    if (!desc || excl.length === 0) return { excluded: false, countsTowardTarget: true };
    const lowerDesc = desc.toLowerCase();
    for (const rule of excl) {
      const kw = rule.keyword.toLowerCase();
      if (!kw) continue;
      if (lowerDesc.includes(kw)) {
        if (rule.mode === "exclude") {
          return { excluded: true, countsTowardTarget: rule.counts_toward_target };
        }
        return { excluded: false, countsTowardTarget: true };
      }
    }
    const hasIncludeRules = excl.some(r => r.mode === "include");
    if (hasIncludeRules) {
      return { excluded: true, countsTowardTarget: false };
    }
    return { excluded: false, countsTowardTarget: true };
  };

  const agrPurchases = purchases.filter((p: any) => {
    if (!p.order_date) return false;
    if (agreement.period_start && p.order_date < agreement.period_start) return false;
    if (agreement.period_end && p.order_date > agreement.period_end) return false;
    return true;
  });

  let bonusVolume = 0;
  let targetVolumeWithVAT = 0;
  let targetVolumeExVAT = 0;
  agrPurchases.forEach((p: any) => {
    const rawAmount = p.total_amount || 0;
    const withVAT = addVAT(rawAmount);
    const result = matchesExclusion(p.item_description || "");
    if (!result.excluded) {
      bonusVolume += withVAT;
      targetVolumeWithVAT += withVAT;
      targetVolumeExVAT += rawAmount;
    } else if (result.countsTowardTarget) {
      targetVolumeWithVAT += withVAT;
      targetVolumeExVAT += rawAmount;
    }
  });

  let volume = agreement.vat_included ? targetVolumeWithVAT : targetVolumeExVAT;

  const agrTxBonuses = transactionBonuses.filter((b: any) => b.counts_toward_target && b.agreement_id === agreement.id);
  volume += agrTxBonuses.reduce((s: number, b: any) => s + (b.total_value || 0), 0);

  if (agreement.fixed_percentage) {
    return bonusVolume * (agreement.fixed_percentage / 100);
  }
  if (agreement.fixed_amount) {
    return agreement.fixed_amount;
  }

  const sortedTiers = (agreement.bonus_tiers || []).sort((a: any, b: any) => a.target_value - b.target_value);
  let achievedTier = null;
  for (let i = sortedTiers.length - 1; i >= 0; i--) {
    if (volume >= sortedTiers[i].target_value) {
      achievedTier = sortedTiers[i];
      break;
    }
  }
  if (achievedTier) {
    return bonusVolume * (achievedTier.bonus_percentage / 100);
  }
  return 0;
}

export default function Reports() {
  const [sortField, setSortField] = useState<SortField>("finalProfit");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  const supplierReport = suppliers?.map((supplier) => {
    const supplierSales = sales?.filter((s) => s.supplier_id === supplier.id || s.supplier_name === supplier.name) || [];
    const totalSales = addVAT(supplierSales.reduce((sum, s) => sum + ((s.sale_price || 0) * (s.quantity || 1)), 0));
    const totalCost = addVAT(supplierSales.reduce((sum, s) => sum + ((s.cost_price || 0) * (s.quantity || 1)), 0));
    const directProfit = totalSales - totalCost;

    const supplierPurchases = purchases?.filter((p) => p.supplier_id === supplier.id || p.supplier_name === supplier.name) || [];
    const purchaseVolume = addVAT(supplierPurchases.reduce((sum, p) => sum + (p.total_amount || 0), 0));

    const supplierAgreements = agreements?.filter((a) => a.supplier_id === supplier.id) || [];
    const supplierTxBonuses = transactionBonuses?.filter((t) => t.supplier_id === supplier.id) || [];

    // Use proper per-agreement calculation with exclusions
    let totalBonus = 0;
    supplierAgreements.forEach((agreement: any) => {
      if (agreement.bonus_type === "transaction") return; // handled below
      const val = calcAgreementBonus(agreement, supplierPurchases, supplierTxBonuses);
      if (!isNaN(val)) totalBonus += val;
    });

    // Transaction bonuses (unlinked ones)
    const linkedTxIds = new Set(supplierAgreements.flatMap((a: any) => 
      supplierTxBonuses.filter(t => t.agreement_id === a.id).map(t => t.id)
    ));
    const unlinkedTxBonus = supplierTxBonuses
      .filter(t => !linkedTxIds.has(t.id) && !t.agreement_id)
      .reduce((sum, t) => sum + (t.bonus_value || 0), 0);
    totalBonus += unlinkedTxBonus;

    // Also add linked transaction agreement bonuses
    supplierAgreements.forEach((agreement: any) => {
      if (agreement.bonus_type !== "transaction") return;
      const val = calcAgreementBonus(agreement, supplierPurchases, supplierTxBonuses);
      if (!isNaN(val)) totalBonus += val;
    });

    const finalProfit = directProfit + totalBonus;

    return {
      id: supplier.id,
      name: supplier.name,
      purchaseVolume,
      totalSales,
      directProfit,
      totalBonus,
      finalProfit,
      directMargin: totalSales > 0 ? (directProfit / totalSales) * 100 : 0,
      finalMargin: totalSales > 0 ? (finalProfit / totalSales) * 100 : 0,
    };
  }) || [];

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 inline mr-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 inline mr-1" /> : <ArrowDown className="w-3 h-3 inline mr-1" />;
  };

  const sortedReport = useMemo(() => {
    return [...supplierReport].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal, "he") : bVal.localeCompare(aVal, "he");
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  }, [supplierReport, sortField, sortDir]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">דוחות רווחיות</h1>

      <Card>
        <CardHeader>
          <CardTitle>טבלת רווחיות מפורטת</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("name")}><SortIcon field="name" />ספק</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("purchaseVolume")}><SortIcon field="purchaseVolume" />מחזור רכישות</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("totalSales")}><SortIcon field="totalSales" />מחזור מכירות</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("directProfit")}><SortIcon field="directProfit" />רווח ישיר</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("directMargin")}><SortIcon field="directMargin" />% ישיר</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("totalBonus")}><SortIcon field="totalBonus" />סה"כ בונוסים</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("finalProfit")}><SortIcon field="finalProfit" />רווח סופי</TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("finalMargin")}><SortIcon field="finalMargin" />% סופי</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedReport.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">אין נתונים. העלה נתוני רכישות ומכירות.</TableCell></TableRow>
              ) : (
                sortedReport.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium"><Link to={`/suppliers/${s.id}`} className="text-primary hover:underline">{s.name}</Link></TableCell>
                    <TableCell>₪{fmtNum(s.purchaseVolume)}</TableCell>
                    <TableCell>₪{fmtNum(s.totalSales)}</TableCell>
                    <TableCell className={s.directProfit >= 0 ? "text-success" : "text-destructive"}>₪{fmtNum(s.directProfit)}</TableCell>
                    <TableCell>{s.directMargin.toFixed(1)}%</TableCell>
                    <TableCell className="text-primary font-medium">₪{fmtNum(s.totalBonus)}</TableCell>
                    <TableCell className={s.finalProfit >= 0 ? "text-success font-bold" : "text-destructive font-bold"}>₪{fmtNum(s.finalProfit)}</TableCell>
                    <TableCell className="font-medium">{s.finalMargin.toFixed(1)}%</TableCell>
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
