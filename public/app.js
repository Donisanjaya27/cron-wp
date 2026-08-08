const form = document.getElementById("episode-form");
const submitButton = document.getElementById("submitButton");
const fillExampleButton = document.getElementById("fillExampleButton");
const resultOutput = document.getElementById("resultOutput");
const statusPill = document.getElementById("statusPill");
const modeLabel = document.getElementById("modeLabel");
const postTypeField = document.getElementById("postType");
const episodeOnlyFields = document.getElementById("episodeOnlyFields");
const submitActionField = document.getElementById("submitAction");
const touchTvRow = document.getElementById("touchTvRow");
const providerTabs = Array.from(document.querySelectorAll(".provider-tab"));
const providerPanes = Array.from(
  document.querySelectorAll("[data-provider-pane]"),
);

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

const providerConfigs = {
  kraken: {
    label: "Kraken",
    form: document.getElementById("kraken-form"),
    modeLabel: document.getElementById("krakenModeLabel"),
    logOutput: document.getElementById("krakenLogOutput"),
    submitButton: document.getElementById("krakenSubmitButton"),
    exampleButton: document.getElementById("krakenExampleButton"),
    enqueueButton: document.getElementById("krakenEnqueueButton"),
    processPendingButton: document.getElementById("krakenProcessPendingButton"),
    syncSitemapButton: document.getElementById("krakenSyncSitemapButton"),
    listJobsButton: document.getElementById("krakenListJobsButton"),
    processEndpoint: "/api/wordpress/v2/process-kraken-url",
    enqueueEndpoint: "/api/wordpress/v2/jobs/enqueue",
    processPendingEndpoint: "/api/wordpress/v2/jobs/process-pending",
    listJobsEndpoint: "/api/wordpress/v2/jobs?limit=20",
    sourceKey: "krakenSource",
    examplePayload: {
      url: "https://krakenfiles.com/view/aVRl627NTQ/file.html",
      submitAction: "publish",
      checkOnly: false,
    },
    readPayload() {
      const formData = new FormData(this.form);
      const url = String(formData.get("krakenUrl") || "").trim();

      return {
        krakenUrl: url,
        downloadUrl: url,
        submitAction: String(formData.get("krakenSubmitAction") || "publish"),
        checkOnly: document.getElementById("krakenCheckOnly").checked,
      };
    },
    fillExample() {
      this.form.elements.namedItem("krakenUrl").value = this.examplePayload.url;
      this.form.elements.namedItem("krakenSubmitAction").value =
        this.examplePayload.submitAction;
      document.getElementById("krakenCheckOnly").checked =
        this.examplePayload.checkOnly;
      this.modeLabel.textContent = "Contoh Kraken dimuat";
      writeProviderLog("kraken", "Contoh URL Kraken sudah dimasukkan.");
    },
  },
  filemoon: {
    label: "Filemoon",
    form: document.getElementById("filemoon-form"),
    modeLabel: document.getElementById("filemoonModeLabel"),
    logOutput: document.getElementById("filemoonLogOutput"),
    submitButton: document.getElementById("filemoonSubmitButton"),
    exampleButton: document.getElementById("filemoonExampleButton"),
    enqueueButton: document.getElementById("filemoonEnqueueButton"),
    processPendingButton: document.getElementById(
      "filemoonProcessPendingButton",
    ),
    syncSitemapButton: document.getElementById("filemoonSyncSitemapButton"),
    listJobsButton: document.getElementById("filemoonListJobsButton"),
    processEndpoint: "/api/wordpress/v2/process-filemoon-url",
    enqueueEndpoint: "/api/wordpress/v2/filemoon/jobs/enqueue",
    processPendingEndpoint: "/api/wordpress/v2/filemoon/jobs/process-pending",
    listJobsEndpoint: "/api/wordpress/v2/filemoon/jobs?limit=20",
    sourceKey: "filemoonSource",
    examplePayload: {
      url: "https://bysezejataos.com/d/fru1i2weqr2f/drakorid-720p-the-husband-2026-ep3",
      tmdbId: 239901,
      seasonNumber: 1,
      episodeNumber: 3,
      submitAction: "publish",
      checkOnly: false,
    },
    readPayload() {
      const formData = new FormData(this.form);
      const url = String(formData.get("filemoonUrl") || "").trim();
      const tmdbIdRaw = formData.get("filemoonTmdbId");
      const seasonRaw = formData.get("filemoonSeasonNumber");
      const episodeRaw = formData.get("filemoonEpisodeNumber");
      const tmdbApiKeyRaw = formData.get("filemoonTmdbApiKey");
      const tmdbId = tmdbIdRaw ? Number(tmdbIdRaw) : undefined;
      const seasonNumber = seasonRaw ? Number(seasonRaw) : undefined;
      const episodeNumber = episodeRaw ? Number(episodeRaw) : undefined;
      const tmdbApiKey = tmdbApiKeyRaw ? String(tmdbApiKeyRaw).trim() : "";

      const payload = {
        filemoonUrl: url,
        downloadUrl: url,
        submitAction: String(formData.get("filemoonSubmitAction") || "publish"),
        checkOnly: document.getElementById("filemoonCheckOnly").checked,
      };
      if (tmdbId && Number.isInteger(tmdbId) && tmdbId >= 1) {
        payload.tmdbId = tmdbId;
      }
      if (seasonNumber && Number.isInteger(seasonNumber) && seasonNumber >= 1) {
        payload.seasonNumber = seasonNumber;
      }
      if (episodeNumber && Number.isInteger(episodeNumber) && episodeNumber >= 1) {
        payload.episodeNumber = episodeNumber;
      }
      if (tmdbApiKey) {
        payload.tmdbApiKey = tmdbApiKey;
      }
      return payload;
    },
    fillExample() {
      this.form.elements.namedItem("filemoonUrl").value =
        this.examplePayload.url;
      this.form.elements.namedItem("filemoonTmdbId").value =
        this.examplePayload.tmdbId;
      this.form.elements.namedItem("filemoonSeasonNumber").value =
        this.examplePayload.seasonNumber;
      this.form.elements.namedItem("filemoonEpisodeNumber").value =
        this.examplePayload.episodeNumber;
      const existingTmdbApiKey =
        this.form.elements.namedItem("filemoonTmdbApiKey").value || "";
      if (!existingTmdbApiKey && typeof this.examplePayload.tmdbApiKey === "string" && this.examplePayload.tmdbApiKey) {
        this.form.elements.namedItem("filemoonTmdbApiKey").value = this.examplePayload.tmdbApiKey;
      }
      this.form.elements.namedItem("filemoonSubmitAction").value =
        this.examplePayload.submitAction;
      document.getElementById("filemoonCheckOnly").checked =
        this.examplePayload.checkOnly;
      this.modeLabel.textContent = "Contoh Filemoon dimuat";
      writeProviderLog("filemoon", "Contoh URL + TMDB ID Filemoon sudah dimasukkan.");
    },
  },
};

