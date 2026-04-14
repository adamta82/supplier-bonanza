import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Clock, TrendingUp, MessageSquare, Upload, Eye, Trash2, FileText, Filter } from "lucide-react";
import { fmtNum } from "@/lib/utils";
import { formatDate } from "@/lib/formatDate";
import PdfPreview from "@/components/PdfPreview";
import { toast } from "sonner";
import BonusAIAnalysis from "@/components/BonusAIAnalysis";

const VAT_RATE = 0.18;
const addVAT = (amount: number) => amount * (1 + VAT_RATE);

const bonusTypeLabels: Record<string, string> = {
  annual_target: "יעדים",
  marketing: "השתתפות בהוצאות פרסום",
  annual_fixed: "שנתי",
};

type StatusFilter = "all" | "active" | "needs_collection" | "received" | "not_achieved";

export default function Alerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showNotesDialog, setShowNotesDialog] = useState<string | null>(null);
  const [newNoteText, setNewNoteText] = useState("");
  const [docViewerUrl, setDocViewerUrl] = useState<string | null>(null);
  const [docViewerName, setDocViewerName] = useState("");

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("*");
      return data || [];
    },
  });

  const { data: agreements } = useQuery({
    queryKey: ["agreements-with-tiers-alerts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bonus_agreements")
        .select("*, bonus_tiers(*), suppliers(name)")
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: purchases } = useQuery({
    queryKey: ["purchases-all-paginated"],
    queryFn: async () => {
      const PAGE_SIZE = 1000;
      let allData: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("purchase_records")
          .select("supplier_id, supplier_name, supplier_number, total_amount, item_description, quantity, order_date, total_with_vat")
          .range(from, from + PAGE_SIZE - 1);
        if (!data || data.length === 0) break;
        allData = allData.concat(data);
        if (data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return allData;
    },
  });

  const { data: transactionBonuses } = useQuery({
    queryKey: ["transaction-bonuses-all"],
    queryFn: async () => {
      const { data } = await supabase.from("transaction_bonuses").select("supplier_id, total_value, counts_toward_target, bonus_value, agreement_id");
      return data || [];
    },
  });

  const { data: agreementNotes } = useQuery({
    queryKey: ["agreement-notes-all"],
    queryFn: async () => {
      const { data } = await supabase.from("agreement_notes").select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const authorName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "משתמש";

  const addNoteMutation = useMutation({
    mutationFn: async ({ agreementId, text }: { agreementId: string; text: string }) => {
      const { error } = await supabase.from("agreement_notes").insert({
        agreement_id: agreementId,
        note_text: text,
        author_name: authorName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreement-notes-all"] });
      setNewNoteText("");
      toast.success("הערה נוספה");
    },
    onError: () => toast.error("שגיאה בשמירת ההערה"),
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const { error } = await supabase.from("agreement_notes").delete().eq("id", noteId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreement-notes-all"] });
      toast.success("הערה נמחקה");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ agreementId, supplierId, file }: { agreementId: string; supplierId: string; file: File }) => {
      const ext = file.name.split(".").pop();
      const path = `${supplierId}/${agreementId}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("agreement-documents").upload(path, file);
      if (uploadError) throw uploadError;
      const { error } = await supabase.from("bonus_agreements").update({ document_path: path } as any).eq("id", agreementId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreements-with-tiers-alerts"] });
      toast.success("מסמך הועלה בהצלחה");
    },
    onError: () => toast.error("שגיאה בהעלאת המסמך"),
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async ({ agreementId, path }: { agreementId: string; path: string }) => {
      await supabase.storage.from("agreement-documents").remove([path]);
      const { error } = await supabase.from("bonus_agreements").update({ document_path: null } as any).eq("id", agreementId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreements-with-tiers-alerts"] });
      toast.success("מסמך נמחק");
    },
    onError: () => toast.error("שגיאה במחיקת המסמך"),
  });

  const updateAgreementStatusMutation = useMutation({
    mutationFn: async ({ agreementId, newStatus }: { agreementId: string; newStatus: string }) => {
      const { error } = await supabase.from("bonus_agreements").update({ bonus_status: newStatus }).eq("id", agreementId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agreements-with-tiers-alerts"] });
      toast.success("סטטוס עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון סטטוס"),
  });

  const handleUploadDocument = (agreementId: string, supplierId: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) uploadDocumentMutation.mutate({ agreementId, supplierId, file });
    };
    input.click();
  };

  const viewDocument = async (path: string) => {
    const { data } = await supabase.storage.from("agreement-documents").createSignedUrl(path, 3600);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = path.split("/").pop() || "document";
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      toast.error("שגיאה בהורדת המסמך");
    }
  };

  const getAgreementStatus = (agreement: any) => {
    if (agreement.bonus_status === "received") {
      return { label: "התקבל", key: "received", color: "bg-green-600 text-white" };
    }
    if (agreement.bonus_status === "not_achieved") {
      return { label: "יעד לא הושג", key: "not_achieved", color: "bg-orange-500 text-white" };
    }
    const today = new Date().toISOString().slice(0, 10);
    if (agreement.period_start && agreement.period_start > today) {
      return { label: "לא התחיל", key: "not_started", color: "bg-muted text-muted-foreground" };
    }
    if (agreement.period_end && agreement.period_end < today) {
      return { label: "צריך לקבל", key: "needs_collection", color: "bg-destructive text-destructive-foreground" };
    }
    return { label: "פעיל", key: "active", color: "bg-secondary text-secondary-foreground" };
  };

  // Build enriched alerts for all agreement types
  const enrichedAlerts = useMemo(() => {
    return (agreements || []).map((agreement: any) => {
      const supplier = suppliers?.find((s) => s.id === agreement.supplier_id);
      const supplierName = agreement.suppliers?.name || supplier?.name || "לא ידוע";
      const status = getAgreementStatus(agreement);

      // Parse exclusions
      const excl: { keyword: string; mode: "include" | "exclude"; counts_toward_target: boolean }[] = (() => {
        try { return typeof agreement.exclusions === "string" ? JSON.parse(agreement.exclusions) : (agreement.exclusions || []); } catch { return []; }
      })();

      const matchesExclusion = (desc: string) => {
        if (!desc || excl.length === 0) return { excluded: false, countsTowardTarget: true };
        const lowerDesc = desc.toLowerCase();
        for (const rule of excl) {
          const kw = rule.keyword.toLowerCase();
          if (!kw) continue;
          if (lowerDesc.includes(kw)) {
            if (rule.mode === "exclude") return { excluded: true, countsTowardTarget: rule.counts_toward_target };
            return { excluded: false, countsTowardTarget: true };
          }
        }
        if (excl.some(r => r.mode === "include")) return { excluded: true, countsTowardTarget: false };
        return { excluded: false, countsTowardTarget: true };
      };

      // Filter purchases by agreement period - match by supplier_id, supplier_number, or supplier_name
      const supplierNumber = supplier?.supplier_number;
      const agrPurchases = (purchases || []).filter((p: any) => {
        const matchesSupplier = p.supplier_id === agreement.supplier_id
          || (supplierNumber && p.supplier_number === supplierNumber)
          || p.supplier_name === supplierName;
        if (!matchesSupplier) return false;
        if (!p.order_date) return false;
        if (agreement.period_start && p.order_date < agreement.period_start) return false;
        if (agreement.period_end && p.order_date > agreement.period_end) return false;
        return true;
      });

      let bonusVolume = 0;
      let targetVolumeWithVAT = 0;
      let targetVolumeExVAT = 0;
      let targetQuantity = 0;
      agrPurchases.forEach((p: any) => {
        const rawAmount = p.total_amount || 0;
        const withVAT = addVAT(rawAmount);
        const qty = p.quantity || 0;
        const result = matchesExclusion(p.item_description || "");
        if (!result.excluded) {
          bonusVolume += withVAT;
          targetVolumeWithVAT += withVAT;
          targetVolumeExVAT += rawAmount;
          targetQuantity += qty;
        } else if (result.countsTowardTarget) {
          targetVolumeWithVAT += withVAT;
          targetVolumeExVAT += rawAmount;
          targetQuantity += qty;
        }
      });

      const isQuantityTarget = agreement.target_type === "quantity";
      let volume = isQuantityTarget ? targetQuantity : (agreement.vat_included ? targetVolumeWithVAT : targetVolumeExVAT);

      // Add transaction bonuses toward target
      const agrTxBonuses = (transactionBonuses || []).filter((b: any) => b.counts_toward_target && b.agreement_id === agreement.id);
      volume += agrTxBonuses.reduce((s: number, b: any) => s + (b.total_value || 0), 0);

      const sortedTiers = (agreement.bonus_tiers || []).sort((a: any, b: any) => a.target_value - b.target_value);

      // Calculate bonus value
      let bonusValue = 0;
      let currentTierIdx = -1;
      if (sortedTiers.length > 0) {
        for (let i = sortedTiers.length - 1; i >= 0; i--) {
          if (volume >= sortedTiers[i].target_value) { currentTierIdx = i; break; }
        }
        const tierToUse = sortedTiers[currentTierIdx >= 0 ? currentTierIdx : 0];
        bonusValue = bonusVolume * (tierToUse.bonus_percentage / 100);
      } else if (agreement.fixed_percentage) {
        bonusValue = bonusVolume * (agreement.fixed_percentage / 100);
      } else if (agreement.fixed_amount) {
        bonusValue = agreement.fixed_amount;
      }

      if (agreement.bonus_status === "not_achieved") bonusValue = 0;

      const nextTier = sortedTiers[currentTierIdx + 1];
      const progress = nextTier ? Math.min((volume / nextTier.target_value) * 100, 100) : (sortedTiers.length > 0 ? 100 : 0);
      const remaining = nextTier ? nextTier.target_value - volume : 0;

      // Days remaining
      let daysRemaining: number | null = null;
      if (agreement.period_end) {
        const endDate = new Date(agreement.period_end);
        const today = new Date();
        daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      }

      const noteCount = (agreementNotes || []).filter((n: any) => n.agreement_id === agreement.id).length;

      return {
        ...agreement,
        supplierName,
        status,
        bonusValue,
        bonusVolume,
        volume,
        sortedTiers,
        currentTierIdx,
        nextTier,
        progress,
        remaining,
        daysRemaining,
        isQuantityTarget,
        noteCount,
        vatLabel: isQuantityTarget ? "כמות" : (agreement.vat_included ? "כולל מע\"מ" : "לפני מע\"מ"),
      };
    });
  }, [agreements, suppliers, purchases, transactionBonuses, agreementNotes]);

  // Filter and sort
  const filteredAlerts = useMemo(() => {
    let filtered = enrichedAlerts;
    if (statusFilter === "active") filtered = filtered.filter((a) => a.status.key === "active");
    else if (statusFilter === "needs_collection") filtered = filtered.filter((a) => a.status.key === "needs_collection");
    else if (statusFilter === "received") filtered = filtered.filter((a) => a.status.key === "received");
    else if (statusFilter === "not_achieved") filtered = filtered.filter((a) => a.status.key === "not_achieved");

    return filtered.sort((a: any, b: any) => {
      if (a.period_end && b.period_end) return a.period_end.localeCompare(b.period_end);
      if (a.period_end && !b.period_end) return -1;
      if (!a.period_end && b.period_end) return 1;
      return b.progress - a.progress;
    });
  }, [enrichedAlerts, statusFilter]);

  const groupByType = (type: string) => filteredAlerts.filter((a) => a.bonus_type === type);

  const fmtVal = (v: number, isQty: boolean) => isQty ? v.toLocaleString("he-IL") : fmtNum(v);
  const unitPrefix = (isQty: boolean) => isQty ? "" : "₪";
  const unitSuffix = (isQty: boolean) => isQty ? " יח'" : "";

  const renderAgreementCard = (alert: any) => {
    const isUrgent = alert.status.key === "active" && alert.progress >= 80 && alert.nextTier;

    return (
      <Card key={alert.id} className={isUrgent ? "border-yellow-500/50 bg-yellow-50/30 dark:bg-yellow-950/10" : ""}>
        <CardContent className="p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {isUrgent && <AlertTriangle className="w-4 h-4 text-yellow-600" />}
              <h3 className="font-bold text-base">
                <Link to={`/suppliers/${alert.supplier_id}`} className="hover:underline text-primary">
                  {alert.supplierName}
                </Link>
              </h3>
              <Badge variant="secondary">{bonusTypeLabels[alert.bonus_type] || alert.bonus_type}</Badge>
              {alert.bonus_type !== "annual_fixed" && (
                <Badge variant={alert.bonus_payment_type === "money" ? "outline" : "default"}>
                  {alert.bonus_payment_type === "money" ? "כסף" : "סחורה"}
                </Badge>
              )}
              {alert.period_start && alert.period_end && (
                <span className="text-xs text-muted-foreground">
                  {formatDate(alert.period_start)} - {formatDate(alert.period_end)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-sm font-bold text-primary ml-2">₪{fmtNum(alert.bonusValue)}</span>

              {/* Status selector */}
              <Select
                value={alert.bonus_status === "received" ? "received" : alert.bonus_status === "not_achieved" ? "not_achieved" : "auto"}
                onValueChange={(v) => updateAgreementStatusMutation.mutate({ agreementId: alert.id, newStatus: v })}
              >
                <SelectTrigger className={`h-7 w-auto min-w-[90px] text-xs font-semibold border-0 ${alert.status.color}`}>
                  <SelectValue>{alert.status.label}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">אוטומטי</SelectItem>
                  <SelectItem value="received">התקבל</SelectItem>
                  <SelectItem value="not_achieved">יעד לא הושג</SelectItem>
                </SelectContent>
              </Select>

              {/* Days remaining */}
              {alert.daysRemaining !== null && alert.status.key === "active" && (
                <Badge variant={alert.daysRemaining < 30 ? "destructive" : "secondary"} className="gap-1 mr-1">
                  <Clock className="w-3 h-3" />
                  {alert.daysRemaining > 0 ? `${alert.daysRemaining} ימים` : "היום"}
                </Badge>
              )}

              {/* Notes */}
              <HoverCard openDelay={200} closeDelay={100}>
                <HoverCardTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 relative" title="הערות" onClick={() => setShowNotesDialog(alert.id)}>
                    <MessageSquare className="w-3.5 h-3.5" />
                    {alert.noteCount > 0 && <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center">{alert.noteCount}</span>}
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent side="bottom" align="center" className="w-72 p-3">
                  <p className="text-xs font-semibold mb-2">הערות</p>
                  {(() => {
                    const notes = (agreementNotes || []).filter((n: any) => n.agreement_id === alert.id);
                    if (notes.length === 0) return <p className="text-xs text-muted-foreground text-center">אין הערות</p>;
                    return (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {notes.map((n: any) => (
                          <div key={n.id} className="text-xs border-b border-border pb-1.5 last:border-0">
                            <div className="flex justify-between text-muted-foreground mb-0.5">
                              <span>{n.author_name}</span>
                              <span>{formatDate(n.created_at)}</span>
                            </div>
                            <p>{n.note_text}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </HoverCardContent>
              </HoverCard>

              {/* Document */}
              {alert.document_path ? (
                <>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="צפה במסמך" onClick={() => viewDocument(alert.document_path)}>
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="מחק מסמך" onClick={() => deleteDocumentMutation.mutate({ agreementId: alert.id, path: alert.document_path })}>
                    <Trash2 className="w-3 h-3 text-destructive" />
                  </Button>
                </>
              ) : (
                <Button variant="ghost" size="icon" className="h-7 w-7" title="העלה מסמך" onClick={() => handleUploadDocument(alert.id, alert.supplier_id)}>
                  <Upload className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Tier-based agreements */}
          {alert.sortedTiers.length > 0 && (
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <div className="text-sm">
                  {alert.nextTier ? "התקדמות למדרגה הבאה: " : "הושגה מדרגה עליונה: "}
                  {unitPrefix(alert.isQuantityTarget)}{fmtVal(alert.volume, alert.isQuantityTarget)}{unitSuffix(alert.isQuantityTarget)} / {unitPrefix(alert.isQuantityTarget)}{fmtVal(alert.nextTier ? alert.nextTier.target_value : alert.sortedTiers[alert.sortedTiers.length - 1]?.target_value, alert.isQuantityTarget)}{unitSuffix(alert.isQuantityTarget)}
                  {!alert.isQuantityTarget && <span className="text-xs text-muted-foreground mr-1">({alert.vatLabel})</span>}
                  {alert.isQuantityTarget && <span className="text-xs text-muted-foreground mr-2">(מחזור כספי: ₪{fmtNum(alert.bonusVolume)})</span>}
                </div>
                <div className="space-y-1">
                  {alert.sortedTiers.map((tier: any, i: number) => {
                    const achieved = alert.volume >= tier.target_value;
                    const prevAchieved = i === 0 || alert.volume >= alert.sortedTiers[i - 1].target_value;
                    const prevTarget = i === 0 ? 0 : alert.sortedTiers[i - 1].target_value;
                    const tierRange = tier.target_value - prevTarget;
                    const fillAmount = prevAchieved ? Math.min(Math.max(alert.volume - prevTarget, 0) / tierRange * 100, 100) : 0;
                    return (
                      <div key={i} className="flex justify-start">
                        <div className="w-full flex items-center gap-2">
                          <div className={`relative flex-1 h-6 rounded border-2 overflow-hidden ${achieved ? "border-green-500" : "border-muted-foreground/30"}`}>
                            <div
                              className={`absolute top-0 bottom-0 right-0 transition-all duration-500 ${achieved ? "bg-green-500" : "bg-primary/40"}`}
                              style={{ width: `${fillAmount}%` }}
                            />
                            <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-bold z-10">
                              <span>{tier.bonus_percentage}%</span>
                              <span className={achieved ? "text-green-800" : "text-muted-foreground"}>
                                {unitPrefix(alert.isQuantityTarget)}{fmtVal(tier.target_value, alert.isQuantityTarget)}{unitSuffix(alert.isQuantityTarget)} {!alert.isQuantityTarget && <span className="font-normal opacity-70">({alert.vatLabel})</span>}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {(alert.bonus_type === "annual_target" || alert.bonus_type === "marketing") && alert.period_start && alert.period_end && alert.sortedTiers.length > 0 && (
                <div className="w-64 shrink-0">
                  <BonusAIAnalysis
                    agreementId={alert.id}
                    volume={alert.volume}
                    target={alert.sortedTiers[alert.sortedTiers.length - 1]?.target_value || 0}
                    periodStart={alert.period_start}
                    periodEnd={alert.period_end}
                    isQuantity={alert.isQuantityTarget}
                    tiers={alert.sortedTiers.map((t: any) => ({ target_value: t.target_value, bonus_percentage: t.bonus_percentage }))}
                    currentTierIdx={alert.currentTierIdx}
                    supplierName={alert.supplierName}
                    bonusType={alert.bonus_type}
                    bonusVolumeMoney={alert.isQuantityTarget ? alert.bonusVolume : undefined}
                  />
                </div>
              )}
            </div>
          )}

          {/* Fixed percentage (no tiers) */}
          {alert.fixed_percentage && !alert.sortedTiers.length && (
            <div className="text-sm space-y-1">
              <div>בונוס קבוע: {alert.fixed_percentage}%</div>
              <div className="text-xs text-muted-foreground">
                {alert.period_end && new Date(alert.period_end) < new Date() ? "מחזור סופי" : "מחזור נוכחי"}: ₪{fmtNum(alert.bonusVolume)}
                {alert.vat_included ? " (כולל מע\"מ)" : " (לפני מע\"מ)"}
              </div>
            </div>
          )}

          {/* Fixed amount (no tiers) */}
          {alert.fixed_amount && !alert.sortedTiers.length && (
            <div className="text-sm space-y-1">
              <div>בונוס קבוע: ₪{fmtNum(alert.fixed_amount)}</div>
              <div className="text-xs text-muted-foreground">
                {alert.period_end && new Date(alert.period_end) < new Date() ? "מחזור סופי" : "מחזור נוכחי"}: ₪{fmtNum(alert.bonusVolume)}
                {alert.vat_included ? " (כולל מע\"מ)" : " (לפני מע\"מ)"}
              </div>
            </div>
          )}

          {/* Exclusions */}
          {(() => {
            const excl = (() => { try { return typeof alert.exclusions === "string" ? JSON.parse(alert.exclusions) : (alert.exclusions || []); } catch { return []; } })();
            return excl.length > 0 ? (
              <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
                🔍 חריגות: {excl.map((e: any) => `${e.mode === "include" ? "כולל" : "לא כולל"} "${e.keyword}"${(alert.bonus_type === "annual_target" || alert.bonus_type === "marketing") ? (e.counts_toward_target ? " ✓יעד" : " ✗יעד") : ""}`).join(" | ")}
              </div>
            ) : null;
          })()}

          {/* Notes */}
          {alert.notes && (
            <div className="text-xs text-muted-foreground border-t pt-2 mt-2">📝 {alert.notes}</div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderTab = (type: string) => {
    const items = groupByType(type);
    if (items.length === 0) {
      return (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            אין הסכמים פעילים מסוג זה
          </CardContent>
        </Card>
      );
    }
    return <div className="space-y-3">{items.map(renderAgreementCard)}</div>;
  };

  // Summary counts
  const totalActive = enrichedAlerts.filter(a => a.status.key === "active").length;
  const totalNeedsCollection = enrichedAlerts.filter(a => a.status.key === "needs_collection").length;
  const totalReceived = enrichedAlerts.filter(a => a.status.key === "received").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">התראות יעדים</h1>
          <p className="text-muted-foreground">מעקב אחרי כל ההסכמים הפעילים</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Summary badges */}
          <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}>
            פעיל: {totalActive}
          </Badge>
          <Badge variant="destructive" className="gap-1 cursor-pointer" onClick={() => setStatusFilter(statusFilter === "needs_collection" ? "all" : "needs_collection")}>
            צריך לקבל: {totalNeedsCollection}
          </Badge>
          <Badge className="gap-1 bg-green-600 cursor-pointer" onClick={() => setStatusFilter(statusFilter === "received" ? "all" : "received")}>
            התקבל: {totalReceived}
          </Badge>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <Filter className="w-3 h-3 ml-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active">פעיל</SelectItem>
              <SelectItem value="needs_collection">צריך לקבל</SelectItem>
              <SelectItem value="received">התקבל</SelectItem>
              <SelectItem value="not_achieved">יעד לא הושג</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs defaultValue="annual_target" dir="rtl">
        <TabsList>
          <TabsTrigger value="annual_target">יעדים ({groupByType("annual_target").length})</TabsTrigger>
          <TabsTrigger value="annual_fixed">שנתי ({groupByType("annual_fixed").length})</TabsTrigger>
          <TabsTrigger value="marketing">השתתפות בהוצאות פרסום ({groupByType("marketing").length})</TabsTrigger>
        </TabsList>

        <TabsContent value="annual_target">{renderTab("annual_target")}</TabsContent>
        <TabsContent value="annual_fixed">{renderTab("annual_fixed")}</TabsContent>
        <TabsContent value="marketing">{renderTab("marketing")}</TabsContent>
      </Tabs>

      {/* Notes Dialog */}
      <Dialog open={!!showNotesDialog} onOpenChange={(open) => { if (!open) { setShowNotesDialog(null); setNewNoteText(""); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>הערות להסכם</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Textarea
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="הוסף הערה..."
                className="min-h-[60px]"
              />
              <Button
                className="self-end"
                disabled={!newNoteText.trim() || addNoteMutation.isPending}
                onClick={() => {
                  if (showNotesDialog && newNoteText.trim()) {
                    addNoteMutation.mutate({ agreementId: showNotesDialog, text: newNoteText.trim() });
                  }
                }}
              >
                {addNoteMutation.isPending ? "..." : "הוסף"}
              </Button>
            </div>
            <div className="max-h-[300px] overflow-auto space-y-2">
              {(agreementNotes || [])
                .filter((n: any) => n.agreement_id === showNotesDialog)
                .map((note: any) => (
                  <div key={note.id} className="border rounded-md p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{note.author_name}</span>
                        <span>{new Date(note.created_at).toLocaleDateString("he-IL")} {new Date(note.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteNoteMutation.mutate(note.id)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    </div>
                    <p className="text-sm">{note.note_text}</p>
                  </div>
                ))}
              {(agreementNotes || []).filter((n: any) => n.agreement_id === showNotesDialog).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">אין הערות עדיין</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog open={!!docViewerUrl} onOpenChange={(open) => { if (!open) setDocViewerUrl(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              {docViewerName}
            </DialogTitle>
          </DialogHeader>
          <div className="w-full">
            {docViewerUrl && (/\.(png|jpg|jpeg|webp|gif)$/i.test(docViewerUrl) ? (
              <div className="h-[75vh]">
                <img src={docViewerUrl} alt={docViewerName} className="w-full h-full object-contain" />
              </div>
            ) : (
              <PdfPreview fileUrl={docViewerUrl} fileName={docViewerName} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
