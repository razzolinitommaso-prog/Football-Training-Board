import { eq, sql } from "drizzle-orm";
import { db, playersTable, subscriptionsTable, teamsTable } from "@workspace/db";

export type PlanLimitKey = "teams" | "players";

export const PLAN_LIMITS: Record<string, { maxTeams: number; maxPlayers: number }> = {
  standard: { maxTeams: 3, maxPlayers: 50 },
  basic: { maxTeams: 3, maxPlayers: 50 },
  advanced: { maxTeams: 5, maxPlayers: 100 },
  "semi-pro": { maxTeams: 10, maxPlayers: 200 },
  pro: { maxTeams: 10, maxPlayers: 200 },
  elite: { maxTeams: 99, maxPlayers: 9999 },
};

export function limitsForPlan(planName?: string | null) {
  return PLAN_LIMITS[String(planName ?? "standard").toLowerCase()] ?? PLAN_LIMITS.standard;
}

export async function getClubUsageAndLimits(clubId: number) {
  const [subscription] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.clubId, clubId))
    .limit(1);

  const planKey = String(subscription?.planName ?? "standard").toLowerCase();
  const fallbackLimits = limitsForPlan(planKey);
  const hasCanonicalPlan = Object.prototype.hasOwnProperty.call(PLAN_LIMITS, planKey);
  const limits = {
    maxTeams: hasCanonicalPlan ? fallbackLimits.maxTeams : (subscription?.maxTeams ?? fallbackLimits.maxTeams),
    maxPlayers: hasCanonicalPlan ? fallbackLimits.maxPlayers : (subscription?.maxPlayers ?? fallbackLimits.maxPlayers),
  };

  const [teamsCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(teamsTable)
    .where(eq(teamsTable.clubId, clubId));

  const [playersCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(playersTable)
    .where(eq(playersTable.clubId, clubId));

  return {
    subscription: subscription ?? null,
    ...limits,
    currentTeams: teamsCount?.count ?? 0,
    currentPlayers: playersCount?.count ?? 0,
  };
}

export async function assertCanCreateWithinPlan(clubId: number, key: PlanLimitKey) {
  const usage = await getClubUsageAndLimits(clubId);
  const current = key === "teams" ? usage.currentTeams : usage.currentPlayers;
  const max = key === "teams" ? usage.maxTeams : usage.maxPlayers;
  if (current >= max) {
    const label = key === "teams" ? "squadre" : "giocatori";
    return {
      ok: false as const,
      status: 403,
      body: {
        error: `Limite piano raggiunto: ${current}/${max} ${label}. Aggiorna il piano per continuare.`,
        code: "PLAN_LIMIT_REACHED",
        resource: key,
        current,
        max,
      },
    };
  }
  return { ok: true as const, usage };
}
