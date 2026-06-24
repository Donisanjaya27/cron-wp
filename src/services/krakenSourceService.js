const {
  buildKrakenDownloadUrl,
  buildKrakenEmbedUrl,
  extractKrakenFileIdFromUrl,
  resolveKrakenMediaLinks,
} = require("./krakenFilenameParser");

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractFileNameFromKrakenHtml(html) {
  const titleMatch = String(html || "").match(/<title>(.*?) - Krakenfiles\.com<\/title>/i);
  if (titleMatch?.[1]) {
    return decodeHtmlEntities(titleMatch[1]).trim();
  }

  const ogTitleMatch = String(html || "").match(
    /<meta\s+property="og:title"\s+content="([^"]+)"/i,
  );
  if (ogTitleMatch?.[1]) {
    return decodeHtmlEntities(ogTitleMatch[1]).trim();
  }

  return "";
}

async function fetchKrakenFileNameFromPublicPage({ fileId, downloadUrl, embedUrl }) {
  const resolvedDownloadUrl = downloadUrl || buildKrakenDownloadUrl(fileId);
  const resolvedEmbedUrl = embedUrl || buildKrakenEmbedUrl(fileId);
  const candidateUrls = [resolvedDownloadUrl, resolvedEmbedUrl].filter(Boolean);

  for (const candidateUrl of candidateUrls) {
    const response = await fetch(candidateUrl);
    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const fileName = extractFileNameFromKrakenHtml(html);
    if (fileName) {
      return fileName;
    }
  }

  return "";
}

async function resolveKrakenSource(payload = {}) {
  const rawUrl = payload.krakenUrl || payload.downloadUrl || payload.embedUrl || "";
  const fileId =
    payload.krakenFileId ||
    extractKrakenFileIdFromUrl(rawUrl) ||
    extractKrakenFileIdFromUrl(payload.downloadUrl) ||
    extractKrakenFileIdFromUrl(payload.embedUrl);
  const mediaLinks = resolveKrakenMediaLinks({
    fileId,
    downloadUrl: payload.downloadUrl || rawUrl,
    embedUrl: payload.embedUrl,
    embedCode: payload.embedCode,
  });
  const fileName =
    payload.fileName ||
    payload.filename ||
    (await fetchKrakenFileNameFromPublicPage({
      fileId: mediaLinks.fileId,
      downloadUrl: mediaLinks.downloadUrl,
      embedUrl: mediaLinks.embedUrl,
    }));

  return {
    fileId: mediaLinks.fileId,
    fileName,
    mediaLinks,
  };
}

module.exports = {
  extractFileNameFromKrakenHtml,
  fetchKrakenFileNameFromPublicPage,
  resolveKrakenSource,
};
