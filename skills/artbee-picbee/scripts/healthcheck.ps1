param(
  [string]$ProjectPath = "."
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $ProjectPath).Path
$required = @(
  "server.js",
  "package.json",
  "outputs\app.js",
  "outputs\index.html"
)

Write-Host "ArtBee PicBee healthcheck"
Write-Host "Project: $root"

foreach ($item in $required) {
  $path = Join-Path $root $item
  if (Test-Path -LiteralPath $path) {
    Write-Host "[ok] $item"
  } else {
    Write-Host "[missing] $item"
  }
}

$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  Write-Host "[ok] node: $($node.Source)"
} else {
  Write-Host "[missing] node"
}

$server = Join-Path $root "server.js"
if (Test-Path -LiteralPath $server) {
  Select-String -LiteralPath $server -Pattern "PROXY_REQUEST_TIMEOUT_MS|DIRECT_REQUEST_TIMEOUT_MS|DEFAULT_SCAN_PAGES|pagesToScan|buildProxyCandidates" |
    ForEach-Object { Write-Host "[collector] $($_.Line.Trim())" }
}

$lanScript = Join-Path $root "outputs\start-artbee-lan.cmd"
if (Test-Path -LiteralPath $lanScript) {
  $usesNode = Select-String -LiteralPath $lanScript -Pattern "node server.js" -Quiet
  if ($usesNode) {
    Write-Host "[ok] LAN script starts node server"
  } else {
    Write-Host "[warn] LAN script may not start the full backend"
  }
}

$library = Join-Path $root "data\artbee-library.json"
if (Test-Path -LiteralPath $library) {
  try {
    $json = Get-Content -LiteralPath $library -Raw | ConvertFrom-Json
    if ($json -is [array]) {
      Write-Host "[data] library items: $($json.Count)"
    } elseif ($json.items) {
      Write-Host "[data] library items: $($json.items.Count)"
    } else {
      Write-Host "[data] library file exists"
    }
  } catch {
    Write-Host "[warn] library file exists but could not be parsed"
  }
} else {
  Write-Host "[data] no library file found"
}
