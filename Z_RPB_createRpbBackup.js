/**
 * Creates a backup copy of the "All" tab in a new Google Sheet
 * Names it "RPB - dd-mm-yyyy" and places it in the specified Drive folder
 * 
 * This function is completely independent and avoids conflicts with existing RPB scripts
 */

/**
 * MERGED Web app entry point - handles HTTP GET/POST requests
 * This allows both CreateRpbBackup and RPB functions to be called from external applications
 */
function doPost(e) {
  try {
    console.log('📨 [WEB APP] doPost called');
    console.log('📨 [WEB APP] Raw postData:', e.postData);
    
    if (!e.postData || !e.postData.contents) {
      console.log('❌ [WEB APP] No postData contents');
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'No postData contents'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    console.log('📨 [WEB APP] postData contents:', e.postData.contents);
    var params = JSON.parse(e.postData.contents);
    console.log('📨 [WEB APP] Parsed params:', JSON.stringify(params));
    console.log('📨 [WEB APP] Action value:', params.action);
    console.log('📨 [WEB APP] Action type:', typeof params.action);
    
    // === ARCHIVE FUNCTIONALITY ===
    if (params.action === 'createRpbBackup') {
      console.log('✅ [WEB APP] Action matches - calling createRpbBackupWebApp');
      var result = createRpbBackupWebApp();
      console.log('✅ [WEB APP] createRpbBackupWebApp result:', JSON.stringify(result));
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // === RPB FUNCTIONALITY ===
    const action = params.action;
    const logUrl = params.logUrl;
    
    console.log('🎯 [WEB APP] Action requested:', action);
    console.log('🔗 [WEB APP] Log URL provided:', logUrl);
    
    if (action === 'startRPB') {
      console.log('🚀 [WEB APP] Routing to startRPBProcessing');
      return startRPBProcessing(logUrl);
    } else if (action === 'checkStatus') {
      console.log('🔍 [WEB APP] Routing to checkRPBStatus');
      return checkRPBStatus();
    } else if (action === 'clearStatus') {
      console.log('🧹 [WEB APP] Routing to clearRPBStatus');
      return clearRPBStatus();
    } else if (action === 'clearF11') {
      console.log('🧹 [WEB APP] Routing to clearF11Only');
      return clearF11Only();
    } else if (action === 'archiveRPB') {
      console.log('🗂️ [WEB APP] Routing to archiveRPBResults');
      return archiveRPBResults();
    }
    
    // Unknown action
    console.log('❌ [WEB APP] Action does not match any known actions. Got:', params.action);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Unknown action: ' + (params.action || 'none'),
        receivedParams: params
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.log('❌ [WEB APP] doPost error:', error.toString());
    console.log('❌ [WEB APP] doPost error stack:', error.stack);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Invalid request: ' + error.toString(),
        stack: error.stack
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Web app entry point for GET requests
 */
function doGet(e) {
  var action = e.parameter.action;
  
  if (action === 'createRpbBackup') {
    return ContentService
      .createTextOutput(JSON.stringify(createRpbBackupWebApp()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService
    .createTextOutput(JSON.stringify({
      success: false,
      error: 'Unknown action: ' + (action || 'none')
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
function createRpbBackup() {
  try {
    // Get current date and format it as dd-mm-yyyy
    var currentDate = new Date();
    var day = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'dd');
    var month = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'MM');
    var year = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyy');
    var formattedDate = day + '-' + month + '-' + year;
    
    // Create new spreadsheet name
    var newSheetName = 'RPB - ' + formattedDate;
    
    // Get current spreadsheet and the "All" tab
    var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var allTab = currentSpreadsheet.getSheetByName('All');
    
    if (!allTab) {
      throw new Error('Could not find "All" tab in current spreadsheet');
    }
    
    Logger.log('Found "All" tab, creating backup...');
    
    // Create new spreadsheet
    var newSpreadsheet = SpreadsheetApp.create(newSheetName);
    Logger.log('Created new spreadsheet: ' + newSheetName);
    
    // Copy the "All" tab to the new spreadsheet
    var copiedSheet = allTab.copyTo(newSpreadsheet);
    copiedSheet.setName('All');
    Logger.log('Copied "All" tab to new spreadsheet');
    
    // Remove the default "Sheet1" from new spreadsheet
    var defaultSheet = newSpreadsheet.getSheetByName('Sheet1');
    if (defaultSheet) {
      newSpreadsheet.deleteSheet(defaultSheet);
      Logger.log('Removed default Sheet1');
    }
    
    // Move to specific folder
    var targetFolderId = '1YgXMDYl5GdBlO3y9MXBNeaWw2j8FvJ7W';
    var newFile = DriveApp.getFileById(newSpreadsheet.getId());
    var targetFolder = DriveApp.getFolderById(targetFolderId);
    
    // Move file to target folder (remove from root folder first)
    var parents = newFile.getParents();
    while (parents.hasNext()) {
      var parent = parents.next();
      parent.removeFile(newFile);
    }
    targetFolder.addFile(newFile);
    
    Logger.log('Moved file to target folder');
    
    // Get the final URL
    var finalUrl = newSpreadsheet.getUrl();
    Logger.log('Backup created successfully: ' + finalUrl);
    
    // Show success message to user
    SpreadsheetApp.getUi().alert(
      'Backup Created Successfully!',
      'RPB backup has been created as "' + newSheetName + '" and placed in the specified Drive folder.\n\nURL: ' + finalUrl,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    return finalUrl;
    
  } catch (error) {
    Logger.log('Error creating RPB backup: ' + error.toString());
    
    // Show error message to user
    SpreadsheetApp.getUi().alert(
      'Backup Creation Failed',
      'An error occurred while creating the RPB backup:\n\n' + error.toString(),
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    
    throw error;
  }
}

/**
 * Web app compatible function that creates RPB backup and returns JSON response
 * This function is designed for HTTP calls from external applications
 */
function createRpbBackupWebApp() {
  try {
    // Get current date and format it as dd-mm-yyyy
    var currentDate = new Date();
    var day = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'dd');
    var month = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'MM');
    var year = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyy');
    var formattedDate = day + '-' + month + '-' + year;
    
    // Create new spreadsheet name
    var newSheetName = 'RPB - ' + formattedDate;
    
    // Get current spreadsheet and the "All" tab
    var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var allTab = currentSpreadsheet.getSheetByName('All');
    
    if (!allTab) {
      return {
        success: false,
        error: 'Could not find "All" tab in current spreadsheet'
      };
    }
    
    Logger.log('Found "All" tab, creating backup...');
    
    // Create new spreadsheet
    var newSpreadsheet = SpreadsheetApp.create(newSheetName);
    Logger.log('Created new spreadsheet: ' + newSheetName);
    
    // Copy the "All" tab to the new spreadsheet
    var copiedSheet = allTab.copyTo(newSpreadsheet);
    copiedSheet.setName('All');
    Logger.log('Copied "All" tab to new spreadsheet');
    
    // Remove the default "Sheet1" from new spreadsheet
    var defaultSheet = newSpreadsheet.getSheetByName('Sheet1');
    if (defaultSheet) {
      newSpreadsheet.deleteSheet(defaultSheet);
      Logger.log('Removed default Sheet1');
    }
    
    // Move to specific folder
    var targetFolderId = '1YgXMDYl5GdBlO3y9MXBNeaWw2j8FvJ7W';
    var newFile = DriveApp.getFileById(newSpreadsheet.getId());
    var targetFolder = DriveApp.getFolderById(targetFolderId);
    
    // Move file to target folder (remove from root folder first)
    var parents = newFile.getParents();
    while (parents.hasNext()) {
      var parent = parents.next();
      parent.removeFile(newFile);
    }
    targetFolder.addFile(newFile);
    
    Logger.log('Moved file to target folder');
    
    // Get the final URL
    var finalUrl = newSpreadsheet.getUrl();
    Logger.log('Backup created successfully: ' + finalUrl);
    
    // Return JSON response for web app
    return {
      success: true,
      message: 'RPB backup created successfully',
      sheetName: newSheetName,
      url: finalUrl,
      folderId: targetFolderId,
      createdAt: new Date().toISOString()
    };
    
  } catch (error) {
    Logger.log('Error creating RPB backup: ' + error.toString());
    
    return {
      success: false,
      error: error.toString(),
      message: 'Failed to create RPB backup'
    };
  }
}

/**
 * Alternative function that checks if a backup for today already exists
 * and asks the user if they want to create another one
 */
function createRpbBackupWithCheck() {
  try {
    // Get current date and format it as dd-mm-yyyy
    var currentDate = new Date();
    var day = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'dd');
    var month = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'MM');
    var year = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'yyyy');
    var formattedDate = day + '-' + month + '-' + year;
    
    var newSheetName = 'RPB - ' + formattedDate;
    var targetFolderId = '1s3vf73brH783FfDlJLXYsAjDSJTU65tx';
    
    // Check if a backup for today already exists in the target folder
    var targetFolder = DriveApp.getFolderById(targetFolderId);
    var existingFiles = targetFolder.getFilesByName(newSheetName);
    
    if (existingFiles.hasNext()) {
      var ui = SpreadsheetApp.getUi();
      var response = ui.alert(
        'Backup Already Exists',
        'A backup named "' + newSheetName + '" already exists in the target folder.\n\nDo you want to create another backup? (It will have a slightly different name)',
        ui.ButtonSet.YES_NO
      );
      
      if (response == ui.Button.NO) {
        return existingFiles.next().getUrl();
      }
      
      // Add timestamp to make name unique
      var timestamp = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), 'HHmm');
      newSheetName = 'RPB - ' + formattedDate + ' (' + timestamp + ')';
    }
    
    // Proceed with creating the backup
    return createRpbBackupWithCustomName(newSheetName);
    
  } catch (error) {
    Logger.log('Error in createRpbBackupWithCheck: ' + error.toString());
    throw error;
  }
}

/**
 * Helper function to create backup with a custom name
 * Used internally by other functions
 */
function createRpbBackupWithCustomName(customName) {
  var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var allTab = currentSpreadsheet.getSheetByName('All');
  
  if (!allTab) {
    throw new Error('Could not find "All" tab in current spreadsheet');
  }
  
  // Create new spreadsheet
  var newSpreadsheet = SpreadsheetApp.create(customName);
  
  // Copy the "All" tab to the new spreadsheet
  var copiedSheet = allTab.copyTo(newSpreadsheet);
  copiedSheet.setName('All');
  
  // Remove the default "Sheet1" from new spreadsheet
  var defaultSheet = newSpreadsheet.getSheetByName('Sheet1');
  if (defaultSheet) {
    newSpreadsheet.deleteSheet(defaultSheet);
  }
  
  // Move to specific folder
  var targetFolderId = '1YgXMDYl5GdBlO3y9MXBNeaWw2j8FvJ7W';
  var newFile = DriveApp.getFileById(newSpreadsheet.getId());
  var targetFolder = DriveApp.getFolderById(targetFolderId);
  
  // Move file to target folder
  var parents = newFile.getParents();
  while (parents.hasNext()) {
    var parent = parents.next();
    parent.removeFile(newFile);
  }
  targetFolder.addFile(newFile);
  
  return newSpreadsheet.getUrl();
} 