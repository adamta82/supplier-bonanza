import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { volume, target, periodStart, periodEnd, isQuantity, tiers, currentTierIdx, bonusVolumeMoney } = await req.json();

    const now = new Date();
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const totalDays = Math.max((end.getTime() - start.getTime()) / 86400000, 1);
    const elapsedDays = Math.max((now.getTime() - start.getTime()) / 86400000, 0);
    const remainingDays = Math.max((end.getTime() - now.getTime()) / 86400000, 0);
    const remainingMonths = remainingDays / 30;
    const elapsedMonths = elapsedDays / 30;

    const remainingToTarget = Math.max(target - volume, 0);
    const completionPct = target > 0 ? (volume / target) * 100 : 0;
    const timePct = (elapsedDays / totalDays) * 100;

    const monthlyRate = elapsedMonths > 0 ? volume / elapsedMonths : 0;
    const requiredMonthlyRate = remainingMonths > 0 ? remainingToTarget / remainingMonths : 0;

    // Projection: at current pace, how much will be achieved by end
    const projectedTotal = monthlyRate * (totalDays / 30);
    const projectedPct = target > 0 ? (projectedTotal / target) * 100 : 0;

    // Find next tier
    const sortedTiers = (tiers || []).sort((a: any, b: any) => a.target_value - b.target_value);
    const nextTier = sortedTiers[currentTierIdx + 1] || null;
    const nextTierRemaining = nextTier ? Math.max(nextTier.target_value - volume, 0) : null;

    const fmt = (v: number) => isQuantity ? `${Math.round(v).toLocaleString()} יח'` : `₪${Math.round(v).toLocaleString()}`;

    const lines: string[] = [];

    lines.push(`בוצע: ${fmt(volume)} מתוך ${fmt(target)} (${completionPct.toFixed(1)}%)`);
    lines.push(`חסר: ${fmt(remainingToTarget)}`);
    if (isQuantity && bonusVolumeMoney) {
      lines.push(`מחזור כספי: ₪${Math.round(bonusVolumeMoney).toLocaleString()}`);
    }
    lines.push(`קצב חודשי: ${fmt(monthlyRate)}`);
    if (remainingDays > 0) {
      lines.push(`נדרש: ${fmt(requiredMonthlyRate)}/חודש`);
      lines.push(`נותרו ${Math.round(remainingDays)} ימים (${remainingMonths.toFixed(1)} חודשים)`);
      lines.push(`תחזית בקצב הנוכחי: ${fmt(projectedTotal)} (${projectedPct.toFixed(0)}%)`);
    } else {
      lines.push(`התקופה הסתיימה`);
    }

    if (nextTier) {
      lines.push(`למדרגה הבאה (${nextTier.bonus_percentage}%): חסר ${fmt(nextTierRemaining!)}`);
    }

    const analysis = lines.join("\n");

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-bonus error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
