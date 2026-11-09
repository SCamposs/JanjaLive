param([Parameter(Mandatory=$true)][string]$PackagePath, [string]$ComparePackagePath)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $PackagePath).Path)
try {
  $entry = $archive.GetEntry("AppxManifest.xml")
  if (!$entry) { throw "Package manifest missing" }
  $reader = [IO.StreamReader]::new($entry.Open())
  try { [xml]$manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
  if ($manifest.Package.Identity.ProcessorArchitecture -ne "x64") { throw "Unexpected architecture" }
  if ($env:STORE_IDENTITY_NAME -and $manifest.Package.Identity.Name -ne $env:STORE_IDENTITY_NAME) { throw "Store identity mismatch" }
  if ($env:STORE_PUBLISHER -and $manifest.Package.Identity.Publisher -ne $env:STORE_PUBLISHER) { throw "Store publisher mismatch" }
  if ($env:STORE_PUBLISHER_DISPLAY_NAME -and $manifest.Package.Properties.PublisherDisplayName -ne $env:STORE_PUBLISHER_DISPLAY_NAME) { throw "Store display name mismatch" }
  $version = (Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version
  if ($manifest.Package.Identity.Version -ne "$version.0") { throw "Store version mismatch" }
  if ($manifest.Package.Applications.Application.EntryPoint -ne "Windows.FullTrustApplication") { throw "Full trust application missing" }
  $protocols = @($manifest.SelectNodes("//*[local-name()='Protocol']") | ForEach-Object { $_.Name })
  if ($protocols -notcontains "janjalive") { throw "Login/invite protocol missing" }
  $capabilities = @($manifest.SelectNodes("//*[local-name()='Capabilities']/*") | ForEach-Object { $_.Name })
  if ($capabilities -notcontains "runFullTrust") { throw "Native helper capability missing" }
  if (@($capabilities | Where-Object { $_ -notin @("runFullTrust", "internetClient", "privateNetworkClientServer") }).Count) { throw "Unexpected capability" }
  foreach ($file in @("app/JanjaLive.exe", "app/resources/app.asar", "app/resources/app.asar.unpacked/native/audio-helper/bin/janjalive-audio-helper.exe", "app/resources/app.asar.unpacked/native/window-helper/bin/janjalive-window-helper.exe", "assets/StoreLogo.png", "assets/Square44x44Logo.png", "assets/Square150x150Logo.png", "assets/Wide310x150Logo.png")) {
    if (!$archive.GetEntry($file)) { throw "Missing package content: $file" }
  }
  if ($ComparePackagePath) {
    $original = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $ComparePackagePath).Path)
    try {
      foreach ($entry in $original.Entries) {
        if ($entry.FullName -in @('AppxBlockMap.xml', '[Content_Types].xml') -or $entry.FullName.EndsWith('/')) { continue }
        $repacked = $archive.GetEntry($entry.FullName)
        if (!$repacked) { throw "MSIX lost an entry: $($entry.FullName)" }
        $sha = [Security.Cryptography.SHA256]::Create()
        $left = $entry.Open(); $right = $repacked.Open()
        try {
          if ([Convert]::ToBase64String($sha.ComputeHash($left)) -ne [Convert]::ToBase64String($sha.ComputeHash($right))) { throw "MSIX changed application content: $($entry.FullName)" }
        } finally { $left.Dispose(); $right.Dispose(); $sha.Dispose() }
      }
    } finally { $original.Dispose() }
    Write-Output 'Verified unchanged manifest, assets and application content after MSIX repacking.'
  }
  Write-Output "Verified Store package: identity=$($manifest.Package.Identity.Name), version=$($manifest.Package.Identity.Version), protocol, capabilities, native helper and branded assets."
  Write-Output "This checks package structure, not Store certification or real audio/video operation."
} finally { $archive.Dispose() }
