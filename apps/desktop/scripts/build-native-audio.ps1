$ErrorActionPreference = "Stop"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $desktopRoot "native\audio-helper\main.cpp"
$manifest = Join-Path $desktopRoot "native\audio-helper\app.manifest"
$outputDirectory = Join-Path $desktopRoot "native\audio-helper\bin"
$intermediateDirectory = Join-Path $desktopRoot "native\audio-helper\build"
$output = Join-Path $outputDirectory "janjalive-audio-helper.exe"

$vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path -LiteralPath $vswhere)) {
  throw "Visual Studio Build Tools not found."
}

$visualStudio = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $visualStudio) {
  throw "The MSVC x64 build tools are required."
}

$developerCommand = Join-Path $visualStudio "Common7\Tools\VsDevCmd.bat"
New-Item -ItemType Directory -Force -Path $outputDirectory, $intermediateDirectory | Out-Null

$arguments = @(
  '/nologo', '/std:c++20', '/O2', '/EHsc', '/W4', '/WX', '/permissive-', '/sdl', '/guard:cf',
  '/DUNICODE', '/D_UNICODE',
  "/Fo:$intermediateDirectory\", "/Fe:$output", $source,
  '/link', '/guard:cf', '/DYNAMICBASE', '/NXCOMPAT', '/CETCOMPAT', '/HIGHENTROPYVA', '/MANIFEST:EMBED', "/MANIFESTINPUT:$manifest",
  'ole32.lib', 'mmdevapi.lib', 'avrt.lib', 'runtimeobject.lib', 'user32.lib'
)
$quotedArguments = $arguments | ForEach-Object { if ($_ -match '[\s&()]') { '"' + $_.Replace('"', '\"') + '"' } else { $_ } }
$command = '"' + $developerCommand + '" -no_logo -arch=x64 -host_arch=x64 && cl.exe ' + ($quotedArguments -join ' ')

& $env:ComSpec /d /s /c $command
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $output)) {
  throw "Native audio helper build failed."
}

Write-Output "Built $output"
