param(
  [switch]$InstallGit,
  [switch]$InstallNode,
  [switch]$InstallPnpm,
  [switch]$InstallUiDeps,
  [switch]$InstallRootDeps,
  [ValidateSet('none','memurai','wsl2','docker')] [string]$Redis = 'none',
  [ValidateSet('none','wsl2','docker')] [string]$Neo4j = 'none',
  [string]$WslDistro = 'Ubuntu',
  [object]$AutoElevate = $true,
  [switch]$Interactive,
  [string]$LogPath = '',
  [switch]$Pause,
  [string]$NodeVersion = $env:NODE_VERSION,
  [ValidateSet('auto','latest','9')] [string]$PnpmVersion = '9'
)

$ErrorActionPreference = 'Stop'

# Ensure consistent console output (does not affect script parsing).
try {
  $OutputEncoding = [System.Text.Encoding]::UTF8
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

function Test-WSLSystemd([string]$Distro) {
  try {
    & wsl -d $Distro -- bash -lc 'test -d /run/systemd/system' 2>$null | Out-Null
    $code = $LASTEXITCODE
    return ($null -eq $code -or $code -eq 0)
  } catch {
    return $false
  }
}

function Warn-RedisWSL2Config([string]$Distro) {
  try {
    & wsl -d $Distro -- bash -lc "test -f /etc/redis/redis.conf && grep -qE '^bind[[:space:]].*::1' /etc/redis/redis.conf" 2>$null | Out-Null
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -eq 0) {
      Write-Host (T('\u63d0\u793a\uff1a\u68c0\u6d4b\u5230 /etc/redis/redis.conf \u4e2d\u5305\u542b IPv6 \u7684 ::1 bind\uff0c\u90e8\u5206 WSL \u73af\u5883\u4e0b\u53ef\u80fd\u5bfc\u81f4 redis-server \u542f\u52a8\u5931\u8d25\uff08Cannot assign requested address\uff09\u3002\u5982\u679c\u542f\u52a8\u5931\u8d25\uff0c\u53ef\u7528\u4e0b\u9762\u547d\u4ee4\u53bb\u6389 ::1\uff1a')) -ForegroundColor Yellow
      Write-Host (T('  wsl -d Ubuntu -- sudo sed -i -E "s/^bind[[:space:]]+127\\.0\\.0\\.1[[:space:]]+(-)?::1/bind 127.0.0.1/" /etc/redis/redis.conf')) -ForegroundColor DarkGray
    }
  } catch {
  }
}

function Warn-RedisWSL2PortInUse([string]$Distro) {
  try {
    $cmd = "sudo ss -ltnp | grep ':6379 ' || true"
    $out = & wsl -d $Distro -- bash -lc $cmd 2>$null
    $text = ([string]($out -join "`n")).Trim()
    if (-not [string]::IsNullOrWhiteSpace($text)) {
      Write-Host (T('\u63d0\u793a\uff1a\u68c0\u6d4b\u5230 6379 \u7aef\u53e3\u5df2\u88ab\u5360\u7528\uff0credis-server \u4f1a\u56e0\u4e3a Address already in use \u542f\u52a8\u5931\u8d25\u3002\u8bf7\u5148\u505c\u6389\u5360\u7528\u8005\uff08\u53ef\u80fd\u662f\u4e4b\u524d\u624b\u52a8\u542f\u52a8\u7684 redis\uff09\uff0c\u6216\u8005\u4fee\u6539 redis \u914d\u7f6e\u7aef\u53e3\u3002\u5f53\u524d\u5360\u7528\u60c5\u51b5\uff1a')) -ForegroundColor Yellow
      Write-Host $text -ForegroundColor DarkGray
      Write-Host (T('\u5efa\u8bae\uff1a\u53ef\u4ee5\u5148\u5c1d\u8bd5\u6267\u884c\uff1awsl -d Ubuntu -- sudo pkill redis-server\uff0c\u518d\u91cd\u542f\u670d\u52a1\uff1awsl -d Ubuntu -- sudo systemctl restart redis-server\u3002')) -ForegroundColor Yellow
    }
  } catch {
  }
}

function Ensure-Neo4jWSL2 {
  Ensure-Elevated 'Install WSL2 and Neo4j (WSL)'

  if (!(Command-Exists 'wsl')) {
    throw 'wsl not found. Please ensure your Windows supports WSL2 (Windows 10 2004+ / Windows 11).'
  }

  $distro = $WslDistro
  $hadDistro = (Test-WSLDistroInstalled $distro)
  if (-not $hadDistro) {
    Write-Host ('[INFO] WSL distro not found: {0}. Installing...' -f $distro) -ForegroundColor Yellow
    try {
      Run 'wsl' @('--install','-d', $distro)
    } catch {
    }
  }

  if (-not (Test-WSLDistroInstalled $distro)) {
    throw ('WSL distro not found: {0}. You may need to reboot and rerun: {1} -Neo4j wsl2 -WslDistro {0}' -f $distro, $PSCommandPath)
  }

  if (-not (Test-WSLDistroReady $distro)) {
    throw ('WSL distro {0} is installed but not ready. Please open "{0}" once to finish initialization, or reboot, then rerun: {1} -Neo4j wsl2 -WslDistro {0}' -f $distro, $PSCommandPath)
  }

  try {
    & wsl -d $distro -- bash -lc "dpkg -l | grep -qE '^ii[[:space:]]+neo4j'" 2>$null | Out-Null
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -eq 0) {
      $script:Neo4jWsl2Prepared = $true
      Run 'wsl' @('-d', $distro,'-u','root','--','bash','-lc', 'set -e; service neo4j stop >/dev/null 2>&1 || true; pkill -f neo4j >/dev/null 2>&1 || true; neo4j --version 2>/dev/null || true; neo4j-admin --version 2>/dev/null || true')
      return
    }
  } catch {
  }

  $installScript = @'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y wget gnupg ca-certificates openjdk-17-jre-headless
install -d -m 0755 /etc/apt/keyrings
rm -f /etc/apt/keyrings/neo4j.gpg
wget -qO- https://debian.neo4j.com/neotechnology.gpg.key | gpg --yes --dearmor -o /etc/apt/keyrings/neo4j.gpg
chmod 0644 /etc/apt/keyrings/neo4j.gpg
echo "deb [signed-by=/etc/apt/keyrings/neo4j.gpg] https://debian.neo4j.com stable 5" > /etc/apt/sources.list.d/neo4j.list
apt-get update
apt-cache policy neo4j || true
if ! apt-cache show neo4j 2>/dev/null | grep -qE '^Package:[[:space:]]+neo4j$'; then
  echo 'NEO4J_PKG_NOT_FOUND'
  exit 42
