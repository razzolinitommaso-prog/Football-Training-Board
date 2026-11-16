const documentMimes = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
]);

export function parseDocumentUpload(body: Record<string, unknown>, maxBytes: number) {
  const fileName = typeof body.fileName === "string" ? body.fileName.trim().replace(/[/\\]/g, "_").slice(0, 255) : "";
  const fileType = typeof body.fileType === "string" ? body.fileType.toLowerCase() : "";
  const input = typeof body.fileData === "string" ? body.fileData : "";
  if (!fileName || !input) return { error: "Nome e contenuto del file sono obbligatori.", status: 400 } as const;
  if (!documentMimes.has(fileType)) return { error: "Formato file non consentito.", status: 400 } as const;
  const dataUrl = /^data:([^;,]+);base64,(.*)$/i.exec(input);
  const base64 = dataUrl?.[2] ?? input;
  if (!/^[a-z0-9+/]+={0,2}$/i.test(base64) || (dataUrl && dataUrl[1].toLowerCase() !== fileType)) {
    return { error: "Contenuto file non valido.", status: 400 } as const;
  }
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.toString("base64") !== base64) {
    return { error: "Contenuto file non valido.", status: 400 } as const;
  }
  if (buffer.length > maxBytes) return { error: "File troppo grande. Limite " + (maxBytes / 1024 / 1024) + " MB.", status: 413 } as const;
  return { attachment: { fileName, fileType, fileSize: buffer.length, fileData: `data:${fileType};base64,${base64}` } } as const;
}
