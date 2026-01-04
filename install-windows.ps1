param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [object[]]$Args
)

$ErrorActionPreference = 'Stop'

$target = Join-Path $PSScriptRoot 'scripts\install-windows.ps1'
if (!(Test-Path -LiteralPath $target)) {
  throw "install-windows.ps1 not found: $target"
}

& $target @Args
exit $LASTEXITCODE
