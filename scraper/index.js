const axios = require("axios");
const fs = require("fs");

const STREAM_URL = "https://elitebeam.shop/Jtv/AXQDcW/Playlist.m3u";
const OUTPUT_FILE = "stream.json";

async function fetchKey(keyUrl) {
  try {
    const res = await axios.get(keyUrl, { timeout: 8000, responseType: "text" });
    return res.data.trim();
  } catch (err) {
    console.warn(`⚠️  Could not fetch key from ${keyUrl}: ${err.message}`);
    return null;
  }
}

async function fetchAndSaveJson() {
  try {
    const response = await axios.get(STREAM_URL, { responseType: "text" });
    const lines = response.data.split("\n");
    const result = {};

    let currentKeyUrl = null;
    let currentTvgId = null;
    let currentGroup = null;
    let currentLogo = null;
    let currentChannel = null;
    let currentUserAgent = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Extract info from #EXTINF
      if (trimmed.startsWith("#EXTINF:")) {
        const tvgIdMatch = trimmed.match(/tvg-id="(\d+)"/);
        const groupMatch = trimmed.match(/group-title="([^"]+)"/);
        const logoMatch = trimmed.match(/tvg-logo="([^"]+)"/);
        const channelMatch = trimmed.match(/,(.*)$/);

        currentTvgId = tvgIdMatch ? tvgIdMatch[1] : null;
        currentGroup = groupMatch ? groupMatch[1] : null;
        currentLogo = logoMatch ? logoMatch[1] : null;
        currentChannel = channelMatch ? channelMatch[1].trim() : null;
      }

      // Extract the full license key URL (don't split it — it's a full URL)
      else if (trimmed.startsWith("#KODIPROP:inputstream.adaptive.license_key=")) {
        // Everything after the first '=' is the URL
        const eqIndex = trimmed.indexOf("=");
        currentKeyUrl = trimmed.substring(eqIndex + 1).trim();
      }

      // Extract user-agent
      else if (trimmed.startsWith("#EXTVLCOPT:http-user-agent=")) {
        currentUserAgent = trimmed.split("=").slice(1).join("=").trim();
        if (currentUserAgent === "@allinone_reborn") currentUserAgent = null;
      }

      // Stream URL — build the entry
      else if (currentTvgId && trimmed.startsWith("http") && !trimmed.startsWith("#")) {
        // Use the stream URL as-is (or strip duplicate query params if needed)
        const streamUrl = trimmed;

        console.log(`🔑 Fetching key for channel ${currentTvgId} (${currentChannel})...`);
        const fetchedKey = currentKeyUrl ? await fetchKey(currentKeyUrl) : null;

        result[currentTvgId] = {
          key_url: currentKeyUrl,          // original key endpoint
          key: fetchedKey,                 // actual key value fetched from URL
          url: streamUrl,
          group_title: currentGroup,
          tvg_logo: currentLogo,
          channel_name: currentChannel,
          user_agent: currentUserAgent
        };

        // Reset for next entry
        currentKeyUrl = null;
        currentTvgId = null;
        currentGroup = null;
        currentLogo = null;
        currentChannel = null;
        currentUserAgent = null;
      }
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), "utf-8");
    console.log(`\n✅ stream.json saved with ${Object.keys(result).length} channels.`);
  } catch (err) {
    console.error("❌ Failed to fetch M3U:", err.message);
    process.exit(1);
  }
}

fetchAndSaveJson();
