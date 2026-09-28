# Installs PrintAgent on a fresh Windows machine: downloads a portable Node if needed,
# installs the npm package and starts the agent. No admin rights, winget or git required.
#
#   irm https://raw.githubusercontent.com/huy97/printagent/main/install.ps1 | iex
#
# Environment: PRINTAGENT_LANG=vi, PRINTAGENT_NODE_TRACK=v22.x,
# PRINTAGENT_HOME=%USERPROFILE%\.printagent, PRINTAGENT_NO_START=1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = 'SilentlyContinue'

$minMajor = 22
$track = if ($env:PRINTAGENT_NODE_TRACK) { $env:PRINTAGENT_NODE_TRACK } else { 'v22.x' }
$package = if ($env:PRINTAGENT_PACKAGE) { $env:PRINTAGENT_PACKAGE } else { '@hyydev/printagent' }
$paHome = if ($env:PRINTAGENT_HOME) { $env:PRINTAGENT_HOME } else { Join-Path $env:USERPROFILE '.printagent' }
$runtimeDir = Join-Path $paHome 'runtime'
$appDir = Join-Path $paHome 'app'
$binDir = Join-Path $paHome 'bin'
$isVietnamese = ($env:PRINTAGENT_LANG -and $env:PRINTAGENT_LANG.StartsWith('vi'))

function Say($vi, $en, $color = 'Cyan') {
    Write-Host $(if ($isVietnamese) { $vi } else { $en }) -ForegroundColor $color
}

function Fail($vi, $en) {
    throw $(if ($isVietnamese) { $vi } else { $en })
}

function Get-NodeMajor($exe) {
    try { return [int]((& $exe -v).TrimStart('v').Split('.')[0]) } catch { return 0 }
}

function Get-NodeArch {
    switch ($env:PROCESSOR_ARCHITECTURE) {
        'ARM64' { return 'arm64' }
        'AMD64' { return 'x64' }
        'x86' { if ([Environment]::Is64BitOperatingSystem) { return 'x64' } else { return 'x86' } }
        default { return 'x64' }
    }
}

# Reuse a portable Node downloaded on a previous run.
function Find-RuntimeNode {
    if (-not (Test-Path $runtimeDir)) { return $null }
    Get-ChildItem $runtimeDir -Directory -Filter 'node-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Join-Path $_.FullName 'node.exe' } |
        Where-Object { (Test-Path $_) -and ((Get-NodeMajor $_) -ge $minMajor) } |
        Select-Object -First 1
}

function Install-Node {
    $arch = Get-NodeArch
    Say "Chưa có Node.js $minMajor trở lên, đang tải bản portable cho win-$arch..." `
        "Node.js $minMajor+ not found, downloading a portable build for win-$arch..." 'Yellow'

    $dist = "https://nodejs.org/dist/latest-$track"
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

    try {
        $shasums = (Invoke-WebRequest -UseBasicParsing "$dist/SHASUMS256.txt").Content
    } catch {
        Fail 'Không tải được danh sách bản Node. Kiểm tra kết nối mạng rồi chạy lại.' `
             'Could not fetch the Node release list. Check your network and re-run.'
    }

    $line = ($shasums -split "`n" | Where-Object { $_ -match "node-v[\d.]+-win-$arch\.zip$" } | Select-Object -First 1)
    if (-not $line) { Fail "Không tìm thấy bản Node cho win-$arch." "No Node build available for win-$arch." }
    $parts = $line.Trim() -split '\s+'
    $expected = $parts[0]
    $file = $parts[-1]

    $archive = Join-Path $runtimeDir $file
    Invoke-WebRequest -UseBasicParsing "$dist/$file" -OutFile $archive

    $actual = (Get-FileHash $archive -Algorithm SHA256).Hash
    if ($actual -ne $expected.ToUpper()) {
        Remove-Item $archive -Force
        Fail 'Bản Node tải về sai checksum, đã xoá. Chạy lại lệnh cài đặt.' `
             'Checksum mismatch on the downloaded Node build; removed. Please re-run.'
    }

    Expand-Archive -Path $archive -DestinationPath $runtimeDir -Force
    Remove-Item $archive -Force
    $exe = Join-Path (Join-Path $runtimeDir ($file -replace '\.zip$', '')) 'node.exe'
    if (-not (Test-Path $exe)) { Fail 'Giải nén Node thất bại.' 'Extracting Node failed.' }
    return $exe
}

Say 'PrintAgent - đang chuẩn bị môi trường' 'PrintAgent - preparing your environment'

$node = $null
$systemNode = Get-Command node -ErrorAction SilentlyContinue
if ($systemNode -and (Get-NodeMajor $systemNode.Source) -ge $minMajor) {
    $node = $systemNode.Source
} else {
    $node = Find-RuntimeNode
    if (-not $node) { $node = Install-Node }
}

$nodeHome = Split-Path -Parent $node
$npmCli = Join-Path $nodeHome 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path $npmCli)) {
    $npmCli = Join-Path $nodeHome 'lib\node_modules\npm\bin\npm-cli.js'
}
if (-not (Test-Path $npmCli)) {
    Fail 'Bản Node đang dùng không kèm npm. Cài lại Node LTS rồi chạy lại.' `
         'This Node build has no npm. Reinstall Node LTS and re-run.'
}

