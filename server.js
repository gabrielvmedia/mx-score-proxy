import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = "v3.football.api-sports.io";
const TEAM_SEARCH = process.env.TEAM_SEARCH || "England";
const TIMEZONE = process.env.TIMEZONE || "America/Mexico_City";

const LIVE_CACHE_MS = Number(process.env.LIVE_CACHE_MS || 15000);
const NEXT_CACHE_MS = Number(process.env.NEXT_CACHE_MS || 60000);

const api = axios.create({
  baseURL: `https://${API_HOST}`,
  headers: {
    "x-apisports-key": API_KEY,
  },
  timeout: 15000,
});

let TEAM_ID = null;

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

async function getTeamId() {
  if (TEAM_ID) return TEAM_ID;

  const res = await api.get("/teams", {
    params: { search: TEAM_SEARCH },
  });

  if (!res.data.response || !res.data.response.length) {
    throw new Error(`No se encontró el equipo: ${TEAM_SEARCH}`);
  }

  const exact =
    res.data.response.find(
      (item) => item.team?.name?.toLowerCase() === TEAM_SEARCH.toLowerCase()
    ) || res.data.response[0];

  TEAM_ID = exact.team.id;
  return TEAM_ID;
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
  res.send("API funcionando");
});

app.get("/api/debug/team", async (req, res) => {
  try {
    const response = await api.get("/teams", {
      params: { search: TEAM_SEARCH },
    });

    res.json({
      configuredTeamSearch: TEAM_SEARCH,
      results: (response.data.response || []).map((item) => ({
        id: item.team?.id,
        name: item.team?.name,
        country: item.team?.country,
        code: item.team?.code,
      })),
    });
  } catch (err) {
    res.status(500).json({
      error: err.response?.data || err.message,
    });
  }
});

app.get("/api/logo", async (req, res) => {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).send("Falta url");
    }

    const response = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
    });

    const contentType = response.headers["content-type"] || "image/png";
    res.setHeader("Content-Type", contentType);
    res.send(response.data);
  } catch (err) {
    console.error("Error cargando logo:", err.message);
    res.status(500).send("No se pudo cargar el logo");
  }
});

app.get("/api/tigres/live-or-next", async (req, res) => {
  try {
    const teamId = await getTeamId();

    if (isCacheValid(liveCache)) {
      return res.json(liveCache.data);
    }

    const liveResp = await api.get("/fixtures", {
      params: { live: "all" },
    });

    const liveMatches = (liveResp.data.response || []).filter(
      (m) => m.teams?.home?.id === teamId || m.teams?.away?.id === teamId
    );

    if (liveMatches.length > 0) {
      const payload = {
        mode: "live",
        teamSearch: TEAM_SEARCH,
        match: formatMatch(liveMatches[0]),
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
        team: teamId,
        next: 1,
        timezone: TIMEZONE,
      },
    });

    const nextMatch = nextResp.data.response?.[0];

    const payload = {
      mode: nextMatch ? "next" : "none",
      teamSearch: TEAM_SEARCH,
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
  console.log(`TEAM_SEARCH: ${TEAM_SEARCH}`);
});
