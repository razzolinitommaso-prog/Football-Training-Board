import { pool } from "@workspace/db";
import { ensureSharedTournamentTables } from "./shared-tournament-storage";

type Queryable = { query: (...args: any[]) => Promise<any> };
export const legacyTournamentKey = (seasonId: number | null, competition: string) =>
  `legacy:${seasonId ?? "none"}:${competition.trim().toLowerCase()}`;
export const tournamentReplyLock = (clubId: number, teamId: number) => `parent-tournament:${clubId}:${teamId}`;
let ready: Promise<unknown> | undefined;
export function ensureParentTournamentAvailability() {
  return ready ??= ensureSharedTournamentTables().then(() => pool.query(`
    ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_status TEXT;
    ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_reason TEXT;
    ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_notes TEXT;
    ALTER TABLE call_ups ADD COLUMN IF NOT EXISTS parent_availability_updated_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS parent_tournament_availability (
      id serial PRIMARY KEY, club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      player_id integer NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      tournament_id integer REFERENCES shared_tournaments(id) ON DELETE CASCADE,
      tournament_key text NOT NULL, status text NOT NULL CHECK(status IN ('available','unavailable')),
      reason text, notes text, updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(club_id,team_id,player_id,tournament_key)
    );
    ALTER TABLE parent_tournament_availability ADD COLUMN IF NOT EXISTS response_mode text NOT NULL DEFAULT 'all';
    ALTER TABLE parent_tournament_availability ADD COLUMN IF NOT EXISTS available_dates jsonb NOT NULL DEFAULT '[]'::jsonb;
  `)).catch(error => { ready = undefined; throw error; });
}

/** One choice per local tournament day, including every day in the shared phases. */
export function parentTournamentDates(group: {program:any[];phases?:any[]}) {
  const days=new Set<string>();
  for(const entry of group.program) if(Number.isFinite(Date.parse(entry.date))) days.add(new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(entry.date)));
  for(const phase of group.phases??[]){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(phase.startDate??'')||!/^\d{4}-\d{2}-\d{2}$/.test(phase.endDate??''))continue;
    const start=Date.parse(phase.startDate+'T12:00:00Z'),end=Date.parse(phase.endDate+'T12:00:00Z');
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||end-start>365*86400000)continue;
    for(let time=start;time<=end;time+=86400000)days.add(new Date(time).toISOString().slice(0,10));
  }
  return [...days].sort();
}

export async function tournamentMatchScope(client: Queryable, matchId: number) {
  const { rows: [match] } = await client.query(`SELECT m.id,m.club_id,m.team_id,m.season_id,m.competition,x.tournament_id
    FROM matches m LEFT JOIN shared_tournament_matches x ON x.match_id=m.id WHERE m.id=$1`, [matchId]);
  if (!match?.team_id || (!match.tournament_id && !/^torneo\b/i.test(match.competition ?? ""))) return null;
  return { clubId: match.club_id as number, teamId: match.team_id as number,
    key: match.tournament_id ? `shared:${match.tournament_id}` : legacyTournamentKey(match.season_id, match.competition) };
}

