# Compila o APK do Olivia Web sem Gradle, usando apenas o SDK do Android e o JDK
# que vem com o Android Studio. Uso: powershell -ExecutionPolicy Bypass -File tools\apk.ps1
$ErrorActionPreference = 'Stop'

$raiz = Split-Path -Parent $PSScriptRoot
$app = Join-Path $raiz 'android\app'
$out = Join-Path $app 'build'
$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$bt = Join-Path $sdk 'build-tools\36.1.0'
$jar = Join-Path $sdk 'platforms\android-36\android.jar'
$jbr = 'C:\Program Files\Android\Android Studio\jbr'

function Exigir($caminho, $nome) {
  if (-not (Test-Path $caminho)) { throw "nao encontrei $nome em $caminho" }
}

Exigir $jar 'android.jar (platform 36)'
Exigir (Join-Path $bt 'aapt2.exe') 'aapt2'
Exigir (Join-Path $bt 'd8.bat') 'd8'
Exigir (Join-Path $bt 'zipalign.exe') 'zipalign'
Exigir (Join-Path $bt 'apksigner.bat') 'apksigner'
Exigir (Join-Path $jbr 'bin\javac.exe') 'javac (Android Studio JBR)'

$env:JAVA_HOME = $jbr
$env:PATH = "$jbr\bin;$bt;$env:PATH"

Write-Host '== driver' -ForegroundColor Cyan
& node (Join-Path $raiz 'tools\build.mjs')
if ($LASTEXITCODE -ne 0) { throw 'falha ao gerar o driver' }

$assets = Join-Path $app 'src\main\assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null
Copy-Item (Join-Path $raiz 'dist\olivia-web.user.js') (Join-Path $assets 'driver.js') -Force

Write-Host '== limpeza' -ForegroundColor Cyan
foreach ($pasta in @('classes', 'dex', 'base.apk', 'aligned.apk', 'olivia-web.apk')) {
  $alvo = Join-Path $out $pasta
  if (Test-Path $alvo) { Remove-Item $alvo -Recurse -Force }
}
New-Item -ItemType Directory -Force -Path (Join-Path $out 'classes'), (Join-Path $out 'dex') | Out-Null

Write-Host '== recursos e manifesto' -ForegroundColor Cyan
& (Join-Path $bt 'aapt2.exe') link `
  -o (Join-Path $out 'base.apk') `
  -I $jar `
  --manifest (Join-Path $app 'src\main\AndroidManifest.xml') `
  -A $assets `
  --min-sdk-version 26 `
  --target-sdk-version 36 `
  --version-code 1 `
  --version-name 0.3.0
if ($LASTEXITCODE -ne 0) { throw 'aapt2 link falhou' }

Write-Host '== javac' -ForegroundColor Cyan
$fontes = Get-ChildItem (Join-Path $app 'src\main\java') -Recurse -Filter *.java | ForEach-Object { $_.FullName }
& (Join-Path $jbr 'bin\javac.exe') -encoding UTF-8 -source 8 -target 8 -Xlint:-options `
  -classpath $jar -d (Join-Path $out 'classes') $fontes
if ($LASTEXITCODE -ne 0) { throw 'javac falhou' }

Write-Host '== d8' -ForegroundColor Cyan
$classes = Get-ChildItem (Join-Path $out 'classes') -Recurse -Filter *.class | ForEach-Object { $_.FullName }
& (Join-Path $bt 'd8.bat') --release --lib $jar --min-api 26 --output (Join-Path $out 'dex') $classes
if ($LASTEXITCODE -ne 0) { throw 'd8 falhou' }

Write-Host '== juntando o dex' -ForegroundColor Cyan
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open((Join-Path $out 'base.apk'), 'Update')
try {
  [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
    $zip, (Join-Path $out 'dex\classes.dex'), 'classes.dex',
    [System.IO.Compression.CompressionLevel]::NoCompression) | Out-Null
} finally {
  $zip.Dispose()
}

Write-Host '== alinhando' -ForegroundColor Cyan
& (Join-Path $bt 'zipalign.exe') -f -p 4 (Join-Path $out 'base.apk') (Join-Path $out 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'zipalign falhou' }

Write-Host '== assinando' -ForegroundColor Cyan
$ks = Join-Path $app 'olivia-debug.keystore'
if (-not (Test-Path $ks)) {
  & (Join-Path $jbr 'bin\keytool.exe') -genkeypair -keystore $ks -storepass android -keypass android `
    -alias olivia -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=Olivia Web, O=Olivia, C=BR'
  if ($LASTEXITCODE -ne 0) { throw 'keytool falhou' }
}

& (Join-Path $bt 'apksigner.bat') sign --ks $ks --ks-pass pass:android --key-pass pass:android `
  --ks-key-alias olivia --out (Join-Path $out 'olivia-web.apk') (Join-Path $out 'aligned.apk')
if ($LASTEXITCODE -ne 0) { throw 'apksigner falhou' }

& (Join-Path $bt 'apksigner.bat') verify (Join-Path $out 'olivia-web.apk')
if ($LASTEXITCODE -ne 0) { throw 'assinatura invalida' }

$final = Join-Path $out 'olivia-web.apk'
$tamanho = [math]::Round((Get-Item $final).Length / 1KB, 1)
Write-Host "OK: $final ($tamanho KB)" -ForegroundColor Green
