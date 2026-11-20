$ErrorActionPreference = 'Stop'
$Migration = Join-Path $PSScriptRoot '..\cloudflare\d1\migrations\0001_customer_website_publications.sql'
if (-not (Test-Path $Migration)) { throw "Migration file not found: $Migration" }
npx.cmd wrangler d1 execute vijay-visuals-marketplace --remote --file $Migration
if ($LASTEXITCODE -ne 0) { throw 'D1 migration failed. Review the Wrangler output above.' }
Write-Host 'Customer website publishing tables are ready.' -ForegroundColor Green
