type GesturePose = {
  label: string;
  head: [number, number];
  torso: string;
  farLimbs: string;
  nearLimbs: string;
  ball?: [number, number];
  prop?: string;
};

export const ATHLETE_GESTURES = {
  Motoria: {
    gestureRun: { label: "Corsa", head: [29, 8], torso: "M23 13 30 15 25 28 17 27Z", farLimbs: "M24 16 16 20 11 28 M21 26 15 35 7 42 5 42", nearLimbs: "M27 17 33 22 38 15 M22 26 32 31 26 40 30 42" },
    gestureSkip: { label: "Skip alto", head: [23, 7], torso: "M19 13 27 13 28 27 19 29Z", farLimbs: "M21 15 14 21 15 28 M22 28 21 38 20 44 24 44", nearLimbs: "M25 15 30 20 35 13 M25 27 33 23 35 32 32 35" },
    gestureLadder: { label: "Passi su scaletta", head: [24, 7], torso: "M19 12 28 12 29 24 20 27Z", farLimbs: "M21 15 15 20 16 27 M22 25 18 34 13 39 17 40", nearLimbs: "M26 15 32 21 34 27 M26 24 31 29 29 36 33 36", prop: "M4 42 33 29 45 33 16 46Z M11 39 23 43 M18 36 30 40 M25 33 37 37" },
    gestureStep: { label: "Salita sul box", head: [29, 8], torso: "M23 13 31 15 26 28 18 26Z", farLimbs: "M25 16 18 20 14 27 M21 26 17 36 13 44 18 44", nearLimbs: "M28 17 34 20 38 14 M25 26 34 26 34 33 39 33", prop: "M26 34H45V44H26Z M26 34 30 31H47L45 34 M45 44 47 41V31" },
    gestureShuffle: { label: "Spostamento laterale", head: [24, 9], torso: "M18 14 29 14 29 27 20 29Z", farLimbs: "M21 17 13 21 9 27 M22 27 13 33 7 40 4 40", nearLimbs: "M27 17 35 21 40 18 M27 28 33 34 36 42 41 42" },
    gestureJump: { label: "Salto", head: [24, 15], torso: "M19 20 29 20 29 31 20 32Z", farLimbs: "M20 21 14 14 13 6 M22 30 17 36 14 42 18 43", nearLimbs: "M28 21 35 14 36 5 M27 30 33 36 30 42 34 43" },
    gestureLunge: { label: "Affondo", head: [27, 8], torso: "M22 13 31 14 28 27 21 27Z", farLimbs: "M24 16 19 23 24 25 M23 26 16 35 8 38 5 38", nearLimbs: "M29 16 33 23 29 25 M27 27 36 29 36 40 41 40" },
    gestureSquat: { label: "Squat", head: [28, 12], torso: "M24 17 31 18 24 29 15 29Z", farLimbs: "M25 19 31 25 39 23 M19 28 28 32 25 42 30 42", nearLimbs: "M28 20 34 26 42 25 M20 29 33 33 31 43 37 43" },
    gesturePlank: { label: "Plank", head: [39, 18], torso: "M32 18 36 22 26 28 17 29 15 23Z", farLimbs: "M31 22 34 32 38 32 M18 25 9 27 5 29", nearLimbs: "M34 23 35 32 42 32 M18 28 9 30 5 33 6 36" },
    gestureRope: { label: "Salto con la corda", head: [25, 12], torso: "M20 17 29 17 30 28 21 29Z", farLimbs: "M21 19 16 24 11 23 M23 28 20 35 21 41 25 41", nearLimbs: "M28 19 33 24 39 22 M27 28 29 35 28 41 32 41", prop: "M11 23C2 5 17 2 25 2S48 7 39 22" },
  },
  Calcio: {
    gestureHeader: { label: "Colpo di testa", head: [32, 10], torso: "M27 14 33 17 25 28 17 24Z", farLimbs: "M27 17 19 14 12 19 M20 25 16 34 10 41 6 41", nearLimbs: "M29 18 34 25 41 24 M23 26 24 34 20 42 24 43", ball: [41, 8] },
    gestureChest: { label: "Stop di petto", head: [20, 8], torso: "M18 13 25 14 30 20 23 29 16 27Z", farLimbs: "M21 16 13 20 8 16 M20 27 13 35 10 43 14 43", nearLimbs: "M24 17 20 22 13 24 M23 28 29 35 31 43 36 43", ball: [35, 19] },
    gestureInstep: { label: "Tiro di collo", head: [21, 8], torso: "M16 13 25 14 26 26 17 28Z", farLimbs: "M19 16 13 21 7 17 M20 26 17 36 14 43 19 43", nearLimbs: "M23 16 29 20 35 18 M24 26 34 30 39 35 41 38", ball: [45, 34] },
    gesturePass: { label: "Trasmissione di interno", head: [21, 8], torso: "M17 13 26 14 27 27 18 28Z", farLimbs: "M19 16 12 22 8 19 M20 26 15 35 14 42 19 42", nearLimbs: "M25 17 31 23 35 20 M24 27 29 34 33 40 38 39", ball: [43, 39] },
    gestureDribble: { label: "Conduzione palla", head: [28, 8], torso: "M23 13 31 15 25 27 17 26Z", farLimbs: "M24 16 15 19 11 25 M20 26 14 34 8 39 5 39", nearLimbs: "M29 17 34 22 39 20 M23 26 32 32 32 40 36 40", ball: [42, 41] },
    gestureDive: { label: "Tuffo del portiere", head: [31, 14], torso: "M26 17 31 20 22 28 15 25 17 20Z", farLimbs: "M26 18 34 18 41 12 M17 23 10 23 5 25", nearLimbs: "M29 21 36 23 42 17 M18 26 11 29 6 33 3 32", ball: [45, 9] },
  },
} satisfies Record<string, Record<string, GesturePose>>;

export const ATHLETE_GESTURE_TOOLS: Record<string, GesturePose> = {
  ...ATHLETE_GESTURES.Motoria,
  ...ATHLETE_GESTURES.Calcio,
};

export function AthleteGestureGlyph({ pose, color = "#f8fafc" }: { pose: GesturePose; color?: string }) {
  return (
    <svg viewBox="0 0 50 48" className="h-10 w-10" aria-hidden="true">
      <ellipse cx="24" cy="44" rx="15" ry="2" fill="#0f172a" opacity=".35" />
      {pose.prop && <path d={pose.prop} fill="none" stroke="#facc15" strokeWidth="1.6" strokeLinejoin="round" />}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={pose.farLimbs} stroke="#0f172a" strokeWidth="6.5" />
        <path d={pose.farLimbs} stroke={color} strokeWidth="4" opacity=".62" />
        <path d={pose.nearLimbs} stroke="#0f172a" strokeWidth="7" />
        <path d={pose.nearLimbs} stroke={color} strokeWidth="4.5" />
      </g>
      <path d={pose.torso} fill={color} stroke="#0f172a" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx={pose.head[0]} cy={pose.head[1]} r="4.2" fill={color} stroke="#0f172a" strokeWidth="1.3" />
      {pose.ball && <circle cx={pose.ball[0]} cy={pose.ball[1]} r="3.4" fill="#facc15" stroke="#0f172a" strokeWidth="1.3" />}
    </svg>
  );
}
