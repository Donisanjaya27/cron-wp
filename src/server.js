require("dotenv").config();

const { app } = require("./app");
const { startFilemoonScheduler } = require("./services/filemoonSchedulerService");
const { startKrakenScheduler } = require("./services/krakenSchedulerService");

const port = Number(process.env.PORT || 3000);

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);

  const schedulerInfo = startKrakenScheduler();
  if (schedulerInfo) {
    console.log(
      `Kraken scheduler aktif tiap ${Math.round(schedulerInfo.intervalMs / 60000)} menit`,
    );
  }

  const filemoonSchedulerInfo = startFilemoonScheduler();
  if (filemoonSchedulerInfo) {
    console.log(
      `Filemoon scheduler aktif tiap ${Math.round(filemoonSchedulerInfo.intervalMs / 60000)} menit`,
    );
  }
});
