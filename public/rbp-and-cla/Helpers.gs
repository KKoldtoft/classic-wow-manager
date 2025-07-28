function nameSheetSafely(sheet, baseSheetName) {
  try {
    sheet.setName(baseSheetName);
  } catch (err) {
    try {
      baseSheetName += "_new";
      sheet.setName(baseSheetName);
    } catch (err2) {
      try {
        baseSheetName += "_new";
        sheet.setName(baseSheetName);
      } catch (err3) {
        baseSheetName += "_new";
        sheet.setName(baseSheetName);
      }
    }
  }
  return baseSheetName;
}

function checkIfArrayContainsEntry(array, entry) {
  var contains = false;
  if (array != null && array.length > 0) {
    for (var i = 0, j = array.length; i < j; i++) {
      if (array[i].toUpperCase() == entry.toUpperCase()) {
        contains = true;
        break;
      }
    }
  }
  return contains;
}

function cleanSheet(sheet, information, darkMode) {
  sheet.showColumns(1, sheet.getMaxColumns());
  shiftRangeByColumns(sheet, information, 1).clearContent();
  if (darkMode) {
    sheet.getRange(7, 2, sheet.getMaxRows() - 6, sheet.getMaxColumns() - 1).breakApart().clearContent().setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID).setHorizontalAlignment("left").setBackground("#d9d9d9").setFontSize(10).setFontColor("black").setFontWeight("normal").setFontStyle("normal").protect().setWarningOnly(true).setDescription("removed after Start");
    sheet.getRange(1, 1, 7, 1).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(8, 1, sheet.getMaxRows() - 7, 1).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(1, 2, 6, 1).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(1, 8, 1, 1).setFontColor("#d9d9d9");
    sheet.getRange(4, 64, 1, 1).setFontColor("#d9d9d9");
    sheet.getRange(1, 5, 4, sheet.getMaxColumns() - 4).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(5, 3, 2, sheet.getMaxColumns() - 2).breakApart().clearContent().setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID).setHorizontalAlignment("left").setBackground("#d9d9d9").setFontSize(10).setFontColor("black").setFontWeight("normal").setFontStyle("normal").protect().setWarningOnly(true).setDescription("removed after Start");
  } else {
    sheet.getRange(7, 2, sheet.getMaxRows() - 6, sheet.getMaxColumns() - 1).breakApart().clearContent().setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID).setHorizontalAlignment("left").setBackground("white").setFontSize(10).setFontColor("black").setFontWeight("normal").setFontStyle("normal").protect().setWarningOnly(true).setDescription("removed after Start");
    sheet.getRange(1, 1, 7, 1).setBackground("white").setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(8, 1, sheet.getMaxRows() - 7, 1).setBackground("white").setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(1, 2, 6, 1).setBackground("white").setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(1, 8, 1, 1).setFontColor("white");
    sheet.getRange(4, 64, 1, 1).setFontColor("white");
    sheet.getRange(1, 5, 4, sheet.getMaxColumns() - 4).setBackground("white").setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID);
    sheet.getRange(5, 3, 2, sheet.getMaxColumns() - 2).breakApart().clearContent().setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID).setHorizontalAlignment("left").setBackground("white").setFontSize(10).setFontColor("black").setFontWeight("normal").setFontStyle("normal").protect().setWarningOnly(true).setDescription("removed after Start");
  }
  sheet.getRange(5, 3, 2, sheet.getMaxColumns() - 2).setFontSize(9).setHorizontalAlignment("center");
}

function copyConfigSheet(sheetName, rnd, sourceSpreadsheet, targetSpreadsheet) {
  var confSheetName = "config" + sheetName;
  var confSheet = sourceSpreadsheet.getSheetByName(confSheetName);
  return confSheet.copyTo(targetSpreadsheet).hideSheet().setName(confSheetName + rnd);
}

function getAmountForDebuffSpellId(debuffIdString, debuffsAppliedTotal, totalTimeElapsed) {
  var totalAmount = 0;
  debuffsAppliedTotal.auras.forEach(function (debuffTotal, debuffTotalCount) {
    if (debuffTotal.guid.toString() == debuffIdString) {
      totalAmount = debuffTotal.totalUses;
    }
  })
  return totalAmount;
}

function getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedTotal, totalTimeElapsed) {
  var totalUptime = 0;
  debuffsAppliedTotal.auras.forEach(function (debuffTotal, debuffTotalCount) {
    if (debuffTotal.guid.toString() == debuffIdString) {
      totalUptime = Math.round(debuffTotal.totalUptime * 100 / totalTimeElapsed);
    }
  })
  return totalUptime;
}

function getUsesForDebuffSpellId(debuffIdString, debuffsAppliedTotal, totalTimeElapsed) {
  var totalUses = 0;
  debuffsAppliedTotal.auras.forEach(function (debuffTotal, debuffTotalCount) {
    if (debuffTotal.guid.toString() == debuffIdString) {
      totalUses = debuffTotal.totalUses;
    }
  })
  return totalUses;
}

