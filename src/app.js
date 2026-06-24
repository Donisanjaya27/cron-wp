const path = require("path");
const express = require("express");
const { wordpressAutomationRouter } = require("./routes/wordpressAutomation");

const app = express();
const publicDirectory = path.join(process.cwd(), "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDirectory));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "wordpress-playwright-backend",
    timestamp: new Date().toISOString(),
  });
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
