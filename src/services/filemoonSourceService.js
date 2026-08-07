const {
  buildFilemoonEmbedUrl,
  buildFilemoonPageUrl,
  buildFilemoonWatchUrl,
  extractFilemoonFileIdFromUrl,
  resolveFilemoonMediaLinks,
} = require("./krakenFilenameParser");

function getFilemoonApiBaseUrl() {
  return process.env.FILEMOON_API_BASE_URL || "https://filemoon.org/api/v1";
}

function getFilemoonApiToken(payload = {}) {
  return String(
    payload.filemoonApiToken || process.env.FILEMOON_API_TOKEN || "",
  ).trim();
}

async function fetchFilemoonJson(pathname, payload = {}) {
  const token = getFilemoonApiToken(payload);
  if (!token) {
    throw new Error("FILEMOON_API_TOKEN belum diisi.");
  }

  const baseUrl = getFilemoonApiBaseUrl().replace(/\/$/, "");
  const cleanPath = String(pathname || "").replace(/^\/+/, "");
  const url = new URL(`${baseUrl}/${cleanPath}`);
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success === false) {
    throw new Error(
      data?.message ||
        `Filemoon API gagal: ${response.status} ${response.statusText}`,
    );
  }

  return data;
}

async function fetchFilemoonFileInfo(fileId, payload = {}) {
  const result = await fetchFilemoonJson(`/files/${fileId}`, payload);
  return result.data || null;
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
