/**
 * Frost Resistance Google Apps Script
 * 
 * This script populates frost resistance data in the "frost resi (Sapp)" tab
 * and provides status monitoring through the Instructions tab F11 cell.
 * 
 * Deploy this as a web app with permissions for anyone to execute.
 */

// Configuration
const SPREADSHEET_ID = '1WHKNLm4C1JhdY417iQvUNxPLUBifdUQNqGereQc6JNg';
const FROST_RES_TAB_NAME = 'frost resi (Sapp)';
const INSTRUCTIONS_TAB_NAME = 'Instructions';
const STATUS_CELL = 'F11'; // Cell for status monitoring

/**
 * Main doPost function - handles incoming requests for both Frost Res and Backup actions
 */
function doPost(e) {
  try {
    console.log('🧊 [FROST RES] Received request');
    
    let requestData;
    try {
      requestData = JSON.parse(e.postData.contents);
    } catch (parseError) {
      console.error('❌ [FROST RES] Failed to parse request data:', parseError);
      return ContentService
        .createTextOutput(JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body'
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const { action, logUrl } = requestData;
    console.log(`🧊 [FROST RES] Action: ${action}`, logUrl ? `for log: ${logUrl}` : '');

    let result;
    switch (action) {
      // Frost Resistance actions
      case 'populateFrostRes':
        result = handlePopulateFrostRes(logUrl);
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
    console.error('❌ [FROST RES] Unexpected error:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle clearing the status cell
 */
function handleClearStatus() {
  try {
    console.log('🧹 [FROST RES] Clearing status cell...');
    
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const instructionsSheet = spreadsheet.getSheetByName(INSTRUCTIONS_TAB_NAME);
    
    if (!instructionsSheet) {
      throw new Error(`Instructions sheet "${INSTRUCTIONS_TAB_NAME}" not found`);
    }

    // Get previous status
    const previousStatus = instructionsSheet.getRange(STATUS_CELL).getValue();
    
    // Clear the status cell
    instructionsSheet.getRange(STATUS_CELL).setValue('');
    
    console.log('✅ [FROST RES] Status cell cleared');
    
    return {
      success: true,
      previousStatus: previousStatus,
      message: 'Status cleared successfully'
    };
    
  } catch (error) {
    console.error('❌ [FROST RES] Error clearing status:', error);
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
    
    console.log(`📊 [FROST RES] Current status: ${status}`);
    
    return {
      success: true,
      status: status || 'PENDING'
    };
    
  } catch (error) {
    console.error('❌ [FROST RES] Error checking status:', error);
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Handle populating frost resistance data
 */
function handlePopulateFrostRes(logUrl) {
  try {
    console.log('🚀 [FROST RES] Starting frost resistance population for log:', logUrl);
    
    if (!logUrl) {
      throw new Error('Log URL is required for frost resistance analysis');
    }
    
    // Set status to PROCESSING
    setStatus('PROCESSING');
    
    // Get the spreadsheet and frost res sheet
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const frostResSheet = spreadsheet.getSheetByName(FROST_RES_TAB_NAME);
    
    if (!frostResSheet) {
      throw new Error(`Frost Resistance sheet "${FROST_RES_TAB_NAME}" not found`);
    }

    // Call the actual populate function with log URL
    populateFrostResistance(frostResSheet, logUrl);
    
    // Set status to COMPLETE
    setStatus('COMPLETE');
    
    console.log('✅ [FROST RES] Frost resistance population completed successfully');
    
    return {
      success: true,
      message: 'Frost resistance populated successfully'
    };
    
  } catch (error) {
    console.error('❌ [FROST RES] Error populating frost resistance:', error);
    
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
      console.log(`📝 [FROST RES] Status set to: ${status}`);
    }
  } catch (error) {
    console.error('❌ [FROST RES] Error setting status:', error);
  }
}

/**
 * Main function to populate frost resistance data
 * Modified from original to work with remote triggering
 */
function populateFrostResistance(frostResSheet, logUrl) {
  try {
    console.log('🧊 [FROST RES] Populating frost resistance data for log:', logUrl);
    
    var firstPlayerNameRow = 5;
    var firstPlayerNameColumn = 2;

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = frostResSheet; // Use the passed sheet parameter instead of getActiveSheet()
    var instructionsSheet = ss.getSheetByName("Instructions");

    // Write the log URL to the Instructions sheet E11 for reference FIRST
    try {
      instructionsSheet.getRange('E11').setValue(logUrl);
      console.log('📝 [FROST RES] Log URL written to E11:', logUrl);
    } catch (error) {
      console.log('⚠️ [FROST RES] Could not write log URL to E11:', error);
      throw new Error('Failed to write log URL to sheet: ' + error.toString());
    }

    instructionsSheet.getRange(27, 2).setValue("");
    instructionsSheet.getRange(28, 2).setValue("");

    var darkMode = false;
    try {
      if (shiftRangeByRows(instructionsSheet, shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^export fights$").useRegularExpression(true).findNext(), 1), 2).getValue().indexOf("yes") > -1)
        darkMode = true;
    } catch { }

    sheet.getRange(firstPlayerNameRow, firstPlayerNameColumn, 96, 19).clearContent();
    sheet.getRange(4, 2, 1, 1).clearContent();
    if (darkMode) {
      sheet.getRange(1, 1, 100, 20).setBackground("#d9d9d9");
    } else
      sheet.getRange(1, 1, 100, 20).setBackground("white");

    var bossName = shiftRangeByColumns(sheet, sheet.createTextFinder("^select boss$").useRegularExpression(true).findNext(), 1).getValue();
    var bossId = "1119";
    if (bossName != null && bossName.length > 0 && bossName.indexOf("Kel'Thuzad") > -1)
      bossId = "1114";
    var baseUrl = "https://vanilla.warcraftlogs.com:443/v1/";
    
    // Get API key from Instructions sheet - try multiple methods
    var api_key = null;
    
    // Method 1: Try E9 directly (user mentioned it's there for world buffs)
    try {
      api_key = instructionsSheet.getRange('E9').getValue();
      console.log('🔑 [FROST RES] Trying E9 for API key:', api_key ? 'Found' : 'Empty');
    } catch (error) {
      console.log('⚠️ [FROST RES] Could not read E9:', error);
    }
    
    // Method 2: Try the original method (looking for "2.")
    if (!api_key) {
      try {
        var apiKeyCell = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^2.$").useRegularExpression(true).findNext(), 4);
        if (apiKeyCell) {
          api_key = apiKeyCell.getValue();
          console.log('🔑 [FROST RES] Found API key via "2." method:', api_key ? 'Found' : 'Empty');
        }
      } catch (error) {
        console.log('⚠️ [FROST RES] Could not find API key via "2." method:', error);
      }
    }
    
    if (!api_key) {
      throw new Error('WarcraftLogs API key not found. Tried E9 and looking for "2." in Instructions sheet. Please ensure your API key is in cell E9.');
    }
    
    api_key = api_key.replace(/\s/g, "");
    console.log('🔑 [FROST RES] API key found, length:', api_key.length);
    
    // Use the passed logUrl instead of reading from sheet
    var reportPathOrId = logUrl;
    
    var onlyFightNr = shiftRangeByColumns(sheet, sheet.createTextFinder("^boss fight id").useRegularExpression(true).findNext(), 1).getValue();
    var includeReportTitleInSheetNames = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^4.$").useRegularExpression(true).findNext(), 4).getValue();
    var information = addRowsToRange(sheet, sheet.createTextFinder("^title $").useRegularExpression(true).findNext(), 2);
    shiftRangeByColumns(sheet, information, 1).clearContent();
    var confFrostResistanceConfig = ss.getSheetByName("frost resistance config");

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
    var apiKeyString = "?api_key=" + api_key;

    var allPlayers = UrlFetchApp.fetch(baseUrl + "report/tables/casts/" + logId + apiKeyString + "&start=0&end=999999999999");
    var allPlayersData = JSON.parse(allPlayers);

    var urlAllFights = baseUrl + "report/fights/" + logId + apiKeyString;
    var allFightsData = JSON.parse(UrlFetchApp.fetch(urlAllFights));
    var baseSheetName = "frost resi (Sapp)";
    if (bossName != null && bossName.length > 0 && bossName.indexOf("Kel'Thuzad") > -1)
      baseSheetName = "frost resi (KT)";
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

    var frostResiInfoIdsRaw = confFrostResistanceConfig.getRange(1, 1, 1000, 1).getValues();
    var frostResiInfoIds = frostResiInfoIdsRaw.reduce(function (ar, e) {
      if (e[0]) ar.push(e[0])
      return ar;
    }, []);

    var frostResiInfoFRRaw = confFrostResistanceConfig.getRange(1, 2, 1000, 1).getValues();
    var frostResiInfoFRs = frostResiInfoFRRaw.reduce(function (ar, e) {
      if (e[0]) ar.push(e[0])
      return ar;
    }, []);

    var fightDataArr = [];
    var fightDataIndexArr = [];
    var playersDone = 0;
    var fightIDToEvaluate = "";
    var longestFight = "";
    var longestFightLength = 0;
    allFightsData.fights.forEach(function (fight, fightRawCount) {
      if (((onlyFightNr == null || onlyFightNr.toString().length == 0) && fight.boss != null && (Number(fight.boss).toString() == bossId || Number(fight.boss).toString() == "5" + bossId)) || (onlyFightNr != null && onlyFightNr.toString().length > 0 && fight.id.toString() == onlyFightNr.toString())) {
        if (Number(fight.fightPercentage) == 100 || fight.kill == true)
          fightIDToEvaluate = fight.id.toString();
        else if ((fight.end_time - fight.start_time) > longestFightLength) {
          longestFightLength = fight.end_time - fight.start_time;
          longestFight = fight.id.toString();
        }
      }
    })
    if (fightIDToEvaluate == "" && longestFight != "")
      fightIDToEvaluate = longestFight;
    var rangeBoss = sheet.getRange(firstPlayerNameRow - 1, firstPlayerNameColumn);
    if (fightIDToEvaluate == "")
      rangeBoss.setValue("no fight found for the selected boss");
    const allPlayersByNameAsc = sortByProperty(sortByProperty(allPlayersData.entries, "name"), "type");
    allPlayersByNameAsc.forEach(function (playerByNameAsc, playerCountByNameAsc) {
      if ((playerByNameAsc.type == "Druid" || playerByNameAsc.type == "Hunter" || playerByNameAsc.type == "Mage" || playerByNameAsc.type == "Priest" || playerByNameAsc.type == "Paladin" || playerByNameAsc.type == "Rogue" || playerByNameAsc.type == "Shaman" || playerByNameAsc.type == "Warlock" || playerByNameAsc.type == "Warrior") && playerByNameAsc.total > 20) {
        var fightCount = 0;
        allFightsData.fights.forEach(function (fight, fightRawCount) {
          if (fight.id.toString() == fightIDToEvaluate) {
            if (fight.kill == true)
              rangeBoss.setValue(fight.name + " (kill in " + Math.round((fight.end_time - fight.start_time) / 1000) + "s)");
            else
              rangeBoss.setValue(fight.name + " (" + Math.round(Number(fight.fightPercentage) / 100) + "% wipe after " + Math.round((fight.end_time - fight.start_time) / 1000) + "s)");
            rangeBoss.setFontWeight("bold").setHorizontalAlignment("center");

            var fightData = searchEntryForId(fightDataIndexArr, fightDataArr, fight.id.toString());
            if (fightData == "") {
              var urlSummaryPerFight = baseUrl + "report/tables/casts/" + logId + apiKeyString + "&start=" + fight.start_time + "&end=" + fight.end_time;
              fightData = JSON.parse(UrlFetchApp.fetch(urlSummaryPerFight));
              fightDataArr.push(fightData);
              fightDataIndexArr.push(fight.id.toString());
            }
            fightData.entries.forEach(function (player, playerCount) {
              if (playerByNameAsc.name == player.name) {
                var frostResistanceTotal = 0;
                if (player.gear != null && player.gear.length > 0) {
                  player.gear.forEach(function (item, itemCount) {
                    if (item.id != null && item.id.toString().length > 0 && item.id.toString() != "0" && item.slot != 3 && item.slot != 18) {
                      var gearFrostResi = searchEntryForId(frostResiInfoIds, frostResiInfoFRs, item.id.toString());
                      var enchantFrostResi = 0;
                      if (item.permanentEnchant != null && item.permanentEnchant.toString().length > 1) {
                        if (item.permanentEnchant.toString() == "926") {
                          enchantFrostResi = 8;
                        } else if (item.permanentEnchant.toString() == "1888") {
                          enchantFrostResi = 5;
                        } else if (item.permanentEnchant.toString() == "2682") {
                          enchantFrostResi = 10;
                        } else if (item.permanentEnchant.toString() == "2484") {
                          enchantFrostResi = 5;
                        } else if (item.permanentEnchant.toString() == "2488") {
                          enchantFrostResi = 5;
                        }
                        frostResistanceTotal += enchantFrostResi;
                      }
                      var itemPos = 0;
                      if (item.slot == 0 || item.slot == 1 || item.slot == 2 || item.slot == 4 || item.slot == 10 || item.slot == 11 || item.slot == 12 || item.slot == 13)
                        itemPos = item.slot;
                      else if (item.slot == 5)
                        itemPos = 7;
                      else if (item.slot == 6)
                        itemPos = 8;
                      else if (item.slot == 7)
                        itemPos = 9;
                      else if (item.slot == 8)
                        itemPos = 5;
                      else if (item.slot == 9)
                        itemPos = 6;
                      else if (item.slot == 14)
                        itemPos = 3;
                      else if (item.slot == 15)
                        itemPos = 14;
                      else if (item.slot == 16)
                        itemPos = 15;
                      else if (item.slot == 17)
                        itemPos = 16;
                      var rangeTarget = sheet.getRange(playersDone + firstPlayerNameRow, firstPlayerNameColumn + 2 + fightCount + itemPos);
                      if (gearFrostResi != "") {
                        frostResistanceTotal += Number(gearFrostResi);
                        confFrostResistanceConfig.createTextFinder(item.id.toString()).useRegularExpression(true).findNext().copyTo(rangeTarget, { formatOnly: true });
                        if (enchantFrostResi > 0)
                          rangeTarget.setValue(item.name + " +" + enchantFrostResi + " FR");
                        else
                          rangeTarget.setValue(item.name);
                      } else if (enchantFrostResi > 0) {
                        rangeTarget.setValue(item.name + " +" + enchantFrostResi + " FR");
                      }
                    }
                  })
                }
                if (fightCount == 0) {
                  var range = sheet.getRange(playersDone + firstPlayerNameRow, firstPlayerNameColumn);
                  range.setValue(player.name);
                  range.setBackground(getColourForPlayerClass(player.type));
                  playersDone++;
                }
                sheet.getRange(playersDone + firstPlayerNameRow - 1, firstPlayerNameColumn + 1 + fightCount).setValue(frostResistanceTotal);
                fightCount++;
              }
            })
          }
        })
      }
    })
    
    console.log('✅ [FROST RES] Frost resistance data populated successfully');
    
  } catch (error) {
    console.error('❌ [FROST RES] Error in populateFrostResistance function:', error);
    throw error; // Re-throw to be caught by the handler
  }
}

/**
 * Test function for local development
 */
function testPopulateFrostRes() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const frostResSheet = spreadsheet.getSheetByName(FROST_RES_TAB_NAME);
    
    if (!frostResSheet) {
      throw new Error(`Frost Resistance sheet "${FROST_RES_TAB_NAME}" not found`);
    }
    
    // For testing, you can add a test log URL here
    const testLogUrl = "3RHMnKDFV2ZPaGbX";
    populateFrostResistance(frostResSheet, testLogUrl);
    console.log('✅ Test completed successfully');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// ==============================================
// HELPER FUNCTIONS (from original script)
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

function searchEntryForId(searchIds, searchData, targetId) {
  for (var i = 0; i < searchIds.length; i++) {
    if (searchIds[i].toString() === targetId.toString()) {
      return searchData[i];
    }
  }
  return "";
} 