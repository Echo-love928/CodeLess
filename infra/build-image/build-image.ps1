$ErrorActionPreference = 'Stop'
$repository = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
docker build --file (Join-Path $PSScriptRoot 'Dockerfile') --tag codeless-vue-build:d05 $repository
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker image inspect codeless-vue-build:d05 --format '{{.Id}}'
exit $LASTEXITCODE
