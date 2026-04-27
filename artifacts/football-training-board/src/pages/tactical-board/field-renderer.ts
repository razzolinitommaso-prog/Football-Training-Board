export type FieldFormat = "5v5" | "7v7" | "9v9" | "11v11";
export type FieldView = "full" | "half-top" | "half-bottom" | "half-left" | "half-right";
export type FieldRenderMode = "standard" | "minimal";
export type FieldOrientation = "auto" | "portrait" | "landscape";

type FieldSpec = {
  length: number;
  width: number;
  centerCircleRadius: number;
  penaltyAreaDepth: number;
  penaltyAreaWidth: number;
  goalAreaDepth: number;
  goalAreaWidth: number;
  penaltySpotDistance: number;
  goalWidth: number;
  goalDepth: number;
  cornerRadius: number;
  showPenaltyArc: boolean;
  penaltyArcRadius: number;
};

type RenderFootballFieldOptions = {
  width: number;
  height: number;
  baseColor: string;
  lineColor?: string;
  orientation?: FieldOrientation;
  view?: FieldView;
  format?: FieldFormat;
  mode?: FieldRenderMode;
};

type Viewport = { x: number; y: number; w: number; h: number };
type Rect = { x: number; y: number; w: number; h: number };

const FIELD_SPECS: Record<FieldFormat, FieldSpec> = {
  "11v11": {
    length: 105,
    width: 68,
    centerCircleRadius: 9.15,
    penaltyAreaDepth: 16.5,
    penaltyAreaWidth: 40.32,
    goalAreaDepth: 5.5,
    goalAreaWidth: 18.32,
    penaltySpotDistance: 11,
    goalWidth: 7.32,
    goalDepth: 2.2,
    cornerRadius: 1,
    showPenaltyArc: true,
    penaltyArcRadius: 9.15,
  },
  "9v9": {
    length: 72,
    width: 50,
    centerCircleRadius: 6,
    penaltyAreaDepth: 13,
    penaltyAreaWidth: 30,
    goalAreaDepth: 4.5,
    goalAreaWidth: 16,
    penaltySpotDistance: 9,
    goalWidth: 6,
    goalDepth: 1.8,
    cornerRadius: 1,
    showPenaltyArc: true,
    penaltyArcRadius: 6,
  },
  "7v7": {
    length: 65,
    width: 45,
    centerCircleRadius: 6,
    penaltyAreaDepth: 13,
    penaltyAreaWidth: 26,
    goalAreaDepth: 4,
    goalAreaWidth: 14,
    penaltySpotDistance: 9,
    goalWidth: 5,
    goalDepth: 1.6,
    cornerRadius: 1,
    showPenaltyArc: false,
    penaltyArcRadius: 0,
  },
  "5v5": {
    length: 40,
    width: 25,
    centerCircleRadius: 4,
    penaltyAreaDepth: 6,
    penaltyAreaWidth: 15,
    goalAreaDepth: 0,
    goalAreaWidth: 0,
    penaltySpotDistance: 6,
    goalWidth: 3,
    goalDepth: 1.2,
    cornerRadius: 0.7,
    showPenaltyArc: false,
    penaltyArcRadius: 0,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(hex: string) {
  const clean = hex.trim().replace("#", "");
  if (clean.length === 3) {
    return clean.split("").map((char) => char + char).join("");
  }
  return clean.padEnd(6, "0").slice(0, 6);
}

function hexToRgb(hex: string) {
  const normalized = normalizeHex(hex);
  const int = Number.parseInt(normalized, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

function shiftHex(hex: string, amount: number) {
  const { r, g, b } = hexToRgb(hex);
  const next = (channel: number) => clamp(channel + amount, 0, 255);
  return `rgb(${next(r)}, ${next(g)}, ${next(b)})`;
}

function alpha(hex: string, opacity: number) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getViewport(view: FieldView): Viewport {
  switch (view) {
    case "half-top":
      return { x: 0, y: 0, w: 1, h: 0.5 };
    case "half-bottom":
      return { x: 0, y: 0.5, w: 1, h: 0.5 };
    case "half-left":
      return { x: 0, y: 0, w: 0.5, h: 1 };
    case "half-right":
      return { x: 0.5, y: 0, w: 0.5, h: 1 };
    default:
      return { x: 0, y: 0, w: 1, h: 1 };
  }
}

function resolveOrientation(width: number, height: number, orientation: FieldOrientation) {
  if (orientation === "portrait" || orientation === "landscape") {
    return orientation;
  }
  return height > width * 1.1 ? "portrait" : "landscape";
}

function createLayout(width: number, height: number, pitchWidth: number, pitchHeight: number, viewport: Viewport) {
  const pad = 0;
  const availableWidth = Math.max(40, width - pad * 2);
  const availableHeight = Math.max(40, height - pad * 2);
  const visiblePitchWidth = pitchWidth * viewport.w;
  const visiblePitchHeight = pitchHeight * viewport.h;
  const scale = Math.min(availableWidth / visiblePitchWidth, availableHeight / visiblePitchHeight);
  const visibleCanvasWidth = visiblePitchWidth * scale;
  const visibleCanvasHeight = visiblePitchHeight * scale;
  const inner: Rect = {
    x: Math.round((width - visibleCanvasWidth) / 2),
    y: Math.round((height - visibleCanvasHeight) / 2),
    w: Math.round(visibleCanvasWidth),
    h: Math.round(visibleCanvasHeight),
  };

  return {
    inner,
    scale,
    pitchCanvasX: inner.x - pitchWidth * viewport.x * scale,
    pitchCanvasY: inner.y - pitchHeight * viewport.y * scale,
  };
}

function drawGrass(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  fullPitchRect: Rect,
  baseColor: string,
  orientation: "portrait" | "landscape",
) {
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const baseGradient = orientation === "landscape"
    ? ctx.createLinearGradient(fullPitchRect.x, fullPitchRect.y, fullPitchRect.x, fullPitchRect.y + fullPitchRect.h)
    : ctx.createLinearGradient(fullPitchRect.x, fullPitchRect.y, fullPitchRect.x + fullPitchRect.w, fullPitchRect.y);

  baseGradient.addColorStop(0, shiftHex(baseColor, 10));
  baseGradient.addColorStop(0.5, baseColor);
  baseGradient.addColorStop(1, shiftHex(baseColor, -14));
  ctx.fillStyle = baseGradient;
  ctx.fillRect(fullPitchRect.x, fullPitchRect.y, fullPitchRect.w, fullPitchRect.h);

  const stripeCount = clamp(
    Math.round((orientation === "landscape" ? fullPitchRect.w : fullPitchRect.h) / 90),
    6,
    12,
  );

  for (let index = 0; index < stripeCount; index += 1) {
    ctx.fillStyle = index % 2 === 0 ? alpha("#ffffff", 0.06) : alpha("#000000", 0.05);
    if (orientation === "landscape") {
      const stripeWidth = fullPitchRect.w / stripeCount;
      ctx.fillRect(fullPitchRect.x + stripeWidth * index, fullPitchRect.y, stripeWidth, fullPitchRect.h);
    } else {
      const stripeHeight = fullPitchRect.h / stripeCount;
      ctx.fillRect(fullPitchRect.x, fullPitchRect.y + stripeHeight * index, fullPitchRect.w, stripeHeight);
    }
  }

  const sheen = ctx.createRadialGradient(
    fullPitchRect.x + fullPitchRect.w * 0.5,
    fullPitchRect.y + fullPitchRect.h * 0.45,
    fullPitchRect.w * 0.08,
    fullPitchRect.x + fullPitchRect.w * 0.5,
    fullPitchRect.y + fullPitchRect.h * 0.5,
    Math.max(fullPitchRect.w, fullPitchRect.h) * 0.7,
  );
  sheen.addColorStop(0, alpha("#ffffff", 0.08));
  sheen.addColorStop(1, alpha("#ffffff", 0));
  ctx.fillStyle = sheen;
  ctx.fillRect(fullPitchRect.x, fullPitchRect.y, fullPitchRect.w, fullPitchRect.h);

  const vignette = ctx.createLinearGradient(fullPitchRect.x, fullPitchRect.y, fullPitchRect.x, fullPitchRect.y + fullPitchRect.h);
  vignette.addColorStop(0, alpha("#000000", 0.08));
  vignette.addColorStop(0.5, alpha("#000000", 0));
  vignette.addColorStop(1, alpha("#000000", 0.12));
  ctx.fillStyle = vignette;
  ctx.fillRect(fullPitchRect.x, fullPitchRect.y, fullPitchRect.w, fullPitchRect.h);
}

function setupLineStyle(ctx: CanvasRenderingContext2D, lineColor: string, scale: number) {
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = lineColor;
  ctx.lineWidth = clamp(scale * 0.26, 1.6, 2.8);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([]);
}

function drawSpot(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawLandscapeMarkings(
  ctx: CanvasRenderingContext2D,
  spec: FieldSpec,
  mapX: (value: number) => number,
  mapY: (value: number) => number,
  scale: number,
  mode: FieldRenderMode,
) {
  const lineWidth = ctx.lineWidth;
  const centerY = spec.width / 2;
  const pitchLeft = mapX(0);
  const pitchTop = mapY(0);
  const pitchRight = mapX(spec.length);
  const pitchBottom = mapY(spec.width);

  ctx.beginPath();
  ctx.moveTo(pitchLeft, pitchTop);
  ctx.lineTo(pitchRight, pitchTop);
  ctx.lineTo(pitchRight, pitchBottom);
  ctx.lineTo(pitchLeft, pitchBottom);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mapX(spec.length / 2), mapY(0));
  ctx.lineTo(mapX(spec.length / 2), mapY(spec.width));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mapX(spec.length / 2), mapY(centerY), spec.centerCircleRadius * scale, 0, Math.PI * 2);
  ctx.stroke();
  drawSpot(ctx, mapX(spec.length / 2), mapY(centerY), clamp(lineWidth * 0.9, 2, 3.4));

  if (mode === "minimal") return;

  const areaY = (spec.width - spec.penaltyAreaWidth) / 2;
  ctx.strokeRect(mapX(0), mapY(areaY), spec.penaltyAreaDepth * scale, spec.penaltyAreaWidth * scale);
  ctx.strokeRect(mapX(spec.length - spec.penaltyAreaDepth), mapY(areaY), spec.penaltyAreaDepth * scale, spec.penaltyAreaWidth * scale);

  if (spec.goalAreaDepth > 0 && spec.goalAreaWidth > 0) {
    const goalAreaY = (spec.width - spec.goalAreaWidth) / 2;
    ctx.strokeRect(mapX(0), mapY(goalAreaY), spec.goalAreaDepth * scale, spec.goalAreaWidth * scale);
    ctx.strokeRect(mapX(spec.length - spec.goalAreaDepth), mapY(goalAreaY), spec.goalAreaDepth * scale, spec.goalAreaWidth * scale);
  }

  const leftSpotX = spec.penaltySpotDistance;
  const rightSpotX = spec.length - spec.penaltySpotDistance;
  drawSpot(ctx, mapX(leftSpotX), mapY(centerY), clamp(lineWidth * 0.9, 2, 3.4));
  drawSpot(ctx, mapX(rightSpotX), mapY(centerY), clamp(lineWidth * 0.9, 2, 3.4));

  if (spec.showPenaltyArc) {
    const arcInset = spec.penaltyAreaDepth - spec.penaltySpotDistance;
    const arcLimit = Math.acos(arcInset / spec.penaltyArcRadius);
    ctx.beginPath();
    ctx.arc(mapX(leftSpotX), mapY(centerY), spec.penaltyArcRadius * scale, -arcLimit, arcLimit);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mapX(rightSpotX), mapY(centerY), spec.penaltyArcRadius * scale, Math.PI - arcLimit, Math.PI + arcLimit);
    ctx.stroke();
  }

  ctx.strokeRect(mapX(-spec.goalDepth), mapY((spec.width - spec.goalWidth) / 2), spec.goalDepth * scale, spec.goalWidth * scale);
  ctx.strokeRect(mapX(spec.length), mapY((spec.width - spec.goalWidth) / 2), spec.goalDepth * scale, spec.goalWidth * scale);
}

function drawPortraitMarkings(
  ctx: CanvasRenderingContext2D,
  spec: FieldSpec,
  mapX: (value: number) => number,
  mapY: (value: number) => number,
  scale: number,
  mode: FieldRenderMode,
) {
  const lineWidth = ctx.lineWidth;
  const centerX = spec.width / 2;
  const pitchLeft = mapX(0);
  const pitchTop = mapY(0);
  const pitchRight = mapX(spec.width);
  const pitchBottom = mapY(spec.length);

  ctx.beginPath();
  ctx.moveTo(pitchLeft, pitchTop);
  ctx.lineTo(pitchRight, pitchTop);
  ctx.lineTo(pitchRight, pitchBottom);
  ctx.lineTo(pitchLeft, pitchBottom);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mapX(0), mapY(spec.length / 2));
  ctx.lineTo(mapX(spec.width), mapY(spec.length / 2));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mapX(centerX), mapY(spec.length / 2), spec.centerCircleRadius * scale, 0, Math.PI * 2);
  ctx.stroke();
  drawSpot(ctx, mapX(centerX), mapY(spec.length / 2), clamp(lineWidth * 0.9, 2, 3.4));

  if (mode === "minimal") return;

  const areaX = (spec.width - spec.penaltyAreaWidth) / 2;
  ctx.strokeRect(mapX(areaX), mapY(0), spec.penaltyAreaWidth * scale, spec.penaltyAreaDepth * scale);
  ctx.strokeRect(mapX(areaX), mapY(spec.length - spec.penaltyAreaDepth), spec.penaltyAreaWidth * scale, spec.penaltyAreaDepth * scale);

  if (spec.goalAreaDepth > 0 && spec.goalAreaWidth > 0) {
    const goalAreaX = (spec.width - spec.goalAreaWidth) / 2;
    ctx.strokeRect(mapX(goalAreaX), mapY(0), spec.goalAreaWidth * scale, spec.goalAreaDepth * scale);
    ctx.strokeRect(mapX(goalAreaX), mapY(spec.length - spec.goalAreaDepth), spec.goalAreaWidth * scale, spec.goalAreaDepth * scale);
  }

  const topSpotY = spec.penaltySpotDistance;
  const bottomSpotY = spec.length - spec.penaltySpotDistance;
  drawSpot(ctx, mapX(centerX), mapY(topSpotY), clamp(lineWidth * 0.9, 2, 3.4));
  drawSpot(ctx, mapX(centerX), mapY(bottomSpotY), clamp(lineWidth * 0.9, 2, 3.4));

  if (spec.showPenaltyArc) {
    const arcInset = spec.penaltyAreaDepth - spec.penaltySpotDistance;
    const arcLimit = Math.acos(arcInset / spec.penaltyArcRadius);
    ctx.beginPath();
    ctx.arc(mapX(centerX), mapY(topSpotY), spec.penaltyArcRadius * scale, Math.PI / 2 - arcLimit, Math.PI / 2 + arcLimit);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(mapX(centerX), mapY(bottomSpotY), spec.penaltyArcRadius * scale, Math.PI * 1.5 - arcLimit, Math.PI * 1.5 + arcLimit);
    ctx.stroke();
  }

  ctx.strokeRect(mapX((spec.width - spec.goalWidth) / 2), mapY(-spec.goalDepth), spec.goalWidth * scale, spec.goalDepth * scale);
  ctx.strokeRect(mapX((spec.width - spec.goalWidth) / 2), mapY(spec.length), spec.goalWidth * scale, spec.goalDepth * scale);
}

