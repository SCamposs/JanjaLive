$ErrorActionPreference = "Stop"

$package = Get-Content (Join-Path $PSScriptRoot "..\package.json") -Raw | ConvertFrom-Json
$dist = Join-Path $PSScriptRoot "..\dist"
$artifacts = @(
  (Join-Path $dist "win-unpacked\JanjaLive.exe"),
  (Join-Path $dist "JanjaLive-Setup-$($package.version).exe")
)
$signatureRequired = $env:REQUIRE_WINDOWS_SIGNATURE -eq "true"
$results = foreach ($artifact in $artifacts) {
  $resolved = (Resolve-Path -LiteralPath $artifact).Path
  $signature = Get-AuthenticodeSignature -LiteralPath $resolved
  [PSCustomObject]@{
    Name = Split-Path -Leaf $resolved
    Status = $signature.Status
    Subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
  }
}

if ($signatureRequired) {
  $invalid = @($results | Where-Object { $_.Status -ne "Valid" })
  if ($invalid.Count -gt 0) {
    $details = ($invalid | ForEach-Object { "$($_.Name): $($_.Status)" }) -join "; "
    throw "Authenticode signing was configured, but signature verification failed: $details"
  }
  $results | ForEach-Object { Write-Output "Verified Authenticode signature: $($_.Name) [$($_.Subject)]" }
  exit 0
}

$results | ForEach-Object { Write-Output "Authenticode signature not required for this build: $($_.Name) [$($_.Status)]" }
