// Separate, unsigned Store submission artifact. Never publishes or registers it locally.
const { build, Platform, Arch } = require("electron-builder");
const { createRequire } = require("node:module");
const { mkdir, writeFile } = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { existsSync, readdirSync } = require("node:fs");

async function main() {
  const preview = process.argv.includes("--preview");
  const identity = preview ? {
    name: "JanjaLive.StorePreview",
    publisher: "CN=00000000-0000-0000-0000-000000000000",
    displayName: "JanjaLive Preview",
  } : {
    name: process.env.STORE_IDENTITY_NAME,
    publisher: process.env.STORE_PUBLISHER,
    displayName: process.env.STORE_PUBLISHER_DISPLAY_NAME,
  };
  if (!identity.name || !identity.publisher || !identity.displayName) {
    throw new Error("Copy Product identity from Partner Center into STORE_IDENTITY_NAME, STORE_PUBLISHER and STORE_PUBLISHER_DISPLAY_NAME. Use --preview only for local packaging validation.");
  }
  if (!/^[A-Za-z0-9.-]{3,50}$/.test(identity.name) || !identity.publisher.startsWith("CN=") ||
      [identity.publisher, identity.displayName].some((value) => /[<>&'"\r\n]/.test(value))) {
    throw new Error("Invalid Store identity: copy the exact Partner Center values; XML special characters require explicit packaging support.");
  }
  const root = path.resolve(__dirname, "..");
  // Prefer the installed Windows SDK; all required assets are supplied below.
  const sdkRoot = path.join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Windows Kits", "10", "bin");
  if (!process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH && existsSync(sdkRoot)) {
    const sdk = readdirSync(sdkRoot).filter((name) => /^10\.0\.\d+\.0$/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((name) => path.join(sdkRoot, name, "x64"))
      .find((directory) => existsSync(path.join(directory, "makeappx.exe")));
    if (sdk) process.env.ELECTRON_BUILDER_WINDOWS_KITS_PATH = sdk;
  }
  const output = path.join(root, "dist", preview ? "store-preview" : "store");
  const resources = path.join(output, "resources");
  await mkdir(path.join(resources, "appx"), { recursive: true });
  const nextRequire = createRequire(require.resolve("next/package.json", { paths: [path.resolve(root, "../..")] }));
  const sharp = nextRequire("sharp");
  const logo = path.resolve(root, "../../public/web-app-manifest-512x512.png");
  for (const [name, width, height] of [
    ["StoreLogo", 50, 50], ["Square150x150Logo", 150, 150],
    ["Square44x44Logo", 44, 44], ["Wide310x150Logo", 310, 150],
  ]) {
    await sharp(logo).resize(width, height, { fit: "contain", background: "#0b0b0b" })
      .png().toFile(path.join(resources, "appx", `${name}.png`));
  }
  await build({
    projectDir: root,
    targets: Platform.WINDOWS.createTarget(["appx"], Arch.x64),
    publish: "never",
    config: {
      extends: path.join(root, "electron-builder.yml"),
      directories: { output, buildResources: resources },
      publish: null,
      forceCodeSigning: false,
      // Supported stable tool bundle; legacy bundle extraction needs symlink privileges.
      toolsets: { winCodeSign: "1.1.0" },
      win: { artifactName: `JanjaLive-Store${preview ? "-PREVIEW" : ""}-\${version}-\${arch}.\${ext}` },
      appx: {
        identityName: identity.name, publisher: identity.publisher,
        publisherDisplayName: identity.displayName,
        applicationId: "JanjaLive", displayName: preview ? "JanjaLive Preview" : "JanjaLive",
        backgroundColor: "#0b0b0b", languages: ["pt-BR"],
        minVersion: "10.0.19041.0", maxVersionTested: "10.0.26100.0",
        capabilities: ["runFullTrust", "internetClient", "privateNetworkClientServer"],
        electronUpdaterAware: false,
      },
    },
  });
  const version = require("../package.json").version;
  const artifact = path.join(output, `JanjaLive-Store${preview ? "-PREVIEW" : ""}-${version}-x64.appx`);
  execFileSync(process.execPath, [path.join(__dirname, "verify-fuses.mjs"), path.join(output, "win-unpacked", "JanjaLive.exe")], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, [path.join(__dirname, "verify-package-contents.mjs"), path.join(output, "win-unpacked", "resources", "app.asar")], { cwd: root, stdio: "inherit" });
  execFileSync("powershell.exe", ["-NoProfile", "-File", path.join(__dirname, "verify-store.ps1"), "-PackagePath", artifact], { cwd: root, stdio: "inherit" });
  await writeFile(path.join(output, "BUILD-NOTES.txt"), preview
    ? "LOCAL PACKAGING PREVIEW ONLY. Placeholder identity. Do not upload or distribute. Not signed or installed.\n"
    : "Unsigned Store submission package. Must be certified and signed by Microsoft. Audience is configured in Partner Center, not in this file.\n");
}
main().catch((error) => { console.error(error.stack ?? error.message); process.exit(1); });
