import {downloadExport} from "./export-download";
export const DOCUMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif";
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", heic: "image/heic", heif: "image/heif",
};

export type DocumentFileData = { fileName: string; fileType: string; fileSize: number; fileData: string };

export async function readDocumentFile(file: File, maxBytes = MAX_DOCUMENT_BYTES): Promise<DocumentFileData> {
  const fileType = Object.values(MIME_TYPES).includes(file.type) ? file.type
    : MIME_TYPES[file.name.split(".").at(-1)?.toLowerCase() ?? ""];
  if (!fileType) throw new Error("Scegli un PDF o un’immagine JPG, PNG, WebP, HEIC o HEIF.");
  if (!file.size) throw new Error("Il file è vuoto.");
  if (file.size > maxBytes) throw new Error("File troppo grande. Limite " + (maxBytes / 1024 / 1024) + " MB.");
  const fileData = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Impossibile leggere il file."));
    reader.onerror = () => reject(new Error("Impossibile leggere il file."));
    reader.readAsDataURL(file.slice(0, file.size, fileType));
  });
  return { fileName: file.name, fileType, fileSize: file.size, fileData };
}

export function downloadDocument(fileData: string, fileName: string) {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=]+)$/i.exec(fileData);
  if (!match) throw new Error("Il contenuto del documento non è disponibile.");
  const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
  let name=fileName.replace(/[/\\]/g,"_");
  const extension=Object.entries(MIME_TYPES).find(([,type])=>type===match[1].toLowerCase())?.[0];
  if(extension&&!/\.[a-z0-9]{2,5}$/i.test(name))name+="."+extension;
  return downloadExport(new Blob([bytes], {type:match[1]}),name);
}
