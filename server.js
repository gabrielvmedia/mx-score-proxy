import express from "express";

const app = express();
const PORT = process.env.PORT || 8080;

const API_KEY = process.env.API_FOOTBALL_KEY;
const FIXTURE_ID = process.env.FIXTURE_ID;
const BASE_URL = "https://v3.football.api-sports.io";

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 12000);

let cache = { ts: 0, data: null };

function mapStatus(short) {
  const s = String(short || "").toUpperCase();
  if (s === "HT") return "HT";
  if (["FT","AET","PEN"].includes(s)) return "FT";
  if (s === "NS") return "NS";
  if (["1H","2H","ET"].includes(s)) return "LIVE";
  return s || "—";
}

async function fetchFixture() {

  const url = `${BASE_URL}/fixtures?id=${FIXTURE_ID}&timezone=America/Mexico_City`;

  const r = await fetch(url, {
    headers: {
      "x-apisports-key": API_KEY
    }
  });

  if (!r.ok) throw new Error(`API HTTP ${r.status}`);

  return r.json();
}

function normalize(payload) {

  const item = payload?.response?.[0];

  const home = item?.teams?.home || {};
  const away = item?.teams?.away || {};

  return {

    league: item?.league?.name || "Liga MX",

    matchId: item?.fixture?.id,

    status: mapStatus(item?.fixture?.status?.short),

    minute: item?.fixture?.status?.elapsed ?? null,

    home: {
      name: home?.name,
      short: (home?.name || "").slice(0,3).toUpperCase(),
      score: item?.goals?.home ?? 0,
      logo: home?.logo
    },

    away: {
      name: away?.name,
      short: (away?.name || "").slice(0,3).toUpperCase(),
      score: item?.goals?.away ?? 0,
      logo: away?.logo
    },

    updatedAt: new Date().toISOString()
  };

}

async function getData() {

  const now = Date.now();

  if (cache.data && (now - cache.ts) < CACHE_TTL_MS) {
    return cache.data;
  }

  const raw = await fetchFixture();
  const data = normalize(raw);

  cache = { ts: now, data };

  return data;

}

app.get("/health", (req,res)=> res.send("ok"));

app.get("/mx/match/current", async (req,res) => {

  try {

    const data = await getData();

    res.set("Cache-Control","no-store");

    res.json(data);

  } catch (e) {

    if (cache.data) {
      return res.json({ ...cache.data, stale: true });
    }

    res.status(503).json({
      error: "upstream_unavailable",
      message: String(e?.message || e)
    });

  }

});

app.listen(PORT, ()=> console.log("Running on", PORT));
