const express = require("express");
const axios = require("axios");
const app = express();

const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = "v3.football.api-sports.io";
const TEAM_SEARCH = process.env.TEAM_SEARCH || "Tigres";
const TIMEZONE = process.env.TIMEZONE || "America/Monterrey";

const api = axios.create({
  baseURL: `https://${API_HOST}`,
  headers: {
    "x-apisports-key": API_KEY,
  },
  timeout: 15000,
});

let TIGRES_TEAM_ID = null;

// 🔎 Obtener ID de Tigres automáticamente
async function getTeamId() {
  if (TIGRES_TEAM_ID) return TIGRES_TEAM_ID;

  const res = await api.get("/teams", {
    params: { search: TEAM_SEARCH },
  });

  const team = res.data.response[0];
  TIGRES_TEAM_ID = team.team.id;

  console.log("✅ Team ID encontrado:", TIGRES_TEAM_ID);

  return TIGRES_TEAM_ID;
}

// 🟢 Endpoint principal (live o siguiente)
app.get("/api/tigres/live-or-next", async (req, res) => {
  try {
    const teamId = await getTeamId();

    // 1. Buscar partidos en vivo
    const liveResp = await api.get("/fixtures", {
      params: { live: "all" },
    });

    const liveMatches = (liveResp.data.response || []).filter(
      (m) =>
        m.teams.home.id === teamId || m.teams.away.id === teamId
    );

    // ✅ SI HAY PARTIDO EN VIVO
    if (liveMatches.length > 0) {
      const match = liveMatches[0];

      // eventos
      const eventsResp = await api.get("/fixtures/events", {
        params: { fixture: match.fixture.id },
      });

      return res.json({
        mode: "live",
        match: formatMatch(match),
        events: eventsResp.data.response || [],
      });
    }

    // 🔵 SI NO HAY EN VIVO → siguiente partido
    const nextResp = await api.get("/fixtures", {
      params: {
        team: teamId,
        next: 1,
        timezone: TIMEZONE,
      },
    });

    const match = nextResp.data.response[0];

    return res.json({
      mode: "next",
      match: formatMatch(match),
      events: [],
    });
  } catch (err) {
    console.error(err.response?.data || err.message);

    res.status(500).json({
      error: err.response?.data || err.message,
    });
  }
});

// 🎯 Formatear datos para la pantalla
function formatMatch(match) {
  return {
    id: match.fixture.id,
    date: match.fixture.date,
    status: match.fixture.status.short,
    elapsed: match.fixture.status.elapsed,

    league: match.league.name,
    round: match.league.round,

    home: {
      name: match.teams.home.name,
      logo: match.teams.home.logo,
      goals: match.goals.home,
    },

    away: {
      name: match.teams.away.name,
      logo: match.teams.away.logo,
      goals: match.goals.away,
    },

    venue: match.fixture.venue.name,
  };
}

// 🧪 Test simple
app.get("/", (req, res) => {
  res.send("API Tigres funcionando");
});

app.listen(PORT, () => {
  console.log("🚀 Server corriendo en puerto", PORT);
});
