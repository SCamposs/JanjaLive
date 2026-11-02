param([Parameter(Mandatory=$true)][string]$PackagePath)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $PackagePath).Path)
try {
  $entry = $archive.GetEntry("AppxManifest.xml")
  if (!$entry) { throw "Package manifest missing" }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
  if ($manifest.Package.Identity.ProcessorArchitecture -ne "x64") { throw "Unexpected architecture" }
  if ($manifest.Package.Applications.Application.EntryPoint -ne "Windows.FullTrustApplication") { throw "Full trust application missing" }
  $protocols = @($manifest.SelectNodes("//*[local-name()='Protocol']") | ForEach-Object { $_.Name })
  if ($protocols -notcontains "janjalive") { throw "Login/invite protocol missing" }
  $capabilities = @($manifest.SelectNodes("//*[local-name()='Capabilities']/*") | ForEach-Object { $_.Name })
  if ($capabilities -notcontains "runFullTrust") { throw "Native helper capability missing" }
  if (@($capabilities | Where-Object { $_ -notin @("runFullTrust", "internetClient", "privateNetworkClientServer") }).Count) { throw "Unexpected capability" }
  foreach ($file in @("app/JanjaLive.exe", "app/resources/app.asar", "app/resources/app.asar.unpacked/native/audio-helper/bin/janjalive-audio-helper.exe", "assets/StoreLogo.png", "assets/Square44x44Logo.png", "assets/Square150x150Logo.png", "assets/Wide310x150Logo.png")) {
    if (!$archive.GetEntry($file)) { throw "Missing package content: $file" }
  }
  Write-Output "Verified Store package: identity=$($manifest.Package.Identity.Name), version=$($manifest.Package.Identity.Version), protocol, capabilities, native helper and branded assets."
  Write-Output "This checks package structure, not Store certification or real audio/video operation."
} finally { $archive.Dispose() }
