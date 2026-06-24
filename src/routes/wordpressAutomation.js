const express = require("express");
const {
  runEpisodeAutomation,
  runTvAutomation,
  runWordpressAutomation,
} = require("../services/wordpressAutomationService");

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

module.exports = {
  wordpressAutomationRouter,
};
