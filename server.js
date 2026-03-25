import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = "v3.football.api-sports.io";
const TEAM_SEARCH = process.env.TEAM_SEARCH || "Tigres UANL";
const TEAM_ID = Number(process.env.TEAM_ID || 2279);
const TIMEZONE = process.env.TIMEZONE || "America/Monterrey";

const LIVE_CACHE_MS = Number(process.env.LIVE_CACHE_MS || 15000); // 15 seg
const NEXT_CACHE_MS = Number(process.env.NEXT_CACHE_MS || 60000); // 60 seg

const api = axios.create({
  baseURL: `https://${API_HOST}`,
  headers: {
    "x-apisports-key": API_KEY,
  },
  timeout: 15000,
});

let liveCache = {
  data: null,
  expiresAt: 0,
};

let nextCache = {
  data: null,
  expiresAt: 0,
};

function isCacheValid(cache) {
  return cache.data && Date.now() < cache.expiresAt;
}

function formatMatch(match) {
  return {
    id: match.fixture?.id,
    date: match.fixture?.date,
    status: match.fixture?.status?.short,
    elapsed: match.fixture?.status?.elapsed,
    league: match.league?.name,
    round: match.league?.round,
    home: {
      id: match.teams?.home?.id,
      name: match.teams?.home?.name,
      logo: match.teams?.home?.logo,
      goals: match.goals?.home,
    },
    away: {
      id: match.teams?.away?.id,
      name: match.teams?.away?.name,
      logo: match.teams?.away?.logo,
      goals: match.goals?.away,
    },
    venue: match.fixture?.venue?.name,
  };
}

app.get("/", (req, res) => {
  res.send("API Tigres funcionando con cache");
});

app.get("/api/tigres/live-or-next", async (req, res) => {
  try {
    if (isCacheValid(liveCache)) {
      return res.json(liveCache.data);
    }

    const liveResp = await api.get("/fixtures", {
      params: { live: "all" },
    });

    const liveMatches = (liveResp.data.response || []).filter(
      (m) => m.teams?.home?.id === TEAM_ID || m.teams?.away?.id === TEAM_ID
    );

    if (liveMatches.length > 0) {
      const match = liveMatches[0];

      const payload = {
        mode: "live",
        teamId: TEAM_ID,
        teamSearch: TEAM_SEARCH,
        cached: true,
        cacheForMs: LIVE_CACHE_MS,
        match: formatMatch(match),
      };

      liveCache = {
        data: payload,
        expiresAt: Date.now() + LIVE_CACHE_MS,
      };

      nextCache = {
        data: null,
        expiresAt: 0,
      };

      return res.json(payload);
    }

    if (isCacheValid(nextCache)) {
      return res.json(nextCache.data);
    }

    const nextResp = await api.get("/fixtures", {
      params: {
        team: TEAM_ID,
        next: 1,
        timezone: TIMEZONE,
      },
    });

    const nextMatch = nextResp.data.response?.[0];

    const payload = {
      mode: nextMatch ? "next" : "none",
      teamId: TEAM_ID,
      teamSearch: TEAM_SEARCH,
      cached: true,
      cacheForMs: NEXT_CACHE_MS,
      match: nextMatch ? formatMatch(nextMatch) : null,
    };

    nextCache = {
      data: payload,
      expiresAt: Date.now() + NEXT_CACHE_MS,
    };

    liveCache = {
      data: null,
      expiresAt: 0,
    };

    return res.json(payload);
  } catch (err) {
    console.error("Error API:", err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`TEAM_ID: ${TEAM_ID}`);
  console.log(`TEAM_SEARCH: ${TEAM_SEARCH}`);
  console.log(`TIMEZONE: ${TIMEZONE}`);
  console.log(`LIVE_CACHE_MS: ${LIVE_CACHE_MS}`);
  console.log(`NEXT_CACHE_MS: ${NEXT_CACHE_MS}`);
});
