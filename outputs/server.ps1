param(
  [int]$Port = 8787,
  [string]$HostAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LibraryPath = Join-Path $Root "artbee-library.json"
$script:ArtStationSessions = @{}
$script:ArtStationSessionReady = @{}

function ConvertTo-JsonBytes {
  param([object]$Value)

  $json = $Value | ConvertTo-Json -Depth 20 -Compress
  return [System.Text.Encoding]::UTF8.GetBytes($json)
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$ContentType,
    [byte[]]$Body
  )

  $origin = if ($script:CurrentRequestOrigin) { $script:CurrentRequestOrigin } else { "*" }
  $reason = @{
    200 = "OK"
    400 = "Bad Request"
    404 = "Not Found"
    500 = "Internal Server Error"
    502 = "Bad Gateway"
  }[$StatusCode]
  if (-not $reason) { $reason = "OK" }

  $headers = @(
    "HTTP/1.1 $StatusCode $reason",
    "Content-Type: $ContentType",
    "Content-Length: $($Body.Length)",
    "Access-Control-Allow-Origin: $origin",
    "Access-Control-Allow-Methods: GET, POST, OPTIONS",
    "Access-Control-Allow-Headers: Content-Type, Accept",
    "Cache-Control: no-store",
    "Connection: close",
    "",
    ""
  )
  if ($origin -ne "*") {
    $headers = $headers[0..2] + @("Access-Control-Allow-Credentials: true", "Vary: Origin") + $headers[3..($headers.Count - 1)]
  }
  $headers = $headers -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($Body, 0, $Body.Length)
}

function Send-Json {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [object]$Value
  )

  Send-Response -Stream $Stream -StatusCode $StatusCode -ContentType "application/json; charset=utf-8" -Body (ConvertTo-JsonBytes $Value)
}

function Read-LibraryBackup {
  if (-not (Test-Path -LiteralPath $LibraryPath -PathType Leaf)) {
    return [pscustomobject]@{ ok = $true; items = @(); favorites = @(); scanPage = 1; updatedAt = $null }
  }

  try {
    $raw = [System.IO.File]::ReadAllText($LibraryPath, [System.Text.Encoding]::UTF8)
    $payload = $raw | ConvertFrom-Json
    $items = @($payload.items)
    $favorites = @($payload.favorites)
    return [pscustomobject]@{
      ok = $true
      items = $items
      favorites = $favorites
      scanPage = $payload.scanPage
      updatedAt = $payload.updatedAt
    }
  } catch {
    return [pscustomobject]@{ ok = $false; items = @(); favorites = @(); scanPage = 1; message = $_.Exception.Message }
  }
}

function Write-LibraryBackup {
  param([string]$Body)

  if ([string]::IsNullOrWhiteSpace($Body)) {
    return [pscustomobject]@{ ok = $false; message = "Empty library payload" }
  }

  $payload = $Body | ConvertFrom-Json
  $items = @($payload.items | Select-Object -First 1200)
  $favorites = @($payload.favorites)
  $scanPage = 1
  if ($payload.scanPage) { [void][int]::TryParse("$($payload.scanPage)", [ref]$scanPage) }
  $backup = [pscustomobject]@{
    ok = $true
    updatedAt = (Get-Date).ToUniversalTime().ToString("o")
    scanPage = [Math]::Max(1, $scanPage)
    favorites = $favorites
    items = $items
  }
  $json = $backup | ConvertTo-Json -Depth 30
  [System.IO.File]::WriteAllText($LibraryPath, $json, [System.Text.Encoding]::UTF8)
  return [pscustomobject]@{ ok = $true; count = $items.Count; path = $LibraryPath }
}

function Get-ContentType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".css" { "text/css; charset=utf-8" }
    ".js" { "application/javascript; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".png" { "image/png" }
    ".jpg" { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".webp" { "image/webp" }
    default { "application/octet-stream" }
  }
}

function Parse-QueryString {
  param([string]$Query)

  $result = @{}
  if ([string]::IsNullOrWhiteSpace($Query)) { return $result }

  foreach ($pair in $Query.TrimStart("?").Split("&")) {
    if ([string]::IsNullOrWhiteSpace($pair)) { continue }
    $parts = $pair.Split("=", 2)
    $key = [uri]::UnescapeDataString($parts[0])
    $value = if ($parts.Length -gt 1) { [uri]::UnescapeDataString($parts[1].Replace("+", " ")) } else { "" }
    $result[$key] = $value
  }
  return $result
}