export async function parentTournamentCatalog(client: Queryable, clubId: number, playerId: number) {
  const { rows: [player] } = await client.query("SELECT team_id FROM players WHERE id=$1 AND club_id=$2", [playerId, clubId]);
  if (!player?.team_id) return [];
  const teamId = Number(player.team_id);
  const { rows: matches } = await client.query(`SELECT m.id,m.date,m.opponent,m.home_away,m.competition,m.season_id,m.location,x.tournament_id,x.entry_id
    FROM matches m LEFT JOIN shared_tournament_matches x ON x.match_id=m.id
    WHERE m.club_id=$1 AND m.team_id=$2 ORDER BY m.date,m.id`, [clubId, teamId]);
  const { rows: shared } = await client.query(`SELECT t.* FROM shared_tournaments t JOIN shared_tournament_teams x ON x.tournament_id=t.id
    WHERE t.club_id=$1 AND x.team_id=$2 ORDER BY t.start_date`, [clubId, teamId]);
  const { rows: states } = await client.query("SELECT competition,program FROM tournament_states WHERE club_id=$1 AND team_id=$2", [clubId, teamId]);
  const { rows: replies } = await client.query("SELECT * FROM parent_tournament_availability WHERE club_id=$1 AND team_id=$2 AND player_id=$3", [clubId, teamId, playerId]);
  const { rows: previousReplies } = await client.query(`SELECT c.match_id FROM call_ups c JOIN matches m ON m.id=c.match_id
    WHERE m.club_id=$1 AND m.team_id=$2 AND c.player_id=$3 AND (c.parent_availability_status IS NOT NULL OR lower(c.status) IN ('available','unavailable'))`, [clubId,teamId,playerId]);
  const groups: any[] = shared.map((t: any) => ({ key: `shared:${t.id}`, tournamentId: t.id, name: t.name,
    location: t.location, startDate: String(t.start_date).slice(0,10), endDate: t.end_date ? String(t.end_date).slice(0,10) : null,
    phases: t.phases ?? [], matches: matches.filter((m: any) => m.tournament_id === t.id) }));
  for (const match of matches) {
    if (match.tournament_id || !/^torneo\b/i.test(match.competition ?? "")) continue;
    const key = legacyTournamentKey(match.season_id, match.competition);
    let group = groups.find(g => g.key === key);
    if (!group) { group = { key, tournamentId: null, name: match.competition, location: match.location, phases: [], matches: [] }; groups.push(group); }
    group.matches.push(match);
  }
  return groups.map(group => {
    const state = states.find((s: any) => s.competition.trim().toLowerCase() === group.name.trim().toLowerCase() || s.competition.trim().toLowerCase() === `torneo: ${group.name}`.toLowerCase());
    const program = (Array.isArray(state?.program) ? state.program : []).filter((e: any) => e.kind !== "composition" && Number.isFinite(Date.parse(e.date))).map((e: any) => {
      const match = group.matches.find((m: any) => m.entry_id ? m.entry_id === e.id : new Date(m.date).getTime() === Date.parse(e.date) &&
        (m.opponent.trim().toLowerCase() === e.awayTeam?.trim().toLowerCase() || m.opponent.trim().toLowerCase() === e.homeTeam?.trim().toLowerCase()));
      return { id: e.id, date: e.date, homeTeam: e.homeTeam, awayTeam: e.awayTeam, phase: e.phase ?? "", group: e.group ?? "", matchId: match?.id ?? null, ownSide: match?.home_away ?? "none" };
    });
    if (!program.length) for (const match of group.matches) program.push({ id: `match-${match.id}`, date: new Date(match.date).toISOString(),
      homeTeam: match.home_away === "home" ? "La nostra squadra" : match.opponent, awayTeam: match.home_away === "away" ? "La nostra squadra" : match.opponent,
      phase: "", group: "", matchId: match.id });
    program.sort((a: any,b: any) => Date.parse(a.date)-Date.parse(b.date));
    const first = program[0]?.date ?? (group.startDate ? `${group.startDate}T12:00:00+01:00` : null);
    const reply = replies.find((r: any) => r.tournament_key === group.key);
    const oldReplies = group.matches.map((m: any) => m.id);
    const dates=parentTournamentDates({...group,program});
    const availableDates=Array.isArray(reply?.available_dates)?reply.available_dates.filter((d:unknown)=>typeof d==='string'&&dates.includes(d)):[];
    const responseStatus=reply?.response_mode==='dates'?(dates.every(day=>availableDates.includes(day))?'available':availableDates.length?'partial':'unavailable'):reply?.status;
    return { ...group, teamId, parentPlayerId: playerId, program, matchIds: oldReplies, dates,
      hasPreviousMatchReplies: !reply && previousReplies.some((r:any)=>oldReplies.includes(r.match_id)),
      firstDate: dates[0]?dates[0]+'T12:00:00+01:00':first, lastDate: dates.at(-1)?dates.at(-1)+'T12:00:00+01:00':program.at(-1)?.date ?? first,
      parentAvailability: reply ? {status: responseStatus, mode:reply.response_mode??'all', availableDates, reason: reply.reason, notes: reply.notes, updatedAt: reply.updated_at} : null };
  }).filter(group => group.firstDate && group.program.length);
}

