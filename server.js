import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

// TheSportsDB (gratis) – key pública "1"
const BASE_URL = "https://www.thesportsdb.com/api/v1/json/1";

// Partido fijo por nombre + fecha
const MATCH_DATE = process.env.MATCH_DATE; // YYYY-MM-DD
const HOME_TEAM = process.env.HOME_TEAM;   // ej: Monterrey
const AWAY_TEAM = process.env.AWAY_TEAM;   // ej: Cruz Azul
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 15000);

let cache = { ts: 0, data: null };

function normStr(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function makeFallback(status = "—") {
  return {
    league: "Liga MX",
    matchId: `${MATCH_DATE || "date"}-${HOME_TEAM || "home"}-${AWAY_TEAM || "away"}`,
    status,
    minute: null,
    home: { name: HOME_TEAM || "LOCAL", short: (HOME_TEAM || "LOC").slice(0,3).toUpperCase(), score: 0, logo: "" },
    away: { name: AWAY_TEAM || "VISITA", short: (AWAY_TEAM || "VIS").slice(0,3).toUpperCase(), score: 0, logo: "" },
    goals: [],
    updatedAt: new Date().toISOString()
  };
}

async function fetchEventsByDay(dateStr) {
  const url = `${BASE_URL}/eventsday.php?d=${encodeURIComponent(dateStr)}&s=Soccer`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`TheSportsDB HTTP ${r.status}`);
  return r.json();
}

async function fetchEventDetails(eventId) {
  const url = `${BASE_URL}/lookupevent.php?id=${encodeURIComponent(eventId)}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`TheSportsDB lookupevent HTTP ${r.status}`);
  return r.json();
}

function parseGoalDetails(strDetails, teamSide) {
  if (!strDetails) return [];
  const raw = String(strDetails).replace(/\r/g, "\n");
  const parts = raw.split(/\n|;/).map(x => x.trim()).filter(Boolean);

  const goals = [];
  for (const p of parts) {
    const m = p.match(/(\d{1,3})(\+\d{1,2})?\s*'?/);
    const minute = m ? Number(m[1]) : null;
    const player = p.replace(/^\s*\d{1,3}(\+\d{1,2})?\s*'?:?\s*/,"").trim() || "Gol";
    goals.push({ minute, team: teamSide, player });
  }
  return goals;
}

function guessStatus(e) {
  const s = normStr(e?.strStatus);
  if (!s) return "—";
  if (s.includes("finished")) return "FT";
  if (s.includes("not started")) return "NS";
  if (s.includes("in progress") || s.includes("live")) return "LIVE";
  return e?.strStatus || "—";
}

async function getCurrentMatch() {
  const now = Date.now();
  if (cache.data && (now - cache.ts) < CACHE_TTL_MS) return cache.data;

  if (!MATCH_DATE || !HOME_TEAM || !AWAY_TEAM) {
    const data = makeFallback("FALTAN VARIABLES");
    cache = { ts: now, data };
    return data;
  }

  const day = await fetchEventsByDay(MATCH_DATE);
  const events = Array.isArray(day?.events) ? day.events : [];

  const homeN = normStr(HOME_TEAM);
  const awayN = normStr(AWAY_TEAM);

  const found = events.find(ev => {
    const h = normStr(ev?.strHomeTeam);
    const a = normStr(ev?.strAwayTeam);
    return h === homeN && a === awayN;
  });

  if (!found) {
    const data = makeFallback("NO ENCONTRADO");
    cache = { ts: now, data };
    return data;
  }

  const eventId = found?.idEvent;
  let details = null;
  try {
    const det = await fetchEventDetails(eventId);
    details = det?.events?.[0] || null;
  } catch {}

  const homeScore = Number(found?.intHomeScore ?? 0);
  const awayScore = Number(found?.intAwayScore ?? 0);

  const league = found?.strLeague || "Liga MX";
  const status = guessStatus(found);

  const homeLogo = details?.strHomeTeamBadge || "";
  const awayLogo = details?.strAwayTeamBadge || "";

  const homeGoals = parseGoalDetails(details?.strHomeGoalDetails, "home");
  const awayGoals = parseGoalDetails(details?.strAwayGoalDetails, "away");
  const goals = [...homeGoals, ...awayGoals].sort((a,b)=> (a.minute||0)-(b.minute||0));

  const data = {
    league,
    matchId: String(eventId || `${MATCH_DATE}-${HOME_TEAM}-${AWAY_TEAM}`),
    status,
    minute: null,
    home: {
      name: found?.strHomeTeam || HOME_TEAM,
      short: (found?.strHomeTeam || HOME_TEAM).slice(0,3).toUpperCase(),
      score: homeScore,
      logo: homeLogo
    },
    away: {
      name: found?.strAwayTeam || AWAY_TEAM,
      short: (found?.strAwayTeam || AWAY_TEAM).slice(0,3).toUpperCase(),
      score: awayScore,
      logo: awayLogo
    },
    goals,
    updatedAt: new Date().toISOString()
  };

  cache = { ts: now, data };
  return data;
}

app.get("/health", (req, res) => res.status(200).send("ok"));

app.get("/mx/match/current", async (req, res) => {
  try {
    const data = await getCurrentMatch();
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (e) {
    if (cache.data) return res.json({ ...cache.data, stale: true });
    res.status(503).json({ error: "upstream_unavailable", message: String(e?.message || e) });
  }
});

app.listen(PORT, () => console.log("Running on", PORT));
