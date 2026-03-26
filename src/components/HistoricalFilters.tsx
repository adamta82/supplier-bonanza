import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X, Filter } from "lucide-react";
import type { HistoricalFilters as Filters } from "@/lib/historicalDataProcessor";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  availableSuppliers: string[];
  availableStatuses: string[];
}

export default function HistoricalFilters({ filters, onChange, availableSuppliers, availableStatuses }: Props) {
  const toggle = (arr: string[], val: string) =>
    arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Filter className="w-4 h-4" />
        סינון נתונים
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Supplier filter */}
        <div className="space-y-1">
          <Label className="text-xs">ספקים</Label>
          <Select onValueChange={(v) => onChange({ ...filters, suppliers: toggle(filters.suppliers, v) })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={filters.suppliers.length ? `${filters.suppliers.length} נבחרו` : "כל הספקים"} />
            </SelectTrigger>
            <SelectContent>
              {availableSuppliers.map((s) => (
                <SelectItem key={s} value={s}>
                  {filters.suppliers.includes(s) ? "✓ " : ""}{s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.suppliers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {filters.suppliers.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs cursor-pointer" onClick={() => onChange({ ...filters, suppliers: filters.suppliers.filter((x) => x !== s) })}>
                  {s} <X className="w-3 h-3 mr-1" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Status filter */}
        <div className="space-y-1">
          <Label className="text-xs">סטטוסים</Label>
          <Select onValueChange={(v) => onChange({ ...filters, statuses: toggle(filters.statuses, v) })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder={filters.statuses.length ? `${filters.statuses.length} נבחרו` : "כל הסטטוסים"} />
            </SelectTrigger>
            <SelectContent>
              {availableStatuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {filters.statuses.includes(s) ? "✓ " : ""}{s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {filters.statuses.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {filters.statuses.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs cursor-pointer" onClick={() => onChange({ ...filters, statuses: filters.statuses.filter((x) => x !== s) })}>
                  {s} <X className="w-3 h-3 mr-1" />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Date from */}
        <div className="space-y-1">
          <Label className="text-xs">מתאריך</Label>
          <Input type="date" className="h-8 text-xs" value={filters.dateFrom} onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })} />
        </div>

        {/* Date to */}
        <div className="space-y-1">
          <Label className="text-xs">עד תאריך</Label>
          <Input type="date" className="h-8 text-xs" value={filters.dateTo} onChange={(e) => onChange({ ...filters, dateTo: e.target.value })} />
        </div>
      </div>

      {(filters.suppliers.length > 0 || filters.statuses.length > 0 || filters.dateFrom || filters.dateTo) && (
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => onChange({ suppliers: [], statuses: [], dateFrom: "", dateTo: "" })}>
          נקה סינונים
        </Button>
      )}
    </div>
  );
}
