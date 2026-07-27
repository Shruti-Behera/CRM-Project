# Builds the React client and places it in Server/wwwroot, where the API
# serves it. Run from the repo root:  powershell -File deploy\build-client.ps1
$ErrorActionPreference = "Stop"
Push-Location "$PSScriptRoot\..\client"
npm install
npm run build
Pop-Location
$target = "$PSScriptRoot\..\Server\wwwroot"
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
Copy-Item "$PSScriptRoot\..\client\dist" $target -Recurse
Write-Host "Web app copied to Server\wwwroot"
