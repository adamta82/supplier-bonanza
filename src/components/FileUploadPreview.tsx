import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload as UploadIcon, FileSpreadsheet } from "lucide-react";
import { parseExcelFile, type ParsedFile } from "@/lib/parseExcelFile";

interface FileUploadPreviewProps {
  title: string;
  description: string;
  buttonLabel: string;
  onUpload: (data: ParsedFile) => void;
  isUploading: boolean;
}

export default function FileUploadPreview({ title, description, buttonLabel, onUpload, isUploading }: FileUploadPreviewProps) {
  const [parsed, setParsed] = useState<ParsedFile | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await parseExcelFile(file);
      setParsed(result);
    } catch {
      // ignore
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="block w-full text-sm border rounded-lg p-3 bg-muted cursor-pointer" />
        {parsed && (
          <>
            <p className="text-sm font-medium">{parsed.data.length} שורות נקראו. תצוגה מקדימה (עד 10):</p>
            <div className="overflow-auto max-h-[300px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    {parsed.headers.map((h) => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsed.data.slice(0, 10).map((row, i) => (
                    <TableRow key={i}>
                      {parsed.headers.map((h) => <TableCell key={h}>{row[h]?.toString() || ""}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={() => onUpload(parsed)} disabled={isUploading} className="gap-2">
              <UploadIcon className="w-4 h-4" />
              {isUploading ? "מעלה..." : `${buttonLabel} (${parsed.data.length})`}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
