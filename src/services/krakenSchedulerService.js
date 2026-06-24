const { processPendingKrakenJobs } = require("./krakenJobService");

let schedulerHandle = null;
let schedulerRunning = false;

function getSchedulerIntervalMs() {
  const minutes = Number(process.env.KRAKEN_SCHEDULER_INTERVAL_MINUTES || 10);
  return Math.max(minutes, 1) * 60 * 1000;
}

async function runKrakenSchedulerTick() {
  if (schedulerRunning) {
    return {
      ok: true,
      skipped: true,
      reason: "Scheduler masih berjalan.",
    };
  }

  schedulerRunning = true;
  try {
    const result = await processPendingKrakenJobs({
      limit: Number(process.env.KRAKEN_SCHEDULER_BATCH_SIZE || 3),
      forceSync: false,
    });

    return {
      ok: true,
      skipped: false,
      ...result,
    };
  } finally {
    schedulerRunning = false;
  }
}

function startKrakenScheduler() {
  if (schedulerHandle || process.env.KRAKEN_SCHEDULER_ENABLED === "false") {
    return null;
  }

  const intervalMs = getSchedulerIntervalMs();
  schedulerHandle = setInterval(() => {
    runKrakenSchedulerTick().catch((error) => {
      console.error("Kraken scheduler error:", error);
    });
  }, intervalMs);

  if (typeof schedulerHandle.unref === "function") {
    schedulerHandle.unref();
  }

  return {
    intervalMs,
  };
}

module.exports = {
  runKrakenSchedulerTick,
  startKrakenScheduler,
};
