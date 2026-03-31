import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp, Gift } from "lucide-react";
import { toast } from "sonner";
import { fmtNum } from "@/lib/utils";

export default function VoucherCampaignTab({ supplierId }: { supplierId: string }) {
  const queryClient = useQueryClient();
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<any>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [showGroupDialog, setShowGroupDialog] = useState<string | null>(null);
  const [editingGroup, setEditingGroup] = useState<any>(null);

  // Form state for campaign
  const [campaignName, setCampaignName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [campaignNotes, setCampaignNotes] = useState("");

  // Form state for group
  const [groupName, setGroupName] = useState("");
  const [voucherValue, setVoucherValue] = useState("0");
  const [itemCodesText, setItemCodesText] = useState("");

  const { data: campaigns } = useQuery({
    queryKey: ["voucher-campaigns", supplierId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_campaigns")
        .select("*")
        .eq("supplier_id", supplierId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: groups } = useQuery({
    queryKey: ["voucher-groups", supplierId],
    queryFn: async () => {
      const campaignIds = (campaigns || []).map((c: any) => c.id);
      if (campaignIds.length === 0) return [];
      const { data, error } = await supabase
        .from("voucher_campaign_groups")
        .select("*")
        .in("campaign_id", campaignIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!campaigns && campaigns.length > 0,
  });

  // Fetch sales records for this supplier to calculate eligibility
  const { data: salesRecords } = useQuery({
    queryKey: ["voucher-sales", supplierId],
    queryFn: async () => {
      let allRecords: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("sales_records")
          .select("id, item_code, quantity, sale_date, sale_price, item_description, order_number, customer_name")
          .eq("supplier_id", supplierId)
          .range(from, from + pageSize - 1);
        if (error) throw error;
        allRecords = allRecords.concat(data || []);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return allRecords;
    },
  });

  const { data: claimStatuses } = useQuery({
    queryKey: ["voucher-claims", supplierId],
    queryFn: async () => {
      const campaignIds = (campaigns || []).map((c: any) => c.id);
      if (campaignIds.length === 0) return [];
      const { data, error } = await supabase
        .from("voucher_claim_status")
        .select("*")
        .in("campaign_id", campaignIds);
      if (error) throw error;
      return data || [];
    },
    enabled: !!campaigns && campaigns.length > 0,
  });

  // Campaign CRUD
  const saveCampaignMutation = useMutation({
    mutationFn: async (payload: any) => {
      if (payload.id) {
        const { error } = await supabase.from("voucher_campaigns").update({
          campaign_name: payload.campaign_name,
          start_date: payload.start_date,
          end_date: payload.end_date,
          notes: payload.notes,
          is_active: payload.is_active,
        }).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("voucher_campaigns").insert({
          supplier_id: supplierId,
          campaign_name: payload.campaign_name,
          start_date: payload.start_date,
          end_date: payload.end_date,
          notes: payload.notes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucher-campaigns", supplierId] });
      setShowCampaignDialog(false);
      setEditingCampaign(null);
      toast.success("מבצע תווים נשמר");
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("voucher_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucher-campaigns", supplierId] });
      toast.success("מבצע נמחק");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  // Group CRUD
  const saveGroupMutation = useMutation({
    mutationFn: async (payload: any) => {
      const codes = payload.item_codes.split(/[,\n]+/).map((c: string) => c.trim()).filter(Boolean);
      if (payload.id) {
        const { error } = await supabase.from("voucher_campaign_groups").update({
          group_name: payload.group_name,
          voucher_value: payload.voucher_value,
          item_codes: codes,
        }).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("voucher_campaign_groups").insert({
          campaign_id: payload.campaign_id,
          group_name: payload.group_name,
          voucher_value: payload.voucher_value,
          item_codes: codes,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucher-groups", supplierId] });
      setShowGroupDialog(null);
      setEditingGroup(null);
      toast.success("קבוצת מק\"טים נשמרה");
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("voucher_campaign_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucher-groups", supplierId] });
      toast.success("קבוצה נמחקה");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  // Claim status mutation
  const updateClaimMutation = useMutation({
    mutationFn: async ({ salesRecordId, campaignId, groupId, quantity, voucherValue, status }: any) => {
      // Upsert: check if exists
      const { data: existing } = await supabase
        .from("voucher_claim_status")
        .select("id")
        .eq("sales_record_id", salesRecordId)
        .eq("campaign_id", campaignId)
        .eq("group_id", groupId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase.from("voucher_claim_status").update({ status }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("voucher_claim_status").insert({
          sales_record_id: salesRecordId,
          campaign_id: campaignId,
          group_id: groupId,
          quantity,
          voucher_value: voucherValue,
          status,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voucher-claims", supplierId] });
      toast.success("סטטוס עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון סטטוס"),
  });

  // Calculate eligibility per campaign
  const campaignSummaries = useMemo(() => {
    if (!campaigns || !salesRecords) return {};
    const result: Record<string, {
      totalVouchers: number;
      totalValue: number;
      pendingCount: number;
      receivedCount: number;
      notReceivedCount: number;
      eligibleItems: any[];
    }> = {};

    for (const campaign of campaigns) {
      const campaignGroups = (groups || []).filter((g: any) => g.campaign_id === campaign.id);
      const eligibleItems: any[] = [];
      let totalVouchers = 0;
      let totalValue = 0;
      let pendingCount = 0;
      let receivedCount = 0;
      let notReceivedCount = 0;

      for (const group of campaignGroups) {
        const codes = (group.item_codes || []).map((c: string) => c.toLowerCase());
        const matchingSales = salesRecords.filter((sr: any) => {
          if (!sr.item_code || !sr.sale_date) return false;
          if (!codes.includes(sr.item_code.toLowerCase())) return false;
          return sr.sale_date >= campaign.start_date && sr.sale_date <= campaign.end_date;
        });

        for (const sale of matchingSales) {
          const qty = Math.abs(Number(sale.quantity) || 0);
          const vValue = qty * Number(group.voucher_value);
          totalVouchers += qty;
          totalValue += vValue;

          const claim = (claimStatuses || []).find(
            (cs: any) => cs.sales_record_id === sale.id && cs.campaign_id === campaign.id && cs.group_id === group.id
          );
          const status = claim?.status || "pending";
          if (status === "pending") pendingCount += qty;
          else if (status === "received") receivedCount += qty;
          else notReceivedCount += qty;

          eligibleItems.push({
            saleId: sale.id,
            groupId: group.id,
            groupName: group.group_name,
            itemCode: sale.item_code,
            itemDescription: sale.item_description,
            orderNumber: sale.order_number,
            customerName: sale.customer_name,
            saleDate: sale.sale_date,
            quantity: qty,
            voucherValuePerUnit: Number(group.voucher_value),
            totalVoucherValue: vValue,
            status,
            claimId: claim?.id,
          });
        }
      }

      result[campaign.id] = { totalVouchers, totalValue, pendingCount, receivedCount, notReceivedCount, eligibleItems };
    }
    return result;
  }, [campaigns, groups, salesRecords, claimStatuses]);

  const openAddCampaign = () => {
    setEditingCampaign(null);
    setCampaignName("");
    setStartDate("");
    setEndDate("");
    setCampaignNotes("");
    setShowCampaignDialog(true);
  };

  const openEditCampaign = (c: any) => {
    setEditingCampaign(c);
    setCampaignName(c.campaign_name);
    setStartDate(c.start_date);
    setEndDate(c.end_date);
    setCampaignNotes(c.notes || "");
    setShowCampaignDialog(true);
  };

  const openAddGroup = (campaignId: string) => {
    setEditingGroup(null);
    setGroupName("");
    setVoucherValue("0");
    setItemCodesText("");
    setShowGroupDialog(campaignId);
  };

  const openEditGroup = (g: any) => {
    setEditingGroup(g);
    setGroupName(g.group_name);
    setVoucherValue(g.voucher_value?.toString() || "0");
    setItemCodesText((g.item_codes || []).join(", "));
    setShowGroupDialog(g.campaign_id);
  };

  return (
    <TabsContent value="voucher">
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={openAddCampaign}>
            <Plus className="w-4 h-4 ml-1" />הוסף מבצע תווים
          </Button>
        </div>

        {(!campaigns || campaigns.length === 0) && (
          <p className="text-center text-muted-foreground py-8">אין מבצעי תווים מוגדרים</p>
        )}

        {(campaigns || []).map((campaign: any) => {
          const summary = campaignSummaries[campaign.id];
          const isExpanded = expandedCampaign === campaign.id;
          const campaignGroups = (groups || []).filter((g: any) => g.campaign_id === campaign.id);

          return (
            <Card key={campaign.id}>
              <CardContent className="p-4 space-y-3">
                {/* Campaign header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    <div>
                      <div className="flex items-center gap-2">
                        <Gift className="w-4 h-4 text-primary" />
                        <span className="font-semibold">{campaign.campaign_name}</span>
                        <Badge variant={campaign.is_active ? "default" : "secondary"}>
                          {campaign.is_active ? "פעיל" : "לא פעיל"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {campaign.start_date} — {campaign.end_date}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {summary && (
                      <div className="flex gap-3 text-xs ml-4">
                        <span>תווים: <strong>{summary.totalVouchers}</strong></span>
                        <span>שווי: <strong>₪{fmtNum(summary.totalValue)}</strong></span>
                        <Badge variant="outline" className="text-xs">ממתין: {summary.pendingCount}</Badge>
                        <Badge variant="default" className="text-xs">התקבל: {summary.receivedCount}</Badge>
                      </div>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEditCampaign(campaign)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteCampaignMutation.mutate(campaign.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="space-y-4 pt-2">
                    {campaign.notes && <p className="text-sm text-muted-foreground">{campaign.notes}</p>}

                    {/* Groups section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">קבוצות מק"טים</h4>
                        <Button variant="outline" size="sm" onClick={() => openAddGroup(campaign.id)}>
                          <Plus className="w-3 h-3 ml-1" />הוסף קבוצה
                        </Button>
                      </div>

                      {campaignGroups.length === 0 && (
                        <p className="text-xs text-muted-foreground">לא הוגדרו קבוצות מק"טים עדיין</p>
                      )}

                      {campaignGroups.map((g: any) => (
                        <div key={g.id} className="border rounded-md p-3 space-y-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium text-sm">{g.group_name}</span>
                              <span className="text-xs text-muted-foreground mr-2">
                                שווי תו: ₪{fmtNum(Number(g.voucher_value))}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditGroup(g)}>
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteGroupMutation.mutate(g.id)}>
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            מק"טים: {(g.item_codes || []).join(", ") || "—"}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Eligible items table */}
                    {summary && summary.eligibleItems.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">פריטים זכאים</h4>
                        <div className="max-h-[400px] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>תאריך</TableHead>
                                <TableHead>הזמנה</TableHead>
                                <TableHead>לקוח</TableHead>
                                <TableHead>מק"ט</TableHead>
                                <TableHead>תיאור</TableHead>
                                <TableHead>קבוצה</TableHead>
                                <TableHead>כמות</TableHead>
                                <TableHead>שווי תו</TableHead>
                                <TableHead>סה"כ</TableHead>
                                <TableHead>סטטוס</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {summary.eligibleItems.map((item: any, idx: number) => (
                                <TableRow key={`${item.saleId}-${item.groupId}-${idx}`}>
                                  <TableCell className="text-xs">{item.saleDate}</TableCell>
                                  <TableCell className="text-xs">{item.orderNumber || "—"}</TableCell>
                                  <TableCell className="text-xs">{item.customerName || "—"}</TableCell>
                                  <TableCell className="text-xs font-mono">{item.itemCode}</TableCell>
                                  <TableCell className="text-xs">{item.itemDescription || "—"}</TableCell>
                                  <TableCell className="text-xs">{item.groupName}</TableCell>
                                  <TableCell className="text-xs">{item.quantity}</TableCell>
                                  <TableCell className="text-xs">₪{fmtNum(item.voucherValuePerUnit)}</TableCell>
                                  <TableCell className="text-xs font-semibold">₪{fmtNum(item.totalVoucherValue)}</TableCell>
                                  <TableCell>
                                    <Select
                                      value={item.status}
                                      onValueChange={(val) => updateClaimMutation.mutate({
                                        salesRecordId: item.saleId,
                                        campaignId: campaign.id,
                                        groupId: item.groupId,
                                        quantity: item.quantity,
                                        voucherValue: item.voucherValuePerUnit,
                                        status: val,
                                      })}
                                    >
                                      <SelectTrigger className="h-7 w-[110px] text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="pending">ממתין</SelectItem>
                                        <SelectItem value="received">התקבל</SelectItem>
                                        <SelectItem value="not_received">לא התקבל</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}

                    {summary && summary.eligibleItems.length === 0 && campaignGroups.length > 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        לא נמצאו מכירות מתאימות בתקופת המבצע
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Campaign Dialog */}
      <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCampaign ? "עריכת מבצע תווים" : "מבצע תווים חדש"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>שם המבצע</Label>
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder="למשל: מבצע תווים חורף 2025" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>מתאריך</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label>עד תאריך</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>הערות</Label>
              <Input value={campaignNotes} onChange={(e) => setCampaignNotes(e.target.value)} />
            </div>
            <Button
              onClick={() => saveCampaignMutation.mutate({
                id: editingCampaign?.id,
                campaign_name: campaignName,
                start_date: startDate,
                end_date: endDate,
                notes: campaignNotes,
                is_active: editingCampaign?.is_active ?? true,
              })}
              disabled={!campaignName || !startDate || !endDate || saveCampaignMutation.isPending}
            >
              {saveCampaignMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Group Dialog */}
      <Dialog open={!!showGroupDialog} onOpenChange={() => setShowGroupDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? "עריכת קבוצה" : "קבוצת מק\"טים חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>שם הקבוצה</Label>
              <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="למשל: קבוצה A" />
            </div>
            <div>
              <Label>שווי תו ליחידה (₪)</Label>
              <Input type="number" value={voucherValue} onChange={(e) => setVoucherValue(e.target.value)} />
            </div>
            <div>
              <Label>מק"טים (מופרדים בפסיק או שורה חדשה)</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 min-h-[80px]"
                value={itemCodesText}
                onChange={(e) => setItemCodesText(e.target.value)}
                placeholder="001-1234, 001-5678&#10;002-9999"
              />
            </div>
            <Button
              onClick={() => saveGroupMutation.mutate({
                id: editingGroup?.id,
                campaign_id: showGroupDialog,
                group_name: groupName,
                voucher_value: parseFloat(voucherValue) || 0,
                item_codes: itemCodesText,
              })}
              disabled={!groupName || !itemCodesText || saveGroupMutation.isPending}
            >
              {saveGroupMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}
