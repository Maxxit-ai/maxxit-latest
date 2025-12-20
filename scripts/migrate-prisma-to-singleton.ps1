# =============================================================================
# Prisma Singleton Migration Script
# =============================================================================
# This script migrates all files using `new PrismaClient()` to use the 
# centralized singleton from `lib/prisma.ts`
#
# Usage:
#   .\scripts\migrate-prisma-to-singleton.ps1
#   .\scripts\migrate-prisma-to-singleton.ps1 -DryRun
#   .\scripts\migrate-prisma-to-singleton.ps1 -Restore
# =============================================================================

param(
    [switch]$DryRun = $false,
    [switch]$Restore = $false,
    [switch]$NoBackup = $false,
    [string]$BackupDir = ".prisma-migration-backup"
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Success { param($msg) Write-Host "[OK] $msg" -ForegroundColor Green }
function Write-Info { param($msg) Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn { param($msg) Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err { param($msg) Write-Host "[ERROR] $msg" -ForegroundColor Red }
function Write-Header { 
    param($msg) 
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Magenta
    Write-Host "  $msg" -ForegroundColor Magenta
    Write-Host "=============================================" -ForegroundColor Magenta
}

# Files to skip (already using singleton or special cases)
$SkipPatterns = @(
    "lib[\\/]prisma\.ts$",
    "^prisma\.ts$",
    "packages[\\/]database",
    "node_modules"
)

# Calculate relative import path from file to lib/prisma.ts
function Get-RelativeImportPath {
    param([string]$FilePath)
    
    $fileDir = Split-Path -Parent $FilePath
    $libPrismaPath = "lib/prisma"
    
    # Normalize paths
    $fileDir = $fileDir -replace '\\', '/'
    
    # Count directory levels from file to root
    $parts = $fileDir -split '/' | Where-Object { $_ -ne '' -and $_ -ne '.' }
    $depth = $parts.Count
    
    if ($depth -eq 0) {
        return "./$libPrismaPath"
    }
    
    # Build relative path
    $relPath = ""
    for ($i = 0; $i -lt $depth; $i++) {
        $relPath += "../"
    }
    return "${relPath}lib/prisma"
}

# Restore from backup
if ($Restore) {
    Write-Header "RESTORING FROM BACKUP"
    
    if (-not (Test-Path $BackupDir)) {
        Write-Err "Backup directory not found: $BackupDir"
        exit 1
    }
    
    $backupFiles = Get-ChildItem -Path $BackupDir -Filter "*.ts.bak" -Recurse
    $restoredCount = 0
    
    foreach ($backupFile in $backupFiles) {
        $relativePath = $backupFile.FullName.Replace("$PWD\$BackupDir\", "").Replace(".bak", "")
        $originalPath = $relativePath -replace '\\', '/'
        
        if (Test-Path $originalPath) {
            Copy-Item -Path $backupFile.FullName -Destination $originalPath -Force
            Write-Success "Restored: $originalPath"
            $restoredCount++
        }
    }
    
    Write-Header "RESTORE COMPLETE"
    Write-Info "Restored $restoredCount files"
    exit 0
}

Write-Header "PRISMA SINGLETON MIGRATION"
if ($DryRun) {
    Write-Info "Mode: DRY RUN (no changes)"
} else {
    Write-Info "Mode: LIVE"
}
if ($NoBackup) {
    Write-Info "Backup: DISABLED"
} else {
    Write-Info "Backup: $BackupDir"
}

# Find all TypeScript files with new PrismaClient()
Write-Info "Scanning for files using new PrismaClient..."

$filesToMigrate = @()
$allTsFiles = Get-ChildItem -Path . -Filter "*.ts" -Recurse -File

foreach ($file in $allTsFiles) {
    $relativePath = $file.FullName.Replace("$PWD\", "") -replace '\\', '/'
    
    # Check if file should be skipped
    $skip = $false
    foreach ($pattern in $SkipPatterns) {
        if ($relativePath -match $pattern) {
            $skip = $true
            break
        }
    }
    
    if ($skip) { continue }
    
    try {
        $content = [System.IO.File]::ReadAllText($file.FullName)
    } catch {
        continue
    }
    if ([string]::IsNullOrEmpty($content)) { continue }
    
    if ($content -match 'new\s+PrismaClient') {
        $filesToMigrate += @{
            Path = $file.FullName
            RelativePath = $relativePath
            Content = $content
        }
    }
}

Write-Info "Found $($filesToMigrate.Count) files to migrate"

if ($filesToMigrate.Count -eq 0) {
    Write-Success "No files need migration!"
    exit 0
}

# Create backup directory
if (-not $DryRun -and -not $NoBackup) {
    if (-not (Test-Path $BackupDir)) {
        New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
    }
}

# Process each file
Write-Header "PROCESSING FILES"

$successCount = 0
$errorCount = 0
$skippedCount = 0
$changes = @()

foreach ($fileInfo in $filesToMigrate) {
    $filePath = $fileInfo.RelativePath
    $fullPath = $fileInfo.Path
    $content = $fileInfo.Content
    $originalContent = $content
    
    Write-Host ""
    Write-Host "File: $filePath" -ForegroundColor White
    
    try {
        # Calculate relative import path
        $importPath = Get-RelativeImportPath -FilePath $filePath
        Write-Host "   Import path: $importPath" -ForegroundColor Cyan
        
        $changesMade = @()
        
        # Pattern 1: Replace simple PrismaClient import
        # import { PrismaClient } from '@prisma/client';
        $pattern1 = "import\s*\{\s*PrismaClient\s*\}\s*from\s*[`"']@prisma/client[`"']\s*;?\s*`r?`n?"
        if ($content -match $pattern1) {
            $content = $content -replace $pattern1, ""
            $changesMade += "Removed PrismaClient import"
        }
        
        # Pattern 2: Remove const prisma = new PrismaClient(...);
        $pattern2 = "(const|let|var)\s+prisma\s*=\s*new\s+PrismaClient\s*\([^)]*\)\s*;?\s*`r?`n?"
        if ($content -match $pattern2) {
            $content = $content -replace $pattern2, ""
            $changesMade += "Removed prisma instantiation"
        }
        
        # Pattern 3: Remove finally blocks with $disconnect (multi-line)
        $pattern3 = "\}\s*finally\s*\{\s*`r?`n?\s*await\s+prisma\.\`$disconnect\s*\(\s*\)\s*;?\s*`r?`n?\s*\}"
        if ($content -match $pattern3) {
            $content = $content -replace $pattern3, "}`n  // Note: Don't disconnect - using singleton"
            $changesMade += "Removed finally/disconnect block"
        }
        
        # Pattern 3b: Simpler finally pattern
        $pattern3b = "finally\s*\{\s*`r?`n?\s*await\s+prisma\.\`$disconnect\s*\(\s*\)\s*;?\s*`r?`n?\s*\}"
        if ($content -match $pattern3b) {
            $content = $content -replace $pattern3b, "// Note: Don't disconnect - using singleton"
            $changesMade += "Removed finally/disconnect"
        }
        
        # Check if singleton import already exists
        $hasImport = $content -match "from\s*[`"'].*lib/prisma[`"']" -or $content -match "from\s*[`"']@maxxit/database[`"']"
        
        # Pattern 4: Add singleton import if not already present
        if (-not $hasImport) {
            # Find the first import to insert after
            $importMatch = [regex]::Match($content, "^import\s+.+?;`r?`n", [System.Text.RegularExpressions.RegexOptions]::Multiline)
            
            if ($importMatch.Success) {
                $singletonImport = "import { prisma } from '$importPath';`n"
                $insertPos = $importMatch.Index + $importMatch.Length
                $content = $content.Insert($insertPos, $singletonImport)
                $changesMade += "Added singleton import"
            } else {
                # No imports found, add at beginning (after any comments)
                $singletonImport = "import { prisma } from '$importPath';`n`n"
                
                # Check for file header comments
                $commentMatch = [regex]::Match($content, "^(/\*\*[\s\S]*?\*/\s*`n?|//.*`n)*")
                if ($commentMatch.Success -and $commentMatch.Length -gt 0) {
                    $insertPos = $commentMatch.Length
                    $content = $content.Insert($insertPos, "`n$singletonImport")
                } else {
                    $content = $singletonImport + $content
                }
                $changesMade += "Added singleton import (at top)"
            }
        }
        
        # Check if any changes were made
        if ($content -eq $originalContent) {
            Write-Warn "   No changes needed (already migrated or complex pattern)"
            $skippedCount++
            continue
        }
        
        # Clean up extra blank lines (more than 2 consecutive)
        $content = [regex]::Replace($content, "(`r?`n){4,}", "`n`n`n")
        
        # Show changes summary
        foreach ($change in $changesMade) {
            Write-Host "   -> $change" -ForegroundColor Green
        }
        
        # Apply changes
        if (-not $DryRun) {
            # Backup
            if (-not $NoBackup) {
                $backupPath = Join-Path $BackupDir $filePath
                $backupDirPath = Split-Path -Parent $backupPath
                if (-not (Test-Path $backupDirPath)) {
                    New-Item -ItemType Directory -Path $backupDirPath -Force | Out-Null
                }
                Copy-Item -Path $fullPath -Destination "$backupPath.bak" -Force
            }
            
            # Write changes
            [System.IO.File]::WriteAllText($fullPath, $content)
            Write-Success "   Migrated!"
        } else {
            Write-Info "   Would migrate (dry run)"
        }
        
        $successCount++
        $changes += @{
            File = $filePath
            Changes = $changesMade
        }
        
    } catch {
        Write-Err "   Error: $_"
        $errorCount++
    }
}

# Summary
Write-Header "MIGRATION SUMMARY"

if ($DryRun) {
    Write-Warn "DRY RUN - No files were actually modified"
    Write-Host ""
}

Write-Host "Results:" -ForegroundColor White
Write-Host "   Success: $successCount files" -ForegroundColor Green
Write-Host "   Skipped: $skippedCount files" -ForegroundColor Yellow
Write-Host "   Errors: $errorCount files" -ForegroundColor Red

if (-not $DryRun -and -not $NoBackup -and $successCount -gt 0) {
    Write-Host ""
    Write-Info "Backups saved to: $BackupDir"
    Write-Info "To restore: .\scripts\migrate-prisma-to-singleton.ps1 -Restore"
}

if ($DryRun -and $successCount -gt 0) {
    Write-Host ""
    Write-Warn "To apply changes, run without -DryRun flag:"
    Write-Host "   .\scripts\migrate-prisma-to-singleton.ps1" -ForegroundColor White
}

Write-Host ""
Write-Header "MIGRATION COMPLETE"

exit 0