# Dependency postinstall scripts (puppeteer) call `node` directly, so the portable Node
# must be on PATH rather than only invoked by absolute path.
$env:Path = "$nodeHome;$env:Path"

Say "Node $(& $node -v) sẵn sàng" "Node $(& $node -v) ready" 'Green'

# From a source checkout, install dependencies in place instead of pulling from npm.
$repoRoot = $null
if ($PSCommandPath -and (Test-Path $PSCommandPath)) {
    $candidate = Split-Path -Parent $PSCommandPath
    if (Test-Path (Join-Path $candidate 'package.json')) {
        if ((Get-Content (Join-Path $candidate 'package.json') -Raw) -match '"name":\s*"@hyydev/printagent"') {
            $repoRoot = $candidate
        }
    }
}

if ($repoRoot) {
    Say 'Đang cài thư viện từ mã nguồn (có thể mất vài phút, gồm cả Chromium)...' `
        'Installing dependencies from source (may take a few minutes, includes Chromium)...'
    Push-Location $repoRoot
    # --no-package-lock: the project uses yarn.lock, do not let npm create a second lockfile.
    try { & $node $npmCli install --no-audit --no-fund --no-package-lock } finally { Pop-Location }
    $entry = Join-Path $repoRoot 'bin\printagent.js'
} else {
    Say "Đang cài $package (có thể mất vài phút, gồm cả Chromium)..." `
        "Installing $package (may take a few minutes, includes Chromium)..."
    New-Item -ItemType Directory -Force -Path $appDir | Out-Null
    & $node $npmCli install -g --prefix $appDir --no-audit --no-fund $package
    if ($LASTEXITCODE -ne 0) {
        Fail 'Cài package thất bại. Xem thông báo lỗi phía trên rồi chạy lại.' `
             'Package install failed. Check the error above and re-run.'
    }
    $entry = Join-Path $appDir 'node_modules\@hyydev\printagent\bin\printagent.js'
}

if (-not (Test-Path $entry)) {
    Fail 'Không tìm thấy file khởi chạy sau khi cài.' 'Entry script missing after install.'
}

New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$launcher = Join-Path $binDir 'printagent.cmd'
@"
@echo off
rem Launcher generated by install.ps1: pinned to the Node used during install.
"$node" "$entry" %*
"@ | Set-Content -Path $launcher -Encoding ASCII

$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if (($userPath -split ';') -notcontains $binDir) {
    [Environment]::SetEnvironmentVariable('Path', "$userPath;$binDir", 'User')
    Say "Đã thêm $binDir vào PATH. Mở cửa sổ dòng lệnh mới để gọi lệnh printagent." `
        "Added $binDir to PATH. Open a new terminal to use the printagent command." 'Green'
} else {
    Say 'Đã cài lệnh: printagent' 'Command installed: printagent' 'Green'
}
$env:Path = "$env:Path;$binDir"

if ($env:PRINTAGENT_NO_START -eq '1') {
    Say "Bỏ qua bước khởi động theo yêu cầu. Chạy: $launcher start" `
        "Skipping startup as requested. Run: $launcher start"
    return
}

Say 'Đang khởi động agent, trình duyệt sẽ tự mở màn hình cài đặt...' `
    'Starting the agent, your browser will open the setup screen...'
& $node $entry start
