import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gift, ChevronDown, ChevronUp, X, CheckCircle, Clock } from "lucide-react";
import { formatDate } from "@/lib/formatDate";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";

type CampaignType = "pesach" | "rosh_hashana";

const campaignLabels: Record<string, string> = {
  pesach: "מבצע שקל פסח",
  rosh_hashana: "מבצע שקל ראש השנה",
};

export default function ShekelCampaign() {
  const queryClient = useQueryClient();
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignType>("pesach");
  const [expandedSupplier, setExpandedSupplier] = useState<string | null>(null);
  const [detailDialog, setDetailDialog] = useState<{ supplierId: string; supplierName: string; settingId: string } | null>(null);

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
      threshold: number;
      doubleThreshold: number | null;
      reportedGifts: number | null;
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
        map.set(key, {
          supplierId: setting.supplier_id,
          supplierName: (setting as any).suppliers?.name || p.supplier_name || "",
          settingId: key,
          threshold: setting.threshold_amount,
          doubleThreshold: setting.double_gift_threshold ?? null,
          reportedGifts: setting.supplier_reported_gifts ?? null,
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
  }, [purchases, activeSettings, exclusionMap]);

  const totalGiftsAll = supplierSummary.reduce((s, e) => s + e.totalGifts, 0);

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

  const detailItems = useMemo(() => {
    if (!detailDialog) return [];
    const entry = supplierSummary.find(s => s.settingId === detailDialog.settingId);
    return entry?.items || [];
  }, [detailDialog, supplierSummary]);

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
                  <TableHead>מתנות זכאיות</TableHead>
                  <TableHead>הוסרו</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {supplierSummary.map((entry) => (
                  <TableRow key={entry.settingId}>
                    <TableCell className="font-medium">{entry.supplierName}</TableCell>
                    <TableCell className="text-sm">{formatDate(entry.startDate)} - {formatDate(entry.endDate)}</TableCell>
                    <TableCell>₪{fmtNum(entry.threshold)}</TableCell>
                    <TableCell>
                      <Badge variant="default" className="text-sm">{entry.totalGifts}</Badge>
                    </TableCell>
                    <TableCell>
                      {entry.excludedCount > 0 && (
                        <Badge variant="outline">{entry.excludedCount}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDetailDialog({
                          supplierId: entry.supplierId,
                          supplierName: entry.supplierName,
                          settingId: entry.settingId,
                        })}
                      >
                        צפה בפריטים
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detailDialog} onOpenChange={(o) => !o && setDetailDialog(null)}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>פריטים זכאים למתנה - {detailDialog?.supplierName}</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מספר הזמנה</TableHead>
                <TableHead>תאריך</TableHead>
                <TableHead>מק״ט</TableHead>
                <TableHead>תיאור</TableHead>
                <TableHead>כמות</TableHead>
                <TableHead>מחיר ליח׳ (כולל מע״מ)</TableHead>
                <TableHead>מתנות</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailItems.map((item: any) => (
                <TableRow key={item.id} className={item.isExcluded ? "opacity-50 line-through" : ""}>
                  <TableCell className="text-sm">{item.order_number}</TableCell>
                  <TableCell className="text-sm">{item.order_date ? formatDate(item.order_date) : "-"}</TableCell>
                  <TableCell className="text-sm">{item.item_code || "-"}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{item.item_description || "-"}</TableCell>
                  <TableCell>{item.quantity || 1}</TableCell>
                  <TableCell>₪{fmtNum(item.unitPriceCalc)}</TableCell>
                  <TableCell>
                    <Badge variant={item.isExcluded ? "outline" : "default"}>{item.giftsFromLine}</Badge>
                  </TableCell>
                  <TableCell>
                    {!item.isExcluded && (
                      <Select
                        value={item.giftStatus}
                        onValueChange={(v) => updateStatusMutation.mutate({
                          settingId: item._setting_id,
                          purchaseId: item.id,
                          status: v,
                        })}
                      >
                        <SelectTrigger className="w-[100px] h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">ממתין</SelectItem>
                          <SelectItem value="received">התקבל</SelectItem>
                          <SelectItem value="not_received">לא התקבל</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
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
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    אין פריטים זכאיים למתנה
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
