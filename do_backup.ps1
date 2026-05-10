$files = @('index.html','index.css','app_fix.js','voice_fix.js','gemini_fix.js','groq_fix.js','openai_fix.js','templates_data.js','knowledge.js','zhipu_fix.js')
$destinations = @('c:\Users\marci\Desktop\novo app', 'c:\Users\marci\Desktop\IA', 'c:\Users\marci\Desktop\IA\radiologista-ia-main')

$sourceDir = 'c:\Users\marci\Desktop\test de voz'

foreach ($dest in $destinations) {
    if (Test-Path $dest) {
        Write-Host "Sincronizando para: $dest"
        foreach ($f in $files) {
            $src = Join-Path $sourceDir $f
            if (Test-Path $src) {
                 Copy-Item -Path $src -Destination $dest -Force
            }
        }
    }
}

$backupDir = 'c:\Users\marci\Desktop\SISTEMA_RADVOICE_PRO_ESTAVEL'
if (!(Test-Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
}
Write-Host "Criando Backup Consolidado em: $backupDir"
foreach ($f in $files) {
    $src = Join-Path $sourceDir $f
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $backupDir -Force
    }
}

Write-Host "SUCESSO: APLICAÇÃO SALVA EM TODAS AS BASES E PASTAS!"