function Get-PropertyValue {
  param(
    [object]$Object,
    [string[]]$Names
  )

  if ($null -eq $Object) { return $null }
  foreach ($name in $Names) {
    $property = $Object.PSObject.Properties[$name]
    if ($null -ne $property -and $null -ne $property.Value -and "$($property.Value)" -ne "") {
      return $property.Value
    }
  }
  return $null
}

function Get-ItemsFromPayload {
  param([object]$Payload)

  foreach ($name in @("data", "results", "items", "projects")) {
    $value = Get-PropertyValue -Object $Payload -Names @($name)
    if ($null -ne $value) { return @($value) }
  }
  if ($Payload -is [array]) { return @($Payload) }
  return @()
}

function Get-ImageCandidate {
  param([object]$Item)

  $direct = Get-PropertyValue -Object $Item -Names @("cover_url", "coverUrl", "smaller_square_cover_url", "image_url", "imageUrl", "thumbnail_url", "thumbnailUrl", "preview_url")
  if ($direct) { return "$direct" }

  foreach ($containerName in @("cover", "image", "thumbnail", "preview")) {
    $container = Get-PropertyValue -Object $Item -Names @($containerName)
    $nested = Get-PropertyValue -Object $container -Names @("url", "src", "small", "medium", "large")
    if ($nested) { return "$nested" }
  }

  $assets = Get-PropertyValue -Object $Item -Names @("assets")
  foreach ($asset in @($assets)) {
    $assetUrl = Get-PropertyValue -Object $asset -Names @("image_url", "imageUrl", "url", "src")
    if ($assetUrl) { return "$assetUrl" }
  }

  return $null
}

function Test-ImageUrl {
  param([string]$Value)

  $text = "$Value".Trim()
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  if ($text -notmatch "^https?://") { return $false }
  return $text -notmatch "\.(mp4|webm|mov|m4v)(\?|#|$)"
}

function New-ImageCandidate {
  param(
    [object]$Url,
    [object]$Width,
    [object]$Height
  )

  if (-not (Test-ImageUrl -Value "$Url")) { return $null }
  $w = 0
  $h = 0
  [void][int]::TryParse("$Width", [ref]$w)
  [void][int]::TryParse("$Height", [ref]$h)
  return [pscustomobject]@{
    Url = "$Url"
    Width = $w
    Height = $h
    Score = [int64]$w * [int64]$h
  }
}

function Get-FullImageCandidate {
  param(
    [object]$Detail,
    [string]$Fallback
  )

  $candidates = @()
  $assets = Get-PropertyValue -Object $Detail -Names @("assets")
  foreach ($asset in @($assets)) {
    $type = Get-PropertyValue -Object $asset -Names @("asset_type", "assetType", "type")
    if ($type -and "$type".ToLowerInvariant() -notmatch "image|photo|picture|cover") { continue }
    $width = Get-PropertyValue -Object $asset -Names @("width", "image_width", "imageWidth")
    $height = Get-PropertyValue -Object $asset -Names @("height", "image_height", "imageHeight")
    foreach ($field in @("full_image_url", "fullImageUrl", "original_url", "originalUrl", "large_image_url", "largeImageUrl", "image_url", "imageUrl", "url", "src")) {
      $candidate = New-ImageCandidate -Url (Get-PropertyValue -Object $asset -Names @($field)) -Width $width -Height $height
      if ($candidate) { $candidates += $candidate }
    }
  }

  foreach ($field in @("full_image_url", "fullImageUrl", "original_url", "originalUrl", "large_image_url", "largeImageUrl", "image_url", "imageUrl")) {
    $candidate = New-ImageCandidate -Url (Get-PropertyValue -Object $Detail -Names @($field)) -Width (Get-PropertyValue -Object $Detail -Names @("width")) -Height (Get-PropertyValue -Object $Detail -Names @("height"))
    if ($candidate) { $candidates += $candidate }
  }

  $fallbackCandidate = New-ImageCandidate -Url $Fallback -Width (Get-PropertyValue -Object $Detail -Names @("width")) -Height (Get-PropertyValue -Object $Detail -Names @("height"))
  if ($fallbackCandidate) { $candidates += $fallbackCandidate }

  $best = $candidates | Sort-Object -Property Score -Descending | Select-Object -First 1
  if ($best) { return $best }
  return [pscustomobject]@{ Url = "$Fallback"; Width = 0; Height = 0; Score = 0 }
}

