$ErrorActionPreference = "Stop"

$executable = Join-Path $PSScriptRoot "..\dist\win-unpacked\JanjaLive.exe"
$resolvedExecutable = (Resolve-Path -LiteralPath $executable).Path
$startedAt = Get-Date
$runId = [Guid]::NewGuid().ToString("N")
$stdout = Join-Path ([IO.Path]::GetTempPath()) "janjalive-smoke-$runId.stdout.log"
$stderr = Join-Path ([IO.Path]::GetTempPath()) "janjalive-smoke-$runId.stderr.log"
$launcher = Start-Process -FilePath $resolvedExecutable -ArgumentList "--enable-logging", "--janjalive-smoke-test" -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru

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
    if ($applicationWindow -and ($startupLogs -contains "JANJALIVE_SMOKE_RENDERER_READY")) {
      Write-Output "Packaged application mounted its renderer in the main window: $($applicationWindow.MainWindowTitle)"
      exit 0
    }

    if ($launcher.HasExited -and $processes.Count -eq 0) {
      throw "Packaged application exited before opening its main window."
    }
  } while ((Get-Date) -lt $deadline)

  throw "Packaged application did not open its main window within 30 seconds."
}
finally {
  Get-Process -Name "JanjaLive" -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -eq $resolvedExecutable -and $_.StartTime -ge $startedAt.AddSeconds(-2)
  } | Stop-Process -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
}
