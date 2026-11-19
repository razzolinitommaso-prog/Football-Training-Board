import {
  motorTestCatalog,
  trainingExerciseStationsMarker,
  type MotorTestId,
  type MotorTestInput,
} from "./motor-tests";

/** Original illustrative drawings. They do not reproduce the TGMD administration plates. */
export function motorTestDiagram(id: MotorTestId): string {
  const person = (x: number, y: number, pose = "stand") => {
    const paths: Record<string, string> = {
      stand: "M0 -62V-30 M0 -53L-20 -40 M0 -53L20 -40 M0 -30L-14 0 M0 -30L14 0",
      jump: "M0 -62L8 -34 M0 -52L-20 -76 M0 -52L20 -76 M8 -34L-12 -8 M8 -34L28 -14",
      crouch:
        "M-10 -50L0 -32 M-8 -45L18 -36 M0 -32L20 -22L5 0 M0 -32L-16 -20L-8 0",
      balance:
        "M0 -62V-32 M0 -52L-28 -50 M0 -52L28 -50 M0 -32L0 0 M0 -32L22 -35L30 -17",
      reach: "M0 -62V-30 M0 -54L-15 -90 M0 -54L22 -88 M0 -30L-12 0 M0 -30L12 0",
      run: "M0 -60L12 -32 M0 -51L-20 -40L-30 -52 M0 -51L23 -57L34 -45 M12 -32L-10 -8L-25 -8 M12 -32L35 -15L27 0",
    };
    return `<g transform="translate(${x} ${y})" stroke="#14664e" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"><circle cx="${pose === "crouch" ? -14 : 0}" cy="${pose === "crouch" ? -61 : -75}" r="9" fill="#14664e" stroke="none"/><path d="${paths[pose]}"/></g>`;
  };
  const cone = (x: number, y: number, color = "#dd9a27") =>
    `<path d="M${x - 9} ${y}l9 -20 9 20z" fill="${color}"/>`;
  let draw = "";
  if (id === "long-jump")
    draw =
      person(110, 145, "crouch") +
      person(300, 100, "jump") +
      person(510, 145, "crouch") +
      '<path d="M30 150H610 M110 135V165 M510 135V165 M145 163H510 M150 65Q310 -5 475 65"/>';
  if (id === "high-jump")
    draw =
      person(205, 150, "reach") +
      person(500, 120, "reach") +
      '<path d="M30 155H610 M260 25V155 M550 15V155 M240 60H270 M530 25H560 M290 25H310 M300 25V60 M290 60H310"/>';
  if (id === "balance")
    draw =
      person(165, 150, "balance") +
      person(475, 140, "balance") +
      '<path d="M50 155H280 M370 165H580"/><ellipse cx="475" cy="150" rx="42" ry="9"/>';
  if (id === "march")
    draw =
      person(155, 140, "balance") +
      person(455, 140, "run") +
      '<circle cx="155" cy="140" r="28"/><path d="M210 90Q270 35 285 95l-14 -12 M285 95l4 -17 M210 155H395l-12 -8 M395 155l-12 8"/>';
  if (id === "slalom") {
    draw =
      '<path d="M40 110Q90 25 145 110T245 110T345 110T445 110T545 110L595 120 M595 155H60l12 -8 M60 155l12 8"/><circle cx="40" cy="110" r="8"/>';
    for (let i = 0; i < 6; i++) draw += cone(95 + i * 90, 100);
  }
  if (id === "colors")
    draw =
      '<circle cx="320" cy="95" r="25"/><circle cx="320" cy="95" r="7" fill="#14664e"/><path d="M320 120V145 M320 70V45 M345 95H435 M295 95H205"/>' +
      cone(320, 35, "#d65050") +
      cone(320, 175, "#3675ca") +
      cone(175, 105) +
      cone(465, 105, "#20956b");
  if (id === "roll")
    draw =
      '<rect x="35" y="130" width="280" height="20" rx="4"/>' +
      person(85, 128, "crouch") +
      '<circle cx="218" cy="116" r="9"/><path d="M210 107Q170 70 185 115Q200 137 230 128L245 110 M35 155H610"/>' +
      person(470, 150, "run");
  if (id === "circuit")
    draw =
      '<path d="M20 150H610 M55 145V100H100V145 M125 145V100H170V145 M215 145V105H280V145 M510 100H605l-12 -8 M605 100l-12 8"/><ellipse cx="340" cy="132" rx="19" ry="11"/><ellipse cx="390" cy="132" rx="19" ry="11"/><ellipse cx="440" cy="132" rx="19" ry="11"/>';
  if (id === "anthropometry")
    draw =
      '<path d="M140 25V155H240 M140 35H175 M140 55H160 M140 75H160 M140 95H160 M140 115H160"/>' +
      person(205, 150) +
      person(455, 125) +
      '<rect x="410" y="132" width="90" height="25" rx="5"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 185"><rect width="640" height="185" rx="10" fill="#f1f8f5"/><g fill="none" stroke="#14664e" stroke-width="2.5">${draw}</g></svg>`;
}
export const motorDiagramImage = (id: MotorTestId) =>
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(motorTestDiagram(id));
export function motorTestBoard(id: MotorTestId) {
  const item = motorTestCatalog.find((item) => item.id === id)!;
  const gesture =
    id === "slalom"
      ? "gestureDribble"
      : id === "long-jump" || id === "high-jump"
        ? "gestureJump"
        : id === "march" || id === "balance"
          ? "gestureSkip"
          : "gestureRun";
  return JSON.stringify({
    source: "tactical-board",
    boardId: null,
    motorTestId: id,
    data: {
      elements: [
        {
          id: `motor-${id}-title`,
          type: "text",
          x: 50,
          y: 12,
          label: item.title,
          color: "#ffffff",
          fontSize: 16,
        },
        {
          id: `motor-${id}-athlete`,
          type: gesture,
          x: 30,
          y: 40,
          color: "#ffffff",
          equipColor: "#ffffff",
        },
        {
          id: `motor-${id}-direction`,
          type: "arrow",
          points: [
            { x: 25, y: 65 },
            { x: 75, y: 65 },
          ],
          color: "#facc15",
          lineWidth: 3,
        },
        ...(["colors", "slalom", "circuit"].includes(id)
          ? Array.from({ length: id === "colors" ? 4 : 6 }, (_, i) => ({
              id: `motor-${id}-cone-${i}`,
              type: "cone",
              x: 20 + i * 12,
              y: 50,
              color: "#e39a24",
            }))
          : []),
      ],
    },
  });
}
/** Only metadata generated for this motor session is synchronized. Existing board edits survive. */
export function composeMotorStation(
  tests: MotorTestInput["tests"],
  previous?: string | null,
  motorSessionId?: string,
) {
  let saved: Record<string, any>[] = [];
  const marker = previous?.indexOf(trainingExerciseStationsMarker) ?? -1;
  if (marker >= 0) {
    const rows = JSON.parse(
      previous!.slice(marker + trainingExerciseStationsMarker.length),
    );
    if (!Array.isArray(rows))
      throw new Error("Esercitazioni della stazione non leggibili.");
    saved = rows;
  }
  const exercises = tests.map((test) => {
    const item = motorTestCatalog.find((item) => item.id === test.id)!;
    const original = saved.find(
      (row) => row.id === test.id || row.motorTestId === test.id,
    );
    return {
      ...original,
      id: test.id,
      motorTestId: test.id,
      motorSessionId: motorSessionId ?? original?.motorSessionId,
      title:
        test.id === "slalom" &&
        (!original?.title || original.title === "Conduzione palla a slalom")
          ? item.title
          : original?.title || item.title,
      exercise: test.id==="slalom"&&original?.exercise==="Disporre 5–6 cinesini su 10–15 m. Cronometrare il percorso di andata e ritorno in conduzione tra i cinesini."?item.instructions:original?.exercise || item.instructions,
      equipment: original?.equipment || item.materials,
      durationMinutes: String(test.minutes),
      objective: item.principle,
      notes: original?.notes ?? "",
      playersRequired: original?.playersRequired ?? "",
      variants: original?.variants ?? [],
      boardJson: original?.boardJson || motorTestBoard(test.id),
      boardPreview: original?.boardPreview || motorDiagramImage(test.id),
    };
  });
  const head =
    marker >= 0
      ? previous!.slice(0, marker)
      : "Programma di valutazione motoria e coordinativa. Ogni esercitazione contiene descrizione, materiali e schema illustrativo.";
  return head + trainingExerciseStationsMarker + JSON.stringify(exercises);
}