function Get-Tags {
  param([object]$Item)

  $tags = @()
  foreach ($name in @("tags", "categories")) {
    $values = Get-PropertyValue -Object $Item -Names @($name)
    foreach ($value in @($values)) {
      if ($null -eq $value) { continue }
      if ($value -is [string]) {
        $tags += $value
      } else {
        $tagName = Get-PropertyValue -Object $value -Names @("name", "title", "slug")
        if ($tagName) { $tags += "$tagName" }
      }
    }
  }
  return @($tags | Select-Object -Unique)
}

function Normalize-ProxyUrl {
  param([string]$Value)

  $text = "$Value".Trim()
  if ([string]::IsNullOrWhiteSpace($text)) { return "" }
  if ($text -notmatch "^https?://") { $text = "http://$text" }

  try {
    $uri = [uri]$text
    if ($uri.Host -eq "127.0.0.1" -and $uri.Port -eq 7890) {
      return "http://127.0.0.1:7897"
    }
    return $uri.AbsoluteUri.TrimEnd("/")
  } catch {
    return $text
  }
}

function Get-ProxyCandidates {
  param([string]$Preferred)

  $candidates = New-Object System.Collections.Generic.List[string]
  foreach ($candidate in @(
    $Preferred,
    "http://127.0.0.1:7897",
    "http://127.0.0.1:7890",
    "http://127.0.0.1:7891",
    "http://127.0.0.1:7899",
    "http://127.0.0.1:10809",
    ""
  )) {
    $normalized = Normalize-ProxyUrl -Value "$candidate"
    if (-not $candidates.Contains($normalized)) {
      [void]$candidates.Add($normalized)
    }
  }
  return @($candidates)
}

function Get-ArtStationSessionKey {
  param([string]$ProxyCandidate)

  if ([string]::IsNullOrWhiteSpace($ProxyCandidate)) { return "direct" }
  return $ProxyCandidate
}

function Get-ArtStationSession {
  param([string]$ProxyCandidate)

  $key = Get-ArtStationSessionKey -ProxyCandidate $ProxyCandidate
  if (-not $script:ArtStationSessions.ContainsKey($key)) {
    $script:ArtStationSessions[$key] = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  }
  return $script:ArtStationSessions[$key]
}

function Test-IsForbiddenError {
  param([object]$ErrorRecord)

  $message = "$($ErrorRecord.Exception.Message)"
  if ($message -match "403|Forbidden") { return $true }
  try {
    $response = $ErrorRecord.Exception.Response
    if ($response -and [int]$response.StatusCode -eq 403) { return $true }
  } catch {}
  return $false
}

function Initialize-ArtStationSession {
  param(
    [string]$ProxyCandidate,
    [hashtable]$Headers
  )

  $key = Get-ArtStationSessionKey -ProxyCandidate $ProxyCandidate
  $session = Get-ArtStationSession -ProxyCandidate $ProxyCandidate
  $request = @{
    Method = "Get"
    Uri = "https://www.artstation.com/"
    Headers = $Headers
    TimeoutSec = 25
    WebSession = $session
    UseBasicParsing = $true
  }
  if ($ProxyCandidate) { $request.Proxy = $ProxyCandidate }

  try {
    [void](Invoke-WebRequest @request)
    $script:ArtStationSessionReady[$key] = $true
  } catch {
    $script:ArtStationSessionReady[$key] = $false
  }
  return $session
}

