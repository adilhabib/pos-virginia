const fs = require("fs");
const path = require("path");
require("dotenv").config();

function candidates() {
  const out = [];
  out.push(path.join(__dirname, "..", "local-db.json"));
  if (process.env.APPDATA) out.push(path.join(process.env.APPDATA, "virginia-pos", "local-db.json"));
  return Array.from(new Set(out));
}

function run() {
  const files = candidates();
  let removed = 0;
  for (const fp of files) {
    if (!fs.existsSync(fp)) continue;
    fs.unlinkSync(fp);
    removed += 1;
    console.log(`Removed: ${fp}`);
  }
  if (!removed) {
    console.log("No local database file found.");
    return;
  }
  console.log("Local data reset complete.");
}

try {
  run();
} catch (e) {
  console.error("Local reset failed:", e.message || e);
  process.exit(1);
}
