import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { FileText } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type PdfPreviewProps = {
  fileUrl: string;
  fileName: string;
};

export default function PdfPreview({ fileUrl, fileName }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [pageWidth, setPageWidth] = useState(900);
  const [numPages, setNumPages] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      setPageWidth(Math.max(280, Math.floor(element.clientWidth - 32)));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="h-[75vh] overflow-y-auto bg-muted/30 p-4">
      <Document
        file={fileUrl}
        loading={<div className="flex h-full min-h-[40vh] items-center justify-center text-sm text-muted-foreground">טוען PDF...</div>}
        error={<div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><FileText className="h-8 w-8" /><span>לא ניתן לטעון את קובץ ה-PDF</span><a href={fileUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">פתח בלשונית חדשה</a></div>}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
      >
        <div className="mx-auto flex max-w-4xl flex-col gap-4">
          {Array.from({ length: numPages }, (_, index) => (
            <div key={`${fileName}-${index + 1}`} className="overflow-hidden rounded-md border bg-background shadow-sm">
              <Page
                pageNumber={index + 1}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                className="mx-auto"
              />
            </div>
          ))}
        </div>
      </Document>
    </div>
  );
}
