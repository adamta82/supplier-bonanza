import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Gift, ChevronDown, ChevronUp, X, CheckCircle, Clock, Download, ArrowUpDown, ArrowUp, ArrowDown, Users, Plus, Trash2, Pencil, Check, RotateCcw } from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";
import * as XLSX from "xlsx";

type SortKey = "order_number" | "order_date" | "item_code" | "item_description" | "quantity" | "unitPriceCalc" | "giftsFromLine" | "giftStatus";
type SortDir = "asc" | "desc";

type CampaignType = "pesach" | "rosh_hashana";

const campaignLabels: Record<string, string> = {
  pesach: "מבצע שקל פסח",
  rosh_hashana: "מבצע שקל ראש השנה",
};

export default function ShekelCampaign() {
  const queryClient = useQueryClient();
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignType>("pesach");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [detailDialog, setDetailDialog] = useState<{ supplierName: string; settingIds: string[] } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("order_date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [groupsDialogOpen, setGroupsDialogOpen] = useState(false);

  // Load all campaign settings
  const { data: settings } = useQuery({
    queryKey: ["shekel-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("shekel_campaign_settings")
        .select("*, suppliers(name, supplier_number)")
        .eq("is_active", true);
      return data || [];
    },
  });

  const { data: groups } = useQuery({
    queryKey: ["shekel-groups"],
    queryFn: async () => {
      const { data } = await supabase.from("shekel_campaign_groups").select("*").order("name");
      return data || [];
    },
  });

  const groupNameById = useMemo(() => {
    const m = new Map<string, string>();
    (groups || []).forEach((g: any) => m.set(g.id, g.name));
    return m;
  }, [groups]);

  // Load all purchase records for active campaigns
  const activeSettings = useMemo(() => 
    (settings || []).filter((s: any) => s.campaign_name === selectedCampaign), 
    [settings, selectedCampaign]
  );

  const { data: purchases } = useQuery({
    queryKey: ["shekel-purchases", selectedCampaign, activeSettings.map((s: any) => s.id).join(",")],
    queryFn: async () => {
      if (activeSettings.length === 0) return [];
      // Get all purchase records for suppliers in the campaign date range
      const allPurchases: any[] = [];
      for (const setting of activeSettings) {
        let query = supabase
          .from("purchase_records")
          .select("*")
          .eq("supplier_id", setting.supplier_id)
          .gte("order_date", setting.start_date)
          .lte("order_date", setting.end_date);
        const { data } = await query;
        if (data) {
          allPurchases.push(...data.map((p: any) => ({ ...p, _setting_id: setting.id, _threshold: setting.threshold_amount })));
        }
      }
      return allPurchases;
    },
    enabled: activeSettings.length > 0,
  });

  // Load exclusions
  const { data: exclusions } = useQuery({
    queryKey: ["shekel-exclusions"],
    queryFn: async () => {
      const { data } = await supabase.from("shekel_campaign_exclusions").select("*");
      return data || [];
    },
  });

  const exclusionMap = useMemo(() => {
    const map = new Map<string, any>();
    (exclusions || []).forEach((e: any) => {
      map.set(`${e.campaign_setting_id}_${e.purchase_record_id}`, e);
    });
    return map;
  }, [exclusions]);

  // Calculate eligibility per supplier
  const supplierSummary = useMemo(() => {
    const map = new Map<string, {
      supplierId: string;
      supplierName: string;
      settingId: string;
      groupId: string | null;
      groupName: string | null;
      threshold: number;
      doubleThreshold: number | null;
      reportedGifts: number | null;
      discrepancyApproved: boolean;
      startDate: string;
      endDate: string;
      totalGifts: number;
      receivedGifts: number;
      excludedCount: number;
      items: any[];
    }>();

    (purchases || []).forEach((p: any) => {
      const key = p._setting_id;
      if (!map.has(key)) {
        const setting = activeSettings.find((s: any) => s.id === key);
        if (!setting) return;
        const gid = (setting as any).group_id || null;
        map.set(key, {
          supplierId: setting.supplier_id,
          supplierName: (setting as any).suppliers?.name || p.supplier_name || "",
          settingId: key,
          groupId: gid,
          groupName: gid ? (groupNameById.get(gid) || null) : (setting.group_name || null),
          threshold: setting.threshold_amount,
          doubleThreshold: setting.double_gift_threshold ?? null,
          reportedGifts: setting.supplier_reported_gifts ?? null,
          discrepancyApproved: !!(setting as any).discrepancy_approved,
          startDate: setting.start_date,
          endDate: setting.end_date,
          totalGifts: 0,
          receivedGifts: 0,
          excludedCount: 0,
          items: [],
        });
      }
      const entry = map.get(key)!;
      const lineTotal = p.total_with_vat || ((p.total_amount || 0) * 1.18);
      const qty = p.quantity || 1;
      const unitPrice = qty > 0 ? lineTotal / qty : lineTotal;
      
      // Check if unit price meets threshold
      if (unitPrice >= entry.threshold) {
        const excKey = `${key}_${p.id}`;
        const exclusion = exclusionMap.get(excKey);
        const isExcluded = !!exclusion;
        const giftStatus = exclusion?.gift_status || "pending";
        // 2 gifts per unit if double threshold is set and met, otherwise 1
        const giftsPerUnit = (entry.doubleThreshold !== null && unitPrice >= entry.doubleThreshold) ? 2 : 1;
        const giftsFromLine = qty * giftsPerUnit;

        if (!isExcluded) {
          entry.totalGifts += giftsFromLine;
          if (giftStatus === "received") entry.receivedGifts += giftsFromLine;
        } else {
          entry.excludedCount += giftsFromLine;
        }
        
        entry.items.push({
          ...p,
          unitPriceCalc: unitPrice,
          giftsFromLine,
          giftsPerUnit,
          isExcluded,
          giftStatus,
          exclusionId: exclusion?.id,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalGifts - a.totalGifts);
  }, [purchases, activeSettings, exclusionMap, groupNameById]);

  const totalGiftsAll = supplierSummary.reduce((s, e) => s + e.totalGifts, 0);

  // Group entries by group_name (entries with same group merged into single display row)
  type DisplayRow = {
    key: string;
    isGroup: boolean;
    groupName: string | null;
    displayName: string;
    members: typeof supplierSummary;
    totalGifts: number;
    excludedCount: number;
    reportedGifts: number | null;
    startDate: string;
    endDate: string;
    threshold: number;
    doubleThreshold: number | null;
    discrepancyApproved: boolean;
    primarySettingId: string;
  };

  const displayRows: DisplayRow[] = useMemo(() => {
    const groups = new Map<string, typeof supplierSummary>();
    const singles: typeof supplierSummary = [];
    supplierSummary.forEach((e) => {
      if (e.groupName && e.groupName.trim() !== "") {
        const arr = groups.get(e.groupName) || [];
        arr.push(e);
        groups.set(e.groupName, arr);
      } else {
        singles.push(e);
      }
    });
    const rows: DisplayRow[] = [];
    groups.forEach((members, gname) => {
      const totalGifts = members.reduce((s, m) => s + m.totalGifts, 0);
      const excludedCount = members.reduce((s, m) => s + m.excludedCount, 0);
      const anyReported = members.some((m) => m.reportedGifts !== null);
      const reportedGifts = anyReported
        ? members.reduce((s, m) => s + (m.reportedGifts || 0), 0)
        : null;
      const startDate = members.reduce((min, m) => (!min || m.startDate < min ? m.startDate : min), "");
      const endDate = members.reduce((max, m) => (!max || m.endDate > max ? m.endDate : max), "");
      rows.push({
        key: `g_${gname}`,
        isGroup: true,
        groupName: gname,
        displayName: `${gname} (${members.map((m) => m.supplierName).join(" + ")})`,
        members,
        totalGifts,
        excludedCount,
        reportedGifts,
        startDate,
        endDate,
        threshold: members[0].threshold,
        doubleThreshold: members[0].doubleThreshold,
        discrepancyApproved: members.some((m) => m.discrepancyApproved),
        primarySettingId: members[0].settingId,
      });
    });
    singles.forEach((e) => {
      rows.push({
        key: `s_${e.settingId}`,
        isGroup: false,
        groupName: null,
        displayName: e.supplierName,
        members: [e],
        totalGifts: e.totalGifts,
        excludedCount: e.excludedCount,
        reportedGifts: e.reportedGifts,
        startDate: e.startDate,
        endDate: e.endDate,
        threshold: e.threshold,
        doubleThreshold: e.doubleThreshold,
        discrepancyApproved: e.discrepancyApproved,
        primarySettingId: e.settingId,
      });
    });
    return rows.sort((a, b) => b.totalGifts - a.totalGifts);
  }, [supplierSummary]);


  // Exclude item mutation
  const excludeMutation = useMutation({
    mutationFn: async ({ settingId, purchaseId }: { settingId: string; purchaseId: string }) => {
      const { error } = await supabase.from("shekel_campaign_exclusions").insert({
        campaign_setting_id: settingId,
        purchase_record_id: purchaseId,
        gift_status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-exclusions"] });
      toast.success("הפריט הוסר מהזכאות");
    },
    onError: () => toast.error("שגיאה בהסרת הפריט"),
  });

  // Remove exclusion (restore item)
  const restoreMutation = useMutation({
    mutationFn: async ({ exclusionId }: { exclusionId: string }) => {
      const { error } = await supabase.from("shekel_campaign_exclusions").delete().eq("id", exclusionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-exclusions"] });
      toast.success("הפריט שוחזר לזכאות");
    },
    onError: () => toast.error("שגיאה בשחזור הפריט"),
  });

  // Update gift status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ settingId, purchaseId, status }: { settingId: string; purchaseId: string; status: string }) => {
      // Upsert exclusion with status
      const existing = exclusionMap.get(`${settingId}_${purchaseId}`);
      if (existing) {
        const { error } = await supabase.from("shekel_campaign_exclusions").update({ gift_status: status }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shekel_campaign_exclusions").insert({
          campaign_setting_id: settingId,
          purchase_record_id: purchaseId,
          gift_status: status,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-exclusions"] });
      toast.success("סטטוס עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון סטטוס"),
  });

  // Update supplier-reported gifts count
  const updateReportedMutation = useMutation({
    mutationFn: async ({ settingId, reported }: { settingId: string; reported: number | null }) => {
      const { error } = await supabase
        .from("shekel_campaign_settings")
        .update({ supplier_reported_gifts: reported })
        .eq("id", settingId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-settings"] });
      toast.success("מספר הספק עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });
  // Approve/unapprove discrepancy
  const approveDiscrepancyMutation = useMutation({
    mutationFn: async ({ settingIds, approved }: { settingIds: string[]; approved: boolean }) => {
      const { error } = await supabase
        .from("shekel_campaign_settings")
        .update({ discrepancy_approved: approved })
        .in("id", settingIds);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["shekel-settings"] });
      toast.success(vars.approved ? "הסכום אושר כתקין" : "בוטל אישור הסכום");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });


  const detailItems = useMemo(() => {
    if (!detailDialog) return [];
    const items: any[] = [];
    detailDialog.settingIds.forEach((sid) => {
      const entry = supplierSummary.find(s => s.settingId === sid);
      if (entry) items.push(...entry.items.map(it => ({ ...it, _supplierName: entry.supplierName })));
    });
    items.sort((a: any, b: any) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [detailDialog, supplierSummary, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const exportToExcel = () => {
    if (!detailDialog || detailItems.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }
    const statusLabels: Record<string, string> = { pending: "ממתין", received: "התקבל", not_received: "לא התקבל" };
    const rows = detailItems.map((item: any) => ({
      "מספר הזמנה": item.order_number || "",
      "תאריך": item.order_date ? formatDate(item.order_date) : "",
      "מק״ט": item.item_code || "",
      "תיאור": item.item_description || "",
      "כמות": item.quantity || 1,
      "מחיר ליח׳ (כולל מע״מ)": Math.round(item.unitPriceCalc || 0),
      "מתנות ליח׳": item.giftsPerUnit,
      "סה״כ מתנות": item.giftsFromLine,
      "סטטוס": item.isExcluded ? "הוסר" : (statusLabels[item.giftStatus] || item.giftStatus),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!views"] = [{ RTL: true }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "פריטים");
    const fname = `מבצע_שקל_${detailDialog.supplierName}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fname);
    toast.success("הקובץ יוצא בהצלחה");
  };

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 hover:text-primary font-medium"
    >
      {label}
      {sortKey === k ? (
        sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Gift className="w-8 h-8" />
            מבצע שקל
          </h1>
          <p className="text-muted-foreground text-sm mt-1">מעקב זכאות למתנות מספקים</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setGroupsDialogOpen(true)}>
            <Users className="w-4 h-4" />
            ניהול ריכוזי ספקים
          </Button>
          <Select value={selectedCampaign} onValueChange={(v) => setSelectedCampaign(v as CampaignType)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pesach">מבצע שקל פסח</SelectItem>
              <SelectItem value="rosh_hashana">מבצע שקל ראש השנה</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary card */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-muted-foreground">ספקים משתתפים</div>
            <div className="text-2xl font-bold">{supplierSummary.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-muted-foreground">סה״כ מתנות זכאיות</div>
            <div className="text-2xl font-bold text-primary">{totalGiftsAll}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 text-center">
            <div className="text-xs text-muted-foreground">{campaignLabels[selectedCampaign]}</div>
            <div className="text-2xl font-bold">
              {activeSettings.length > 0 
                ? `${formatDate(activeSettings[0]?.start_date)} - ${formatDate(activeSettings[0]?.end_date)}`
                : "לא מוגדר"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers table */}
      {supplierSummary.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Gift className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>אין ספקים משתתפים במבצע {campaignLabels[selectedCampaign]}</p>
            <p className="text-xs mt-1">הגדר מבצע שקל בדף הספק</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">זכאות למתנות לפי ספק</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ספק</TableHead>
                  <TableHead>תקופה</TableHead>
                  <TableHead>סף (כולל מע״מ)</TableHead>
                  <TableHead>סף 2 מתנות</TableHead>
                  <TableHead>מתנות לפי המערכת</TableHead>
                  <TableHead>מספר מהספק</TableHead>
                  <TableHead>השוואה</TableHead>
                  <TableHead>הוסרו</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row) => {
                  const diff = row.reportedGifts !== null ? row.reportedGifts - row.totalGifts : null;
                  const primarySettingId = row.members[0].settingId;
                  return (
                  <TableRow key={row.key}>
                    <TableCell className="font-medium">
                      {row.isGroup ? (
                        <div>
                          <Badge variant="secondary" className="mb-1 text-xs">קבוצה: {row.groupName}</Badge>
                          <div className="text-sm">{row.members.map(m => m.supplierName).join(" + ")}</div>
                        </div>
                      ) : row.displayName}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(row.startDate)} - {formatDate(row.endDate)}</TableCell>
                    <TableCell>₪{fmtNum(row.threshold)}</TableCell>
                    <TableCell className="text-sm">{row.doubleThreshold !== null ? `₪${fmtNum(row.doubleThreshold)}` : "-"}</TableCell>
                    <TableCell>
                      <Badge variant="default" className="text-sm">{row.totalGifts}</Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-24 h-8"
                        defaultValue={row.reportedGifts ?? ""}
                        placeholder="-"
                        onBlur={(e) => {
                          const val = e.target.value.trim();
                          const num = val === "" ? null : parseInt(val);
                          if (num !== row.reportedGifts) {
                            updateReportedMutation.mutate({ settingId: primarySettingId, reported: num });
                            // Clear reported on other members so sum equals primary's value
                            row.members.slice(1).forEach((m) => {
                              if (m.reportedGifts !== null) {
                                updateReportedMutation.mutate({ settingId: m.settingId, reported: null });
                              }
                            });
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        {diff === null ? (
                          <span className="text-muted-foreground text-sm">-</span>
                        ) : diff === 0 ? (
                          <Badge variant="default" className="bg-green-600">תואם</Badge>
                        ) : row.discrepancyApproved ? (
                          <Badge variant="default" className="bg-green-600">
                            <Check className="w-3 h-3 ml-1" />
                            אושר ({diff > 0 ? `+${diff}` : diff})
                          </Badge>
                        ) : (
                          <Badge variant={diff > 0 ? "secondary" : "destructive"}>
                            {diff > 0 ? `+${diff}` : diff}
                          </Badge>
                        )}
                        {diff !== null && diff !== 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => approveDiscrepancyMutation.mutate({
                              settingIds: row.members.map(m => m.settingId),
                              approved: !row.discrepancyApproved,
                            })}
                          >
                            {row.discrepancyApproved ? (
                              <><RotateCcw className="w-3 h-3 ml-1" />בטל אישור</>
                            ) : (
                              <><Check className="w-3 h-3 ml-1" />סמן כתקין</>
                            )}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.excludedCount > 0 && (
                        <Badge variant="outline">{row.excludedCount}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailDialog({
                          supplierName: row.displayName,
                          settingIds: row.members.map(m => m.settingId),
                        })}
                      >
                        צפה בפריטים
                      </Button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailDialog} onOpenChange={(o) => !o && setDetailDialog(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle>פריטים זכאים למתנה - {detailDialog?.supplierName}</DialogTitle>
              <Button size="sm" variant="outline" onClick={exportToExcel} className="ml-8">
                <Download className="w-4 h-4" />
                ייצוא לאקסל
              </Button>
            </div>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><SortHeader k="order_number" label="מספר הזמנה" /></TableHead>
                <TableHead><SortHeader k="order_date" label="תאריך" /></TableHead>
                <TableHead><SortHeader k="item_code" label="מק״ט" /></TableHead>
                <TableHead><SortHeader k="item_description" label="תיאור" /></TableHead>
                <TableHead><SortHeader k="quantity" label="כמות" /></TableHead>
                <TableHead><SortHeader k="unitPriceCalc" label="מחיר ליח׳ (כולל מע״מ)" /></TableHead>
                <TableHead><SortHeader k="giftsFromLine" label="מתנות" /></TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailItems.map((item: any) => (
                <TableRow key={item.id} className={item.isExcluded ? "opacity-50 line-through" : ""}>
                  <TableCell className="text-sm">{item.order_number}</TableCell>
                  <TableCell className="text-sm">{item.order_date ? formatDate(item.order_date) : "-"}</TableCell>
                  <TableCell className="text-sm">{item.item_code || "-"}</TableCell>
                  <TableCell className="text-sm max-w-[200px] whitespace-normal break-words">{item.item_description || "-"}</TableCell>
                  <TableCell>{item.quantity || 1}</TableCell>
                  <TableCell>₪{fmtNum(item.unitPriceCalc)}</TableCell>
                  <TableCell>
                    <Badge variant={item.isExcluded ? "outline" : "default"}>{item.giftsFromLine}</Badge>
                  </TableCell>
                  <TableCell>
                  </TableCell>
                  <TableCell>
                    {!item.isExcluded ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => excludeMutation.mutate({
                          settingId: item._setting_id,
                          purchaseId: item.id,
                        })}
                      >
                        <X className="w-4 h-4" />
                        הסר
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => restoreMutation.mutate({ exclusionId: item.exclusionId })}
                      >
                        שחזר
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {detailItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    אין פריטים זכאיים למתנה
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <ManageGroupsDialog
        open={groupsDialogOpen}
        onOpenChange={setGroupsDialogOpen}
        groups={groups || []}
        settings={settings || []}
      />
    </div>
  );
}

function ManageGroupsDialog({ open, onOpenChange, groups, settings }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  groups: any[];
  settings: any[];
}) {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");

  const usageById = useMemo(() => {
    const m = new Map<string, number>();
    settings.forEach((s: any) => {
      if (s.group_id) m.set(s.group_id, (m.get(s.group_id) || 0) + 1);
    });
    return m;
  }, [settings]);

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("shekel_campaign_groups").insert({ name });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-groups"] });
      setNewName("");
      toast.success("ריכוז נוצר");
    },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "שם כבר קיים" : "שגיאה"),
  });

  const renameMut = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("shekel_campaign_groups").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-groups"] });
      toast.success("שם הריכוז עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shekel_campaign_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shekel-groups"] });
      queryClient.invalidateQueries({ queryKey: ["shekel-settings"] });
      toast.success("ריכוז נמחק");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>ניהול ריכוזי ספקים</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="שם ריכוז חדש (לדוגמא: אלקטרה)"
            onKeyDown={(e) => e.key === "Enter" && newName.trim() && createMut.mutate(newName.trim())}
          />
          <Button onClick={() => newName.trim() && createMut.mutate(newName.trim())} disabled={!newName.trim() || createMut.isPending}>
            <Plus className="w-4 h-4" /> צור
          </Button>
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto">
          {groups.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">אין ריכוזים מוגדרים</p>
          )}
          {groups.map((g: any) => (
            <GroupRow
              key={g.id}
              group={g}
              usage={usageById.get(g.id) || 0}
              onRename={(name) => renameMut.mutate({ id: g.id, name })}
              onDelete={() => {
                if (confirm(`למחוק את הריכוז "${g.name}"? ספקים המשויכים לא יימחקו, רק יבוטל השיוך.`)) {
                  deleteMut.mutate(g.id);
                }
              }}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupRow({ group, usage, onRename, onDelete }: {
  group: any;
  usage: number;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);

  return (
    <div className="flex items-center gap-2 p-2 border rounded-md">
      {editing ? (
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" autoFocus />
      ) : (
        <div className="flex-1">
          <div className="font-medium">{group.name}</div>
          <div className="text-xs text-muted-foreground">{usage} ספקים משויכים</div>
        </div>
      )}
      {editing ? (
        <>
          <Button size="sm" onClick={() => { if (name.trim() && name !== group.name) onRename(name.trim()); setEditing(false); }}>שמור</Button>
          <Button size="sm" variant="ghost" onClick={() => { setName(group.name); setEditing(false); }}>בטל</Button>
        </>
      ) : (
        <>
          <Button size="icon" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      )}
    </div>
  );
}
