# Cài đặt PrintAgent trên Windows: tự cài Node LTS nếu thiếu rồi khởi động agent.
# Chạy: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-NodeMajor {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return 0 }
    try {
        return [int]((& node -v).TrimStart('v').Split('.')[0])
    } catch {
        return 0
    }
}

function Sync-Path {
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user"
}

Write-Host 'PrintAgent - đang chuẩn bị môi trường' -ForegroundColor Cyan

if ((Get-NodeMajor) -lt 20) {
    Write-Host 'Chưa có Node.js 20 trở lên, đang cài...' -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    } elseif (Get-Command choco -ErrorAction SilentlyContinue) {
        choco install -y nodejs-lts
    } else {
        Start-Process 'https://nodejs.org/en/download'
        throw 'Máy chưa có winget lẫn choco. Cài Node LTS từ trang vừa mở rồi chạy lại install.ps1.'
    }
    Sync-Path
    if ((Get-NodeMajor) -lt 20) {
        throw 'Đã cài Node nhưng cửa sổ này chưa nhận. Đóng PowerShell, mở lại rồi chạy lại install.ps1.'
    }
}

Write-Host "Node $(node -v) sẵn sàng" -ForegroundColor Green

Push-Location $root
try {
    if (Get-Command yarn -ErrorAction SilentlyContinue) {
        yarn install
    } else {
        npm install
    }
    if ($LASTEXITCODE -ne 0) { throw 'Cài dependencies thất bại.' }

    Write-Host 'Đang khởi động agent, trình duyệt sẽ tự mở màn hình cài đặt...' -ForegroundColor Cyan
    node bin/printagent.js start
} finally {
    Pop-Location
}
