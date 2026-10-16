$projectRoot = Split-Path -Parent $PSScriptRoot
$outputDirectory = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
# Only public application files; never package local exports, snapshots or QA artifacts.
foreach ($entry in @('index.html','manifest.webmanifest','service-worker.js','css','js','icons')) {
    Copy-Item -LiteralPath (Join-Path $projectRoot $entry) -Destination $outputDirectory -Recurse -Force
}
New-Item -ItemType File -Path (Join-Path $outputDirectory '.nojekyll') -Force | Out-Null
Write-Output "GitHub Pages static files: $outputDirectory"
