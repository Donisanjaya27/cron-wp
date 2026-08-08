const {
  buildFilemoonEmbedUrl,
  buildFilemoonPageUrl,
  buildFilemoonWatchUrl,
  extractFilemoonFileIdFromUrl,
  resolveFilemoonMediaLinks,
} = require("./krakenFilenameParser");

function getFilemoonApiBaseUrl() {
  return (
    process.env.FILEMOON_API_BASE_URL ||
    process.env.BYSE_API_BASE_URL ||
    "https://api.byse.sx/"
  );
}

function getFilemoonApiToken(payload = {}) {
  return String(
    payload.filemoonApiToken ||
      process.env.FILEMOON_API_TOKEN ||
      process.env.BYSE_API_KEY ||
      "",
  ).trim();
}

async function fetchFilemoonJson(pathname, payload = {}, extraParams = {}) {
  const token = getFilemoonApiToken(payload);
  if (!token) {
    throw new Error("FILEMOON_API_TOKEN belum diisi.");
  }

  const baseUrl = getFilemoonApiBaseUrl().replace(/\/$/, "");
  const cleanPath = String(pathname || "").replace(/^\/+/, "");
  const url = new URL(`${baseUrl}/${cleanPath}`);
  url.searchParams.set("key", token);
  for (const [k, v] of Object.entries(extraParams || {})) {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));

  const success =
    data?.success === true ||
    data?.status === 200 ||
    (response.ok && data && typeof data === "object" && !data?.error);
  if (!response.ok || data?.success === false || data?.status === 401) {
    throw new Error(
      data?.msg ||
        data?.message ||
        data?.error ||
        `Filemoon API gagal: ${response.status} ${response.statusText}`,
    );
  }

  return data;
}

async function fetchFilemoonFileInfo(fileId, payload = {}) {
  const result = await fetchFilemoonJson("/file/info", payload, {
    file_code: fileId,
  });
  return (
    result?.data ||
    result?.result ||
    (result?.success === true ? result : null) ||
    null
  );
}

function normalizeFilemoonInfoUrls(fileId, fileInfo = {}, baseDomainHint) {
  const urls = fileInfo?.urls || {};

  return {
    page: urls.page || buildFilemoonPageUrl(fileId, baseDomainHint),
    watch: urls.watch || buildFilemoonWatchUrl(fileId, baseDomainHint),
    embed: urls.embed || buildFilemoonEmbedUrl(fileId, baseDomainHint),
  };
}

async function resolveFilemoonSource(payload = {}) {
  const rawUrl =
    payload.filemoonUrl ||
    payload.downloadUrl ||
    payload.watchUrl ||
    payload.embedUrl ||
    "";
  const fileId =
    payload.filemoonFileId ||
    extractFilemoonFileIdFromUrl(rawUrl) ||
    extractFilemoonFileIdFromUrl(payload.downloadUrl) ||
    extractFilemoonFileIdFromUrl(payload.watchUrl) ||
    extractFilemoonFileIdFromUrl(payload.embedUrl);

  if (!fileId && !payload.fileName && !payload.filename) {
    throw new Error(
      "`filemoonUrl`, `downloadUrl`, `watchUrl`, `embedUrl`, atau `filemoonFileId` wajib diisi.",
    );
  }

  const baseDomainHint = rawUrl;
  const fileInfo = fileId ? await fetchFilemoonFileInfo(fileId, payload) : null;
  const urls = normalizeFilemoonInfoUrls(fileId, fileInfo, baseDomainHint);
  const mediaLinks = resolveFilemoonMediaLinks({
    fileId,
    baseDomain: baseDomainHint,
    downloadUrl: payload.downloadUrl || payload.filemoonUrl || urls.page,
    watchUrl: payload.watchUrl || urls.watch,
    embedUrl: payload.embedUrl || urls.embed,
    embedCode: payload.embedCode,
  });
  const fileName =
    payload.fileName ||
    payload.filename ||
    fileInfo?.filename ||
    fileInfo?.name ||
    "";

  return {
    fileId: mediaLinks.fileId,
    fileName,
    mediaLinks,
    fileInfo: fileInfo
      ? {
          id: fileInfo.id,
          name: fileInfo.name,
          filename: fileInfo.filename,
          allowOnlineWatch: fileInfo.allow_online_watch,
          visibility: fileInfo.visibility,
          urls,
        }
      : null,
  };
}

module.exports = {
  extractFilemoonFileIdFromUrl,
  fetchFilemoonFileInfo,
  resolveFilemoonSource,
};
