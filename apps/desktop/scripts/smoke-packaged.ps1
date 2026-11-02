param([string]$ExecutablePath = (Join-Path $PSScriptRoot "..\dist\win-unpacked\JanjaLive.exe"))
$ErrorActionPreference = "Stop"

$executable = $ExecutablePath
$resolvedExecutable = (Resolve-Path -LiteralPath $executable).Path
$startedAt = Get-Date
$runId = [Guid]::NewGuid().ToString("N")
$stdout = Join-Path ([IO.Path]::GetTempPath()) "janjalive-smoke-$runId.stdout.log"
$stderr = Join-Path ([IO.Path]::GetTempPath()) "janjalive-smoke-$runId.stderr.log"
$profile = Join-Path ([IO.Path]::GetTempPath()) "janjalive-smoke-$runId-profile"
New-Item -ItemType Directory -Path $profile | Out-Null
$launcher = Start-Process -FilePath $resolvedExecutable -ArgumentList "--enable-logging", "--janjalive-smoke-test", "--user-data-dir=$profile" -WindowStyle Hidden -WorkingDirectory $profile -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

try {
  $deadline = (Get-Date).AddSeconds(30)
  do {
    Start-Sleep -Milliseconds 500
    $processes = @(Get-Process -Name "JanjaLive" -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -eq $resolvedExecutable -and $_.StartTime -ge $startedAt.AddSeconds(-2)
    })

    $errorWindow = $processes | Where-Object { $_.MainWindowTitle -eq "Error" } | Select-Object -First 1
    if ($errorWindow) {
      throw "Packaged application opened an Electron error dialog."
    }

    $applicationWindow = $processes | Where-Object { $_.MainWindowTitle -eq "JanjaLive" } | Select-Object -First 1
    $startupLogs = @(
      if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout }
      if (Test-Path -LiteralPath $stderr) { Get-Content -LiteralPath $stderr }
    )
    $rendererErrors = $startupLogs | Select-String -Pattern "Unable to load preload script|Uncaught |Failed to load URL|ERR_UNEXPECTED|ERR_BLOCKED_BY_CLIENT|JANJALIVE_SMOKE_(?!RENDERER_READY)"
    if ($rendererErrors) {
      throw "Packaged application logged a renderer or preload startup error: $($rendererErrors -join '; ')"
    }
    if ($processes.Count -gt 0 -and ($startupLogs -contains "JANJALIVE_SMOKE_RENDERER_READY")) {
      Write-Output "Packaged application mounted its renderer with the preload bridge in the main window."
      exit 0
    }

    if ($launcher.HasExited -and $processes.Count -eq 0) {
      throw "Packaged application exited before opening its main window."
    }
  } while ((Get-Date) -lt $deadline)

  throw "Packaged application did not mount its renderer within 30 seconds. Logs: $($startupLogs -join [Environment]::NewLine)"
}
finally {
  Get-Process -Name "JanjaLive" -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $resolvedExecutable -and $_.StartTime -ge $startedAt.AddSeconds(-2)
  } | Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
  $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
  $resolvedProfile = [IO.Path]::GetFullPath($profile)
  if (!$resolvedProfile.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $resolvedProfile) -ne "janjalive-smoke-$runId-profile") { throw "Refusing to remove unexpected smoke profile path" }
  Remove-Item -LiteralPath $resolvedProfile -Recurse -Force -ErrorAction SilentlyContinue
}
