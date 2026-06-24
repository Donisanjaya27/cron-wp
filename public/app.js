const form = document.getElementById("episode-form");
const krakenForm = document.getElementById("kraken-form");
const submitButton = document.getElementById("submitButton");
const fillExampleButton = document.getElementById("fillExampleButton");
const krakenSubmitButton = document.getElementById("krakenSubmitButton");
const krakenExampleButton = document.getElementById("krakenExampleButton");
const krakenEnqueueButton = document.getElementById("krakenEnqueueButton");
const krakenProcessPendingButton = document.getElementById(
  "krakenProcessPendingButton",
);
const krakenSyncSitemapButton = document.getElementById(
  "krakenSyncSitemapButton",
);
const krakenListJobsButton = document.getElementById("krakenListJobsButton");
const resultOutput = document.getElementById("resultOutput");
const krakenLogOutput = document.getElementById("krakenLogOutput");
const statusPill = document.getElementById("statusPill");
const modeLabel = document.getElementById("modeLabel");
const krakenModeLabel = document.getElementById("krakenModeLabel");
const postTypeField = document.getElementById("postType");
const episodeOnlyFields = document.getElementById("episodeOnlyFields");

const examplePayload = {
  postType: "episode",
  tmdbId: 292696,
  seasonNumber: 1,
  episodeNumber: 30,
  serverNumber: 1,
  downloadNumber: 1,
  submitAction: "save",
  dryRun: false,
  serverTitle: "",
  downloadTitle: "",
  downloadUrl: "https://krakenfiles.com/view/aVRl627NTQ/file.html",
  embedCode:
    '<iframe height="360" width="640" frameBorder="0" allowfullscreen="true" webkitallowfullscreen="true" mozallowfullscreen="true" src="https://krakenfiles.com/embed-video/aVRl627NTQ"></iframe>',
};
const krakenExamplePayload = {
  krakenUrl: "https://krakenfiles.com/view/aVRl627NTQ/file.html",
  submitAction: "save",
  checkOnly: false,
};

function setStatus(type, label) {
  statusPill.className = `status-pill ${type}`;
  statusPill.textContent = label;
}

function writeResult(content) {
  resultOutput.textContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function writeKrakenLog(content) {
  krakenLogOutput.textContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function togglePostTypeFields() {
  const isTv = postTypeField.value === "tv";

  episodeOnlyFields.hidden = isTv;

  const fields = episodeOnlyFields.querySelectorAll("input, textarea, select");
  fields.forEach((field) => {
    if (field.name === "submitAction") {
      return;
    }

    if (field.tagName === "TEXTAREA") {
      field.required = !isTv;
      return;
    }

    if (
      [
        "seasonNumber",
        "episodeNumber",
        "serverNumber",
        "downloadNumber",
      ].includes(field.name)
    ) {
      field.required = !isTv;
    }
  });
}

function readFormPayload() {
  const formData = new FormData(form);
  const postType = formData.get("postType");

  const basePayload = {
    postType,
    tmdbId: Number(formData.get("tmdbId")),
    submitAction: formData.get("submitAction"),
    dryRun: document.getElementById("dryRun").checked,
  };

  if (postType === "tv") {
    return basePayload;
  }

  return {
    ...basePayload,
    seasonNumber: Number(formData.get("seasonNumber")),
    episodeNumber: Number(formData.get("episodeNumber")),
    serverNumber: Number(formData.get("serverNumber")),
    downloadNumber: Number(formData.get("downloadNumber")),
    serverTitle: String(formData.get("serverTitle") || "").trim(),
    downloadTitle: String(formData.get("downloadTitle") || "").trim(),
    downloadUrl: String(formData.get("downloadUrl") || "").trim(),
    embedCode: String(formData.get("embedCode") || ""),
  };
}

function fillExample() {
  Object.entries(examplePayload).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);

    if (!field) {
      return;
    }

    if (field.type === "checkbox") {
      field.checked = Boolean(value);
      return;
    }

    field.value = value;
  });

  setStatus("idle", "Siap");
  modeLabel.textContent = "Contoh dimuat";
  writeResult("Contoh payload sudah dimasukkan ke form.");
}

function readKrakenPayload() {
  const formData = new FormData(krakenForm);

  return {
    krakenUrl: String(formData.get("krakenUrl") || "").trim(),
    downloadUrl: String(formData.get("krakenUrl") || "").trim(),
    submitAction: String(formData.get("krakenSubmitAction") || "save"),
    checkOnly: document.getElementById("krakenCheckOnly").checked,
  };
}

function fillKrakenExample() {
  krakenForm.elements.namedItem("krakenUrl").value =
    krakenExamplePayload.krakenUrl;
  krakenForm.elements.namedItem("krakenSubmitAction").value =
    krakenExamplePayload.submitAction;
  document.getElementById("krakenCheckOnly").checked =
    krakenExamplePayload.checkOnly;

  krakenModeLabel.textContent = "Contoh Kraken dimuat";
  writeKrakenLog("Contoh URL Kraken sudah dimasukkan.");
}

