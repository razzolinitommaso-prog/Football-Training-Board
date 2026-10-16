/** Rasterize only the pitch, including computed styles, without editor controls. */
export async function capturePitch(pitch: HTMLElement): Promise<string> {
  const clone = pitch.cloneNode(true) as HTMLElement;
  const sources = [pitch, ...Array.from(pitch.querySelectorAll("*"))];
  const targets = [clone, ...Array.from(clone.querySelectorAll("*"))];
  sources.forEach((source, index) => {
    const style = getComputedStyle(source);
    (targets[index] as HTMLElement).setAttribute("style", Array.from(style).map(key => `${key}:${style.getPropertyValue(key)}`).join(";"));
  });
  clone.querySelectorAll('[data-board-editor="true"]').forEach(node => node.remove());
  clone.querySelectorAll<HTMLElement>('.ring-2').forEach(node => { node.style.boxShadow = "none"; });
  const { width, height } = pitch.getBoundingClientRect();
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = "0";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(clone)}</foreignObject></svg>`;
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement("canvas");
  const scale = Math.min(2, 1600 / width);
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Impossibile generare l'anteprima");
  context.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}
