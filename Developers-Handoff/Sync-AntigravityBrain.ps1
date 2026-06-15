<#
.SYNOPSIS
    Parses local Antigravity brain session caches dynamically across different developer profiles.
.DESCRIPTION
    Uses environment paths to scale across multiple machines, logs task success/failure 
    states, captures engine runtime errors, updates AGENTS.md, and archives raw snapshots.
#>
[CmdletBinding()]
param(
    # Dynamically maps to C:\Users\<Current_User>\.gemini\antigravity\brain
    [string]$BrainRoot = "$env:USERPROFILE\.gemini\antigravity\brain",
    [string]$TargetMarkdown = "AGENTS.md"
)

Clear-Host
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "   EXTRACTING ACTIVE ANTIGRAVITY BRAIN TELEMETRY    " -ForegroundColor Cyan
Write-Host "   CURRENT USER PROFILE: $env:USERNAME              " -ForegroundColor DarkGray
Write-Host "====================================================" -ForegroundColor Cyan

# Track any internal script errors that happen during execution
$ScriptErrors = @()

if (-not (Test-Path $BrainRoot)) {
    $ErrorMsg = "Brain directory path not found at expected environment path: $BrainRoot. Please confirm Antigravity is installed locally."
    Write-Error $ErrorMsg
    $ScriptErrors += "- [System Error] $ErrorMsg"
    exit
}

# 1. Isolate the most recently modified GUID session folders from the current shift
Write-Host "[+] Scanning machine-specific GUID contexts..." -ForegroundColor Green
$RecentSessions = $null
try {
    $RecentSessions = Get-ChildItem -Path $BrainRoot -Directory | 
        Where-Object { $_.Name -ne "tempMediaStorage" } |
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 3
} catch {
    $ScriptErrors += "- [IO Error] Failed to scan brain directory context. Details: $($_.Exception.Message)"
}

if (-not $RecentSessions) {
    Write-Warning "No active session history folders detected in this user's local brain profile."
    if ($ScriptErrors.Count -gt 0) {
        Write-Host "`n[🚨] Script execution encountered internal blocking issues. Reviewing summary..." -ForegroundColor Red
    }
}

# Create dynamic timestamped folder name for archiving (Format: YYYYMMDD_HHMMSS)
$TimestampFolder = Get-Date -Format "yyyyMMdd_HHmmss"
$ArchiveDirectory = Join-Path -Path $PSScriptRoot -ChildPath "handoff_snapshots\$TimestampFolder"

# Initialize clean, standard arrays for the 4 explicit categories requested
$DoneList = @()
$FailedToDoneList = @()
$FailedButFixedList = @()
$StillFailingList = @()

# Track files that we process using native array collections to avoid framework type crashes
$FilesToArchive = @()

# 2. Iterate through logs, artifacts, and json transaction text blocks
foreach ($Session in $RecentSessions) {
    Write-Host " -> Processing telemetry streams from session: $($Session.Name)" -ForegroundColor DarkGray
    
    $LogFiles = @()
    try {
        $LogFiles = Get-ChildItem -Path $Session.FullName -File -Recurse | 
            Where-Object { $_.Extension -match "\.(jsonl|log|md|txt)$" }
    } catch {
        $ScriptErrors += "- [Session Access Error] Could not read folder contents for session $($Session.Name). Details: $($_.Exception.Message)"
        continue
    }

    foreach ($File in $LogFiles) {
        # Stream the file safely line by line to handle active file locks
        $Lines = Get-Content -Path $File.FullName -ErrorAction SilentlyContinue
        if (-not $Lines) { continue }

        # Keep track of any found .jsonl files for the relocation phase securely
        if ($File.Extension -eq ".jsonl" -and $File.FullName -notin $FilesToArchive.FullName) {
            $FilesToArchive += $File
        }

        foreach ($Line in $Lines) {
            if ([string]::IsNullOrWhiteSpace($Line)) { continue }
            
            # Evaluate if the row is structural JSONL data
            $LogEntry = $null
            if ($Line.Trim().StartsWith("{") -and $Line.Trim().EndsWith("}")) {
                try {
                    $LogEntry = $Line | ConvertFrom-Json -ErrorAction Stop
                } catch {
                    $LogEntry = $null
                }
            }

            # STRATEGY A: Process Structured JSONL Traces (Like your Srilatha Art logs)
            if ($null -ne $LogEntry) {
                $ActionSummary = ""
                
                # Check if the log contains error details inside the payload
                if ($LogEntry.status -eq "FAILED" -or $LogEntry.status -eq "ABORTED" -or $null -ne $LogEntry.error) {
                    $ErrorDetails = if ($LogEntry.error) { $LogEntry.error } else { "Execution aborted or stream truncated" }
                    $ActionSummary = "Pipeline Error in type [$($LogEntry.type)] -> Msg: $ErrorDetails"
                    $StillFailingList += "- [Step $($LogEntry.step_index)] $ActionSummary"
                    continue
                }

                if ($LogEntry.type -eq "CODE_ACTION" -and $LogEntry.content -match "Created file (.+?)(?:\s+|$)" ) {
                    $ActionSummary = "Created and synchronized code asset: $($Matches[1])"
                } elseif ($LogEntry.tool_calls) {
                    $Actions = $LogEntry.tool_calls | ForEach-Object { "$($_.name) on $($_.args.TargetFile ?? $_.args.AbsolutePath)" }
                    $ActionSummary = "Executed background pipeline actions: " + ($Actions -join ", ")
                } elseif ($LogEntry.type -eq "USER_INPUT") {
                    $ActionSummary = "Processed incoming tactical directive layout."
                }

                if (-not [string]::IsNullOrEmpty($ActionSummary)) {
                    if ($LogEntry.status -eq "DONE") {
                        $DoneList += "- [Step $($LogEntry.step_index)] $ActionSummary"
                    }
                }
                continue
            }

            # STRATEGY B: Fallback Text Regex (For flat conversational text logs)
            $Content = $Line
            if ($Content -match '(?i)(?:task|step|implementation)\s+(?:completed|succeeded|done|passed)\b') {
                if ($Content -match '(?i)(?:completed|done):\s*([^\r\n.]+)') { $DoneList += "- " + $Matches[1].Trim() }
            }
            if ($Content -match '(?i)(?:error|fail|exception).*?(?:resolved|fixed|patched|corrected)') {
                if ($Content -match '(?i)(?:fixed|resolved):\s*([^\r\n.]+)') { $FailedButFixedList += "- " + $Matches[1].Trim() }
            }
            if ($Content -match '(?i)(?:still\s+failing|unresolved|blocking\s+issue|fatal\s+error)') {
                if ($Content -match '(?i)(?:still failing|blocker):\s*([^\r\n.]+)') { $StillFailingList += "- " + $Matches[1].Trim() }
            }
            if ($Content -match '(?i)(?:failed\s+to\s+execute|task\s+aborted|execution\s+failed)') {
                if ($Content -match '(?i)(?:failed to done|aborted):\s*([^\r\n.]+)') {
                    $val = $Matches[1].Trim()
                    if ($val -and $val -notin $StillFailingList) { $FailedToDoneList += "- $val" }
                }
            }
        }
    }
}

