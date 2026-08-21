param(
  [ValidateSet('build', 'test', 'run', 'publish')]
  [string]$Action = 'build'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$desktopRoot = Join-Path $projectRoot 'native/desktop-pet'
$solution = Join-Path $desktopRoot 'SekerChat.DesktopPet.slnx'
$appProject = Join-Path $desktopRoot 'src/SekerChat.DesktopPet/SekerChat.DesktopPet.csproj'
$testProject = Join-Path $desktopRoot 'tests/SekerChat.DesktopPet.CoreTests/SekerChat.DesktopPet.CoreTests.csproj'
$publishDirectory = Join-Path $desktopRoot 'artifacts/win-x64'

switch ($Action) {
  'build' {
    dotnet build $solution --configuration Debug
  }
  'test' {
    dotnet run --project $testProject --configuration Debug
  }
  'run' {
    dotnet run --project $appProject --configuration Debug
  }
  'publish' {
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
  }
}