export async function syncMatchTournamentReply(matchId: number) {
  await ensureParentTournamentAvailability();
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const scope=await tournamentMatchScope(client,matchId);
    if(scope){await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[tournamentReplyLock(scope.clubId,scope.teamId)]);await syncTournamentReplies(client,scope.clubId,scope.teamId,scope.key);}
    await client.query("COMMIT");
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
}

/** Existing staff consumers keep reading call_ups; a reply never changes a coach's call-up status. */
export async function syncTournamentReplies(client: Queryable, clubId: number, teamId: number, key: string) {
  const catalogMatches = key.startsWith("shared:")
    ? await client.query(`SELECT m.id FROM matches m JOIN shared_tournament_matches x ON x.match_id=m.id WHERE m.club_id=$1 AND m.team_id=$2 AND x.tournament_id=$3`, [clubId, teamId, Number(key.slice(7))])
    : await client.query(`SELECT m.id FROM matches m LEFT JOIN shared_tournament_matches x ON x.match_id=m.id WHERE m.club_id=$1 AND m.team_id=$2 AND x.match_id IS NULL AND $3=('legacy:'||coalesce(m.season_id::text,'none')||':'||lower(btrim(m.competition)))`, [clubId, teamId, key]);
  const ids = catalogMatches.rows.map((m: any) => m.id);
  if (!ids.length) return;
  const effectiveStatus=`CASE WHEN r.response_mode='dates' THEN CASE WHEN r.available_dates ? to_char(m.date AT TIME ZONE 'Europe/Rome','YYYY-MM-DD') THEN 'available' ELSE 'unavailable' END ELSE r.status END`;
  await client.query(`UPDATE call_ups c SET parent_availability_status=${effectiveStatus},parent_availability_reason=CASE WHEN (${effectiveStatus})='unavailable' THEN r.reason ELSE NULL END,parent_availability_notes=CASE WHEN (${effectiveStatus})='unavailable' THEN r.notes ELSE NULL END,parent_availability_updated_at=r.updated_at
    FROM parent_tournament_availability r JOIN players p ON p.id=r.player_id AND p.club_id=r.club_id AND p.team_id=r.team_id
    JOIN matches m ON m.club_id=r.club_id AND m.team_id=r.team_id
    WHERE r.club_id=$1 AND r.team_id=$2 AND r.tournament_key=$3 AND c.match_id=m.id AND c.match_id=ANY($4::integer[]) AND c.player_id=r.player_id`, [clubId, teamId, key, ids]);
  await client.query(`INSERT INTO call_ups(match_id,player_id,status,parent_availability_status,parent_availability_reason,parent_availability_notes,parent_availability_updated_at)
    SELECT m.id,r.player_id,'availability',${effectiveStatus},CASE WHEN (${effectiveStatus})='unavailable' THEN r.reason ELSE NULL END,CASE WHEN (${effectiveStatus})='unavailable' THEN r.notes ELSE NULL END,r.updated_at FROM matches m
    JOIN parent_tournament_availability r ON r.club_id=m.club_id AND r.team_id=m.team_id AND r.tournament_key=$3
    JOIN players p ON p.id=r.player_id AND p.club_id=r.club_id AND p.team_id=r.team_id
    WHERE m.club_id=$1 AND m.team_id=$2 AND m.id=ANY($4::integer[]) AND NOT EXISTS(SELECT 1 FROM call_ups c WHERE c.match_id=m.id AND c.player_id=r.player_id)`, [clubId, teamId, key, ids]);
}
