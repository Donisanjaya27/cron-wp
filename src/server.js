require("dotenv").config();

const { app } = require("./app");
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
});
