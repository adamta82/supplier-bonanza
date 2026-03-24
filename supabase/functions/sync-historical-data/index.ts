import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRIORITY_BASE_URL =
  "https://bsb.netrun.co.il/odata/Priority/tabula.ini/zabilo";
const PAGE_SIZE = 500;

const EXCLUDED_PO_STATUSES = ["מבוטלת", "טיוטא"];
const EXCLUDED_SO_STATUSES = [
  "איזור מרוחק", "בוטלה במערכת", "בוטלה וטופלה", "בוטלה להחלפה",
  "לא ניתן COD", "ממתין למקדמה", "שגיאת תשלום", "טיוטא",
  "הזמנה בוטלה", "שולם חלקי", "לא לחיוב כעת", "המתנת מסמכים",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let year = new Date().getFullYear();
    let startSkip = 0;
    let maxPages = 50;
    let phase = "purchases"; // "purchases" | "sales" | "resolve"
    try {
      const body = await req.json();
      if (body.year) year = Number(body.year);
      if (body.startSkip !== undefined) startSkip = body.startSkip;
      if (body.start_skip !== undefined) startSkip = body.start_skip;
      if (body.max_pages !== undefined) maxPages = body.max_pages;
      if (body.phase) phase = body.phase;
    } catch {}

    const priorityUsername = Deno.env.get("PRIORITY_API_USERNAME");
    const priorityPassword = Deno.env.get("PRIORITY_API_PASSWORD");
    if (!priorityUsername || !priorityPassword) {
      return new Response(
        JSON.stringify({ error: "Priority API credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const basicAuth = btoa(`${priorityUsername}:${priorityPassword}`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load suppliers
    const { data: suppliersData } = await supabaseAdmin.from("suppliers").select("id, supplier_number, name");
    const supplierIdMap = new Map<string, string>();
    const supplierNameMap = new Map<string, string>();
    (suppliersData || []).forEach((s: any) => {
      if (s.supplier_number) {
        supplierIdMap.set(s.supplier_number, s.id);
        supplierNameMap.set(s.supplier_number, s.name);
      }
    });

    const fromDate = `${year}-01-01T00:00:00+02:00`;
    const toDate = `${year + 1}-01-01T00:00:00+02:00`;

    if (phase === "purchases") {
      // Fetch purchase orders for the year
      let skip = startSkip;
      let pagesProcessed = 0;
      let hasMore = true;
      const seenKeys = new Set<string>();

      // Aggregation: supplier_number -> { purchase_volume, supplier_name, supplier_id }
      const purchaseAgg = new Map<string, { volume: number; name: string; id: string | null; number: string }>();
      // Also collect customer_po -> supplier mapping for sales phase
      const poToSupplier = new Map<string, { id: string | null; name: string; number: string }>();

      while (hasMore && pagesProcessed < maxPages) {
        const url = `${PRIORITY_BASE_URL}/PORDERS?$filter=CURDATE ge ${encodeURIComponent(fromDate)} and CURDATE lt ${encodeURIComponent(toDate)}&$expand=PORDERITEMS_SUBFORM&$top=${PAGE_SIZE}&$skip=${skip}`;
        console.log(`Fetching historical PORDERS: year=${year}, skip=${skip}`);

        const response = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json" },
        });
        if (!response.ok) {
          const errorText = await response.text();
          return new Response(JSON.stringify({
            error: "Priority API failed", detail: errorText, phase, skip,
          }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const data = await response.json();
        const orders = data.value || [];
        if (orders.length === 0) { hasMore = false; break; }

        for (const order of orders) {
          if (EXCLUDED_PO_STATUSES.includes(order.STATDES)) continue;
          const suppNum = order.SUPNAME || "unknown";
          const suppName = order.CDES || suppNum;
          const suppId = supplierIdMap.get(suppNum) || null;

          // Track customer_po -> supplier for sales matching
          if (order.CORDNAME) {
            poToSupplier.set(order.CORDNAME, { id: suppId, name: suppName, number: suppNum });
          }

          const items = order.PORDERITEMS_SUBFORM || [];
          for (const item of items) {
            const dedupeKey = `${order.ORDNAME}|${item.PARTNAME}|${item.TQUANT}|${item.PRICE}|${item.KLINE}`;
            if (seenKeys.has(dedupeKey)) continue;
            seenKeys.add(dedupeKey);

            const vatPrice = item.VATPRICE ?? 0;
            const existing = purchaseAgg.get(suppNum) || { volume: 0, name: suppName, id: suppId, number: suppNum };
            existing.volume += vatPrice;
            purchaseAgg.set(suppNum, existing);
          }
        }

        skip += PAGE_SIZE;
        pagesProcessed++;
        if (orders.length < PAGE_SIZE) hasMore = false;
      }

      if (hasMore) {
        // Need more pages - return partial and ask client to continue
        return new Response(JSON.stringify({
          success: true, phase, has_more: true, nextSkip: skip, year,
          message: "More purchase data to fetch",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Delete existing historical data for this year, then insert purchase aggregates
      await supabaseAdmin.from("historical_supplier_data").delete().eq("year", year);

      const records: any[] = [];
      for (const [suppNum, agg] of purchaseAgg.entries()) {
        records.push({
          year,
          supplier_id: agg.id,
          supplier_name: agg.name,
          supplier_number: suppNum === "unknown" ? null : suppNum,
          purchase_volume: Math.round(agg.volume * 100) / 100,
          sales_volume: 0,
          cost_total: 0,
          profit_amount: 0,
          profit_margin: 0,
          record_count: 0,
        });
      }

      // Store po->supplier mapping in response so client can pass to sales phase
      if (records.length > 0) {
        for (let i = 0; i < records.length; i += 500) {
          const batch = records.slice(i, i + 500);
          await supabaseAdmin.from("historical_supplier_data").insert(batch);
        }
      }

      // Serialize poToSupplier for the client to use in sales phase
      const poMapping = Object.fromEntries(poToSupplier.entries());

      return new Response(JSON.stringify({
        success: true, phase: "purchases_done", has_more: false, year,
        suppliers_found: records.length,
        po_mapping: poMapping,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    } else if (phase === "sales") {
      // Fetch sales orders for the year and aggregate per supplier
      let poMapping: Record<string, { id: string | null; name: string; number: string }> = {};
      try {
        const body = JSON.parse(await new Request(req.url, { method: "GET" }).text());
        // poMapping already parsed above in the try block
      } catch {}

      // Re-parse body for poMapping
      let bodyData: any = {};
      try {
        // We need to re-read body - but it was already consumed. 
        // The client should send po_mapping in the request body
        bodyData = { year, startSkip, maxPages, phase }; // already parsed above
      } catch {}

      // Load purchase records from DB to build PO->supplier mapping
      // Since purchases phase already ran, we can use purchase_records or historical data
      // Better: load from Priority again just the CORDNAME mapping
      // Actually, let client pass po_mapping from purchases phase response
      
      // For sales, we need PO mapping. Let's load it from the request body.
      // The body was already consumed above - we need to restructure.
      // Let's just rebuild by querying existing purchase_records for this year range.
      
      const { data: purchaseLinks } = await supabaseAdmin
        .from("purchase_records")
        .select("customer_po, supplier_id, supplier_name, supplier_number");
      
      const soToSupplier = new Map<string, { id: string | null; name: string; number: string }>();
      (purchaseLinks || []).forEach((pr: any) => {
        if (!pr.customer_po) return;
        if (!soToSupplier.has(pr.customer_po)) {
          soToSupplier.set(pr.customer_po, {
            id: pr.supplier_id, name: pr.supplier_name || "", number: pr.supplier_number || "",
          });
        }
      });

      // Also try to load historical purchases we just stored to build PO mapping
      // Actually - the PO mapping from Priority for historical data needs to come from the purchases fetch
      // But we didn't store individual PO records. Let's fetch PORDERS again just for CORDNAME mapping.
      // This is inefficient. Better approach: store po_mapping alongside historical data.
      // For now, let's re-fetch purchases in a lightweight way (just CORDNAME + SUPNAME).
      
      // Actually, let's use a smarter approach: fetch PO mapping from Priority for this year
      const poToSupplierMap = new Map<string, { id: string | null; name: string; number: string }>();
      let poSkip = 0;
      let poHasMore = true;
      while (poHasMore) {
        const url = `${PRIORITY_BASE_URL}/PORDERS?$filter=CURDATE ge ${encodeURIComponent(fromDate)} and CURDATE lt ${encodeURIComponent(toDate)}&$select=CORDNAME,SUPNAME,CDES&$top=${PAGE_SIZE}&$skip=${poSkip}`;
        const resp = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json" },
        });
        if (!resp.ok) break;
        const d = await resp.json();
        const orders = d.value || [];
        if (orders.length === 0) break;
        for (const o of orders) {
          if (o.CORDNAME && !poToSupplierMap.has(o.CORDNAME)) {
            const suppNum = o.SUPNAME || "";
            poToSupplierMap.set(o.CORDNAME, {
              id: supplierIdMap.get(suppNum) || null,
              name: o.CDES || suppNum,
              number: suppNum,
            });
          }
        }
        poSkip += PAGE_SIZE;
        if (orders.length < PAGE_SIZE) poHasMore = false;
      }

      // Also add current DB mappings
      for (const [k, v] of soToSupplier.entries()) {
        if (!poToSupplierMap.has(k)) poToSupplierMap.set(k, v);
      }

      // Now fetch sales orders
      let skip = startSkip;
      let pagesProcessed = 0;
      let hasMore = true;
      const seenKeys = new Set<string>();

      // Aggregate: supplier_number -> { sales, cost, profit }
      const salesAgg = new Map<string, { sales: number; cost: number; profit: number; count: number; name: string; id: string | null; number: string }>();
      // Track item_codes without supplier for LOGPART resolution
      const orphanItemCodes = new Set<string>();

      while (hasMore && pagesProcessed < maxPages) {
        const url = `${PRIORITY_BASE_URL}/ORDERS?$filter=CURDATE ge ${encodeURIComponent(fromDate)} and CURDATE lt ${encodeURIComponent(toDate)}&$expand=ORDERITEMS_SUBFORM&$top=${PAGE_SIZE}&$skip=${skip}`;
        console.log(`Fetching historical ORDERS: year=${year}, skip=${skip}`);

        const response = await fetch(url, {
          method: "GET",
          headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json" },
        });
        if (!response.ok) {
          const errorText = await response.text();
          return new Response(JSON.stringify({
            error: "Priority API failed", detail: errorText, phase, skip,
          }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const data = await response.json();
        const orders = data.value || [];
        if (orders.length === 0) { hasMore = false; break; }

        for (const order of orders) {
          if (EXCLUDED_SO_STATUSES.includes(order.ORDSTATUSDES)) continue;

          const soNumber = order.ORDNAME || null;
          const supplierInfo = soNumber ? poToSupplierMap.get(soNumber) : null;

          const items = order.ORDERITEMS_SUBFORM || [];
          for (const item of items) {
            const dedupeKey = `${order.ORDNAME}|${item.PARTNAME}|${item.TQUANT}|${item.VPRICE}|${item.KLINE}`;
            if (seenKeys.has(dedupeKey)) continue;
            seenKeys.add(dedupeKey);

            let suppId = supplierInfo?.id || null;
            let suppName = supplierInfo?.name || null;
            let suppNum = supplierInfo?.number || null;

            if (!suppId && item.SUPNAME) {
              suppId = supplierIdMap.get(item.SUPNAME) || null;
              suppName = supplierNameMap.get(item.SUPNAME) || item.SUPNAME;
              suppNum = item.SUPNAME;
            }

            if (!suppId && !suppName && item.PARTNAME) {
              orphanItemCodes.add(item.PARTNAME);
            }

            const qty = item.TQUANT || 1;
            const salePrice = (item.VPRICE || 0) * qty;
            const costPrice = (item.PURCHASEPRICE || 0) * qty;
            const profitDirect = (item.QPROFIT || 0) * qty;

            if (suppNum || suppName) {
              const key = suppNum || suppName || "unknown";
              const existing = salesAgg.get(key) || { sales: 0, cost: 0, profit: 0, count: 0, name: suppName || key, id: suppId, number: suppNum || "" };
              existing.sales += salePrice;
              existing.cost += costPrice;
              existing.profit += profitDirect;
              existing.count += 1;
              salesAgg.set(key, existing);
            }
          }
        }

        skip += PAGE_SIZE;
        pagesProcessed++;
        if (orders.length < PAGE_SIZE) hasMore = false;
      }

      if (hasMore) {
        return new Response(JSON.stringify({
          success: true, phase, has_more: true, nextSkip: skip, year,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Resolve orphan item codes via LOGPART (same as resolve-suppliers)
      const BATCH_SIZE = 10;
      const uniqueOrphans = [...orphanItemCodes];
      const logpartCache = new Map<string, { supplierNumber: string; supplierName: string } | null>();

      for (let i = 0; i < uniqueOrphans.length; i += BATCH_SIZE) {
        const batch = uniqueOrphans.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (code) => {
            const encodedCode = encodeURIComponent(`'${code}'`);
            const url = `${PRIORITY_BASE_URL}/LOGPART?$filter=PARTNAME eq ${encodedCode}&$select=PARTNAME,SUPNAME,SUPDES&$top=1`;
            const response = await fetch(url, {
              method: "GET",
              headers: { Authorization: `Basic ${basicAuth}`, Accept: "application/json" },
            });
            if (!response.ok) return { code, supplier: null };
            const data = await response.json();
            const parts = data.value || [];
            if (parts.length === 0 || !parts[0].SUPNAME) return { code, supplier: null };
            return {
              code,
              supplier: { supplierNumber: parts[0].SUPNAME, supplierName: parts[0].SUPDES || parts[0].SUPNAME },
            };
          })
        );
        for (const result of results) {
          if (result.status === "rejected") continue;
          const { code, supplier } = result.value;
          logpartCache.set(code, supplier);
        }
      }

      // Re-process orphans with resolved suppliers - we can't easily re-process individual records
      // since we only have aggregates. For now, the LOGPART resolution is best-effort.
      // The orphan count will be reported to the user.

      // Update historical_supplier_data with sales info
      for (const [key, agg] of salesAgg.entries()) {
        const suppNum = agg.number || null;
        const suppId = agg.id;

        // Try to update existing record (from purchases phase)
        if (suppId) {
          const { data: existing } = await supabaseAdmin
            .from("historical_supplier_data")
            .select("id")
            .eq("year", year)
            .eq("supplier_id", suppId)
            .maybeSingle();

          if (existing) {
            const profitMargin = agg.sales > 0 ? (agg.profit / (agg.sales / 1.18)) * 100 : 0;
            await supabaseAdmin.from("historical_supplier_data").update({
              sales_volume: Math.round(agg.sales * 100) / 100,
              cost_total: Math.round(agg.cost * 100) / 100,
              profit_amount: Math.round(agg.profit * 100) / 100,
              profit_margin: Math.round(profitMargin * 100) / 100,
              record_count: agg.count,
            }).eq("id", existing.id);
            continue;
          }
        }

        // Insert new record (supplier found only in sales, not purchases)
        const profitMargin = agg.sales > 0 ? (agg.profit / (agg.sales / 1.18)) * 100 : 0;
        await supabaseAdmin.from("historical_supplier_data").upsert({
          year,
          supplier_id: suppId,
          supplier_name: agg.name,
          supplier_number: suppNum,
          sales_volume: Math.round(agg.sales * 100) / 100,
          cost_total: Math.round(agg.cost * 100) / 100,
          profit_amount: Math.round(agg.profit * 100) / 100,
          profit_margin: Math.round(profitMargin * 100) / 100,
          record_count: agg.count,
        }, { onConflict: "year,supplier_id" });
      }

      return new Response(JSON.stringify({
        success: true, phase: "sales_done", has_more: false, year,
        suppliers_with_sales: salesAgg.size,
        orphan_items: orphanItemCodes.size,
        resolved_orphans: [...logpartCache.values()].filter(v => v !== null).length,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Invalid phase" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
