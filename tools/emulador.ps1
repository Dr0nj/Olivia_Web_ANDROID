param(
  [Parameter(Mandatory = $true)][string]$Nome,
  [Parameter(Mandatory = $true)][string]$Avd,
  [Parameter(Mandatory = $true)][int]$Port
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$emulador = Join-Path $sdk 'emulator\emulator.exe'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$apk = Join-Path $raiz 'android\app\build\olivia-web.apk'
$serial = "emulator-$Port"
$log = Join-Path $env:TEMP ("olivia-emulador-" + $Nome.ToLowerInvariant() + ".log")

function Registrar($texto) {
  $linha = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '  ' + $texto
  Add-Content -Path $log -Value $linha -Encoding UTF8
}

function FocarJanela {
  try {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public class OliviaJanela {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
    $proc = Get-Process -Name qemu-system-x86_64 -ErrorAction SilentlyContinue |
      Where-Object { $_.MainWindowTitle -match ":$Port" } |
      Select-Object -First 1
    if ($proc -and $proc.MainWindowHandle -ne 0) {
      [OliviaJanela]::ShowWindow($proc.MainWindowHandle, 9) | Out-Null
      [OliviaJanela]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
    }
  } catch {
    Registrar "aviso ao focar janela: $($_.Exception.Message)"
  }
}

function RodarAdb([string[]]$argumentos) {
  & $adb -s $serial @argumentos 2>$null
}

function VersaoInstalada {
  try {
    $linha = RodarAdb -argumentos @('shell', 'dumpsys', 'package', 'web.olivia') |
      Select-String 'versionName=' | Select-Object -First 1
    if (-not $linha) { return $null }
    return ([regex]::Match("$linha", 'versionName=([^\s]+)')).Groups[1].Value
  } catch {
    return $null
  }
}

try {
  New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
  Registrar "abrindo $Nome ($Avd) em $serial"

  $estado = ''
  try { $estado = (& $adb -s $serial get-state 2>$null | Out-String).Trim() } catch { $estado = '' }

  if ($estado -ne 'device') {
    if (-not (Test-Path $emulador)) { throw "emulador nao encontrado: $emulador" }
    $argumentos = @(
      '-avd', $Avd,
      '-port', [string]$Port,
      '-cores', '4',
      '-memory', '2048',
      '-no-snapshot',
      '-no-boot-anim',
      '-no-audio',
      '-gpu', 'auto',
      '-netdelay', 'none',
      '-netspeed', 'full'
    )
    Registrar "iniciando emulador: $Avd"
    Start-Process -FilePath $emulador -ArgumentList $argumentos | Out-Null

    $limite = (Get-Date).AddSeconds(240)
    while ((Get-Date) -lt $limite) {
      Start-Sleep -Seconds 4
      try {
        $boot = (& $adb -s $serial shell getprop sys.boot_completed 2>$null | Out-String).Trim()
        if ($boot -eq '1') { break }
      } catch { }
    }
  } else {
    Registrar "emulador ja estava rodando"
  }

  # Impede o Play Store de atualizar o WebView e matar o Olivia no meio da sessao.
  RodarAdb -argumentos @('shell', 'pm', 'disable-user', '--user', '0', 'com.android.vending') | Out-Null
  RodarAdb -argumentos @('shell', 'am', 'force-stop', 'com.android.vending') | Out-Null

  $desejada = (Get-Content (Join-Path $raiz 'package.json') -Raw | ConvertFrom-Json).version
  $instalada = VersaoInstalada
  if (-not $instalada -or $instalada -ne $desejada) {
    if (-not (Test-Path $apk)) { throw "APK nao encontrado: $apk" }
    Registrar "instalando APK $desejada (instalada: $instalada)"
    & $adb -s $serial install -r $apk 2>&1 | ForEach-Object { Registrar "$_" }
    if ($LASTEXITCODE -ne 0) { throw "falha ao instalar o APK" }
  } else {
    Registrar "APK ja esta na versao $instalada"
  }

  RodarAdb -argumentos @('shell', 'pm', 'grant', 'web.olivia', 'android.permission.POST_NOTIFICATIONS') | Out-Null
  RodarAdb -argumentos @('shell', 'am', 'start', '-n', 'web.olivia/.MainActivity') | Out-Null
  FocarJanela
  Registrar "pronto"
} catch {
  Registrar "ERRO: $($_.Exception.Message)"
  try {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show(
      "Nao foi possivel abrir o emulador $Nome.`n`n$($_.Exception.Message)`n`nLog: $log",
      "Olivia",
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
  } catch { }
  exit 1
}