function setKrakenButtonsDisabled(disabled) {
  [
    krakenSubmitButton,
    krakenExampleButton,
    krakenEnqueueButton,
    krakenProcessPendingButton,
    krakenSyncSitemapButton,
    krakenListJobsButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
}

function formatKrakenLog(result) {
  const lines = [];

  if (Array.isArray(result.processLog) && result.processLog.length) {
    lines.push("Log proses:");
    result.processLog.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  if (result.tv) {
    lines.push("");
    lines.push("TV:");
    lines.push(
      JSON.stringify(
        {
          created: result.tv.created,
          skipped: result.tv.skipped,
          reason: result.tv.reason,
          existing: result.tv.existing?.slug || null,
        },
        null,
        2,
      ),
    );
  }

  if (result.episode) {
    lines.push("");
    lines.push("Episode:");
    lines.push(
      JSON.stringify(
        {
          created: result.episode.created,
          skipped: result.episode.skipped,
          reason: result.episode.reason,
          existing: result.episode.existing?.slug || null,
        },
        null,
        2,
      ),
    );
  }

  if (result.tv?.result?.executionLog?.length) {
    lines.push("");
    lines.push("Log WordPress TV:");
    result.tv.result.executionLog.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  if (result.episode?.result?.executionLog?.length) {
    lines.push("");
    lines.push("Log WordPress Episode:");
    result.episode.result.executionLog.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
  }

  lines.push("");
  lines.push("Response ringkas:");
  lines.push(
    JSON.stringify(
      {
        ok: result.ok,
        mode: result.mode,
        krakenSource: result.krakenSource,
        parsedFile: result.parsedFile,
        tmdb: result.tmdb,
      },
      null,
      2,
    ),
  );

  return lines.join("\n");
}

async function submitEpisode(event) {
  event.preventDefault();

  const payload = readFormPayload();
  const mode = payload.dryRun
    ? "Dry run"
    : payload.submitAction === "publish"
      ? "Publish"
      : "Save";
  const endpoint =
    payload.postType === "tv" ? "/api/wordpress/tv" : "/api/wordpress/episode";

  submitButton.disabled = true;
  setStatus("loading", "Proses");
  modeLabel.textContent = `${payload.postType.toUpperCase()} - ${mode}`;
  writeResult({
    message: "Mengirim request ke backend...",
    endpoint,
    payload,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || result.ok === false) {
      setStatus("error", "Gagal");
      writeResult(result);
      return;
    }

    setStatus("success", "Berhasil");
    writeResult(result);
  } catch (error) {
    setStatus("error", "Error");
    writeResult({
      ok: false,
      message: error.message,
    });
  } finally {
    submitButton.disabled = false;
  }
}

async function submitKraken(event) {
  event.preventDefault();

  const payload = readKrakenPayload();
  const endpoint = "/api/wordpress/v2/process-kraken-url";

  setKrakenButtonsDisabled(true);
  krakenModeLabel.textContent = payload.checkOnly
    ? "Check Only"
    : payload.submitAction === "publish"
      ? "Publish"
      : "Save";
  writeKrakenLog({
    message: "Mengirim request Kraken ke backend...",
    endpoint,
    payload,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || result.ok === false) {
      krakenModeLabel.textContent = "Gagal";
      writeKrakenLog(result);
      return;
    }

    krakenModeLabel.textContent = "Selesai";
    writeKrakenLog(formatKrakenLog(result));
  } catch (error) {
    krakenModeLabel.textContent = "Error";
    writeKrakenLog({
      ok: false,
      message: error.message,
    });
  } finally {
    setKrakenButtonsDisabled(false);
  }
}

async function postKrakenAction(endpoint, payload, statusLabel) {
  setKrakenButtonsDisabled(true);
  krakenModeLabel.textContent = statusLabel;
  writeKrakenLog({
    message: "Mengirim request Kraken ke backend...",
    endpoint,
    payload,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload || {}),
    });
    const result = await response.json();

    if (!response.ok || result.ok === false) {
      krakenModeLabel.textContent = "Gagal";
      writeKrakenLog(result);
      return;
    }

    krakenModeLabel.textContent = "Selesai";
    writeKrakenLog(result);
  } catch (error) {
    krakenModeLabel.textContent = "Error";
    writeKrakenLog({
      ok: false,
      message: error.message,
    });
  } finally {
    setKrakenButtonsDisabled(false);
  }
}

async function enqueueKrakenJob() {
  const payload = readKrakenPayload();

  await postKrakenAction("/api/wordpress/v2/jobs/enqueue", payload, "Enqueue");
}

async function processPendingKrakenJobs() {
  await postKrakenAction(
    "/api/wordpress/v2/jobs/process-pending",
    { limit: 3 },
    "Process Pending",
  );
}

async function syncSitemapNow() {
  await postKrakenAction("/api/wordpress/v2/sync-sitemap", {}, "Sync Sitemap");
}

async function listKrakenJobs() {
  setKrakenButtonsDisabled(true);
  krakenModeLabel.textContent = "Lihat Queue";
  writeKrakenLog("Mengambil daftar queue Kraken...");

  try {
    const response = await fetch("/api/wordpress/v2/jobs?limit=20");
    const result = await response.json();

    if (!response.ok || result.ok === false) {
      krakenModeLabel.textContent = "Gagal";
      writeKrakenLog(result);
      return;
    }

    krakenModeLabel.textContent = "Queue";
    writeKrakenLog(result);
  } catch (error) {
    krakenModeLabel.textContent = "Error";
    writeKrakenLog({
      ok: false,
      message: error.message,
    });
  } finally {
    setKrakenButtonsDisabled(false);
  }
}

fillExampleButton.addEventListener("click", fillExample);
krakenExampleButton.addEventListener("click", fillKrakenExample);
krakenEnqueueButton.addEventListener("click", enqueueKrakenJob);
krakenProcessPendingButton.addEventListener("click", processPendingKrakenJobs);
krakenSyncSitemapButton.addEventListener("click", syncSitemapNow);
krakenListJobsButton.addEventListener("click", listKrakenJobs);
form.addEventListener("submit", submitEpisode);
krakenForm.addEventListener("submit", submitKraken);
postTypeField.addEventListener("change", togglePostTypeFields);

fillExample();
fillKrakenExample();
togglePostTypeFields();
