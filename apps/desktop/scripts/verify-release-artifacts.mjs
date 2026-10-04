import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
const distDir = path.resolve(packageRoot, process.argv[2] ?? "dist");
const metadataPath = path.join(distDir, "latest.yml");
const metadata = await readFile(metadataPath, "utf8");

const scalar = (value) => {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(['"])(.*)\1$/);
  return quoted ? quoted[2] : trimmed;
};

const topLevelValue = (key) => {
  const match = metadata.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, "m"));
  if (!match) throw new Error(`Missing ${key} in ${metadataPath}`);
  return scalar(match[1]);
};

const fileEntry = metadata.match(
  /^files:\s*\r?\n[ \t]*-[ \t]+url:\s*(.+?)\s*\r?\n[ \t]+sha512:\s*(\S+)\s*\r?\n[ \t]+size:\s*(\d+)\s*$/m,
);
if (!fileEntry) throw new Error(`Invalid files entry in ${metadataPath}`);

const expectedInstaller = `JanjaLive-Setup-${packageJson.version}.exe`;
const expectedBlockmap = `${expectedInstaller}.blockmap`;
const declaredVersion = topLevelValue("version");
const declaredPath = topLevelValue("path");
const declaredHash = topLevelValue("sha512");
const listedPath = scalar(fileEntry[1]);
const listedHash = fileEntry[2];
const listedSize = Number(fileEntry[3]);

if (declaredVersion !== packageJson.version) {
  throw new Error(`Update metadata version ${declaredVersion} does not match package version ${packageJson.version}`);
}
if (declaredPath !== expectedInstaller || listedPath !== expectedInstaller) {
  throw new Error(`Update metadata must reference only ${expectedInstaller}`);
}
if (declaredHash !== listedHash) {
  throw new Error("Top-level and files-entry SHA-512 values differ");
}

const installerPath = path.join(distDir, expectedInstaller);
const installer = await readFile(installerPath);
const installerStats = await stat(installerPath);
const actualHash = createHash("sha512").update(installer).digest("base64");
if (installerStats.size !== listedSize) {
  throw new Error(`Installer size ${installerStats.size} does not match metadata size ${listedSize}`);
}
if (actualHash !== declaredHash) {
  throw new Error("Installer SHA-512 does not match latest.yml");
}

const blockmapStats = await stat(path.join(distDir, expectedBlockmap));
if (!blockmapStats.isFile() || blockmapStats.size === 0) {
  throw new Error(`Missing or empty ${expectedBlockmap}`);
}

console.log(`Verified ${expectedInstaller}, ${expectedBlockmap}, and latest.yml for ${packageJson.version}`);
