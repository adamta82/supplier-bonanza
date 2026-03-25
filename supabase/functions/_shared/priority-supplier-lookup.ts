export const PRIORITY_BASE_URL =
  "https://bsb.netrun.co.il/odata/Priority/tabula.ini/zabilo";

export type PrioritySupplierLookup = {
  supplierNumber: string;
  supplierName: string;
};

export async function lookupPreferredSuppliersByItemCodes({
  itemCodes,
  basicAuth,
  batchSize = 10,
}: {
  itemCodes: string[];
  basicAuth: string;
  batchSize?: number;
}) {
  const uniqueCodes = [...new Set(itemCodes.filter(Boolean))];
  const cache = new Map<string, PrioritySupplierLookup | null>();

  for (let i = 0; i < uniqueCodes.length; i += batchSize) {
    const batch = uniqueCodes.slice(i, i + batchSize);

    const results = await Promise.allSettled(
      batch.map(async (code) => {
        const encodedCode = encodeURIComponent(`'${code}'`);
        const url = `${PRIORITY_BASE_URL}/LOGPART?$filter=PARTNAME eq ${encodedCode}&$select=PARTNAME,SUPNAME,SUPDES&$top=1`;

        const response = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          console.error(`LOGPART query failed for ${code}: ${response.status}`);
          return { code, supplier: null };
        }

        const data = await response.json();
        const parts = data.value || [];
        if (parts.length === 0 || !parts[0].SUPNAME) {
          return { code, supplier: null };
        }

        return {
          code,
          supplier: {
            supplierNumber: parts[0].SUPNAME,
            supplierName: parts[0].SUPDES || parts[0].SUPNAME,
          } satisfies PrioritySupplierLookup,
        };
      })
    );

    for (const result of results) {
      if (result.status === "rejected") continue;
      const { code, supplier } = result.value;
      cache.set(code, supplier);
    }
  }

  return cache;
}