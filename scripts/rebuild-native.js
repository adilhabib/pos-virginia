const { spawnSync } = require("child_process");

function run() {
  let electronVersion;
  try {
    electronVersion = require("electron/package.json").version;
  } catch (err) {
    console.log("electron not installed yet; skipping native rebuild.");
    return;
  }

  const command =
    process.platform === "win32"
      ? `npm.cmd rebuild better-sqlite3 --runtime=electron --target=${electronVersion} --dist-url=https://electronjs.org/headers`
      : `npm rebuild better-sqlite3 --runtime=electron --target=${electronVersion} --dist-url=https://electronjs.org/headers`;

  console.log(`Rebuilding better-sqlite3 for electron@${electronVersion}...`);
  const result = spawnSync(command, { stdio: "inherit", shell: true });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run();
