const fs = require("fs/promises");
const path = require("path");

async function ensureDirectory(directoryPath) {
  await fs.mkdir(directoryPath, { recursive: true });
}

function buildArtifactPath(fileName) {
  return path.join(process.cwd(), "artifacts", "screenshots", fileName);
}

module.exports = {
  ensureDirectory,
  buildArtifactPath,
};