export function renderFootballField(ctx: CanvasRenderingContext2D, options: RenderFootballFieldOptions) {
  const {
    width,
    height,
    baseColor,
    lineColor = "rgba(255,255,255,0.92)",
    orientation = "auto",
    view = "full",
    format = "11v11",
    mode = "standard",
  } = options;

  const resolvedOrientation = resolveOrientation(width, height, orientation);
  const spec = FIELD_SPECS[format];
  const pitchWidth = resolvedOrientation === "landscape" ? spec.length : spec.width;
  const pitchHeight = resolvedOrientation === "landscape" ? spec.width : spec.length;
  const viewport = getViewport(view);
  const layout = createLayout(width, height, pitchWidth, pitchHeight, viewport);
  const fullPitchRect: Rect = {
    x: layout.pitchCanvasX,
    y: layout.pitchCanvasY,
    w: pitchWidth * layout.scale,
    h: pitchHeight * layout.scale,
  };

  ctx.clearRect(0, 0, width, height);
  drawGrass(ctx, width, height, fullPitchRect, baseColor, resolvedOrientation);

  ctx.save();
  ctx.beginPath();
  ctx.rect(layout.inner.x, layout.inner.y, layout.inner.w, layout.inner.h);
  ctx.clip();
  setupLineStyle(ctx, lineColor, layout.scale);

  if (resolvedOrientation === "landscape") {
    const mapX = (value: number) => layout.pitchCanvasX + value * layout.scale;
    const mapY = (value: number) => layout.pitchCanvasY + value * layout.scale;
    drawLandscapeMarkings(ctx, spec, mapX, mapY, layout.scale, mode);
  } else {
    const mapX = (value: number) => layout.pitchCanvasX + value * layout.scale;
    const mapY = (value: number) => layout.pitchCanvasY + value * layout.scale;
    drawPortraitMarkings(ctx, spec, mapX, mapY, layout.scale, mode);
  }

  ctx.restore();
}
