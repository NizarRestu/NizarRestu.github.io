$port = 8000
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$prefix = "http://localhost:$port/"

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Host "Gagal menjalankan server di $prefix" -ForegroundColor Red
  Write-Host $_.Exception.Message
  Write-Host ""
  Write-Host "Coba jalankan sebagai Administrator, atau tutup aplikasi yang memakai port $port."
  Write-Host "Tekan Enter untuk keluar..."
  [void][Console]::ReadLine()
  exit 1
}

Write-Host "Server berjalan di $prefix" -ForegroundColor Green
Write-Host "Buka: http://localhost:$port/index.html"
Write-Host "Tekan Ctrl+C untuk menghentikan server."
Write-Host ""

try {
  Start-Process "http://localhost:$port/index.html" | Out-Null
} catch {}

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif'  = 'image/gif'
  '.webp' = 'image/webp'
  '.svg'  = 'image/svg+xml'
  '.ico'  = 'image/x-icon'
  '.txt'  = 'text/plain; charset=utf-8'
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $localPath = $request.Url.LocalPath
      if ([string]::IsNullOrWhiteSpace($localPath) -or $localPath -eq '/') {
        $localPath = '/index.html'
      }

      $relativePath = [Uri]::UnescapeDataString($localPath).TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
      $rootFull = [System.IO.Path]::GetFullPath($root)

      if (-not $fullPath.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
      } elseif (Test-Path -LiteralPath $fullPath -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $ext = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
        $response.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { 'application/octet-stream' }
        $response.StatusCode = 200
      } else {
        $response.StatusCode = 404
        $bytes = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
        $response.ContentType = 'text/plain; charset=utf-8'
      }

      $response.ContentLength64 = $bytes.Length
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      try {
        $response.StatusCode = 500
        $msg = [System.Text.Encoding]::UTF8.GetBytes('Internal Server Error')
        $response.ContentLength64 = $msg.Length
        $response.OutputStream.Write($msg, 0, $msg.Length)
      } catch {}
    } finally {
      try { $response.OutputStream.Close() } catch {}
    }
  }
} finally {
  try { $listener.Stop() } catch {}
  try { $listener.Close() } catch {}
}
