/**
 * CLA Backup Functions
 * 
 * This script creates backups of the "frost resi (Sapp)" tab from the CLA Google Sheet.
 * Functions are called via HTTP POST requests (web app entry point)
 * 
 * Follows the same pattern as RPB backup system.
 */

/**
 * Web app entry point - handles HTTP POST requests (same as RPB)
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
    
    if (params.action === 'createClaBackup') {
      console.log('✅ [WEB APP] Action matches - calling createClaBackupWebApp');
      var result = createClaBackupWebApp();
      console.log('✅ [WEB APP] createClaBackupWebApp result:', JSON.stringify(result));
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: 'Unknown action: ' + params.action
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ [WEB APP] Error in doPost:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.message
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Web app compatible function that creates CLA backup and returns JSON response (same as RPB)
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
    var newSheetName = 'CLA - FrostRes - ' + formattedDate;
    
    // Get current spreadsheet and the "frost resi (Sapp)" tab (same as RPB method)
    var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sourceSheet = currentSpreadsheet.getSheetByName('frost resi (Sapp)');
    
    if (!sourceSheet) {
      return {
        success: false,
        error: 'Could not find "frost resi (Sapp)" tab in current spreadsheet'
      };
    }
    
    Logger.log('Found "frost resi (Sapp)" tab, creating backup...');
    
    // Create new spreadsheet
    var newSpreadsheet = SpreadsheetApp.create(newSheetName);
    Logger.log('Created new spreadsheet: ' + newSheetName);
    
    // Copy the "frost resi (Sapp)" tab to the new spreadsheet
    var copiedSheet = sourceSheet.copyTo(newSpreadsheet);
    copiedSheet.setName('frost resi (Sapp)');
    Logger.log('Copied "frost resi (Sapp)" tab to new spreadsheet');
    
    // Remove the default "Sheet1" from new spreadsheet
    var defaultSheet = newSpreadsheet.getSheetByName('Sheet1');
    if (defaultSheet) {
      newSpreadsheet.deleteSheet(defaultSheet);
    }
    
    // Move to specific folder
    var targetFolderId = '1YgXMDYl5GdBlO3y9MXBNeaWw2j8FvJ7W';
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
 * Standard backup function - creates backup of "frost resi (Sapp)" tab
 */
function createClaBackup() {
  try {
    console.log('🗄️ [CLA BACKUP] Starting CLA backup creation...');
    
    // Get current spreadsheet and the "frost resi (Sapp)" tab (same as RPB method)
    var currentSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    var sourceSheet = currentSpreadsheet.getSheetByName('frost resi (Sapp)');
    
    if (!sourceSheet) {
      throw new Error('Source sheet "frost resi (Sapp)" not found');
    }
    
    // Create new spreadsheet
    var currentDate = new Date();
    var backupName = 'CLA - FrostRes - ' + formatDateForFilename(currentDate);
    console.log('📝 [CLA BACKUP] Creating backup with name: ' + backupName);
    
    var newSpreadsheet = SpreadsheetApp.create(backupName);
    
    // Copy the sheet using copyTo() method (same as working RPB backup)
    var copiedSheet = sourceSheet.copyTo(newSpreadsheet);
    copiedSheet.setName('frost resi (Sapp)');
    
    // Remove the default "Sheet1" from new spreadsheet
    var defaultSheet = newSpreadsheet.getSheetByName('Sheet1');
    if (defaultSheet) {
      newSpreadsheet.deleteSheet(defaultSheet);
    }
    
    console.log('📋 [CLA BACKUP] Successfully copied "frost resi (Sapp)" tab using copyTo() method');
    
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
    
    console.log('✅ [CLA BACKUP] Backup created successfully: ' + newSpreadsheet.getUrl());
    
    return {
      success: true,
      message: 'CLA - FrostRes backup created successfully',
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
   * Web app version of backup function
   */
  function createClaBackupWebApp() {
    try {
      console.log('🌐 [CLA BACKUP] Starting web app backup...');
      
      var result = createClaBackup();
      
      if (result.success) {
        console.log('✅ [CLA BACKUP] Web app backup completed successfully');
      } else {
        console.error('❌ [CLA BACKUP] Web app backup failed:', result.error);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ [CLA BACKUP] Web app backup error:', error);
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
    var sourceSpreadsheetId = '1WHKNLm4C1JhdY417iQvUNxPLUBifdUQNqGereQc6JNg';
    var sourceSpreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
    var sourceSheet = sourceSpreadsheet.getSheetByName('frost resi (Sapp)');
    
    if (!sourceSheet) {
      throw new Error('Source sheet "frost resi (Sapp)" not found');
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
   * Create backup with custom name
   */
  function createClaBackupWithCustomName(customName) {
    try {
      console.log('🏷️ [CLA BACKUP] Creating backup with custom name: ' + customName);
      
          // Source spreadsheet
    var sourceSpreadsheetId = '1WHKNLm4C1JhdY417iQvUNxPLUBifdUQNqGereQc6JNg';
    var sourceSpreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
    var sourceSheet = sourceSpreadsheet.getSheetByName('frost resi (Sapp)');
    
    if (!sourceSheet) {
      throw new Error('Source sheet "frost resi (Sapp)" not found');
    }
    
    // Create new spreadsheet with custom name
    var backupName = customName || ('CLA - FrostRes - ' + formatDateForFilename(new Date()));
    var newSpreadsheet = SpreadsheetApp.create(backupName);
    var newSheet = newSpreadsheet.getSheets()[0];
    newSheet.setName('frost resi (Sapp)');
      
      // Copy all data
      var sourceData = sourceSheet.getDataRange();
      if (sourceData.getNumRows() > 0 && sourceData.getNumColumns() > 0) {
        var values = sourceData.getValues();
        var formatting = sourceData.getBackgrounds();
        
        newSheet.getRange(1, 1, values.length, values[0].length).setValues(values);
        newSheet.getRange(1, 1, formatting.length, formatting[0].length).setBackgrounds(formatting);
      }
      
      // Remove default sheet if it exists
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
      
      console.log('✅ [CLA BACKUP] Custom backup created successfully');
      
          return {
      success: true,
      message: 'CLA - FrostRes backup created successfully with custom name',
      backupUrl: newSpreadsheet.getUrl(),
      backupName: backupName,
      timestamp: new Date().toISOString()
    };
      
    } catch (error) {
      console.error('❌ [CLA BACKUP] Custom backup error:', error);
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
  
  /**
   * Test function for backup functionality
   */
  function testCreateClaBackup() {
    try {
      console.log('🧪 [CLA BACKUP] Running backup test...');
      var result = createClaBackupWithCheck();
      console.log('🧪 [CLA BACKUP] Test result:', result);
      return result;
    } catch (error) {
      console.error('❌ [CLA BACKUP] Test failed:', error);
      return {
        success: false,
        error: error.toString()
      };
    }
  } 