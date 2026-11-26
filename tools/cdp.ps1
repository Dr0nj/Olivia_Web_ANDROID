param(
  [Parameter(Mandatory = $true)][string]$WsUrl,
  [Parameter(Mandatory = $true)][string]$Expr
)

$erro = $null
$socket = New-Object System.Net.WebSockets.ClientWebSocket
$ct = [System.Threading.CancellationToken]::None

try {
  $socket.ConnectAsync([Uri]$WsUrl, $ct).Wait()
  $pedido = @{
    id = 1
    method = 'Runtime.evaluate'
    params = @{
      expression = $Expr
      awaitPromise = $true
      returnByValue = $true
      userGesture = $false
    }
  } | ConvertTo-Json -Compress -Depth 8

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($pedido)
  $envio = [System.ArraySegment[byte]]::new($bytes)
  $socket.SendAsync($envio, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, $ct).Wait()

  $buffer = New-Object byte[] 262144
  $recebido = $socket.ReceiveAsync([System.ArraySegment[byte]]::new($buffer), $ct).Result
  $texto = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $recebido.Count)
  $json = $texto | ConvertFrom-Json

  if ($json.result.exceptionDetails) {
    'EXCECAO: ' + $json.result.exceptionDetails.text
    if ($json.result.exceptionDetails.exception) {
      $json.result.exceptionDetails.exception.description
    }
  } else {
    $valor = $json.result.result.value
    if ($null -eq $valor) { $json.result.result.description } else { $valor }
  }
} catch {
  $erro = $_.Exception.Message
} finally {
  if ($socket.State -eq [System.Net.WebSockets.WebSocketState]::Open) { $socket.Dispose() }
}

if ($erro) { 'ERRO: ' + $erro; exit 1 }
