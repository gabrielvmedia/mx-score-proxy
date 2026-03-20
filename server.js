import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = "v3.football.api-sports.io";
const TEAM_SEARCH = process.env.TEAM_SEARCH || "Tigres UANL";
const TEAM_ID_ENV = process.env.TEAM_ID;
const TIMEZONE = process.env.TIMEZONE || "America/Monterrey";

const api = axios.create({
  baseURL: `https://${API_HOST}`,
  headers: {
    "x-apisports-key": API_KEY,
  },
  timeout: 15000,
});

let TEAM_ID = TEAM_ID_ENV ? Number(TEAM_ID_ENV) : null;

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
      (item) =>
        item.team?.name?.toLowerCase() === "tigres uanl" ||
        item.team?.code?.toLowerCase() === "tig"
    ) || res.data.response[0];

  TEAM_ID = exact.team.id;
  console.log("Team ID encontrado:", TEAM_ID, exact.team.name);

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
      name: match.teams?.home?.name,
      logo: match.teams?.home?.logo,
      goals: match.goals?.home,
    },
    away: {
      name: match.teams?.away?.name,
      logo: match.teams?.away?.logo,
      goals: match.goals?.away,
    },
    venue: match.fixture?.venue?.name,
  };
}

app.get("/", (req, res) => {
  res.send("API Tigres funcionando");
});

app.get("/api/tigres/live-or-next", async (req, res) => {
  try {
    const teamId = await getTeamId();

    const liveResp = await api.get("/fixtures", {
      params: { live: "all" },
    });

    const liveMatches = (liveResp.data.response || []).filter(
      (m) => m.teams?.home?.id === teamId || m.teams?.away?.id === teamId
    );

    if (liveMatches.length > 0) {
      const match = liveMatches[0];

      const eventsResp = await api.get("/fixtures/events", {
        params: { fixture: match.fixture.id },
      });

      return res.json({
        mode: "live",
        teamId,
        match: formatMatch(match),
        events: eventsResp.data.response || [],
      });
    }

    const nextResp = await api.get("/fixtures", {
      params: {
        team: teamId,
        next: 1,
        timezone: TIMEZONE,
      },
    });

    const nextMatch = nextResp.data.response?.[0];

    if (!nextMatch) {
      return res.json({
        mode: "none",
        teamId,
        match: null,
        events: [],
      });
    }

    return res.json({
      mode: "next",
      teamId,
      match: formatMatch(nextMatch),
      events: [],
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({
      error: err.response?.data || err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
