const axios = require("axios");
const fs = require("fs");

const STREAM_URL = "https://yowaimo.in/api/?key=sf_273199baba4b1dac7ae30eb617adef2d&format=json";
const OUTPUT_FILE = "stream.json";

async function fetchAndSaveJson() {
  try {
    const response = await axios.get(STREAM_URL);
    const data = response.data;

    const result = {};

    for (const channel of data.channels) {
      const licenseKey = channel.drm?.license_key || "";
      const [kid, key] = licenseKey.includes(":") ? licenseKey.split(":") : [null, null];
      const tvgId = channel.tvg_id || channel.name;
      const cleanUrl = channel.stream_url ? channel.stream_url.split("&xxx=")[0] : null;

      if (kid && key && tvgId) {
        result[tvgId] = {
          kid: kid,
          key: key,
          url: cleanUrl,
          group_title: channel.group || null,
          tvg_logo: channel.logo || null,
          channel_name: channel.name || null,
          user_agent: channel.http_headers?.["User-Agent"] || null
        };
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf-8");
    console.log("✅ stream.json saved successfully.");
  } catch (err) {
    console.error("❌ Failed to fetch M3U:", err.message);
    process.exit(1);
  }
}

fetchAndSaveJson();
