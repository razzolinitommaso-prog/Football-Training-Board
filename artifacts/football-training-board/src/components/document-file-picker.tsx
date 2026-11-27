import { useRef } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOCUMENT_ACCEPT } from "@/lib/document-files";

export function DocumentFilePicker({ file, onChange, disabled }: {
  file: File | null;
  onChange: (file: File) => void;
  disabled?: boolean;
}) {
  const device = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const select = (input: HTMLInputElement) => {
    const picked = input.files?.[0];
    if (picked) onChange(picked);
    input.value = "";
  };
  return <div className="space-y-2">
    <input ref={device} type="file" accept={DOCUMENT_ACCEPT} className="hidden" aria-label="Carica documento da dispositivo" disabled={disabled}
      onChange={event => select(event.currentTarget)} />
    <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Scatta foto documento" disabled={disabled}
      onChange={event => select(event.currentTarget)} />
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => device.current?.click()}>
        <Upload className="mr-1.5 h-4 w-4" /> Carica da dispositivo
      </Button>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => camera.current?.click()}>
        <Camera className="mr-1.5 h-4 w-4" /> Scatta foto
      </Button>
    </div>
    {file && <p role="status" className="break-words text-xs text-muted-foreground">File selezionato: {file.name}</p>}
  </div>;
}
