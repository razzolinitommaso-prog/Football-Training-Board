import { motorTestCatalog } from "@workspace/api-zod";
const team = {
  id: 11,
  clubId: 999,
  name: "Primi Calci 1° anno · Squadra con nome esteso",
  clubSection: "scuola_calcio",
  section: "scuola_calcio",
  category: "Primi Calci",
  seasonId: 70,
  seasonName: "2026/2027",
  playerCount: 2,
  assignedStaff: [{ userId: 1, role: "coach" }],
};
const motorSession = {
  id: "12121212-1212-4212-8212-121212121212",
  revision: 1,
  teamId: 11,
  date: "2026-11-21",
  cycle: "start",
  trainingSessionId: null,
  linkProgram: false,
  programPhase: "centrale",
  tests: motorTestCatalog.map((row) => ({
    id: row.id,
    minutes: row.minutes,
    phase: "centrale",
    link: false,
  })),
  results: { "101": { height: 133, weight: 27, tests: {} } },
  exerciseIds: {},
};
const player = {
  id: 101,
  clubId: 999,
  firstName: "Alessandro",
  lastName: "Giocatore dal cognome molto lungo",
  dateOfBirth: "2019-03-10",
  teamId: 11,
  status: "active",
  registered: true,
  available: true,
  clubSection: "scuola_calcio",
  jerseyNumber: 77,
  height: 133,
  weight: 27,
  notes: "",
  medicalCertificateExpiry: "2027-06-01",
};
const person = {
  id: 3,
  name: "Allenatore con nome e cognome molto lunghi",
  email: "indirizzo.del.collaboratore@example.test",
  phone: null,
  roles: ["coach", "fitness_coach"],
  sections: ["scuola_calcio"],
  teamIds: [11],
  duties: [],
};
const season = {
  id: 70,
  clubId: 999,
  name: "2026/2027",
  startDate: "2026-07-01",
  endDate: "2027-06-30",
  isActive: true,
};
const details = {
  title: "Compenso allenatore",
  role: "coach",
  seasonId: 70,
  compensationCents: 10000,
  reimbursementCents: 0,
  terms: "30",
  allocations: [{ teamId: 11, amountCents: 10000 }],
};
const expenses = {
  dues: [
    {
      id: 1,
      userId: 3,
      contractId: "test",
      name: person.name,
      month: "2026-11",
      dueDate: "2026-12-31",
      amountCents: 10000,
      paidCents: 3000,
      details,
    },
  ],
  receipts: [
    {
      id: "receipt-1",
      dueId: 1,
      userId: 3,
      name: person.name,
      amountCents: 3000,
      paidDate: "2026-11-21",
      method: "cash",
      documentId: null,
      notes: "",
      month: "2026-11",
      details,
    },
  ],
};
export const fixturePayments = [
  {
    id: 1,
    playerId: 101,
    playerName: player.firstName + " " + player.lastName,
    paymentType: "registration_fee",
    description: "Iscrizione · prima rata",
    amount: 190,
    status: "paid",
    paymentDate: "2026-09-15",
    paymentMethod: "cash",
    teamId: 11,
    forecastEligible: true,
  },
  {
    id: 2,
    playerId: 101,
    playerName: player.firstName + " " + player.lastName,
    paymentType: "annual_fee_installment",
    description: "Quota annuale · rata residua",
    amount: 180,
    status: "pending",
    dueDate: "2027-01-30",
    teamId: 11,
    forecastEligible: true,
  },
];
export async function mockResponse(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      location.origin,
    ),
    p = url.pathname;
  if (!p.startsWith("/api/"))
    return new Response("No external requests in fixture", { status: 403 });
  if (init?.method && init.method !== "GET")
    return Response.json(
      {
        error: "Collaudo locale in sola lettura: nessun dato reale modificato",
      },
      { status: 409 },
    );
  const pageParams=new URLSearchParams(location.search);
  const scenario = pageParams.get("scenario") ?? new URL(pageParams.get("returnTo")||"/",location.origin).searchParams.get("scenario");
  if(p==="/api/players/unavailable-alerts")return Response.json(scenario==="unavailable-alert"?[{id:101,firstName:player.firstName,lastName:player.lastName,teamId:11,teamName:team.name,unavailabilityReason:"payment",expectedReturn:null}]:[]);
  if(p==="/api/club-backup/audit"){
    if(scenario==="audit-failure")return Response.json({code:"CLUB_AUDIT_FAILED"},{status:500});
    const costs={due:10000,paid:3000,residual:7000,balanced:true,issues:[],available:true,records:1,receipts:1};
    return Response.json({clubId:999,asOf:"2026-11-26",tables:12,rows:40,integrity:true,externalReferences:2,scope:"Snapshot sintetico di collaudo; tutte le stagioni.",income:{available:true,records:2,missingPlayers:0,registered:37000,paid:19000,pending:18000,overdue:0,residual:18000,balanced:true,issues:[]},members:costs,senior:{...costs,available:false,records:0,receipts:0,due:0,paid:0,residual:0},references:{checked:30,missing:0,issues:[]},warnings:["Il file sul dispositivo richiede una verifica separata."]});
  }
  if(scenario==="motor-multiday"){
    const scheduledAt=new Date().toISOString().slice(0,10)+"T16:00:00Z";
    const session={id:910,clubId:999,teamId:11,title:"Recupero test motori",scheduledAt,durationMinutes:75,status:"scheduled",sessionKind:"regular",notes:"",createdByUserId:1,location:"Campo test",sessionNumber:1};
    if(p==="/api/training-sessions")return Response.json([session]);
    if(p==="/api/training-sessions/910")return Response.json(session);
    if(p==="/api/training-rosters/config")return Response.json({sharedGroups:[]});
    if(p==="/api/training-sessions/910/participants")return Response.json({blockedPlayerIds:[101],presentPlayerIds:[102],recordedPlayerIds:[101,102],total:2,beforeAppello:{available:1,parentUnavailable:0,secretaryUnavailable:0,pending:1,total:2},afterAppello:{present:1,absent:1,injured:0,pending:0}});
    if(p==="/api/training-sessions/910/planning")return Response.json({recoveries:[0,0],rotations:{},timings:{}});
    if(p==="/api/motor-tests/context")return Response.json({trainingSessionId:910,presentCount:1,sessions:[{id:910,title:session.title,time:"17:00"}],players:[{id:101,name:player.lastName+" "+player.firstName,coach:"absent",family:null},{id:102,name:"Nuovo presente della seconda giornata",coach:"present",family:"available"}]});
  }
  if (p === "/api/club-backup" && scenario === "backup-server-error")
    return Response.json({ error: "Errore simulato", code: "BACKUP_PREPARATION_FAILED" }, { status: 500 });
  if (p === "/api/club-backup" && scenario === "backup-empty")
    return new Response(new Blob([], {type:"application/gzip"}));
  // Transport fixture only. Archive integrity is checked by the separate database suite.
  if(p==="/api/club-backup"&&scenario==="backup-download")return new Response(new Uint8Array([31,139,8,0,0,0,0,0,0,3,3,0,0,0,0,0,0,0,0,0]),{headers:{"Content-Type":"application/gzip"}});
  if(p==="/api/club-backup"&&scenario==="backup-invalid")return Response.json({error:"Unexpected body"});
  if (scenario === "senior-error" && p === "/api/player-finance/expenses")
    return Response.json({ error: "Errore senior simulato" }, { status: 503 });
  let value: unknown = [];
  if (p === "/api/account/profile") value = { firstName:"Collaudo",lastName:"Nome esteso",email:"collaudo@example.test",phone:null,directParentLogin:false,sessions:[] };
  else if (p === "/api/teams/navigation-scope")
    value = { sections: ["scuola_calcio"], teams: [team] };
  else if (p === "/api/teams") value = [team];
  else if (p === "/api/seasons") value = scenario==="season-invalid"?[{...season,startDate:"2027-09-01",endDate:"2026-11-12"}]:[season];
  else if (p === "/api/clubs/me")
    value = { id: 999, name: "Società di collaudo", logoUrl: null };
  else if (p.includes("society-management"))
    value = p.endsWith("/choices")
      ? [{ id: 999, name: "Società di collaudo", role: "secretary" }]
      : {
          group: null,
          clubs: [],
          groupClubs: [],
          members: [],
          canAdmin: false,
          canFinance: true,
        };
  else if (p === "/api/player-payments") value = fixturePayments;
  else if (p === "/api/players") value = [player];
  else if (p === "/api/teams/11") value = team;
  else if (p === "/api/players/101") value = player;
  else if (p === "/api/matches") value = [{id:901,clubId:999,teamId:11,seasonId:70,opponent:"BARBERINO CALCIO 1927",date:"2026-11-21T15:30:00Z",homeAway:"home",competition:"Campionato",isPostponed:false,matchPlan:null}];
  else if (p === "/api/matches/901/callups") value = [{id:1,matchId:901,playerId:101,status:"confirmed",player}];
  else if (p === "/api/matches/901/callup-eligibility") value = {weekStart:"2026-11-16",rule:{sessions:2,minimum:1,allowUnratedConduct:true},rows:scenario === 'callup-minimum-reached' ? [{id:101,name:player.lastName+' '+player.firstName,present:1,recorded:1,conduct:null,state:'eligible',reasons:['Sedute valide prima della gara: 1/2 · minimo richiesto già raggiunto (1/1)','Condotta da registrare: ammessa dalla regola']}] : []};
  else if (p === "/api/teams/11/players") value = [player];
  else if (p.includes("/activity-summary"))
    value = {
      training: { present: 1, total: 2, percentage: 50, unrecorded: 0 },
      matches: { present: 1, total: 1, percentage: 100, callups: 1 },
      tests: [],
      conduct: { ottima: 0, buona: 1, insufficiente: 0 },
    };
  else if (p === "/api/member-services/expenses") value = expenses;
  else if (p === "/api/player-finance/expenses")
    value = { dues: [], receipts: [] };
  else if (p === "/api/member-services")
    value = {
      members: [person],
      teams: [team],
      seasons: [season],
      canFinance: true,
      canManageKit: true,
    };
  else if (p === "/api/member-services/3/profile")
    value = {
      person,
      profile: {
        revision: 0,
        medicalFrom: null,
        medicalUntil: null,
        medicalDocumentId: null,
        notes: "",
      },
      contracts: [],
      documents: [],
      canFinance: true,
      kitSlots: [],
    };
  else if (p === "/api/clubs/me/members")
    value = [
      {
        id: 3,
        firstName: "Marco",
        lastName: person.name,
        email: person.email,
        role: "coach",
        joinedAt: "2026-09-01",
        clubSection: ["scuola_calcio"],
        teamAssignments: [{ id: 11, teamName: team.name }],
      },
    ];
  else if (p.includes("dashboard/stats"))
    value = {
      totalPlayers: 1,
      totalTeams: 1,
      totalTrainingSessions: 0,
      totalMatches: 0,
      upcomingMatches: [],
      recentActivities: [],
    };
  else if (p === "/api/callup-rules")
    value = {
      canEdit: false,
      teams: [
        {
          ...team,
          rule: { sessions: 2, minimum: 1, allowUnratedConduct: true },
        },
      ],
    };
  else if (p === "/api/fee-list") value = { items: [] };
  else if(p==="/api/player-fitness-data/capabilities")value={canEdit:["fitness_coach","athletic_director"].includes(new URLSearchParams(location.search).get("role")??"")};
  else if (p.includes("motor-tests"))
    value = p.endsWith("/context")
      ? {
          players: [
            {
              id: 101,
              name: player.firstName + " " + player.lastName,
              coach: "present",
              family: "available",
            },
          ],
          trainingSessionId: null,
          presentCount: 1,
          sessions: [],
        }
      : {
          teams: [team],
          sessions: [motorSession],
          canRecord: true,
          recordTeamIds: [11],
        };
  else if (p.includes("attendance-register"))
    value = {
      teams: [team],
      teamId: 11,
      start: "2026-07-01",
      through: "2027-06-30",
      today: "2026-11-21",
      canEdit: false,
      players: [
        {
          ...player,
          name: player.firstName + " " + player.lastName,
          attendance: {},
          games: {},
        },
      ],
      sessions: [],
      matches: [],
    };
  else if (p.includes("dirigenti/overview"))
    value = {
      teams: [team],
      players: [player],
      matches: [],
      training: [],
      notifications: [],
    };
  else if (p === "/api/parent/children") value = [player];
  else if (p === "/api/auth/parent-children")
    value = { children: [player], selectedId: 101 };
  else if (p === "/api/parent/me")
    value = { player, children: [player], selectedChildId: 101 };
  else if (p === "/api/parent/player-card")
    value = { ...player, team, payments: fixturePayments, documents: [] };
  else if (p === "/api/parent/payments") value = fixturePayments;
  else if (p === "/api/parent/kit") value = [];
  else if (p === "/api/extra-time") value = [];
  return Response.json(value);
}
export async function customFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await mockResponse(path, init);
  if (!response.ok) throw new Error((await response.json()).error);
  return response.json();
}
