param(
  [Parameter(Mandatory = $true)][string]$WsUrl,
  [string]$Expr = '',
  [string]$Arquivo = '',
  [int]$Escutar = 0,
  [switch]$Console,
  [switch]$Rede
)

if ($Arquivo -ne '') {
  $Expr = [System.IO.File]::ReadAllText($Arquivo, [System.Text.Encoding]::UTF8)
}

$buffer = New-Object byte[] 1048576
$socket = New-Object System.Net.WebSockets.ClientWebSocket
$prazo = [Math]::Max(4000, $Escutar + 4000)

function Enviar($obj) {
  $texto = $obj | ConvertTo-Json -Compress -Depth 10
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($texto)
  $tarefa = $socket.SendAsync([System.ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [System.Threading.CancellationToken]::None)
  if (-not $tarefa.Wait(5000)) { throw 'envio travou' }
}

function Receber([int]$ms) {
  $ms2 = New-Object System.IO.MemoryStream
  $cts = New-Object System.Threading.CancellationTokenSource
  $cts.CancelAfter($ms)
  try {
    do {
      $tarefa = $socket.ReceiveAsync([System.ArraySegment[byte]]::new($buffer), $cts.Token)
      if (-not $tarefa.Wait($ms + 500)) { return $null }
      $r = $tarefa.Result
      if ($r.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { return $null }
      $ms2.Write($buffer, 0, $r.Count)
    } while (-not $r.EndOfMessage)
    return [System.Text.Encoding]::UTF8.GetString($ms2.ToArray())
  } catch {
    return $null
  } finally {
    $cts.Dispose()
    $ms2.Dispose()
  }
}

# Vigia: desliga o socket no prazo, mesmo que uma leitura trave.
$vigia = New-Object System.Threading.Timer({
  param($s)
  try { $s.Dispose() } catch { }
}, $socket, $prazo, [System.Threading.Timeout]::Infinite)

try {
  $conexao = $socket.ConnectAsync([Uri]$WsUrl, [System.Threading.CancellationToken]::None)
  if (-not $conexao.Wait(8000)) { 'ERRO: timeout ao conectar'; return }
  if ($socket.State -ne [System.Net.WebSockets.WebSocketState]::Open) { 'ERRO: socket nao abriu'; return }

  Enviar @{ id = 0; method = 'Runtime.enable' }
  if ($Rede) {
    Enviar @{ id = 0; method = 'Log.enable' }
    Enviar @{ id = 0; method = 'Network.enable' }
  }

  $alvoId = $null
  if ($Expr -ne '') {
    $alvoId = 100
    Enviar @{
      id = $alvoId
      method = 'Runtime.evaluate'
      params = @{ expression = $Expr; awaitPromise = $true; returnByValue = $true; userGesture = $false }
    }
  }

  $fim = [DateTime]::UtcNow.AddMilliseconds([Math]::Max(1500, $Escutar))
  while ([DateTime]::UtcNow -lt $fim) {
    $texto = Receber(700)
    if ($null -eq $texto) { continue }
    $msg = $texto | ConvertFrom-Json
    if ($null -eq $msg) { continue }

    if ($msg.id -eq $alvoId -and $msg.result) {
      if ($msg.result.exceptionDetails) {
        'EXCECAO: ' + $msg.result.exceptionDetails.text
      } else {
        'RESULTADO: ' + $msg.result.result.value
      }
      $alvoId = $null
    }

    if ($Rede -and $msg.method -eq 'Network.webSocketFrameSent') {
      $p = $msg.params.response.payloadData
      if ($p -match '"t":"ping"') {
        $q = ([regex]::Match($p, '"q":(\d+)')).Groups[1].Value
        $c = ([regex]::Match($p, '"c":(\d+)')).Groups[1].Value
        $w = ([regex]::Match($p, '"w":"([^"]*)"')).Groups[1].Value
        "PING q=$q c=$c w=$w"
      } elseif ($p -match '"t":"(ir|parar|chat|sello|skill|usar|recoger)"') {
        'ENVIOU: ' + $p.Substring(0, [Math]::Min(160, $p.Length))
      }
    }

    if ($Rede -and $msg.method -eq 'Network.webSocketFrameReceived') {
      $p = $msg.params.response.payloadData
      if ($p -match '"t":"(eresBot|error|afk|expulsado)"') {
        'RECEBEU: ' + $p.Substring(0, [Math]::Min(200, $p.Length))
      }
    }

    if ($Console -and $msg.method -eq 'Runtime.consoleAPICalled') {
      $args = ($msg.params.args | ForEach-Object { $_.value }) -join ' '
      if ($args -match 'Olivia') { 'CONSOLE: ' + $args.Substring(0, [Math]::Min(200, $args.Length)) }
    }

    if ($msg.method -eq 'Runtime.exceptionThrown') {
      'ERRO-JS: ' + $msg.params.exceptionDetails.text
    }
  }
} catch {
  'ERRO: ' + $_.Exception.Message
} finally {
  try { $vigia.Dispose() } catch { }
  try { $socket.Dispose() } catch { }
}