function Invoke-ArtStationJson {
  param(
    [string]$Uri,
    [hashtable]$Headers,
    [string[]]$ProxyCandidates,
    [ref]$ProxyUsed
  )

  $errors = @()
  foreach ($candidate in $ProxyCandidates) {
    $key = Get-ArtStationSessionKey -ProxyCandidate $candidate
    $session = Get-ArtStationSession -ProxyCandidate $candidate
    $request = @{
      Method = "Get"
      Uri = $Uri
      Headers = $Headers
      TimeoutSec = 25
      WebSession = $session
    }
    if ($candidate) { $request.Proxy = $candidate }

    try {
      $payload = Invoke-RestMethod @request
      if ($ProxyUsed) { $ProxyUsed.Value = $candidate }
      return $payload
    } catch {
      if (Test-IsForbiddenError -ErrorRecord $_) {
        $session = Initialize-ArtStationSession -ProxyCandidate $candidate -Headers $Headers
        $request.WebSession = $session
        try {
          $payload = Invoke-RestMethod @request
          if ($ProxyUsed) { $ProxyUsed.Value = $candidate }
          return $payload
        } catch {
          $script:ArtStationSessionReady[$key] = $false
        }
      }
      $label = if ($candidate) { "proxy ${candidate}" } else { "direct" }
      $errors += "${label}: $($_.Exception.Message)"
    }
  }

  throw ($errors -join " | ")
}

function Convert-ArtStationItem {
  param(
    [object]$Item,
    [object]$Detail,
    [int]$MinLikes,
    [string]$SourceName
  )

  $likesRaw = Get-PropertyValue -Object $Detail -Names @("likes_count", "likesCount", "like_count", "likes")
  if ($null -eq $likesRaw) { $likesRaw = Get-PropertyValue -Object $Item -Names @("likes_count", "likesCount", "like_count", "likes") }
  if ($null -eq $likesRaw) { return $null }

  $likesText = "$likesRaw" -replace ",", ""
  $likes = 0
  if (-not [int]::TryParse($likesText, [ref]$likes)) { return $null }
  if ($likes -lt $MinLikes) { return $null }

  $title = Get-PropertyValue -Object $Detail -Names @("title", "name")
  if (-not $title) { $title = Get-PropertyValue -Object $Item -Names @("title", "name") }
  $url = Get-PropertyValue -Object $Item -Names @("url", "permalink", "html_url")
  $hash = Get-PropertyValue -Object $Detail -Names @("hash_id", "hashId", "slug", "id")
  if (-not $hash) { $hash = Get-PropertyValue -Object $Item -Names @("hash_id", "hashId", "slug", "id") }
  if (-not $url -and $hash) { $url = "https://www.artstation.com/artwork/$hash" }

  $cover = Get-ImageCandidate -Item $Item
  if (-not $cover) { $cover = Get-ImageCandidate -Item $Detail }
  if (-not $title -or -not $url -or -not $cover) { return $null }
  $fullImage = Get-FullImageCandidate -Detail $Detail -Fallback "$cover"

  $user = Get-PropertyValue -Object $Detail -Names @("user", "artist", "owner")
  if (-not $user) { $user = Get-PropertyValue -Object $Item -Names @("user", "artist", "owner") }
  $artist = Get-PropertyValue -Object $user -Names @("full_name", "fullName", "username", "name")
  $username = Get-PropertyValue -Object $user -Names @("username", "slug")
  if (-not $artist) { $artist = $username }
  if (-not $artist) { $artist = "ArtStation artist" }

  $tags = Get-Tags -Item $Detail
  if ($tags.Count -eq 0) { $tags = Get-Tags -Item $Item }
  $text = ("$title " + ($tags -join " ")).ToLowerInvariant()
  $looksEnvironmental = $text -match "environment|environmental|landscape|world|scene|city|urban|interior|exterior|architecture|building|forest|mountain|concept|design|ruins|vista"

  if (-not $looksEnvironmental) {
    return $null
  }

  $width = Get-PropertyValue -Object $Detail -Names @("width")
  $height = Get-PropertyValue -Object $Detail -Names @("height")
  $assets = Get-PropertyValue -Object $Detail -Names @("assets")
  if ((-not $width -or -not $height) -and $assets) {
    $firstAsset = @($assets)[0]
    if (-not $width) { $width = Get-PropertyValue -Object $firstAsset -Names @("width") }
    if (-not $height) { $height = Get-PropertyValue -Object $firstAsset -Names @("height") }
  }
  if (-not $width) { $width = $fullImage.Width }
  if (-not $height) { $height = $fullImage.Height }

  return [pscustomobject]@{
    id = "$hash"
    title = "$title"
    url = "$url"
    coverUrl = "$cover"
    fullImageUrl = "$($fullImage.Url)"
    artist = "$artist"
    username = "$username"
    likes = $likes
    tags = $tags
    width = $width
    height = $height
    source = $SourceName
  }
}

