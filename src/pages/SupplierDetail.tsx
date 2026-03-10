import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, TrendingUp, ShoppingCart, Award, Target, Pencil, CheckCircle, XCircle, Clock, FileText, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";

const VAT_RATE = 0.18;

const bonusTypeLabels: Record<string, string> = {
  annual_target: "יעדים",
  marketing: "שיווק",
  transaction: "עסקה",
  annual_fixed: "שנתי קבוע",
  network: "רשתי",
};

type FilterMode = "all" | "month" | "quarter" | "year" | "ytd" | "last30" | "last90" | "custom";

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  // All source data is ex-VAT; always display with VAT
  const [editForm, setEditForm] = useState({
    name: "", supplier_number: "", payment_terms: "", shotef: "", obligo: "", notes: "", annual_bonus_status: "pending", reconciliation_date: "",
  });
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`;
  });
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedPO, setExpandedPO] = useState<string | null>(null);
  const [expandedSO, setExpandedSO] = useState<string | null>(null);
  const [purchaseSearch, setPurchaseSearch] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [disabledBrands, setDisabledBrands] = useState<Set<string>>(new Set());

  // Agreement form state
  const [agreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const [agreementEditId, setAgreementEditId] = useState<string | null>(null);
  const [agreementForm, setAgreementForm] = useState({
    bonus_type: "annual_target",
    period_start: "",
    period_end: "",
    vat_included: false,
    target_type: "amount",
    fixed_amount: "",
    fixed_percentage: "",
    notes: "",
    bonus_payment_type: "goods",
  });
  type TierForm = { target_value: string; bonus_percentage: string };
  type ExclusionForm = { keyword: string; mode: "include" | "exclude"; counts_toward_target: boolean; gets_bonus: boolean };
  const [tiers, setTiers] = useState<TierForm[]>([{ target_value: "", bonus_percentage: "" }]);
  const [exclusions, setExclusions] = useState<ExclusionForm[]>([]);

  // Transaction bonus form state
  const [txDialogOpen, setTxDialogOpen] = useState(false);
  const [txEditId, setTxEditId] = useState<string | null>(null);
  const [txForm, setTxForm] = useState({
    transaction_date: "",
    description: "",
    total_value: "",
    bonus_value: "",
    bonus_payment_type: "goods",
  });
  const dateRange = useMemo(() => {
    const now = new Date();
    if (filterMode === "month") {
      const [y, m] = selectedMonth.split("-").map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
    if (filterMode === "quarter") {
      const [y, q] = selectedQuarter.split("-Q").map(Number);
      const start = new Date(y, (q - 1) * 3, 1);
      const end = new Date(y, q * 3, 0);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    }
    if (filterMode === "year") {
      return { start: `${now.getFullYear()}-01-01`, end: `${now.getFullYear()}-12-31` };
    }
    if (filterMode === "ytd") {
      return { start: `${now.getFullYear()}-01-01`, end: now.toISOString().slice(0, 10) };
    }
    if (filterMode === "last30") {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { start: d.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    if (filterMode === "last90") {
      const d = new Date(now);
      d.setDate(d.getDate() - 90);
      return { start: d.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    }
    if (filterMode === "custom" && dateFrom && dateTo) {
      return { start: dateFrom, end: dateTo };
    }
    return null;
  }, [filterMode, selectedMonth, selectedQuarter, dateFrom, dateTo]);

  const { data: supplier } = useQuery({
    queryKey: ["supplier", id],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*").eq("id", id!).single();
      return data;
    },
    enabled: !!id,
  });

  const openEdit = () => {
    if (!supplier) return;
    setEditForm({
      name: supplier.name,
      supplier_number: supplier.supplier_number || "",
      payment_terms: supplier.payment_terms || "",
      shotef: supplier.shotef?.toString() || "",
      obligo: (supplier as any).obligo?.toString() || "",
      notes: supplier.notes || "",
      annual_bonus_status: supplier.annual_bonus_status || "pending",
      reconciliation_date: supplier.reconciliation_date || "",
    });
    setEditOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("suppliers").update({
        name: editForm.name,
        supplier_number: editForm.supplier_number || null,
        payment_terms: editForm.payment_terms || null,
        shotef: editForm.shotef ? parseInt(editForm.shotef) : null,
        obligo: editForm.obligo ? parseFloat(editForm.obligo) : null,
        notes: editForm.notes || null,
        annual_bonus_status: editForm.annual_bonus_status || "pending",
        reconciliation_date: editForm.reconciliation_date || null,
      }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier", id] });
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      toast.success("ספק עודכן בהצלחה");
      setEditOpen(false);
    },
    onError: () => toast.error("שגיאה בעדכון הספק"),
  });

  // Agreement save/delete mutations
  const resetAgreementForm = () => {
    setAgreementDialogOpen(false);
    setAgreementEditId(null);
    setAgreementForm({
      bonus_type: "annual_target", period_start: "", period_end: "",
      vat_included: false, target_type: "amount", fixed_amount: "", fixed_percentage: "",
      notes: "", bonus_payment_type: "goods",
    });
    setTiers([{ target_value: "", bonus_percentage: "" }]);
    setExclusions([]);
  };

  const saveAgreementMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        supplier_id: id!,
        bonus_type: agreementForm.bonus_type,
        period_start: agreementForm.period_start || null,
        period_end: agreementForm.period_end || null,
        vat_included: agreementForm.vat_included,
        target_type: agreementForm.target_type || null,
        fixed_amount: agreementForm.fixed_amount ? parseFloat(agreementForm.fixed_amount) : null,
        fixed_percentage: agreementForm.fixed_percentage ? parseFloat(agreementForm.fixed_percentage) : null,
        notes: agreementForm.notes || null,
        bonus_payment_type: agreementForm.bonus_payment_type,
        exclusions: exclusions.length > 0 ? JSON.stringify(exclusions) : "[]",
      };
      let agreementId = agreementEditId;
      if (agreementEditId) {
        const { error } = await supabase.from("bonus_agreements").update(payload).eq("id", agreementEditId);
        if (error) throw error;
        await supabase.from("bonus_tiers").delete().eq("agreement_id", agreementEditId);
      } else {
        const { data, error } = await supabase.from("bonus_agreements").insert(payload).select("id").single();
        if (error) throw error;
        agreementId = data.id;
      }
      const validTiers = tiers.filter((t) => t.target_value && t.bonus_percentage);
      if (validTiers.length > 0 && agreementId) {
        const { error } = await supabase.from("bonus_tiers").insert(
          validTiers.map((t, i) => ({
            agreement_id: agreementId!,
            tier_order: i + 1,
            target_value: parseFloat(t.target_value),
            bonus_percentage: parseFloat(t.bonus_percentage),
          }))
        );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-agreements", id] });
      queryClient.invalidateQueries({ queryKey: ["agreements"] });
      toast.success(agreementEditId ? "הסכם עודכן" : "הסכם נוסף");
      resetAgreementForm();
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  const deleteAgreementMutation = useMutation({
    mutationFn: async (agId: string) => {
      const { error } = await supabase.from("bonus_agreements").delete().eq("id", agId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-agreements", id] });
      queryClient.invalidateQueries({ queryKey: ["agreements"] });
      toast.success("הסכם נמחק");
      resetAgreementForm();
    },
  });

  const openEditAgreement = (a: any) => {
    const excl = (() => {
      try { return typeof a.exclusions === "string" ? JSON.parse(a.exclusions) : (a.exclusions || []); } catch { return []; }
    })();
    setAgreementEditId(a.id);
    setAgreementForm({
      bonus_type: a.bonus_type,
      period_start: a.period_start || "",
      period_end: a.period_end || "",
      vat_included: a.vat_included || false,
      target_type: a.target_type || "amount",
      fixed_amount: a.fixed_amount?.toString() || "",
      fixed_percentage: a.fixed_percentage?.toString() || "",
      notes: a.notes || "",
      bonus_payment_type: a.bonus_payment_type || "goods",
    });
    setTiers(
      a.bonus_tiers?.length > 0
        ? a.bonus_tiers.sort((x: any, y: any) => x.tier_order - y.tier_order).map((t: any) => ({ target_value: t.target_value.toString(), bonus_percentage: t.bonus_percentage.toString() }))
        : [{ target_value: "", bonus_percentage: "" }]
    );
    setExclusions(excl);
    setAgreementDialogOpen(true);
  };

  const openAddAgreement = (bonusType: string) => {
    resetAgreementForm();
    setAgreementForm(prev => ({ ...prev, bonus_type: bonusType }));
    setAgreementDialogOpen(true);
  };

  // Transaction bonus save/delete mutations
  const resetTxForm = () => {
    setTxDialogOpen(false);
    setTxEditId(null);
    setTxForm({ transaction_date: "", description: "", total_value: "", bonus_value: "", bonus_payment_type: "goods" });
  };

  const saveTxMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        supplier_id: id!,
        transaction_date: txForm.transaction_date,
        description: txForm.description || null,
        total_value: parseFloat(txForm.total_value),
        bonus_value: parseFloat(txForm.bonus_value),
        bonus_payment_type: txForm.bonus_payment_type,
      };
      if (txEditId) {
        const { error } = await supabase.from("transaction_bonuses").update(payload).eq("id", txEditId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("transaction_bonuses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-bonuses", id] });
      queryClient.invalidateQueries({ queryKey: ["transaction-bonuses"] });
      toast.success(txEditId ? "בונוס עודכן" : "בונוס נוסף");
      resetTxForm();
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  const deleteTxMutation = useMutation({
    mutationFn: async (txId: string) => {
      const { error } = await supabase.from("transaction_bonuses").delete().eq("id", txId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplier-bonuses", id] });
      queryClient.invalidateQueries({ queryKey: ["transaction-bonuses"] });
      toast.success("בונוס נמחק");
      resetTxForm();
    },
  });

  const openEditTx = (b: any) => {
    setTxEditId(b.id);
    setTxForm({
      transaction_date: b.transaction_date || "",
      description: b.description || "",
      total_value: b.total_value?.toString() || "",
      bonus_value: b.bonus_value?.toString() || "",
      bonus_payment_type: b.bonus_payment_type || "goods",
    });
    setTxDialogOpen(true);
  };


  const { data: agreements } = useQuery({
    queryKey: ["supplier-agreements", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bonus_agreements")
        .select("*, bonus_tiers(*)")
        .eq("supplier_id", id!)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: purchases } = useQuery({
    queryKey: ["supplier-purchases", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("purchase_records")
        .select("*")
        .eq("supplier_id", id!)
        .order("order_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: sales } = useQuery({
    queryKey: ["supplier-sales", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_records")
        .select("*")
        .eq("supplier_id", id!)
        .order("sale_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const { data: bonuses } = useQuery({
    queryKey: ["supplier-bonuses", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("transaction_bonuses")
        .select("*, bonus_agreements(bonus_type)")
        .eq("supplier_id", id!)
        .order("transaction_date", { ascending: false });
      return data || [];
    },
    enabled: !!id,
  });

  const filterByDate = <T extends Record<string, any>>(items: T[], dateField: string) => {
    if (!dateRange) return items;
    return items.filter((item) => {
      const d = item[dateField];
      return d && d >= dateRange.start && d <= dateRange.end;
    });
  };

  const filteredPurchases = useMemo(() => filterByDate(purchases || [], "order_date"), [purchases, dateRange]);
  const filteredSales = useMemo(() => filterByDate(sales || [], "sale_date"), [sales, dateRange]);
  const filteredBonuses = useMemo(() => filterByDate(bonuses || [], "transaction_date"), [bonuses, dateRange]);

  // All data is ex-VAT, always add VAT for display
  const addVAT = (amount: number) => amount * (1 + VAT_RATE);

  const totalPurchases = addVAT(filteredPurchases.reduce((s, r) => s + (r.total_amount || 0), 0));
  const totalSales = addVAT(filteredSales.reduce((s, r) => s + (r.sale_price || 0) * (r.quantity || 0), 0));
  const totalDirectProfit = addVAT(filteredSales.reduce((s, r) => s + ((r.sale_price || 0) - (r.cost_price || 0)) * (r.quantity || 1), 0));
  const totalTransactionBonus = filteredBonuses.reduce((s, r) => s + (r.bonus_value || 0), 0);

  // Brand breakdown
  const brandData = useMemo(() => {
    const map: Record<string, { sales: number; cost: number; profit: number }> = {};
    filteredSales.forEach((r: any) => {
      const brand = r.brand || "ללא מותג";
      if (!map[brand]) map[brand] = { sales: 0, cost: 0, profit: 0 };
      const saleTotal = addVAT((r.sale_price || 0) * (r.quantity || 1));
      const costTotal = addVAT((r.cost_price || 0) * (r.quantity || 1));
      map[brand].sales += saleTotal;
      map[brand].cost += costTotal;
      map[brand].profit += saleTotal - costTotal;
    });
    return Object.entries(map).map(([brand, data]) => ({
      brand,
      ...data,
      margin: data.sales > 0 ? (data.profit / data.sales) * 100 : 0,
    })).sort((a, b) => b.profit - a.profit);
  }, [filteredSales]);

  // Filtered brand profit (based on toggles)
  const filteredBrandProfit = useMemo(() => {
    const active = brandData.filter(b => !disabledBrands.has(b.brand));
    const totalProfit = active.reduce((s, b) => s + b.profit, 0);
    const totalSalesActive = active.reduce((s, b) => s + b.sales, 0);
    const margin = totalSalesActive > 0 ? (totalProfit / totalSalesActive) * 100 : 0;
    return { totalProfit, margin };
  }, [brandData, disabledBrands]);

  const toggleBrand = (brand: string) => {
    setDisabledBrands(prev => {
      const next = new Set(prev);
      if (next.has(brand)) next.delete(brand);
      else next.add(brand);
      return next;
    });
  };

  // Calculate bonus value for an agreement
  const calcAgreementBonusValue = (agreement: any) => {
    if (agreement.bonus_type === "transaction") {
      const linkedBonuses = (bonuses || []).filter((b: any) => b.agreement_id === agreement.id);
      return linkedBonuses.reduce((s: number, b: any) => s + (b.bonus_value || 0), 0);
    }

    const agrPurchases = (purchases || []).filter((p: any) => {
      if (!p.order_date) return false;
      if (agreement.period_start && p.order_date < agreement.period_start) return false;
      if (agreement.period_end && p.order_date > agreement.period_end) return false;
      return true;
    });
    let volume = agrPurchases.reduce((s: number, p: any) => s + (p.total_amount || 0), 0);

    const agrTxBonuses = (bonuses || []).filter((b: any) => b.counts_toward_target && b.agreement_id === agreement.id);
    volume += agrTxBonuses.reduce((s: number, b: any) => s + (b.total_value || 0), 0);

    if (agreement.fixed_percentage) {
      return volume * (agreement.fixed_percentage / 100);
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
      return volume * (achievedTier.bonus_percentage / 100);
    }
    return 0;
  };

  const totalAllBonus = useMemo(() => {
    if (!agreements) return 0;
    return agreements.reduce((sum: number, a: any) => {
      const v = calcAgreementBonusValue(a);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [agreements, purchases, bonuses]);

  const totalMoneyBonus = useMemo(() => {
    if (!agreements) return 0;
    return agreements
      .filter((a: any) => a.bonus_payment_type === "money")
      .reduce((sum: number, a: any) => {
        const v = calcAgreementBonusValue(a);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
  }, [agreements, purchases, bonuses]);

  const totalBonusValue = totalAllBonus;

  // Bonus breakdown by type and payment method
  const bonusByTypeAndPayment = useMemo(() => {
    const result = {
      target: { money: 0, goods: 0 },
      marketing: { money: 0, goods: 0 },
      transaction: { money: 0, goods: 0 },
    };
    if (!agreements) return result;

    agreements.forEach((a: any) => {
      if (a.bonus_type === "transaction") return; // handled separately
      const val = calcAgreementBonusValue(a);
      if (isNaN(val) || val === 0) return;
      const isMoney = a.bonus_payment_type === "money";
      if (a.bonus_type === "annual_target") {
        result.target[isMoney ? "money" : "goods"] += val;
      } else if (a.bonus_type === "marketing") {
        result.marketing[isMoney ? "money" : "goods"] += val;
      }
    });

    // Transaction bonuses from transaction_bonuses table
    (bonuses || []).forEach((b: any) => {
      const isMoney = b.bonus_payment_type === "money";
      result.transaction[isMoney ? "money" : "goods"] += (b.bonus_value || 0);
    });

    return result;
  }, [agreements, purchases, bonuses]);

  // Annual fixed bonuses (money only, for profit calc)
  const annualFixedMoneyBonus = useMemo(() => {
    if (!agreements) return 0;
    return agreements
      .filter((a: any) => a.bonus_type === "annual_fixed" && a.bonus_payment_type === "money")
      .reduce((sum: number, a: any) => {
        const v = calcAgreementBonusValue(a);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
  }, [agreements, purchases, bonuses]);

  // רווח ישיר + בונוס כספי (לא כולל שיווק)
  const profitPlusMoneyBonus = totalDirectProfit + bonusByTypeAndPayment.target.money + bonusByTypeAndPayment.transaction.money + annualFixedMoneyBonus;

  // רווח סופי = הכל
  const allBonusesTotal = bonusByTypeAndPayment.target.money + bonusByTypeAndPayment.target.goods
    + bonusByTypeAndPayment.marketing.money + bonusByTypeAndPayment.marketing.goods
    + bonusByTypeAndPayment.transaction.money + bonusByTypeAndPayment.transaction.goods
    + annualFixedMoneyBonus;
  // Also add annual_fixed goods
  const annualFixedGoodsBonus = useMemo(() => {
    if (!agreements) return 0;
    return agreements
      .filter((a: any) => a.bonus_type === "annual_fixed" && a.bonus_payment_type !== "money")
      .reduce((sum: number, a: any) => {
        const v = calcAgreementBonusValue(a);
        return sum + (isNaN(v) ? 0 : v);
      }, 0);
  }, [agreements, purchases, bonuses]);

  const finalProfit = totalDirectProfit + allBonusesTotal + annualFixedGoodsBonus;

  const monthlyData = useMemo(() => {
    const map: Record<string, { purchases: number; sales: number; profit: number; final: number }> = {};
    filteredPurchases.forEach((r) => {
      const m = r.order_date?.slice(0, 7) || "unknown";
      if (!map[m]) map[m] = { purchases: 0, sales: 0, profit: 0, final: 0 };
      map[m].purchases += addVAT(r.total_amount || 0);
    });
    filteredSales.forEach((r) => {
      const m = r.sale_date?.slice(0, 7) || "unknown";
      if (!map[m]) map[m] = { purchases: 0, sales: 0, profit: 0, final: 0 };
      map[m].sales += addVAT((r.sale_price || 0) * (r.quantity || 0));
      map[m].profit += addVAT(((r.sale_price || 0) - (r.cost_price || 0)) * (r.quantity || 1));
    });
    filteredBonuses.forEach((r) => {
      const m = r.transaction_date?.slice(0, 7) || "unknown";
      if (!map[m]) map[m] = { purchases: 0, sales: 0, profit: 0, final: 0 };
      map[m].final += r.bonus_value || 0;
    });
    Object.values(map).forEach((v) => { v.final += v.profit; });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));
  }, [filteredPurchases, filteredSales, filteredBonuses]);

  const months = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, []);

  const quarters = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return [`${y}-Q1`, `${y}-Q2`, `${y}-Q3`, `${y}-Q4`, `${y - 1}-Q1`, `${y - 1}-Q2`, `${y - 1}-Q3`, `${y - 1}-Q4`];
  }, []);

  const getAgreementStatus = (agreement: any) => {
    const today = new Date().toISOString().slice(0, 10);
    const hasReceivedBonus = (bonuses || []).some((b: any) => b.agreement_id === agreement.id);
    const periodEnded = agreement.period_end && agreement.period_end < today;

    if (hasReceivedBonus) {
      return { label: "התקבל", variant: "default" as const };
    } else if (periodEnded) {
      return { label: "צריך לקבל", variant: "destructive" as const };
    }
    return { label: "פעיל", variant: "secondary" as const };
  };

  if (!supplier) return <div className="text-center py-12 text-muted-foreground">טוען...</div>;

  return (
    <div className="space-y-6">
      {/* Header with filter combined */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to="/suppliers">
            <Button variant="ghost" size="icon">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{supplier.name}</h1>
              <Button variant="ghost" size="icon" onClick={openEdit}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              {supplier.supplier_number && `מס׳ ספק: ${supplier.supplier_number}`}
              {supplier.shotef != null && ` | שוטף+${supplier.shotef}`}
              {(supplier as any).obligo != null && ` | אובליגו: ₪${Number((supplier as any).obligo).toLocaleString()}`}
            </p>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                {supplier.annual_bonus_status === "received" ? (
                  <><CheckCircle className="w-4 h-4 text-primary" /><span className="text-xs font-medium text-primary">בונוס 2025: התקבל</span></>
                ) : supplier.annual_bonus_status === "none" ? (
                  <><XCircle className="w-4 h-4 text-muted-foreground" /><span className="text-xs text-muted-foreground">בונוס 2025: אין</span></>
                ) : (
                  <><Clock className="w-4 h-4 text-destructive" /><span className="text-xs font-medium text-destructive">בונוס 2025: ממתין</span></>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-muted-foreground" />
                {supplier.reconciliation_date ? (
                  <span className="text-xs">כרטסת מתואמת עד {formatDate(supplier.reconciliation_date)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">כרטסת לא מתואמת</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterMode} onValueChange={(v) => setFilterMode(v as FilterMode)}>
            <SelectTrigger className="w-[120px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="ytd">מתחילת השנה</SelectItem>
              <SelectItem value="year">שנה נוכחית</SelectItem>
              <SelectItem value="last30">30 יום אחרונים</SelectItem>
              <SelectItem value="last90">90 יום אחרונים</SelectItem>
              <SelectItem value="month">חודש</SelectItem>
              <SelectItem value="quarter">רבעון</SelectItem>
              <SelectItem value="custom">תאריכים</SelectItem>
            </SelectContent>
          </Select>
          {filterMode === "month" && (
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filterMode === "quarter" && (
            <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {quarters.map((q) => (
                  <SelectItem key={q} value={q}>{q}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {filterMode === "custom" && (
            <>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-[140px] h-8 text-xs"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-[140px] h-8 text-xs"
              />
            </>
          )}
        </div>
      </div>

      {/* KPI cards - Row 1 */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <ShoppingCart className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">רכישות (כולל מע״מ)</div>
            <div className="text-lg font-bold">₪{totalPurchases.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">מכירות (כולל מע״מ)</div>
            <div className="text-lg font-bold">₪{totalSales.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => { setDisabledBrands(new Set()); setBrandDialogOpen(true); }}>
          <CardContent className="pt-4 pb-4 text-center">
            <Target className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">רווח ישיר</div>
            <div className="text-lg font-bold">₪{totalDirectProfit.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{totalSales > 0 ? `${((totalDirectProfit / totalSales) * 100).toFixed(1)}%` : "0%"}</div>
          </CardContent>
        </Card>
      </div>

      {/* KPI cards - Row 2: Bonuses + Profits */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Award className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">בונוס יעדים</div>
            <div className="text-sm font-bold">₪{(bonusByTypeAndPayment.target.money + bonusByTypeAndPayment.target.goods).toLocaleString()}</div>
            <div className="flex justify-center gap-2 mt-1 text-[10px] text-muted-foreground">
              <span>כספי: ₪{bonusByTypeAndPayment.target.money.toLocaleString()}</span>
              <span>|</span>
              <span>סחורה: ₪{bonusByTypeAndPayment.target.goods.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Award className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">בונוס שיווק</div>
            <div className="text-sm font-bold">₪{(bonusByTypeAndPayment.marketing.money + bonusByTypeAndPayment.marketing.goods).toLocaleString()}</div>
            <div className="flex justify-center gap-2 mt-1 text-[10px] text-muted-foreground">
              <span>כספי: ₪{bonusByTypeAndPayment.marketing.money.toLocaleString()}</span>
              <span>|</span>
              <span>סחורה: ₪{bonusByTypeAndPayment.marketing.goods.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <Award className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">בונוס עסקאות</div>
            <div className="text-sm font-bold">₪{(bonusByTypeAndPayment.transaction.money + bonusByTypeAndPayment.transaction.goods).toLocaleString()}</div>
            <div className="flex justify-center gap-2 mt-1 text-[10px] text-muted-foreground">
              <span>כספי: ₪{bonusByTypeAndPayment.transaction.money.toLocaleString()}</span>
              <span>|</span>
              <span>סחורה: ₪{bonusByTypeAndPayment.transaction.goods.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-xs text-muted-foreground">רווח ישיר + בונוס כספי*</div>
            <div className="text-sm font-bold">₪{profitPlusMoneyBonus.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">{totalSales > 0 ? `${((profitPlusMoneyBonus / totalSales) * 100).toFixed(1)}%` : "0%"}</div>
            <div className="text-[10px] text-muted-foreground mt-1">*לא כולל בונוס שיווק</div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4 pb-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-1 text-primary" />
            <div className="text-xs text-muted-foreground">רווח סופי</div>
            <div className="text-sm font-bold text-primary">₪{finalProfit.toLocaleString()}</div>
            <div className="text-xs text-primary">{totalSales > 0 ? `${((finalProfit / totalSales) * 100).toFixed(1)}%` : "0%"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Brand Profit Dialog */}
      <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>רווח ישיר לפי מותג</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold">₪{filteredBrandProfit.totalProfit.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">{filteredBrandProfit.margin.toFixed(1)}% רווח</div>
            </div>
            <div className="space-y-2">
              {brandData.map((b) => (
                <div key={b.brand} className="flex items-center justify-between p-3 rounded-lg border" dir="rtl">
                  <div className="flex items-center gap-3">
                    <Switch
                      dir="ltr"
                      checked={!disabledBrands.has(b.brand)}
                      onCheckedChange={() => toggleBrand(b.brand)}
                    />
                    <span className="font-medium text-sm">{b.brand}</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-semibold">₪{b.profit.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{b.margin.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
              {brandData.length === 0 && (
                <p className="text-center text-muted-foreground py-4">אין נתוני מותגים</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bonuses section with tabs */}
      <div className="space-y-3">
        <h2 className="text-xl font-bold">בונוסים</h2>
        <Tabs defaultValue="annual_fixed" dir="rtl">
          <TabsList>
            <TabsTrigger value="annual_fixed">שנתי</TabsTrigger>
            <TabsTrigger value="annual_target">יעדים</TabsTrigger>
            <TabsTrigger value="marketing">שיווק</TabsTrigger>
            <TabsTrigger value="transaction">עסקה</TabsTrigger>
          </TabsList>

          {["annual_fixed", "annual_target", "marketing"].map((tabType) => {
            const tabAgreements = (agreements || []).filter((a: any) => a.bonus_type === tabType);
            return (
              <TabsContent key={tabType} value={tabType}>
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => openAddAgreement(tabType)}>
                      <Plus className="w-4 h-4 ml-1" />הוסף הסכם
                    </Button>
                  </div>
                  {tabAgreements.length > 0 ? (
                    tabAgreements.map((agreement: any) => {
                      const status = getAgreementStatus(agreement);
                      const bonusValue = calcAgreementBonusValue(agreement);
                      const sortedTiers = (agreement.bonus_tiers || []).sort((a: any, b: any) => a.target_value - b.target_value);
                      const highestTier = sortedTiers[sortedTiers.length - 1];
                      const agrPurchases = (purchases || []).filter((p: any) => {
                        if (!p.order_date) return false;
                        if (agreement.period_start && p.order_date < agreement.period_start) return false;
                        if (agreement.period_end && p.order_date > agreement.period_end) return false;
                        return true;
                      });
                      let volume = agrPurchases.reduce((s: number, p: any) => s + (p.total_amount || 0), 0);
                      const agrTxBonuses = (bonuses || []).filter((b: any) => b.counts_toward_target && b.agreement_id === agreement.id);
                      volume += agrTxBonuses.reduce((s: number, b: any) => s + (b.total_value || 0), 0);
                      const progress = highestTier ? Math.min((volume / highestTier.target_value) * 100, 100) : 0;

                      return (
                        <Card key={agreement.id}>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{bonusTypeLabels[agreement.bonus_type] || agreement.bonus_type}</Badge>
                                <Badge variant={agreement.bonus_payment_type === "money" ? "outline" : "default"}>
                                  {agreement.bonus_payment_type === "money" ? "כסף" : "סחורה"}
                                </Badge>
                                {agreement.period_start && agreement.period_end && (
                                  <span className="text-xs text-muted-foreground">
                                    {formatDate(agreement.period_start)} - {formatDate(agreement.period_end)}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-primary">₪{bonusValue.toLocaleString()}</span>
                                <Badge variant={status.variant}>{status.label}</Badge>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditAgreement(agreement)}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            {sortedTiers.length > 0 && (
                              <>
                                <div className="flex items-center justify-between text-sm">
                                  <span>התקדמות: ₪{volume.toLocaleString()} / ₪{highestTier?.target_value.toLocaleString()}</span>
                                  <span className="font-bold">{progress.toFixed(0)}%</span>
                                </div>
                                <Progress value={progress} className="h-2" />
                                <div className="flex flex-wrap gap-2 text-xs">
                                  {sortedTiers.map((tier: any, i: number) => (
                                    <span key={i} className={`px-2 py-0.5 rounded-full ${volume >= tier.target_value ? "bg-primary/20 text-primary font-semibold" : "bg-muted text-muted-foreground"}`}>
                                      ₪{tier.target_value.toLocaleString()} → {tier.bonus_percentage}%
                                    </span>
                                  ))}
                                </div>
                              </>
                            )}
                            {agreement.fixed_percentage && !sortedTiers.length && (
                              <div className="text-sm">בונוס קבוע: {agreement.fixed_percentage}%</div>
                            )}
                            {agreement.fixed_amount && !sortedTiers.length && (
                              <div className="text-sm">בונוס קבוע: ₪{agreement.fixed_amount.toLocaleString()}</div>
                            )}
                            {agreement.notes && (
                              <div className="text-xs text-muted-foreground border-t pt-2 mt-2">📝 {agreement.notes}</div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })
                  ) : (
                    <Card>
                      <CardContent className="py-6 text-center text-muted-foreground">אין הסכמים מסוג זה</CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            );
          })}

          <TabsContent value="transaction">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { resetTxForm(); setTxDialogOpen(true); }}>
                  <Plus className="w-4 h-4 ml-1" />הוסף בונוס עסקה
                </Button>
              </div>
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>תאריך</TableHead>
                        <TableHead>תיאור</TableHead>
                        <TableHead>סכום עסקה</TableHead>
                        <TableHead>ערך בונוס</TableHead>
                        <TableHead>אופן קבלה</TableHead>
                        <TableHead>פעולות</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredBonuses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">אין בונוסי עסקה</TableCell>
                        </TableRow>
                      ) : (
                        filteredBonuses.map((b: any) => (
                          <TableRow key={b.id}>
                            <TableCell>{formatDate(b.transaction_date)}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{b.description || "-"}</TableCell>
                            <TableCell>₪{(b.total_value || 0).toLocaleString()}</TableCell>
                            <TableCell className="font-semibold text-primary">₪{(b.bonus_value || 0).toLocaleString()}</TableCell>
                            <TableCell>{b.bonus_payment_type === "money" ? "כסף" : "סחורה"}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditTx(b)}>
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Agreement Dialog */}
      <Dialog open={agreementDialogOpen} onOpenChange={(open) => { if (!open) resetAgreementForm(); else setAgreementDialogOpen(true); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{agreementEditId ? "עריכת הסכם" : "הסכם בונוס חדש"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveAgreementMutation.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>סוג בונוס *</Label>
                <Select value={agreementForm.bonus_type} onValueChange={(v) => setAgreementForm({ ...agreementForm, bonus_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual_target">יעדים</SelectItem>
                    <SelectItem value="marketing">שיווק</SelectItem>
                    <SelectItem value="annual_fixed">שנתי קבוע</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>אופן קבלת הבונוס</Label>
                <Select value={agreementForm.bonus_payment_type} onValueChange={(v) => setAgreementForm({ ...agreementForm, bonus_payment_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="goods">סחורה</SelectItem>
                    <SelectItem value="money">כסף</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>מתאריך</Label>
                <Input type="date" value={agreementForm.period_start} onChange={(e) => setAgreementForm({ ...agreementForm, period_start: e.target.value })} />
              </div>
              <div>
                <Label>עד תאריך</Label>
                <Input type="date" value={agreementForm.period_end} onChange={(e) => setAgreementForm({ ...agreementForm, period_end: e.target.value })} />
              </div>
            </div>
            {(agreementForm.bonus_type === "annual_target" || agreementForm.bonus_type === "marketing") && (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={agreementForm.vat_included} onChange={(e) => setAgreementForm({ ...agreementForm, vat_included: e.target.checked })} className="w-4 h-4" />
                  <Label>כולל מע"מ</Label>
                </div>
                <div>
                  <Label>סוג יעד</Label>
                  <Select value={agreementForm.target_type} onValueChange={(v) => setAgreementForm({ ...agreementForm, target_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amount">שקלי (₪)</SelectItem>
                      <SelectItem value="quantity">כמותי (יחידות)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            {(agreementForm.bonus_type === "annual_fixed" || agreementForm.bonus_type === "marketing") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>אחוז קבוע</Label>
                  <Input type="number" step="0.1" value={agreementForm.fixed_percentage} onChange={(e) => setAgreementForm({ ...agreementForm, fixed_percentage: e.target.value })} placeholder="%" />
                </div>
                <div>
                  <Label>סכום קבוע (₪)</Label>
                  <Input type="number" value={agreementForm.fixed_amount} onChange={(e) => setAgreementForm({ ...agreementForm, fixed_amount: e.target.value })} placeholder="₪" />
                </div>
              </div>
            )}
            {(agreementForm.bonus_type === "annual_target" || agreementForm.bonus_type === "marketing" || agreementForm.bonus_type === "annual_fixed") && (
              <div className="space-y-3 border rounded-lg p-3">
                <Label className="text-base font-semibold">חריגות</Label>
                <p className="text-xs text-muted-foreground">פריטים שמילת המפתח מופיעה בשם שלהם יטופלו בהתאם להגדרות</p>
                {exclusions.map((exc, i) => (
                  <div key={i} className="flex gap-2 items-center border-b pb-2">
                    <div className="flex-1">
                      <Input value={exc.keyword} onChange={(e) => { const n = [...exclusions]; n[i].keyword = e.target.value; setExclusions(n); }} placeholder="מילת מפתח" className="text-sm" />
                    </div>
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input type="checkbox" checked={exc.counts_toward_target} onChange={(e) => { const n = [...exclusions]; n[i].counts_toward_target = e.target.checked; setExclusions(n); }} className="w-3.5 h-3.5" />
                      נספר ביעד
                    </label>
                    <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                      <input type="checkbox" checked={exc.gets_bonus} onChange={(e) => { const n = [...exclusions]; n[i].gets_bonus = e.target.checked; setExclusions(n); }} className="w-3.5 h-3.5" />
                      מקבל בונוס
                    </label>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExclusions(exclusions.filter((_, j) => j !== i))}>
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setExclusions([...exclusions, { keyword: "", counts_toward_target: true, gets_bonus: false }])}>
                  + הוסף חריגה
                </Button>
              </div>
            )}
            {(agreementForm.bonus_type === "annual_target" || (agreementForm.bonus_type === "marketing" && !agreementForm.fixed_amount)) && (
              <div className="space-y-3">
                <Label className="text-base font-semibold">מדרגות יעד</Label>
                {tiers.map((tier, i) => (
                  <div key={i} className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs">יעד {agreementForm.target_type === "quantity" ? "(כמות)" : "(₪)"}</Label>
                      <Input type="number" value={tier.target_value} onChange={(e) => { const n = [...tiers]; n[i].target_value = e.target.value; setTiers(n); }} />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">אחוז בונוס</Label>
                      <Input type="number" step="0.1" value={tier.bonus_percentage} onChange={(e) => { const n = [...tiers]; n[i].bonus_percentage = e.target.value; setTiers(n); }} />
                    </div>
                    {tiers.length > 1 && (
                      <Button type="button" variant="ghost" size="icon" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setTiers([...tiers, { target_value: "", bonus_percentage: "" }])}>
                  + הוסף מדרגה
                </Button>
              </div>
            )}
            <div>
              <Label>הערות</Label>
              <Input value={agreementForm.notes} onChange={(e) => setAgreementForm({ ...agreementForm, notes: e.target.value })} />
            </div>
            <Button type="submit" className="w-full" disabled={saveAgreementMutation.isPending}>
              {saveAgreementMutation.isPending ? "שומר..." : agreementEditId ? "עדכן הסכם" : "שמור הסכם"}
            </Button>
            {agreementEditId && (
              <Button type="button" variant="destructive" className="w-full" onClick={() => { if (confirm("למחוק את ההסכם?")) deleteAgreementMutation.mutate(agreementEditId); }} disabled={deleteAgreementMutation.isPending}>
                <Trash2 className="w-4 h-4 ml-2" />{deleteAgreementMutation.isPending ? "מוחק..." : "מחק הסכם"}
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Transaction Bonus Dialog */}
      <Dialog open={txDialogOpen} onOpenChange={(open) => { if (!open) resetTxForm(); else setTxDialogOpen(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{txEditId ? "עריכת בונוס עסקה" : "בונוס עסקה חדש"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveTxMutation.mutate(); }} className="space-y-4">
            <div>
              <Label>תאריך *</Label>
              <Input type="date" value={txForm.transaction_date} onChange={(e) => setTxForm({ ...txForm, transaction_date: e.target.value })} required />
            </div>
            <div>
              <Label>תיאור</Label>
              <Input value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>סכום עסקה *</Label>
                <Input type="number" value={txForm.total_value} onChange={(e) => setTxForm({ ...txForm, total_value: e.target.value })} required />
              </div>
              <div>
                <Label>ערך בונוס *</Label>
                <Input type="number" value={txForm.bonus_value} onChange={(e) => setTxForm({ ...txForm, bonus_value: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label>אופן קבלה</Label>
              <Select value={txForm.bonus_payment_type} onValueChange={(v) => setTxForm({ ...txForm, bonus_payment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="goods">סחורה</SelectItem>
                  <SelectItem value="money">כסף</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={saveTxMutation.isPending || !txForm.transaction_date || !txForm.total_value || !txForm.bonus_value}>
              {saveTxMutation.isPending ? "שומר..." : txEditId ? "עדכן בונוס" : "שמור בונוס"}
            </Button>
            {txEditId && (
              <Button type="button" variant="destructive" className="w-full" onClick={() => { if (confirm("למחוק את הבונוס?")) deleteTxMutation.mutate(txEditId); }} disabled={deleteTxMutation.isPending}>
                <Trash2 className="w-4 h-4 ml-2" />{deleteTxMutation.isPending ? "מוחק..." : "מחק בונוס"}
              </Button>
            )}
          </form>
        </DialogContent>
      </Dialog>

      {/* Monthly chart */}
      {monthlyData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>ביצועים {filterMode === "all" ? "חודשיים" : "לפי תקופה"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₪${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₪${v.toLocaleString()}`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="purchases" name="מחזור קניות" fill="hsl(217, 71%, 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="sales" name="מחזור מכירות" fill="hsl(142, 71%, 45%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="profit" name="רווח ישיר" fill="hsl(45, 93%, 47%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="final" name="רווח סופי" fill="hsl(280, 60%, 50%)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="purchases" dir="rtl">
        <TabsList>
          <TabsTrigger value="purchases">רכשים ({new Set(filteredPurchases.map((r: any) => r.order_number || r.id)).size})</TabsTrigger>
          <TabsTrigger value="sales">הזמנות לקוח ({filteredSales.length})</TabsTrigger>
          
        </TabsList>

        <TabsContent value="purchases">
          <Card>
            <CardContent className="p-0">
              <div className="p-3 border-b">
                <Input
                  placeholder="חיפוש לפי מס׳ הזמנה, תיאור פריט..."
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                  className="max-w-sm"
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ הזמנת רכש</TableHead>
                    <TableHead>פריטים</TableHead>
                    <TableHead>סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const poMap = new Map<string, { date: string; items: typeof filteredPurchases; total: number }>();
                    filteredPurchases.forEach((r: any) => {
                      const po = r.order_number || r.id;
                      const existing = poMap.get(po);
                      if (existing) {
                        existing.items.push(r);
                        existing.total += addVAT(r.total_amount || 0);
                      } else {
                        poMap.set(po, { date: r.order_date, items: [r], total: addVAT(r.total_amount || 0) });
                      }
                    });
                    let poList = Array.from(poMap.entries()).sort((a, b) =>
                      (b[1].date || "").localeCompare(a[1].date || ""),
                    );
                    if (purchaseSearch) {
                      const q = purchaseSearch.toLowerCase();
                      poList = poList.filter(([po, data]) =>
                        po.toLowerCase().includes(q) ||
                        data.items.some((item: any) =>
                          (item.item_description || "").toLowerCase().includes(q) ||
                          (item.item_code || "").toLowerCase().includes(q)
                        )
                      );
                    }
                    if (poList.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                            אין רכישות
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return poList.map(([po, data]) => (
                      <>
                        <TableRow
                          key={po}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedPO(expandedPO === po ? null : po)}
                        >
                          <TableCell className="w-10 text-center">
                            {expandedPO === po ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
                          </TableCell>
                          <TableCell>{formatDate(data.date)}</TableCell>
                          <TableCell className="font-mono text-xs">{po}</TableCell>
                          <TableCell>{data.items.length} פריטים</TableCell>
                          <TableCell>₪{data.total.toLocaleString()}</TableCell>
                        </TableRow>
                        {expandedPO === po && (
                          <TableRow key={`${po}-detail`}>
                            <TableCell colSpan={5} className="p-0 bg-muted/30">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>שם פריט</TableHead>
                                    <TableHead>כמות</TableHead>
                                    <TableHead>מחיר ליח׳</TableHead>
                                    <TableHead>סה״כ</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {data.items.map((item: any) => {
                                    const unitPrice = (item.quantity && item.quantity > 0)
                                      ? (item.total_amount || 0) / item.quantity
                                      : item.total_amount || 0;
                                    return (
                                      <TableRow key={item.id}>
                                        <TableCell>{item.item_description || item.item_code || "-"}</TableCell>
                                        <TableCell>{item.quantity || "-"}</TableCell>
                                        <TableCell>₪{addVAT(unitPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</TableCell>
                                        <TableCell>₪{addVAT(item.total_amount || 0).toLocaleString()}</TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ));
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card>
            <CardContent className="p-0">
              <div className="p-3 border-b">
                <Input
                  placeholder="חיפוש לפי SO, פריט או לקוח..."
                  value={salesSearch}
                  onChange={(e) => setSalesSearch(e.target.value)}
                  className="max-w-sm h-8 text-xs"
                />
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>תאריך</TableHead>
                    <TableHead>מס׳ הזמנה (SO)</TableHead>
                    <TableHead>מס׳ הזמנה זבילו</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead>פריטים</TableHead>
                    <TableHead>סה״כ מכירה</TableHead>
                    <TableHead>רווח ישיר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const soMap = new Map<string, { date: string; customer: string; customerPo: string; items: typeof filteredSales; totalSale: number; totalProfit: number }>();
                    filteredSales.forEach((r: any) => {
                      const so = r.order_number || `_single_${r.id}`;
                      const saleAmt = addVAT((r.sale_price || 0) * (r.quantity || 1));
                      const profitAmt = addVAT(((r.sale_price || 0) - (r.cost_price || 0)) * (r.quantity || 1));
                      const existing = soMap.get(so);
                      if (existing) {
                        existing.items.push(r);
                        existing.totalSale += saleAmt;
                        existing.totalProfit += profitAmt;
                        if (!existing.customerPo && r.customer_po) existing.customerPo = r.customer_po;
                      } else {
                        soMap.set(so, {
                          date: r.sale_date,
                          customer: r.customer_name || "-",
                          customerPo: r.customer_po || "",
                          items: [r],
                          totalSale: saleAmt,
                          totalProfit: profitAmt,
                        });
                      }
                    });
                    let soList = Array.from(soMap.entries()).sort((a, b) =>
                      (b[1].date || "").localeCompare(a[1].date || ""),
                    );
                    if (salesSearch) {
                      const q = salesSearch.toLowerCase();
                      soList = soList.filter(([so, data]) =>
                        so.toLowerCase().includes(q) ||
                        (data.customer || "").toLowerCase().includes(q) ||
                        (data.customerPo || "").toLowerCase().includes(q) ||
                        data.items.some((item: any) =>
                          (item.item_description || "").toLowerCase().includes(q) ||
                          (item.item_code || "").toLowerCase().includes(q)
                        )
                      );
                    }
                    if (soList.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                            אין מכירות
                          </TableCell>
                        </TableRow>
                      );
                    }
                    return soList.map(([so, data]) => (
                      <>
                        <TableRow
                          key={so}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setExpandedSO(expandedSO === so ? null : so)}
                        >
                          <TableCell className="w-10 text-center">
                            {expandedSO === so ? <ChevronUp className="w-4 h-4 inline" /> : <ChevronDown className="w-4 h-4 inline" />}
                          </TableCell>
                          <TableCell>{formatDate(data.date)}</TableCell>
                          <TableCell className="font-mono text-xs">{so.startsWith("_single_") ? "-" : so}</TableCell>
                          <TableCell className="font-mono text-xs">{data.customerPo || "-"}</TableCell>
                          <TableCell>{data.customer}</TableCell>
                          <TableCell>{data.items.length}</TableCell>
                          <TableCell>₪{data.totalSale.toLocaleString()}</TableCell>
                          <TableCell>₪{data.totalProfit.toLocaleString()}</TableCell>
                        </TableRow>
                        {expandedSO === so && (
                          <TableRow key={`${so}-detail`}>
                            <TableCell colSpan={8} className="p-0 bg-muted/30">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>פריט</TableHead>
                                    <TableHead>מותג</TableHead>
                                    <TableHead>כמות</TableHead>
                                    <TableHead>מחיר מכירה</TableHead>
                                    <TableHead>עלות</TableHead>
                                    <TableHead>רווח ישיר</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {data.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                      <TableCell>{item.item_description || item.item_code || "-"}</TableCell>
                                      <TableCell>{item.brand || "-"}</TableCell>
                                      <TableCell>{item.quantity || "-"}</TableCell>
                                      <TableCell>₪{addVAT(item.sale_price || 0).toLocaleString()}</TableCell>
                                      <TableCell>₪{addVAT(item.cost_price || 0).toLocaleString()}</TableCell>
                                      <TableCell>₪{addVAT(((item.sale_price || 0) - (item.cost_price || 0)) * (item.quantity || 1)).toLocaleString()}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ));
                  })()}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Edit Supplier Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>עריכת ספק</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate(); }} className="space-y-4">
            <div>
              <Label>שם ספק *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
            </div>
            <div>
              <Label>מספר ספק</Label>
              <Input value={editForm.supplier_number} onChange={(e) => setEditForm({ ...editForm, supplier_number: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>שוטף (ימים)</Label>
                <Input type="number" value={editForm.shotef} onChange={(e) => setEditForm({ ...editForm, shotef: e.target.value })} />
              </div>
              <div>
                <Label>אובליגו (₪)</Label>
                <Input type="number" value={editForm.obligo} onChange={(e) => setEditForm({ ...editForm, obligo: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>בונוס שנתי 2025</Label>
                <Select value={editForm.annual_bonus_status} onValueChange={(v) => setEditForm({ ...editForm, annual_bonus_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">ממתין</SelectItem>
                    <SelectItem value="received">התקבל</SelectItem>
                    <SelectItem value="none">אין</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>כרטסת מתואמת עד</Label>
              <Input type="date" value={editForm.reconciliation_date} onChange={(e) => setEditForm({ ...editForm, reconciliation_date: e.target.value })} />
            </div>
            <div>
              <Label>הערות</Label>
              <Input value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
            <Button type="submit" className="w-full" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
