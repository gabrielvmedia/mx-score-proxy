import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

const API_KEY = process.env.API_FOOTBALL_KEY;
const FIXTURE_ID = process.env.FIXTURE_ID;
const BASE_URL = "https://v3.football.api-sports.io";

async function fetchFixture() {
  const url = `${BASE_URL}/fixtures?id=${FIXTURE_ID}`;
  const res = await fetch(url, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });

  if (!res.ok) {
    throw new Error(`API error ${res.status}`);
  }

  const data = await res.json();
  return data.response[0];
}

app.get("/health", (req, res) => {
  res.send("ok");
});

app.get("/mx/match/current", async (req, res) => {
  try {
    const match = await fetchFixture();

    const response = {
      league: match.league.name,
      status: match.fixture.status.short,
      minute: match.fixture.status.elapsed,
      home: {
        name: match.teams.home.name,
        short: match.teams.home.name.slice(0,3).toUpperCase(),
        score: match.goals.home
      },
      away: {
        name: match.teams.away.name,
        short: match.teams.away.name.slice(0,3).toUpperCase(),
        score: match.goals.away
      },
      updatedAt: new Date().toISOString()
    };

    res.json(response);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
update api football integration
