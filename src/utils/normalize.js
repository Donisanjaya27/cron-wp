function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSlug(value) {
  return normalizeText(value).replace(/\s+/g, "-");
}

function humanizeSlug(value) {
  return String(value || "")
    .replace(/\.[^.]+$/, "")
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((token) => {
      if (/^\d+$/.test(token)) {
        return token;
      }

      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(" ");
}

module.exports = {
  humanizeSlug,
  normalizeSlug,
  normalizeText,
};
