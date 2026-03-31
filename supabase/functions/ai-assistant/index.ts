import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch system context data in parallel
    const [
      { data: suppliers },
      { data: agreements },
      { data: purchases },
      { data: sales },
      { data: txBonuses },
      { data: historical },
    ] = await Promise.all([
      supabase.from("suppliers").select("id, name, supplier_number, payment_terms, shotef, obligo, notes, annual_bonus_status"),
      supabase.from("bonus_agreements").select("*, suppliers(name), bonus_tiers(*)").eq("is_active", true),
      supabase.from("purchase_records").select("supplier_name, supplier_number, order_number, order_date, item_description, quantity, unit_price, total_amount, total_with_vat, category, item_code").order("order_date", { ascending: false }).limit(500),
      supabase.from("sales_records").select("supplier_name, order_number, sale_date, item_description, quantity, sale_price, cost_price, profit_direct, category, brand, customer_name").order("sale_date", { ascending: false }).limit(500),
      supabase.from("transaction_bonuses").select("*, suppliers(name)"),
      supabase.from("historical_supplier_data").select("*").order("year", { ascending: false }),
    ]);

    // Build summary stats
    const supplierCount = suppliers?.length || 0;
    const activeAgreements = agreements?.length || 0;
    const totalPurchases = purchases?.reduce((s, p) => s + (p.total_with_vat || p.total_amount || 0), 0) || 0;
    const totalSales = sales?.reduce((s, r) => s + (r.sale_price || 0), 0) || 0;
    const totalProfit = sales?.reduce((s, r) => s + (r.profit_direct || 0), 0) || 0;
    const totalTxBonus = txBonuses?.reduce((s, t) => s + (t.bonus_value || 0), 0) || 0;

    // Build per-supplier purchase summaries
    const purchaseBySupplier: Record<string, number> = {};
    purchases?.forEach((p) => {
      const name = p.supplier_name || "לא ידוע";
      purchaseBySupplier[name] = (purchaseBySupplier[name] || 0) + (p.total_with_vat || p.total_amount || 0);
    });

    // Build per-supplier sales summaries
    const salesBySupplier: Record<string, { sales: number; profit: number }> = {};
    sales?.forEach((s) => {
      const name = s.supplier_name || "לא ידוע";
      if (!salesBySupplier[name]) salesBySupplier[name] = { sales: 0, profit: 0 };
      salesBySupplier[name].sales += s.sale_price || 0;
      salesBySupplier[name].profit += s.profit_direct || 0;
    });

    // Agreements summary
    const agreementsSummary = agreements?.map((a: any) => ({
      supplier: a.suppliers?.name,
      type: a.bonus_type,
      payment: a.bonus_payment_type,
      period: `${a.period_start || "?"} - ${a.period_end || "?"}`,
      tiers: a.bonus_tiers?.sort((x: any, y: any) => x.tier_order - y.tier_order).map((t: any) => `יעד ${t.target_value} → ${t.bonus_percentage}%`),
      vat_included: a.vat_included,
      target_type: a.target_type,
      fixed_percentage: a.fixed_percentage,
      fixed_amount: a.fixed_amount,
      status: a.bonus_status,
    }));

    const systemPrompt = `אתה עוזר AI חכם של מערכת "ZABILO MARGIN" לניהול בונוסים ורווחיות ספקים.
אתה מדבר עברית ועונה בצורה מדויקת, מסודרת ומקצועית.
השתמש בנתונים שמצורפים כדי לענות על שאלות. אם אין לך מידע מספיק, ציין זאת.
עיגול סכומים כספיים לשקל הקרוב. הצג אחוזים עם עד ספרה אחת אחרי הנקודה.
שימוש בטבלאות Markdown כאשר רלוונטי.

=== נתוני מערכת ===

סיכום כללי:
- מספר ספקים: ${supplierCount}
- הסכמי בונוס פעילים: ${activeAgreements}
- סך רכישות (כולל מע"מ): ₪${Math.round(totalPurchases).toLocaleString()}
- סך מכירות (כולל מע"מ): ₪${Math.round(totalSales).toLocaleString()}
- רווח ישיר (לפני מע"מ): ₪${Math.round(totalProfit).toLocaleString()}
- סך בונוס עסקאות: ₪${Math.round(totalTxBonus).toLocaleString()}

רשימת ספקים:
${JSON.stringify(suppliers?.map(s => ({ שם: s.name, מספר: s.supplier_number, תנאי_תשלום: s.payment_terms, שוטף: s.shotef, אובליגו: s.obligo })), null, 2)}

רכישות לפי ספק (סה"כ כולל מע"מ):
${JSON.stringify(Object.entries(purchaseBySupplier).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, total]) => ({ ספק: name, סהכ: Math.round(total) })), null, 2)}

מכירות ורווח לפי ספק:
${JSON.stringify(Object.entries(salesBySupplier).sort((a, b) => b[1].sales - a[1].sales).slice(0, 30).map(([name, d]) => ({ ספק: name, מכירות: Math.round(d.sales), רווח: Math.round(d.profit), אחוז_רווח: d.sales > 0 ? ((d.profit / d.sales) * 100).toFixed(1) + "%" : "0%" })), null, 2)}

הסכמי בונוס פעילים:
${JSON.stringify(agreementsSummary, null, 2)}

בונוסי עסקאות:
${JSON.stringify(txBonuses?.map(t => ({ ספק: (t as any).suppliers?.name, תאריך: t.transaction_date, שווי: t.bonus_value, סוג: t.bonus_payment_type, תיאור: t.description })), null, 2)}

נתונים היסטוריים:
${JSON.stringify(historical?.map(h => ({ ספק: h.supplier_name, שנה: h.year, רכישות: h.purchase_volume, מכירות: h.sales_volume, רווח: h.profit_amount, אחוז_רווח: h.profit_margin })), null, 2)}

דוגמאות רכישות אחרונות (עד 50):
${JSON.stringify(purchases?.slice(0, 50).map(p => ({ ספק: p.supplier_name, הזמנה: p.order_number, תאריך: p.order_date, פריט: p.item_description, כמות: p.quantity, סהכ: p.total_with_vat || p.total_amount })), null, 2)}

דוגמאות מכירות אחרונות (עד 50):
${JSON.stringify(sales?.slice(0, 50).map(s => ({ ספק: s.supplier_name, הזמנה: s.order_number, תאריך: s.sale_date, פריט: s.item_description, לקוח: s.customer_name, מכירה: s.sale_price, עלות: s.cost_price, רווח: s.profit_direct, מותג: s.brand })), null, 2)}
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "יותר מדי בקשות, נסה שוב בעוד דקה" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "נגמר הקרדיט, יש להוסיף קרדיט" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "שגיאה בשירות AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
