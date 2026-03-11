import * as XLSX from "xlsx";

export type ParsedRow = Record<string, any>;

export interface ParsedFile {
  headers: string[];
  data: ParsedRow[];
  fileName: string;
}

export function parseExcelFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<ParsedRow>(sheet);
        if (json.length > 0) {
          resolve({
            headers: Object.keys(json[0]),
            data: json,
            fileName: file.name,
          });
        } else {
          reject(new Error("הקובץ ריק"));
        }
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("שגיאה בקריאת הקובץ"));
    reader.readAsBinaryString(file);
  });
}

/** Parse dd/mm/yyyy or Excel serial to yyyy-mm-dd */
export function parseDate(val: any): string | null {
  if (!val) return null;
  const s = val.toString().trim();
  const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) {
    return `${parts[3]}-${parts[2].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (!isNaN(Number(s)) && Number(s) > 40000) {
    const d = new Date((Number(s) - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}
