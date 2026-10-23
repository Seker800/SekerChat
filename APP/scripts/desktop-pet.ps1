param(
  [ValidateSet('build', 'test', 'run', 'publish')]
  [string]$Action = 'build',
  [string]$PrivateSkinDirectory
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$desktopRoot = Join-Path $projectRoot 'native/desktop-pet'
$solution = Join-Path $desktopRoot 'SekerChat.DesktopPet.slnx'
$appProject = Join-Path $desktopRoot 'src/SekerChat.DesktopPet/SekerChat.DesktopPet.csproj'
$testProject = Join-Path $desktopRoot 'tests/SekerChat.DesktopPet.CoreTests/SekerChat.DesktopPet.CoreTests.csproj'
$publishDirectory = Join-Path $desktopRoot 'artifacts/win-x64'
if ($PrivateSkinDirectory) {
  if ($Action -ne 'publish') { throw 'PrivateSkinDirectory 只用于 publish。' }
  $PrivateSkinDirectory = (Resolve-Path $PrivateSkinDirectory).Path
  if (-not (Test-Path (Join-Path $PrivateSkinDirectory 'skin.json'))) {
    throw '私有资源包缺少 skin.json。'
  }
  $publishDirectory = Join-Path $desktopRoot 'artifacts/private-win-x64'
}

switch ($Action) {
  'build' {
    dotnet build $solution --configuration Debug
  }
  'test' {
    dotnet run --project (Join-Path $desktopRoot 'tests/SekerChat.DesktopPet.PortableTests/SekerChat.DesktopPet.PortableTests.csproj') --configuration Debug
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    dotnet run --project $testProject --configuration Debug
  }
  'run' {
    dotnet run --project $appProject --configuration Debug
  }
  'publish' {
    if ($PrivateSkinDirectory) {
      dotnet run --project (Join-Path $desktopRoot 'tests/SekerChat.DesktopPet.PortableTests/SekerChat.DesktopPet.PortableTests.csproj') --configuration Release -- $PrivateSkinDirectory
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    }
    if (-not $PrivateSkinDirectory -and (Test-Path (Join-Path $publishDirectory 'PetSkin'))) {
      throw '公开输出目录含有私有资源包，请先移走该目录再重新构建。'
    }
    dotnet publish $appProject `
      --configuration Release `
      --runtime win-x64 `
      --self-contained true `
      --output $publishDirectory
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
    Copy-Item (Join-Path $desktopRoot 'RELEASE_NOTES.md') $publishDirectory -Force
    Copy-Item (Join-Path $desktopRoot 'USER_GUIDE.md') $publishDirectory -Force
    Copy-Item (Join-Path $desktopRoot '新版说明.txt') $publishDirectory -Force
    if ($PrivateSkinDirectory) {
      $skinOutput = Join-Path $publishDirectory 'PetSkin'
      if (Test-Path $skinOutput) { Remove-Item $skinOutput -Recurse -Force }
      Copy-Item $PrivateSkinDirectory $skinOutput -Recurse
    }
  }
}