function Invoke-ArtStationScan {
  param([hashtable]$Params)

  $minLikes = 1000
  if ($Params.ContainsKey("minLikes")) { [void][int]::TryParse($Params["minLikes"], [ref]$minLikes) }
  $limit = 60
  if ($Params.ContainsKey("limit")) { [void][int]::TryParse($Params["limit"], [ref]$limit) }
  $limit = [Math]::Max(1, [Math]::Min(100, $limit))
  $pageStart = 1
  if ($Params.ContainsKey("page")) { [void][int]::TryParse($Params["page"], [ref]$pageStart) }
  $pageStart = [Math]::Max(1, $pageStart)
  $proxy = ""
  if ($Params.ContainsKey("proxy")) { $proxy = "$($Params["proxy"])".Trim() }
  $proxyCandidates = Get-ProxyCandidates -Preferred $proxy
  $lastProxyUsed = ""
  $pagesToScan = 3

  $headers = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    "Accept" = "application/json,text/plain,*/*"
    "Accept-Language" = "zh-CN,zh;q=0.9,en;q=0.8"
    "Referer" = "https://www.artstation.com/"
    "X-Requested-With" = "XMLHttpRequest"
  }

  $templates = @(
    @{ Name = "search environmental concept art design"; Url = "https://www.artstation.com/api/v2/search/projects.json?query=environmental%20concept%20art%20design&page={0}&per_page=50&sorting=likes" },
    @{ Name = "search environment concept art"; Url = "https://www.artstation.com/api/v2/search/projects.json?query=environment%20concept%20art&page={0}&per_page=50&sorting=likes" },
    @{ Name = "search environment design"; Url = "https://www.artstation.com/api/v2/search/projects.json?query=environment%20design&page={0}&per_page=50&sorting=likes" }
  )

  $itemsById = @{}
  $warnings = @()
  $requests = 0
  $lastPage = $pageStart

  foreach ($template in $templates) {
    for ($page = $pageStart; $page -lt ($pageStart + $pagesToScan); $page++) {
      if ($itemsById.Count -ge $limit) { break }
      $url = [string]::Format($template.Url, $page)
      $lastPage = [Math]::Max($lastPage, $page)
      $requests += 1

      try {
        $payload = Invoke-ArtStationJson -Uri $url -Headers $headers -ProxyCandidates $proxyCandidates -ProxyUsed ([ref]$lastProxyUsed)
        $rawItems = Get-ItemsFromPayload -Payload $payload
        foreach ($raw in $rawItems) {
          $hash = Get-PropertyValue -Object $raw -Names @("hash_id", "hashId", "slug", "id")
          if (-not $hash) { continue }
          if ($itemsById.ContainsKey("$hash")) { continue }

          $requests += 1
          $detail = Invoke-ArtStationJson -Uri "https://www.artstation.com/projects/$hash.json" -Headers $headers -ProxyCandidates $proxyCandidates -ProxyUsed ([ref]$lastProxyUsed)

          $item = Convert-ArtStationItem -Item $raw -Detail $detail -MinLikes $minLikes -SourceName $template.Name
          if ($null -eq $item) { continue }
          $key = if ($item.id) { "$($item.id)" } else { "$($item.url)" }
          if (-not $itemsById.ContainsKey($key)) {
            $itemsById[$key] = $item
          }
          if ($itemsById.Count -ge $limit) { break }
        }
      } catch {
        $warnings += "$($template.Name) page $($page): $($_.Exception.Message)"
      }

      Start-Sleep -Milliseconds 300
    }
    if ($itemsById.Count -ge $limit) { break }
  }

  $items = @($itemsById.Values | Sort-Object -Property likes -Descending | Select-Object -First $limit)
  if ($items.Count -eq 0 -and $warnings.Count -gt 0) {
    $warningText = $warnings -join " "
    $message = if ($warningText -match "403|Forbidden") {
      "ArtStation rejected the collection request with HTTP 403. The proxy is connected, but the current node or session is blocked by ArtStation. Try another global proxy node or try again later."
    } else {
      "No usable ArtStation result was returned. The network may be unreachable, the site may be blocking requests, or the public endpoint may have changed."
    }
    $failedResult = @{
      ok = $false;
      message = $message;
      warnings = $warnings;
      requests = $requests;
    }
    return [pscustomobject]$failedResult
  }

  $successResult = @{
    ok = $true;
    source = "ArtStation Environmental Concept Art and Design";
    minLikes = $minLikes;
    count = $items.Count;
    pageStart = $pageStart;
    pageEnd = $lastPage;
    nextPage = $lastPage + 1;
    requests = $requests;
    proxyUsed = $lastProxyUsed;
    warnings = $warnings;
    items = $items;
  }
  return [pscustomobject]$successResult
}

