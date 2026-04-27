import type { BoardElement, BoardPoint as Point } from "./board-types";
  
  const PLAYER_COLOR = "#1565c0";
  const PLAYER_BORDER = "#ffffff";
  const OPPONENT_COLOR = "#c62828";
  const OPPONENT_BORDER = "#ffffff";
  const BALL_COLOR = "#f5f5f5";
  const CONE_COLOR = "#ff6d00";
  const DRAW_COLOR = "#facc15";
  const LINE_STRAIGHT_COLOR = "#ffffff";
  const ARROW_COLOR = "#38bdf8";
  const BEZIER_LINE_COLOR = "#ffffff";
  const BEZIER_ARROW_COLOR = "#38bdf8";
  
  function renderDrawPath(
    ctx: CanvasRenderingContext2D,
    points: Point[],
    color = "#ffffff",
    lw = 2.5,
    shape = "freehand-solid",
    arrowEnd = "none"
  ) {
    if (!points || points.length < 2) return;
  
    const p0 = points[0];
    const pN = points[points.length - 1];
  
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
  
    const isDashed = shape.includes("dashed");
    if (isDashed) ctx.setLineDash([8, 5]);
  
    if (shape === "bezier-solid" || shape === "bezier-dashed") {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pN.x, pN.y);
      ctx.stroke();
    } else if (shape === "straight-solid" || shape === "straight-dashed") {
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(pN.x, pN.y);
      ctx.stroke();
    } else if (shape === "arc-wavy") {
      ctx.setLineDash([]);
      ctx.beginPath();
      const steps = 40;
      const dx = pN.x - p0.x;
      const dy = pN.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 15;
      const ny = (dx / len) * 15;
  
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const bx = p0.x + dx * t + nx * Math.sin(t * Math.PI * 4);
        const by = p0.y + dy * t + ny * Math.sin(t * Math.PI * 4);
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();
    } else if (shape === "arc-wavy-dashed") {
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      const steps = 40;
      const dx = pN.x - p0.x;
      const dy = pN.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * 15;
      const ny = (dx / len) * 15;
  
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const bx = p0.x + dx * t + nx * Math.sin(t * Math.PI * 4);
        const by = p0.y + dy * t + ny * Math.sin(t * Math.PI * 4);
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
      }
      ctx.stroke();
    } else if (shape === "rect-outline" || shape === "rect-dashed") {
      ctx.strokeRect(
        Math.min(p0.x, pN.x),
        Math.min(p0.y, pN.y),
        Math.abs(pN.x - p0.x),
        Math.abs(pN.y - p0.y)
      );
    } else if (shape === "rect-filled") {
      ctx.setLineDash([]);
      ctx.fillRect(
        Math.min(p0.x, pN.x),
        Math.min(p0.y, pN.y),
        Math.abs(pN.x - p0.x),
        Math.abs(pN.y - p0.y)
      );
    } else if (shape === "circle-outline" || shape === "circle-dashed") {
      const rx = Math.abs(pN.x - p0.x) / 2;
      const ry = Math.abs(pN.y - p0.y) / 2;
      const cx = Math.min(p0.x, pN.x) + rx;
      const cy = Math.min(p0.y, pN.y) + ry;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === "circle-filled") {
      ctx.setLineDash([]);
      const rx = Math.abs(pN.x - p0.x) / 2;
      const ry = Math.abs(pN.y - p0.y) / 2;
      const cx = Math.min(p0.x, pN.x) + rx;
      const cy = Math.min(p0.y, pN.y) + ry;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }
  
    ctx.setLineDash([]);
  
    if (arrowEnd !== "none") {
      const headLen = 16;
      ctx.strokeStyle = color;
      ctx.setLineDash([]);
      ctx.lineCap = "round";
  
      if (arrowEnd === "end" || arrowEnd === "both") {
        const prev = points[points.length - 2] ?? p0;
        const angle = Math.atan2(pN.y - prev.y, pN.x - prev.x);
        ctx.beginPath();
        ctx.moveTo(
          pN.x - headLen * Math.cos(angle - Math.PI / 6),
          pN.y - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(pN.x, pN.y);
        ctx.lineTo(
          pN.x - headLen * Math.cos(angle + Math.PI / 6),
          pN.y - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
  
      if (arrowEnd === "start" || arrowEnd === "both") {
        const next = points[1] ?? pN;
        const angle = Math.atan2(p0.y - next.y, p0.x - next.x);
        ctx.beginPath();
        ctx.moveTo(
          p0.x - headLen * Math.cos(angle - Math.PI / 6),
          p0.y - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(p0.x, p0.y);
        ctx.lineTo(
          p0.x - headLen * Math.cos(angle + Math.PI / 6),
          p0.y - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
      }
    }
  
    ctx.restore();
  }
  
  function drawPlayerLike(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    fill: string,
    stroke: string,
    label?: string
  ) {
    ctx.save();
  
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  
    if (label) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(10, radius)}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x, y);
    }
  
    ctx.restore();
  }
  
  function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, radius = 8) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = BALL_COLOR;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#111";
    ctx.stroke();
    ctx.restore();
  }
  
  function drawCone(ctx: CanvasRenderingContext2D, x: number, y: number, size = 12, color = CONE_COLOR) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }
  
  function drawGoal(ctx: CanvasRenderingContext2D, x: number, y: number, w = 26, h = 14) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    ctx.restore();
  }
  
  function drawText(ctx: CanvasRenderingContext2D, x: number, y: number, text = "T") {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  
  function drawEquipment(ctx: CanvasRenderingContext2D, el: BoardElement) {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const color = el.equipColor || "#ffffff";
    const scale = el.scale ?? 1;
    const scaleX = el.scaleX ?? scale;
    const scaleY = el.scaleY ?? scale;
  
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((el.rotation ?? 0) * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
  
    switch (el.type) {
      case "disc":
      case "cinesino":
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.stroke();
        break;
  
      case "goalLarge":
        ctx.strokeRect(-24, -12, 48, 24);
        break;
  
      case "sagoma":
        ctx.beginPath();
        ctx.arc(0, -10, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeRect(-8, -2, 16, 26);
        break;
  
      case "flag":
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(0, 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -18);
        ctx.lineTo(14, -10);
        ctx.lineTo(0, -4);
        ctx.closePath();
        ctx.fill();
        break;
  
      case "ladder":
        ctx.strokeRect(-30, -10, 60, 20);
        for (let i = -20; i <= 20; i += 10) {
          ctx.beginPath();
          ctx.moveTo(i, -10);
          ctx.lineTo(i, 10);
          ctx.stroke();
        }
        break;
  
      case "hurdle":
        ctx.beginPath();
        ctx.moveTo(-16, 10);
        ctx.lineTo(-16, -8);
        ctx.lineTo(16, -8);
        ctx.lineTo(16, 10);
        ctx.stroke();
        break;
  
      case "pole":
        ctx.beginPath();
        ctx.moveTo(0, -24);
        ctx.lineTo(0, 24);
        ctx.stroke();
        break;
  
      case "vest":
        ctx.beginPath();
        ctx.moveTo(-10, -14);
        ctx.lineTo(10, -14);
        ctx.lineTo(14, 14);
        ctx.lineTo(-14, 14);
        ctx.closePath();
        ctx.stroke();
        break;
    }
  
    ctx.restore();
  }
  
  export function drawElements(
    ctx: CanvasRenderingContext2D,
    elements: BoardElement[],
    playerRadius = 14
  ) {
    elements.forEach((el) => {
      if (el.type === "path" || el.type === "line" || el.type === "arrow" || el.type === "bezier" || el.type === "bezierarrow") {
        renderDrawPath(
          ctx,
          el.points || [],
          el.color ||
            (el.type === "arrow"
              ? ARROW_COLOR
              : el.type === "bezierarrow"
              ? BEZIER_ARROW_COLOR
              : el.type === "bezier"
              ? BEZIER_LINE_COLOR
              : el.type === "line"
              ? LINE_STRAIGHT_COLOR
              : DRAW_COLOR),
          el.lineWidth || 2.5,
          el.drawShape || "freehand-solid",
          el.arrowEnd || (el.type === "arrow" || el.type === "bezierarrow" ? "end" : "none")
        );
        return;
      }
  
      const x = el.x ?? 0;
      const y = el.y ?? 0;
  
      switch (el.type) {
        case "player":
          drawPlayerLike(ctx, x, y, playerRadius, PLAYER_COLOR, PLAYER_BORDER, el.label);
          break;
  
        case "opponent":
          drawPlayerLike(ctx, x, y, playerRadius, OPPONENT_COLOR, OPPONENT_BORDER, el.label);
          break;
  
        case "goalkeeper":
          drawPlayerLike(ctx, x, y, playerRadius, "#f59e0b", "#ffffff", el.label);
          break;
  
        case "ball":
          drawBall(ctx, x, y, Math.max(6, playerRadius * 0.55));
          break;
  
        case "cone":
          drawCone(ctx, x, y, Math.max(8, playerRadius * 0.8));
          break;
  
        case "goal":
          drawGoal(ctx, x, y);
          break;
  
        case "text":
          drawText(ctx, x, y, el.label || "T");
          break;
  
        case "goalLarge":
        case "disc":
        case "cinesino":
        case "sagoma":
        case "flag":
        case "ladder":
        case "hurdle":
        case "pole":
        case "vest":
          drawEquipment(ctx, el);
          break;
      }
    });
  }