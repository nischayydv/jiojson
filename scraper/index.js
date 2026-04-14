const axios = require("axios");
const fs = require("fs");

const STREAM_URL = "https://pocket-tv-tamil-5afe35.gitlab.io/jiostar.m3u";
const OUTPUT_FILE = "stream.json";
const CONCURRENCY = 50; // simultaneous key fetches

// Semaphore to limit concurrency
function createPool(limit) {
  let active = 0;
  const queue = [];
  const run = async (fn, resolve, reject) => {
    active++;
    try { resolve(await fn()); }
    catch (e) { reject(e); }
    finally {
      active--;
      if (queue.length) {
        const next = queue.shift();
        run(next.fn, next.resolve, next.reject);
      }
    }
  };
  return (fn) => new Promise((resolve, reject) => {
    if (active < limit) run(fn, resolve, reject);
    else queue.push({ fn, resolve, reject });
  });
}

async function fetchKey(pool, keyUrl) {
  return pool(async () => {
    try {
      const res = await axios.get(keyUrl, {
        timeout: 5000,
        responseType: "text",
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      return res.data.trim();
    } catch {
      return null;
    }
  });
}

function parseM3U(text) {
  const lines = text.split("\n");
  const entries = [];
  let cur = {};

  for (const line of lines) {
    const t = line.trim();
    if (!t || t === "#EXTM3U") continue;

    if (t.startsWith("#EXTINF:")) {
      cur = {};
      cur.tvgId   = (t.match(/tvg-id="(\d+)"/)        || [])[1] || null;
      cur.group   = (t.match(/group-title="([^"]+)"/)  || [])[1] || null;
      cur.logo    = (t.match(/tvg-logo="([^"]+)"/)     || [])[1] || null;
      cur.channel = (t.match(/,(.*)$/)                 || [])[1]?.trim() || null;
    }
    else if (t.startsWith("#KODIPROP:inputstream.adaptive.license_key=")) {
      cur.keyUrl = t.substring(t.indexOf("=") + 1).trim();
    }
    else if (t.startsWith("#EXTVLCOPT:http-user-agent=")) {
      const ua = t.split("=").slice(1).join("=").trim();
      cur.userAgent = ua === "@allinone_reborn" ? null : ua;
    }
    else if (cur.tvgId && t.startsWith("http")) {
      cur.url = t;
      entries.push({ ...cur });
      cur = {};
    }
  }
  return entries;
}

async function fetchAndSaveJson() {
  const t0 = Date.now();
  console.log("📡 Fetching M3U playlist...");

  const response = await axios.get(STREAM_URL, { responseType: "text" });
  const entries = parseM3U(response.data);
  console.log(`✅ Parsed ${entries.length} channels in ${Date.now() - t0}ms`);

  console.log(`🔑 Fetching all keys with concurrency=${CONCURRENCY}...`);
  const t1 = Date.now();

  const pool = createPool(CONCURRENCY);
  let done = 0;

  const resolved = await Promise.all(
    entries.map(async (entry) => {
      const key = entry.keyUrl ? await fetchKey(pool, entry.keyUrl) : null;
      done++;
      process.stdout.write(`\r   ${done}/${entries.length} keys fetched...`);
      return { ...entry, key };
    })
  );

  console.log(`\n⚡ All keys fetched in ${Date.now() - t1}ms`);

  const result = {};
  for (const e of resolved) {
    result[e.tvgId] = {
      key_url:      e.keyUrl || null,
      key:          e.key,
      url:          e.url,
      group_title:  e.group,
      tvg_logo:     e.logo,
      channel_name: e.channel,
      user_agent:   e.userAgent || null
    };
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf-8");
  console.log(`\n✅ stream.json saved — ${Object.keys(result).length} channels in ${Date.now() - t0}ms total`);
}

fetchAndSaveJson().catch(err => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