# Combine script-level execution errors into our active handoff tracker block
if ($ScriptErrors.Count -gt 0) {
    foreach ($Err in $ScriptErrors) {
        $StillFailingList += $Err
    }
}

# Sanitize arrays & provide default safe Fallbacks if lists are empty
if ($DoneList.Count -eq 0) { $DoneList += "- No purely autonomous completions recorded this block." }
if ($FailedToDoneList.Count -eq 0) { $FailedToDoneList += "- No aborted execution streams detected." }
if ($FailedButFixedList.Count -eq 0) { $FailedButFixedList += "- No error correction/recovery sequences tripped." }
if ($StillFailingList.Count -eq 0) { $StillFailingList += "- Clear run! No active compile or test failures reported." }

# 3. Format the Ingested Telemetry Block
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$HandoffPayload = @"

### 🤖 Autonomous Agent Telemetry Sync ($Timestamp)
*Pushed by developer profile: **$env:USERNAME***
*Raw Session Context Snapshots: `handoff_snapshots/$TimestampFolder/`*

#### ✅ Tasks Successfully Executed (Done)
$($DoneList | Select-Object -Unique | Out-String)
#### ❌ Tasks Blocked / Aborted (Failed to done)
$($FailedToDoneList | Select-Object -Unique | Out-String)
#### 🔄 Recovered Pipelines (Failed, but fixed the issues)
$($FailedButFixedList | Select-Object -Unique | Out-String)
#### 🚨 Critical Handoffs & Engine Errors (Failed, still failing, needs human intervention)
$($StillFailingList | Select-Object -Unique | Out-String)

---
"@

# 4. Write back to your primary repository file
if (-not (Test-Path $TargetMarkdown)) {
    $Header = "# 🧠 ANTIGRAVITY ENGINE & PROJECT BLUEPRINT`n`n## 🔄 Shift History Matrix`n"
    try {
        Set-Content -Path $TargetMarkdown -Value $Header -Encoding utf8 -ErrorAction Stop
    } catch {
        Write-Warning "Could not initialize markdown target file. Details: $($_.Exception.Message)"
    }
}

Write-Host "[+] Appending automated logs to $TargetMarkdown..." -ForegroundColor Green
try {
    Add-Content -Path $TargetMarkdown -Value $HandoffPayload -Encoding utf8 -ErrorAction Stop
} catch {
    Write-Error "Failed to write payload to markdown matrix. Details: $($_.Exception.Message)"
}

# 5. Relocate the raw JSONL streams into the timestamped script directory
if ($FilesToArchive.Count -gt 0) {
    Write-Host "`n[+] Creating isolated context folder at: $ArchiveDirectory" -ForegroundColor Yellow
    try {
        $null = New-Item -Path $ArchiveDirectory -ItemType Directory -Force -ErrorAction Stop
        
        foreach ($File in $FilesToArchive) {
            $DestinationName = "$($File.Directory.Name)_$($File.Name)"
            $DestinationPath = Join-Path -Path $ArchiveDirectory -ChildPath $DestinationName
            
            Write-Host " -> Copying state file to archive: $DestinationName" -ForegroundColor DarkGray
            Copy-Item -Path $File.FullName -Destination $DestinationPath -Force
        }
        Write-Host "[+] Raw log matrices backed up successfully." -ForegroundColor Green
    } catch {
        Write-Error "Relocation phase encountered filesystem errors: $($_.Exception.Message)"
    }
} else {
    Write-Host "`n[!] No raw JSONL transaction log files were found to relocate during this run." -ForegroundColor DarkYellow
}

Write-Host "`n====================================================" -ForegroundColor Green
Write-Host " PROCESS COMPLETE. TELEMETRY RECORDED AND ARCHIVED. " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Green