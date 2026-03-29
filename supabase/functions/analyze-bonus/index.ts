import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { volume, target, periodStart, periodEnd, isQuantity, tiers, currentTierIdx, bonusPercentage, supplierName, bonusType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const now = new Date();
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const totalDays = Math.max((end.getTime() - start.getTime()) / 86400000, 1);
    const elapsedDays = Math.max((now.getTime() - start.getTime()) / 86400000, 0);
    const remainingDays = Math.max((end.getTime() - now.getTime()) / 86400000, 0);
    const elapsedPct = Math.min((elapsedDays / totalDays) * 100, 100).toFixed(0);
    const volumePct = target > 0 ? ((volume / target) * 100).toFixed(0) : "0";

    const unit = isQuantity ? "יח'" : "₪";
    const tiersInfo = tiers?.map((t: any, i: number) => 
      `מדרגה ${i+1}: ${unit}${t.target_value.toLocaleString()} → ${t.bonus_percentage}%${i === currentTierIdx ? " (הושגה)" : ""}`
    ).join("; ") || "";

    const prompt = `אתה אנליסט עסקי. תן ניתוח קצר (2-3 משפטים) בעברית על מצב הבונוס הזה:
- ספק: ${supplierName}
- סוג בונוס: ${bonusType === "annual_target" ? "יעדים שנתיים" : bonusType === "marketing" ? "השתתפות בהוצאות פרסום" : bonusType}
- ביצוע: ${unit}${Number(volume).toLocaleString()} מתוך יעד ${unit}${Number(target).toLocaleString()} (${volumePct}%)
- תקופה: ${periodStart} עד ${periodEnd} (חלפו ${elapsedPct}% מהתקופה, נותרו ${Math.round(remainingDays)} ימים)
- מדרגות: ${tiersInfo}
- מדרגה נוכחית: ${currentTierIdx >= 0 ? currentTierIdx + 1 : "טרם הושגה מדרגה"}

התמקד ב:
1. האם קצב הביצוע תואם את הזמן שעבר
2. האם סביר להגיע ליעד/מדרגה הבאה
3. המלצה קצרה אחת

כתוב בצורה תמציתית וענייני, ללא כותרות.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "אתה אנליסט עסקי שנותן תובנות קצרות וענייניות. תענה תמיד ב-2-3 משפטים בלבד." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content || "לא ניתן לייצר ניתוח";

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
