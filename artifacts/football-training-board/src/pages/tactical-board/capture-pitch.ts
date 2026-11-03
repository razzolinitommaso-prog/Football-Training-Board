/** Rasterize only the pitch, including computed styles, without editor controls. */
export async function capturePitch(pitch: HTMLElement): Promise<string> {
  const clone = pitch.cloneNode(true) as HTMLElement;
  const sources = [pitch, ...Array.from(pitch.querySelectorAll("*"))];
  const targets = [clone, ...Array.from(clone.querySelectorAll("*"))];
  sources.forEach((source, index) => {
    const style = getComputedStyle(source);
    // SVG font-size attributes are in viewBox units. A computed CSS font size
    // can override the inherited SVG size when the clone is rasterized.
    const usesSvgFontSize = source instanceof SVGElement && source.closest("[font-size]") instanceof SVGElement;
    const declarations = Array.from(style)
      .filter(key => key !== "text-size-adjust" && key !== "-webkit-text-size-adjust")
      .filter(key => !usesSvgFontSize || key !== "font-size")
      .map(key => `${key}:${style.getPropertyValue(key)}`);
    targets[index].setAttribute("style", declarations.join(";"));
  });
  clone.querySelectorAll('[data-board-editor="true"]').forEach(node => node.remove());
  clone.querySelectorAll<HTMLElement>('.ring-2').forEach(node => { node.style.boxShadow = "none"; });
  const { width, height } = pitch.getBoundingClientRect();
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = "0";
  clone.style.setProperty("text-size-adjust", "none");
  clone.style.setProperty("-webkit-text-size-adjust", "none");
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