function copyRowStyles(conf, sheet, confRange, castsCount, startRow, startColumn, maxSupportedPlayers, firstColumnIsDefault, firstColumnAlign, darkMode) {
  var confCastsRange = addRowsToRange(conf, shiftRangeByRows(conf, confRange, 1), castsCount - 1);
  var tarCastsRange = sheet.getRange(startRow, startColumn, castsCount, 1);
  copyRangeStyle(confCastsRange, tarCastsRange, null, firstColumnAlign, null);
  if (firstColumnIsDefault) {
    if (darkMode)
      tarCastsRange.setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    else
      tarCastsRange.setBackground("white").setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID);
  }
  copyRangeStyle(confCastsRange, addColumnsToRange(sheet, shiftRangeByColumns(sheet, tarCastsRange, 1), maxSupportedPlayers - 1), null, "center", null);
}

function copyRangeStyle(rangeSource, rangeTarget, bold, alignment, fontSize) {
  rangeSource.copyTo(rangeTarget, { formatOnly: true });
  if (bold != null && bold)
    rangeTarget.setFontWeight("bold");
  else
    rangeTarget.setFontWeight("normal");
  if (alignment != null)
    rangeTarget.setHorizontalAlignment(alignment);
  if (fontSize != null)
    rangeTarget.setFontSize(fontSize);
}

function addRowsToRange(sheet, range, rowsToAdd) {
  return sheet.getRange(range.getRow(), range.getColumn(), range.getNumRows() + rowsToAdd, range.getNumColumns());
}

function addColumnsToRange(sheet, range, columnsToAdd) {
  return sheet.getRange(range.getRow(), range.getColumn(), range.getNumRows(), range.getNumColumns() + columnsToAdd);
}

function shiftRangeByRows(sheet, range, rowsToShift) {
  return sheet.getRange(range.getRow() + rowsToShift, range.getColumn(), range.getNumRows(), range.getNumColumns());
}

function shiftRangeByColumns(sheet, range, columnsToShift) {
  return sheet.getRange(range.getRow(), range.getColumn() + columnsToShift, range.getNumRows(), range.getNumColumns());
}

function addSingleEntryToMultiDimArray(multiArray, value) {
  multiArray[multiArray.length] = [];
  multiArray[multiArray.length - 1].push(value);
}

function rangesIntersect(R1, R2) {
  return (R1.getLastRow() >= R2.getRow()) && (R2.getLastRow() >= R1.getRow()) && (R1.getLastColumn() >= R2.getColumn()) && (R2.getLastColumn() >= R1.getColumn());
}

function getOutputRange(sheet, confRange, rowCount, columnCount) {
  var outputRangeBeginCell = sheet.getRange(confRange.getValue().split("[")[1].split("]")[0], 2);
  return sheet.getRange(outputRangeBeginCell.getRow(), outputRangeBeginCell.getColumn(), rowCount, columnCount);
}

function getHeaderFromConfig(confRange) {
  var headerConfText = confRange.getValue();
  return headerConfText.indexOf("{") > -1 ? headerConfText.split("{")[1].split("}")[0] : "";
}

function columnToLetter(column) {
  var temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function isRangeShowingPlayerNames(confRange) {
  if (confRange != null) {
    var headerConfText = confRange.getValue();
    if (headerConfText.indexOf("--showPlayerNames--") > -1)
      return true;
    else
      return false;
  } else {
    return false;
  }
}

function replaceAll(str, find, replace) {
  return str.replace(new RegExp(find, 'g'), replace);
}

function hideEmptyColumns(sheet, range, columnsToHideCount) {
  if (!sheet.isColumnHiddenByUser(range.getColumn()) && range.getValue().length < 1)
    sheet.hideColumns(range.getColumn(), columnsToHideCount);
}

function adjustNameRow(range, name, adjustment) {
  adjustFontSizeForPlayerNames(range, name, adjustment);
}

function adjustFontSizeForPlayerNames(range, name, adjustment) {
  var stringLength = name.length;
  if (stringLength > 6 && stringLength <= 8)
    range.setFontSize(11 - adjustment);
  else if (stringLength > 8 && stringLength <= 11)
    range.setFontSize(9 - adjustment);
  else if (stringLength > 11)
    range.setFontSize(8 - adjustment);
  else if (stringLength > 0)
    range.setFontSize(12 - adjustment);
}

function fillUpMultiDimArrayWithEmptyValues(array, lengthOfRow) {
  for (var j = 0; j < array.length; j++) {
    for (var i = array[j].length; i <= lengthOfRow; i++) {
      array[j].push("");
    }
  }
  return array;
}

function fillUpMultiDimArrayWithEmptyValuesWithNumberOfRows(array, lengthOfRow, numberOfRows) {
  for (var j = 0; j < numberOfRows; j++) {
    if (array[j] == null)
      array[j] = [];
    for (var i = array[j].length; i <= lengthOfRow; i++) {
      array[j].push("");
    }
  }
  return array;
}

function isAbilityTrackedById(abilityId, abilitiesToTrack) {
  var found = "";
  abilitiesToTrack.forEach(function (ability, abilityCount) {
    if (ability.indexOf("[") > -1) {
      ability.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
        if (abilityId != null && abilityId.toString().length > 1 && spellId == abilityId.toString()) {
          found = ability;
        }
      })
    }
  })
  return found;
}

