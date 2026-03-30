import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { FileUp, Download, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { parseExcelFile } from "@/lib/excel-import";

type ImportResult = { success: number; failed: number; errors: string[] };

interface ImportExcelDialogProps {
  label: string;
  templateLabel: string;
  previewColumns: { key: string; label: string }[];
  onDownloadTemplate: () => void;
  onParseRow: (row: Record<string, string>) => Record<string, unknown>;
  isValidRow: (row: Record<string, string>) => boolean;
  onImportRows: (rows: Record<string, unknown>[]) => Promise<void>;
  canImport?: boolean;
}

export function ImportExcelDialog({
  label,
  templateLabel,
  previewColumns,
  onDownloadTemplate,
  onParseRow,
  isValidRow,
  onImportRows,
  canImport = true,
}: ImportExcelDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const validRows = rawRows.filter(isValidRow);
  const invalidCount = rawRows.length - validRows.length;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setParseError(null);
    setResult(null);
    try {
      const rows = await parseExcelFile(file);
      if (!rows.length) {
        setParseError("Il file è vuoto o non contiene dati nel primo foglio.");
        return;
      }
      setRawRows(rows);
      setOpen(true);
    } catch (err: any) {
      setParseError(err.message ?? "Errore nella lettura del file.");
      setOpen(true);
      setRawRows([]);
    }
  }

  async function handleImport() {
    setIsImporting(true);
    const mapped = validRows.map(onParseRow);
    let success = 0;
    const errors: string[] = [];

    for (let i = 0; i < mapped.length; i++) {
      try {
        await onImportRows([mapped[i]]);
        success++;
      } catch {
        errors.push(`Riga ${i + 1}: errore durante l'importazione`);
      }
    }

    setResult({ success, failed: errors.length, errors });
    setIsImporting(false);
  }

  function handleClose() {
    setOpen(false);
    setRawRows([]);
    setResult(null);
    setParseError(null);
  }

  if (!canImport) return null;

  return (
    <>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />

      <Button variant="outline" onClick={() => fileRef.current?.click()} className="gap-2">
        <FileUp className="w-4 h-4" />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="w-5 h-5 text-primary" />
              {label}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-1">
                <p>Verifica i dati prima di procedere con l'importazione.</p>
                <Button variant="ghost" size="sm" onClick={onDownloadTemplate} className="gap-1.5 h-7 px-2 text-xs text-muted-foreground">
                  <Download className="w-3 h-3" />
                  {templateLabel}
                </Button>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto min-h-0">
            {parseError ? (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm">Errore nel file</p>
                  <p className="text-sm mt-1">{parseError}</p>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/10 border border-green-500/20">
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold text-green-600">{result.success}</p>
                      <p className="text-xs text-muted-foreground">Importati con successo</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                    <XCircle className="w-6 h-6 text-destructive" />
                    <div>
                      <p className="text-2xl font-bold text-destructive">{result.failed}</p>
                      <p className="text-xs text-muted-foreground">Falliti</p>
                    </div>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 space-y-1">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <p key={i} className="text-xs text-destructive">{e}</p>
                    ))}
                    {result.errors.length > 5 && <p className="text-xs text-muted-foreground">...e altri {result.errors.length - 5} errori</p>}
                  </div>
                )}
              </div>
            ) : rawRows.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium text-xs">
                    {validRows.length} righe valide
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium text-xs">
                      {invalidCount} righe ignorte (dati mancanti)
                    </span>
                  )}
                </div>

                <div className="border rounded-lg overflow-auto max-h-[350px]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b sticky top-0">
                      <tr>
                        <th className="px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                        {previewColumns.map(c => (
                          <th key={c.key} className="px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">{c.label}</th>
                        ))}
                        <th className="px-3 py-2 font-medium text-muted-foreground">Stato</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {rawRows.slice(0, 50).map((row, i) => {
                        const valid = isValidRow(row);
                        return (
                          <tr key={i} className={valid ? "" : "opacity-40 bg-muted/30"}>
                            <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                            {previewColumns.map(c => (
                              <td key={c.key} className="px-3 py-2 max-w-[120px] truncate">{row[c.key] ?? "—"}</td>
                            ))}
                            <td className="px-3 py-2">
                              {valid
                                ? <span className="inline-flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="w-3 h-3" />OK</span>
                                : <span className="inline-flex items-center gap-1 text-amber-500 text-xs"><AlertCircle className="w-3 h-3" />Ignorata</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {rawRows.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center py-2 border-t">
                      Mostrate le prime 50 righe su {rawRows.length} totali
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="border-t pt-4 mt-2 gap-2">
            <Button variant="outline" onClick={handleClose}>
              {result ? "Chiudi" : "Annulla"}
            </Button>
            {!result && !parseError && validRows.length > 0 && (
              <Button onClick={handleImport} disabled={isImporting} className="gap-2 min-w-[160px]">
                {isImporting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Importazione...</>
                ) : (
                  <><FileUp className="w-4 h-4" /> Importa {validRows.length} {validRows.length === 1 ? "riga" : "righe"}</>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
