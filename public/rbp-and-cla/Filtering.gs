function generateRoleSheets() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var instructionsSheet = ss.getSheetByName("Instructions");
    var baseSheetName = sheet.getName();
  
    var darkMode = false;
    try {
      if (shiftRangeByRows(instructionsSheet, shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^email$").useRegularExpression(true).findNext(), -1), 4).getValue().indexOf("yes") > -1)
        darkMode = true;
    } catch { }
  
    var settings = ss.getSheetByName("settings");
    var noMessagesRange = shiftRangeByColumns(sheet, sheet.createTextFinder("^no completion messages $").useRegularExpression(true).findNext(), 1);
    var noMessages = noMessagesRange.getValue();
    var webHook = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^5.$").useRegularExpression(true).findNext(), 4).getValue();
  
    sheet.getRange(noMessagesRange.getRow() + 1, noMessagesRange.getColumn() - 4).setValue("");
    sheet.getRange(noMessagesRange.getRow() + 2, noMessagesRange.getColumn() - 4).setValue("");
  
    if (baseSheetName.indexOf("All") > -1 && sheet.getRange(4, 63).getValue().toString() == "done") {
      var sheets = ss.getSheets();
      for (var c = sheets.length - 1; c >= 0; c--) {
        var sheetNameSearch = sheets[c].getName();
        if (sheetNameSearch.indexOf("Caster") > -1 || sheetNameSearch.indexOf("Healer") > -1 || sheetNameSearch.indexOf("Physical") > -1 || sheetNameSearch.indexOf("Tank") > -1 || sheetNameSearch.indexOf("Filtered") > -1) {
          ss.deleteSheet(sheets[c]);
        }
      }
  
      var casterSheetname = baseSheetName.replace("All", "Caster");
      var casterSheetnameCasts = casterSheetname + " - casts";
      var healerSheetname = baseSheetName.replace("All", "Healer");
      var healerSheetnameCasts = healerSheetname + " - casts";
      var physicalSheetname = baseSheetName.replace("All", "Physical");
      var physicalSheetnameCasts = physicalSheetname + " - casts";
      var tankSheetname = baseSheetName.replace("All", "Tank");
      var tankSheetnameCasts = tankSheetname + " - casts";
      filteredSheetname = nameSheetSafely(sheet.copyTo(ss), "All Filtered");
      var filteredSheet = ss.getSheetByName(filteredSheetname);
      filter(filteredSheetname, false, settings, ss, false, darkMode);
      filteredCastsSheetname = nameSheetSafely(sheet.copyTo(ss), "All - casts Filtered");
      var filteredCastsSheet = ss.getSheetByName(filteredCastsSheetname);
      filter(filteredCastsSheetname, true, settings, ss, false, darkMode);
      casterSheetname = nameSheetSafely(filteredSheet.copyTo(ss), casterSheetname);
      filter(casterSheetname, false, settings, ss, true, darkMode);
      casterSheetnameCasts = nameSheetSafely(filteredCastsSheet.copyTo(ss), casterSheetnameCasts);
      filter(casterSheetnameCasts, true, settings, ss, true, darkMode);
      healerSheetname = nameSheetSafely(filteredSheet.copyTo(ss), healerSheetname);
      filter(healerSheetname, false, settings, ss, true, darkMode);
      healerSheetnameCasts = nameSheetSafely(filteredCastsSheet.copyTo(ss), healerSheetnameCasts);
      filter(healerSheetnameCasts, true, settings, ss, true, darkMode);
      physicalSheetname = nameSheetSafely(filteredSheet.copyTo(ss), physicalSheetname);
      filter(physicalSheetname, false, settings, ss, true, darkMode);
      physicalSheetnameCasts = nameSheetSafely(filteredCastsSheet.copyTo(ss), physicalSheetnameCasts);
      filter(physicalSheetnameCasts, true, settings, ss, true, darkMode);
      tankSheetname = nameSheetSafely(filteredSheet.copyTo(ss), tankSheetname);
      filter(tankSheetname, false, settings, ss, true, darkMode);
      tankSheetnameCasts = nameSheetSafely(filteredCastsSheet.copyTo(ss), tankSheetnameCasts);
      filter(tankSheetnameCasts, true, settings, ss, true, darkMode);
  
      var title = shiftRangeByColumns(sheet, sheet.createTextFinder("^   title$").useRegularExpression(true).findNext(), 1).getValue();
      var zone = shiftRangeByColumns(sheet, sheet.createTextFinder("^   zone$").useRegularExpression(true).findNext(), 1).getValue();
      var date = shiftRangeByColumns(sheet, sheet.createTextFinder("^   date$").useRegularExpression(true).findNext(), 1).getValue();
      var type = sheet.getRange(4, 65).getValue();
      var newSpreadSheet = SpreadsheetApp.create("RPB for \"" + title + "\" on " + Utilities.formatDate(new Date(date), "GMT+1", "MMMM dd, yyyy") + " in " + zone + " " + type);
  
      var defaultSheetName = "";
      try { defaultSheetName = newSpreadSheet.getSheets()[0].getName(); } catch (e) { }
  
      try { ss.getSheetByName(casterSheetname).copyTo(newSpreadSheet).setName(casterSheetname); } catch (e) { }
      try { ss.getSheetByName(casterSheetnameCasts).copyTo(newSpreadSheet).setName(casterSheetnameCasts); } catch (e) { }
      try { ss.getSheetByName(healerSheetname).copyTo(newSpreadSheet).setName(healerSheetname); } catch (e) { }
      try { ss.getSheetByName(healerSheetnameCasts).copyTo(newSpreadSheet).setName(healerSheetnameCasts); } catch (e) { }
      try { ss.getSheetByName(physicalSheetname).copyTo(newSpreadSheet).setName(physicalSheetname); } catch (e) { }
      try { ss.getSheetByName(physicalSheetnameCasts).copyTo(newSpreadSheet).setName(physicalSheetnameCasts); } catch (e) { }
      try { ss.getSheetByName(tankSheetname).copyTo(newSpreadSheet).setName(tankSheetname); } catch (e) { }
      try { ss.getSheetByName(tankSheetnameCasts).copyTo(newSpreadSheet).setName(tankSheetnameCasts); } catch (e) { }
  
      //Thanks to 0nimpulse#7741 for the help on the Discord integration!
      var sheet1 = "";
      if (defaultSheetName == "")
        sheet1 = "Sheet1";
      else
        sheet1 = defaultSheetName;
      try { newSpreadSheet.deleteSheet(newSpreadSheet.getSheetByName(sheet1)); } catch (e) { }
      try { DriveApp.getFileById(newSpreadSheet.getId()).moveTo(DriveApp.getFolderById(DriveApp.getFileById(ss.getId()).getParents().next().getId())); }
      catch (e) { DriveApp.getFileById(newSpreadSheet.getId()).moveTo(DriveApp.getRootFolder()); }
  
      var url = getPublicURLForSheet(newSpreadSheet);
      if (webHook != null && webHook.toString().length > 0)
        postMessageToDiscord(url, webHook, new Date(date), zone, title, type);
  
      sheets = ss.getSheets();
      for (var c = sheets.length - 1; c >= 0; c--) {
        var sheetNameSearch = sheets[c].getName();
        if (sheetNameSearch.indexOf("Caster") > -1 || sheetNameSearch.indexOf("Healer") > -1 || sheetNameSearch.indexOf("Physical") > -1 || sheetNameSearch.indexOf("Tank") > -1 || sheetNameSearch.indexOf("Filtered") > -1) {
          ss.deleteSheet(sheets[c]);
        }
      }
  
      if (!(noMessages.indexOf("yes") > -1)) {
        sheet.getRange(noMessagesRange.getRow() + 1, noMessagesRange.getColumn() - 4).setValue('Spreadsheet is done. You can open/share it via this link:');
      }
      sheet.getRange(noMessagesRange.getRow() + 2, noMessagesRange.getColumn() - 4).setValue(url);
    } else
      SpreadsheetApp.getUi().alert('Please follow the Instructions. Wait for step 6 to finish!');
  }
  
  function filter(sheetName, isCastsSheet, settings, ss, deleteColumnsAsWell, darkMode) {
    var firstNameRow = 7;
    var firstNameColumn = 3;
  
    var sheet = ss.getSheetByName(sheetName);
  
    if (!deleteColumnsAsWell) {
      var lineToSeparate = sheet.getRange(4, 64).getValue();
      if (isCastsSheet) {
        sheet.deleteRows(lineToSeparate, sheet.getMaxRows() - lineToSeparate);
      } else {
        sheet.deleteRows(8, lineToSeparate - 8);
      }
    }
  
    var playerHeaderRange = settings.createTextFinder("^player role$").useRegularExpression(true).findNext();
    var playersWithRoles = settings.getRange(playerHeaderRange.getRow(), playerHeaderRange.getColumn(), 1000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
    var dontHideRowsHeaderRange = settings.createTextFinder("^not hidden$").useRegularExpression(true).findNext();
    var dontHideRows = settings.getRange(dontHideRowsHeaderRange.getRow(), dontHideRowsHeaderRange.getColumn(), 1000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  
    var role = "";
    if (sheetName.indexOf("Caster") > -1)
      role = "Caster";
    else if (sheetName.indexOf("Healer") > -1)
      role = "Healer";
    else if (sheetName.indexOf("Physical") > -1)
      role = "Physical";
    else if (sheetName.indexOf("Tank") > -1)
      role = "Tank";
    else
      role = "All";
  
    var sheetColumns = sheet.getMaxColumns();
  
    if (!deleteColumnsAsWell) {
      var drawings = sheet.getDrawings();
      drawings.forEach(function (drawingg, drawinggCount) {
        if (drawingg.getWidth() != 1) {
          drawingg.setWidth(1).setHeight(1);
        }
      })
    }
    var classHeaders = [];
    classHeaders.push("Druids"); classHeaders.push("Hunters"); classHeaders.push("Mages"); classHeaders.push("Priests"); classHeaders.push("Paladins"); classHeaders.push("Rogues"); classHeaders.push("Shamans"); classHeaders.push("Warlocks"); classHeaders.push("Warriors");
  
    var rolesAndNames = sheet.getRange(firstNameRow - 2, firstNameColumn, 3, sheetColumns - firstNameColumn + 1).getValues();
    var headers1 = rolesAndNames[0];
    var headers2 = rolesAndNames[1];
    var names = rolesAndNames[2];
    var numberOfColumnsHidden = 0;
    var atLeastOnePlayerForThisRole = false;
    if (role == "All")
      atLeastOnePlayerForThisRole = true;
    else {
      for (o = headers1.length - 1; o >= 0; o--) {
        if ((names[o] != "") && ((headers1[o] != "" && headers1[o].indexOf(role) > -1) || (headers2[o] != "" && headers2[o].indexOf(role) > -1))) {
          atLeastOnePlayerForThisRole = true;
          break;
        }
      }
      if (!atLeastOnePlayerForThisRole) {
        ss.deleteSheet(sheet);
        return;
      }
    }
    for (o = headers1.length - 1; o >= 0; o--) {
      var columnWidth = sheet.getColumnWidth(firstNameColumn + o);
      if (columnWidth > 150 && o > 2) {
        if (isCastsSheet)
          sheet.getRange(firstNameRow, firstNameColumn + o, sheet.getMaxRows(), 1).setBorder(null, true, null, null, null, null, "black", SpreadsheetApp.BorderStyle.SOLID);
      }
      if (((role != "All" && !(headers1[o].indexOf(role) > -1) && headers1[o].toString() != "") && (!(headers2[o].indexOf(role) > -1) && headers2[o].toString() != "")) || (!isCastsSheet && columnWidth >= 150) || sheet.isColumnHiddenByUser(firstNameColumn + o) || names[o] == "") {
        numberOfColumnsHidden += 1;
      } else {
        if (numberOfColumnsHidden > 0) {
          sheet.deleteColumns(o + firstNameColumn + 1, numberOfColumnsHidden);
          numberOfColumnsHidden = 0;
        }
      }
      if (headers1[o].toString() != "" && headers2[o].toString() != "")
        AddOrModifyPlayerEntry(playersWithRoles, names[o] + " " + headers1[o] + " " + headers2[o]);
    }
    if (numberOfColumnsHidden > 0) {
      try {
        sheet.deleteColumns(o + firstNameColumn + 1, numberOfColumnsHidden);
        numberOfColumnsHidden = 0;
      } catch (e) {
        ss.deleteSheet(sheet);
        return;
      }
    }
  
    if (isCastsSheet) {
      var rolesAndNamesNew = sheet.getRange(firstNameRow - 2, firstNameColumn, 3, sheet.getMaxColumns() - firstNameColumn + 1).getValues();
      var namesNew = rolesAndNamesNew[2];
      for (p = namesNew.length - 1; p >= 0; p--) {
        if ((p < namesNew.length - 1 && classHeaders.indexOf(namesNew[p]) > -1 && classHeaders.indexOf(namesNew[p + 1]) > -1) || (p == namesNew.length - 1 && classHeaders.indexOf(namesNew[p]) > -1)) {
          numberOfColumnsHidden += 1;
        } else {
          if (numberOfColumnsHidden > 0) {
            sheet.deleteColumns(p + firstNameColumn + 1, numberOfColumnsHidden);
            numberOfColumnsHidden = 0;
          }
        }
      }
      if (numberOfColumnsHidden > 0) {
        try {
          sheet.deleteColumns(p + firstNameColumn + 1, numberOfColumnsHidden);
        } catch (e) {
          ss.deleteSheet(sheet);
          return;
        }
      }
    }
    settings.getRange(playerHeaderRange.getRow(), playerHeaderRange.getColumn(), playersWithRoles.length, 1).setValues(convertMultiRowSingleColumnArraytoMultidimensionalArray(playersWithRoles));
  
    if (!isCastsSheet) {
      var numberOfRowsHidden = 0;
      var hiddenRemoved = 0;
      var sheetRows = sheet.getMaxRows();
      var values = sheet.getRange(firstNameRow + 2, firstNameColumn - 1, sheetRows - firstNameRow - 2, sheetColumns - firstNameColumn + 1).getValues();
      var rowHeadersWeight = sheet.getRange(firstNameRow + 2, firstNameColumn - 1, sheetRows - firstNameRow - 2, 1).getFontWeights();
      var overwrittens = sheet.getRange(firstNameRow + 2, 1, sheetRows - firstNameRow - 2, 1).getValues();
      var interruptedMergeLineBegins = 0;
      var damageTakenStartRow = sheet.createTextFinder("taken by tracked abilities").useRegularExpression(true).findNext().getRow() - firstNameRow - 1;
      var damageTakenTotalRow = sheet.createTextFinder("Total avoidable damage taken").useRegularExpression(true).findNext().getRow() - firstNameRow - 1;
  
      for (var k = values.length - 1; k >= 0; k--) {
        if (values[k][0] == "names and sources of interrupted spells")
          interruptedMergeLineBegins = k;
      }
      for (var k = values.length - 1; k >= 0; k--) {
        var rowIsFilled = false;
        var hideOverwritten = false;
        if (overwrittens[k][0] == "yes")
          hideOverwritten = false;
        else if (overwrittens[k][0] == "no")
          hideOverwritten = true;
        var trimmedHeaderValue = values[k][0];
        if (trimmedHeaderValue.indexOf(" (rank") < 0)
          trimmedHeaderValue = trimmedHeaderValue.split(" (")[0].split(" [")[0];
        if (hideOverwritten) {
          if (!(dontHideRows.indexOf(trimmedHeaderValue) > -1))
            dontHideRows.push(trimmedHeaderValue);
        } else {
          for (t = 0, u = dontHideRows.length; t < u; t++) {
            if (dontHideRows[t] == trimmedHeaderValue) {
              dontHideRows.splice(t, 1);
              hiddenRemoved += 1;
            }
          }
        }
        if ((role == "Caster" || role == "Healer") && values[k][0].indexOf("Shout uptime on you") > -1) {
          rowIsFilled = false;
        } else if (rowHeadersWeight[k][0] != "bold" && !hideOverwritten && !(k >= interruptedMergeLineBegins && k <= (interruptedMergeLineBegins + 13))) {
          for (m = 1, n = values[k].length; m < n; m++) {
            if (values[k][m].toString() != "") {
              rowIsFilled = true;
              break;
            }
          }
          if (!rowIsFilled && trimmedHeaderValue == "" && !(k > damageTakenStartRow && k < damageTakenTotalRow - 1)) {
            if (k > 0) {
              for (w = 0, x = values[k - 1].length; w < x; w++) {
                if (values[k - 1][w].toString() != "") {
                  rowIsFilled = true;
                  break;
                }
              }
            }
            else
              rowIsFilled = true;
          }
        } else
          rowIsFilled = true;
        if (!rowIsFilled)
          numberOfRowsHidden += 1;
        else {
          if (numberOfRowsHidden > 0)
            sheet.deleteRows(k + firstNameRow + 3, numberOfRowsHidden);
          numberOfRowsHidden = 0;
        }
      }
      if (numberOfRowsHidden > 0)
        sheet.deleteRows(k + firstNameRow + 3, numberOfRowsHidden);
    } else {
      var numberOfRowsHidden = 0;
      var sheetRows = sheet.getMaxRows();
      var values = sheet.getRange(firstNameRow + 2, firstNameColumn - 1, sheetRows - firstNameRow - 2, sheetColumns - firstNameColumn + 2).getValues();
      for (var k = values.length - 1; k >= 0; k--) {
        var rowIsFilled = false;
        for (m = 0, n = values[k].length; m < n; m++) {
          if (values[k][m].toString().length > 0) {
            rowIsFilled = true;
            break;
          }
          if (!rowIsFilled) {
            if (k > 0) {
              for (w = 0, x = values[k - 1].length; w < x; w++) {
                if (values[k - 1][w].toString().length > 0) {
                  rowIsFilled = true;
                  break;
                }
              }
            }
            else
              rowIsFilled = true;
          }
        }
        if (!rowIsFilled)
          numberOfRowsHidden += 1;
        else {
          if (numberOfRowsHidden > 0)
            sheet.deleteRows(k + firstNameRow + 3, numberOfRowsHidden);
          numberOfRowsHidden = 0;
        }
      }
    }
  
    if (deleteColumnsAsWell) {
      sheet.deleteColumns(1, 1);
      sheet.deleteRows(1, 6);
    }
  
    for (var q = 0; q < hiddenRemoved; q++) {
      dontHideRows.push("");
    }
    settings.getRange(dontHideRowsHeaderRange.getRow(), dontHideRowsHeaderRange.getColumn(), dontHideRows.length, 1).setValues(convertMultiRowSingleColumnArraytoMultidimensionalArray(dontHideRows));
  
    if (!isCastsSheet && deleteColumnsAsWell) {
      var namesNewBackColours = sheet.getRange(1, 2, 1, sheet.getMaxColumns() - 1).getBackgrounds()[0];
      var lastColour;
      for (s = namesNewBackColours.length - 1; s >= 0; s--) {
        if (lastColour != namesNewBackColours[s]) {
          sheet.getRange(1, 3 + s, sheet.getMaxRows(), 1).setBorder(null, true, null, null, null, null, "black", SpreadsheetApp.BorderStyle.SOLID);
        }
        lastColour = namesNewBackColours[s];
      }
    }
    if (darkMode)
      sheet.getRange(1, 2, sheet.getMaxRows(), 1).setBorder(null, true, null, null, null, null, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    else
      sheet.getRange(1, 2, sheet.getMaxRows(), 1).setBorder(null, true, null, null, null, null, "white", SpreadsheetApp.BorderStyle.SOLID);
  }
  
  function AddOrModifyPlayerEntry(array, value) {
    var done = false;
    for (i = 0, j = array.length; i < j; i++) {
      if (array[i].split(" ")[0] == value.split(" ")[0]) {
        if (array[i].split(" ")[1] != value.split(" ")[1] || array[i].split(" ")[2] != value.split(" ")[2]) {
          array.splice(i, 1, value);
        }
        done = true;
      }
    }
    if (!done)
      array.push(value);
  }
  
  function convertMultiRowSingleColumnArraytoMultidimensionalArray(array) {
    var returnArray = [];
    for (i = 0, j = array.length; i < j; i++) {
      addSingleEntryToMultiDimArray(returnArray, array[i]);
    }
    return returnArray;
  }
  
  function getPublicURLForSheet(sheet) {
    var file = DriveApp.getFileById(sheet.getId());
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  }
  
  function postMessageToDiscord(url, webHook, date, zone, title, type) {
    if (type == "")
      type = "trash & bosses";
    else
      type = type.replace(")", "").replace(" (", "");
    if (type == "no wipes")
      type = "trash & bosses no wipes";
    var payload = JSON.stringify({
      "username": "Role Performance Breakdown",
      "avatar_url": "https://i.imgur.com/gLRG4ci.png",
      "embeds": [{
        "title": "\"" + title + "\"",
        "url": url,
        "color": 10783477,
        "fields": [
          {
            "name": "Zone",
            "value": zone,
            "inline": true
          },
          {
            "name": "Type",
            "value": type,
            "inline": true
          },
          {
            "name": "Date & Time",
            "value": Utilities.formatDate(date, "GMT+1", "MMMM dd, yyyy  HH:mm:ss Z"),
            "inline": true
          }
        ],
        "footer": {
          "text": "Spreadsheets by Shariva#8127 - https://www.patreon.com/rpbcla",
          "icon_url": "https://i.imgur.com/xopArYu.png"
        }
      }]
    });
  
    var params = {
      headers: {
        'Content-Type': 'application/json'
      },
      method: "POST",
      payload: payload,
      muteHttpExceptions: false
    };
  
    UrlFetchApp.fetch(webHook, params);
  }