const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const express = require("express");
const { wordpressAutomationRouter } = require("./routes/wordpressAutomation");

const app = express();
const publicDirectory = path.join(process.cwd(), "public");
const deployResultPath = path.join(publicDirectory, "deploy-v2-result.txt");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDirectory));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "wordpress-playwright-backend",
    timestamp: new Date().toISOString(),
  });
});

const DEFAULT_DEPLOY_TOKEN = "CRON-WP-DEPLOY-x7QzK9pM2bNv8sTj-rYdHgVcXwFkLqA5e-uMaRcWoNiPfSU3EkO-Z4hB1aD-6jGn";
function resolveDeployToken() {
  const fromEnv = String(process.env.DEPLOY_TOKEN || "").trim();
  return fromEnv || DEFAULT_DEPLOY_TOKEN;
}

let deployInProgress = false;

function writeResult(line, append = true) {
  try {
    fs.mkdirSync(publicDirectory, { recursive: true });
    const payload = (append ? fs.readFileSync(deployResultPath, "utf8").catch(() => "") : "") + line + "\n";
    fs.writeFileSync(deployResultPath, payload);
  } catch {}
}

app.get("/api/ops/deploy-v2", (req, res) => {
  const token = String(req.query.token || "").trim();
  if (token !== resolveDeployToken()) {
    return res.status(401).json({ ok: false, message: "Token salah. Isi query ?token= dengan DEPLOY_TOKEN env." });
  }
  const force = String(req.query.force || "").toLowerCase() === "1";
  if (deployInProgress && !force) {
    return res.status(409).json({ ok: false, message: "Deploy lagi jalanin bos. Cek /deploy-v2-result.txt sebentar lagi." });
  }
  deployInProgress = true;
  const DEPLOY_SCRIPT = `
set -eo pipefail
START_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[${START_AT}] ===== Deploy v2 STARTED (pid $$) ====="
echo "CWD: $(pwd)"
echo "==== Step 1: Backup .env ===="
[ -f .env ] && cp -a .env "/tmp/.env.pre-deploy-v2.$(date +%s).bak" && echo "Backup .env OK"
ENV_BAK=/tmp/.env.cronwp2.bak.1786154926
if [ -f "$ENV_BAK" ]; then cp -a "$ENV_BAK" .env && echo "Restore backup .env OK"; fi
grep -q "FILEMOON_API_TOKEN=" .env 2>/dev/null || echo "FILEMOON_API_TOKEN=1422761k8705mb5sqz0dmz" >> .env
echo "==== Step 2: Git fetch origin v2 + reset hard ===="
git fetch origin v2 --depth=80 2>&1 | tail -n 6
git reset --hard origin/v2 2>&1 | tail -n 6
echo "HEAD COMMIT: $(git rev-parse --short HEAD)  (branch: $(git rev-parse --abbrev-ref HEAD))"
echo "==== Step 3: npm install + rebuild better-sqlite3 ===="
npm install --no-audit --no-fund --omit=dev 2>&1 | tail -n 10
npm rebuild better-sqlite3 2>&1 | tail -n 4 || true
echo "==== Step 4: PM2 restart cron-wp --update-env ===="
( pm2 restart cron-wp --update-env 2>&1 || (pm2 delete cron-wp 2>/dev/null; PORT=3001 pm2 start src/server.js --name cron-wp --update-env --no-daemon 2>&1) ) | tail -n 8
echo "==== Step 5: Wait PM2 + Health check ===="
sleep 6
curl -sS --max-time 12 http://127.0.0.1:3001/health || true
echo
echo "==== Step 6: Post-test: URL /e/ie7gvv62vb0f ep8 checkOnly=true ===="
P1='{"filemoonUrl":"https://bysezejataos.com/e/ie7gvv62vb0f/drakorid-720p-the-apartment-job-2026-ep8","downloadUrl":"https://bysezejataos.com/e/ie7gvv62vb0f/drakorid-720p-the-apartment-job-2026-ep8","submitAction":"publish","checkOnly":true,"tmdbId":300727}'
curl -sS --max-time 200 -X POST http://127.0.0.1:3001/api/wordpress/v2/process-filemoon-url -H 'Content-Type: application/json' -d "$P1"
echo
echo "==== Step 7: Post-test: URL /d/ie7gvv62vb0f ep8 checkOnly=true ===="
P2='{"filemoonUrl":"https://bysezejataos.com/d/ie7gvv62vb0f/drakorid-720p-the-apartment-job-2026-ep8","downloadUrl":"https://bysezejataos.com/d/ie7gvv62vb0f/drakorid-720p-the-apartment-job-2026-ep8","submitAction":"publish","checkOnly":true,"tmdbId":300727}'
curl -sS --max-time 200 -X POST http://127.0.0.1:3001/api/wordpress/v2/process-filemoon-url -H 'Content-Type: application/json' -d "$P2"
echo
END_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[${END_AT}] ===== Deploy v2 DONE ====="
  `.trim();
  const scriptPath = "/tmp/cron-wp-deploy-v2.sh";
  try {
    fs.mkdirSync(publicDirectory, { recursive: true });
    fs.writeFileSync(deployResultPath, `[${new Date().toISOString()}] Deploy v2 trigger received. Running background...\n`);
    fs.writeFileSync(scriptPath, DEPLOY_SCRIPT);
    fs.chmodSync(scriptPath, 0o755);
    const outFd = fs.openSync(deployResultPath, "a");
    const child = spawn("bash", [scriptPath], {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", outFd, outFd],
      env: { ...process.env, FORCE_COLOR: "0" },
    });
    child.unref();
    fs.closeSync(outFd);
    res.status(200).json({
      ok: true,
      message: "Deploy v2 dijalankan background (pid " + child.pid + "). Cek result file: /deploy-v2-result.txt dalam 2-4 menit.",
      pid: child.pid,
      resultUrl: "/deploy-v2-result.txt",
      tokenHint: "token sudah benar ✅",
    });
    setTimeout(() => { deployInProgress = false; }, 5 * 60 * 1000);
  } catch (e) {
    deployInProgress = false;
    console.error("Deploy v2 spawn error:", e);
    return res.status(500).json({ ok: false, message: "Deploy script spawn error: " + e.message });
  }
});

app.use("/api/wordpress", wordpressAutomationRouter);

app.use((error, _req, res, _next) => {
  console.error("Unhandled error:", error);

  res.status(500).json({
    ok: false,
    message: error.message || "Internal server error",
  });
});

module.exports = { app };