function isAbilityTrackedByName(abilityName, abilitiesToTrack) {
  var found = "";
  abilitiesToTrack.forEach(function (ability, abilityCount) {
    if (abilityName != null && abilityName.toString().length > 1 && ability.toString().indexOf(abilityName.split(" [")[0]) > -1)
      found = ability;
  })
  return found;
}

function shortenSources(sources) {
  var shortenedSources = "";
  sources.split("/").filter(function () { return true }).forEach(function (source, sourceCount) {
    if (source.length > 1) {
      var parts = source.split(" ");
      if (parts.length == 1)
        shortenedSources += parts.map((val, index, arr) => (index == 0) ? val.substring(0, 4) + '.' : val).join(" ") + "/";
      else
        shortenedSources += parts.map((val, index, arr) => (index > 0) ? val.charAt(0) + '.' : val).join(" ") + "/";
    }
  })

  if (shortenedSources.endsWith("."))
    shortenedSources.substring(0, shortenedSources.length - 1);
  if (shortenedSources.length > 40) {
    var shortenedSourcesParts = shortenedSources.split("/");
    var evenMoreShortenedSources = "";
    for (var i = 0, j = shortenedSourcesParts.length; i < j; i++) {
      if (evenMoreShortenedSources.length + shortenedSourcesParts[i].length + 1 > 40) {
        evenMoreShortenedSources += "....";
        break;
      } else
        evenMoreShortenedSources += shortenedSourcesParts[i] + "/";
    }
    shortenedSources = evenMoreShortenedSources;
  }
  if (shortenedSources.endsWith("/"))
    shortenedSources.substring(0, shortenedSources.length - 1);
  return shortenedSources;
}

function sortByProperty(objArray, prop, direction) {
  if (arguments.length < 2) throw new Error("ARRAY, AND OBJECT PROPERTY MINIMUM ARGUMENTS, OPTIONAL DIRECTION");
  if (!Array.isArray(objArray)) throw new Error("FIRST ARGUMENT NOT AN ARRAY");
  const clone = objArray.slice(0);
  const direct = arguments.length > 2 ? arguments[2] : 1; //Default to ascending
  const propPath = (prop.constructor === Array) ? prop : prop.split(".");
  clone.sort(function (a, b) {
    for (let p in propPath) {
      if (a[propPath[p]] && b[propPath[p]]) {
        a = a[propPath[p]];
        b = b[propPath[p]];
      }
    }
    // convert numeric strings to integers
    a = a.toString().match(/^\d+$/) ? +a : a;
    b = b.toString().match(/^\d+$/) ? +b : b;
    return ((a < b) ? -1 * direct : ((a > b) ? 1 * direct : 0));
  });
  return clone;
}

function getStringForTimeStamp(timeStamp, includeHours) {
  var delta = Math.abs(timeStamp) / 1000;
  var days = Math.floor(delta / 86400);
  delta -= days * 86400;
  var hours = Math.floor(delta / 3600) % 24;
  delta -= hours * 3600;
  var minutes = Math.floor(delta / 60) % 60;
  delta -= minutes * 60;
  var seconds = Math.floor(delta % 60);

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

  if (includeHours)
    return hours + ":" + minutesString + ":" + secondsString;
  else
    return minutesString + ":" + secondsString;
}

