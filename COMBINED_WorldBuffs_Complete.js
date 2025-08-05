/**
 * COMPLETE World Buffs Google Apps Script - Analysis + Backup
 * 
 * This script includes both world buffs analysis AND backup functionality.
 * Deploy this single file to your World Buffs Google Sheet.
 */

// Configuration
const SPREADSHEET_ID = '1CHAbsIbEF_2UiuX94438chTzW2gO7T0JgyhWIGTmkK8';
const WORLD_BUFFS_TAB_NAME = 'world buffs';
const INSTRUCTIONS_TAB_NAME = 'Instructions';
const STATUS_CELL = 'F11'; // Cell for status monitoring

/**
 * doGet function - handles GET requests (for web app validation)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      message: 'World Buffs CLA Web App is running',
      timestamp: new Date().toISOString(),
      availableActions: ['populateWorldBuffs', 'checkStatus', 'clearStatus', 'createClaBackup', 'createClaBackupWebApp']
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Main doPost function - handles ALL requests (Analysis + Backup)
 */
function doPost(e) {
  try {
    console.log('🌍 [CLA] Received request');
    
    let requestData;
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      console.error('❌ [CLA] Failed to parse request data:', parseError);
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const { action, logUrl } = requestData;
    console.log(`🌍 [CLA] Action: ${action}`, logUrl ? `for log: ${logUrl}` : '');

    let result;
    switch (action) {
      // World Buffs Analysis actions
      case 'populateWorldBuffs':
        result = handlePopulateWorldBuffs(logUrl);
        break;
      case 'checkStatus':
        result = handleCheckStatus();
        break;
      case 'clearStatus':
        result = handleClearStatus();
        break;
      
      // Backup actions
      case 'createClaBackup':
        result = createClaBackup();
        break;
      case 'createClaBackupWebApp':
        result = createClaBackupWebApp();
        break;
      case 'createClaBackupWithCheck':
        result = createClaBackupWithCheck();
        break;
        
      default:
        result = {
          success: false,
          error: `Unknown action: ${action}`
        };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error('❌ [CLA] Unexpected error:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==============================================
// ANALYSIS FUNCTIONS
// ==============================================

/**
 * Handle clearing the status cell
 */
function handleClearStatus() {
  try {
    console.log('🧹 [WORLD BUFFS] Clearing status cell...');
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const instructionsSheet = spreadsheet.getSheetByName(INSTRUCTIONS_TAB_NAME);
    
    if (!instructionsSheet) {
      throw new Error(`Instructions sheet "${INSTRUCTIONS_TAB_NAME}" not found`);
    }

    // Get previous status
    const previousStatus = instructionsSheet.getRange(STATUS_CELL).getValue();
    
    // Clear the status cell
    instructionsSheet.getRange(STATUS_CELL).setValue('');
    
    console.log('✅ [WORLD BUFFS] Status cell cleared');
    
    return {
      success: true,
      previousStatus: previousStatus,
      message: 'Status cleared successfully'
    };
    
  } catch (error) {
    console.error('❌ [WORLD BUFFS] Error clearing status:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Handle checking the current status
 */
function handleCheckStatus() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const instructionsSheet = spreadsheet.getSheetByName(INSTRUCTIONS_TAB_NAME);
    
    if (!instructionsSheet) {
      throw new Error(`Instructions sheet "${INSTRUCTIONS_TAB_NAME}" not found`);
    }

    const status = instructionsSheet.getRange(STATUS_CELL).getValue();
    
    console.log(`📊 [WORLD BUFFS] Current status: ${status}`);
    
    return {
      success: true,
      status: status || 'PENDING'
    };
    
  } catch (error) {
    console.error('❌ [WORLD BUFFS] Error checking status:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Handle populating world buffs data
 */
function handlePopulateWorldBuffs(logUrl) {
  try {
    console.log('🚀 [WORLD BUFFS] Starting world buffs population for log:', logUrl);
    
    if (!logUrl) {
      throw new Error('Log URL is required for world buffs analysis');
    }
    
    // Set status to PROCESSING
    setStatus('PROCESSING');
    
    // Get the spreadsheet and world buffs sheet
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const worldBuffsSheet = spreadsheet.getSheetByName(WORLD_BUFFS_TAB_NAME);
    
    if (!worldBuffsSheet) {
      throw new Error(`World Buffs sheet "${WORLD_BUFFS_TAB_NAME}" not found`);
    }

    // Call the actual populate function with log URL
    populateWorldBuffs(worldBuffsSheet, logUrl);
    
    // Set status to COMPLETE
    setStatus('COMPLETE');
    
    console.log('✅ [WORLD BUFFS] World buffs population completed successfully');
    
    return {
      success: true,
      message: 'World buffs populated successfully'
    };
    
  } catch (error) {
    console.error('❌ [WORLD BUFFS] Error populating world buffs:', error);
    
    // Set status to ERROR
    setStatus(`ERROR: ${error.toString()}`);
    
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Set status in the Instructions tab F11 cell
 */
function setStatus(status) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const instructionsSheet = spreadsheet.getSheetByName(INSTRUCTIONS_TAB_NAME);
    
    if (instructionsSheet) {
      instructionsSheet.getRange(STATUS_CELL).setValue(status);
      console.log(`📝 [WORLD BUFFS] Status set to: ${status}`);
    }
  } catch (error) {
    console.error('❌ [WORLD BUFFS] Error setting status:', error);
  }
}

// ==============================================
// BACKUP FUNCTIONS  
// ==============================================

/**
 * Web app compatible function that creates CLA backup and returns JSON response
 */
function createClaBackupWebApp() {
  try {
    // Get current date and format it as dd-mm-yyyy
    var currentDate = new Date();
    var day = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'dd');
    var month = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'MM');
    var year = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyy');
    var formattedDate = day + '-' + month + '-' + year;
    
    // Create new spreadsheet name
    var newSheetName = 'CLA - Buffs - ' + formattedDate;
    
    // Get current spreadsheet and the "world buffs" tab
    var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sourceSheet = currentSpreadsheet.getSheetByName('world buffs');
    
    if (!sourceSheet) {
      return {
        success: false,
        error: 'Could not find "world buffs" tab in current spreadsheet'
      };
    }
    
    console.log('✅ [BACKUP] World Buffs source sheet found. Proceeding with backup...');
    
    Logger.log('Found "world buffs" tab, creating backup...');
    
    // Create new spreadsheet
    var newSpreadsheet = SpreadsheetApp.create(newSheetName);
    Logger.log('Created new spreadsheet: ' + newSheetName);
    
    // Copy the "world buffs" tab to the new spreadsheet
    var copiedSheet = sourceSheet.copyTo(newSpreadsheet);
    copiedSheet.setName('world buffs');
    Logger.log('Copied "world buffs" tab to new spreadsheet');
    
    // Remove the default "Sheet1" from new spreadsheet
    var defaultSheet = newSpreadsheet.getSheetByName('Ark1');
    if (defaultSheet) {
      newSpreadsheet.deleteSheet(defaultSheet);
    }
    
    // Move to specific folder
    var targetFolderId = '1s3vf73brH783FfDlJLXYsAjDSJTU65tx';
    var newFile = DriveApp.getFileById(newSpreadsheet.getId());
    var targetFolder = DriveApp.getFolderById(targetFolderId);
    
    targetFolder.addFile(newFile);
    DriveApp.getRootFolder().removeFile(newFile);
    
    var result = {
      success: true,
      message: 'CLA backup created successfully',
      archiveName: newSheetName,
      archiveUrl: newSpreadsheet.getUrl(),
      timestamp: new Date().toISOString()
    };
    
    console.log('✅ [CLA BACKUP] Success:', JSON.stringify(result));
    return result;
    
  } catch (error) {
    console.error('❌ [CLA BACKUP] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Standard backup function - creates backup of "world buffs" tab
 */
function createClaBackup() {
  try {
    console.log('🗄️ [CLA BACKUP] Starting CLA backup creation...');
    
    // Get current spreadsheet and the "world buffs" tab
    var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sourceSheet = currentSpreadsheet.getSheetByName('world buffs');
    
    if (!sourceSheet) {
      throw new Error('Source sheet "world buffs" not found');
    }
    
    // Create new spreadsheet
    var currentDate = new Date();
    var backupName = 'CLA - Buffs - ' + formatDateForFilename(currentDate);
    console.log('📝 [CLA BACKUP] Creating backup with name: ' + backupName);
    
    var newSpreadsheet = SpreadsheetApp.create(backupName);
    
    // Copy the sheet using copyTo() method
    var copiedSheet = sourceSheet.copyTo(newSpreadsheet);
    copiedSheet.setName('world buffs');
    
    // Remove ALL other sheets to ensure "world buffs" is the only/first tab
    var allSheets = newSpreadsheet.getSheets();
    console.log('📋 [CLA BACKUP] Found ' + allSheets.length + ' sheets in new spreadsheet');
    
    for (var i = 0; i < allSheets.length; i++) {
      var sheet = allSheets[i];
      if (sheet.getName() !== 'world buffs') {
        console.log('🗑️ [CLA BACKUP] Deleting sheet: ' + sheet.getName());
        newSpreadsheet.deleteSheet(sheet);
      }
    }
    
    // Ensure "world buffs" is the active sheet (first tab)
    newSpreadsheet.setActiveSheet(copiedSheet);
    
    console.log('📋 [CLA BACKUP] Successfully copied "world buffs" tab using copyTo() method');
    
    // Move to specific folder - Updated to new Google account folder
    var targetFolderId = '1s3vf73brH783FfDlJLXYsAjDSJTU65tx';
    var newFile = DriveApp.getFileById(newSpreadsheet.getId());
    var targetFolder = DriveApp.getFolderById(targetFolderId);
    
    // Move file to target folder
    var parents = newFile.getParents();
    while (parents.hasNext()) {
      var parent = parents.next();
      parent.removeFile(newFile);
    }
    targetFolder.addFile(newFile);
    
    // Make the sheet publicly readable for import
    try {
      newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      console.log('🔗 [CLA BACKUP] Set sheet to publicly viewable');
      
      // Test the CSV export URL immediately
      var testCsvUrl = 'https://docs.google.com/spreadsheets/d/' + newSpreadsheet.getId() + '/export?format=csv';
      console.log('🧪 [CLA BACKUP] CSV export URL: ' + testCsvUrl);
      
      // Try to fetch our own CSV to verify it works
      try {
        var testResponse = UrlFetchApp.fetch(testCsvUrl, {
          method: 'GET',
          muteHttpExceptions: true
        });
        console.log('🧪 [CLA BACKUP] CSV test response status: ' + testResponse.getResponseCode());
        if (testResponse.getResponseCode() === 200) {
          var csvContent = testResponse.getContentText();
          console.log('✅ [CLA BACKUP] CSV export working, content length: ' + csvContent.length);
          console.log('📝 [CLA BACKUP] First 200 chars: ' + csvContent.substring(0, 200));
        } else {
          console.log('❌ [CLA BACKUP] CSV test failed with status: ' + testResponse.getResponseCode());
        }
      } catch (csvTestError) {
        console.log('❌ [CLA BACKUP] CSV test error: ' + csvTestError);
      }
      
    } catch (shareError) {
      console.log('⚠️ [CLA BACKUP] Could not set public sharing (will try anyway):', shareError);
    }
    
    console.log('✅ [CLA BACKUP] Backup created successfully: ' + newSpreadsheet.getUrl());
    
    return {
      success: true,
      message: 'CLA - Buffs backup created successfully',
      backupUrl: newSpreadsheet.getUrl(),
      backupName: backupName,
      timestamp: currentDate.toISOString()
    };
    
  } catch (error) {
    console.error('❌ [CLA BACKUP] Error creating backup:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Backup function with additional checks and validation
 */
function createClaBackupWithCheck() {
  try {
    console.log('🔍 [CLA BACKUP] Starting backup with validation checks...');
    
    // Check if source sheet exists and has data
    var sourceSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sourceSheet = sourceSpreadsheet.getSheetByName('world buffs');
    
    if (!sourceSheet) {
      throw new Error('Source sheet "world buffs" not found');
    }
    
    var dataRange = sourceSheet.getDataRange();
    var rowCount = dataRange.getNumRows();
    var colCount = dataRange.getNumColumns();
    
    console.log('📊 [CLA BACKUP] Source sheet has ' + rowCount + ' rows and ' + colCount + ' columns');
    
    if (rowCount < 5) {
      console.warn('⚠️ [CLA BACKUP] Warning: Source sheet has very few rows (' + rowCount + ')');
    }
    
    // Proceed with backup
    var result = createClaBackup();
    
    if (result.success) {
      result.sourceRows = rowCount;
      result.sourceCols = colCount;
      console.log('✅ [CLA BACKUP] Backup with checks completed successfully');
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ [CLA BACKUP] Backup with checks error:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Helper function to format date for filename
 */
function formatDateForFilename(date) {
  var day = ('0' + date.getDate()).slice(-2);
  var month = ('0' + (date.getMonth() + 1)).slice(-2);
  var year = date.getFullYear();
  return day + '-' + month + '-' + year;
}

// ==============================================
// ANALYSIS IMPLEMENTATION 
// ==============================================

/**
 * Main function to populate world buffs data
 * Modified from original to work with remote triggering
 */
function populateWorldBuffs(worldBuffsSheet, logUrl) {
  try {
    console.log('🌍 [WORLD BUFFS] Populating world buffs data for log:', logUrl);
    
    var firstNameRow = 5;
    var firstNameColumn = 27;

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = worldBuffsSheet; // Use the passed sheet parameter instead of getActiveSheet()
    var instructionsSheet = ss.getSheetByName("Instructions");

    instructionsSheet.getRange(27, 2).setValue("");
    instructionsSheet.getRange(28, 2).setValue("");

    var darkMode = false;
    try {
      if (shiftRangeByRows(instructionsSheet, shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^export fights$").useRegularExpression(true).findNext(), 1), 2).getValue().indexOf("yes") > -1)
        darkMode = true;
    } catch { }

    sheet.getRange(firstNameRow, firstNameColumn, 96, 24).clearContent();
    sheet.getRange(firstNameRow, firstNameColumn + 36, 96, 10).clearContent();
    sheet.getRange(firstNameRow, 2, 96, 1).clearContent();
    sheet.getRange(20, 18).clearContent();
    if (darkMode) {
      sheet.getRange(1, 1, 100, 16).setBackground("#d9d9d9");
      sheet.getRange(1, 17, 4, 1).setBackground("#d9d9d9");
      sheet.getRange(11, 17, 90, 1).setBackground("#d9d9d9");
      sheet.getRange(1, 18, 100, 59).setBackground("#d9d9d9");
    } else {
      sheet.getRange(1, 1, 100, 16).setBackground("white");
      sheet.getRange(1, 17, 4, 1).setBackground("white");
      sheet.getRange(11, 17, 90, 1).setBackground("white");
      sheet.getRange(1, 18, 100, 59).setBackground("white");
    }

    // Write the log URL to the Instructions sheet E11 for reference FIRST
    try {
      instructionsSheet.getRange('E11').setValue(logUrl);
      console.log('📝 [WORLD BUFFS] Log URL written to E11:', logUrl);
    } catch (error) {
      console.log('⚠️ [WORLD BUFFS] Could not write log URL to E11:', error);
      throw new Error('Failed to write log URL to sheet: ' + error.toString());
    }

    // Get API key from Instructions sheet - try multiple methods
    var api_key = null;
    
    // Method 1: Try E9 directly (user mentioned it's there)
    try {
      api_key = instructionsSheet.getRange('E9').getValue();
      console.log('🔑 [WORLD BUFFS] Trying E9 for API key:', api_key ? 'Found' : 'Empty');
    } catch (error) {
      console.log('⚠️ [WORLD BUFFS] Could not read E9:', error);
    }
    
    // Method 2: Try the original method (looking for "2.")
    if (!api_key) {
      try {
        var apiKeyCell = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^2.$").useRegularExpression(true).findNext(), 4);
        if (apiKeyCell) {
          api_key = apiKeyCell.getValue();
          console.log('🔑 [WORLD BUFFS] Found API key via "2." method:', api_key ? 'Found' : 'Empty');
        }
      } catch (error) {
        console.log('⚠️ [WORLD BUFFS] Could not find API key via "2." method:', error);
      }
    }
    
    if (!api_key) {
      throw new Error('WarcraftLogs API key not found. Tried E9 and looking for "2." in Instructions sheet. Please ensure your API key is in cell E9.');
    }
    
    api_key = api_key.replace(/\s/g, "");
    console.log('🔑 [WORLD BUFFS] API key found, length:', api_key.length);
    
    // Use the passed logUrl instead of reading from sheet
    var reportPathOrId = logUrl;
    
    var includeReportTitleInSheetNames = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^4.$").useRegularExpression(true).findNext(), 4).getValue();
    var manualStartAndEnd = shiftRangeByColumns(sheet, sheet.createTextFinder("^start - end").useRegularExpression(true).findNext(), 2).getValue();
    var information = addColumnsToRange(sheet, addRowsToRange(sheet, sheet.createTextFinder("^title $").useRegularExpression(true).findNext(), 2), 1);
    shiftRangeByColumns(sheet, information, 1).clearContent();

    if (manualStartAndEnd != null && manualStartAndEnd.toString().length > 0)
      manualStartAndEnd = manualStartAndEnd.replace(" ", "");

    var logId = "";
    reportPathOrId = reportPathOrId.replace(".cn/", ".com/");
    if (reportPathOrId.indexOf("tbc.warcraftlogs") > -1)
      SpreadsheetApp.getUi().alert("This is the vanilla version of the CLA. Apparently you tried to run it for a TBC report. Please use the TBC version of the CLA for that, which you can get at https://discord.gg/nGvt5zH or https://docs.google.com/spreadsheets/d/1EJ0g1i72rJjQkP1IN2Kz0vq31EphlrT0nCworP6ZXMc");
    if (reportPathOrId.indexOf("classic.warcraftlogs.com/reports/") > -1)
      logId = reportPathOrId.split("classic.warcraftlogs.com/reports/")[1].split("#")[0].split("?")[0];
    else if (reportPathOrId.indexOf("vanilla.warcraftlogs.com/reports/") > -1)
      logId = reportPathOrId.split("vanilla.warcraftlogs.com/reports/")[1].split("#")[0].split("?")[0];
    else if (reportPathOrId.indexOf("sod.warcraftlogs.com/reports/") > -1)
      logId = reportPathOrId.split("sod.warcraftlogs.com/reports/")[1].split("#")[0].split("?")[0];
    else if (reportPathOrId.indexOf("fresh.warcraftlogs.com/reports/") > -1)
      logId = reportPathOrId.split("fresh.warcraftlogs.com/reports/")[1].split("#")[0].split("?")[0];
    else
      logId = reportPathOrId;
    var startEndString = "&start=0&end=999999999999";
    if (manualStartAndEnd != null && manualStartAndEnd.toString().length > 0) {
      var startEndParts = manualStartAndEnd.split("-");
      startEndString = "&start=" + startEndParts[0] + "&end=" + startEndParts[1];
    }
    var apiKeyString = "?api_key=" + api_key;
    var baseUrl = "https://vanilla.warcraftlogs.com:443/v1/";
    var urlAllFights = baseUrl + "report/fights/" + logId + apiKeyString;

    var allFightsData = JSON.parse(UrlFetchApp.fetch(urlAllFights));
    var baseSheetName = "world buffs";
    if (includeReportTitleInSheetNames.indexOf("yes") > -1)
      baseSheetName += " " + allFightsData.title;
    try {
      sheet.setName(baseSheetName);
    } catch (err) {
      try {
        sheet.setName(baseSheetName + "_new");
      } catch (err2) {
        try {
          sheet.setName(baseSheetName + "_new_new");
        } catch (err3) {
          sheet.setName(baseSheetName + "_new_new_new");
        }
      }
    }

    var timeOfFirstBoss = 0;
    var timeOfLastBoss = 0;
    allFightsData.fights.forEach(function (fight, fightRawCount) {
      if ((fight.boss != null && Number(fight.boss) > 0) || (fight.originalBoss != null && (Number(fight.originalBoss) == 51114 || Number(fight.originalBoss) == 1114))) {
        if (timeOfFirstBoss == 0 || fight.start_time < timeOfFirstBoss)
          timeOfFirstBoss = fight.start_time;
        if ((timeOfLastBoss == 0 || fight.end_time > timeOfLastBoss) && !(fight.boss != null && (Number(fight.boss) == 51114) || Number(fight.originalBoss) == 1114))
          timeOfLastBoss = fight.end_time;
      }
    })

    var raidDuration = 0;
    var returnVal = getRaidStartAndEnd(allFightsData, ss, baseUrl + "report/events/summary/" + logId + apiKeyString);
    var zonesFound = [];
    if (returnVal != null && returnVal.zonesFound != null)
      zonesFound = returnVal.zonesFound;
    var zoneTimesString = " (";
    if (zonesFound != null && zonesFound.length > 0) {
      zonesFound.forEach(function (raidZone, raidZoneCount) {
        zoneTimesString += raidZone[5] + " in ";
        if (raidZone[10] > 0) {
          zoneTimesString += getStringForTimeStamp(raidZone[10], true) + ", ";
        } else {
          zoneTimesString += getStringForTimeStamp(raidZone[2] - raidZone[1], true) + ", ";
        }
        raidDuration += raidZone[4] - raidZone[3];
      })
      zoneTimesString = zoneTimesString.substr(0, zoneTimesString.length - 2);
      if (zoneTimesString.length > 0)
        sheet.getRange(information.getRow(), information.getColumn() + 1).setValue(allFightsData.title + zoneTimesString + ")");
      else
        sheet.getRange(information.getRow(), information.getColumn() + 1).setValue(allFightsData.title);
    } else
      SpreadsheetApp.getUi().alert("Couldn't identify any raid zones of this report --- If you think this is an error please inform shariva on Discord about this!");

    var nameSet = false;
    allFightsData.fights.forEach(function (fight, fightCount) {
      if (fight.zoneName != null && fight.zoneName.length > 0 && !nameSet) {
        sheet.getRange(information.getRow() + 1, information.getColumn() + 1).setValue(fight.zoneName);
        nameSet = true;
      }
    })
    sheet.getRange(information.getRow() + 2, information.getColumn() + 1).setValue(new Date(allFightsData.start));

    buffsToTrack = sheet.getRange(firstNameRow - 1, firstNameColumn + 1, 1, 13).getValues().filter(String).toString().split(",");//.reduce(function(ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);

    for (var i = 0, j = buffsToTrack.length; i < j; i++) {
      if (buffsToTrack[i] == "Nef/Ony")
        buffsToTrack[i] = "22888,355363";
      else if (buffsToTrack[i] == "Rend")
        buffsToTrack[i] = "16609,355366,460940";
      else if (buffsToTrack[i] == "ZG heart")
        buffsToTrack[i] = "24425,355365";
      else if (buffsToTrack[i] == "Songflower")
        buffsToTrack[i] = "15366";
      else if (buffsToTrack[i] == "Mol'dar")
        buffsToTrack[i] = "22818";
      else if (buffsToTrack[i] == "Fengus")
        buffsToTrack[i] = "22817";
      else if (buffsToTrack[i] == "Slip'kik")
        buffsToTrack[i] = "22820";
      else if (buffsToTrack[i] == "DMF")
        buffsToTrack[i] = "23736,23735,23737,23738,23769,23766,23768,23767";
      else if (buffsToTrack[i] == "Sheen")
        buffsToTrack[i] = "24417";
      else if (buffsToTrack[i] == "Spirit")
        buffsToTrack[i] = "24382";
      else if (buffsToTrack[i] == "Swiftness")
        buffsToTrack[i] = "24383";
      else if (buffsToTrack[i] == "score")
        buffsToTrack[i] = "99999";
      else if (buffsToTrack[i] == "amount")
        buffsToTrack[i] = "99998";
    }

    var urlPeopleTracked = baseUrl + "report/tables/casts/" + logId + apiKeyString + startEndString;
    var allPlayersData = JSON.parse(UrlFetchApp.fetch(urlPeopleTracked));
    var allPlayersByNameAsc = sortByProperty(sortByProperty(allPlayersData.entries, 'name'), "type");
    var buffsArr = [];
    var buffsArrOriginal = [];
    var buffsArrMinutes = [];
    var buffsArrCount = [];
    var playerCount = 0;
    var playersWithDMFCount = 0;
    allPlayersByNameAsc.forEach(function (playerByNameAsc, playerByNameAscCount) {
      if (playerByNameAsc.total > 20) {
        var urlBuffsTotal = baseUrl + "report/events/buffs/" + logId + apiKeyString + startEndString + "&sourceid=" + playerByNameAsc.id;
        var buffsTotalData = JSON.parse(UrlFetchApp.fetch(urlBuffsTotal));
        var urlBuffsTotalSum = baseUrl + "report/tables/buffs/" + logId + apiKeyString + startEndString + "&sourceid=" + playerByNameAsc.id;
        var buffsTotalDataSum = JSON.parse(UrlFetchApp.fetch(urlBuffsTotalSum));
        var urlDeathsTotalSum = baseUrl + "report/tables/deaths/" + logId + apiKeyString + startEndString + "&sourceid=" + playerByNameAsc.id;
        var deathsTotalDataSum = JSON.parse(UrlFetchApp.fetch(urlDeathsTotalSum));
        buffsArr[buffsArr.length] = [];
        buffsArrCount[buffsArrCount.length] = [];
        buffsArrOriginal[buffsArrOriginal.length] = [];
        buffsArrMinutes[buffsArrMinutes.length] = [];

        var range = sheet.getRange(firstNameRow + playerCount, 2);
        range.setValue(playerByNameAsc.name);
        range.setBackground(getColourForPlayerClass(playerByNameAsc.type));

        var buffEnds = [];
        var buffStarts = [];
        for (var k = 0, l = buffsToTrack.length; k < l; k++) {
          var buffEndFill = 0;
          buffsTotalData.events.forEach(function (buffEvent, buffEventCount) {
            if (buffEvent.type != null && buffEvent.type.toString() == "removebuff" && buffEvent.ability != null) {
              if (buffEvent.ability.guid != null) {
                buffsToTrack[k].split(",").forEach(function (buffIdToTrack, buffIdToTrackCount) {
                  if (buffEvent.ability.guid.toString() == buffIdToTrack) {
                    buffEnds.push(buffEvent.timestamp);
                  }
                })
              }
            } if (buffEvent.type != null && buffEvent.type.toString() == "applybuff" && buffEvent.ability != null) {
              buffStarts.push(buffEvent.timestamp);
            }
          })
          buffsTotalDataSum.auras.forEach(function (spell, spellCount) {
            if (spell.guid != null) {
              buffsToTrack[k].split(",").forEach(function (buffIdToTrack, buffIdToTrackCount) {
                if (spell.guid.toString() == buffIdToTrack) {
                  spell.bands.forEach(function (spellBand, spellBandCount) {
                    if ((buffEndFill == 0 || spellBand.endTime > buffEndFill) && spellBand.endTime != timeOfLastBoss)
                      buffEndFill = spellBand.endTime;
                  })
                  buffEnds.push(buffEndFill);
                }
              })
            }
          })
        }
        var deathTimes = [];
        if (deathsTotalDataSum.entries != null) {
          deathsTotalDataSum.entries.forEach(function (deathEntry, deathEntryCount) {
            if (deathEntry != null && deathEntry.timestamp != null)
              deathTimes.push(deathEntry.timestamp);
          })
        }
        var durationsAverageOnRaid = 0;
        var nrOfBuffs = 0;
        var nrOfBuffsFiltered = 0;
        var nrOfBuffsNotCounting = 0;
        for (var i = 0, j = buffsToTrack.length; i < j; i++) {
          if (buffsToTrack[i].toString() != "99999" && buffsToTrack[i].toString() != "99998") {
            var amount = 0;
            var duration = 0;
            var maxDuration = 0;
            var buffStart = 0;
            var buffEnd = 0;
            var durationAverageOnRaid = 0;
            buffsTotalDataSum.auras.forEach(function (spell, spellCount) {
              if (spell.guid != null) {
                buffsToTrack[i].split(",").forEach(function (buffIdToTrack, buffIdToTrackCount) {
                  if (spell.guid.toString() == buffIdToTrack) {
                    if (buffsToTrack[i].toString() == "22888,355363")
                      maxDuration = 7200;
                    else if (buffsToTrack[i].toString() == "16609,355366,460940")
                      maxDuration = 3600;
                    else if (buffsToTrack[i].toString() == "24425,355365")
                      maxDuration = 7200;
                    else if (buffsToTrack[i].toString() == "15366")
                      maxDuration = 3600;
                    else if (buffsToTrack[i].toString() == "22818")
                      maxDuration = 7200;
                    else if (buffsToTrack[i].toString() == "22817")
                      maxDuration = 7200;
                    else if (buffsToTrack[i].toString() == "22820")
                      maxDuration = 7200;
                    else if (buffsToTrack[i].toString() == "23736,23735,23737,23738,23769,23766,23768,23767") {
                      maxDuration = 7200;
                      playersWithDMFCount += 1;
                    } else if (buffsToTrack[i].toString() == "24417")
                      maxDuration = 0;
                    else if (buffsToTrack[i].toString() == "24382")
                      maxDuration = 0;
                    else if (buffsToTrack[i].toString() == "24383")
                      maxDuration = 0;
                    spell.bands.forEach(function (spellBand, spellBandCount) {
                      if (buffStart == 0 || spellBand.startTime < buffStart)
                        buffStart = spellBand.startTime;
                      if (buffEnd == 0 || spellBand.endTime > buffEnd)
                        buffEnd = spellBand.endTime;
                    })
                    amount += spell.total;
                  }
                })
              }
            })
            var playerDying = false;
            for (var m = 0, n = deathTimes.length; m < n; m++) {
              if (Math.abs(Number(deathTimes[m]) - Number(buffEnd)) < 2000)
                playerDying = true;
            }
            var simultaneousBuffGained = false;
            for (var o = 0, p = buffStarts.length; o < p; o++) {
              if (buffEnd == buffStarts[o]) {
                simultaneousBuffGained = true;
              }
            }
            if ((playerByNameAsc.type == "Druid" || playerByNameAsc.type == "Mage" || playerByNameAsc.type == "Paladin" || playerByNameAsc.type == "Priest" || playerByNameAsc.type == "Shaman" || playerByNameAsc.type == "Warlock") && buffsToTrack[i].toString() == "22817") {
              nrOfBuffsNotCounting += 1;
            }
            else if ((playerByNameAsc.type == "Hunter" || playerByNameAsc.type == "Rogue" || playerByNameAsc.type == "Warrior") && buffsToTrack[i].toString() == "22820") {
              nrOfBuffsNotCounting += 1;
            }
            if (amount == 0) {
              buffsArr[buffsArr.length - 1].push("     ");
              if (buffsToTrack[i].toString() != "24382" && buffsToTrack[i].toString() != "24383" && buffsToTrack[i].toString() != "24417") {
                buffsArrOriginal[buffsArrOriginal.length - 1].push("     ");
                buffsArrMinutes[buffsArrMinutes.length - 1].push("     ");
              }
            } else {
              if (buffEnd > 0 && buffEnd != timeOfLastBoss)
                duration = buffEnd - buffStart;
              else
                duration = raidDuration;
              durationAverageOnRaid = Math.floor((duration / raidDuration) * 100);
              if (maxDuration == 0) {
                buffsArr[buffsArr.length - 1].push("X");
              } else {
                nrOfBuffs += 1;
                var outputString = durationAverageOnRaid + "%";
                var originalOutputString = outputString;
                if (!playerDying && !simultaneousBuffGained)
                  outputString = outputString;
                else if (!playerDying && simultaneousBuffGained)
                  outputString += "^";
                else
                  outputString += "*";
                if ((playerByNameAsc.type == "Druid" || playerByNameAsc.type == "Mage" || playerByNameAsc.type == "Paladin" || playerByNameAsc.type == "Priest" || playerByNameAsc.type == "Shaman" || playerByNameAsc.type == "Warlock") && buffsToTrack[i].toString() == "22817") {
                  outputString += "|";
                  nrOfBuffs -= 1;
                }
                else if ((playerByNameAsc.type == "Hunter" || playerByNameAsc.type == "Rogue" || playerByNameAsc.type == "Warrior") && buffsToTrack[i].toString() == "22820") {
                  outputString += "|";
                  nrOfBuffs -= 1;
                }
                else {
                  durationsAverageOnRaid += durationAverageOnRaid;
                  nrOfBuffsFiltered += 1;
                }
                buffsArr[buffsArr.length - 1].push(outputString);
                buffsArrOriginal[buffsArrOriginal.length - 1].push(originalOutputString);

                var delta = duration / 1000;
                var hours = Math.floor(delta / 3600) % 24;
                delta -= hours * 3600;
                var minutes = Math.floor(delta / 60) % 60;
                delta -= minutes * 60;
                var seconds = Math.round(delta % 60);

                var secondsString = '';
                if (seconds < 10)
                  secondsString = '0' + seconds.toString();
                else
                  secondsString = seconds.toString();

                var minutesString = '';
                if (minutes < 10)
                  minutesString = '0' + minutes.toString();
                else
                  minutesString = minutes.toString();
                if (hours > 0)
                  buffsArrMinutes[buffsArrMinutes.length - 1].push(hours + ":" + minutesString + ":" + secondsString);
                else
                  buffsArrMinutes[buffsArrMinutes.length - 1].push(minutesString + ":" + secondsString);
              }
            }
          }
          else {
            if (buffsToTrack[i].toString() == "99999") {
              if (nrOfBuffsFiltered > 0) {
                buffsArr[buffsArr.length - 1].push(Math.round(durationsAverageOnRaid / nrOfBuffsFiltered) + "%");
                buffsArrOriginal[buffsArrOriginal.length - 1].push(Math.round(durationsAverageOnRaid / nrOfBuffsFiltered) + "%");
                buffsArrMinutes[buffsArrMinutes.length - 1].push("     ");
              } else {
                buffsArr[buffsArr.length - 1].push("0%");
                buffsArrOriginal[buffsArrOriginal.length - 1].push("0%");
                buffsArrMinutes[buffsArrMinutes.length - 1].push("     ");
              }
            }
            else if (buffsToTrack[i].toString() == "99998") {
              buffsArrCount[buffsArrCount.length - 1].push(nrOfBuffs + " / " + (8 - nrOfBuffsNotCounting));
            }
          }
        }
        playerCount++;
      }
    })

    if (playersWithDMFCount < 10) {
      var buffsArrCountCopy = [];
      for (var q = 0, r = buffsArrCount.length; q < r; q++) {
        buffsArrCountCopy[q] = [];
        for (var s = 0, t = buffsArrCount[q].length; s < t; s++) {
          var buffsToBring = Number(buffsArrCount[q][s].split(" / ")[1]);
          var buffsBrought = Number(buffsArrCount[q][s].split(" / ")[0]);
          buffsToBring -= 1;
          if (buffsBrought > 0 && buffsArrOriginal[q][7].toString().indexOf(" ") < 0) {
            buffsBrought -= 1;
          }
          buffsArrCountCopy[q].push(buffsArrCount[q][s].replace(" / " + buffsArrCount[q][s].split(" / ")[1], " / " + buffsToBring).replace(buffsArrCount[q][s].split(" / ")[0] + " / ", buffsBrought + " / "));
        }
        sheet.getRange(20, 18).setValue("Less than 10 players used DMF, thus it's NOT considered!")
      }
      sheet.getRange(firstNameRow, firstNameColumn + buffsToTrack.length, playerCount, 1).setValues(buffsArrCountCopy);
    }
    else
      sheet.getRange(firstNameRow, firstNameColumn + buffsToTrack.length, playerCount, 1).setValues(buffsArrCount);

    sheet.getRange(firstNameRow, firstNameColumn + 1, playerCount, buffsToTrack.length - 1).setValues(buffsArr);
    sheet.getRange(firstNameRow, firstNameColumn + 15, playerCount, buffsToTrack.length - 4).setValues(buffsArrOriginal);
    sheet.getRange(firstNameRow, firstNameColumn + 36, playerCount, buffsToTrack.length - 4).setValues(buffsArrMinutes);
    
    console.log('✅ [WORLD BUFFS] World buffs data populated successfully');
    
  } catch (error) {
    console.error('❌ [WORLD BUFFS] Error in populateWorldBuffs function:', error);
    throw error; // Re-throw to be caught by the handler
  }
}

// ==============================================
// HELPER FUNCTIONS
// ==============================================

function shiftRangeByRows(sheet, range, rowCount) {
  if (range == null) return null;
  return sheet.getRange(range.getRow() + rowCount, range.getColumn(), range.getNumRows(), range.getNumColumns());
}

function shiftRangeByColumns(sheet, range, columnCount) {
  if (range == null) return null;
  return sheet.getRange(range.getRow(), range.getColumn() + columnCount, range.getNumRows(), range.getNumColumns());
}

function addRowsToRange(sheet, range, rowCount) {
  if (range == null) return null;
  return sheet.getRange(range.getRow(), range.getColumn(), range.getNumRows() + rowCount, range.getNumColumns());
}

function addColumnsToRange(sheet, range, columnCount) {
  if (range == null) return null;
  return sheet.getRange(range.getRow(), range.getColumn(), range.getNumRows(), range.getNumColumns() + columnCount);
}

function sortByProperty(array, property) {
  return array.sort(function(a, b) {
    if (a[property] < b[property]) return -1;
    if (a[property] > b[property]) return 1;
    return 0;
  });
}

function getColourForPlayerClass(playerClass) {
  switch (playerClass) {
    case "Warrior": return "#C79C6E";
    case "Paladin": return "#F58CBA";
    case "Hunter": return "#ABD473";
    case "Rogue": return "#FFF569";
    case "Priest": return "#FFFFFF";
    case "Shaman": return "#0070DE";
    case "Mage": return "#69CCF0";
    case "Warlock": return "#9482C9";
    case "Druid": return "#FF7D0A";
    default: return "#CCCCCC";
  }
}

function getStringForTimeStamp(timeStamp, includeSeconds) {
  var hours = Math.floor(timeStamp / 3600000);
  var minutes = Math.floor((timeStamp % 3600000) / 60000);
  var seconds = Math.floor((timeStamp % 60000) / 1000);
  
  var result = "";
  if (hours > 0) {
    result += hours + "h ";
  }
  if (minutes > 0 || hours > 0) {
    result += minutes + "m ";
  }
  if (includeSeconds && (seconds > 0 || minutes > 0 || hours > 0)) {
    result += seconds + "s";
  }
  
  return result.trim();
}

function getRaidStartAndEnd(allFightsData, ss, summaryUrl) {
  // This is a simplified version of the getRaidStartAndEnd function
  // You may need to implement the full logic based on your specific requirements
  
  var zonesFound = [];
  var zoneId = null;
  var zoneName = "";
  
  // Analyze fights to determine zones
  allFightsData.fights.forEach(function(fight) {
    if (fight.boss != null && Number(fight.boss) > 0) {
      if (zoneId == null) {
        zoneId = fight.zoneID || 1;
        zoneName = fight.zoneName || "Unknown Zone";
      }
    }
  });
  
  if (zoneId != null) {
    var startTime = allFightsData.fights[0].start_time || 0;
    var endTime = allFightsData.fights[allFightsData.fights.length - 1].end_time || 0;
    var duration = endTime - startTime;
    
    zonesFound.push([
      startTime,     // [0] start time
      endTime,       // [1] end time  
      startTime,     // [2] zone start
      endTime,       // [3] zone end
      duration,      // [4] duration
      zoneName,      // [5] zone name
      zoneId,        // [6] zone id
      0,             // [7] unused
      0,             // [8] unused
      0,             // [9] unused
      duration       // [10] actual duration
    ]);
  }
  
  return {
    zonesFound: zonesFound
  };
} 