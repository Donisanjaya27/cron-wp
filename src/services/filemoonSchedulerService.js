const { processPendingFilemoonJobs } = require("./filemoonJobService");

let schedulerHandle = null;
let schedulerRunning = false;

function getSchedulerIntervalMs() {
  const minutes = Number(process.env.FILEMOON_SCHEDULER_INTERVAL_MINUTES || 10);
  return Math.max(minutes, 1) * 60 * 1000;
}

async function runFilemoonSchedulerTick() {
  if (schedulerRunning) {
    return {
      ok: true,
      skipped: true,
      reason: "Scheduler masih berjalan.",
    };
  }

  schedulerRunning = true;
  try {
    const result = await processPendingFilemoonJobs({
      limit: Number(process.env.FILEMOON_SCHEDULER_BATCH_SIZE || 3),
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

function startFilemoonScheduler() {
  if (schedulerHandle || process.env.FILEMOON_SCHEDULER_ENABLED === "false") {
    return null;
  }

  const intervalMs = getSchedulerIntervalMs();
  schedulerHandle = setInterval(() => {
    runFilemoonSchedulerTick().catch((error) => {
      console.error("Filemoon scheduler error:", error);
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
  runFilemoonSchedulerTick,
  startFilemoonScheduler,
};
