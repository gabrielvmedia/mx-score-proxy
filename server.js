import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

const API_KEY = process.env.API_FOOTBALL_KEY;
const BASE_URL = "https://v3.football.api-sports.io";
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 12000);

const TEAM_ALIASES = {
  monterrey: 2282,
  rayados: 2282,
  "cruz-azul": 2295,
  cruzazul: 2295,
  america: 2289,
  "club-america": 2289,
  tigres: 2283,
  pumas: 2291,
  chivas: 2286,
  guadalajara: 2286
};

const cache = new Map();

function getCache(key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return item.data;
}

function setCache(key, data) {
  cache.set(key, { ts: Date.now(), data });
}

function mapStatus(short) {
  const s = String(short || "").toUpperCase();
  if (s === "HT") return "HT";
  if (["FT", "AET", "PEN"].includes(s)) return "FT";
  if (s === "NS") return "NS";
  if (["1H", "2H", "ET", "BT", "P"].includes(s)) return "LIVE";
  return s || "—";
}

async function apiFetch(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${BASE_URL}${path}?${qs}`;

  const res = await fetch(url, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }

  return res.json();
}

function normalizeMatch(match) {
  return {
    league: match?.league?.name || "",
    matchId: match?.fixture?.id || null,
    status: mapStatus(match?.fixture?.status?.short),
    minute: match?.fixture?.status?.elapsed ?? null,
    date: match?.fixture?.date || null,
    home: {
      name: match?.teams?.home?.name || "",
      short: (match?.teams?.home?.name || "").slice(0, 3).toUpperCase(),
      score: match?.goals?.home ?? 0,
      logo: match?.teams?.home?.logo || ""
    },
    away: {
      name: match?.teams?.away?.name || "",
      short: (match?.teams?.away?.name || "").slice(0, 3).toUpperCase(),
      score: match?.goals?.away ?? 0,
      logo: match?.teams?.away?.logo || ""
    },
    updatedAt: new Date().toISOString()
  };
}

async function findCurrentOrNextMatchByTeam(teamId) {
  const cacheKey = `team-${teamId}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const liveData = await apiFetch("/fixtures", {
    team: teamId,
    live: "all",
    timezone: "America/Mexico_City"
  });

  if (liveData.response && liveData.response.length > 0) {
    const match = normalizeMatch(liveData.response[0]);
    setCache(cacheKey, match);
    return match;
  }

  const nextData = await apiFetch("/fixtures", {
    team: teamId,
    next: 1,
    timezone: "America/Mexico_City"
  });

  if (nextData.response && nextData.response.length > 0) {
    const match = normalizeMatch(nextData.response[0]);
    setCache(cacheKey, match);
    return match;
  }

  const lastData = await apiFetch("/fixtures", {
    team: teamId,
    last: 1,
    timezone: "America/Mexico_City"
  });

  if (lastData.response && lastData.response.length > 0) {
    const match = normalizeMatch(lastData.response[0]);
    setCache(cacheKey, match);
    return match;
  }

  return {
    league: "",
    matchId: null,
    status: "NO MATCH",
    minute: null,
    date: null,
    home: { name: "", short: "", score: 0, logo: "" },
    away: { name: "", short: "", score: 0, logo: "" },
    updatedAt: new Date().toISOString()
  };
}

function resolveTeamId(teamParam) {
  if (!teamParam) return null;

  if (/^\d+$/.test(teamParam)) {
    return Number(teamParam);
  }

  const normalized = String(teamParam).toLowerCase().trim();
  return TEAM_ALIASES[normalized] || null;
}

app.get("/health", (req, res) => {
  res.send("ok");
});

app.get("/mx/match/current", async (req, res) => {
  return res.status(400).json({
    error: "deprecated_route",
    message: "Usa /mx/match/team/:team en lugar de /mx/match/current"
  });
});

app.get("/mx/match/team/:team", async (req, res) => {
  try {
    const teamId = resolveTeamId(req.params.team);

    if (!teamId) {
      return res.status(400).json({
        error: "invalid_team",
        message: "Equipo no reconocido. Usa un ID o alias válido."
      });
    }

    const data = await findCurrentOrNextMatchByTeam(teamId);
    res.set("Cache-Control", "no-store");
    res.json(data);
  } catch (error) {
    res.status(500).json({
      error: "upstream_unavailable",
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
fix team endpoint syntax