function getRaidStartAndEnd(allFightsData, ss, queryEnemy) {
  var confSpreadSheet = SpreadsheetApp.openById('1Xvl3pL_wCbo6LLHUtDx3H9UQbqIgjrfuyBh9RtRyq7w');
  var validateConfigSheetST = confSpreadSheet.getSheetByName("validateSTLog");
  var validateConfigSheetBFD = confSpreadSheet.getSheetByName("validateBFDLog");
  var validateConfigSheetGnom = confSpreadSheet.getSheetByName("validateGnomLog");
  var validateConfigSheetMC = confSpreadSheet.getSheetByName("validateMCLog");
  var validateConfigSheetBWL = confSpreadSheet.getSheetByName("validateBWLLog");
  var validateConfigSheetAQ40 = confSpreadSheet.getSheetByName("validateAQ40Log");
  var validateConfigSheetNaxx = confSpreadSheet.getSheetByName("validateNaxxLog");
  var otherSheet = confSpreadSheet.getSheetByName("other");

  var queryEnemyFilled = false;
  if (queryEnemy != null && queryEnemy.length > 0) {
    queryEnemy = queryEnemy + "&hostility=1&sourceid=";
    queryEnemyFilled = true;
  }

  var zonesFound = [];

  var validZones = [];
  validZones.push(409); validZones.push(249); validZones.push(309); validZones.push(409); validZones.push(469); validZones.push(509); validZones.push(531); validZones.push(533); validZones.push(48); validZones.push(109);

  var stZoneID = validateConfigSheetST.getRange(2, validateConfigSheetST.createTextFinder("ST zoneID").useRegularExpression(true).findNext().getColumn()).getValue();
  var stStartPoint = validateConfigSheetST.getRange(2, validateConfigSheetST.createTextFinder("ST start point").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var stEndbosses = validateConfigSheetST.getRange(2, validateConfigSheetST.createTextFinder("ST endboss").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var stMobs = validateConfigSheetST.getRange(2, validateConfigSheetST.createTextFinder("ST mobs").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var bfdZoneID = validateConfigSheetBFD.getRange(2, validateConfigSheetBFD.createTextFinder("BFD zoneID").useRegularExpression(true).findNext().getColumn()).getValue();
  var bfdStartPoint = validateConfigSheetBFD.getRange(2, validateConfigSheetBFD.createTextFinder("BFD start point").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var bfdEndbosses = validateConfigSheetBFD.getRange(2, validateConfigSheetBFD.createTextFinder("BFD endboss").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var bfdMobs = validateConfigSheetBFD.getRange(2, validateConfigSheetBFD.createTextFinder("BFD mobs").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var gnomZoneID = validateConfigSheetGnom.getRange(2, validateConfigSheetGnom.createTextFinder("Gnom zoneID").useRegularExpression(true).findNext().getColumn()).getValue();
  var gnomStartPoint = validateConfigSheetGnom.getRange(2, validateConfigSheetGnom.createTextFinder("Gnom start point").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var gnomEndbosses = validateConfigSheetGnom.getRange(2, validateConfigSheetGnom.createTextFinder("Gnom endboss").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var gnomMobs = validateConfigSheetGnom.getRange(2, validateConfigSheetGnom.createTextFinder("Gnom mobs").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var mcZoneID = validateConfigSheetMC.getRange(2, validateConfigSheetMC.createTextFinder("MC zoneID").useRegularExpression(true).findNext().getColumn()).getValue();
  var mcStartPoint = validateConfigSheetMC.getRange(2, validateConfigSheetMC.createTextFinder("MC start point").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var mcEndbosses = validateConfigSheetMC.getRange(2, validateConfigSheetMC.createTextFinder("MC endboss").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var mcMobs = validateConfigSheetMC.getRange(2, validateConfigSheetMC.createTextFinder("MC mobs").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var bwlZoneID = validateConfigSheetBWL.getRange(2, validateConfigSheetBWL.createTextFinder("BWL zoneID").useRegularExpression(true).findNext().getColumn()).getValue();
  var bwlStartPoint = validateConfigSheetBWL.getRange(2, validateConfigSheetBWL.createTextFinder("BWL start point").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var bwlEndbosses = validateConfigSheetBWL.getRange(2, validateConfigSheetBWL.createTextFinder("BWL endboss").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var bwlMobs = validateConfigSheetBWL.getRange(2, validateConfigSheetBWL.createTextFinder("BWL mobs").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var aq40ZoneID = validateConfigSheetAQ40.getRange(2, validateConfigSheetAQ40.createTextFinder("AQ40 zoneID").useRegularExpression(true).findNext().getColumn()).getValue();
  var aq40StartPoint = validateConfigSheetAQ40.getRange(2, validateConfigSheetAQ40.createTextFinder("AQ40 start point").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var aq40Endbosses = validateConfigSheetAQ40.getRange(2, validateConfigSheetAQ40.createTextFinder("AQ40 endboss").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var aq40Mobs = validateConfigSheetAQ40.getRange(2, validateConfigSheetAQ40.createTextFinder("AQ40 mobs").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var naxxZoneID = validateConfigSheetNaxx.getRange(2, validateConfigSheetNaxx.createTextFinder("Naxx zoneID").useRegularExpression(true).findNext().getColumn()).getValue();
  var naxxStartPoint = validateConfigSheetNaxx.getRange(2, validateConfigSheetNaxx.createTextFinder("Naxx start point").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var naxxEndbosses = validateConfigSheetNaxx.getRange(2, validateConfigSheetNaxx.createTextFinder("Naxx endboss").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
  var naxxMobs = validateConfigSheetNaxx.getRange(2, validateConfigSheetNaxx.createTextFinder("Naxx mobs").useRegularExpression(true).findNext().getColumn(), 2000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);

  var maxMillisecondsInfight = Number(otherSheet.getRange(1, 1).getValue());

  var atLeastOneStartPointFoundAfterXSecondsInfight = false;

  allFightsData.fights.forEach(function (fight, fightCount) {
    var raidZoneFound = -1;
    var zoneStart = -1;
    var zoneEnd = -1;
    var zoneStartRaw = -1;
    var zoneEndRaw = -1;
    zonesFound.forEach(function (raidZone, raidZoneCount) {
      if (fight.zoneID == raidZone[0]) {
        raidZoneFound = fight.zoneID;
        zoneStart = raidZone[1];
        zoneEnd = raidZone[2];
        zoneStartRaw = raidZone[3];
        zoneEndRaw = raidZone[4];
      }
    })
    if (raidZoneFound == -1) {
      zonesFound.forEach(function (raidZone, raidZoneCount) {
        allFightsData.enemies.forEach(function (enemy, enemyCount) {
          enemy.fights.forEach(function (enemyFight, enemyFightCount) {
            if (fight.id == enemyFight.id && (stMobs.indexOf(enemy.guid) > -1 || bfdMobs.indexOf(enemy.guid) > -1 || gnomMobs.indexOf(enemy.guid) > -1 || mcMobs.indexOf(enemy.guid) > -1 || bwlMobs.indexOf(enemy.guid) > -1 || aq40Mobs.indexOf(enemy.guid) > -1 || naxxMobs.indexOf(enemy.guid) > -1)) {
              if ((stMobs.indexOf(enemy.guid) > -1 && stZoneID == raidZone[0]) || (bfdMobs.indexOf(enemy.guid) > -1 && bfdZoneID == raidZone[0]) || (gnomMobs.indexOf(enemy.guid) > -1 && gnomZoneID == raidZone[0]) || (mcMobs.indexOf(enemy.guid) > -1 && mcZoneID == raidZone[0]) || (bwlMobs.indexOf(enemy.guid) > -1 && bwlZoneID == raidZone[0]) || (aq40Mobs.indexOf(enemy.guid) > -1 && aq40ZoneID == raidZone[0]) || (naxxMobs.indexOf(enemy.guid) > -1 && naxxZoneID == raidZone[0])) {
                raidZoneFound = raidZone[0];
                zoneStart = raidZone[1];
                zoneEnd = raidZone[2];
                zoneStartRaw = raidZone[3];
                zoneEndRaw = raidZone[4];
              }
            }
          })
        })
      })
    }
    if (raidZoneFound == -1) {
      if (validZones.indexOf(fight.zoneID) > -1)
        raidZoneFound = fight.zoneID;
      else {
        allFightsData.enemies.forEach(function (enemy, enemyCount) {
          enemy.fights.forEach(function (enemyFight, enemyFightCount) {
            if (raidZoneFound == -1 && fight.id == enemyFight.id && (stMobs.indexOf(enemy.guid) > -1 || bfdMobs.indexOf(enemy.guid) > -1 || gnomMobs.indexOf(enemy.guid) > -1 || mcMobs.indexOf(enemy.guid) > -1 || bwlMobs.indexOf(enemy.guid) > -1 || aq40Mobs.indexOf(enemy.guid) > -1 || naxxMobs.indexOf(enemy.guid) > -1)) {
              if (stMobs.indexOf(enemy.guid) > -1)
                raidZoneFound = stZoneID;
              else if (bfdMobs.indexOf(enemy.guid) > -1)
                raidZoneFound = bfdZoneID;
              else if (gnomMobs.indexOf(enemy.guid) > -1)
                raidZoneFound = gnomZoneID;
              else if (mcMobs.indexOf(enemy.guid) > -1)
                raidZoneFound = mcZoneID;
              else if (bwlMobs.indexOf(enemy.guid) > -1)
                raidZoneFound = bwlZoneID;
              else if (aq40Mobs.indexOf(enemy.guid) > -1)
                raidZoneFound = aq40ZoneID;
              else if (naxxMobs.indexOf(enemy.guid) > -1)
                raidZoneFound = naxxZoneID;
            }
          })
        })
      }
      if (raidZoneFound != -1) {
        zonesFound[zonesFound.length] = [];
        zonesFound[zonesFound.length - 1].push(raidZoneFound);
        zonesFound[zonesFound.length - 1].push(zoneStart);
        zonesFound[zonesFound.length - 1].push(zoneEnd);
        zonesFound[zonesFound.length - 1].push(zoneStartRaw);
        zonesFound[zonesFound.length - 1].push(zoneEndRaw);
        if (stZoneID == raidZoneFound)
          zonesFound[zonesFound.length - 1].push("ST");
        if (bfdZoneID == raidZoneFound)
          zonesFound[zonesFound.length - 1].push("BFD");
        else if (gnomZoneID == raidZoneFound)
          zonesFound[zonesFound.length - 1].push("Gnom");
        else if (mcZoneID == raidZoneFound)
          zonesFound[zonesFound.length - 1].push("MC");
        else if (bwlZoneID == raidZoneFound)
          zonesFound[zonesFound.length - 1].push("BWL");
        else if (aq40ZoneID == raidZoneFound)
          zonesFound[zonesFound.length - 1].push("AQ40");
        else if (naxxZoneID == raidZoneFound)
          zonesFound[zonesFound.length - 1].push("Naxx");
        else {
          if (fight.zoneName != null && fight.zoneName.toString().length > 0)
            zonesFound[zonesFound.length - 1].push(fight.zoneName);
        }
        zonesFound[zonesFound.length - 1].push("false"); //startPointFound
        zonesFound[zonesFound.length - 1].push("false"); //endbossFound
        zonesFound[zonesFound.length - 1].push("false"); //firstBossFound
        zonesFound[zonesFound.length - 1].push("false"); //atLeastOneStartPointFoundAfterXSecondsInfight
        zonesFound[zonesFound.length - 1].push(0); //WCLTotalTime
        zonesFound[zonesFound.length - 1].push(0); //WCLPenaltyTime
      }
    }
    var startPointFoundStart = false;
    var startPointFoundEnd = false;
    var endbossFound = false;
    allFightsData.enemies.forEach(function (enemy, enemyCount) {
      enemy.fights.forEach(function (enemyFight, enemyFightCount) {
        if (enemyFight.id == fight.id && (enemy.type == "NPC" || enemy.type == "Boss")) {
          if (((raidZoneFound == stZoneID && stStartPoint.indexOf(enemy.guid + " [end]") > -1) || (raidZoneFound == bfdZoneID && bfdStartPoint.indexOf(enemy.guid + " [end]") > -1) || (raidZoneFound == gnomZoneID && gnomStartPoint.indexOf(enemy.guid + " [end]") > -1) || (raidZoneFound == mcZoneID && mcStartPoint.indexOf(enemy.guid + " [end]") > -1) || (raidZoneFound == bwlZoneID && bwlStartPoint.indexOf(enemy.guid + " [end]") > -1) || (raidZoneFound == aq40ZoneID && aq40StartPoint.indexOf(enemy.guid + " [end]") > -1) || (raidZoneFound == naxxZoneID && naxxStartPoint.indexOf(enemy.guid + " [end]") > -1))) {
            if (fight.kill != null && fight.kill.toString() == "true")
              startPointFoundEnd = true;
          } else if ((raidZoneFound == stZoneID && stStartPoint.indexOf(enemy.guid) > -1) || (raidZoneFound == bfdZoneID && bfdStartPoint.indexOf(enemy.guid) > -1) || (raidZoneFound == gnomZoneID && gnomStartPoint.indexOf(enemy.guid) > -1) || (raidZoneFound == mcZoneID && mcStartPoint.indexOf(enemy.guid) > -1) || (raidZoneFound == bwlZoneID && bwlStartPoint.indexOf(enemy.guid) > -1) || (raidZoneFound == aq40ZoneID && aq40StartPoint.indexOf(enemy.guid) > -1) || (raidZoneFound == naxxZoneID && naxxStartPoint.indexOf(enemy.guid) > -1)) {
            if (queryEnemyFilled) {
              var queryEnemyData = JSON.parse(UrlFetchApp.fetch(queryEnemy + enemy.id.toString() + "&start=" + fight.start_time.toString() + "&end=" + (fight.start_time + maxMillisecondsInfight).toString()));
              if (queryEnemyData != null && queryEnemyData.events != null && queryEnemyData.events.length > 0)
                startPointFoundStart = true;
              else
                atLeastOneStartPointFoundAfterXSecondsInfight = true;
              Utilities.sleep(50);
            } else
              startPointFoundStart = true;
          }
        }
        if (fight.boss != null && Number(fight.boss) > 0 && fight.kill == true && ((raidZoneFound == stZoneID && stEndbosses.indexOf(fight.boss) > -1) || (raidZoneFound == bfdZoneID && bfdEndbosses.indexOf(fight.boss) > -1) || (raidZoneFound == gnomZoneID && gnomEndbosses.indexOf(fight.boss) > -1) || (raidZoneFound == mcZoneID && mcEndbosses.indexOf(fight.boss) > -1) || (raidZoneFound == bwlZoneID && bwlEndbosses.indexOf(fight.boss) > -1) || (raidZoneFound == aq40ZoneID && aq40Endbosses.indexOf(fight.boss) > -1) || (raidZoneFound == naxxZoneID && naxxEndbosses.indexOf(fight.boss) > -1)))
          endbossFound = true;
      })
    })
    if (startPointFoundStart) {
      if (zoneStart == -1 || fight.start_time < zoneStart) {
        zonesFound.forEach(function (raidZone, raidZoneCount) {
          if (raidZoneFound == raidZone[0] && raidZone[8] == "false") {
            raidZone[1] = fight.start_time;
            raidZone[6] = "true";
          }
        })
      }
    } else if (startPointFoundEnd) {
      if (zoneStart == -1 || fight.end_time < zoneStart) {
        zonesFound.forEach(function (raidZone, raidZoneCount) {
          if (raidZoneFound == raidZone[0] && raidZone[8] == "false") {
            raidZone[1] = fight.end_time;
            raidZone[6] = "true";
          }
        })
      }
    } else {
      zonesFound.forEach(function (raidZone, raidZoneCount) {
        if (atLeastOneStartPointFoundAfterXSecondsInfight)
          raidZone[9] = "true";
      })
    }
    if (fight.boss != null && Number(fight.boss) > 0 && fight.kill != null && fight.kill.toString() == "true") {
      zonesFound.forEach(function (raidZone, raidZoneCount) {
        if (raidZoneFound == raidZone[0] && raidZone[8] == "false") {
          raidZone[8] = "true";
        }
      })
    }
    if (endbossFound) {
      if (zoneEnd == -1 || fight.end_time > zoneEnd) {
        zonesFound.forEach(function (raidZone, raidZoneCount) {
          if (raidZoneFound == raidZone[0]) {
            raidZone[2] = fight.end_time;
            raidZone[7] = "true";
          }
        })
      }
    }
  })
  zonesFound.forEach(function (raidZone, raidZoneCount) {
    allFightsData.fights.forEach(function (fight, fightCount) {
      if (validZones.indexOf(fight.zoneID) > -1) {
        if (fight.zoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3]))
          raidZone[3] = fight.start_time;
      } else {
        allFightsData.enemies.forEach(function (enemy, enemyCount) {
          enemy.fights.forEach(function (enemyFight, enemyFightCount) {
            if (fight.id == enemyFight.id && (stMobs.indexOf(enemy.guid) > -1 || bfdMobs.indexOf(enemy.guid) > -1 || gnomMobs.indexOf(enemy.guid) > -1 || mcMobs.indexOf(enemy.guid) > -1 || bwlMobs.indexOf(enemy.guid) > -1 || aq40Mobs.indexOf(enemy.guid) > -1 || naxxMobs.indexOf(enemy.guid) > -1)) {
              if (stMobs.indexOf(enemy.guid) > -1 && (stZoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3])))
                raidZone[3] = fight.start_time;
              else if (bfdMobs.indexOf(enemy.guid) > -1 && (bfdZoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3])))
                raidZone[3] = fight.start_time;
              else if (gnomMobs.indexOf(enemy.guid) > -1 && (gnomZoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3])))
                raidZone[3] = fight.start_time;
              else if (mcMobs.indexOf(enemy.guid) > -1 && (mcZoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3])))
                raidZone[3] = fight.start_time;
              else if (bwlMobs.indexOf(enemy.guid) > -1 && (bwlZoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3])))
                raidZone[3] = fight.start_time;
              else if (aq40Mobs.indexOf(enemy.guid) > -1 && (aq40ZoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3])))
                raidZone[3] = fight.start_time;
              else if (naxxMobs.indexOf(enemy.guid) > -1 && (naxxZoneID == raidZone[0] && (raidZone[3] == -1 || fight.start_time < raidZone[3])))
                raidZone[3] = fight.start_time;
            }
          })
        })
      }
    })
    if (raidZone[1] == -1) {
      raidZone[1] = raidZone[3];
    }
    allFightsData.fights.forEach(function (fight, fightCount) {
      if (validZones.indexOf(fight.zoneID) > -1) {
        if (fight.zoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4]))
          raidZone[4] = fight.end_time;
      } else {
        allFightsData.enemies.forEach(function (enemy, enemyCount) {
          enemy.fights.forEach(function (enemyFight, enemyFightCount) {
            if (fight.id == enemyFight.id && (stMobs.indexOf(enemy.guid) > -1 || bfdMobs.indexOf(enemy.guid) > -1 || gnomMobs.indexOf(enemy.guid) > -1 || mcMobs.indexOf(enemy.guid) > -1 || bwlMobs.indexOf(enemy.guid) > -1 || aq40Mobs.indexOf(enemy.guid) > -1 || naxxMobs.indexOf(enemy.guid) > -1)) {
              if (stMobs.indexOf(enemy.guid) > -1 && (stZoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4])))
                raidZone[4] = fight.end_time;
              else if (bfdMobs.indexOf(enemy.guid) > -1 && (bfdZoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4])))
                raidZone[4] = fight.end_time;
              else if (gnomMobs.indexOf(enemy.guid) > -1 && (gnomZoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4])))
                raidZone[4] = fight.end_time;
              else if (mcMobs.indexOf(enemy.guid) > -1 && (mcZoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4])))
                raidZone[4] = fight.end_time;
              else if (bwlMobs.indexOf(enemy.guid) > -1 && (bwlZoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4])))
                raidZone[4] = fight.end_time;
              else if (aq40Mobs.indexOf(enemy.guid) > -1 && (aq40ZoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4])))
                raidZone[4] = fight.end_time;
              else if (naxxMobs.indexOf(enemy.guid) > -1 && (naxxZoneID == raidZone[0] && (raidZone[4] == -1 || fight.end_time > raidZone[4])))
                raidZone[4] = fight.end_time;
            }
          })
        })
      }
    })
    if (raidZone[2] == -1) {
      raidZone[2] = raidZone[4];
    }
  })
  zonesFound.forEach(function (raidZone, raidZoneCount) {
    if (allFightsData.completeRaids != null) {
      allFightsData.completeRaids.forEach(function (completeRaid, completeRaidCount) {
        if (completeRaid.start_time == raidZone[1]) {
          raidZone[10] = completeRaid.end_time - completeRaid.start_time;
          var timePenalty = 0;
          if (completeRaid.missedTrashDetails != null) {
            completeRaid.missedTrashDetails.forEach(function (missedTrashDetail, missedTrashDetailCount) {
              if (missedTrashDetail.timePenalty != null && missedTrashDetail.timePenalty > 0)
                timePenalty += missedTrashDetail.timePenalty;
            })
          }
          raidZone[11] = timePenalty;
          if (raidZone[2] - raidZone[1] > raidZone[10])
            raidZone[2] = raidZone[1] + raidZone[10];
        }
      })
    }
  })
  return { zonesFound };
}

