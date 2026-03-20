import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

const API_KEY = process.env.API_FOOTBALL_KEY;
const API_HOST = "v3.football.api-sports.io";
const TEAM_SEARCH = process.env.TEAM_SEARCH || "Tigres UANL";
const TEAM_ID = Number(process.env.TEAM_ID || 2279);
const TIMEZONE = process.env.TIMEZONE || "America/Monterrey";

const api = axios.create({
  baseURL: `https://${API_HOST}`,
  headers: {
    "x-apisports-key": API_KEY,
  },
  timeout: 15000,
});

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
  res.send("API Tigres funcionando");
});

app.get("/api/debug/team", async (req, res) => {
  try {
    const response = await api.get("/teams", {
      params: { search: TEAM_SEARCH },
    });

    res.json({
      configuredTeamId: TEAM_ID,
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

app.get("/api/tigres/live-or-next", async (req, res) => {
  try {
    const liveResp = await api.get("/fixtures", {
      params: { live: "all" },
    });

    const liveMatches = (liveResp.data.response || []).filter(
      (m) => m.teams?.home?.id === TEAM_ID || m.teams?.away?.id === TEAM_ID
    );

    if (liveMatches.length > 0) {
      const match = liveMatches[0];

      const eventsResp = await api.get("/fixtures/events", {
        params: { fixture: match.fixture.id },
      });

      return res.json({
        mode: "live",
        teamId: TEAM_ID,
        teamSearch: TEAM_SEARCH,
        match: formatMatch(match),
        events: eventsResp.data.response || [],
      });
    }

    const nextResp = await api.get("/fixtures", {
      params: {
        team: TEAM_ID,
        next: 1,
        timezone: TIMEZONE,
      },
    });

    const nextMatch = nextResp.data.response?.[0];

    if (!nextMatch) {
      return res.json({
        mode: "none",
        teamId: TEAM_ID,
        teamSearch: TEAM_SEARCH,
        match: null,
        events: [],
      });
    }

    return res.json({
      mode: "next",
      teamId: TEAM_ID,
      teamSearch: TEAM_SEARCH,
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
