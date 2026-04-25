$rootPath = "apps\web\src"
$fullRootPath = Resolve-Path $rootPath

Get-ChildItem -Path $rootPath -Recurse -Include *.tsx,*.ts | ForEach-Object {
    $fileContent = Get-Content $_.FullName -Raw
    if ($fileContent -match "@\/") {
        $relativePath = Get-Item $_.FullName
        $dirPath = $relativePath.DirectoryName
        
        # Calculate depth relative to src root
        $depthPath = $dirPath.Substring($fullRootPath.Path.Length + 1)
        $depthCount = ($depthPath.Split("\").Count)
        
        # Build prefix (e.g. ../../)
        $prefix = "../" * $depthCount
        
        # Replace @/ with calculated prefix
        $newContent = $fileContent -replace "@\/", $prefix
        Set-Content $_.FullName -Value $newContent
        Write-Host "Fixed $($_.Name) - Depth: $depthCount - Prefix: $prefix"
    }
}
