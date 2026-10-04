import path from "node:path";
import {
  FuseState,
  FuseV1Options,
  FuseVersion,
  getCurrentFuseWire,
} from "@electron/fuses";

const executable = path.resolve(
  process.cwd(),
  process.argv[2] ?? "dist/win-unpacked/JanjaLive.exe",
);

const expectedFuses = [
  [FuseV1Options.RunAsNode, FuseState.DISABLE],
  [FuseV1Options.EnableCookieEncryption, FuseState.ENABLE],
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable, FuseState.DISABLE],
  [FuseV1Options.EnableNodeCliInspectArguments, FuseState.DISABLE],
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation, FuseState.ENABLE],
  [FuseV1Options.OnlyLoadAppFromAsar, FuseState.ENABLE],
  [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot, FuseState.DISABLE],
  [FuseV1Options.GrantFileProtocolExtraPrivileges, FuseState.DISABLE],
  [FuseV1Options.WasmTrapHandlers, FuseState.ENABLE],
];

const fuseStateName = (state) => FuseState[state] ?? `UNKNOWN(${state})`;

const fuseWire = await getCurrentFuseWire(executable);
const failures = [];

if (fuseWire.version !== FuseVersion.V1) {
  failures.push(`version: expected ${FuseVersion.V1}, received ${fuseWire.version}`);
}

for (const [option, expected] of expectedFuses) {
  const actual = fuseWire[option];
  if (actual !== expected) {
    failures.push(
      `${FuseV1Options[option]}: expected ${fuseStateName(expected)}, received ${fuseStateName(actual)}`,
    );
  }
}

if (failures.length > 0) {
  throw new Error(`Packaged Electron fuse verification failed:\n- ${failures.join("\n- ")}`);
}

console.log(`Verified ${expectedFuses.length} Electron fuses in ${executable}`);
