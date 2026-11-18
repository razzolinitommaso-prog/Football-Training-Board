import { Router } from "express";
import { pool } from "@workspace/db";
import { ensureParentTournamentAvailability, parentTournamentCatalog, syncTournamentReplies, tournamentReplyLock } from "../lib/parent-tournament-availability";

export function parentTournamentDeadline(firstDate: string) {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(firstDate));
  const date = new Date(day + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - 3 + 7) % 7 || 7));
  const offset = new Intl.DateTimeFormat("en", {timeZone:"Europe/Rome",timeZoneName:"shortOffset"}).formatToParts(date).find(p=>p.type==="timeZoneName")?.value ?? "GMT+1";
  return new Date(date.toISOString().slice(0,10) + "T23:59:59.999" + (offset.includes("+2") ? "+02:00" : "+01:00"));
}
const labels: Record<string,string> = {illness:"malattia",catechism:"catechismo",family:"motivi familiari",other:"altro"};
const present = ({matches: _matches, ...group}: any) => ({...group, parentAvailability: group.parentAvailability ? {...group.parentAvailability, reasonLabel: labels[group.parentAvailability.reason] ?? null} : null,
  parentAvailabilityDeadline: parentTournamentDeadline(group.firstDate).toISOString(), parentAvailabilityLocked: new Date() > parentTournamentDeadline(group.firstDate)});
const router = Router();
router.use("/parent/tournaments", (req,res,next) => {
  if(req.session.role!=="parent" || !req.session.clubId || !req.session.parentPlayerId){res.status(403).json({error:"Accesso genitore e figlio collegato richiesti"});return;}
  next();
});
router.get("/parent/tournaments", async(req,res) => {
  await ensureParentTournamentAvailability();
  res.json((await parentTournamentCatalog(pool,req.session.clubId!,Number(req.session.parentPlayerId))).map(present));
});
router.patch("/parent/tournaments", async(req,res) => {
  const {key,status}=req.body ?? {};
  const reason=String(req.body?.reason??"").trim(),notes=String(req.body?.notes??"").trim();
  if(typeof key!=="string"||key.length>1000||!["available","unavailable"].includes(status)){res.status(400).json({error:"Indica Disponibile oppure Non disponibile per il torneo"});return;}
  if(status==="unavailable"&&(!Object.hasOwn(labels,reason)||(reason==="other"&&!notes))){res.status(400).json({error:"Indica il motivo dell’indisponibilità"});return;}
  if(notes.length>2000){res.status(400).json({error:"Le note non possono superare 2.000 caratteri"});return;}
  const clubId=req.session.clubId!,playerId=Number(req.session.parentPlayerId);
  await ensureParentTournamentAvailability();
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const {rows:[player]}=await client.query("SELECT team_id FROM players WHERE id=$1 AND club_id=$2",[playerId,clubId]);
    if(!player?.team_id){await client.query("ROLLBACK");res.status(403).json({error:"Squadra del figlio non disponibile"});return;}
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[tournamentReplyLock(clubId,player.team_id)]);
    const group=(await parentTournamentCatalog(client,clubId,playerId)).find(g=>g.key===key);
    if(!group){await client.query("ROLLBACK");res.status(404).json({error:"Torneo non collegato alla squadra del figlio"});return;}
    if(new Date()>parentTournamentDeadline(group.firstDate)){await client.query("ROLLBACK");res.status(409).json({error:"Risposta chiusa: il termine è il mercoledì precedente la prima giornata del torneo"});return;}
    await client.query(`INSERT INTO parent_tournament_availability(club_id,team_id,player_id,tournament_id,tournament_key,status,reason,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(club_id,team_id,player_id,tournament_key)
      DO UPDATE SET status=excluded.status,reason=excluded.reason,notes=excluded.notes,updated_at=now()`,
      [clubId,group.teamId,playerId,group.tournamentId,key,status,status==="unavailable"?reason:null,status==="unavailable"?notes||null:null]);
    await syncTournamentReplies(client,clubId,group.teamId,key);
    const updated=(await parentTournamentCatalog(client,clubId,playerId)).find(g=>g.key===key);
    await client.query("COMMIT");res.json(present(updated));
  }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
});
export default router;