function getColourForPlayerClass(playerClass) {
  if (playerClass == "Druid")
    return "#f6b26b";
  else if (playerClass == "Hunter")
    return "#b6d7a8";
  else if (playerClass == "Mage")
    return "#a4c2f4";
  else if (playerClass == "Paladin")
    return "#d5a6bd";
  else if (playerClass == "Priest")
    return "#efefef";
  else if (playerClass == "Rogue")
    return "#fff2cc";
  else if (playerClass == "Shaman")
    return "#6d9eeb";
  else if (playerClass == "Warlock")
    return "#b4a7d6";
  else if (playerClass == "Warrior")
    return "#e2d3c9";
}

function getRoleForPlayerClass(playerClass, dpsCount, tankCount, healerCount, dpsSpec) {
  if (playerClass == "Druid") {
    if (healerCount >= tankCount && healerCount >= dpsCount)
      return "Healer";
    else if (tankCount >= dpsCount && tankCount >= healerCount)
      return "Tank";
    else if (dpsCount >= tankCount && dpsCount >= healerCount) {
      if (dpsSpec == "Balance")
        return "Caster";
      else
        return "Physical";
    }
  } else if (playerClass == "Hunter") {
    return "Physical";
  } else if (playerClass == "Mage") {
    return "Caster";
  } else if (playerClass == "Paladin") {
    if (healerCount >= tankCount && healerCount >= dpsCount)
      return "Healer";
    else if (tankCount >= dpsCount && tankCount >= healerCount)
      return "Tank";
    else if (dpsCount >= tankCount && dpsCount >= healerCount)
      return "Physical";
  } else if (playerClass == "Priest") {
    if (dpsCount >= tankCount && dpsCount >= healerCount)
      return "Caster";
    else
      return "Healer";
  } else if (playerClass == "Rogue") {
    return "Physical";
  } else if (playerClass == "Shaman") {
    if (healerCount >= tankCount && healerCount >= dpsCount)
      return "Healer";
    else if (tankCount >= dpsCount && tankCount >= healerCount)
      return "Tank";
    else if (dpsCount >= tankCount && dpsCount >= healerCount) {
      if (dpsSpec == "Elemental")
        return "Caster";
      else
        return "Physical";
    }
  } else if (playerClass == "Warlock") {
    return "Caster";
  } else if (playerClass == "Warrior") {
    if (dpsCount >= tankCount && dpsCount >= healerCount)
      return "Physical";
    else
      return "Tank";
  }
}
function toggleDarkMode() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = SpreadsheetApp.getActiveSheet();
  var instructionsSheet = ss.getSheetByName("Instructions");
  var darkMode = false;
  try {
    var infoShownCellRange = shiftRangeByRows(instructionsSheet, shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^email$").useRegularExpression(true).findNext(), -1), 5);
    if (infoShownCellRange.getValue().indexOf("no") > -1) {
      infoShownCellRange.setValue("yes");
      SpreadsheetApp.getUi().alert("The toggled mode will only be applied to sheets started from now on, not retroactively! You will see this message only once.");
    }
    var darkModeCellRange = shiftRangeByRows(instructionsSheet, shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^email$").useRegularExpression(true).findNext(), -1), 4);
    var darkModeValue = darkModeCellRange.getValue();
    if (darkModeValue.indexOf("yes") > -1)
      darkMode = true;
  } catch { }
  var maxcolumns = sheet.getMaxColumns();
  if (!darkMode) {
    darkModeCellRange.setValue("yes");
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
    darkModeCellRange.setFontColor("#d9d9d9");
    infoShownCellRange.setFontColor("#d9d9d9");
  } else {
    darkModeCellRange.setValue("no");
    sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).setBackground("white").setBorder(true, true, true, true, true, true, "white", SpreadsheetApp.BorderStyle.SOLID);
    darkModeCellRange.setFontColor("white");
    infoShownCellRange.setFontColor("white");
  }
  sheet.getRange(5, 5, 11, 1).setBackground("#fce5cd").setBorder(true, true, true, true, true, true, "#fce5cd", SpreadsheetApp.BorderStyle.SOLID).setFontColor("black");
  sheet.getRange(9, 5, 1, 1).setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(11, 5, 1, 1).setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(13, 5, 1, 1).setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(15, 5, 1, 1).setBorder(true, true, true, true, true, true, "black", SpreadsheetApp.BorderStyle.SOLID);
}