function Get-ArtStationHash {
  param([string]$Value)

  $text = "$Value".Trim()
  if ([string]::IsNullOrWhiteSpace($text)) { return "" }
  if ($text -match "^[a-zA-Z0-9]+$") { return $text }
  try {
    $uri = [uri]$text
    $match = [regex]::Match($uri.AbsolutePath, "/(?:artwork|projects)/([^/?#]+)", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    if ($match.Success) { return $match.Groups[1].Value }
  } catch {}
  return ""
}

function Invoke-ArtStationProjectImage {
  param([hashtable]$Params)

  $hash = ""
  if ($Params.ContainsKey("hash")) { $hash = Get-ArtStationHash -Value "$($Params["hash"])" }
  if (-not $hash -and $Params.ContainsKey("url")) { $hash = Get-ArtStationHash -Value "$($Params["url"])" }
  if (-not $hash) {
    return [pscustomobject]@{ ok = $false; message = "Missing ArtStation project hash" }
  }

  $proxy = ""
  if ($Params.ContainsKey("proxy")) { $proxy = "$($Params["proxy"])".Trim() }
  $proxyCandidates = Get-ProxyCandidates -Preferred $proxy
  $lastProxyUsed = ""
  $headers = @{
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    "Accept" = "application/json,text/plain,*/*"
    "Accept-Language" = "zh-CN,zh;q=0.9,en;q=0.8"
    "Referer" = "https://www.artstation.com/"
    "X-Requested-With" = "XMLHttpRequest"
  }
  $detail = Invoke-ArtStationJson -Uri "https://www.artstation.com/projects/$hash.json" -Headers $headers -ProxyCandidates $proxyCandidates -ProxyUsed ([ref]$lastProxyUsed)
  $fallback = Get-ImageCandidate -Item $detail
  $fullImage = Get-FullImageCandidate -Detail $detail -Fallback "$fallback"
  return [pscustomobject]@{
    ok = [bool]$fullImage.Url
    hash = "$hash"
    fullImageUrl = "$($fullImage.Url)"
    width = $fullImage.Width
    height = $fullImage.Height
    proxyUsed = $lastProxyUsed
  }
}

function Read-HttpRequest {
  param([System.Net.Sockets.NetworkStream]$Stream)

  $buffer = New-Object byte[] 4096
  $memory = [System.IO.MemoryStream]::new()
  $headerEnd = -1

  while ($headerEnd -lt 0) {
    $read = $Stream.Read($buffer, 0, $buffer.Length)
    if ($read -le 0) { return $null }
    $memory.Write($buffer, 0, $read)
    $bytes = $memory.ToArray()
    $headerTextProbe = [System.Text.Encoding]::ASCII.GetString($bytes)
    $headerEnd = $headerTextProbe.IndexOf("`r`n`r`n")
    if ($memory.Length -gt 65536) { throw "Request headers are too large" }
  }

  $allBytes = $memory.ToArray()
  $headerLength = $headerEnd + 4
  $headerText = [System.Text.Encoding]::ASCII.GetString($allBytes, 0, $headerLength)
  $lines = $headerText -split "`r`n"
  $headers = @{}
  foreach ($line in $lines | Select-Object -Skip 1) {
    if ([string]::IsNullOrWhiteSpace($line) -or -not $line.Contains(":")) { continue }
    $parts = $line.Split(":", 2)
    $headers[$parts[0].Trim().ToLowerInvariant()] = $parts[1].Trim()
  }

  $contentLength = 0
  if ($headers.ContainsKey("content-length")) {
    [void][int]::TryParse($headers["content-length"], [ref]$contentLength)
  }

  $bodyMemory = [System.IO.MemoryStream]::new()
  $remainingFromFirstRead = $allBytes.Length - $headerLength
  if ($remainingFromFirstRead -gt 0) {
    $take = [Math]::Min($remainingFromFirstRead, $contentLength)
    $bodyMemory.Write($allBytes, $headerLength, $take)
  }

  while ($bodyMemory.Length -lt $contentLength) {
    $needed = [Math]::Min($buffer.Length, $contentLength - [int]$bodyMemory.Length)
    $read = $Stream.Read($buffer, 0, $needed)
    if ($read -le 0) { break }
    $bodyMemory.Write($buffer, 0, $read)
  }

  $bodyBytes = $bodyMemory.ToArray()
  return [pscustomobject]@{
    RequestLine = $lines[0]
    Headers = $headers
    Body = [System.Text.Encoding]::UTF8.GetString($bodyBytes)
  }
}

function Handle-Request {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [string]$RequestLine,
    [hashtable]$Headers = @{},
    [string]$Body = ""
  )

  $script:CurrentRequestOrigin = if ($Headers.ContainsKey("origin")) { $Headers["origin"] } else { "" }
  $parts = $RequestLine.Split(" ")
  if ($parts.Length -lt 2) {
    Send-Json -Stream $Stream -StatusCode 400 -Value @{ ok = $false; message = "Bad request" }
    return
  }

  $method = $parts[0].ToUpperInvariant()
  $target = $parts[1]
  $path = $target
  $query = ""
  if ($target.Contains("?")) {
    $path = $target.Split("?", 2)[0]
    $query = $target.Split("?", 2)[1]
  }

  if ($method -eq "OPTIONS") {
    Send-Json -Stream $Stream -StatusCode 200 -Value @{ ok = $true }
    return
  }

  if ($path -eq "/api/health") {
    Send-Json -Stream $Stream -StatusCode 200 -Value @{ ok = $true; service = "ArtBee PicBee ArtStation scraper"; port = $Port }
    return
  }

  if ($path -eq "/api/library") {
    try {
      if ($method -eq "GET") {
        Send-Json -Stream $Stream -StatusCode 200 -Value (Read-LibraryBackup)
        return
      }
      if ($method -eq "POST") {
        Send-Json -Stream $Stream -StatusCode 200 -Value (Write-LibraryBackup -Body $Body)
        return
      }
      Send-Json -Stream $Stream -StatusCode 400 -Value @{ ok = $false; message = "Unsupported method" }
    } catch {
      Send-Json -Stream $Stream -StatusCode 500 -Value @{ ok = $false; message = $_.Exception.Message }
    }
    return
  }

  if ($path -eq "/api/scan-artstation") {
    try {
      $params = Parse-QueryString -Query $query
      $payload = Invoke-ArtStationScan -Params $params
      $status = if ($payload.ok) { 200 } else { 502 }
      Send-Json -Stream $Stream -StatusCode $status -Value $payload
    } catch {
      Send-Json -Stream $Stream -StatusCode 500 -Value @{ ok = $false; message = $_.Exception.Message }
    }
    return
  }

  if ($path -eq "/api/artstation-project") {
    try {
      $params = Parse-QueryString -Query $query
      $payload = Invoke-ArtStationProjectImage -Params $params
      $status = if ($payload.ok) { 200 } else { 502 }
      Send-Json -Stream $Stream -StatusCode $status -Value $payload
    } catch {
      Send-Json -Stream $Stream -StatusCode 500 -Value @{ ok = $false; message = $_.Exception.Message }
    }
    return
  }

  if ($path -eq "/") { $path = "/index.html" }
  $relative = [uri]::UnescapeDataString($path.TrimStart("/")).Replace("/", [System.IO.Path]::DirectorySeparatorChar)
  $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relative))
  if (-not $fullPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
    Send-Json -Stream $Stream -StatusCode 404 -Value @{ ok = $false; message = "Not found" }
    return
  }

  $bytes = [System.IO.File]::ReadAllBytes($fullPath)
  Send-Response -Stream $Stream -StatusCode 200 -ContentType (Get-ContentType -Path $fullPath) -Body $bytes
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($HostAddress), $Port)
$listener.Start()
Write-Host "ArtBee PicBee is running: http://$HostAddress`:$Port/"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $request = Read-HttpRequest -Stream $stream
      if ($request -and $request.RequestLine) {
        Handle-Request -Stream $stream -RequestLine $request.RequestLine -Headers $request.Headers -Body $request.Body
      }
    } catch {
      try {
        Send-Json -Stream $stream -StatusCode 500 -Value @{ ok = $false; message = $_.Exception.Message }
      } catch {}
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
