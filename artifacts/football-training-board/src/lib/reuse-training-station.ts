export { prepareReusedBoard } from "@workspace/api-zod";

export function stationBoardPreview(board?: string | null, image?: string | null): { src: string; reference: boolean } | null {
  if (image) return { src: image, reference: false };
  try { const saved = JSON.parse(board ?? "null");
    if (typeof saved?.reusedPreview === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(saved.reusedPreview)) return { src: saved.reusedPreview, reference: true };
  } catch { /* No saved preview available. */ }
  return null;
}
