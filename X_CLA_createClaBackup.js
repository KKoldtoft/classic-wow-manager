/**
 * CLA Backup Functions
 * 
 * This script creates backups of the "world buffs" tab from the CLA Google Sheet.
 * Functions are called via the doPost() handler in X_CLA_WorldBuffs.js
 * 
 * Follows the same pattern as RPB backup system.
 */

/**
 * Standard backup function - creates backup of "world buffs" tab
 */
function createClaBackup() {
  try {
    console.log('🗄️ [CLA BACKUP] Starting CLA backup creation...');
    
    // Source spreadsheet (CLA sheet)
    var sourceSpreadsheetId = '1kjhKMlJrUJu_1kyeWoNV4TmKQs5rIZLY0p_pQyjiXFM';
    var sourceSpreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
    var sourceSheet = sourceSpreadsheet.getSheetByName('world buffs');
    
    if (!sourceSheet) {
      throw new Error('Source sheet "world buffs" not found');
    }
    
    // Create new spreadsheet
    var currentDate = new Date();
    var backupName = 'CLA - Buffs - ' + formatDateForFilename(currentDate);
    console.log('📝 [CLA BACKUP] Creating backup with name: ' + backupName);
    
    var newSpreadsheet = SpreadsheetApp.create(backupName);
    
    // Copy the sheet using copyTo() method (same as working RPB backup)
    var copiedSheet = sourceSheet.copyTo(newSpreadsheet);
    copiedSheet.setName('world buffs');
    
    // Remove the default "Sheet1" from new spreadsheet
    var defaultSheet = newSpreadsheet.getSheetByName('Sheet1');
    if (defaultSheet) {
      newSpreadsheet.deleteSheet(defaultSheet);
    }
    
    console.log('📋 [CLA BACKUP] Successfully copied "world buffs" tab using copyTo() method');
    
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
    var sourceSpreadsheetId = '1kjhKMlJrUJu_1kyeWoNV4TmKQs5rIZLY0p_pQyjiXFM';
    var sourceSpreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
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
 * Create backup with custom name
 */
function createClaBackupWithCustomName(customName) {
  try {
    console.log('🏷️ [CLA BACKUP] Creating backup with custom name: ' + customName);
    
    // Source spreadsheet
    var sourceSpreadsheetId = '1kjhKMlJrUJu_1kyeWoNV4TmKQs5rIZLY0p_pQyjiXFM';
    var sourceSpreadsheet = SpreadsheetApp.openById(sourceSpreadsheetId);
    var sourceSheet = sourceSpreadsheet.getSheetByName('world buffs');
    
    if (!sourceSheet) {
      throw new Error('Source sheet "world buffs" not found');
    }
    
    // Create new spreadsheet with custom name
    var backupName = customName || ('CLA - Buffs - ' + formatDateForFilename(new Date()));
    var newSpreadsheet = SpreadsheetApp.create(backupName);
    var newSheet = newSpreadsheet.getSheets()[0];
    newSheet.setName('world buffs');
    
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
      message: 'CLA - Buffs backup created successfully with custom name',
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