function setStatus(type, label) {
  statusPill.className = `status-pill ${type}`;
  statusPill.textContent = label;
}

function writeResult(content) {
  resultOutput.textContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function writeProviderLog(provider, content) {
  const config = providerConfigs[provider];
  config.logOutput.textContent =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function setProviderButtonsDisabled(provider, disabled) {
  const config = providerConfigs[provider];

  [
    config.submitButton,
    config.exampleButton,
    config.enqueueButton,
    config.processPendingButton,
    config.syncSitemapButton,
    config.listJobsButton,
  ].forEach((button) => {
    button.disabled = disabled;
  });
}

function togglePostTypeFields() {
  const isTv = postTypeField.value === "tv";

  episodeOnlyFields.hidden = isTv;
  submitActionField.value = isTv ? "publish" : "save";
  touchTvRow.hidden = isTv;

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
    touchLinkedTvShowAfterSave:
      document.getElementById("touchLinkedTv").checked,
    linkedTvDateMode: "publish-now",
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

function formatProviderLog(provider, result) {
  const config = providerConfigs[provider];
  const source = result[config.sourceKey] || result.source || null;
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
          linkedTvUpdate: result.episode.result?.linkedTvUpdate || null,
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

  if (result.episode?.result?.linkedTvUpdate) {
    lines.push("");
    lines.push("Update Tanggal TV:");
    lines.push(JSON.stringify(result.episode.result.linkedTvUpdate, null, 2));
  }

  lines.push("");
  lines.push("Response ringkas:");
  lines.push(
    JSON.stringify(
      {
        ok: result.ok,
        mode: result.mode,
        sourceProvider: result.sourceProvider || provider,
        source,
        parsedFile: result.parsedFile,
        tmdb: result.tmdb,
      },
      null,
      2,
    ),
  );

  return lines.join("\n");
}

function selectProviderTab(provider) {
  providerTabs.forEach((button) => {
    const active = button.dataset.provider === provider;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  providerPanes.forEach((pane) => {
    pane.hidden = pane.dataset.providerPane !== provider;
  });
}

function formatManualEpisodeResult(result) {
  const lines = [];

  if (result.executionLog && result.executionLog.length) {
    lines.push("Log proses:");
    result.executionLog.forEach((item, index) => {
      lines.push(`${index + 1}. ${item}`);
    });
    lines.push("");
  }

  lines.push(
    JSON.stringify(
      {
        ok: result.ok,
        finalUrl: result.finalUrl,
        submitAction: result.submitAction,
        posterFillResult: result.posterFillResult || null,
        featuredImageResult: result.featuredImageResult || null,
        resolvedTitles: result.resolvedTitles || null,
        linkedTvUpdate: result.linkedTvUpdate || null,
      },
      null,
      2,
    ),
  );

  if (result.featuredImageResult) {
    lines.push("");
    lines.push("Featured Image:");
    lines.push(JSON.stringify(result.featuredImageResult, null, 2));
  }

  if (result.linkedTvUpdate) {
    lines.push("");
    lines.push("Update Tanggal TV:");
    lines.push(JSON.stringify(result.linkedTvUpdate, null, 2));
  }

  return lines.join("\n");
}

function isPositiveFiniteInteger(value) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1
  );
}

function validateManualPayload(payload) {
  const errors = [];

  if (!isPositiveFiniteInteger(Number(payload.tmdbId))) {
    errors.push(
      `TMDB ID harus bilangan bulat positif (>= 1). Diterima: ${JSON.stringify(
        payload.tmdbId,
      )}`,
    );
  }

  if (payload.postType === "episode") {
    if (!isPositiveFiniteInteger(Number(payload.seasonNumber))) {
      errors.push(
        `Season harus bilangan bulat positif (>= 1). Diterima: ${JSON.stringify(
          payload.seasonNumber,
        )}`,
      );
    }
    if (!isPositiveFiniteInteger(Number(payload.episodeNumber))) {
      errors.push(
        `Episode harus bilangan bulat positif (>= 1). Diterima: ${JSON.stringify(
          payload.episodeNumber,
        )}`,
      );
    }
    if (!isPositiveFiniteInteger(Number(payload.serverNumber))) {
      errors.push(
        `Server harus bilangan bulat positif (>= 1). Diterima: ${JSON.stringify(
          payload.serverNumber,
        )}`,
      );
    }
    if (!isPositiveFiniteInteger(Number(payload.downloadNumber))) {
      errors.push(
        `Download Ke harus bilangan bulat positif (>= 1). Diterima: ${JSON.stringify(
          payload.downloadNumber,
        )}`,
      );
    }
    if (!payload.embedCode || !String(payload.embedCode).trim()) {
      errors.push("Kode Embed wajib diisi.");
    }
  }

  return errors;
}

async function submitEpisode(event) {
  event.preventDefault();

  const payload = readFormPayload();
  const validationErrors = validateManualPayload(payload);

  if (validationErrors && validationErrors.length) {
    setStatus("error", "Gagal");
    submitButton.disabled = false;
    writeResult({
      ok: false,
      message: "Form ada yang salah, perbaiki sebelum submit.",
      errors: validationErrors,
    });
    alert(validationErrors.join("\n"));
    return;
  }

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
    writeResult(formatManualEpisodeResult(result));
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

async function submitProvider(event, provider) {
  event.preventDefault();

  const config = providerConfigs[provider];
  const payload = config.readPayload();

  setProviderButtonsDisabled(provider, true);
  config.modeLabel.textContent = payload.checkOnly
    ? "Check Only"
    : payload.submitAction === "publish"
      ? "Publish"
      : "Save";
  writeProviderLog(provider, {
    message: `Mengirim request ${config.label} ke backend...`,
    endpoint: config.processEndpoint,
    payload,
  });

  try {
    const response = await fetch(config.processEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok || result.ok === false) {
      config.modeLabel.textContent = "Gagal";
      writeProviderLog(provider, result);
      return;
    }

    config.modeLabel.textContent = "Selesai";
    writeProviderLog(provider, formatProviderLog(provider, result));
  } catch (error) {
    config.modeLabel.textContent = "Error";
    writeProviderLog(provider, {
      ok: false,
      message: error.message,
    });
  } finally {
    setProviderButtonsDisabled(provider, false);
  }
}

async function postProviderAction(provider, endpoint, payload, statusLabel) {
  const config = providerConfigs[provider];

  setProviderButtonsDisabled(provider, true);
  config.modeLabel.textContent = statusLabel;
  writeProviderLog(provider, {
    message: `Mengirim request ${config.label} ke backend...`,
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
      config.modeLabel.textContent = "Gagal";
      writeProviderLog(provider, result);
      return;
    }

    config.modeLabel.textContent = "Selesai";
    writeProviderLog(provider, result);
  } catch (error) {
    config.modeLabel.textContent = "Error";
    writeProviderLog(provider, {
      ok: false,
      message: error.message,
    });
  } finally {
    setProviderButtonsDisabled(provider, false);
  }
}

async function enqueueProviderJob(provider) {
  const config = providerConfigs[provider];
  await postProviderAction(
    provider,
    config.enqueueEndpoint,
    config.readPayload(),
    "Enqueue",
  );
}

async function processPendingProviderJobs(provider) {
  const config = providerConfigs[provider];
  await postProviderAction(
    provider,
    config.processPendingEndpoint,
    { limit: 3 },
    "Process Pending",
  );
}

async function syncSitemapNow(provider) {
  await postProviderAction(
    provider,
    "/api/wordpress/v2/sync-sitemap",
    {},
    "Sync Sitemap",
  );
}

async function listProviderJobs(provider) {
  const config = providerConfigs[provider];

  setProviderButtonsDisabled(provider, true);
  config.modeLabel.textContent = "Lihat Queue";
  writeProviderLog(provider, `Mengambil daftar queue ${config.label}...`);

  try {
    const response = await fetch(config.listJobsEndpoint);
    const result = await response.json();

    if (!response.ok || result.ok === false) {
      config.modeLabel.textContent = "Gagal";
      writeProviderLog(provider, result);
      return;
    }

    config.modeLabel.textContent = "Queue";
    writeProviderLog(provider, result);
  } catch (error) {
    config.modeLabel.textContent = "Error";
    writeProviderLog(provider, {
      ok: false,
      message: error.message,
    });
  } finally {
    setProviderButtonsDisabled(provider, false);
  }
}

fillExampleButton.addEventListener("click", fillExample);
form.addEventListener("submit", submitEpisode);
postTypeField.addEventListener("change", togglePostTypeFields);

providerTabs.forEach((button) => {
  button.addEventListener("click", () => {
    selectProviderTab(button.dataset.provider);
  });
});

Object.entries(providerConfigs).forEach(([provider, config]) => {
  config.exampleButton.addEventListener("click", () => config.fillExample());
  config.enqueueButton.addEventListener("click", () =>
    enqueueProviderJob(provider),
  );
  config.processPendingButton.addEventListener("click", () =>
    processPendingProviderJobs(provider),
  );
  config.syncSitemapButton.addEventListener("click", () =>
    syncSitemapNow(provider),
  );
  config.listJobsButton.addEventListener("click", () =>
    listProviderJobs(provider),
  );
  config.form.addEventListener("submit", (event) =>
    submitProvider(event, provider),
  );
});

fillExample();
providerConfigs.kraken.fillExample();
providerConfigs.filemoon.fillExample();
togglePostTypeFields();
selectProviderTab("kraken");
