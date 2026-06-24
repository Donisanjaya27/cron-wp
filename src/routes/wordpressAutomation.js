const express = require("express");
const {
  runEpisodeAutomation,
  runTvAutomation,
  runWordpressAutomation,
} = require("../services/wordpressAutomationService");
const { processKrakenUpload } = require("../services/wordpressV2Service");
const {
  enqueueKrakenJob,
  listKrakenJobs,
  processPendingKrakenJobs,
  syncSitemapNow,
} = require("../services/krakenJobService");

const wordpressAutomationRouter = express.Router();

wordpressAutomationRouter.post("/run", async (req, res, next) => {
  try {
    const result = await runWordpressAutomation(req.body);
    const statusCode = result.ok ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
});

wordpressAutomationRouter.post("/episode", async (req, res, next) => {
  try {
    const result = await runEpisodeAutomation(req.body);
    const statusCode = result.ok ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
});

wordpressAutomationRouter.post("/tv", async (req, res, next) => {
  try {
    const result = await runTvAutomation(req.body);
    const statusCode = result.ok ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
});

wordpressAutomationRouter.post("/v2/process-file", async (req, res, next) => {
  try {
    const result = await processKrakenUpload(req.body);
    const statusCode = result.ok ? 200 : 400;

    res.status(statusCode).json(result);
  } catch (error) {
    next(error);
  }
});

wordpressAutomationRouter.post(
  "/v2/process-kraken-url",
  async (req, res, next) => {
    try {
      const result = await processKrakenUpload(req.body);
      const statusCode = result.ok ? 200 : 400;

      res.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  },
);

wordpressAutomationRouter.post("/v2/jobs/enqueue", async (req, res, next) => {
  try {
    const job = await enqueueKrakenJob(req.body);

    res.status(200).json({
      ok: true,
      message: "Job Kraken masuk ke queue.",
      job,
    });
  } catch (error) {
    next(error);
  }
});

wordpressAutomationRouter.get("/v2/jobs", async (req, res, next) => {
  try {
    const jobs = await listKrakenJobs({
      limit: Number(req.query.limit || 20),
    });

    res.status(200).json({
      ok: true,
      jobs,
    });
  } catch (error) {
    next(error);
  }
});

wordpressAutomationRouter.post(
  "/v2/jobs/process-pending",
  async (req, res, next) => {
    try {
      const result = await processPendingKrakenJobs({
        limit: Number(req.body.limit || 3),
        forceSync: Boolean(req.body.forceSync),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

wordpressAutomationRouter.post("/v2/sync-sitemap", async (_req, res, next) => {
  try {
    const result = await syncSitemapNow();

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = {
  wordpressAutomationRouter,
};