fi
apt-get install -y neo4j
# do not start service
service neo4j stop >/dev/null 2>&1 || true
pkill -f neo4j >/dev/null 2>&1 || true
neo4j --version 2>/dev/null || true
neo4j-admin --version 2>/dev/null || true
dpkg -l | grep -E '^ii[[:space:]]+neo4j'
'@

  $installScript = $installScript -replace "`r", ""
  try {
    $installScript = ((($installScript -split "`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }) -join '; ')
  } catch {
  }

  $args = @('-d', $distro,'-u','root','--','bash','-lc', $installScript)
  Write-Host "[RUN] wsl $($args -join ' ')" -ForegroundColor DarkGray
  & wsl @args
  $code2 = $LASTEXITCODE
  if ($null -eq $code2) { $code2 = 0 }
  if ($code2 -eq 42) {
    $script:Neo4jWsl2Prepared = $false
    Write-Host (T('\u672a\u5728\u5f53\u524d Ubuntu \u7248\u672c\u7684 apt \u6e90\u4e2d\u627e\u5230 neo4j \u5305\uff08NEO4J_PKG_NOT_FOUND\uff09\uff0c\u5df2\u8df3\u8fc7 WSL2 \u81ea\u52a8\u5b89\u88c5\u3002')) -ForegroundColor Yellow
    Write-Host (T('\u63a8\u8350\uff1a\u4f7f\u7528 -Neo4j docker \u6216\u8005\u4f7f\u7528 Ubuntu 22.04 \u53d1\u884c\u7248\u518d\u5c1d\u8bd5\u3002')) -ForegroundColor Yellow
    return
  }
  if ($code2 -ne 0) {
    throw ('Failed to install Neo4j in WSL({0}). Ensure network connectivity then rerun: {1} -Neo4j wsl2 -WslDistro {0}' -f $distro, $PSCommandPath)
  }
  $script:Neo4jWsl2Prepared = $true
}

$script:RelaunchParameters = @{
}
foreach ($k in $PSBoundParameters.Keys) {
  $script:RelaunchParameters[$k] = $PSBoundParameters[$k]
}

$script:TranscriptStarted = $false
 $script:LogPath = $LogPath
 $script:RelaunchNoExit = $false

function T([string]$UnicodeEscaped) {
  return [regex]::Unescape($UnicodeEscaped)
}

function Coerce-Bool([object]$Value, [bool]$DefaultValue = $true) {
  if ($null -eq $Value) { return $DefaultValue }
  if ($Value -is [bool]) { return [bool]$Value }
  if ($Value -is [int]) { return ([int]$Value -ne 0) }
  if ($Value -is [double]) { return ([double]$Value -ne 0) }

  $s = [string]$Value
  if ([string]::IsNullOrWhiteSpace($s)) { return $DefaultValue }
  $t = $s.Trim().ToLowerInvariant()

  if ($t -in @('1','true','y','yes','on','ok','okay')) { return $true }
  if ($t -in @('0','false','n','no','off')) { return $false }
  if ($t -eq 'system.string') { return $DefaultValue }
  return $DefaultValue
}

$AutoElevate = Coerce-Bool $AutoElevate $true
$script:RelaunchParameters['AutoElevate'] = $AutoElevate

function Write-Section([string]$Title) {
  Write-Host "";
  Write-Host "============================================================" -ForegroundColor DarkGray
  Write-Host $Title -ForegroundColor Cyan
  Write-Host "============================================================" -ForegroundColor DarkGray
}

function Is-Admin {
  try {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $p = New-Object Security.Principal.WindowsPrincipal($id)
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  } catch {
    return $false
  }
}

function Is-Yes([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) { return $false }
  $t = $Text.Trim().ToLowerInvariant()
  return ($t -match '^(y|yes|ok|okay)$')
}

function Quote-Arg([string]$s) {
  if ($null -eq $s) { return '""' }
  $t = [string]$s
  if ($t -match '[\s"`]' ) {
    return '"' + ($t -replace '"', '`"') + '"'
  }
  return $t
}

function Build-RelaunchArgumentList {
  $out = @('-NoProfile','-ExecutionPolicy','Bypass')
  if ($script:RelaunchNoExit) {
    $out += '-NoExit'
  }
  $out += @('-File', (Quote-Arg $PSCommandPath))
  foreach ($k in $script:RelaunchParameters.Keys) {
    $v = $script:RelaunchParameters[$k]

    if ($v -is [System.Management.Automation.SwitchParameter]) {
      if ([bool]$v) { $out += ('-' + $k) }
      continue
    }

    if ($null -eq $v) {
      continue
    }

    if ($v -is [bool]) {
      $out += ('-' + $k + ':' + ([string]$v).ToLower())
      continue
    }

    if ($v -is [System.Array]) {
      $out += ('-' + $k)
      foreach ($item in $v) {
        $out += (Quote-Arg ([string]$item))
      }
      continue
    }

    $out += ('-' + $k)
    $out += (Quote-Arg ([string]$v))
  }
  return ($out -join ' ')
}

function Ensure-Logging {
  if ($script:TranscriptStarted) { return }

  try {
    $repoRoot = Get-RepoRoot
    if ([string]::IsNullOrWhiteSpace($script:LogPath)) {
      $logDir = Join-Path $repoRoot 'logs'
      Ensure-Directory $logDir
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $script:LogPath = Join-Path $logDir ("install-windows-$stamp.log")
    } else {
      $parent = Split-Path -Parent $script:LogPath
      if ($parent) { Ensure-Directory $parent }
    }

    # Make sure relaunch process shares the same log path.
    $LogPath = $script:LogPath
    $script:RelaunchParameters['LogPath'] = $script:LogPath

    Start-Transcript -Path $script:LogPath -Append | Out-Null
    $script:TranscriptStarted = $true
  } catch {
    try {
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $script:LogPath = Join-Path $env:TEMP ("install-windows-$stamp.log")
      $LogPath = $script:LogPath
      $script:RelaunchParameters['LogPath'] = $script:LogPath
      Start-Transcript -Path $script:LogPath -Append | Out-Null
      $script:TranscriptStarted = $true
    } catch {
      Write-Host ((T('\u3010\u8b66\u544a\u3011\u65e5\u5fd7\u521d\u59cb\u5316\u5931\u8d25\uff0c\u5c06\u7ee7\u7eed\u8fd0\u884c\uff0c\u4f46\u65e0\u6cd5\u5199\u5165\u65e5\u5fd7\u6587\u4ef6\uff1a') + $_.Exception.Message)) -ForegroundColor Yellow
    }
  }

  if ([string]::IsNullOrWhiteSpace($script:LogPath)) {
    try {
      $stamp2 = Get-Date -Format 'yyyyMMdd-HHmmss'
      $script:LogPath = Join-Path $env:TEMP ("install-windows-$stamp2.log")
      $LogPath = $script:LogPath
      $script:RelaunchParameters['LogPath'] = $script:LogPath
    } catch {
    }
  }
}

function Sync-RelaunchParameters {
  $script:RelaunchParameters['InstallGit'] = [switch]$InstallGit
  $script:RelaunchParameters['InstallNode'] = [switch]$InstallNode
  $script:RelaunchParameters['InstallPnpm'] = [switch]$InstallPnpm
  $script:RelaunchParameters['InstallUiDeps'] = [switch]$InstallUiDeps
  $script:RelaunchParameters['InstallRootDeps'] = [switch]$InstallRootDeps
  $script:RelaunchParameters['Interactive'] = [switch]$Interactive
  $script:RelaunchParameters['Redis'] = $Redis
  $script:RelaunchParameters['Neo4j'] = $Neo4j
  $script:RelaunchParameters['WslDistro'] = $WslDistro
  $script:RelaunchParameters['AutoElevate'] = [bool]$AutoElevate
  if (-not [string]::IsNullOrWhiteSpace($script:LogPath)) {
    $LogPath = $script:LogPath
    $script:RelaunchParameters['LogPath'] = $script:LogPath
  }
  if ($Pause) {
    $script:RelaunchParameters['Pause'] = [switch]$true
  } else {
    if ($script:RelaunchParameters.ContainsKey('Pause')) { $script:RelaunchParameters.Remove('Pause') }
  }
}

function Ensure-Elevated([string]$Reason) {
  if (Is-Admin) { return }
  if (-not $AutoElevate) { return }

  Ensure-Logging
  Sync-RelaunchParameters

  if ([string]::IsNullOrWhiteSpace($Reason)) {
    $Reason = (T('\u7cfb\u7edf\u7ea7\u5b89\u88c5'))
  }

  Write-Host (T('\u3010\u63d0\u793a\u3011\u9700\u8981\u7ba1\u7406\u5458\u6743\u9650\uff1a') + $Reason) -ForegroundColor Yellow
  Write-Host ((T('\u65e5\u5fd7\u6587\u4ef6\uff1a') + $script:LogPath)) -ForegroundColor DarkGray

  $script:RelaunchNoExit = [Environment]::UserInteractive
  $argLine = Build-RelaunchArgumentList
  $script:RelaunchNoExit = $false
  $p = $null
  $started = $false
  try {
    $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argLine -Wait -PassThru
    $started = $true
  } catch {
    try {
      Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argLine -Wait
      $started = $true
    } catch {
      $started = $false
    }
  }

  if (-not $started) {
    Write-Host (T('\u3010\u9519\u8bef\u3011\u65e0\u6cd5\u83b7\u53d6\u7ba1\u7406\u5458\u6743\u9650\uff0c\u53ef\u80fd\u662f\u4f60\u53d6\u6d88\u4e86 UAC \u63d0\u793a\uff0c\u6216\u7cfb\u7edf\u963b\u6b62\u4e86\u63d0\u6743\u3002')) -ForegroundColor Red
    Write-Host ((T('\u65e5\u5fd7\u6587\u4ef6\uff1a') + $script:LogPath)) -ForegroundColor DarkGray
    throw (T('\u63d0\u6743\u5931\u8d25\uff0c\u8bf7\u4ee5\u7ba1\u7406\u5458\u8eab\u4efd\u8fd0\u884c PowerShell \u540e\u91cd\u8bd5\u3002'))
  }

  if ($null -ne $p) {
    try {
      Write-Host ((T('\u3010\u63d0\u793a\u3011\u7ba1\u7406\u5458\u7a97\u53e3\u5df2\u7ed3\u675f\uff0c\u9000\u51fa\u7801\uff1a') + [string]$p.ExitCode)) -ForegroundColor Yellow
      Write-Host ((T('\u65e5\u5fd7\u6587\u4ef6\uff1a') + $script:LogPath)) -ForegroundColor DarkGray
    } catch {
    }
  } else {
    Write-Host (T('\u3010\u63d0\u793a\u3011\u7ba1\u7406\u5458\u7a97\u53e3\u5df2\u7ed3\u675f\uff08\u672a\u80fd\u83b7\u53d6\u9000\u51fa\u7801\uff09\u3002')) -ForegroundColor Yellow
    Write-Host ((T('\u65e5\u5fd7\u6587\u4ef6\uff1a') + $script:LogPath)) -ForegroundColor DarkGray
  }

  if ($Pause) {
    try { Read-Host (T('\u6309\u56de\u8f66\u952e\u8fd4\u56de')) | Out-Null } catch {}
  }

  if ($script:TranscriptStarted) {
    try { Stop-Transcript | Out-Null } catch {}
    $script:TranscriptStarted = $false
  }
  exit 0
}

function Command-Exists([string]$Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  return $null -ne $cmd
}

function Run([string]$File, [string[]]$CommandArgs, [string]$Cwd = $null) {
  Write-Host "[RUN] $File $($CommandArgs -join ' ')" -ForegroundColor DarkGray

  $pushed = $false
  try {
    if ($Cwd) {
      Push-Location -LiteralPath $Cwd
      $pushed = $true
    }

    # Use PowerShell command resolution so that pnpm.cmd/npm.cmd/winget (PATHEXT) work correctly.
    & $File @CommandArgs
    $code = $LASTEXITCODE

    if ($null -ne $code -and $code -ne 0) {
      throw "Command failed ($code): $File $($CommandArgs -join ' ')"
    }
  } finally {
    if ($pushed) { Pop-Location }
  }
}

function Ensure-Directory([string]$Dir) {
  if (!(Test-Path -LiteralPath $Dir)) {
    New-Item -ItemType Directory -Force -Path $Dir | Out-Null
  }
}

function Get-RepoRoot {
  $here = $null
  try {
    if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
      $here = $PSScriptRoot
    } elseif (-not [string]::IsNullOrWhiteSpace($PSCommandPath)) {
      $here = Split-Path -Parent $PSCommandPath
    } else {
      $here = (Get-Location).Path
    }
  } catch {
    $here = (Get-Location).Path
  }
  try {
    return (Resolve-Path (Join-Path $here '..')).Path
  } catch {
    return $here
  }
}

function Ensure-Winget {
  return (Command-Exists 'winget')
}

function Ensure-Git {
  if (Command-Exists 'git') {
    Write-Host "[OK] git already installed: $(git --version)" -ForegroundColor Green
    return
  }

  if (!(Ensure-Winget)) {
    throw "git not found and winget is unavailable. Please install Git manually: https://git-scm.com/download/win"
  }

  Ensure-Elevated 'Install Git'

  Run 'winget' @('install','--id','Git.Git','-e','--source','winget','--accept-package-agreements','--accept-source-agreements')
  if (!(Command-Exists 'git')) {
    throw "Git installation finished but git is still not on PATH. Please reopen PowerShell and retry."
  }
  Write-Host "[OK] git installed: $(git --version)" -ForegroundColor Green
}

function Parse-NodeMajor([string]$VersionText) {
  if (!$VersionText) { return $null }
  $v = $VersionText.Trim()
  if ($v.StartsWith('v')) { $v = $v.Substring(1) }
  $parts = $v.Split('.')
  if ($parts.Length -lt 1) { return $null }
  try { return [int]$parts[0] } catch { return $null }
}

function Ensure-Node {
  if (Command-Exists 'node') {
    $ver = (node -v)
    $major = Parse-NodeMajor $ver
    if ($major -ge 18) {
      Write-Host "[OK] Node.js already installed: $ver" -ForegroundColor Green
      return
    }
    Write-Host "[WARN] Node.js version is $ver (<18). Will attempt to install/upgrade." -ForegroundColor Yellow
  }

  $useWinget = Ensure-Winget
  if ($useWinget) {
    try {
      Ensure-Elevated 'Install/Upgrade Node.js via winget'
      Run 'winget' @('install','--id','OpenJS.NodeJS.LTS','-e','--source','winget','--accept-package-agreements','--accept-source-agreements')
      if (Command-Exists 'node') {
        $ver2 = (node -v)
        $major2 = Parse-NodeMajor $ver2
        if ($major2 -ge 18) {
          Write-Host "[OK] Node.js installed via winget: $ver2" -ForegroundColor Green
          return
        }
      }
      Write-Host "[WARN] winget install finished but Node.js still not available or version too low; falling back to portable Node." -ForegroundColor Yellow
    } catch {
      Write-Host "[WARN] winget Node.js install failed; falling back to portable Node." -ForegroundColor Yellow
    }
  }

  # Portable Node fallback (no admin required)
  $repoRoot = Get-RepoRoot
  $cacheDir = Join-Path $repoRoot '.cache\node-bootstrap'
  Ensure-Directory $cacheDir

  $v = $NodeVersion
  if ([string]::IsNullOrWhiteSpace($v)) { $v = '20.18.0' }

  $arch = $env:PROCESSOR_ARCHITECTURE
  if ($arch -ne 'AMD64') {
    throw "Unsupported architecture for portable Node bootstrap: $arch. Please install Node.js 18+ manually."
  }

  $zipName = "node-v$v-win-x64.zip"
  $url = "https://nodejs.org/dist/v$v/$zipName"
  $zipPath = Join-Path $cacheDir $zipName
  $extractDir = Join-Path $cacheDir "node-v$v-win-x64"

  if (!(Test-Path -LiteralPath $extractDir)) {
    Write-Host "Downloading portable Node.js $v ..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri $url -OutFile $zipPath

    Write-Host "Extracting portable Node.js..." -ForegroundColor Cyan
    Expand-Archive -LiteralPath $zipPath -DestinationPath $cacheDir -Force
  }

  $nodeBin = Join-Path $extractDir 'node.exe'
  if (!(Test-Path -LiteralPath $nodeBin)) {
    throw "Portable Node bootstrap failed: $nodeBin not found"
  }

  $env:PATH = (Join-Path $extractDir '') + ';' + $env:PATH

  if (!(Command-Exists 'node')) {
    throw "Portable Node was added to PATH for this session, but node is still not found."
  }

  $ver3 = (node -v)
  $major3 = Parse-NodeMajor $ver3
  if ($major3 -lt 18) {
    throw "Portable Node version is not supported: $ver3"
  }

  Write-Host "[OK] Using portable Node.js: $ver3 (session PATH only)" -ForegroundColor Green
  Write-Host "     If you open a new terminal, you may need to rerun this script (portable node is not permanently installed)." -ForegroundColor DarkGray
}

function Ensure-Pnpm {
  if (Command-Exists 'pnpm') {
    Write-Host "[OK] pnpm already available: $(pnpm -v)" -ForegroundColor Green
    return
  }

  if (!(Command-Exists 'npm')) {
    throw "npm not found. Node.js installation may have failed."
  }

  # Prefer corepack when available (ships with Node.js)
  if (Command-Exists 'corepack') {
    try {
      Run 'corepack' @('enable')
      if ($PnpmVersion -eq 'latest') {
        Run 'corepack' @('prepare','pnpm@latest','--activate')
      } elseif ($PnpmVersion -eq '9') {
        Run 'corepack' @('prepare','pnpm@9','--activate')
      } else {
        Run 'corepack' @('prepare','pnpm@latest','--activate')
      }

      if (Command-Exists 'pnpm') {
        Write-Host "[OK] pnpm enabled via corepack: $(pnpm -v)" -ForegroundColor Green
        return
      }
    } catch {
      Write-Host "[WARN] corepack flow failed, falling back to npm -g install pnpm" -ForegroundColor Yellow
    }
  }

  Run 'npm' @('i','-g','pnpm')
  if (!(Command-Exists 'pnpm')) {
    throw "pnpm installation finished but pnpm is still not on PATH. Please reopen PowerShell and retry."
  }
  Write-Host "[OK] pnpm installed: $(pnpm -v)" -ForegroundColor Green
}

function Ensure-DockerDesktop {
  if (Command-Exists 'docker') {
    return
  }
  if (!(Ensure-Winget)) {
    throw "docker not found and winget is unavailable. Please install Docker Desktop manually."
  }

  Ensure-Elevated 'Install Docker Desktop'
  Run 'winget' @('install','--id','Docker.DockerDesktop','-e','--source','winget','--accept-package-agreements','--accept-source-agreements')
}

function Get-WSLDistros {
  if (!(Command-Exists 'wsl')) { return @() }
  $out = @()
  try {
    $lines = & wsl -l -q 2>$null
    $code = $LASTEXITCODE
    if ($null -ne $code -and $code -ne 0) { return @() }
    foreach ($ln in @($lines)) {
      $t = ([string]$ln).Trim()
      if ($t) { $out += $t }
    }
  } catch {
    return @()
  }
  return $out
}

function Test-WSLDistroInstalled([string]$Name) {
  $list = Get-WSLDistros
  foreach ($d in $list) {
    if ($d.Trim().ToLowerInvariant() -eq $Name.Trim().ToLowerInvariant()) { return $true }
  }
  return $false
}

function Test-WSLDistroReady([string]$Name) {
  try {
    & wsl -d $Name -- bash -lc 'echo ready' 2>$null | Out-Null
    $code = $LASTEXITCODE
    return ($null -eq $code -or $code -eq 0)
  } catch {
    return $false
  }
}

function Ensure-RedisWSL2 {
  Ensure-Elevated 'Install WSL2 and Redis (WSL)'

  if (!(Command-Exists 'wsl')) {
    throw 'wsl not found. Please ensure your Windows supports WSL2 (Windows 10 2004+ / Windows 11).'
  }

  $distro = $WslDistro
  $hadDistro = (Test-WSLDistroInstalled $distro)

  if (-not $hadDistro) {
    Write-Host ('[INFO] WSL distro not found: {0}. Installing...' -f $distro) -ForegroundColor Yellow
    try {
      Run 'wsl' @('--install','-d', $distro)
    } catch {
    }
  }

  if (-not (Test-WSLDistroInstalled $distro)) {
    throw ('WSL distro not found: {0}. You may need to reboot and rerun: {1} -Redis wsl2 -WslDistro {0}' -f $distro, $PSCommandPath)
  }

  if (-not (Test-WSLDistroReady $distro)) {
    throw ('WSL distro {0} is installed but not ready. Please open "{0}" once to finish initialization, or reboot, then rerun: {1} -Redis wsl2 -WslDistro {0}' -f $distro, $PSCommandPath)
  }

  try {
    & wsl -d $distro -- bash -lc 'command -v redis-server >/dev/null 2>&1 && command -v redis-cli >/dev/null 2>&1' 2>$null | Out-Null
    $code = $LASTEXITCODE
    if ($null -eq $code -or $code -eq 0) {
      Run 'wsl' @('-d', $distro,'-u','root','--','bash','-lc', 'set -e; service redis-server stop >/dev/null 2>&1 || true; pkill redis-server >/dev/null 2>&1 || true; redis-server --version; redis-cli --version')
      Warn-RedisWSL2Config $distro
      Warn-RedisWSL2PortInUse $distro
      return
    }
  } catch {
  }

  $installScript = @'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y redis-server redis-tools
# do not start service
service redis-server stop >/dev/null 2>&1 || true
pkill redis-server >/dev/null 2>&1 || true
redis-server --version
redis-cli --version
'@

  # Ensure the script is LF-only (WSL bash is sensitive to CRLF in -lc strings)
  $installScript = $installScript -replace "`r", ""

  try {
    $installScript = ((($installScript -split "`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }) -join '; ')
  } catch {
  }

  try {
    Run 'wsl' @('-d', $distro,'-u','root','--','bash','-lc', $installScript)
    Warn-RedisWSL2Config $distro
    Warn-RedisWSL2PortInUse $distro
  } catch {
    throw ('Failed to install Redis in WSL({0}). Ensure network connectivity then rerun: {1} -Redis wsl2 -WslDistro {0}' -f $distro, $PSCommandPath)
  }
}

function Ensure-RedisDocker {
  Ensure-DockerDesktop

  if (!(Command-Exists 'docker')) {
    throw ('docker CLI not found. Docker Desktop may require a reboot or first-time setup. Then rerun: {0} -Redis docker' -f $PSCommandPath)
  }

  try {
    Run 'docker' @('info')
  } catch {
    throw ('docker is installed but not ready (engine may not be running). Start Docker Desktop and retry: {0} -Redis docker' -f $PSCommandPath)
  }

  $name = 'sentra-redis'
  $exists = $false
  try {
    Run 'docker' @('inspect', $name)
    $exists = $true
  } catch {
    $exists = $false
  }

  Run 'docker' @('pull','redis:7-alpine')

  if ($exists) {
    return
  }

  Run 'docker' @('create','--name', $name,'-p','6379:6379','redis:7-alpine')
}

function Install-PnpmDeps([string]$Dir) {
  if (!(Test-Path -LiteralPath $Dir)) {
    throw (T('\u76ee\u5f55\u4e0d\u5b58\u5728\uff1a') + $Dir)
  }

  $lock = Join-Path $Dir 'pnpm-lock.yaml'
  $pnpmArgs = @('install')
  if (Test-Path -LiteralPath $lock) {
    $pnpmArgs += @('--frozen-lockfile')
    Write-Host "[INFO] pnpm-lock.yaml detected, using --frozen-lockfile" -ForegroundColor DarkGray
  } else {
    Write-Host "[WARN] pnpm-lock.yaml not found, using normal install" -ForegroundColor Yellow
  }

  Run 'pnpm' $pnpmArgs $Dir
}

function Ensure-UiDeps {
  $repoRoot = Get-RepoRoot
  $uiDir = Join-Path $repoRoot 'sentra-config-ui'
  if (!(Test-Path -LiteralPath (Join-Path $uiDir 'package.json'))) {
    throw "sentra-config-ui package.json not found: $uiDir"
  }

  Write-Section "Installing sentra-config-ui dependencies"
  Install-PnpmDeps $uiDir
}

function Ensure-RootDeps {
  $repoRoot = Get-RepoRoot
  if (!(Test-Path -LiteralPath (Join-Path $repoRoot 'package.json'))) {
    throw "Root package.json not found: $repoRoot"
  }

  Write-Section "Installing repo root dependencies"
  Install-PnpmDeps $repoRoot
}

function Redis-Guidance([string]$Mode) {
  Write-Section (T('\u53ef\u9009\u7ec4\u4ef6\uff1aRedis'))
  Write-Host (T('\u8bf4\u660e\uff1a\u672c\u811a\u672c\u9ed8\u8ba4\u4e0d\u5b89\u88c5\u4e5f\u4e0d\u542f\u52a8 Redis\uff0c\u4f60\u53ef\u4ee5\u9009\u62e9\u4e0b\u9762\u4e00\u79cd\u65b9\u5f0f\u3002')) -ForegroundColor Gray
  Write-Host (T('  - Memurai\uff1aWindows \u539f\u751f\uff08\u901a\u5e38\u9700\u5b89\u88c5\u5668\u3001\u53ef\u80fd\u6709\u8bb8\u53ef\u63d0\u793a\uff09')) -ForegroundColor Gray
  Write-Host (T('  - WSL2\uff1a\u5728 Ubuntu \u4e2d\u5b89\u88c5')) -ForegroundColor Gray
  Write-Host (T('  - Docker\uff1a\u62c9\u53d6\u955c\u50cf\u5e76\u521b\u5efa\u5bb9\u5668\uff08\u4e0d\u81ea\u52a8\u542f\u52a8\uff09')) -ForegroundColor Gray
  Write-Host "";
  Write-Host (T('\u53c2\u8003\uff1a')) -ForegroundColor Gray
  Write-Host "  - https://redis.io/docs/latest/operate/oss_and_stack/install/archive/install-redis/install-redis-on-windows/" -ForegroundColor DarkGray
  Write-Host "";

  switch ($Mode) {
    'none' {
      Write-Host (T('\u5df2\u9009\u62e9\uff1a\u4e0d\u5b89\u88c5 Redis')) -ForegroundColor Yellow
      Write-Host (T('\u5982\u9700\u5b89\u88c5\uff0c\u8bf7\u4f7f\u7528\uff1a-Redis wsl2 | -Redis docker | -Redis memurai')) -ForegroundColor Yellow
    }
    'memurai' {
      Write-Host (T('Memurai \u901a\u5e38\u4ee5\u5b89\u88c5\u5668\u5f62\u5f0f\u63d0\u4f9b\uff0c\u53ef\u80fd\u9700\u8981\u4ea4\u4e92\u5b89\u88c5/\u8bb8\u53ef\u786e\u8ba4\u3002')) -ForegroundColor Yellow
      Write-Host (T('\u5efa\u8bae\uff1a\u524d\u5f80 https://www.memurai.com/ \u4e0b\u8f7d\u5e76\u5b89\u88c5\u3002')) -ForegroundColor Yellow
    }
    'wsl2' {
      Ensure-RedisWSL2
      Write-Host (T('\u63d0\u793a\uff1a\u4ee5\u4e0b\u547d\u4ee4\u8bf7\u5728 Windows PowerShell \u4e2d\u6267\u884c\uff0c\u5fc5\u987b\u4ee5 wsl -d \u53d1\u884c\u7248 -- \u5f00\u5934\uff1b\u4e0d\u8981\u76f4\u63a5\u5728 Windows \u4e2d\u8f93\u5165 systemctl/journalctl\u3002')) -ForegroundColor Yellow
      Write-Host (T('\u4f7f\u7528\u65b9\u5f0f\uff08WSL2\uff09\uff1a')) -ForegroundColor Yellow
      Write-Host (T('  1) \u542f\u52a8 Redis\uff08Ubuntu\uff09\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      if (Test-WSLSystemd $WslDistro) {
        Write-Host (T(' -- sudo systemctl start redis-server')) -ForegroundColor DarkGray
      } else {
        Write-Host (T(' -- sudo service redis-server start')) -ForegroundColor DarkGray
        Write-Host (T('     (\u63d0\u793a\uff1a\u5982\u679c\u4f60\u7684 WSL \u6ca1\u542f\u7528 systemd\uff0c\u5c31\u4e0d\u80fd\u7528 systemctl\uff09')) -ForegroundColor DarkGray
      }
      Write-Host (T('  2) \u505c\u6b62 Redis\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      if (Test-WSLSystemd $WslDistro) {
        Write-Host (T(' -- sudo systemctl stop redis-server')) -ForegroundColor DarkGray
      } else {
        Write-Host (T(' -- sudo service redis-server stop')) -ForegroundColor DarkGray
      }
      Write-Host (T('  3) \u5982\u679c\u542f\u52a8\u5931\u8d25\uff0c\u67e5\u770b\u72b6\u6001\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      if (Test-WSLSystemd $WslDistro) {
        Write-Host (T(' -- sudo systemctl status redis-server -l --no-pager')) -ForegroundColor DarkGray
      } else {
        Write-Host (T(' -- sudo service redis-server status || true')) -ForegroundColor DarkGray
        Write-Host (T(' -- sudo tail -n 200 /var/log/redis/redis-server.log || true')) -ForegroundColor DarkGray
      }
      Write-Host (T('  4) \u67e5\u770b\u65e5\u5fd7\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      if (Test-WSLSystemd $WslDistro) {
        Write-Host (T(' -- sudo journalctl -xeu redis-server --no-pager')) -ForegroundColor DarkGray
      } else {
        Write-Host (T(' -- sudo tail -n 200 /var/log/redis/redis-server.log || true')) -ForegroundColor DarkGray
      }
      Write-Host (T('  5) \u68c0\u67e5\u7aef\u53e3\u5360\u7528\uff086379\uff09\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      Write-Host (T(' -- sudo ss -ltnp | grep 6379 || true')) -ForegroundColor DarkGray
      Write-Host (T('  6) \u5982\u679c\u4f60\u4e0d\u60f3\u7528\u670d\u52a1\u7ba1\u7406\uff0c\u4e5f\u53ef\u4ee5\u76f4\u63a5\u624b\u52a8\u542f\u52a8\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      Write-Host (T(' -- sudo redis-server /etc/redis/redis.conf --daemonize yes')) -ForegroundColor DarkGray
      Write-Host (T('  7) \u5982\u679c\u670d\u52a1\u542f\u52a8\u7acb\u523b\u9000\u51fa\uff0c\u4e14\u65e5\u5fd7\u4e2d\u6709 "Cannot assign requested address" / "::1"\uff0c\u901a\u5e38\u662f WSL \u7981\u7528 IPv6 \u5bfc\u81f4\uff0c\u53ef\u5148\u53bb\u6389 IPv6 bind\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      Write-Host (T(' -- sudo sed -i -E "s/^bind[[:space:]]+127\\.0\\.0\\.1[[:space:]]+(-)?::1/bind 127.0.0.1/" /etc/redis/redis.conf')) -ForegroundColor DarkGray
    }
    'docker' {
      Ensure-RedisDocker
    }
  }
}

function Ensure-Neo4jDocker {
  Ensure-DockerDesktop
  if (!(Command-Exists 'docker')) {
    throw (T('\u672a\u68c0\u6d4b\u5230 docker\uff0c\u65e0\u6cd5\u4ee5 Docker \u65b9\u5f0f\u51c6\u5907 Neo4j\u3002'))
  }

  $pwd = $env:NEO4J_PASSWORD
  if ([string]::IsNullOrWhiteSpace($pwd)) {
    Write-Host (T('\u672a\u8bbe\u7f6e NEO4J_PASSWORD\uff0c\u8df3\u8fc7\u81ea\u52a8\u521b\u5efa\u5bb9\u5668\u3002\u4f60\u53ef\u4ee5\u5148\u5728 .env \u4e2d\u8bbe\u7f6e NEO4J_PASSWORD\uff0c\u518d\u91cd\u65b0\u8fd0\u884c\u6b64\u811a\u672c\u3002')) -ForegroundColor Yellow
    return
  }

  $name = 'sentra-neo4j'
  $exists = $false
  try {
    Run 'docker' @('inspect', $name)
    $exists = $true
  } catch {
    $exists = $false
  }

  Run 'docker' @('pull','neo4j:5')
  if ($exists) {
    return
  }

  $auth = "neo4j/$pwd"
  Run 'docker' @('create','--name', $name,'-p','7474:7474','-p','7687:7687','-e',"NEO4J_AUTH=$auth",'neo4j:5')
}

function Neo4j-Guidance([string]$Mode) {
  Write-Section (T('\u53ef\u9009\u7ec4\u4ef6\uff1aNeo4j'))
  Write-Host (T('\u8bf4\u660e\uff1aSentra RAG \u9700\u8981 Neo4j\uff0c\u672c\u811a\u672c\u9ed8\u8ba4\u4e0d\u5b89\u88c5\u4e5f\u4e0d\u542f\u52a8\uff08\u907f\u514d\u7cfb\u7edf\u670d\u52a1\u6539\u52a8\uff09\u3002')) -ForegroundColor Gray
  Write-Host (T('  - Docker\uff1a\u62c9\u53d6\u955c\u50cf\u5e76\u521b\u5efa\u5bb9\u5668\uff08\u4e0d\u81ea\u52a8\u542f\u52a8\uff09')) -ForegroundColor Gray
  Write-Host (T('  - WSL2\uff1a\u6253\u5f00 Ubuntu\uff0c\u6309\u5b98\u65b9\u6587\u6863\u5b89\u88c5')) -ForegroundColor Gray
  Write-Host "";
  Write-Host (T('\u53c2\u8003\uff1a')) -ForegroundColor Gray
  Write-Host "  - https://neo4j.com/docs/operations-manual/current/installation/" -ForegroundColor DarkGray
  Write-Host "";

  switch ($Mode) {
    'none' {
      Write-Host (T('\u5df2\u9009\u62e9\uff1a\u4e0d\u51c6\u5907 Neo4j')) -ForegroundColor Yellow
    }
    'docker' {
      Ensure-Neo4jDocker
    }
    'wsl2' {
      Ensure-Neo4jWSL2
      if (-not $script:Neo4jWsl2Prepared) {
        Write-Host (T('\u5f53\u524d\u73af\u5883\u65e0\u6cd5\u901a\u8fc7 WSL2 apt \u81ea\u52a8\u5b89\u88c5 Neo4j\uff0c\u5df2\u8df3\u8fc7\u3002\u5982\u9700 Neo4j\uff0c\u63a8\u8350\u4f7f\u7528 Docker\uff1a-Neo4j docker\u3002')) -ForegroundColor Yellow
        return
      }
      Write-Host (T('\u63d0\u793a\uff1a\u4ee5\u4e0b\u547d\u4ee4\u8bf7\u5728 Windows PowerShell \u4e2d\u6267\u884c\uff0c\u5fc5\u987b\u4ee5 wsl -d \u53d1\u884c\u7248 -- \u5f00\u5934\uff1b\u4e0d\u8981\u76f4\u63a5\u5728 Windows \u4e2d\u8f93\u5165 systemctl/journalctl\u3002')) -ForegroundColor Yellow
      Write-Host (T('\u4f7f\u7528\u65b9\u5f0f\uff08WSL2\uff09\uff1a')) -ForegroundColor Yellow
      Write-Host (T('  1) \u8bbe\u7f6e\u521d\u59cb\u5bc6\u7801\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      Write-Host (T(' -- sudo neo4j-admin dbms set-initial-password <\u4f60\u7684\u5bc6\u7801>')) -ForegroundColor DarkGray
      Write-Host (T('  2) \u542f\u52a8 Neo4j\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      if (Test-WSLSystemd $WslDistro) {
        Write-Host (T(' -- sudo systemctl start neo4j')) -ForegroundColor DarkGray
      } else {
        Write-Host (T(' -- sudo service neo4j start')) -ForegroundColor DarkGray
        Write-Host (T('     (\u63d0\u793a\uff1a\u5982\u679c\u4f60\u7684 WSL \u6ca1\u542f\u7528 systemd\uff0c\u5c31\u4e0d\u80fd\u7528 systemctl\uff09')) -ForegroundColor DarkGray
      }
      Write-Host (T('  3) \u67e5\u770b\u72b6\u6001\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      if (Test-WSLSystemd $WslDistro) {
        Write-Host (T(' -- sudo systemctl status neo4j -l --no-pager')) -ForegroundColor DarkGray
      } else {
        Write-Host (T(' -- sudo service neo4j status || true')) -ForegroundColor DarkGray
      }
      Write-Host (T('  4) \u67e5\u770b\u65e5\u5fd7\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      if (Test-WSLSystemd $WslDistro) {
        Write-Host (T(' -- sudo journalctl -xeu neo4j --no-pager')) -ForegroundColor DarkGray
      } else {
        Write-Host (T(' -- sudo tail -n 200 /var/log/neo4j/neo4j.log || true')) -ForegroundColor DarkGray
      }
      Write-Host (T('  5) \u5982\u679c\u6ca1\u6709\u670d\u52a1\u7ba1\u7406\uff0c\u4e5f\u53ef\u4ee5\u624b\u52a8\u524d\u53f0\u8fd0\u884c\uff08\u4f1a\u5360\u7528\u5f53\u524d\u7ec8\u7aef\uff09\uff1awsl -d ')) -NoNewline -ForegroundColor DarkGray
      Write-Host ($WslDistro) -NoNewline -ForegroundColor DarkGray
      Write-Host (T(' -- sudo -u neo4j /usr/share/neo4j/bin/neo4j console')) -ForegroundColor DarkGray
      Write-Host (T('  6) \u8bbf\u95ee\u5730\u5740\uff1ahttp://localhost:7474 \uff08\u5982\u679c\u672a\u901a\uff0c\u8bf7\u786e\u8ba4\u670d\u52a1\u5df2\u542f\u52a8\u4e14\u7aef\u53e3\u662f\u5426\u5bf9 Windows \u53ef\u8bbf\u95ee\uff09')) -ForegroundColor DarkGray
    }
  }
}

function Main {
  $repoRoot = Get-RepoRoot
  if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    try { $repoRoot = (Resolve-Path '.').Path } catch { }
  }

  if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    try {
      if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
      }
    } catch {
    }
  }

  if ([string]::IsNullOrWhiteSpace($repoRoot)) {
    try { $repoRoot = $PSScriptRoot } catch { }
  }

  Ensure-Logging
  if ([string]::IsNullOrWhiteSpace($script:LogPath)) {
    try {
      $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
      $tempBase = $env:TEMP
      if ([string]::IsNullOrWhiteSpace($tempBase)) { $tempBase = $env:TMP }
      if ([string]::IsNullOrWhiteSpace($tempBase)) { $tempBase = $env:USERPROFILE }
      if ([string]::IsNullOrWhiteSpace($tempBase)) { $tempBase = '.' }
      $script:LogPath = Join-Path $tempBase ("install-windows-$stamp.log")
      $LogPath = $script:LogPath
    } catch {
    }
  }

  if ([string]::IsNullOrWhiteSpace($script:LogPath)) {
    try {
      $script:LogPath = Join-Path '.' 'install-windows.log'
      $LogPath = $script:LogPath
    } catch {
    }
  }

  # Default behavior: install the minimum needed to open WebUI.
  $noExplicit = -not ($InstallGit -or $InstallNode -or $InstallPnpm -or $InstallUiDeps -or $InstallRootDeps)
  if ($Interactive -and $noExplicit) {
    $ans = Read-Host 'Install Git? (y/n)'
    if (Is-Yes $ans) { $InstallGit = $true }
    $ans = Read-Host 'Install/ensure Node.js >= 18? (y/n)'
    if (Is-Yes $ans) { $InstallNode = $true } else { $InstallNode = $false }
    $ans = Read-Host 'Install/ensure pnpm? (y/n)'
    if (Is-Yes $ans) { $InstallPnpm = $true } else { $InstallPnpm = $false }
    $ans = Read-Host 'Install sentra-config-ui deps? (y/n)'
    if (Is-Yes $ans) { $InstallUiDeps = $true } else { $InstallUiDeps = $false }
    $ans = Read-Host 'Install repo root deps? (y/n)'
    if (Is-Yes $ans) { $InstallRootDeps = $true }
  }

  if (-not ($InstallGit -or $InstallNode -or $InstallPnpm -or $InstallUiDeps -or $InstallRootDeps)) {
    $InstallNode = $true
    $InstallPnpm = $true
    $InstallUiDeps = $true
  }

  Write-Section (T('Sentra Agent Windows \u5b89\u88c5\u5668\uff08\u4ec5\u5b89\u88c5\u4f9d\u8d56\uff0c\u4e0d\u542f\u52a8\u670d\u52a1\uff09'))
  Write-Host ((T('\u4ed3\u5e93\u76ee\u5f55\uff1a') + $repoRoot)) -ForegroundColor DarkGray
  Write-Host ((T('\u65e5\u5fd7\u6587\u4ef6\uff1a') + $script:LogPath)) -ForegroundColor DarkGray

  if ($InstallGit) {
    Write-Section "Git"
    Ensure-Git
  }

  if ($InstallNode) {
    Write-Section "Node.js"
    Ensure-Node
  }

  if ($InstallPnpm) {
    Write-Section "pnpm"
    Ensure-Pnpm
  }

  if ($InstallUiDeps) {
    Ensure-UiDeps
  }

  if ($InstallRootDeps) {
    Ensure-RootDeps
  }

  # Optional components: ask at the END (avoid asking at the beginning).
  $explicitOptional = ($PSBoundParameters.ContainsKey('Redis') -or $PSBoundParameters.ContainsKey('Neo4j'))
  if ((-not $explicitOptional) -and [Environment]::UserInteractive) {
    try {
      Write-Host "";
      Write-Host (T('\u662f\u5426\u8981\u51c6\u5907\u53ef\u9009\u7ec4\u4ef6\uff1f')) -ForegroundColor Cyan
      Write-Host (T('  Redis\uff1a1=Memurai(\u6307\u5f15) 2=WSL2+Ubuntu(\u9ed8\u8ba4\u63a8\u8350) 3=Docker 0=\u4e0d\u51c6\u5907')) -ForegroundColor Gray
      if ($Redis -eq 'none') {
        $sel = Read-Host (T('\u8bf7\u8f93\u5165 Redis \u9009\u9879 [0-3]\uff08\u9ed8\u8ba4 2\uff09'))
        if ([string]::IsNullOrWhiteSpace($sel)) { $sel = '2' }
        switch ($sel) {
          '1' { $Redis = 'memurai' }
          '2' { $Redis = 'wsl2' }
          '3' { $Redis = 'docker' }
          default { }
        }
      }

      Write-Host (T('  Neo4j\uff1a1=Docker 2=WSL2(\u9ed8\u8ba4\u63a8\u8350) 0=\u4e0d\u51c6\u5907')) -ForegroundColor Gray
      if ($Neo4j -eq 'none') {
        $sel2 = Read-Host (T('\u8bf7\u8f93\u5165 Neo4j \u9009\u9879 [0-2]\uff08\u9ed8\u8ba4 2\uff09'))
        if ([string]::IsNullOrWhiteSpace($sel2)) { $sel2 = '2' }
        switch ($sel2) {
          '1' { $Neo4j = 'docker' }
          '2' { $Neo4j = 'wsl2' }
          default { }
        }
      }
    } catch {
    }
  }

  Sync-RelaunchParameters

  Redis-Guidance $Redis
  Neo4j-Guidance $Neo4j

  Write-Section (T('\u5b8c\u6210'))
  Write-Host (T('\u4f9d\u8d56\u5b89\u88c5\u5b8c\u6210\uff08\u672c\u811a\u672c\u4e0d\u4f1a\u542f\u52a8\u4efb\u4f55\u670d\u52a1\uff09\u3002')) -ForegroundColor Green
  Write-Host (T('\u4e0b\u4e00\u6b65\uff1a\u8bf7\u5728 sentra-config-ui \u4e2d\u624b\u52a8\u542f\u52a8 WebUI\u3002')) -ForegroundColor Gray
  Write-Host ((T('\u65e5\u5fd7\u6587\u4ef6\uff1a') + $script:LogPath)) -ForegroundColor DarkGray

  if ($Pause) {
    try { Read-Host (T('\u6309\u56de\u8f66\u952e\u9000\u51fa')) | Out-Null } catch {}
  }

  if ($script:TranscriptStarted) {
    try { Stop-Transcript | Out-Null } catch {}
    $script:TranscriptStarted = $false
  }
}

Main
