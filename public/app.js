const form = document.getElementById("episode-form");
const submitButton = document.getElementById("submitButton");
const fillExampleButton = document.getElementById("fillExampleButton");
const resultOutput = document.getElementById("resultOutput");
const statusPill = document.getElementById("statusPill");
const modeLabel = document.getElementById("modeLabel");
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

function setStatus(type, label) {
  statusPill.className = `status-pill ${type}`;
  statusPill.textContent = label;
}

function writeResult(content) {
  resultOutput.textContent =
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

fillExampleButton.addEventListener("click", fillExample);
form.addEventListener("submit", submitEpisode);
postTypeField.addEventListener("change", togglePostTypeFields);

fillExample();
togglePostTypeFields();
