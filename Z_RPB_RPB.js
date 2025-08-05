function generateAllSheet() {
  var codeVersion = '2.0.0';
  var confSpreadSheet = SpreadsheetApp.openById('1XNnA2QYjjemfgGoYZnENAz_OgiNnyur6tZR-_1pTYXs');
  var currentVersion = confSpreadSheet.getSheetByName("currentVersion").getRange(1, 1).getValue();
  var maxColumns = 71;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("All");
  var instructionsSheet = ss.getSheetByName("Instructions");

  var darkMode = false;
  try {
    if (shiftRangeByRows(instructionsSheet, shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^email$").useRegularExpression(true).findNext(), -1), 4).getValue().indexOf("yes") > -1)
      darkMode = true;
  } catch { }

  var api_key = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^2.$").useRegularExpression(true).findNext(), 4).getValue();
  var reportPathOrId = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^3.$").useRegularExpression(true).findNext(), 4).getValue();
  var includeReportTitleInSheetNames = shiftRangeByColumns(instructionsSheet, instructionsSheet.createTextFinder("^4.$").useRegularExpression(true).findNext(), 4).getValue();
  var noMessagesRange = shiftRangeByColumns(sheet, sheet.createTextFinder("^no completion messages $").useRegularExpression(true).findNext(), 1);
  var information = addColumnsToRange(sheet, addRowsToRange(sheet, sheet.createTextFinder("^   title$").useRegularExpression(true).findNext(), 2), 1);

  if (darkMode)
    sheet.getRange(4, 63).setFontColor("#d9d9d9").setValue("");
  else
    sheet.getRange(4, 63).setFontColor("white").setValue("");
  sheet.getRange(noMessagesRange.getRow() + 1, noMessagesRange.getColumn() - 4).setValue("");
  sheet.getRange(noMessagesRange.getRow() + 2, noMessagesRange.getColumn() - 4).setValue("");

  var onlyBosses = false;
  var onlyTrash = false;
  var noWipes = false;
  var modeSelection = sheet.createTextFinder("trash/bosses?").useRegularExpression(true).findNext();
  if (modeSelection != null) {
    var modeSelectionValue = shiftRangeByColumns(sheet, modeSelection, 1);
    if (modeSelectionValue != null) {
      var value = modeSelectionValue.getValue();
      if (value != null && value.toString().indexOf("only bosses") > -1) {
        onlyBosses = true;
      } else if (value != null && value.toString().indexOf("only trash") > -1) {
        onlyTrash = true;
      }
      if (value != null && value.toString().indexOf("(no wipes)") > -1) {
        noWipes = true;
      }
    }
  }
  var onlyFightNr = shiftRangeByColumns(sheet, sheet.createTextFinder("^only fight id").useRegularExpression(true).findNext(), 1).getValue();
  var manualStartAndEnd = shiftRangeByColumns(sheet, sheet.createTextFinder("^start - end").useRegularExpression(true).findNext(), 1).getValue();
  if ((onlyFightNr != null && onlyFightNr.toString().length > 0) && (manualStartAndEnd != null && manualStartAndEnd.toString().length > 0)) {
    SpreadsheetApp.getUi().alert("You can only specify a fight id OR a start and end timestamp. Please correct your input and press Start again.");
    return;
  }
  if (manualStartAndEnd != null && manualStartAndEnd.toString().length > 0)
    manualStartAndEnd = manualStartAndEnd.replace(" ", "");

  var characterNames = shiftRangeByColumns(sheet, sheet.createTextFinder("^character names").useRegularExpression(true).findNext(), 1).getValue();

  if (currentVersion.indexOf(codeVersion) < 0) {
    SpreadsheetApp.getUi().alert("If you read this your spreadsheet's code is outdated. Please consider updating (check the Pro Instructions or visit the Discord channel #updating)!");
  }

  cleanSheet(sheet, information, darkMode);

  if (reportPathOrId.length > 5) {
    //build urls of apiQueries
    var logId = "";
    reportPathOrId = reportPathOrId.replace(".cn/", ".com/");
    if (reportPathOrId.indexOf("tbc.warcraftlogs") > -1)
      SpreadsheetApp.getUi().alert("This is the vanilla version of the RPB. Apparently you tried to run it for a TBC report. Please use the TBC version of the RPB for that, which you can get at https://discord.gg/nGvt5zH or https://docs.google.com/spreadsheets/d/1EJ0g1i72rJjQkP1IN2Kz0vq31EphlrT0nCworP6ZXMc");
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
    var apiKeyString = "?translate=true&api_key=" + api_key;
    if (onlyBosses)
      apiKeyString += "&encounter=-2";
    if (onlyTrash)
      apiKeyString += "&encounter=0";
    if (noWipes)
      apiKeyString += "&wipes=2";
    var baseUrl = "https://vanilla.warcraftlogs.com:443/v1/"
    var urlAllFights = baseUrl + "report/fights/" + logId + apiKeyString;
    var allFightsData = JSON.parse(UrlFetchApp.fetch(urlAllFights));
    var fightName = "";
    var lastFightName = "";
    var lastFight = "";
    var lastId = "";
    if (onlyFightNr != null && onlyFightNr.toString().length > 0) {
      allFightsData.fights.forEach(function (fight, fightCount) {
        if (fight.id.toString() == onlyFightNr && fight.start_time >= 0 && fight.end_time >= 0) {
          startEndString = "&start=" + fight.start_time + "&end=" + fight.end_time;
          fightName = fight.name;
        }
        if ((fight.boss > 0 && !onlyTrash) || onlyTrash) {
          lastFight = "&start=" + fight.start_time + "&end=" + fight.end_time;
          lastFightName = fight.name;
          lastId = fight.id.toString();
        }
      })
      if (onlyFightNr == "last") {
        startEndString = lastFight;
        fightName = lastFightName;
        onlyFightNr = lastId;
      }
    }
    if (manualStartAndEnd != null && manualStartAndEnd.toString().length > 0) {
      var startEndParts = manualStartAndEnd.split("-");
      startEndString = "&start=" + startEndParts[0] + "&end=" + startEndParts[1];
    }
    var urlDamageTakenTop = baseUrl + "report/tables/damage-taken/" + logId + apiKeyString + startEndString + "&options=4098&by=ability";
    var urlDebuffsTop = baseUrl + "report/tables/debuffs/" + logId + apiKeyString + startEndString + "&hostility=1&by=target";
    var urlPeopleTracked = baseUrl + "report/tables/casts/" + logId + apiKeyString + startEndString;
    var urlDebuffInfo = baseUrl + "report/tables/debuffs/" + logId + apiKeyString + startEndString + "&hostility=1&by=target&abilityid=";
    var urlDamageDoneHostileMelee = baseUrl + "report/tables/damage-done/" + logId + apiKeyString + startEndString + "&hostility=1&by=source&abilityid=1";
    var urlDamageDoneHostileMeleeBySource = baseUrl + "report/tables/damage-done/" + logId + apiKeyString + startEndString + "&hostility=1&by=target&abilityid=1&sourceid=";
    var urlPlayersOnTrash = baseUrl + "report/tables/casts/" + logId + apiKeyString + startEndString + "&encounter=0&sourceid=";
    var urlPlayersRacials = baseUrl + "report/tables/casts/" + logId + apiKeyString + startEndString + "&filter=ability.id%3D7744%20OR%20ability.id%3D20554%20OR%20ability.id%3D20549%20OR%20ability.id%3D20572";
    var urlPlayers = baseUrl + "report/tables/casts/" + logId + apiKeyString + startEndString + "&sourceid=";
    var urlPlayersSunderArmorOnLessThan5Stacks = baseUrl + "report/tables/casts/" + logId + apiKeyString + startEndString + "&filter=ability.id%3D11597%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuffstack%22%20AND%20ability.id%20%3D%2011597%20AND%20stack%20%3D%205%20TO%20type%3D%22removedebuff%22%20AND%20ability.id%3D11597%20GROUP%20BY%20target%20ON%20target%20END&by=source";
    var urlPlayersScorchOnLessThan5Stacks = baseUrl + "report/tables/casts/" + logId + apiKeyString + startEndString + "&filter=ability.id%20IN%20%2810207,10206,10205,8446,8445,8444,2948%29%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuffstack%22%20AND%20ability.id%20%3D%2022959%20AND%20stack%20%3D%205%20TO%20type%3D%22removedebuff%22%20AND%20ability.id%3D22959%20GROUP%20BY%20target%20END&by=source";
    var urlSummary = baseUrl + "report/tables/summary/" + logId + apiKeyString + startEndString;
    var urlDamageDone = baseUrl + "report/tables/damage-done/" + logId + apiKeyString + startEndString + "&sourceid=";
    var urlBuffsOnTrash = baseUrl + "report/tables/buffs/" + logId + apiKeyString + startEndString + "&by=target&encounter=0&targetid=";
    var urlBuffsTotal = baseUrl + "report/tables/buffs/" + logId + apiKeyString + startEndString + "&by=target&targetid=";
    var urlDeathsOnTrash = baseUrl + "report/tables/deaths/" + logId + apiKeyString + startEndString + "&encounter=0";
    var urlDeaths = baseUrl + "report/tables/deaths/" + logId + apiKeyString + startEndString + "&sourceid=";
    var urlDamageTakenOilOfImmo = baseUrl + "report/tables/damage-taken/" + logId + apiKeyString + startEndString + "&hostility=1&abilityid=11351&by=target";
    var urlDamageTakenEngineering = baseUrl + "report/tables/damage-taken/" + logId + apiKeyString + startEndString + "&hostility=1&filter=ability.id%20IN%20%2823063%2C13241%2C17291%2C30486%2C4062%2C16040%2C15239%2C19784%2C12543%2C30461%2C30217%2C39965%2C4068%2C19769%2C4100%2C30216%2C22792%2C30526%2C4072%2C19805%2C27661%2C23000%2C11350%29%20and%20target.id%20!%3D%2016803&by=target";
    var urlDamageTakenTotal = baseUrl + "report/tables/damage-taken/" + logId + apiKeyString + startEndString + "&options=4134&sourceid=";
    var urlDebuffs = baseUrl + "report/tables/debuffs/" + logId + apiKeyString + startEndString + "&hostility=1&by=target&targetid=";
    var urlDebuffsApplied = baseUrl + "report/tables/debuffs/" + logId + apiKeyString + startEndString + "&hostility=1&targetid=";
    var urlDebuffsAppliedTotal = baseUrl + "report/tables/debuffs/" + logId + apiKeyString + startEndString + "&hostility=1";
    var urlDebuffsAppliedBosses = baseUrl + "report/tables/debuffs/" + logId + apiKeyString + startEndString + "&encounter=-2&hostility=1&targetid=";
    var urlDebuffsAppliedBossesTotal = baseUrl + "report/tables/debuffs/" + logId + apiKeyString + startEndString + "&encounter=-2&hostility=1";
    var urlHostilePlayers = baseUrl + "report/tables/damage-done/" + logId + apiKeyString + startEndString + "&targetclass=player&by=source";
    var urlHealing = baseUrl + "report/tables/healing/" + logId + apiKeyString + startEndString + "&sourceid=";
    var urlDamageReflected = baseUrl + "report/tables/damage-taken/" + logId + apiKeyString + startEndString + "&filter=target.name%3Dsource.name%20AND%20ability.id!%3D%27348191%27%20AND%20ability.id!%3D%2716666%27%20AND%20ability.id!%3D%2711684%27%20AND%20ability.id!%3D%2711683%27%20AND%20ability.id!%3D%271949%27%20AND%20ability.id!%3D%2726557%27%20AND%20ability.id!%3D%2728622%27%20AND%20ability.id!%3D%27290025%27%20AND%20ability.id!%3D%2727869%27%20AND%20ability.id!%3D%2716666%27%20AND%20ability.id!%3D%2713241%27AND%20ability.id!%3D%2720476%27";
    var urlInterrupted = baseUrl + "report/tables/interrupts/" + logId + apiKeyString + startEndString;

    var bossString = "-3";
    if (onlyBosses)
      bossString = "-2";

    if (onlyTrash)
      bossString = "0";

    if (noWipes)
      bossString += "&wipes=2";

    var urlDamageReflectedLink = urlDamageReflected.replace("https://vanilla.warcraftlogs.com:443/v1/report/tables/damage-taken/", "https://vanilla.warcraftlogs.com/reports/").replace(logId, logId + "#type=damage-taken").replace(apiKeyString, "").replace(startEndString, "").replace("&filter=", "&pins=2%24Off%24%23244F4B%24expression%24") + "&boss=" + bossString + "&difficulty=0&view=events";

    var maxColumnWidth = 0;

    var interruptedData = JSON.parse(UrlFetchApp.fetch(urlInterrupted));

    var damageTakenOilOfImmoData = JSON.parse(UrlFetchApp.fetch(urlDamageTakenOilOfImmo));
    var damageTakenEngineeringData = JSON.parse(UrlFetchApp.fetch(urlDamageTakenEngineering));

    var hostilePlayersData = JSON.parse(UrlFetchApp.fetch(urlHostilePlayers));

    var urlHostilePlayersLink = urlHostilePlayers.replace("https://vanilla.warcraftlogs.com:443/v1/report/tables/damage-done/", "https://vanilla.warcraftlogs.com/reports/").replace(logId, logId + "#type=damage").replace(apiKeyString, "").replace(startEndString, "").replace("&by=source", "&by=target") + "&boss=" + bossString + "&difficulty=0";

    var damageReflectedData = JSON.parse(UrlFetchApp.fetch(urlDamageReflected));

    var deathsDataTrash = JSON.parse(UrlFetchApp.fetch(urlDeathsOnTrash));
    var deathsData = JSON.parse(UrlFetchApp.fetch(urlDeaths));

    var playerDataSunderArmorOnLessThan5Stacks = JSON.parse(UrlFetchApp.fetch(urlPlayersSunderArmorOnLessThan5Stacks));
    var playerDataScorchOnLessThan5Stacks = JSON.parse(UrlFetchApp.fetch(urlPlayersScorchOnLessThan5Stacks));

    var allPlayersCasting = JSON.parse(UrlFetchApp.fetch(urlPeopleTracked));
    var allPlayersCastingOnTrash = JSON.parse(UrlFetchApp.fetch(urlPeopleTracked + "&encounter=0"));

    var debuffsAppliedDataTotal = JSON.parse(UrlFetchApp.fetch(urlDebuffsAppliedTotal));
    var debuffsAppliedDataBossesTotal = JSON.parse(UrlFetchApp.fetch(urlDebuffsAppliedBossesTotal));

    var allPlayersCastingRacials = JSON.parse(UrlFetchApp.fetch(urlPlayersRacials));
    if (allPlayersCastingRacials != null && allPlayersCastingRacials.entries != null && allPlayersCastingRacials.entries.length > 0)
      var factionName = "Horde";
    else
      var factionName = "Alliance";

    var totalClassCount = 0;
    var currentClass = "";
    //load general queries into datastructures
    var allPlayersByNameAsc = sortByProperty(sortByProperty(JSON.parse(UrlFetchApp.fetch(urlPeopleTracked)).entries, 'name'), "type");
    allPlayersByNameAsc.forEach(function (playerByNameAsc, playerCount) {
      if (playerByNameAsc.total > 20 || fightName != "") {
        if (currentClass != playerByNameAsc.type) {
          currentClass = playerByNameAsc.type;
          totalClassCount++;
        }
      }
    })

    maxColumns += totalClassCount;

    sheet.setRowHeights(8, sheet.getLastRow() - 7, 21);
    sheet.setRowHeights(5, 1, 38);
    sheet.setRowHeights(6, 1, 18);
    sheet.setRowHeight(7, 26);
    sheet.setColumnWidth(1, 48);
    sheet.setColumnWidth(2, 335);
    sheet.setColumnWidths(3, maxColumns - 1, 74);
    sheet.setColumnWidths(3 + maxColumns, sheet.getMaxColumns() - maxColumns - 2, 50);

    var damageTakenByMelee = JSON.parse(UrlFetchApp.fetch(urlDamageDoneHostileMelee));
    var playerDarkBlastTrigger = null;
    damageTakenByMelee.entries.forEach(function (damageTakenByMeleeEntry, damageTakenByMeleeEntryCount) {
      if (damageTakenByMeleeEntry.guid != null && damageTakenByMeleeEntry.guid.toString() == "16427") {
        playerDarkBlastTrigger = JSON.parse(UrlFetchApp.fetch(urlDamageDoneHostileMeleeBySource + damageTakenByMeleeEntry.id))
      }
    })
    var playerWailOfSoulsTrigger = null;
    damageTakenByMelee.entries.forEach(function (damageTakenByMeleeEntry, damageTakenByMeleeEntryCount) {
      if (damageTakenByMeleeEntry.guid != null && damageTakenByMeleeEntry.guid.toString() == "16429") {
        playerWailOfSoulsTrigger = JSON.parse(UrlFetchApp.fetch(urlDamageDoneHostileMeleeBySource + damageTakenByMeleeEntry.id))
      }
    })

    var zoneFound = allFightsData.zone;
    var nameSet = false;
    allFightsData.fights.forEach(function (fight, fightCount) {
      if (fight.zoneName != null && fight.zoneName.length > 0 && !nameSet) {
        if (fightName != "")
          sheet.getRange(information.getRow() + 1, information.getColumn() + 1).setValue(fight.zoneName + " (only " + fightName + ")");
        else
          sheet.getRange(information.getRow() + 1, information.getColumn() + 1).setValue(fight.zoneName);
        nameSet = true;
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
      SpreadsheetApp.getUi().alert("Couldn't identify any raid zones of this report --- If you think this is an error please inform Shariva#8127 on Discord about this!");

    var sheetName = "All";
    var spreadsheetNameAppendix = "";
    if (includeReportTitleInSheetNames.indexOf("yes") > -1)
      sheetName += " " + allFightsData.title;
    if (onlyBosses) {
      //sheetName += " (b)";
      spreadsheetNameAppendix += " (only bosses)";
    }
    if (onlyTrash) {
      //sheetName += " (t)";
      spreadsheetNameAppendix += " (only trash)";
    }
    if (noWipes) {
      //sheetName += " (no w)";
      spreadsheetNameAppendix += " (no wipes)";
    }
    if (darkMode)
      sheet.getRange(4, 65).setFontColor("#d9d9d9").setValue(spreadsheetNameAppendix);
    else
      sheet.getRange(4, 65).setFontColor("white").setValue(spreadsheetNameAppendix);
    nameSheetSafely(sheet, sheetName);
    sheet.getRange(information.getRow() + 2, information.getColumn() + 1).setValue(new Date(allFightsData.start));

    var sheets = ss.getSheets();
    for (var c = sheets.length - 1; c >= 0; c--) {
      var sheetNameSearch = sheets[c].getName();
      if (sheetNameSearch.indexOf("Caster") > -1 || sheetNameSearch.indexOf("Healer") > -1 || sheetNameSearch.indexOf("Physical") > -1 || sheetNameSearch.indexOf("Tank") > -1 || sheetNameSearch.indexOf("configAll") > -1) {
        ss.deleteSheet(sheets[c]);
      }
    }

    var rnd = (Math.floor(Math.random() * 100000000) + 1).toString();
    var conf = copyConfigSheet("All", rnd, confSpreadSheet, ss);

    const configPatterns = {
      singleTargetCasts: "^singleTargetCasts \\[",
      aoeCasts: "^aoeCasts \\[",
      classCooldowns: "^classCooldowns \\[",
      secondsActive: "^secondsActive \\[",

      showDamageReflectRow: "showDamageReflectRow \\[",
      showFriendlyFireRow: "showFriendlyFireRow \\[",
      showDeathCountRow: "showDeathCountRow \\[",
      showInterruptedSpells: "showInterruptedSpells \\[",
      showInterruptedSpellsNamesRow: "showInterruptedSpellsNamesRow \\[",
      showConditionalFormattingDamageTaken: "showConditionalFormattingDamageTaken \\[",
      showOilOfImmolationDmg: "showDamageDoneWithOilOfImmolation \\[",
      showEngineeringDmg: "showDamageDoneWithEngineering \\[",
      showAverageOfHitsPerAoeCast: "showAverageOfHitsPerAoeCast \\[",
      totalAndInformationRowsDefaultTemplate: "totalAndInformationRowsDefaultTemplate \\[",
      showUsedTemporaryWeaponEnchant: "showUsedTemporaryWeaponEnchant \\[",

      damageTakenToTrack: "^damageTaken tracked \\[",
      damageTaken: "^damageTaken \\[",
      debuffsToTrack: "debuffs tracked \\[",
      debuffs: "^debuffs \\[",
      statsAndMiscToTrack: "statsAndMisc tracked \\[",
      statsAndMisc: "^statsAndMisc \\[",
      trinketsAndRacialsToTrack: "trinketsAndRacials tracked \\[",
      trinketsAndRacials: "^trinketsAndRacials \\[",
      engineeringToTrack: "engineering tracked \\[",
      engineering: "^engineering \\[",
      otherCastsToTrack: "otherCasts tracked \\[",
      otherCasts: "^otherCasts \\[",
      absorbsToTrack: "absorbs tracked \\[",
      absorbs: "^absorbs \\[",
      interrupts: "^interrupts \\[",
    };

    // Find all ranges at once
    const allPatterns = { ...configPatterns };
    const foundRanges = {};

    // Get all text finders in one batch
    Object.entries(allPatterns).forEach(([key, pattern]) => {
      foundRanges[key] = conf.createTextFinder(pattern).useRegularExpression(true).findNext();
    });

    // Extract config references
    const confRefs = {};
    Object.keys(configPatterns).forEach(key => {
      const capitalizedKey = 'conf' + key.charAt(0).toUpperCase() + key.slice(1);
      confRefs[capitalizedKey] = foundRanges[key];
      confRefs[capitalizedKey + 'Lang'] = foundRanges[key];
    });

    // Destructure for easier access
    const confSingleTargetCasts = confRefs.confSingleTargetCasts;
    const confAoeCasts = confRefs.confAoeCasts;
    const confClassCooldowns = confRefs.confClassCooldowns;
    const confSecondsActive = confRefs.confSecondsActive;

    const confShowDamageReflectRow = confRefs.confShowDamageReflectRow;
    const confShowFriendlyFireRow = confRefs.confShowFriendlyFireRow;
    const confShowDeathCountRow = confRefs.confShowDeathCountRow;
    const confShowInterruptedSpells = confRefs.confShowInterruptedSpells;
    const confShowInterruptedSpellsNamesRow = confRefs.confShowInterruptedSpellsNamesRow;
    const confShowConditionalFormattingDamageTaken = confRefs.confShowConditionalFormattingDamageTaken;
    const confShowOilOfImmolationDmg = confRefs.confShowOilOfImmolationDmg;
    const confShowEngineeringDmg = confRefs.confShowEngineeringDmg;
    const confShowAverageOfHitsPerAoeCast = confRefs.confShowAverageOfHitsPerAoeCast;
    const confTotalAndInformationRowsDefaultTemplate = confRefs.confTotalAndInformationRowsDefaultTemplate;
    const confShowUsedTemporaryWeaponEnchant = confRefs.confShowUsedTemporaryWeaponEnchant;

    const confDamageTakenToTrack = confRefs.confDamageTakenToTrack;
    const confDamageTaken = confRefs.confDamageTaken;
    const confDebuffsToTrack = confRefs.confDebuffsToTrack;
    const confDebuffs = confRefs.confDebuffs;
    const confStatsAndMiscToTrack = confRefs.confStatsAndMiscToTrack;
    const confStatsAndMisc = confRefs.confStatsAndMisc;
    const confTrinketsAndRacialsToTrack = confRefs.confTrinketsAndRacialsToTrack;
    const confTrinketsAndRacials = confRefs.confTrinketsAndRacials;
    const confEngineeringToTrack = confRefs.confEngineeringToTrack;
    const confEngineering = confRefs.confEngineering;
    const confOtherCastsToTrack = confRefs.confOtherCastsToTrack;
    const confOtherCasts = confRefs.confOtherCasts;
    const confAbsorbsToTrack = confRefs.confAbsorbsToTrack;
    const confAbsorbs = confRefs.confAbsorbs;
    const confInterrupts = confRefs.confInterrupts;

    // Debug logging for missing patterns
    const debugMissing = false; // Set to true to enable debug logging
    if (debugMissing) {
      Object.entries(confRefs).forEach(([name, value]) => {
        if (!value) {
          console.log(`Missing config: ${name}`);
        }
      });
    }

    //initialize variables
    var damageTakenMaxEntries = 15;
    var debuffsMaxEntries = 5;

    //initialize functionalities
    var showDamageReflectRow = confShowDamageReflectRow.getValue().split("[")[1].split("]")[0] == "true";
    var showFriendlyFireRow = confShowFriendlyFireRow.getValue().split("[")[1].split("]")[0] == "true";
    var showDeathCountRow = confShowDeathCountRow.getValue().split("[")[1].split("]")[0] == "true";
    var showInterruptedSpells = confShowInterruptedSpells.getValue().split("[")[1].split("]")[0] == "true";
    var showInterruptedSpellsNamesRow = confShowInterruptedSpellsNamesRow.getValue().split("[")[1].split("]")[0] == "true";
    var showConditionalFormattingDamageTaken = confShowConditionalFormattingDamageTaken.getValue().split("[")[1].split("]")[0] == "true";
    var showOilOfImmolationDmg = confShowOilOfImmolationDmg.getValue().split("[")[1].split("]")[0] == "true";
    var showEngineeringDmg = confShowEngineeringDmg.getValue().split("[")[1].split("]")[0] == "true";
    var showUsedTemporaryWeaponEnchant = confShowUsedTemporaryWeaponEnchant.getValue().split("[")[1].split("]")[0] == "true";
    var showWCLActivePercentage = conf.createTextFinder("showWCLActivePercentage \\[").useRegularExpression(true).findNext().getValue().split("[")[1].split("]")[0] == "true";
    var showAverageOfHitsPerAoeCast = conf.createTextFinder("showAverageOfHitsPerAoeCast \\[").useRegularExpression(true).findNext().getValue().split("[")[1].split("]")[0] == "true";
    var excludeBugTunnelActivity = conf.createTextFinder("excludeBugTunnelActivity \\[").useRegularExpression(true).findNext().getValue().split("[")[1].split("]")[0] == "true";
    var excludeHeiganGauntletActivity = conf.createTextFinder("excludeHeiganGauntletActivity \\[").useRegularExpression(true).findNext().getValue().split("[")[1].split("]")[0] == "true";

    //read tracked casts from conf spreadsheet
    var damageTakenToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confDamageTakenToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
    var debuffsToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confDebuffsToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
    var statsAndMiscToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confStatsAndMiscToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
    var trinketsAndRacialsToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confTrinketsAndRacialsToTrack, 1), 200).getValues().reduce(function (ar, e) {
      if (e[0]) {
        if (e[0].indexOf("Blood Fury") > -1 || e[0].indexOf("War Stomp") > -1 || e[0].indexOf("Berserking") > -1 || e[0].indexOf("Will of the Forsaken") > -1 || e[0].indexOf("Stoneform") > -1 || e[0].indexOf("Escape Artist") > -1 || e[0].indexOf("Desperate Prayer") > -1 || e[0].indexOf("Elune's Grace") > -1 || e[0].indexOf("Fear Ward") > -1 || e[0].indexOf("Feedback") > -1 || e[0].indexOf("Starshards") > -1) {
          if ((e[0].indexOf("Blood Fury") > -1 || e[0].indexOf("War Stomp") > -1 || e[0].indexOf("Berserking") > -1 || e[0].indexOf("Will of the Forsaken") > -1) && factionName == "Horde") {
            ar.push(e[0]);
          } else if ((e[0].indexOf("Stoneform") > -1 || e[0].indexOf("Escape Artist") > -1 || e[0].indexOf("Desperate Prayer") > -1 || e[0].indexOf("Elune's Grace") > -1 || e[0].indexOf("Fear Ward") > -1 || e[0].indexOf("Feedback") > -1 || e[0].indexOf("Starshards") > -1) && factionName == "Alliance") {
            ar.push(e[0]);
          }
        }
        else {
          ar.push(e[0]);
        }
      }
      return ar;
    }, []);
    var engineeringToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confEngineeringToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
    var otherCastsToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confOtherCastsToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
    var absorbsToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confAbsorbsToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);

    //define outputRanges
    var numberOfDamageTakenRows = Number(damageTakenMaxEntries) + 3;
    if (showDamageReflectRow)
      numberOfDamageTakenRows += 1;
    if (showFriendlyFireRow)
      numberOfDamageTakenRows += 2;
    if (showDeathCountRow)
      numberOfDamageTakenRows += 1;

    var secondsActiveLines = 7;
    if (showWCLActivePercentage)
      secondsActiveLines += 1;

    var aoeCastStartRow = confAoeCasts.getValue().split("[")[1].split("]")[0];
    var singleTargetCastsStartRow = confSingleTargetCasts.getValue().split("[")[1].split("]")[0]
    var secondsActiveStartRow = confSecondsActive.getValue().split("[")[1].split("]")[0];
    var classCooldownsStartRow = confClassCooldowns.getValue().split("[")[1].split("]")[0];
    var trinketsAndRacialsStartRow = confTrinketsAndRacials.getValue().split("[")[1].split("]")[0];
    var statsAndMiscStartRow = confStatsAndMisc.getValue().split("[")[1].split("]")[0];
    var singleTargetCastsLines = aoeCastStartRow - singleTargetCastsStartRow + 1;
    var aoeCastsLines = showAverageOfHitsPerAoeCast ? secondsActiveStartRow - aoeCastStartRow + 2 : secondsActiveStartRow - aoeCastStartRow + 1;
    var classCooldownsLines = trinketsAndRacialsStartRow - classCooldownsStartRow + 1;

    if (darkMode)
      sheet.getRange(4, 64).setFontColor("#d9d9d9").setValue(statsAndMiscStartRow);
    else
      sheet.getRange(4, 64).setFontColor("white").setValue(statsAndMiscStartRow);

    if (confDamageTaken != null) var damageTaken = getOutputRange(sheet, confDamageTaken, numberOfDamageTakenRows, maxColumns + 1);
    if (confDebuffs != null) var debuffs = getOutputRange(sheet, confDebuffs, Number(debuffsMaxEntries) + 1, maxColumns + 1);
    var bonusEngi = 0;
    if (showEngineeringDmg)
      bonusEngi = 1;
    if (confEngineering != null) var engineering = getOutputRange(sheet, confEngineering, showOilOfImmolationDmg ? engineeringToTrack.length + 2 + bonusEngi : engineeringToTrack.length + 1 + bonusEngi, maxColumns + 1);
    if (confStatsAndMisc != null) var statsAndMisc = getOutputRange(sheet, confStatsAndMisc, statsAndMiscToTrack.length + 1, maxColumns + 1);
    if (confOtherCasts != null) var otherCasts = getOutputRange(sheet, confOtherCasts, showUsedTemporaryWeaponEnchant ? otherCastsToTrack.length + 2 : otherCastsToTrack.length + 1, maxColumns + 1);
    if (confAbsorbs != null) var absorbs = getOutputRange(sheet, confAbsorbs, absorbsToTrack.length + 2, maxColumns + 1);
    if (confInterrupts != null) var interrupts = getOutputRange(sheet, confInterrupts, showInterruptedSpellsNamesRow ? 3 : 2, maxColumns + 1);
    if (confTrinketsAndRacials != null) var trinketsAndRacials = getOutputRange(sheet, confTrinketsAndRacials, trinketsAndRacialsToTrack.length + 1, maxColumns + 1);
    if (confSingleTargetCasts != null) var singleTargetCasts = getOutputRange(sheet, confSingleTargetCasts, singleTargetCastsLines, maxColumns + 1);
    if (confAoeCasts != null) var aoeCasts = getOutputRange(sheet, confAoeCasts, aoeCastsLines, maxColumns + 1);
    if (confSecondsActive != null) var secondsActive = getOutputRange(sheet, confSecondsActive, secondsActiveLines, maxColumns + 1);
    if (confClassCooldowns != null) var classCooldowns = getOutputRange(sheet, confClassCooldowns, classCooldownsLines, maxColumns + 1);

    //define headers
    if (confSingleTargetCasts != null)
      var singleTargetCastsHeader = getHeaderFromConfig(confSingleTargetCasts);
    if (confAoeCasts != null)
      var aoeCastsHeader = getHeaderFromConfig(confAoeCasts);
    var damageTakenHeader = getHeaderFromConfig(confDamageTaken);
    var debuffsHeader = getHeaderFromConfig(confDebuffs);
    if (confClassCooldowns != null)
      var classCooldownsHeader = getHeaderFromConfig(confClassCooldowns);
    var statsAndMiscHeader = getHeaderFromConfig(confStatsAndMisc);
    var trinketsAndRacialsHeader = getHeaderFromConfig(confTrinketsAndRacials);
    var engineeringHeader = getHeaderFromConfig(confEngineering);
    var otherCastsHeader = getHeaderFromConfig(confOtherCasts);
    var absorbsHeader = getHeaderFromConfig(confAbsorbs);
    var interruptsHeader = getHeaderFromConfig(confInterrupts);

    //initialize output arrays with their respective header texts
    if (singleTargetCastsHeader != null) {
      var singleTargetCastsArr = [];
      fillUpMultiDimArrayWithEmptyValuesWithNumberOfRows(singleTargetCastsArr, maxColumns, singleTargetCastsLines)
      if (excludeBugTunnelActivity && fightName == "" && !onlyBosses && (zoneFound == "1005" || zoneFound == "2005"))
        singleTargetCastsArr[0][0] = singleTargetCastsHeader + " (excl. bug tunnel)";
      else if (excludeHeiganGauntletActivity && fightName == "" && !onlyBosses && (zoneFound == "1006" || zoneFound == "2006"))
        singleTargetCastsArr[0][0] = singleTargetCastsHeader + " (excl. gauntlet)";
      else
        singleTargetCastsArr[0][0] = singleTargetCastsHeader;
      sheet.getRange(singleTargetCasts.getRow(), singleTargetCasts.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    }
    if (aoeCastsHeader != null) {
      var aoeCastsArr = [];
      fillUpMultiDimArrayWithEmptyValuesWithNumberOfRows(aoeCastsArr, maxColumns, aoeCastsLines);
      if (excludeBugTunnelActivity && fightName == "" && !onlyBosses && (zoneFound == "1005" || zoneFound == "2005"))
        aoeCastsArr[0][0] = aoeCastsHeader + " (excl. bug tunnel)";
      else if (excludeHeiganGauntletActivity && fightName == "" && !onlyBosses && (zoneFound == "1006" || zoneFound == "2006"))
        aoeCastsArr[0][0] = aoeCastsHeader + " (excl. gauntlet)";
      else
        aoeCastsArr[0][0] = aoeCastsHeader;
      sheet.getRange(aoeCasts.getRow(), aoeCasts.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    }
    var damageTakenArr = [];
    addSingleEntryToMultiDimArray(damageTakenArr, damageTakenHeader);
    sheet.getRange(damageTaken.getRow(), damageTaken.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    var debuffsArr = [];
    addSingleEntryToMultiDimArray(debuffsArr, debuffsHeader);
    sheet.getRange(debuffs.getRow(), debuffs.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    if (classCooldownsHeader != null) {
      var classCooldownsArr = [];
      fillUpMultiDimArrayWithEmptyValuesWithNumberOfRows(classCooldownsArr, maxColumns, classCooldownsLines);
      classCooldownsArr[0][0] = classCooldownsHeader;
      sheet.getRange(classCooldowns.getRow(), classCooldowns.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    }
    var statsAndMiscArr = [];
    addSingleEntryToMultiDimArray(statsAndMiscArr, statsAndMiscHeader);
    sheet.getRange(statsAndMisc.getRow(), statsAndMisc.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    var trinketsAndRacialsArr = [];
    addSingleEntryToMultiDimArray(trinketsAndRacialsArr, trinketsAndRacialsHeader);
    sheet.getRange(trinketsAndRacials.getRow(), trinketsAndRacials.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    var engineeringArr = [];
    addSingleEntryToMultiDimArray(engineeringArr, engineeringHeader);
    sheet.getRange(engineering.getRow(), engineering.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    var otherCastsArr = [];
    addSingleEntryToMultiDimArray(otherCastsArr, otherCastsHeader);
    sheet.getRange(otherCasts.getRow(), otherCasts.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    var absorbsArr = [];
    addSingleEntryToMultiDimArray(absorbsArr, absorbsHeader);
    sheet.getRange(absorbs.getRow(), absorbs.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    var interruptsArr = [];
    addSingleEntryToMultiDimArray(interruptsArr, interruptsHeader);
    sheet.getRange(interrupts.getRow(), interrupts.getColumn()).setFontWeight("bold").setHorizontalAlignment("right");
    var topDamageTakenDoneArr = [];
    addSingleEntryToMultiDimArray(topDamageTakenDoneArr, damageTakenHeader);
    var debuffsDoneArr = [];
    addSingleEntryToMultiDimArray(debuffsDoneArr, debuffsHeader);
    if (confSecondsActive != null) {
      var secondsActiveArr = [];
      addSingleEntryToMultiDimArray(secondsActiveArr, "");
    }

    //fill in the information section
    var fankrissTime = 0;
    var thaddiusStartTime = 0;
    var thaddiusEndTime = 0;
    var heiganTime = 0;
    var bugTunnelMinTime = 0;
    var bugTunnelMaxTime = 0;
    var heiganGauntletMinTime = 0;
    var heiganGauntletMaxTime = 0;
    var totalTimeElapsedBosses = 0;
    var totalTimeElapsedRaw = 0;
    allFightsData.fights.forEach(function (fight, fightcount) {
      if (!onlyTrash && onlyFightNr != null && onlyFightNr.toString().length > 0 && onlyFightNr.toString() == fight.id.toString()) {
        totalTimeElapsedBosses = Number(fight.end_time) - Number(fight.start_time);
        totalTimeElapsedRaw = Number(fight.end_time) - Number(fight.start_time);
      } else if (fight.boss > 0 && !onlyTrash && (!noWipes || (noWipes && fight.kill != null && fight.kill.toString() == "true"))) {
        totalTimeElapsedBosses += Number(fight.end_time) - Number(fight.start_time);
      }
      if ((onlyFightNr == null || onlyFightNr.toString().length == 0) && ((onlyBosses && fight.boss > 0) || !onlyBosses) && (!noWipes || (noWipes && fight.kill != null && fight.kill.toString() == "true"))) {
        if (!onlyTrash || (onlyTrash && fight.boss.toString() == "0")) {
          totalTimeElapsedRaw += Number(fight.end_time) - Number(fight.start_time);
        }
      } if (fight.boss.toString() == "50712" || fight.boss.toString() == "712") {
        if (fankrissTime == 0 || Number(fight.start_time) > Number(fankrissTime)) {
          fankrissTime = Number(fight.start_time);
        }
      } else if (fight.boss.toString() == "51112" || fight.boss.toString() == "1112") {
        if (heiganTime == 0 || Number(fight.start_time) > Number(heiganTime)) {
          heiganTime = Number(fight.start_time);
        }
      } else if (fight.boss.toString() == "51120" || fight.boss.toString() == "1120") {
        if (thaddiusStartTime == 0 || Number(fight.start_time) < Number(thaddiusStartTime)) {
          thaddiusStartTime = Number(fight.start_time);
        }
        if (thaddiusEndTime == 0 || Number(fight.end_time) > Number(thaddiusEndTime)) {
          thaddiusEndTime = Number(fight.end_time);
        }
      }
    })

    allFightsData.fights.forEach(function (fight, fightcount) {
      if (Number(fight.start_time) < fankrissTime) {
        allFightsData.enemies.forEach(function (enemy, enemyCount) {
          if (enemy.guid == 15300 || enemy.guid == 15229) {
            enemy.fights.forEach(function (enemyFight, enemyFightCount) {
              if (fight.id == enemyFight.id) {
                if (bugTunnelMinTime == 0 || Number(fight.start_time) < bugTunnelMinTime) {
                  bugTunnelMinTime = Number(fight.start_time);
                }
                if (bugTunnelMaxTime == 0 || Number(fight.end_time) > bugTunnelMaxTime) {
                  bugTunnelMaxTime = Number(fight.end_time);
                }
              }
            })
          }
        })
      }
      if (Number(fight.start_time) < heiganTime) {
        allFightsData.enemies.forEach(function (enemy, enemyCount) {
          if (enemy.guid == 16036 || enemy.guid == 16068 || enemy.guid == 16297 || enemy.guid == 16034 || enemy.guid == 16037) {
            enemy.fights.forEach(function (enemyFight, enemyFightCount) {
              if (fight.id == enemyFight.id) {
                if (heiganGauntletMinTime == 0 || Number(fight.start_time) < heiganGauntletMinTime) {
                  heiganGauntletMinTime = Number(fight.start_time);
                }
                if (heiganGauntletMaxTime == 0 || Number(fight.end_time) > heiganGauntletMaxTime) {
                  heiganGauntletMaxTime = Number(fight.end_time);
                }
              }
            })
          }
        })
      }
    })

    var settings = ss.getSheetByName("settings");
    var playerHeaderRange = settings.createTextFinder("^player role$").useRegularExpression(true).findNext();
    var playersWithRoles = settings.getRange(playerHeaderRange.getColumn(), playerHeaderRange.getRow(), 10000, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);

    var hideArr = [];
    for (v = 8, w = sheet.getMaxRows(); v <= w; v++) {
      hideArr.push("=IF(ISERROR(MATCH(IF(ISERROR(MATCH(" + sheet.getRange(v, 2).getA1Notation() + ",\"(rank\",0)),INDEX(SPLIT(INDEX(SPLIT(" + sheet.getRange(v, 2).getA1Notation() + ",\" (\", FALSE, TRUE), 0, 1),\" [\", FALSE, TRUE), 0, 1), " + sheet.getRange(v, 2).getA1Notation() + "),settings!$B$2:$B$10000,0)),\"yes\", \"no\")")
    }
    sheet.getRange(8, 1, sheet.getMaxRows() - 7, 1).setValues(convertMultiRowSingleColumnArraytoMultidimensionalArray(hideArr));

    var damageTakenTop = JSON.parse(UrlFetchApp.fetch(urlDamageTakenTop));
    var damageTakenTopByTotalDesc = [];
    damageTakenToTrack.forEach(function (ability, abilityCount) {
      var total = 0;
      var name = "";
      var sourcesString = "";
      var triggerString = "";
      if (ability.indexOf("[") > -1) {
        var abilityIds = ability.split("[")[1].split("]")[0];
        if (ability.indexOf("Cleave") > -1)
          abilityIds += ",15754";
        if (ability.indexOf("Dark Blast") > -1 && playerDarkBlastTrigger != null) {
          playerDarkBlastTrigger.entries.forEach(function (playerDarkBlast, playerDarkBlastCount) {
            triggerString += playerDarkBlast.name + "/";
          })
          triggerString = triggerString.substr(0, triggerString.length - 1);
        }
        if (ability.indexOf("Wail of Souls") > -1 && playerWailOfSoulsTrigger != null) {
          playerWailOfSoulsTrigger.entries.forEach(function (playerWailOfSouls, playerWailOfSoulsCount) {
            triggerString += playerWailOfSouls.name + "/";
          })
          triggerString = triggerString.substr(0, triggerString.length - 1);
        }
        abilityIds.split(",").forEach(function (spellId, spellIdCount) {
          damageTakenTop.entries.forEach(function (abilityFromLogs, abilityFromLogsCount) {
            if (abilityFromLogs.guid != null && abilityFromLogs.guid.toString().length > 0 && spellId == abilityFromLogs.guid.toString()) {
              total += abilityFromLogs.total;
              name = ability;
              if (abilityFromLogs.sources != null && abilityFromLogs.sources.length > 0) {
                abilityFromLogs.sources.forEach(function (abilitySource, abilitySourceCount) {
                  var abilitySourceName = abilitySource.name;
                  if (abilitySource.name.endsWith(" "))
                    abilitySourceName = abilitySource.name.substring(0, abilitySource.name.length - 1);
                  var abilitySourceNameCorrected = abilitySourceName.replace("[", "").replace("] ", "").replace("]", "").replace("UNUSED", "");
                  if (!(sourcesString.indexOf(abilitySourceNameCorrected) > -1)) {
                    sourcesString += abilitySourceNameCorrected + "/";
                  }
                })
              }
            }
          })
        })
        if (sourcesString.length > 0) {
          if ((triggerString.length == 0 && sourcesString.length > (58 - name.split(" [")[0].length)) || (triggerString.length > 0 && sourcesString.length > (43 - name.split(" [")[0].length - triggerString.length))) {
            sourcesString = shortenSources(sourcesString);
          }
          if (triggerString.length > 0) {
            if (!damageTakenTopByTotalDesc.includes(name + " (" + sourcesString.substr(0, sourcesString.length - 1) + ", triggered by " + triggerString + ")" + ": " + total)) {
              damageTakenTopByTotalDesc.push(name + " (" + sourcesString.substr(0, sourcesString.length - 1) + ", triggered by " + triggerString + ")" + ": " + total);
            }
          } else {
            if (!damageTakenTopByTotalDesc.includes(name + " (" + sourcesString.substr(0, sourcesString.length - 1) + ")" + ": " + total)) {
              damageTakenTopByTotalDesc.push(name + " (" + sourcesString.substr(0, sourcesString.length - 1) + ")" + ": " + total);
            }
          }
        }
      }
    })
    damageTakenTopByTotalDesc = damageTakenTopByTotalDesc.sort(function (a, b) {
      a = a.split(": ")[1].toString().match(/^\d+$/) ? +a.split(": ")[1] : a.split(": ")[1];
      b = b.split(": ")[1].toString().match(/^\d+$/) ? +b.split(": ")[1] : b.split(": ")[1];
      return ((a < b) ? 1 : ((a > b) ? -1 : 0));
    })

    //fill in names of top damageTaken
    damageTakenTopByTotalDesc.forEach(function (abilityByTotalDesc, abilityByTotalDescCount) {
      if (!(topDamageTakenDoneArr.some(e => new RegExp(abilityByTotalDesc.split(": ")[0] + ".*", "g").test(e[0])))) {
        if (topDamageTakenDoneArr.length <= damageTakenMaxEntries) {
          addSingleEntryToMultiDimArray(topDamageTakenDoneArr, abilityByTotalDesc.split(": ")[0]);
        }
      }
    })
    for (var i = 1, j = topDamageTakenDoneArr.length; i <= damageTakenMaxEntries; i++) {
      if (i < j) {
        var rangeRow = sheet.getRange(damageTaken.getRow() + i, damageTaken.getColumn() + 1, 1, maxColumns);

        var rng = conf.createTextFinder(topDamageTakenDoneArr[i][0].split(' (')[0]).findNext();
        if (rng != null)
          copyRangeStyle(rng, rangeRow, null, "center", null);
      }
      else
        addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "");
    }
    if (showDamageReflectRow) {
      addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "Damage reflected");
      copyRangeStyle(confShowDamageReflectRow, sheet.getRange(damageTaken.getRow() + topDamageTakenDoneArr.length - 1, damageTaken.getColumn() + 1, 1, maxColumns), null, "center", null);
    }
    if (showFriendlyFireRow) {
      addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "Damage to hostile players (counts as done to self)");
      copyRangeStyle(confShowFriendlyFireRow, sheet.getRange(damageTaken.getRow() + topDamageTakenDoneArr.length - 1, damageTaken.getColumn() + 1, 1, maxColumns), null, "center", null);
      addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "Friendly Fire (e.g. Charge/Plague/...; counts as done to self)");
      copyRangeStyle(confShowFriendlyFireRow, sheet.getRange(damageTaken.getRow() + topDamageTakenDoneArr.length - 1, damageTaken.getColumn() + 1, 1, maxColumns), null, "center", null);
    }
    if (showDeathCountRow) {
      if (onlyBosses || onlyTrash || (onlyFightNr != null && onlyFightNr.toString().length > 0))
        addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "# of deaths in total");
      else
        addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "# of deaths in total (just on trash)");
      copyRangeStyle(confShowDeathCountRow, sheet.getRange(damageTaken.getRow() + topDamageTakenDoneArr.length - 1, damageTaken.getColumn() + 1, 1, maxColumns), null, "center", null);
    }
    addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "Total avoidable damage taken");
    copyRangeStyle(confTotalAndInformationRowsDefaultTemplate, sheet.getRange(damageTaken.getRow() + topDamageTakenDoneArr.length - 1, damageTaken.getColumn() + 1, 1, maxColumns), null, "center", null);
    if (showConditionalFormattingDamageTaken) {
      var rangeCellStart = sheet.getRange(damageTaken.getRow() + 1, damageTaken.getColumn() + 1);
      var rangeCellEnd = sheet.getRange(damageTaken.getRow() + 1, damageTaken.getColumn() + maxColumns);
      var ruleRange = sheet.getRange(damageTaken.getRow() + 1, damageTaken.getColumn() + 1, topDamageTakenDoneArr.length - 1, maxColumns);
      var rule = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=(' + rangeCellStart.getA1Notation() + '/AVERAGE($' + rangeCellStart.getA1Notation() + ':$' + rangeCellEnd.getA1Notation() + '))>1.25')
        .setBackground("#f9cb9c")
        .setRanges([ruleRange])
        .build();

      var rule2 = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=(' + rangeCellStart.getA1Notation() + '/AVERAGE($' + rangeCellStart.getA1Notation() + ':$' + rangeCellEnd.getA1Notation() + '))>1.75')
        .setBackground("#ea9999")
        .setRanges([ruleRange])
        .build();

      var rules = sheet.getConditionalFormatRules();
      rules.push(rule2);
      rules.push(rule);
      sheet.setConditionalFormatRules(rules);
    }
    addSingleEntryToMultiDimArray(topDamageTakenDoneArr, "");
    shiftRangeByRows(sheet, addRowsToRange(sheet, addColumnsToRange(sheet, damageTaken, 1 - damageTaken.getNumColumns()).setValues(topDamageTakenDoneArr), -1), 1).setFontSize(8).setHorizontalAlignment("right");
    sheet.getRange(damageTaken.getRow() + topDamageTakenDoneArr.length - 1, damageTaken.getColumn() + 1, 1, maxColumns).setHorizontalAlignment("center").setNumberFormat("0%");

    var debuffsTakenTop = JSON.parse(UrlFetchApp.fetch(urlDebuffsTop));
    var debuffsTopByTotalDesc = [];
    debuffsToTrack.forEach(function (ability, abilityCount) {
      var total = 0;
      var name = "";
      var sourcesString = "";
      if (ability.indexOf("[") > -1) {
        ability.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
          debuffsTakenTop.auras.forEach(function (abilityFromLogs, abilityFromLogsCount) {
            if (abilityFromLogs.guid != null && abilityFromLogs.guid.toString().length > 0 && spellId == abilityFromLogs.guid.toString()) {
              total += abilityFromLogs.totalUses;
              name = ability;
              var debuffInfoData = JSON.parse(UrlFetchApp.fetch(urlDebuffInfo + spellId));
              if (debuffInfoData.auras != null && debuffInfoData.auras.length > 0) {
                debuffInfoData.auras.forEach(function (abilitySource, abilitySourceCount) {
                  sourcesString += abilitySource.name + "/";
                })
              }
            }
          })
        })
        if (sourcesString.length > 0) {
          if (sourcesString.length > (58 - name.split(" [")[0].length)) {
            sourcesString = shortenSources(sourcesString);
          }
          if (!debuffsTopByTotalDesc.includes(name + " (" + sourcesString.substr(0, sourcesString.length - 1) + ")" + ": " + total)) {
            debuffsTopByTotalDesc.push(name + " (" + sourcesString.substr(0, sourcesString.length - 1) + ")" + ": " + total);
          }
        }
      }
    })
    debuffsTopByTotalDesc = debuffsTopByTotalDesc.sort(function (a, b) {
      a = a.split(": ")[1].toString().match(/^\d+$/) ? +a.split(": ")[1] : a.split(": ")[1];
      b = b.split(": ")[1].toString().match(/^\d+$/) ? +b.split(": ")[1] : b.split(": ")[1];
      return ((a < b) ? 1 : ((a > b) ? -1 : 0));
    })

    //fill in names of debuffs applied
    debuffsTopByTotalDesc.forEach(function (debuffByTotalDesc, debuffByTotalDescCount) {
      if (!(debuffsDoneArr.some(e => new RegExp(debuffByTotalDesc.split(": ")[0] + ".*", "g").test(e[0])))) {
        if (debuffsDoneArr.length <= debuffsMaxEntries) {
          addSingleEntryToMultiDimArray(debuffsDoneArr, debuffByTotalDesc.split(": ")[0]);
        }
      }
    })
    for (var i = 1, j = debuffsDoneArr.length; i <= debuffsMaxEntries; i++) {
      if (i < j) {
        var rangeRow = sheet.getRange(debuffs.getRow() + i, debuffs.getColumn() + 1, 1, maxColumns);

        var rng = conf.createTextFinder(debuffsDoneArr[i][0].split(' (')[0]).findNext();
        if (rng != null)
          copyRangeStyle(rng, rangeRow, null, "center", null);
      }
      else
        addSingleEntryToMultiDimArray(debuffsDoneArr, "");
    }
    shiftRangeByRows(sheet, addRowsToRange(sheet, addColumnsToRange(sheet, debuffs, 1 - debuffs.getNumColumns()).setValues(debuffsDoneArr), -1), 1).setFontSize(8).setHorizontalAlignment("right");

    bossSummaryDataAll = [];
    bossDamageDataAll = [];
    allFightsData.fights.forEach(function (fight, fightCount) {
      if ((fight.start_time != fight.end_time) && fight.boss > 0 && ((onlyFightNr != null && onlyFightNr.toString() == fight.id.toString()) || onlyFightNr.toString().length == 0)) {
        bossSummaryDataAll.push(JSON.parse(UrlFetchApp.fetch(urlSummary.replace(startEndString, "&start=" + fight.start_time + "&end=" + fight.end_time))));
        bossDamageDataAll.push(JSON.parse(UrlFetchApp.fetch(urlDamageDone.replace("&sourceid=", "").replace(startEndString, "&start=" + fight.start_time + "&end=" + fight.end_time) + "&abilityid%20IN%20%2811337%2C25347%2C25349%2C11354%29")));
      }
    })

    var playerDoneCount = 0;
    var previousClass = "";
    var classDoneCount = 0;
    var singleTargetCastsToTrack = null;
    var aoeCastsToTrack = null;
    var classCooldownsToTrack = null;
    var rolesAndNames = [];
    rolesAndNames[0] = [];
    rolesAndNames[1] = [];
    rolesAndNames[2] = [];
    allPlayersByNameAsc.forEach(function (playerByNameAsc, playerCount) {
      var characterNamesArr = characterNames.replace(/\s/g, "").split(",");
      if ((playerByNameAsc.type == "Druid" || playerByNameAsc.type == "Hunter" || playerByNameAsc.type == "Mage" || playerByNameAsc.type == "Priest" || playerByNameAsc.type == "Paladin" || playerByNameAsc.type == "Rogue" || playerByNameAsc.type == "Shaman" || playerByNameAsc.type == "Warlock" || playerByNameAsc.type == "Warrior") && (playerByNameAsc.total > 20 || fightName != "") && (characterNames.length < 1 || (characterNames.length > 0 && checkIfArrayContainsEntry(characterNamesArr, playerByNameAsc.name)))) {
        if (previousClass != playerByNameAsc.type) {
          var confSingleTargetCastsToTrack = conf.createTextFinder("singleTargetCasts tracked " + playerByNameAsc.type).useRegularExpression(true).findNext();
          var confClassCooldownsToTrack = conf.createTextFinder("classCooldowns tracked " + playerByNameAsc.type).useRegularExpression(true).findNext();
          var confAoeCastsToTrack = conf.createTextFinder("aoeCasts tracked " + playerByNameAsc.type).useRegularExpression(true).findNext();
          if (confSingleTargetCastsToTrack != null)
            singleTargetCastsToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confSingleTargetCastsToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
          if (confAoeCastsToTrack != null)
            aoeCastsToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confAoeCastsToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
          if (confClassCooldownsToTrack != null)
            classCooldownsToTrack = addRowsToRange(conf, shiftRangeByRows(conf, confClassCooldownsToTrack, 1), 200).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);

          var playersInThisClass = 0;
          allPlayersByNameAsc.forEach(function (playerByNameAscSearch, playerCountSearch) {
            if (playerByNameAscSearch.type == playerByNameAsc.type && (playerByNameAscSearch.total > 20 || fightName != "") && (characterNames.length < 1 || (characterNames.length > 0 && checkIfArrayContainsEntry(characterNamesArr, playerByNameAscSearch.name)))) {
              playersInThisClass++;
            }
          })

          classDoneCount++;
        }
        //load player-related queries into datastructures
        var playerData = JSON.parse(UrlFetchApp.fetch(urlPlayers + playerByNameAsc.id));
        var playerDataTrash = JSON.parse(UrlFetchApp.fetch(urlPlayersOnTrash + playerByNameAsc.id));
        var damageDoneData = JSON.parse(UrlFetchApp.fetch(urlDamageDone + playerByNameAsc.id));
        var buffsDataTrash = JSON.parse(UrlFetchApp.fetch(urlBuffsOnTrash + playerByNameAsc.id));
        var buffsData = JSON.parse(UrlFetchApp.fetch(urlBuffsTotal + playerByNameAsc.id));
        var damageTakenTotalData = JSON.parse(UrlFetchApp.fetch(urlDamageTakenTotal + playerByNameAsc.id));
        var debuffsAppliedData = JSON.parse(UrlFetchApp.fetch(urlDebuffsApplied + playerByNameAsc.id));
        var debuffsAppliedDataBosses = JSON.parse(UrlFetchApp.fetch(urlDebuffsAppliedBosses + playerByNameAsc.id));
        var debuffsData = JSON.parse(UrlFetchApp.fetch(urlDebuffs + playerByNameAsc.id));
        var healingData = JSON.parse(UrlFetchApp.fetch(urlHealing + playerByNameAsc.id));

        if ((zoneFound == "1005" || zoneFound == "2005")) {
          var urlDamageDoneBugTunnel = urlDamageDone.replace(startEndString, "&start=" + bugTunnelMinTime + "&end=" + bugTunnelMaxTime);
          var urlPlayersBugTunnel = urlPlayers.replace(startEndString, "&start=" + bugTunnelMinTime + "&end=" + bugTunnelMaxTime);
          var urlHealingBugTunnel = urlPlayers.replace(startEndString, "&start=" + bugTunnelMinTime + "&end=" + bugTunnelMaxTime);
          var playerBugTunnelData = JSON.parse(UrlFetchApp.fetch(urlPlayersBugTunnel + playerByNameAsc.id));
          var damageDoneBugTunnelData = JSON.parse(UrlFetchApp.fetch(urlDamageDoneBugTunnel + playerByNameAsc.id));
          var healingTunnelData = JSON.parse(UrlFetchApp.fetch(urlHealingBugTunnel + playerByNameAsc.id));
        } else if (excludeHeiganGauntletActivity && (zoneFound == "1006" || zoneFound == "2006")) {
          var urlDamageDoneHeiganGauntlet = urlDamageDone.replace(startEndString, "&start=" + heiganGauntletMinTime + "&end=" + heiganGauntletMaxTime);
          var urlPlayersHeiganGauntlet = urlPlayers.replace(startEndString, "&start=" + heiganGauntletMinTime + "&end=" + heiganGauntletMaxTime);
          var urlHealingHeiganGauntlet = urlPlayers.replace(startEndString, "&start=" + heiganGauntletMinTime + "&end=" + heiganGauntletMaxTime);
          var playerHeiganGauntletData = JSON.parse(UrlFetchApp.fetch(urlPlayersHeiganGauntlet + playerByNameAsc.id));
          var damageDoneHeiganGauntletData = JSON.parse(UrlFetchApp.fetch(urlDamageDoneHeiganGauntlet + playerByNameAsc.id));
          var healingHeiganGauntletData = JSON.parse(UrlFetchApp.fetch(urlHealingHeiganGauntlet + playerByNameAsc.id));
        }

        if (zoneFound == "1006" || zoneFound == "2006") {
          var startReport = Number(startEndString.split("&start=")[1].split("&end=")[0]);
          var endReport = Number(startEndString.split("&start=")[1].split("&end=")[1]);
          if (startReport > thaddiusStartTime || endReport < thaddiusEndTime) {
            thaddiusStartTime = 0;
            thaddiusEndTime = 0;
          }
          var urlDamageDoneThaddius = urlDamageDone.replace(startEndString, "&start=" + thaddiusStartTime + "&end=" + thaddiusEndTime);
        }

        var hostilePlayersTotal = 0;
        hostilePlayersData.entries.forEach(function (hostilePlayersDataEntry, hostilePlayersDataEntryCount) {
          if (hostilePlayersDataEntry.id == playerByNameAsc.id)
            hostilePlayersTotal += hostilePlayersDataEntry.total;
        })

        var friendlyFireTotal = 0;
        var urlFriendlyFire = baseUrl + "report/tables/damage-taken/" + logId + apiKeyString + startEndString + "&filter=NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuff%22%20AND%20ability.id%20%3D%20%2224327%22%20AND%20target.name%3D%22Qlap%22%20TO%20type%20%3D%20%22removedebuff%22%20and%20ability.id%3D%2224327%22%20AND%20target.name%3D%22Qlap%22%20END%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuff%22%20AND%20ability.id%20%3D%20%22785%22%20AND%20target.name%3D%22Qlap%22%20TO%20type%20%3D%20%22removedebuff%22%20and%20ability.id%3D%22785%22%20AND%20target.name%3D%22Qlap%22%20END%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuff%22%20AND%20ability.id%20%3D%20%2222667%22%20AND%20target.name%3D%22Qlap%22%20TO%20type%20%3D%20%22removedebuff%22%20and%20ability.id%3D%2222667%22%20AND%20target.name%3D%22Qlap%22%20END%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuff%22%20AND%20ability.id%20%3D%20%2220604%22%20AND%20target.name%3D%22Qlap%22%20TO%20type%20%3D%20%22removedebuff%22%20and%20ability.id%3D%2220604%22%20AND%20target.name%3D%22Qlap%22%20END%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuff%22%20AND%20ability.id%20%3D%20%2212888%22%20AND%20target.name%3D%22Qlap%22%20TO%20type%20%3D%20%22removedebuff%22%20and%20ability.id%3D%2212888%22%20AND%20target.name%3D%22Qlap%22%20END%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuff%22%20AND%20ability.id%20%3D%20%2226079%22%20AND%20target.name%3D%22Qlap%22%20TO%20type%20%3D%20%22removedebuff%22%20and%20ability.id%3D%2226079%22%20AND%20target.name%3D%22Qlap%22%20END%20AND%20NOT%20IN%20RANGE%20FROM%20type%20%3D%20%22applydebuff%22%20AND%20ability.id%20%3D%20%2228410%22%20AND%20target.name%3D%22Qlap%22%20TO%20type%20%3D%20%22removedebuff%22%20and%20ability.id%3D%2228410%22%20AND%20target.name%3D%22Qlap%22%20END&options=4135&by=target&targetid=";
        var urlFriendlyFireReplaced = replaceAll(urlFriendlyFire, "Qlap", playerByNameAsc.name) + playerByNameAsc.id;
        var friendlyFireData = JSON.parse(UrlFetchApp.fetch(urlFriendlyFireReplaced));
        if (friendlyFireData != null && friendlyFireData.entries != null && friendlyFireData.entries.length > 0 && friendlyFireData.entries[0].total != null && friendlyFireData.entries[0].total > 0) {
          friendlyFireTotal = friendlyFireData.entries[0].total;
        }
        var urlFriendlyFireLinkPlayer = urlFriendlyFireReplaced.replace("https://vanilla.warcraftlogs.com:443/v1/report/tables/damage-taken/", "https://vanilla.warcraftlogs.com/reports/").replace(logId, logId + "#type=damage-taken").replace(apiKeyString, "").replace(startEndString, "").replace("&targetid=" + playerByNameAsc.id, "").replace("&filter=", "&pins=2%24Off%24%23244F4B%24expression%24") + "&boss=" + bossString + "&difficulty=0&view=events&target=" + playerByNameAsc.id;

        var urlHostilePlayersLinkPlayer = urlHostilePlayersLink + "&source=" + playerByNameAsc.id;
        var urlDamageReflectedLinkPlayer = urlDamageReflectedLink + "&target=" + playerByNameAsc.id;

        //get totalUses of band-driven casts
        var gotAtLeastOnePI = false;
        var PIonTrash = 0;
        var PIOnBosses = 0;
        var PITotalUptime = 0;
        var PIonTrashSelf = 0;
        var PIOnBossesSelf = 0;
        var gotAtLeastOneAPComb = false;
        var APCombonTrash = 0;
        var APCombOnBosses = 0;
        var APCombTotalUptime = 0;
        var gotAtLeastOneEvocation = false;
        var EvocationOnTrash = 0;
        var EvocationOnBosses = 0;
        var EvocationTotalUptime = 0;
        var gotAtLeastOneEvasion = false;
        var EvasionOnTrash = 0;
        var EvasionOnBosses = 0;
        var EvasionTotalUptime = 0;
        var gotAtLeastOneAdrenalineRush = false;
        var AdrenalineRushOnTrash = 0;
        var AdrenalineRushOnBosses = 0;
        var AdrenalineRushTotalUptime = 0;
        var gotAtLeastOneBerserkerRage = false;
        var BerserkerRageOnTrash = 0;
        var BerserkerRageOnBosses = 0;
        var BerserkerRageTotalUptime = 0;
        var gotAtLeastOneBloodrage = false;
        var BloodrageOnTrash = 0;
        var BloodrageOnBosses = 0;
        var BloodrageTotalUptime = 0;
        var gotAtLeastOneChallengingShout = false;
        var ChallengingShoutOnTrash = 0;
        var ChallengingShoutOnBosses = 0;
        var ChallengingShoutTotalUptime = 0;
        var gotAtLeastOneDeathWish = false;
        var DeathWishOnTrash = 0;
        var DeathWishOnBosses = 0;
        var DeathWishTotalUptime = 0;
        var gotAtLeastOneLastStand = false;
        var LastStandOnTrash = 0;
        var LastStandOnBosses = 0;
        var LastStandTotalUptime = 0;
        var gotAtLeastOneRecklessness = false;
        var RecklessnessOnTrash = 0;
        var RecklessnessOnBosses = 0;
        var RecklessnessTotalUptime = 0;
        var gotAtLeastOneRetaliation = false;
        var RetaliationOnTrash = 0;
        var RetaliationOnBosses = 0;
        var RetaliationTotalUptime = 0;
        var gotAtLeastOneShieldWall = false;
        var ShieldWallOnTrash = 0;
        var ShieldWallOnBosses = 0;
        var ShieldWallTotalUptime = 0;
        var gotAtLeastOneNaturesSwiftness = false;
        var NaturesSwiftnessOnTrash = 0;
        var NaturesSwiftnessOnBosses = 0;
        var NaturesSwiftnessTotalUptime = 0;
        var gotAtLeastOneElementalMastery = false;
        var ElementalMasteryOnTrash = 0;
        var ElementalMasteryOnBosses = 0;
        var ElementalMasteryTotalUptime = 0;
        var gotAtLeastOneRebirth = false;
        var RebirthOnTrash = 0;
        var RebirthOnBosses = 0;
        var RebirthTotalUptime = 0;
        var gotAtLeastOneChallengingRoar = false;
        var ChallengingRoarOnTrash = 0;
        var ChallengingRoarOnBosses = 0;
        var ChallengingRoarTotalUptime = 0;
        var gotAtLeastOneDash = false;
        var DashOnTrash = 0;
        var DashOnBosses = 0;
        var DashTotalUptime = 0;
        var gotAtLeastOneFrenziedRegeneration = false;
        var FrenziedRegenerationOnTrash = 0;
        var FrenziedRegenerationOnBosses = 0;
        var FrenziedRegenerationTotalUptime = 0;
        var gotAtLeastOneInnervate = false;
        var InnervateOnTrash = 0;
        var InnervateOnBosses = 0;
        var InnervateTotalUptime = 0;
        var InnervateOnTrashSelf = 0;
        var InnervateOnBossesSelf = 0;
        var gotAtLeastOneTranquility = false;
        var TranquilityOnTrash = 0;
        var TranquilityOnBosses = 0;
        var TranquilityTotalUptime = 0;
        var gotAtLeastOneRapidFire = false;
        var RapidFireOnTrash = 0;
        var RapidFireOnBosses = 0;
        var RapidFireTotalUptime = 0;
        var gotAtLeastOneReadiness = false;
        var ReadinessOnTrash = 0;
        var ReadinessOnBosses = 0;
        var ReadinessTotalUptime = 0;
        var gotAtLeastOneDeterrence = false;
        var DeterrenceOnTrash = 0;
        var DeterrenceOnBosses = 0;
        var DeterrenceTotalUptime = 0;
        var gotAtLeastOneBestialWrath = false;
        var BestialWrathOnTrash = 0;
        var BestialWrathOnBosses = 0;
        var BestialWrathTotalUptime = 0;
        var gotAtLeastOneInnerFocus = false;
        var InnerFocusOnTrash = 0;
        var InnerFocusOnBosses = 0;
        var InnerFocusTotalUptime = 0;
        var gotAtLeastOneBoP = false;
        var BoPOnTrash = 0;
        var BoPOnBosses = 0;
        var BoPTotalUptime = 0;
        var gotAtLeastOneDivineFavor = false;
        var DivineFavorOnTrash = 0;
        var DivineFavorOnBosses = 0;
        var DivineFavorTotalUptime = 0;
        var gotAtLeastOneDivineIntervention = false;
        var DivineInterventionOnTrash = 0;
        var DivineInterventionOnBosses = 0;
        var DivineInterventionTotalUptime = 0;
        var gotAtLeastOneDivineProtection = false;
        var DivineProtectionOnTrash = 0;
        var DivineProtectionOnBosses = 0;
        var DivineProtectionTotalUptime = 0;
        var gotAtLeastOneDivineShield = false;
        var DivineShieldOnTrash = 0;
        var DivineShieldOnBosses = 0;
        var DivineShieldTotalUptime = 0;
        var gotAtLeastOneLayOnHands = false;
        var LayOnHandsOnTrash = 0;
        var LayOnHandsOnBosses = 0;
        var LayOnHandsTotalUptime = 0;
        var gotAtLeastOneDevouringPlague = false;
        var DevouringPlagueOnTrash = 0;
        var DevouringPlagueOnBosses = 0;
        var DevouringPlagueTotalUptime = 0;
        var gotAtLeastOneDesperatePrayer = false;
        var DesperatePrayerOnTrash = 0;
        var DesperatePrayerOnBosses = 0;
        var DesperatePrayerTotalUptime = 0;
        var gotAtLeastOneManaTideTotem = false;
        var ManaTideTotemOnTrash = 0;
        var ManaTideTotemOnBosses = 0;
        var ManaTideTotalUptime = 0;
        var gotAtLeastOneVanish = false;
        var VanishOnTrash = 0;
        var VanishOnBosses = 0;
        var VanishTotalUptime = 0;
        var GreaterStoneshieldUses = 0;
        var LIPUses = 0;
        var FAPUses = 0;
        var RestorativeUses = 0;

        if (!onlyBosses) {
          playerDataTrash.entries.forEach(function (spellSelf, spellSelfCount) {
            if (spellSelf.guid == 10060 && spellSelf.total > 0 && spellSelf.targets != null && spellSelf.targets.length > 0) {
              spellSelf.targets.forEach(function (spellSelfTarget, spellSelfTargetCount) {
                if (spellSelfTarget.name == playerByNameAsc.name) {
                  gotAtLeastOnePI = true;
                  PIonTrashSelf = spellSelfTarget.total;
                }
              })
            } else if (spellSelf.guid == 29166 && spellSelf.total > 0 && spellSelf.targets != null && spellSelf.targets.length > 0) {
              spellSelf.targets.forEach(function (spellSelfTarget, spellSelfTargetCount) {
                if (spellSelfTarget.name == playerByNameAsc.name) {
                  gotAtLeastOneInnervate = true;
                  InnervateOnTrashSelf = spellSelfTarget.total;
                }
              })
            }
          })

          buffsDataTrash.auras.forEach(function (buff, buffCount) {
            if (buff.guid == 10060 && buff.totalUses > 0) {
              gotAtLeastOnePI = true;
              PIonTrash = buff.bands.length;
            } else if ((buff.guid == 12042 || buff.guid == 28682) && buff.totalUses > 0) {
              gotAtLeastOneAPComb = true;
              APCombonTrash = buff.bands.length;
            } else if ((buff.guid == 12051) && buff.totalUses > 0) {
              gotAtLeastOneEvocation = true;
              EvocationOnTrash = buff.bands.length;
            } else if ((buff.guid == 5277) && buff.totalUses > 0) {
              gotAtLeastOneEvasion = true;
              EvasionOnTrash = buff.bands.length;
            } else if ((buff.guid == 13750) && buff.totalUses > 0) {
              gotAtLeastOneAdrenalineRush = true;
              AdrenalineRushOnTrash = buff.bands.length;
            } else if ((buff.guid == 18499) && buff.totalUses > 0) {
              gotAtLeastOneBerserkerRage = true;
              BerserkerRageOnTrash = buff.bands.length;
            } else if ((buff.guid == 2687) && buff.totalUses > 0) {
              gotAtLeastOneBloodrage = true;
              BloodrageOnTrash = buff.bands.length;
            } else if ((buff.guid == 1161) && buff.totalUses > 0) {
              gotAtLeastOneChallengingShout = true;
              ChallengingShoutOnTrash = buff.bands.length;
            } else if ((buff.guid == 12328) && buff.totalUses > 0) {
              gotAtLeastOneDeathWish = true;
              DeathWishOnTrash = buff.bands.length;
            } else if ((buff.guid == 12975) && buff.totalUses > 0) {
              gotAtLeastOneLastStand = true;
              LastStandOnTrash = buff.bands.length;
            } else if ((buff.guid == 1719) && buff.totalUses > 0) {
              gotAtLeastOneRecklessness = true;
              RecklessnessOnTrash = buff.bands.length;
            } else if ((buff.guid == 20230) && buff.totalUses > 0) {
              gotAtLeastOneRetaliation = true;
              RetaliationOnTrash = buff.bands.length;
            } else if ((buff.guid == 871) && buff.totalUses > 0) {
              gotAtLeastOneShieldWall = true;
              ShieldWallOnTrash = buff.bands.length;
            } else if ((buff.guid == 17116 || buff.guid == 16188) && buff.totalUses > 0) {
              gotAtLeastOneNaturesSwiftness = true;
              NaturesSwiftnessOnTrash = buff.bands.length;
            } else if ((buff.guid == 20748) && buff.totalUses > 0) {
              gotAtLeastOneRebirth = true;
              RebirthOnTrash = buff.bands.length;
            } else if ((buff.guid == 5209) && buff.totalUses > 0) {
              gotAtLeastOneChallengingRoar = true;
              ChallengingRoarOnTrash = buff.bands.length;
            } else if ((buff.guid == 9821) && buff.totalUses > 0) {
              gotAtLeastOneDash = true;
              DashOnTrash = buff.bands.length;
            } else if ((buff.guid == 22896) && buff.totalUses > 0) {
              gotAtLeastOneFrenziedRegeneration = true;
              FrenziedRegenerationOnTrash = buff.bands.length;
            } else if ((buff.guid == 29166) && buff.totalUses > 0) {
              gotAtLeastOneInnervate = true;
              InnervateOnTrash = buff.bands.length;
            } else if ((buff.guid == 3045) && buff.totalUses > 0) {
              gotAtLeastOneRapidFire = true;
              RapidFireOnTrash = buff.bands.length;
            } else if ((buff.guid == 23989) && buff.totalUses > 0) {
              gotAtLeastOneReadiness = true;
              ReadinessOnTrash = buff.bands.length;
            } else if ((buff.guid == 19263) && buff.totalUses > 0) {
              gotAtLeastOneDeterrence = true;
              DeterrenceOnTrash = buff.bands.length;
            } else if ((buff.guid == 19574) && buff.totalUses > 0) {
              gotAtLeastOneBestialWrath = true;
              BestialWrathOnTrash = buff.bands.length;
            } else if ((buff.guid == 14751) && buff.totalUses > 0) {
              gotAtLeastOneInnerFocus = true;
              InnerFocusOnTrash = buff.bands.length;
            } else if ((buff.guid == 10278) && buff.totalUses > 0) {
              gotAtLeastOneBoP = true;
              BoPOnTrash = buff.bands.length;
            } else if ((buff.guid == 20216) && buff.totalUses > 0) {
              gotAtLeastOneDivineFavor = true;
              DivineFavorOnTrash = buff.bands.length;
            } else if ((buff.guid == 19752) && buff.totalUses > 0) {
              gotAtLeastOneDivineIntervention = true;
              DivineInterventionOnTrash = buff.bands.length;
            } else if ((buff.guid == 1020) && buff.totalUses > 0) {
              gotAtLeastOneDivineShield = true;
              DivineShieldOnTrash = buff.bands.length;
            } else if ((buff.guid == 5573) && buff.totalUses > 0) {
              gotAtLeastOneDivineProtection = true;
              DivineProtectionOnTrash = buff.bands.length;
            } else if ((buff.guid == 10310) && buff.totalUses > 0) {
              gotAtLeastOneLayOnHands = true;
              LayOnHandsOnTrash = buff.bands.length;
            } else if ((buff.guid == 16190 || buff.guid == 17359 || buff.guid == 17354) && buff.totalUses > 0) {
              gotAtLeastOneManaTideTotem = true;
              ManaTideTotemOnTrash = buff.bands.length;
            } else if ((buff.guid == 1857) && buff.totalUses > 0) {
              gotAtLeastOneVanish = true;
              VanishOnTrash = buff.bands.length;
            }
          })
          playerDataTrash.entries.forEach(function (spell, spellCount) {
            if (playerByNameAsc.type == "Priest" && (spell.guid == 10060) && spell.total > 0) {
              gotAtLeastOnePI = true;
              PIonTrash = spell.total;
            } else if (playerByNameAsc.type == "Druid" && (spell.guid == 29166) && spell.total > 0) {
              gotAtLeastOneInnervate = true;
              InnervateOnTrash = spell.total;
            } else if ((spell.guid == 12042 || spell.guid == 28682) && spell.total > 0) {
              gotAtLeastOneAPComb = true;
              APCombonTrash = spell.total;
            } else if ((spell.guid == 12051) && spell.total > 0) {
              gotAtLeastOneEvocation = true;
              EvocationOnTrash = spell.total;
            } else if ((spell.guid == 1161) && spell.total > 0) {
              gotAtLeastOneChallengingShout = true;
              ChallengingShoutOnTrash = spell.total;
            } else if ((spell.guid == 2687) && spell.total > 0) {
              gotAtLeastOneBloodrage = true;
              BloodrageOnTrash = spell.total;
            } else if ((spell.guid == 12328) && spell.total > 0) {
              gotAtLeastOneDeathWish = true;
              DeathWishOnTrash = spell.total;
            } else if ((spell.guid == 12975) && spell.total > 0) {
              gotAtLeastOneLastStand = true;
              LastStandOnTrash = spell.total;
            } else if ((spell.guid == 20230) && spell.total > 0) {
              gotAtLeastOneRetaliation = true;
              RetaliationOnTrash = spell.total;
            } else if ((spell.guid == 17116 || spell.guid == 16188) && spell.total > 0) {
              gotAtLeastOneNaturesSwiftness = true;
              NaturesSwiftnessOnTrash = spell.total;
            } else if ((spell.guid == 5209) && spell.total > 0) {
              gotAtLeastOneChallengingRoar = true;
              ChallengingRoarOnTrash = spell.total;
            } else if ((spell.guid == 16166) && spell.total > 0) {
              gotAtLeastOneElementalMastery = true;
              ElementalMasteryOnTrash = spell.total;
            } else if ((spell.guid == 20748) && spell.total > 0) {
              gotAtLeastOneRebirth = true;
              RebirthOnTrash = spell.total;
            } else if ((spell.guid == 1719) && spell.total > 0) {
              gotAtLeastOneRecklessness = true;
              RecklessnessOnTrash = spell.total;
            } else if ((spell.guid == 871) && spell.total > 0) {
              gotAtLeastOneShieldWall = true;
              ShieldWallOnTrash = spell.total;
            } else if ((spell.guid == 3045) && spell.total > 0) {
              gotAtLeastOneRapidFire = true;
              RapidFireOnTrash = spell.total;
            } else if ((spell.guid == 23989) && spell.total > 0) {
              gotAtLeastOneReadiness = true;
              ReadinessOnTrash = spell.total;
            } else if ((spell.guid == 19263) && spell.total > 0) {
              gotAtLeastOneDeterrence = true;
              DeterrenceOnTrash = spell.total;
            } else if ((spell.guid == 19574) && spell.total > 0) {
              gotAtLeastOneBestialWrath = true;
              BestialWrathOnTrash = spell.total;
            } else if ((spell.guid == 14751) && spell.total > 0) {
              gotAtLeastOneInnerFocus = true;
              InnerFocusOnTrash = spell.total;
            } else if ((spell.guid == 10278) && spell.total > 0) {
              gotAtLeastOneBoP = true;
              BoPOnTrash = spell.total;
            } else if ((spell.guid == 20216) && spell.total > 0) {
              gotAtLeastOneDivineFavor = true;
              DivineFavorOnTrash = spell.total;
            } else if ((spell.guid == 19752) && spell.total > 0) {
              gotAtLeastOneDivineIntervention = true;
              DivineInterventionOnTrash = spell.total;
            } else if ((spell.guid == 1020) && spell.total > 0) {
              gotAtLeastOneDivineShield = true;
              DivineShieldOnTrash = spell.total;
            } else if ((spell.guid == 5573) && spell.total > 0) {
              gotAtLeastOneDivineProtection = true;
              DivineProtectionOnTrash = spell.total;
            } else if ((spell.guid == 10310) && spell.total > 0) {
              gotAtLeastOneLayOnHands = true;
              LayOnHandsOnTrash = spell.total;
            } else if ((spell.guid == 16190 || spell.guid == 17359 || spell.guid == 17354) && spell.total > 0) {
              gotAtLeastOneManaTideTotem = true;
              ManaTideTotemOnTrash = spell.total;
            } else if ((spell.guid == 1857) && spell.total > 0) {
              gotAtLeastOneVanish = true;
              VanishOnTrash = spell.total;
            } else if ((spell.guid == 9863) && spell.total > 0) {
              gotAtLeastOneTranquility = true;
              TranquilityOnTrash = spell.total;
            } else if ((spell.guid == 19280) && spell.total > 0) {
              gotAtLeastOneDevouringPlague = true;
              DevouringPlagueOnTrash = spell.total;
            } else if ((spell.guid == 19243) && spell.total > 0) {
              gotAtLeastOneDesperatePrayer = true;
              DesperatePrayerOnTrash = spell.total;
            }
          })
        }

        playerData.entries.forEach(function (spellSelf, spellSelfCount) {
          if (spellSelf.guid == 10060 && spellSelf.total > 0 && spellSelf.targets != null && spellSelf.targets.length > 0) {
            spellSelf.targets.forEach(function (spellSelfTarget, spellSelfTargetCount) {
              if (spellSelfTarget.name == playerByNameAsc.name) {
                gotAtLeastOnePI = true;
                PIOnBossesSelf = spellSelfTarget.total - PIonTrashSelf;
              }
            })
          } else if (spellSelf.guid == 29166 && spellSelf.total > 0 && spellSelf.targets != null && spellSelf.targets.length > 0) {
            spellSelf.targets.forEach(function (spellSelfTarget, spellSelfTargetCount) {
              if (spellSelfTarget.name == playerByNameAsc.name) {
                gotAtLeastOneInnervate = true;
                InnervateOnBossesSelf = spellSelfTarget.total - InnervateOnTrashSelf;
              }
            })
          }
        })

        var PIoverwrittenWithCasts = false;
        var InnervateUsedBySelf = false;
        buffsData.auras.forEach(function (buff, buffCount) {
          if (buff.guid == 10060 && buff.totalUses > 0) {
            gotAtLeastOnePI = true;
            PITotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            PIOnBosses = buff.bands.length - PIonTrash;
          } else if ((buff.guid == 12042 || buff.guid == 28682) && buff.totalUses > 0) {
            gotAtLeastOneAPComb = true;
            APCombTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            APCombOnBosses = buff.bands.length - APCombonTrash;
          } else if ((buff.guid == 12051) && buff.totalUses > 0) {
            gotAtLeastOneEvocation = true;
            EvocationTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            EvocationOnBosses = buff.bands.length - EvocationOnTrash;
          } else if ((buff.guid == 5277) && buff.totalUses > 0) {
            gotAtLeastOneEvasion = true;
            EvasionTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            EvasionOnBosses = buff.bands.length - EvasionOnTrash;
          } else if ((buff.guid == 13750) && buff.totalUses > 0) {
            gotAtLeastOneAdrenalineRush = true;
            AdrenalineRushTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            AdrenalineRushOnBosses = buff.bands.length - AdrenalineRushOnTrash;
          } else if ((buff.guid == 18499) && buff.totalUses > 0) {
            gotAtLeastOneBerserkerRage = true;
            BerserkerRageTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            BerserkerRageOnBosses = buff.bands.length - BerserkerRageOnTrash;
          } else if ((buff.guid == 2687) && buff.totalUses > 0) {
            gotAtLeastOneBloodrage = true;
            BloodrageTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            BloodrageOnBosses = buff.bands.length - BloodrageOnTrash;
          } else if ((buff.guid == 1161) && buff.totalUses > 0) {
            gotAtLeastOneChallengingShout = true;
            ChallengingShoutTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            ChallengingShoutOnBosses = buff.bands.length - ChallengingShoutOnTrash;
          } else if ((buff.guid == 12328) && buff.totalUses > 0) {
            gotAtLeastOneDeathWish = true;
            DeathWishTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            DeathWishOnBosses = buff.bands.length - DeathWishOnTrash;
          } else if ((buff.guid == 12975) && buff.totalUses > 0) {
            gotAtLeastOneLastStand = true;
            LastStandTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            LastStandOnBosses = buff.bands.length - LastStandOnTrash;
          } else if ((buff.guid == 1719) && buff.totalUses > 0) {
            gotAtLeastOneRecklessness = true;
            RecklessnessTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            RecklessnessOnBosses = buff.bands.length - RecklessnessOnTrash;
          } else if ((buff.guid == 20230) && buff.totalUses > 0) {
            gotAtLeastOneRetaliation = true;
            RetaliationTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            RetaliationOnBosses = buff.bands.length - RetaliationOnTrash;
          } else if ((buff.guid == 871) && buff.totalUses > 0) {
            gotAtLeastOneShieldWall = true;
            ShieldWallTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            ShieldWallOnBosses = buff.bands.length - ShieldWallOnTrash;
          } else if ((buff.guid == 17116 || buff.guid == 16188) && buff.totalUses > 0) {
            gotAtLeastOneNaturesSwiftness = true;
            NaturesSwiftnessTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            NaturesSwiftnessOnBosses = buff.bands.length - NaturesSwiftnessOnTrash;
          } else if ((buff.guid == 20748) && buff.totalUses > 0) {
            gotAtLeastOneRebirth = true;
            RebirthTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            RebirthOnBosses = buff.bands.length - RebirthOnTrash;
          } else if ((buff.guid == 5209) && buff.totalUses > 0) {
            gotAtLeastOneChallengingRoar = true;
            ChallengingRoarTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            ChallengingRoarOnBosses = buff.bands.length - ChallengingRoarOnTrash;
          } else if ((buff.guid == 9821) && buff.totalUses > 0) {
            gotAtLeastOneDash = true;
            DashTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            DashOnBosses = buff.bands.length - DashOnTrash;
          } else if ((buff.guid == 22896) && buff.totalUses > 0) {
            gotAtLeastOneFrenziedRegeneration = true;
            FrenziedRegenerationTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            FrenziedRegenerationOnBosses = buff.bands.length - FrenziedRegenerationOnTrash;
          } else if ((buff.guid == 29166) && buff.totalUses > 0) {
            gotAtLeastOneInnervate = true;
            InnervateTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            InnervateOnBosses = buff.bands.length - InnervateOnTrash;
          } else if ((buff.guid == 3045) && buff.totalUses > 0) {
            gotAtLeastOneRapidFire = true;
            RapidFireTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            RapidFireOnBosses = buff.bands.length - RapidFireOnTrash;
          } else if ((buff.guid == 23989) && buff.totalUses > 0) {
            gotAtLeastOneReadiness = true;
            ReadinessTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            ReadinessOnBosses = buff.bands.length - ReadinessOnTrash;
          } else if ((buff.guid == 19263) && buff.totalUses > 0) {
            gotAtLeastOneDeterrence = true;
            DeterrenceTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            DeterrenceOnBosses = buff.bands.length - DeterrenceOnTrash;
          } else if ((buff.guid == 19574) && buff.totalUses > 0) {
            gotAtLeastOneBestialWrath = true;
            BestialWrathTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            BestialWrathOnBosses = buff.bands.length - BestialWrathOnTrash;
          } else if ((buff.guid == 14751) && buff.totalUses > 0) {
            gotAtLeastOneInnerFocus = true;
            InnerFocusTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            InnerFocusOnBosses = buff.bands.length - InnerFocusOnTrash;
          } else if ((buff.guid == 10278) && buff.totalUses > 0) {
            gotAtLeastOneBoP = true;
            BoPTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            BoPOnBosses = buff.bands.length - BoPOnTrash;
          } else if ((buff.guid == 20216) && buff.totalUses > 0) {
            gotAtLeastOneDivineFavor = true;
            DivineFavorTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            DivineFavorOnBosses = buff.bands.length - DivineFavorOnTrash;
          } else if ((buff.guid == 19752) && buff.totalUses > 0) {
            gotAtLeastOneDivineIntervention = true;
            DivineInterventionTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            DivineInterventionOnBosses = buff.bands.length - DivineInterventionOnTrash;
          } else if ((buff.guid == 1020) && buff.totalUses > 0) {
            gotAtLeastOneDivineShield = true;
            DivineShieldTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            DivineShieldOnBosses = buff.bands.length - DivineShieldOnTrash;
          } else if ((buff.guid == 5573) && buff.totalUses > 0) {
            gotAtLeastOneDivineProtection = true;
            DivineProtectionTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            DivineProtectionOnBosses = buff.bands.length - DivineProtectionOnTrash;
          } else if ((buff.guid == 10310) && buff.totalUses > 0) {
            gotAtLeastOneLayOnHands = true;
            LayOnHandsTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            LayOnHandsOnBosses = buff.bands.length - LayOnHandsOnTrash;
          } else if ((buff.guid == 16190 || buff.guid == 17359 || buff.guid == 17354) && buff.totalUses > 0) {
            gotAtLeastOneManaTideTotem = true;
            ManaTideTotemTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            ManaTideTotemOnBosses = buff.bands.length - ManaTideTotemOnTrash;
          } else if ((buff.guid == 1857) && buff.totalUses > 0) {
            gotAtLeastOneVanish = true;
            VanishTotalUptime = buff.totalUptime * 100 / Math.abs(raidDuration);
            VanishOnBosses = buff.bands.length - VanishOnTrash;
          } else if ((buff.guid == 17540) && buff.totalUses > 0) {
            GreaterStoneshieldUses = buff.bands.length;
          } else if ((buff.guid == 24364 || buff.guid == 6615) && buff.totalUses > 0) {
            FAPUses = buff.bands.length;
          } else if ((buff.guid == 3169) && buff.totalUses > 0) {
            LIPUses = buff.bands.length;
          } else if ((buff.guid == 11359) && buff.totalUses > 0) {
            RestorativeUses = buff.bands.length;
          }
        })

        var usedIceblockOrIceBarrier = false;
        var usedFireVulnerabilityOrBlastWave = false;
        playerData.entries.forEach(function (spell, spellCount) {
          if (playerByNameAsc.type == "Priest" && spell.guid == 10060 && spell.total > 0) {
            gotAtLeastOnePI = true;
            PITotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            PIOnBosses = spell.total - PIonTrash;
            PIoverwrittenWithCasts = true;
          } else if (playerByNameAsc.type == "Druid" && (spell.guid == 29166) && spell.total > 0) {
            gotAtLeastOneInnervate = true;
            InnervateTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            InnervateOnBosses = spell.total - InnervateOnTrash;
            InnervateUsedBySelf = true;
          } else if ((spell.guid == 12042 || spell.guid == 28682) && spell.total > 0) {
            gotAtLeastOneAPComb = true;
            APCombTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            APCombOnBosses = spell.total - APCombonTrash;
          } else if ((spell.guid == 12051) && spell.total > 0) {
            gotAtLeastOneEvocation = true;
            EvocationTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            EvocationOnBosses = spell.total - EvocationOnTrash;
          } else if ((spell.guid == 1161) && spell.total > 0) {
            gotAtLeastOneChallengingShout = true;
            ChallengingShoutTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            ChallengingShoutOnBosses = spell.total - ChallengingShoutOnTrash;
          } else if ((spell.guid == 2687) && spell.total > 0) {
            gotAtLeastOneBloodrage = true;
            BloodrageTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            BloodrageOnBosses = spell.total - BloodrageOnTrash;
          } else if ((spell.guid == 12328) && spell.total > 0) {
            gotAtLeastOneDeathWish = true;
            DeathWishTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DeathWishOnBosses = spell.total - DeathWishOnTrash;
          } else if ((spell.guid == 12975) && spell.total > 0) {
            gotAtLeastOneLastStand = true;
            LastStandTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            LastStandOnBosses = spell.total - LastStandOnTrash;
          } else if ((spell.guid == 20230) && spell.total > 0) {
            gotAtLeastOneRetaliation = true;
            RetaliationTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            RetaliationOnBosses = spell.total - RetaliationOnTrash;
          } else if ((spell.guid == 17116 || spell.guid == 16188) && spell.total > 0) {
            gotAtLeastOneNaturesSwiftness = true;
            NaturesSwiftnessTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            NaturesSwiftnessOnBosses = spell.total - NaturesSwiftnessOnTrash;
          } else if ((spell.guid == 16166) && spell.total > 0) {
            gotAtLeastOneElementalMastery = true;
            ElementalMasteryTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            ElementalMasteryOnBosses = spell.total - ElementalMasteryOnTrash;
          } else if ((spell.guid == 20748) && spell.total > 0) {
            gotAtLeastOneRebirth = true;
            RebirthTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            RebirthOnBosses = spell.total - RebirthOnTrash;
          } else if ((spell.guid == 5209) && spell.total > 0) {
            gotAtLeastOneChallengingRoar = true;
            ChallengingRoarTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            ChallengingRoarOnBosses = spell.total - ChallengingRoarOnTrash;
          } else if ((spell.guid == 3045) && spell.total > 0) {
            gotAtLeastOneRapidFire = true;
            RapidFireTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            RapidFireOnBosses = spell.total - RapidFireOnTrash;
          } else if ((spell.guid == 23989) && spell.total > 0) {
            gotAtLeastOneReadiness = true;
            ReadinessTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            ReadinessOnBosses = spell.total - ReadinessOnTrash;
          } else if ((spell.guid == 19263) && spell.total > 0) {
            gotAtLeastOneDeterrence = true;
            DeterrenceTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DeterrenceOnBosses = spell.total - DeterrenceOnTrash;
          } else if ((spell.guid == 19574) && spell.total > 0) {
            gotAtLeastOneBestialWrath = true;
            BestialWrathTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            BestialWrathOnBosses = spell.total - BestialWrathOnTrash;
          } else if ((spell.guid == 14751) && spell.total > 0) {
            gotAtLeastOneInnerFocus = true;
            InnerFocusTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            InnerFocusOnBosses = spell.total - InnerFocusOnTrash;
          } else if ((spell.guid == 10278) && spell.total > 0) {
            gotAtLeastOneBoP = true;
            BoPTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            BoPOnBosses = spell.total - BoPOnTrash;
          } else if ((spell.guid == 20216) && spell.total > 0) {
            gotAtLeastOneDivineFavor = true;
            DivineFavorTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DivineFavorOnBosses = spell.total - DivineFavorOnTrash;
          } else if ((spell.guid == 19752) && spell.total > 0) {
            gotAtLeastOneDivineIntervention = true;
            DivineInterventionTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DivineInterventionOnBosses = spell.total - DivineInterventionOnTrash;
          } else if ((spell.guid == 5573) && spell.total > 0) {
            gotAtLeastOneDivineProtection = true;
            DivineProtectionTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DivineProtectionOnBosses = spell.total - DivineProtectionOnTrash;
          } else if ((spell.guid == 1020) && spell.total > 0) {
            gotAtLeastOneDivineShield = true;
            DivineShieldTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DivineShieldOnBosses = spell.total - DivineShieldOnTrash;
          } else if ((spell.guid == 1719) && spell.total > 0) {
            gotAtLeastOneRecklessness = true;
            RecklessnessTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            RecklessnessOnBosses = spell.total - RecklessnessOnTrash;
          } else if ((spell.guid == 871) && spell.total > 0) {
            gotAtLeastOneShieldWall = true;
            ShieldWallTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            ShieldWallOnBosses = spell.total - ShieldWallOnTrash;
          } else if ((spell.guid == 10310) && spell.total > 0) {
            gotAtLeastOneLayOnHands = true;
            LayOnHandsTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            LayOnHandsOnBosses = spell.total - LayOnHandsOnTrash;
          } else if ((spell.guid == 16190 || spell.guid == 17359 || spell.guid == 17354) && spell.total > 0) {
            gotAtLeastOneManaTideTotem = true;
            ManaTideTotemTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            ManaTideTotemOnBosses = spell.total - ManaTideTotemOnTrash;
          } else if ((spell.guid == 1857) && spell.total > 0) {
            gotAtLeastOneVanish = true;
            VanishTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            VanishOnBosses = spell.total - VanishOnTrash;
          } else if ((spell.guid == 9863) && spell.total > 0) {
            gotAtLeastOneTranquility = true;
            TranquilityTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            TranquilityOnBosses = spell.total - TranquilityOnTrash;
          } else if ((spell.guid == 19280) && spell.total > 0) {
            gotAtLeastOneDevouringPlague = true;
            DevouringPlagueTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DevouringPlagueOnBosses = spell.total - DevouringPlagueOnTrash;
          } else if ((spell.guid == 19243) && spell.total > 0) {
            gotAtLeastOneDesperatePrayer = true;
            DesperatePrayerTotalUptime = spell.uptime * 100 / Math.abs(raidDuration);
            DesperatePrayerOnBosses = spell.total - DesperatePrayerOnTrash;
          } else if (playerByNameAsc.type == "Mage") {
            if (spell.guid == 13021 && spell.total > 0)
              usedFireVulnerabilityOrBlastWave = true;
            else if (spell.guid == 13033 && spell.total > 0)
              usedIceblockOrIceBarrier = true;
            else if (spell.guid == 11958 && spell.total > 0)
              usedIceblockOrIceBarrier = true;
          }
        })

        var usedArcaniteDragonling = 0;
        if (damageDoneData.toString().indexOf('"id":16022') > -1)
          usedArcaniteDragonling = 1;

        var activePercentageTotal = 0;
        allPlayersCasting.entries.forEach(function (playerCasting, playerCastingCount) {
          if (playerCasting.name == playerByNameAsc.name) {
            activePercentageTotal = Math.round(playerCasting.activeTime * 100 / allPlayersCasting.totalTime);
          }
        })

        var activePercentageTotalOnTrash = 0;
        if (onlyTrash || (!onlyBosses && (onlyFightNr == null || onlyFightNr.toString().length == 0))) {
          allPlayersCastingOnTrash.entries.forEach(function (playerCasting, playerCastingCount) {
            if (playerCasting.name == playerByNameAsc.name) {
              activePercentageTotalOnTrash = Math.round(playerCasting.activeTime * 100 / allPlayersCastingOnTrash.totalTime);
            }
          })
        }

        var usedTemporaryWeaponEnchant = 0;
        var atLeastOneConsecrationItem = "no";
        var found = 0;
        var total = 0;
        var healerCount = 0;
        var dpsCount = 0;
        var dpsSpec = "";
        var tankCount = 0;
        bossSummaryDataAll.forEach(function (bossSummaryData, bossSummaryDataCount) {
          bossSummaryData.composition.forEach(function (raidMember, raidMemberCount) {
            if (raidMember.id == playerByNameAsc.id) {
              raidMember.specs.forEach(function (playerSpec, playerSpecCount) {
                if (playerSpec.role != null && playerSpec.role.toString().length > 0) {
                  if (playerSpec.role == "healer")
                    healerCount++;
                  else if (playerSpec.role == "dps") {
                    dpsCount++;
                    if (playerSpec.spec != null && playerSpec.spec.toString().length > 0)
                      dpsSpec = playerSpec.spec;
                  } else if (playerSpec.role == "tank")
                    tankCount++;
                }
              })
            }
          })
          var increaseTotal = false;
          var increaseFound = false;
          if (increaseTotal == false && bossSummaryData.playerDetails != null && bossSummaryData.playerDetails.dps != null && bossSummaryData.playerDetails.dps.length > 0) {
            bossSummaryData.playerDetails.dps.forEach(function (playerInfo, playerInfoCount) {
              if (playerInfo.name == playerByNameAsc.name) {
                if (playerInfo.combatantInfo != null && playerInfo.combatantInfo.gear != null) {
                  increaseTotal = true;
                  playerInfo.combatantInfo.gear.forEach(function (item, itemCount) {
                    if (item.slot.toString() == "15" || item.slot.toString() == "16") {
                      if (item.temporaryEnchantName != null && item.temporaryEnchantName.length != null && item.temporaryEnchantName.length > 0) {
                        if (item.temporaryEnchant.toString() == "2684" || item.temporaryEnchant.toString() == "2685")
                          atLeastOneConsecrationItem = "yes";
                        increaseFound = true;
                      }
                    }
                  })
                }
              }
            })
          }
          if (increaseTotal == false && bossSummaryData.playerDetails != null && bossSummaryData.playerDetails.healers != null && bossSummaryData.playerDetails.healers.length > 0) {
            bossSummaryData.playerDetails.healers.forEach(function (playerInfo, playerInfoCount) {
              if (playerInfo.name == playerByNameAsc.name) {
                if (playerInfo.combatantInfo != null && playerInfo.combatantInfo.gear != null) {
                  increaseTotal = true;
                  playerInfo.combatantInfo.gear.forEach(function (item, itemCount) {
                    if (item.slot.toString() == "15" || item.slot.toString() == "16") {
                      if (item.temporaryEnchantName != null && item.temporaryEnchantName.length != null && item.temporaryEnchantName.length > 0) {
                        if (item.temporaryEnchant.toString() == "2684" || item.temporaryEnchant.toString() == "2685")
                          atLeastOneConsecrationItem = "yes";
                        increaseFound = true;
                      }
                    }
                  })
                }
              }
            })
          }
          if (increaseTotal == false && bossSummaryData.playerDetails != null && bossSummaryData.playerDetails.tanks != null && bossSummaryData.playerDetails.tanks.length > 0) {
            bossSummaryData.playerDetails.tanks.forEach(function (playerInfo, playerInfoCount) {
              if (playerInfo.name == playerByNameAsc.name) {
                if (playerInfo.combatantInfo != null && playerInfo.combatantInfo.gear != null) {
                  increaseTotal = true;
                  playerInfo.combatantInfo.gear.forEach(function (item, itemCount) {
                    if (item.slot.toString() == "15" || item.slot.toString() == "16") {
                      if (item.temporaryEnchantName != null && item.temporaryEnchantName.length != null && item.temporaryEnchantName.length > 0) {
                        if (item.temporaryEnchant.toString() == "2684" || item.temporaryEnchant.toString() == "2685")
                          atLeastOneConsecrationItem = "yes";
                        increaseFound = true;
                      }
                    }
                  })
                }
              }
            })
          }
          if (increaseFound)
            found++;
          else if (playerByNameAsc.type == "Rogue" && increaseTotal) {
            bossDamageDataAll[total].entries.forEach(function (bossDamageData, bossDamageDataCount) {
              if (bossDamageData != null && bossDamageData.id != null && bossDamageData.id == playerByNameAsc.id) {
                found++;
              }
            })
          }
          if (increaseTotal)
            total++;
        })
        if ((zoneFound == "1006" || zoneFound == "2006"))
          usedTemporaryWeaponEnchant = Math.round(found * 100 / total) + "% (" + atLeastOneConsecrationItem + ")";
        else
          usedTemporaryWeaponEnchant = Math.round(found * 100 / total) + "%";

        //fill in single target casts
        if (singleTargetCastsToTrack != null) {
          var singleTargetTotalTime = 0;
          singleTargetCastsToTrack.forEach(function (singleTargetCast, singleTargetCastCount) {
            var amount = 0;
            var amountOmitted = 0;
            var uptime = 0;
            var overheal = 0;
            var debuffIdString = "";
            var lowerRankUsed = 0;
            if (singleTargetCast.indexOf("(Fire Vuln") > -1)
              debuffIdString = "22959";
            else if (singleTargetCast.indexOf("(Shadow Vuln") > -1)
              debuffIdString = "15258";
            else if (singleTargetCast.indexOf("(WC") > -1)
              debuffIdString = "12579";
            else if (singleTargetCast.indexOf("(Flurry") > -1)
              debuffIdString = "12970";
            else if (singleTargetCast.indexOf("(Deep Wounds") > -1)
              debuffIdString = "12721";
            else
              singleTargetCast.split("[")[1].split("]")[0].split(",").forEach(function (stCast, stCastCount) {
                if (stCast.indexOf("*") < 0)
                  debuffIdString = stCast;
              })
            var singleTargetCastString = "";
            if (previousClass != playerByNameAsc.type) {
              if (singleTargetCastCount == 0) {
                copyRowStyles(conf, sheet, confSingleTargetCastsToTrack, singleTargetCastsToTrack.length, singleTargetCasts.getRow() + 1, singleTargetCasts.getColumn() + playerDoneCount + classDoneCount, playersInThisClass, false, "left", darkMode);
                var confColumnWidth = conf.getColumnWidth(confSingleTargetCastsToTrack.getColumn());
                if (confColumnWidth > maxColumnWidth) {
                  maxColumnWidth = confColumnWidth;
                }
              }
              singleTargetCastString = singleTargetCast.split(" [")[0].split(" {")[0]
              if (singleTargetCast.indexOf("Slice and Dice") < 0 && singleTargetCast.indexOf("Battle Shout") < 0 && singleTargetCast.indexOf("Commanding Shout") < 0 && singleTargetCast.indexOf("Earth Shield") < 0) {
                if (!onlyTrash && singleTargetCast.indexOf("uptime") > -1 && singleTargetCast.indexOf("total") < 0 && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  singleTargetCastString = singleTargetCastString.replace("%)", "% - overall: " + getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedDataBossesTotal, totalTimeElapsedBosses) + "%)");
                } else if (singleTargetCast.indexOf("uptime") > -1) {
                  if (debuffIdString != "12970")
                    singleTargetCastString = singleTargetCastString.replace("%)", "% - overall: " + getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedDataTotal, totalTimeElapsedRaw) + "%)");
                }
              }
              singleTargetCastsArr[singleTargetCastCount + 1][playerDoneCount + classDoneCount] = singleTargetCastString;
            }
            if (singleTargetCast.indexOf("Melee") > -1 || singleTargetCast.indexOf("Execute") > -1 || singleTargetCast.indexOf("Auto Shot") > -1) {
              damageDoneData.entries.forEach(function (damDone, damDoneCount) {
                if (singleTargetCast.indexOf("[") > -1) {
                  singleTargetCast.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                    if (spellId.replace("*", "") == damDone.guid.toString()) {
                      if (singleTargetCast.indexOf("Melee") > -1 || singleTargetCast.indexOf("Auto Shot") > -1) {
                        if (damDone.uses && damDone.uses > 0)
                          amount += damDone.uses;
                      } else {
                        if (damDone.hitCount != null && damDone.hitCount > 0) {
                          amount += damDone.hitCount;
                          if (spellId.indexOf("*") > -1 || ((zoneFound == "1006" || zoneFound == "2006" || zoneFound == "1005" || zoneFound == "2005") && (spellId.toString() == "14322" || spellId.toString() == "9876" || spellId.toString() == "14290" || spellId.toString() == "13555" || spellId.toString() == "10274" || spellId.toString() == "10151" || spellId.toString() == "10181" || spellId.toString() == "19838" || spellId.toString() == "25782" || spellId.toString() == "19854" || spellId.toString() == "25894" || spellId.toString() == "11281" || spellId.toString() == "11303" || spellId.toString() == "10627" || spellId.toString() == "10442" || spellId.toString() == "11672" || spellId.toString() == "11668" || spellId.toString() == "11661" || spellId.toString() == "11551" || spellId.toString() == "11601" || spellId.toString() == "11567")))
                            lowerRankUsed += damDone.hitCount;
                        }
                        if (damDone.missCount != null && damDone.missCount > 0) {
                          amount += damDone.missCount;
                          if (spellId.indexOf("*") > -1 || ((zoneFound == "1006" || zoneFound == "2006" || zoneFound == "1005" || zoneFound == "2005") && (spellId.toString() == "14322" || spellId.toString() == "9876" || spellId.toString() == "14290" || spellId.toString() == "13555" || spellId.toString() == "10274" || spellId.toString() == "10151" || spellId.toString() == "10181" || spellId.toString() == "19838" || spellId.toString() == "25782" || spellId.toString() == "19854" || spellId.toString() == "25894" || spellId.toString() == "11281" || spellId.toString() == "11303" || spellId.toString() == "10627" || spellId.toString() == "10442" || spellId.toString() == "11672" || spellId.toString() == "11668" || spellId.toString() == "11661" || spellId.toString() == "11551" || spellId.toString() == "11601" || spellId.toString() == "11567")))
                            lowerRankUsed += damDone.missCount;
                        }
                      }
                    }
                  })
                }
              })
            } else if (singleTargetCast.indexOf("[99999]") > -1) {
              playerDataSunderArmorOnLessThan5Stacks.entries.forEach(function (spellSA5, spellSA5Count) {
                if (spellSA5.id == playerByNameAsc.id) {
                  amount = spellSA5.total;
                  var saCastsOverall = 0;
                  playerData.entries.forEach(function (spell, spellCount) {
                    if (spell.guid.toString() == "11597")
                      saCastsOverall = spell.total;
                  })
                  uptime = Math.round(spellSA5.total * 100 / saCastsOverall) * spellSA5.total;
                }
              })
            } else if (singleTargetCast.indexOf("[99998]") > -1) {
              playerDataScorchOnLessThan5Stacks.entries.forEach(function (spellScorch5, spellScorch5Count) {
                if (spellScorch5.id == playerByNameAsc.id) {
                  amount = spellScorch5.total;
                  var scorchCastsOverall = 0;
                  playerData.entries.forEach(function (spell, spellCount) {
                    if (spell.guid.toString() == "10207" || spell.guid.toString() == "10206" || spell.guid.toString() == "10205" || spell.guid.toString() == "8446" || spell.guid.toString() == "8445" || spell.guid.toString() == "8444" || spell.guid.toString() == "2948")
                      scorchCastsOverall += spell.total;
                  })
                  uptime = Math.round(spellScorch5.total * 100 / scorchCastsOverall) * spellScorch5.total;
                }
              })
            } else {
              playerData.entries.forEach(function (spell, spellCount) {
                if (singleTargetCast.indexOf("[") > -1) {
                  singleTargetCast.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                    if ((spellId.indexOf("*") > 0 || ((zoneFound == "1006" || zoneFound == "2006" || zoneFound == "1005" || zoneFound == "2005") && (spellId.toString() == "14322" || spellId.toString() == "9876" || spellId.toString() == "14290" || spellId.toString() == "13555" || spellId.toString() == "10274" || spellId.toString() == "10151" || spellId.toString() == "10181" || spellId.toString() == "19838" || spellId.toString() == "25782" || spellId.toString() == "19854" || spellId.toString() == "25894" || spellId.toString() == "11281" || spellId.toString() == "11303" || spellId.toString() == "10627" || spellId.toString() == "10442" || spellId.toString() == "11672" || spellId.toString() == "11668" || spellId.toString() == "11661" || spellId.toString() == "11551" || spellId.toString() == "11601" || spellId.toString() == "11567"))) && (spellId.substring(0, spellId.length - 1) == spell.guid.toString() || spellId.toString() == spell.guid.toString()) && spell.total > 0) {
                      lowerRankUsed += spell.total;
                    }
                    spellId = spellId.replace("*", "");
                    if (singleTargetCast.indexOf("Hamstring") > -1) {
                      uptime = getUptimeForDebuffSpellId(debuffIdString, buffsData, totalTimeElapsedRaw);
                      if (uptime == 0)
                        uptime = getUptimeForDebuffSpellId("12969", buffsData, totalTimeElapsedRaw);
                      if (uptime == 0)
                        uptime = getUptimeForDebuffSpellId("12968", buffsData, totalTimeElapsedRaw);
                      if (uptime == 0)
                        uptime = getUptimeForDebuffSpellId("12967", buffsData, totalTimeElapsedRaw);
                      if (uptime == 0)
                        uptime = getUptimeForDebuffSpellId("12966", buffsData, totalTimeElapsedRaw);
                    } else if (singleTargetCast.indexOf("Shadow Vuln") > -1) {
                      uptime = getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedData, totalTimeElapsedRaw);
                    }
                    if (spellId == spell.guid.toString()) {
                      amount += spell.total;

                      if (!onlyTrash && singleTargetCast.indexOf("uptime") > -1 && singleTargetCast.indexOf("total") < 0 && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                        if (singleTargetCast.indexOf("Slice and Dice") > -1) {
                          playerDataBosses.entries.forEach(function (spellOnBoss, spellOnBossCount) {
                            if (spellOnBoss.guid == spell.guid)
                              uptime += Math.round(spellOnBoss.uptime * 100 / totalTimeElapsedBosses) * spell.total;
                          })
                        } else
                          uptime += getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedDataBosses, totalTimeElapsedBosses) * spell.total;
                      } else if (singleTargetCast.indexOf("uptime") > -1) {
                        if (singleTargetCast.indexOf("Slice and Dice") > -1 || singleTargetCast.indexOf("Battle Shout") > -1 || singleTargetCast.indexOf("Commanding Shout") > -1 || singleTargetCast.indexOf("Earth Shield") > -1) {
                          uptime += Math.round(spell.uptime * 100 / totalTimeElapsedRaw) * spell.total;
                        } else if (singleTargetCast.indexOf("Hamstring") > -1 || singleTargetCast.indexOf("Shadow Vuln") > -1) {
                          uptime = uptime;
                        } else {
                          uptime += getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedData, totalTimeElapsedRaw) * spell.total;
                        }
                      }

                      if (singleTargetCast.indexOf("(Fire Vuln") > -1 && uptime > 0)
                        usedFireVulnerabilityOrBlastWave = true;

                      if (singleTargetCast.indexOf("overheal") > -1) {
                        var idToCompare = spell.guid;
                        if (singleTargetCast.indexOf("all ranks") > -1) {
                          if (singleTargetCast.indexOf("Flash of Light") > -1)
                            idToCompare = 19993;
                          else if (singleTargetCast.indexOf("Holy Light") > - 1)
                            idToCompare = 19968;
                        }
                        healingData.entries.forEach(function (heal, healCount) {
                          if (idToCompare == heal.guid) {
                            var healed = 0;
                            if (heal.hitdetails != null) {
                              heal.hitdetails.forEach(function (hitData, hitDataCount) {
                                if (hitData.absorbOrOverheal != null)
                                  healed += hitData.absorbOrOverheal;
                              })
                            }
                            if (heal.overheal != null && heal.overheal > 0)
                              overheal += (heal.overheal * 100 / (heal.total + healed)) * spell.total;
                            else
                              amountOmitted += spell.total;
                          }
                        })
                      }

                      if (excludeBugTunnelActivity && fightName == "" && !onlyBosses && (zoneFound == "1005" || zoneFound == "2005")) {
                        playerBugTunnelData.entries.forEach(function (spellBugTunnel, spellBugTunnelCount) {
                          if (spellBugTunnel.guid == spell.guid)
                            amount -= spellBugTunnel.total;
                        })
                      }

                      if (excludeHeiganGauntletActivity && fightName == "" && !onlyBosses && (zoneFound == "1006" || zoneFound == "2006")) {
                        playerHeiganGauntletData.entries.forEach(function (spellHeiganGauntlet, spellHeiganGauntletCount) {
                          if (spellHeiganGauntlet.guid == spell.guid)
                            amount -= spellHeiganGauntlet.total;
                        })
                      }
                    }
                  })
                }
              })
            }
            if (amount > 0 && Math.round(lowerRankUsed * 100 / amount) > 50) {
              sheet.getRange(singleTargetCasts.getRow() + singleTargetCastCount + 1, singleTargetCasts.getColumn() + playerDoneCount + classDoneCount + 1, 1, 1).setFontWeight("bold").setFontStyle("italic").setFontColor("#980000");
            }
            if (amount == 0 && !(singleTargetCast.indexOf("uptime") > -1 && uptime > 0)) {
              if (singleTargetCast.length > 0)
                singleTargetCastsArr[singleTargetCastCount + 1][playerDoneCount + classDoneCount + 1] = "0";
            }
            else {
              if (singleTargetCast.indexOf("uptime") > -1 || singleTargetCast.indexOf("[99999]") > -1 || singleTargetCast.indexOf("[99998]") > -1) {
                if (singleTargetCast.indexOf("Hamstring") > -1 || singleTargetCast.indexOf("Shadow Vuln") > -1 || singleTargetCast.indexOf("Deep Wounds") > -1) {
                  singleTargetCastsArr[singleTargetCastCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + uptime + "%)";
                } else {
                  singleTargetCastsArr[singleTargetCastCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(uptime / amount) + "%)";
                }
              }
              else if (singleTargetCast.indexOf("overheal") > -1) {
                if ((amount - amountOmitted) > 0)
                  singleTargetCastsArr[singleTargetCastCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(overheal / (amount - amountOmitted)) + "%)";
                else
                  singleTargetCastsArr[singleTargetCastCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (0%)";
              } else
                singleTargetCastsArr[singleTargetCastCount + 1][playerDoneCount + classDoneCount + 1] = amount;
              if (singleTargetCast.indexOf("Fireball") > -1 && usedFireVulnerabilityOrBlastWave == false) {
                singleTargetTotalTime = singleTargetTotalTime + amount * Number(3.5);
              } else if (singleTargetCast.indexOf("Frostbolt (rank 2+)") > -1 && usedIceblockOrIceBarrier == true) {
                singleTargetTotalTime = singleTargetTotalTime + amount * Number(2.5);
              } else
                singleTargetTotalTime = singleTargetTotalTime + amount * Number(singleTargetCast.split("{")[1].split("}")[0]);
            }
          })
        }

        //fill in aoe casts
        var aoeTotalTime = 0;
        if (aoeCastsToTrack != null) {
          var aoeCastsDone = 0;
          var totalHits = 0;
          var totalCasts = 0;
          var doneEntries = [];
          aoeCastsToTrack.forEach(function (aoeCast, aoeCastCount) {
            var amount = 0;
            var amountOmitted = 0;
            var overheal = 0;
            var lowerRankUsed = 0;
            var hitsThisSpell = 0;
            var castsThisSpell = 0;
            if (previousClass != playerByNameAsc.type) {
              if (aoeCastCount == 0) {
                var confColumnWidth = conf.getColumnWidth(confAoeCastsToTrack.getColumn());
                if (confColumnWidth > maxColumnWidth) {
                  maxColumnWidth = confColumnWidth;
                }
                copyRowStyles(conf, sheet, confAoeCastsToTrack, aoeCastsToTrack.length, aoeCasts.getRow() + 1, aoeCasts.getColumn() + playerDoneCount + classDoneCount, playersInThisClass, false, "left", darkMode);
              }
              if (aoeCast.indexOf("Cleave") > -1 || aoeCast.indexOf("Whirlwind") > -1)
                aoeCastsArr[aoeCastCount + 1][playerDoneCount + classDoneCount] = aoeCast.split(" [")[0].split(" {")[0] + " (⌀)";
              else
                aoeCastsArr[aoeCastCount + 1][playerDoneCount + classDoneCount] = aoeCast.split(" [")[0].split(" {")[0];
            }
            playerData.entries.forEach(function (spell, spellCount) {
              if (aoeCast.indexOf("[") > -1) {
                aoeCast.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                  if ((spellId.indexOf("*") > 0 || ((zoneFound == "1006" || zoneFound == "2006" || zoneFound == "1005" || zoneFound == "2005") && (spellId.toString() == "14322" || spellId.toString() == "9876" || spellId.toString() == "14290" || spellId.toString() == "13555" || spellId.toString() == "10274" || spellId.toString() == "10151" || spellId.toString() == "10181" || spellId.toString() == "19838" || spellId.toString() == "25782" || spellId.toString() == "19854" || spellId.toString() == "25894" || spellId.toString() == "11281" || spellId.toString() == "11303" || spellId.toString() == "10627" || spellId.toString() == "10442" || spellId.toString() == "11672" || spellId.toString() == "11668" || spellId.toString() == "11661" || spellId.toString() == "11551" || spellId.toString() == "11601" || spellId.toString() == "11567"))) && (spellId.substring(0, spellId.length - 1) == spell.guid.toString() || spellId.toString() == spell.guid.toString()) && spell.total > 0) {
                    lowerRankUsed += spell.total;
                  }
                  spellId = spellId.replace("*", "");
                  if (spellId == spell.guid.toString()) {
                    var spellTotal = spell.total;
                    if (spell.total == 0 && spell.subentries != null && spell.subentries[0] != null && spell.subentries[0].total != null && spell.subentries[0].total > 0)
                      spellTotal = spell.subentries[0].total;
                    amount += spellTotal;

                    var dataToSearch = damageDoneData;
                    var dataToSearchTunnel = damageDoneBugTunnelData;
                    var dataToSearchHeiganGauntlet = damageDoneHeiganGauntletData;
                    if (aoeCast.indexOf("overheal") > -1) {
                      dataToSearch = healingData;
                      dataToSearchTunnel = healingTunnelData;
                      dataToSearchHeiganGauntlet = healingHeiganGauntletData;
                    }
                    dataToSearch.entries.forEach(function (damageSpell, damageSpellCount) {
                      if (damageSpell.guid == spell.guid || (spell.guid == 13877 && damageSpell.guid == 22482)) {
                        if (!doneEntries.includes(playerByNameAsc.name + ": " + damageSpell.guid + " - " + damageSpell.hitCount + " - " + damageSpell.uses)) {
                          doneEntries.push(playerByNameAsc.name + ": " + damageSpell.guid + " - " + damageSpell.hitCount + " - " + damageSpell.uses);
                          totalHits += damageSpell.hitCount;
                          if (damageSpell.missCount != null && damageSpell.missCount > 0)
                            totalHits += damageSpell.missCount;
                          totalCasts += spellTotal;
                          hitsThisSpell += damageSpell.hitCount;
                          if (damageSpell.missCount != null && damageSpell.missCount > 0)
                            hitsThisSpell += damageSpell.missCount;
                          castsThisSpell += spellTotal;
                        }
                      }
                    })

                    if (aoeCast.indexOf("overheal") > -1) {
                      var spellIdHeal = spell.guid;
                      if (spell.guid == 15237)
                        spellIdHeal = 23455;
                      else if (spell.guid == 15430)
                        spellIdHeal = 23458;
                      else if (spell.guid == 15431)
                        spellIdHeal = 23459;
                      else if (spell.guid == 27799)
                        spellIdHeal = 27803;
                      else if (spell.guid == 27800)
                        spellIdHeal = 27804;
                      else if (spell.guid == 27801)
                        spellIdHeal = 27805;
                      else if (spell.guid == 25331)
                        spellIdHeal = 25329;
                      else if (spell.guid == 48077)
                        spellIdHeal = 48075;
                      else if (spell.guid == 48078)
                        spellIdHeal = 48076;
                      healingData.entries.forEach(function (heal, healCount) {
                        if (spellIdHeal == heal.guid) {
                          var healed = 0;
                          if (heal.hitdetails != null) {
                            heal.hitdetails.forEach(function (hitData, hitDataCount) {
                              if (hitData.absorbOrOverheal != null)
                                healed += hitData.absorbOrOverheal;
                            })
                          }
                          if (heal.overheal != null && heal.overheal > 0)
                            overheal += (heal.overheal * 100 / (heal.total + healed)) * spellTotal;
                          else
                            amountOmitted += spellTotal;
                        }
                      })
                    }

                    if (excludeBugTunnelActivity && fightName == "" && !onlyBosses && (zoneFound == "1005" || zoneFound == "2005")) {
                      playerBugTunnelData.entries.forEach(function (spellBugTunnel, spellBugTunnelCount) {
                        if (spellBugTunnel.guid == spell.guid) {
                          var spellTotalBugTunnel = spellBugTunnel.total;
                          if (spellBugTunnel.total == 0 && spellBugTunnel.subentries != null && spellBugTunnel.subentries[0] != null && spellBugTunnel.subentries[0].total != null && spellBugTunnel.subentries[0].total > 0)
                            spellTotalBugTunnel = spellBugTunnel.subentries[0].total;
                          amount -= spellTotalBugTunnel;

                          dataToSearchTunnel.entries.forEach(function (damageSpellBugTunnel, damageSpellBugTunnelCount) {
                            if (damageSpellBugTunnel.guid == spellBugTunnel.guid) {
                              if (!doneEntries.includes(playerByNameAsc.name + ": bug tunnel - " + damageSpellBugTunnel.guid + " - " + damageSpellBugTunnel.name + " - " + damageSpellBugTunnel.hitCount + " - " + damageSpellBugTunnel.uses)) {
                                doneEntries.push(playerByNameAsc.name + ": bug tunnel - " + damageSpellBugTunnel.guid + " - " + damageSpellBugTunnel.name + " - " + damageSpellBugTunnel.hitCount + " - " + damageSpellBugTunnel.uses);
                                totalHits -= damageSpellBugTunnel.hitCount;
                                if (damageSpellBugTunnel.missCount != null && damageSpellBugTunnel.missCount > 0)
                                  totalHits -= damageSpellBugTunnel.missCount;
                                totalCasts -= spellBugTunnel.total;
                                hitsThisSpell -= damageSpellBugTunnel.hitCount;
                                if (damageSpellBugTunnel.missCount != null && damageSpellBugTunnel.missCount > 0)
                                  hitsThisSpell -= damageSpellBugTunnel.missCount;
                                castsThisSpell -= spellBugTunnel.total;
                              }
                            }
                          })
                        }
                      })
                    }

                    if (excludeHeiganGauntletActivity && fightName == "" && !onlyBosses && (zoneFound == "1006" || zoneFound == "2006")) {
                      playerHeiganGauntletData.entries.forEach(function (spellHeiganGauntlet, spellHeiganGauntletCount) {
                        if (spellHeiganGauntlet.guid == spell.guid) {
                          var spellTotalHeiganGauntlet = spellHeiganGauntlet.total;
                          if (spellHeiganGauntlet.total == 0 && spellHeiganGauntlet.subentries != null && spellHeiganGauntlet.subentries[0] != null && spellHeiganGauntlet.subentries[0].total != null && spellHeiganGauntlet.subentries[0].total > 0)
                            spellTotalHeiganGauntlet = spellHeiganGauntlet.subentries[0].total;
                          amount -= spellTotalHeiganGauntlet;

                          dataToSearchHeiganGauntlet.entries.forEach(function (damageSpellHeiganGauntlet, damageSpellHeiganGauntletCount) {
                            if (damageSpellHeiganGauntlet.guid == spellHeiganGauntlet.guid) {
                              if (!doneEntries.includes(playerByNameAsc.name + ": heigan gauntlet - " + damageSpellHeiganGauntlet.guid + " - " + damageSpellHeiganGauntlet.name + " - " + damageSpellHeiganGauntlet.hitCount + " - " + damageSpellHeiganGauntlet.uses)) {
                                doneEntries.push(playerByNameAsc.name + ": heigan gauntlet - " + damageSpellHeiganGauntlet.guid + " - " + damageSpellHeiganGauntlet.name + " - " + damageSpellHeiganGauntlet.hitCount + " - " + damageSpellHeiganGauntlet.uses);
                                totalHits -= damageSpellHeiganGauntlet.hitCount;
                                if (damageSpellHeiganGauntlet.missCount != null && damageSpellHeiganGauntlet.missCount > 0)
                                  totalHits -= damageSpellHeiganGauntlet.missCount;
                                totalCasts -= spellHeiganGauntlet.total;
                                hitsThisSpell -= damageSpellHeiganGauntlet.hitCount;
                                if (damageSpellHeiganGauntlet.missCount != null && damageSpellHeiganGauntlet.missCount > 0)
                                  hitsThisSpell -= damageSpellHeiganGauntlet.missCount;
                                castsThisSpell -= spellHeiganGauntlet.total;
                              }
                            }
                          })
                        }
                      })
                    }
                  }
                })
              }
            })
            if (amount > 0 && Math.round(lowerRankUsed * 100 / amount) > 50) {
              sheet.getRange(aoeCasts.getRow() + aoeCastCount + 1, aoeCasts.getColumn() + playerDoneCount + classDoneCount + 1, 1, 1).setFontWeight("bold").setFontStyle("italic").setFontColor("#980000");
            }
            if (amount == 0) {
              if (aoeCast.length > 0)
                aoeCastsArr[aoeCastCount + 1][playerDoneCount + classDoneCount + 1] = "0";
            }
            else {
              if (aoeCast.indexOf("overheal") > -1)
                aoeCastsArr[aoeCastCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(overheal / (amount - amountOmitted)) + "%)";
              else if (aoeCast.indexOf("Cleave") > -1 || aoeCast.indexOf("Whirlwind") > -1)
                aoeCastsArr[aoeCastCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(hitsThisSpell * 100 / castsThisSpell) / 100 + ")";
              else
                aoeCastsArr[aoeCastCount + 1][playerDoneCount + classDoneCount + 1] = amount;
              aoeTotalTime = aoeTotalTime + amount * Number(aoeCast.split("{")[1].split("}")[0]);
            }
            aoeCastsDone++;
          })
          //hit count of pulsing spells can't be retrieved
          if (showAverageOfHitsPerAoeCast && playerByNameAsc.type != "Druid" && playerByNameAsc.type != "Paladin" && playerByNameAsc.type != "Warlock") {
            if (previousClass != playerByNameAsc.type) {
              aoeCastsArr[aoeCastsDone + 1][playerDoneCount + classDoneCount] = "# of hits per aoe cast on average (⌀ )";
              copyRangeStyle(confShowAverageOfHitsPerAoeCast, sheet.getRange(aoeCasts.getRow() + aoeCastsDone + 1, aoeCasts.getColumn() + playerDoneCount + classDoneCount, 1, 1), null, "left", null);
              if (darkMode)
                sheet.getRange(aoeCasts.getRow() + aoeCastsDone + 1, aoeCasts.getColumn() + playerDoneCount + classDoneCount, 1, 1).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
              copyRangeStyle(confShowAverageOfHitsPerAoeCast, sheet.getRange(aoeCasts.getRow() + aoeCastsDone + 1, aoeCasts.getColumn() + playerDoneCount + classDoneCount + 1, 1, playersInThisClass), null, "center", null);
              if (darkMode)
                sheet.getRange(aoeCasts.getRow() + aoeCastsDone + 1, aoeCasts.getColumn() + playerDoneCount + classDoneCount + 1, 1, playersInThisClass).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
            }
            if (totalCasts == 0)
              aoeCastsArr[aoeCastsDone + 1][playerDoneCount + classDoneCount + 1] = 0;
            else
              aoeCastsArr[aoeCastsDone + 1][playerDoneCount + classDoneCount + 1] = "=" + totalHits + "/" + totalCasts;
          }
        }

        //fill in seconds active
        if (secondsActive != null) {
          if (secondsActiveArr.length == 1) {
            addSingleEntryToMultiDimArray(secondsActiveArr, "seconds active on single target"); addSingleEntryToMultiDimArray(secondsActiveArr, "relative active % on single target"); addSingleEntryToMultiDimArray(secondsActiveArr, "relative active % total");
            if (darkMode)
              sheet.getRange(secondsActive.getRow(), secondsActive.getColumn(), 1, maxColumns).setFontColor("#d9d9d9");
            else
              sheet.getRange(secondsActive.getRow(), secondsActive.getColumn(), 1, maxColumns).setFontColor("white");
            copyRangeStyle(confTotalAndInformationRowsDefaultTemplate, sheet.getRange(secondsActive.getRow() + 1, secondsActive.getColumn(), 1, maxColumns), null, "center", null);
            sheet.getRange(secondsActive.getRow() + 1, secondsActive.getColumn(), 1, maxColumns).setFontSize(confTotalAndInformationRowsDefaultTemplate.getFontSize()).setFontStyle(confTotalAndInformationRowsDefaultTemplate.getFontStyle()).setFontWeight(confTotalAndInformationRowsDefaultTemplate.getFontWeight()).setHorizontalAlignment("center");
            sheet.getRange(secondsActive.getRow() + 2, secondsActive.getColumn(), 1, maxColumns).setFontSize(confTotalAndInformationRowsDefaultTemplate.getFontSize()).setFontStyle(confTotalAndInformationRowsDefaultTemplate.getFontStyle()).setFontWeight(confTotalAndInformationRowsDefaultTemplate.getFontWeight()).setHorizontalAlignment("center");
            sheet.getRange(secondsActive.getRow() + 3, secondsActive.getColumn(), 1, maxColumns).setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center").setBorder(true, true, true, true, true, true, "#999999", SpreadsheetApp.BorderStyle.SOLID).setBackground("#b7b7b7");
            sheet.getRange(secondsActive.getRow() + 2, secondsActive.getColumn() + 1, 2, maxColumns).setNumberFormat("0%");
            addSingleEntryToMultiDimArray(secondsActiveArr, "relative active % on aoe"); addSingleEntryToMultiDimArray(secondsActiveArr, "seconds active on aoe");
            copyRangeStyle(confTotalAndInformationRowsDefaultTemplate, sheet.getRange(secondsActive.getRow() + 5, secondsActive.getColumn(), 1, maxColumns), null, "center", null);
            sheet.getRange(secondsActive.getRow() + 4, secondsActive.getColumn() + 1, 1, maxColumns).setNumberFormat("0%");
            sheet.getRange(secondsActive.getRow() + 4, secondsActive.getColumn(), 2, maxColumns).setFontSize(confTotalAndInformationRowsDefaultTemplate.getFontSize()).setFontStyle(confTotalAndInformationRowsDefaultTemplate.getFontStyle()).setFontWeight(confTotalAndInformationRowsDefaultTemplate.getFontWeight()).setHorizontalAlignment("center");
            if (showWCLActivePercentage) {
              if (activePercentageTotalOnTrash > 0 && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                addSingleEntryToMultiDimArray(secondsActiveArr, "active % overall from WarcraftLogs (trash %)");
              else
                addSingleEntryToMultiDimArray(secondsActiveArr, "active % overall from WarcraftLogs");
              addSingleEntryToMultiDimArray(secondsActiveArr, "");
              sheet.getRange(secondsActive.getRow() + 6, secondsActive.getColumn()).setHorizontalAlignment("center").setFontStyle("italic");
              sheet.getRange(secondsActive.getRow() + 6, secondsActive.getColumn() + 1, 1, maxColumns).setNumberFormat("0%").setFontStyle("italic").setHorizontalAlignment("center");
            }
          }
          if (previousClass != playerByNameAsc.type) {
            secondsActiveArr[0].push("");
            secondsActiveArr[1].push("");
            secondsActiveArr[2].push("");
            secondsActiveArr[3].push("");
            secondsActiveArr[4].push("");
            secondsActiveArr[5].push("");
            if (showWCLActivePercentage)
              secondsActiveArr[6].push("");
          }
          secondsActiveArr[0].push(Math.round(singleTargetTotalTime + aoeTotalTime));
          secondsActiveArr[1].push(Math.round(singleTargetTotalTime));
          secondsActiveArr[2].push("=" + Math.round(singleTargetTotalTime) + "/MAX(" + sheet.getRange(secondsActive.getRow(), secondsActive.getColumn(), 1, maxColumns).getA1Notation() + ";1)");
          secondsActiveArr[3].push("=" + sheet.getRange(secondsActive.getRow() + 2, secondsActive.getColumn() + playerDoneCount + classDoneCount + 1).getA1Notation() + "+" + sheet.getRange(secondsActive.getRow() + 4, secondsActive.getColumn() + playerDoneCount + classDoneCount + 1).getA1Notation());
          secondsActiveArr[4].push("=" + Math.round(aoeTotalTime) + "/MAX(" + sheet.getRange(secondsActive.getRow(), secondsActive.getColumn(), 1, maxColumns).getA1Notation() + ";1)");
          secondsActiveArr[5].push(Math.round(aoeTotalTime));
          if (showWCLActivePercentage) {
            if (activePercentageTotalOnTrash > 0 && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
              secondsActiveArr[6].push(activePercentageTotal + "% (" + activePercentageTotalOnTrash + "%)");
            else
              secondsActiveArr[6].push(activePercentageTotal + "%");
          }
        }

        //fill in class cooldowns
        if (classCooldownsToTrack != null) {
          var totalAmount = 0;
          var line = 0;
          classCooldownsToTrack.forEach(function (classCooldown, classCooldownCount) {
            var cdMultiplesOfActive = 1;
            var cooldownInSeconds = 0;
            if (classCooldown.indexOf("--") > -1 && classCooldown.indexOf("++") > -1) {
              cooldownInSeconds = classCooldown.split("--")[1];
              cdMultiplesOfActive = cooldownInSeconds / classCooldown.split("++")[1];
            }
            if (previousClass != playerByNameAsc.type) {
              if (classCooldown.indexOf("Power Infusion") > -1 || classCooldown.indexOf("Innervate") > -1) {
                if ((classCooldown.indexOf("Power Infusion") > -1 && playerByNameAsc.type == "Priest") || (classCooldown.indexOf("Innervate") > -1 && playerByNameAsc.type == "Druid")) {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " used or gained* on trash";
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " used or gained* on bosses";
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " total"; // + maxString;
                } else {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " gained on trash";
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " gained on bosses";
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " total"; // + maxString;
                }
              } else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " on trash";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " on bosses";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount] = classCooldown.split(" [")[0] + " total"; // + maxString;
              }
              var confColumnWidth = conf.getColumnWidth(confClassCooldownsToTrack.getColumn());
              if (confColumnWidth > maxColumnWidth) {
                maxColumnWidth = confColumnWidth;
              }
              var confRange = conf.createTextFinder(classCooldown).findNext();
              var rangeHeader = sheet.getRange(classCooldowns.getRow() + 1 + (classCooldownCount * 3), classCooldowns.getColumn() + playerDoneCount + classDoneCount, 2, 1);
              sheet.setColumnWidth(rangeHeader.getColumn(), maxColumnWidth);
              copyRangeStyle(confRange, rangeHeader, null, "left", null);
              copyRangeStyle(confRange, sheet.getRange(classCooldowns.getRow() + 1 + (classCooldownCount * 3), classCooldowns.getColumn() + 1 + playerDoneCount + classDoneCount, 2, playersInThisClass), null, "center", null);
              sheet.getRange(classCooldowns.getRow() + 3 + (classCooldownCount * 3), classCooldowns.getColumn() + playerDoneCount + classDoneCount, 1, 1).setFontWeight("bold").setHorizontalAlignment("left");
              sheet.getRange(classCooldowns.getRow() + 3 + (classCooldownCount * 3), classCooldowns.getColumn() + playerDoneCount + classDoneCount + 1, 1, playersInThisClass).setFontWeight("bold").setHorizontalAlignment("center");
            }

            if (classCooldown.indexOf("Power Infusion") > -1) {
              if (!gotAtLeastOnePI) {
                if (playerByNameAsc.type == "Priest") {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
                }
                else {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "no assign";
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "no assign";
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "no assign";
                }
              }
              else {
                if (playerByNameAsc.type == "Priest") {
                  if (PIoverwrittenWithCasts) {
                    if (PIonTrashSelf > 0)
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = PIonTrash + " (" + PIonTrashSelf + " self)";
                    else
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = PIonTrash;
                    if (PIOnBossesSelf > 0)
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = PIOnBosses + " (" + PIOnBossesSelf + " self)";
                    else
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = PIOnBosses;
                    if (PIonTrashSelf > 0 || PIOnBossesSelf > 0) {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (PIonTrash + PIOnBosses) + " (" + (PIonTrashSelf + PIOnBossesSelf) + " self)" + " (" + Math.round(PITotalUptime * cdMultiplesOfActive) + "%)";
                        sheet.getRange(classCooldowns.getRow() + 3 + (classCooldownCount * 3), classCooldowns.getColumn() + 1 + playerDoneCount + classDoneCount).setFontSize(7);
                      } else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (PIonTrash + PIOnBosses) + " (" + (PIonTrashSelf + PIOnBossesSelf) + " self)";
                    }
                    else {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = PIonTrash + PIOnBosses + " (" + Math.round(PITotalUptime * cdMultiplesOfActive) + "%)";
                      else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = PIonTrash + PIOnBosses;
                    }
                  } else {
                    if (PIonTrashSelf > 0)
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = PIonTrash + "* (" + PIonTrashSelf + " self)";
                    else
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = PIonTrash + "*";
                    if (PIOnBossesSelf > 0)
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = PIOnBosses + "* (" + PIOnBossesSelf + " self)";
                    else
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = PIOnBosses + "*";
                    if (PIonTrashSelf > 0 || PIOnBossesSelf > 0) {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (PIonTrash + PIOnBosses) + "* (" + (PIonTrashSelf + PIOnBossesSelf) + " self)" + " (" + Math.round(PITotalUptime * cdMultiplesOfActive) + "%)";
                        sheet.getRange(classCooldowns.getRow() + 3 + (classCooldownCount * 3), classCooldowns.getColumn() + 1 + playerDoneCount + classDoneCount).setFontSize(7);
                      } else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (PIonTrash + PIOnBosses) + "* (" + (PIonTrashSelf + PIOnBossesSelf) + " self)";
                    }
                    else {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = PIonTrash + PIOnBosses + "*" + " (" + Math.round(PITotalUptime * cdMultiplesOfActive) + "%)";
                      else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = PIonTrash + PIOnBosses + "*";
                    }
                  }
                } else {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = PIonTrash;
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = PIOnBosses;
                  if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                    classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = PIonTrash + PIOnBosses + " (" + Math.round(PITotalUptime * cdMultiplesOfActive) + "%)";
                  else
                    classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = PIonTrash + PIOnBosses;
                }
                totalAmount += PIonTrash + PIOnBosses;
              }
            }
            else if (classCooldown.indexOf("Arcane Power") > -1) {
              if (!gotAtLeastOneAPComb) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "winter chill?";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "winter chill?";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "winter chill?";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = APCombonTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = APCombOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = APCombonTrash + APCombOnBosses + " (" + Math.round((APCombonTrash + APCombOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = APCombonTrash + APCombOnBosses;
                totalAmount += APCombonTrash + APCombOnBosses;
              }
            }
            else if (classCooldown.indexOf("Evocation") > -1) {
              if (!gotAtLeastOneEvocation) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = EvocationOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = EvocationOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = EvocationOnTrash + EvocationOnBosses + " (" + Math.round((EvocationOnTrash + EvocationOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = EvocationOnTrash + EvocationOnBosses;
                totalAmount += EvocationOnTrash + EvocationOnBosses;
              }
            }
            else if (classCooldown.indexOf("Evasion") > -1) {
              if (!gotAtLeastOneEvasion) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = EvasionOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = EvasionOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = EvasionOnTrash + EvasionOnBosses + " (" + Math.round(EvasionTotalUptime * cdMultiplesOfActive) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = EvasionOnTrash + EvasionOnBosses;
                totalAmount += EvasionOnTrash + EvasionOnBosses;
              }
            }
            else if (classCooldown.indexOf("Adrenaline Rush") > -1) {
              if (!gotAtLeastOneAdrenalineRush) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = AdrenalineRushOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = AdrenalineRushOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = AdrenalineRushOnTrash + AdrenalineRushOnBosses + " (" + Math.round(AdrenalineRushTotalUptime * cdMultiplesOfActive) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = AdrenalineRushOnTrash + AdrenalineRushOnBosses;
                totalAmount += AdrenalineRushOnTrash + AdrenalineRushOnBosses;
              }
            }
            else if (classCooldown.indexOf("Berserker Rage") > -1) {
              if (!gotAtLeastOneBerserkerRage) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = BerserkerRageOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = BerserkerRageOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BerserkerRageOnTrash + BerserkerRageOnBosses + " (" + Math.round(BerserkerRageTotalUptime * cdMultiplesOfActive) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BerserkerRageOnTrash + BerserkerRageOnBosses;
                totalAmount += BerserkerRageOnTrash + BerserkerRageOnBosses;
              }
            }
            else if (classCooldown.indexOf("Bloodrage") > -1) {
              if (!gotAtLeastOneBloodrage) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = BloodrageOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = BloodrageOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BloodrageOnTrash + BloodrageOnBosses + " (" + Math.round((BloodrageOnTrash + BloodrageOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BloodrageOnTrash + BloodrageOnBosses;
                totalAmount += BloodrageOnTrash + BloodrageOnBosses;
              }
            }
            else if (classCooldown.indexOf("Challenging Shout") > -1) {
              if (!gotAtLeastOneChallengingShout) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = ChallengingShoutOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = ChallengingShoutOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ChallengingShoutOnTrash + ChallengingShoutOnBosses + " (" + Math.round((ChallengingShoutOnTrash + ChallengingShoutOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ChallengingShoutOnTrash + ChallengingShoutOnBosses;
                totalAmount += ChallengingShoutOnTrash + ChallengingShoutOnBosses;
              }
            }
            else if (classCooldown.indexOf("Death Wish") > -1) {
              if (!gotAtLeastOneDeathWish) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DeathWishOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DeathWishOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DeathWishOnTrash + DeathWishOnBosses + " (" + Math.round(DeathWishTotalUptime * cdMultiplesOfActive) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DeathWishOnTrash + DeathWishOnBosses;
                totalAmount += DeathWishOnTrash + DeathWishOnBosses;
              }
            }
            else if (classCooldown.indexOf("Last Stand") > -1) {
              if (!gotAtLeastOneLastStand) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = LastStandOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = LastStandOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = LastStandOnTrash + LastStandOnBosses + " (" + Math.round((LastStandOnTrash + LastStandOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = LastStandOnTrash + LastStandOnBosses;
                totalAmount += LastStandOnTrash + LastStandOnBosses;
              }
            }
            else if (classCooldown.indexOf("Recklessness") > -1) {
              if (!gotAtLeastOneRecklessness) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = RecklessnessOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = RecklessnessOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RecklessnessOnTrash + RecklessnessOnBosses + " (" + Math.round((RecklessnessOnTrash + RecklessnessOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RecklessnessOnTrash + RecklessnessOnBosses;
                totalAmount += RecklessnessOnTrash + RecklessnessOnBosses;
              }
            }
            else if (classCooldown.indexOf("Retaliation") > -1) {
              if (!gotAtLeastOneRetaliation) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = RetaliationOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = RetaliationOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RetaliationOnTrash + RetaliationOnBosses + " (" + Math.round((RetaliationOnTrash + RetaliationOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RetaliationOnTrash + RetaliationOnBosses;
                totalAmount += RetaliationOnTrash + RetaliationOnBosses;
              }
            }
            else if (classCooldown.indexOf("Shield Wall") > -1) {
              if (!gotAtLeastOneShieldWall) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = ShieldWallOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = ShieldWallOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ShieldWallOnTrash + ShieldWallOnBosses + " (" + Math.round((ShieldWallOnTrash + ShieldWallOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ShieldWallOnTrash + ShieldWallOnBosses;
                totalAmount += ShieldWallOnTrash + ShieldWallOnBosses;
              }
            }
            else if (classCooldown.indexOf("Nature's Swiftness") > -1) {
              if (!gotAtLeastOneNaturesSwiftness) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = NaturesSwiftnessOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = NaturesSwiftnessOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = NaturesSwiftnessOnTrash + NaturesSwiftnessOnBosses + " (" + Math.round((NaturesSwiftnessOnTrash + NaturesSwiftnessOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = NaturesSwiftnessOnTrash + NaturesSwiftnessOnBosses;
                totalAmount += NaturesSwiftnessOnTrash + NaturesSwiftnessOnBosses;
              }
            }
            else if (classCooldown.indexOf("Elemental Mastery") > -1) {
              if (!gotAtLeastOneElementalMastery) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = ElementalMasteryOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = ElementalMasteryOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ElementalMasteryOnTrash + ElementalMasteryOnBosses + " (" + Math.round((ElementalMasteryOnTrash + ElementalMasteryOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ElementalMasteryOnTrash + ElementalMasteryOnBosses;
                totalAmount += ElementalMasteryOnTrash + ElementalMasteryOnBosses;
              }
            }
            else if (classCooldown.indexOf("Rebirth") > -1) {
              if (!gotAtLeastOneRebirth) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = RebirthOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = RebirthOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RebirthOnTrash + RebirthOnBosses + " (" + Math.round((RebirthOnTrash + RebirthOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RebirthOnTrash + RebirthOnBosses;
                totalAmount += RebirthOnTrash + RebirthOnBosses;
              }
            }
            else if (classCooldown.indexOf("Challenging Roar") > -1) {
              if (!gotAtLeastOneChallengingRoar) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = ChallengingRoarOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = ChallengingRoarOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ChallengingRoarOnTrash + ChallengingRoarOnBosses + " (" + Math.round((ChallengingRoarOnTrash + ChallengingRoarOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ChallengingRoarOnTrash + ChallengingRoarOnBosses;
                totalAmount += ChallengingRoarOnTrash + ChallengingRoarOnBosses;
              }
            }
            else if (classCooldown.indexOf("Dash") > -1) {
              if (!gotAtLeastOneDash) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DashOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DashOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DashOnTrash + DashOnBosses + " (" + Math.round((DashOnTrash + DashOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DashOnTrash + DashOnBosses;
                totalAmount += DashOnTrash + DashOnBosses;
              }
            }
            else if (classCooldown.indexOf("Frenzied Regeneration") > -1) {
              if (!gotAtLeastOneFrenziedRegeneration) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = FrenziedRegenerationOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = FrenziedRegenerationOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = FrenziedRegenerationOnTrash + FrenziedRegenerationOnBosses + " (" + Math.round((FrenziedRegenerationOnTrash + FrenziedRegenerationOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                } else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = FrenziedRegenerationOnTrash + FrenziedRegenerationOnBosses;
                totalAmount += FrenziedRegenerationOnTrash + FrenziedRegenerationOnBosses;
              }
            }
            else if (classCooldown.indexOf("Innervate") > -1) {
              if (!gotAtLeastOneInnervate) {
                if (playerByNameAsc.type == "Druid") {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
                }
                else {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
                }
              }
              else {
                if (playerByNameAsc.type == "Druid") {
                  if (InnervateUsedBySelf) {
                    if (InnervateOnTrashSelf > 0)
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = InnervateOnTrash + " (" + InnervateOnTrashSelf + " self)";
                    else
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = InnervateOnTrash;
                    if (InnervateOnBossesSelf > 0)
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = InnervateOnBosses + " (" + InnervateOnBossesSelf + " self)";
                    else
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = InnervateOnBosses;
                    if (InnervateOnTrashSelf > 0 || InnervateOnBossesSelf > 0) {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (InnervateOnTrash + InnervateOnBosses) + " (" + (InnervateOnTrashSelf + InnervateOnBossesSelf) + " self)" + " (" + Math.round((InnervateOnTrash + InnervateOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                        sheet.getRange(classCooldowns.getRow() + 3 + (classCooldownCount * 3), classCooldowns.getColumn() + 1 + playerCount + classDoneCount).setFontSize(7);
                      } else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (InnervateOnTrash + InnervateOnBosses) + " (" + (InnervateOnTrashSelf + InnervateOnBossesSelf) + " self)";
                    }
                    else {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = InnervateOnTrash + InnervateOnBosses + " (" + Math.round((InnervateOnTrash + InnervateOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                      else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = InnervateOnTrash + InnervateOnBosses;
                    }
                  } else {
                    if (InnervateOnTrashSelf > 0)
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = InnervateOnTrash + "* (" + InnervateOnTrashSelf + " self)";
                    else
                      classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = InnervateOnTrash + "*";
                    if (InnervateOnBossesSelf > 0)
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = InnervateOnBosses + "* (" + InnervateOnBossesSelf + " self)";
                    else
                      classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = InnervateOnBosses + "*";
                    if (InnervateOnTrashSelf > 0 || InnervateOnBossesSelf > 0) {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (InnervateOnTrash + InnervateOnBosses) + "* (" + (InnervateOnTrashSelf + InnervateOnBossesSelf) + " self)" + " (" + Math.round((InnervateOnTrash + InnervateOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                        sheet.getRange(classCooldowns.getRow() + 3 + (classCooldownCount * 3), classCooldowns.getColumn() + 1 + playerCount + classDoneCount).setFontSize(7);
                      } else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (InnervateOnTrash + InnervateOnBosses) + "* (" + (InnervateOnTrashSelf + InnervateOnBossesSelf) + " self)";
                    }
                    else {
                      if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (InnervateOnTrash + InnervateOnBosses) + "*" + " (" + Math.round((InnervateOnTrash + InnervateOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                      else
                        classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (InnervateOnTrash + InnervateOnBosses) + "*";
                    }
                  }
                } else {
                  classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = InnervateOnTrash;
                  classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = InnervateOnBosses;
                  if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                    classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = (InnervateOnTrash + InnervateOnBosses) + " (" + Math.round((InnervateOnTrash + InnervateOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                  else
                    classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = InnervateOnTrash + InnervateOnBosses;
                }
                totalAmount += InnervateOnTrash + InnervateOnBosses;
              }
            }
            else if (classCooldown.indexOf("Tranquility") > -1) {
              if (!gotAtLeastOneTranquility) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = TranquilityOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = TranquilityOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = TranquilityOnTrash + TranquilityOnBosses + " (" + Math.round((TranquilityOnTrash + TranquilityOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = TranquilityOnTrash + TranquilityOnBosses;
                totalAmount += TranquilityOnTrash + TranquilityOnBosses;
              }
            }
            else if (classCooldown.indexOf("Rapid Fire") > -1) {
              if (!gotAtLeastOneRapidFire) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = RapidFireOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = RapidFireOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RapidFireOnTrash + RapidFireOnBosses + " (" + Math.round(RapidFireTotalUptime * cdMultiplesOfActive) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = RapidFireOnTrash + RapidFireOnBosses;
                totalAmount += RapidFireOnTrash + RapidFireOnBosses;
              }
            }
            else if (classCooldown.indexOf("Bestial Wrath") > -1) {
              if (!gotAtLeastOneBestialWrath) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = BestialWrathOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = BestialWrathOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BestialWrathOnTrash + BestialWrathOnBosses + " (" + Math.round(BestialWrathTotalUptime * cdMultiplesOfActive) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BestialWrathOnTrash + BestialWrathOnBosses;
                totalAmount += BestialWrathOnTrash + BestialWrathOnBosses;
              }
            }
            else if (classCooldown.indexOf("Readiness") > -1) {
              if (!gotAtLeastOneReadiness) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = ReadinessOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = ReadinessOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ReadinessOnTrash + ReadinessOnBosses + " (" + Math.round((ReadinessOnTrash + ReadinessOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ReadinessOnTrash + ReadinessOnBosses;
                totalAmount += ReadinessOnTrash + ReadinessOnBosses;
              }
            }
            else if (classCooldown.indexOf("Deterrence") > -1) {
              if (!gotAtLeastOneDeterrence) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DeterrenceOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DeterrenceOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DeterrenceOnTrash + DeterrenceOnBosses + " (" + Math.round((DeterrenceOnTrash + DeterrenceOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DeterrenceOnTrash + DeterrenceOnBosses;
                totalAmount += DeterrenceOnTrash + DeterrenceOnBosses;
              }
            }
            else if (classCooldown.indexOf("Inner Focus") > -1) {
              if (!gotAtLeastOneInnerFocus) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = InnerFocusOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = InnerFocusOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = InnerFocusOnTrash + InnerFocusOnBosses + " (" + Math.round((InnerFocusOnTrash + InnerFocusOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = InnerFocusOnTrash + InnerFocusOnBosses;
                totalAmount += InnerFocusOnTrash + InnerFocusOnBosses;
              }
            }
            else if (classCooldown.indexOf("Blessing of Protection") > -1) {
              if (!gotAtLeastOneBoP) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = BoPOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = BoPOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BoPOnTrash + BoPOnBosses + " (" + Math.round((BoPOnTrash + BoPOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = BoPOnTrash + BoPOnBosses;
                totalAmount += BoPOnTrash + BoPOnBosses;
              }
            }
            else if (classCooldown.indexOf("Divine Favor") > -1) {
              if (!gotAtLeastOneDivineFavor) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DivineFavorOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DivineFavorOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineFavorOnTrash + DivineFavorOnBosses + " (" + Math.round((DivineFavorOnTrash + DivineFavorOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineFavorOnTrash + DivineFavorOnBosses;
                totalAmount += DivineFavorOnTrash + DivineFavorOnBosses;
              }
            }
            else if (classCooldown.indexOf("Divine Intervention") > -1) {
              if (!gotAtLeastOneDivineIntervention) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DivineInterventionOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DivineInterventionOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineInterventionOnTrash + DivineInterventionOnBosses + " (" + Math.round((DivineInterventionOnTrash + DivineInterventionOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineInterventionOnTrash + DivineInterventionOnBosses;
                totalAmount += DivineInterventionOnTrash + DivineInterventionOnBosses;
              }
            }
            else if (classCooldown.indexOf("Divine Protection") > -1) {
              if (!gotAtLeastOneDivineProtection) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DivineProtectionOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DivineProtectionOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineProtectionOnTrash + DivineProtectionOnBosses + " (" + Math.round((DivineProtectionOnTrash + DivineProtectionOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineProtectionOnTrash + DivineProtectionOnBosses;
                totalAmount += DivineProtectionOnTrash + DivineProtectionOnBosses;
              }
            }
            else if (classCooldown.indexOf("Divine Shield") > -1) {
              if (!gotAtLeastOneDivineShield) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DivineShieldOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DivineShieldOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineShieldOnTrash + DivineShieldOnBosses + " (" + Math.round((DivineShieldOnTrash + DivineShieldOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DivineShieldOnTrash + DivineShieldOnBosses;
                totalAmount += DivineShieldOnTrash + DivineShieldOnBosses;
              }
            }
            else if (classCooldown.indexOf("Devouring Plague") > -1) {
              if (!gotAtLeastOneDevouringPlague) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DevouringPlagueOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DevouringPlagueOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DevouringPlagueOnTrash + DevouringPlagueOnBosses + " (" + Math.round((DevouringPlagueOnTrash + DevouringPlagueOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DevouringPlagueOnTrash + DevouringPlagueOnBosses;
                totalAmount += DevouringPlagueOnTrash + DevouringPlagueOnBosses;
              }
            }
            else if (classCooldown.indexOf("Desperate Prayer") > -1) {
              if (!gotAtLeastOneDesperatePrayer) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = DesperatePrayerOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = DesperatePrayerOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DesperatePrayerOnTrash + DesperatePrayerOnBosses + " (" + Math.round((DesperatePrayerOnTrash + DesperatePrayerOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = DesperatePrayerOnTrash + DesperatePrayerOnBosses;
                totalAmount += DesperatePrayerOnTrash + DesperatePrayerOnBosses;
              }
            }
            else if (classCooldown.indexOf("Lay on Hands") > -1) {
              if (!gotAtLeastOneLayOnHands) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = LayOnHandsOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = LayOnHandsOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = LayOnHandsOnTrash + LayOnHandsOnBosses + " (" + Math.round((LayOnHandsOnTrash + LayOnHandsOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = LayOnHandsOnTrash + LayOnHandsOnBosses;
                totalAmount += LayOnHandsOnTrash + LayOnHandsOnBosses;
              }
            }
            else if (classCooldown.indexOf("Mana Tide Totem") > -1) {
              if (!gotAtLeastOneManaTideTotem) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = ManaTideTotemOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = ManaTideTotemOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ManaTideTotemOnTrash + ManaTideTotemOnBosses + " (" + Math.round((ManaTideTotemOnTrash + ManaTideTotemOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = ManaTideTotemOnTrash + ManaTideTotemOnBosses;
                totalAmount += ManaTideTotemOnTrash + ManaTideTotemOnBosses;
              }
            }
            else if (classCooldown.indexOf("Vanish") > -1) {
              if (!gotAtLeastOneVanish) {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = "0";
                classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = "0";
              }
              else {
                classCooldownsArr[line + 1][playerDoneCount + classDoneCount + 1] = VanishOnTrash;
                classCooldownsArr[line + 2][playerDoneCount + classDoneCount + 1] = VanishOnBosses;
                if (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = VanishOnTrash + VanishOnBosses + " (" + Math.round((VanishOnTrash + VanishOnBosses) * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / (Number(classCooldown.split("--")[1]))) + 1)) + "%)";
                else
                  classCooldownsArr[line + 3][playerDoneCount + classDoneCount + 1] = VanishOnTrash + VanishOnBosses;
                totalAmount += VanishOnTrash + VanishOnBosses;
              }
            }
            line += 3;
          })
        }

        //fill in damage taken
        var totalAmount = 0;
        var damageTakenToTrackSpells = sheet.getRange(damageTaken.getRow() + 1, damageTaken.getColumn(), damageTakenMaxEntries, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
        damageTakenToTrackSpells.forEach(function (damageTakenToTrackSpell, damageTakenToTrackSpellCount) {
          if (damageTakenArr[damageTakenToTrackSpellCount + 1] == null || damageTakenArr[damageTakenToTrackSpellCount + 1].length == 0) {
            damageTakenArr[damageTakenToTrackSpellCount + 1] = [];
            damageTakenArr[damageTakenToTrackSpellCount + 1].push(damageTakenToTrackSpell.split(" [")[0] + " " + damageTakenToTrackSpell.split("] ")[1]);
          }
          var amount = 0;
          damageTakenTotalData.entries.forEach(function (damageTakenEntry, damageTakenEntryCount) {
            if (damageTakenToTrackSpell.indexOf("[") > -1) {
              damageTakenToTrackSpell.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                if (spellId == damageTakenEntry.guid.toString()) {
                  amount += damageTakenEntry.total;
                }
              })
            }
          })
          if (previousClass != playerByNameAsc.type)
            damageTakenArr[damageTakenToTrackSpellCount + 1].push("");

          if (amount == 0)
            damageTakenArr[damageTakenToTrackSpellCount + 1].push("");
          else
            damageTakenArr[damageTakenToTrackSpellCount + 1].push(amount);
          totalAmount += amount;
        })
        for (var i = damageTakenArr.length; i <= damageTakenMaxEntries; i++) {
          addSingleEntryToMultiDimArray(damageTakenArr, "");
        }
        var reflectedTotal = 0;
        if (damageReflectedData != null && damageReflectedData.entries != null) {
          damageReflectedData.entries.forEach(function (reflectedSpell, reflectedSpellCount) {
            if (reflectedSpell.id == playerByNameAsc.id)
              if (reflectedSpell.total > 0) {
                reflectedTotal += reflectedSpell.total;
              }
          })
        }
        if (damageTakenArr.length == damageTakenMaxEntries + 1) {
          if (showDamageReflectRow) {
            addSingleEntryToMultiDimArray(damageTakenArr, "Damage reflected");
          }
          if (showFriendlyFireRow) {
            addSingleEntryToMultiDimArray(damageTakenArr, "Damage to hostile players (counts as done to self)");
            addSingleEntryToMultiDimArray(damageTakenArr, "Friendly Fire (e.g. Charge/Plague/...; counts as done to self)");
          }
          if (showDeathCountRow) {
            if (onlyBosses || onlyTrash || (onlyFightNr != null && onlyFightNr.toString().length > 0))
              addSingleEntryToMultiDimArray(damageTakenArr, "# of deaths in total");
            else
              addSingleEntryToMultiDimArray(damageTakenArr, "# of deaths in total (just on trash)");
          }
          addSingleEntryToMultiDimArray(damageTakenArr, "Total avoidable damage taken");
          addSingleEntryToMultiDimArray(damageTakenArr, "");
        }
        if (showDamageReflectRow && reflectedTotal > 0) {
          if (showDeathCountRow) {
            if (showFriendlyFireRow) {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 6].push("");
              damageTakenArr[damageTakenArr.length - 6].push("=HYPERLINK(\"" + urlDamageReflectedLinkPlayer + "\"," + reflectedTotal + ")");
            } else {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 4].push("");
              damageTakenArr[damageTakenArr.length - 4].push("=HYPERLINK(\"" + urlDamageReflectedLinkPlayer + "\"," + reflectedTotal + ")");
            }
          } else {
            if (showFriendlyFireRow) {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 5].push("");
              damageTakenArr[damageTakenArr.length - 5].push("=HYPERLINK(\"" + urlDamageReflectedLinkPlayer + "\"," + reflectedTotal + ")");
            } else {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 3].push("");
              damageTakenArr[damageTakenArr.length - 3].push("=HYPERLINK(\"" + urlDamageReflectedLinkPlayer + "\"," + reflectedTotal + ")");
            }
          }
          totalAmount += reflectedTotal;
        }
        else if (showDamageReflectRow) {
          if (showDeathCountRow) {
            if (showFriendlyFireRow) {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 6].push("");
              damageTakenArr[damageTakenArr.length - 6].push("");
            } else {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 4].push("");
              damageTakenArr[damageTakenArr.length - 4].push("");
            }
          } else {
            if (showFriendlyFireRow)
              damageTakenArr[damageTakenArr.length - 3].push("");
            else
              damageTakenArr[damageTakenArr.length - 3].push("");
          }
        }

        if (showFriendlyFireRow) {
          if (showDeathCountRow) {
            if (hostilePlayersTotal > 0) {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 5].push("");
              damageTakenArr[damageTakenArr.length - 5].push("=HYPERLINK(\"" + urlHostilePlayersLinkPlayer + "\"," + hostilePlayersTotal + ")");
              totalAmount += hostilePlayersTotal;
            }
            else {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 5].push("");
              damageTakenArr[damageTakenArr.length - 5].push("");
            }

            if (friendlyFireTotal > 0) {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 4].push("");
              damageTakenArr[damageTakenArr.length - 4].push("=HYPERLINK(\"" + urlFriendlyFireLinkPlayer + "\"," + friendlyFireTotal + ")");
              totalAmount += friendlyFireTotal;
            }
            else {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 4].push("");
              damageTakenArr[damageTakenArr.length - 4].push("");
            }
          } else {
            if (hostilePlayersTotal > 0) {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 4].push("");
              damageTakenArr[damageTakenArr.length - 4].push("=HYPERLINK(\"" + urlHostilePlayersLinkPlayer + "\"," + hostilePlayersTotal + ")");
              totalAmount += hostilePlayersTotal;
            }
            else {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 4].push("");
              damageTakenArr[damageTakenArr.length - 4].push("");
            }

            if (friendlyFireTotal > 0) {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 3].push("");
              damageTakenArr[damageTakenArr.length - 3].push("=HYPERLINK('" + urlFriendlyFireLinkPlayer + "'," + friendlyFireTotal + ")");
              totalAmount += friendlyFireTotal;
            }
            else {
              if (previousClass != playerByNameAsc.type)
                damageTakenArr[damageTakenArr.length - 3].push("");
              damageTakenArr[damageTakenArr.length - 3].push("");
            }
          }
        }

        if (showDeathCountRow) {
          if (previousClass != playerByNameAsc.type)
            damageTakenArr[damageTakenArr.length - 3].push("");
          if (deathsData.entries.length > 0) {
            var deathsTotal = 0;
            deathsData.entries.forEach(function (deathDataTotal, deathDataTotalCount) {
              if (deathDataTotal.id == playerByNameAsc.id)
                deathsTotal++;
            })
            if ((!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)) && deathsDataTrash.entries.length > 0) {
              var deathsOnTrash = 0;
              deathsDataTrash.entries.forEach(function (deathDataTrash, deathDataTrashCount) {
                if (deathDataTrash.id == playerByNameAsc.id)
                  deathsOnTrash++;
              })
              damageTakenArr[damageTakenArr.length - 3].push(deathsTotal + " (" + deathsOnTrash + ")");
            } else {
              if (onlyBosses || onlyTrash || (onlyFightNr != null && onlyFightNr.toString().length > 0))
                damageTakenArr[damageTakenArr.length - 3].push(deathsTotal);
              else
                damageTakenArr[damageTakenArr.length - 3].push(deathsTotal + " (0)");
            }
          }
          else
            damageTakenArr[damageTakenArr.length - 3].push("");
        }

        if (previousClass != playerByNameAsc.type)
          damageTakenArr[damageTakenArr.length - 2].push("");
        damageTakenArr[damageTakenArr.length - 2].push(totalAmount);
        if (previousClass != playerByNameAsc.type)
          damageTakenArr[damageTakenArr.length - 1].push("");
        damageTakenArr[damageTakenArr.length - 1].push("=" + totalAmount.toString() + "/MAX(" + sheet.getRange(damageTaken.getRow() + damageTakenArr.length - 2, damageTaken.getColumn() + 1, 1, maxColumns).getA1Notation() + ";1)");

        //fill in debuffs applied
        var totalAmount = 0;
        var debuffsToTrackSpells = sheet.getRange(debuffs.getRow() + 1, debuffs.getColumn(), debuffsMaxEntries, 1).getValues().reduce(function (ar, e) { if (e[0]) ar.push(e[0]); return ar; }, []);
        debuffsToTrackSpells.forEach(function (debuffsToTrackSpell, debuffsToTrackSpellCount) {
          if (debuffsArr[debuffsToTrackSpellCount + 1] == null || debuffsArr[debuffsToTrackSpellCount + 1].length == 0) {
            debuffsArr[debuffsToTrackSpellCount + 1] = [];
            debuffsArr[debuffsToTrackSpellCount + 1].push(debuffsToTrackSpell.split(" [")[0] + " " + debuffsToTrackSpell.split("] ")[1]);
          }
          var amount = 0;
          debuffsData.auras.forEach(function (debuff, debuffCount) {
            if (debuffsToTrackSpell.indexOf("[") > -1) {
              debuffsToTrackSpell.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                if (spellId == debuff.guid.toString()) {
                  amount += debuff.totalUses;
                }
              })
            }
          })
          if (previousClass != playerByNameAsc.type)
            debuffsArr[debuffsToTrackSpellCount + 1].push("");
          if (amount == 0)
            debuffsArr[debuffsToTrackSpellCount + 1].push("");
          else
            debuffsArr[debuffsToTrackSpellCount + 1].push(amount);
          totalAmount += amount;
        })
        for (var i = debuffsArr.length; i <= debuffsMaxEntries; i++) {
          addSingleEntryToMultiDimArray(debuffsArr, "");
        }

        //fill in stats and miscellaneous
        if (playerDoneCount == 0) {
          copyRowStyles(conf, sheet, confStatsAndMiscToTrack, statsAndMiscToTrack.length, statsAndMisc.getRow() + 1, statsAndMisc.getColumn(), maxColumns, true, "right", darkMode);

          var confColumnWidth = conf.getColumnWidth(confStatsAndMiscToTrack.getColumn());
          if (confColumnWidth > maxColumnWidth) {
            maxColumnWidth = confColumnWidth;
          }
        }
        statsAndMiscToTrack.forEach(function (statOrMisc, statOrMiscCount) {
          var amount = 0;
          var uptime = 0;
          var totalDamageDoneUses = 0;
          var totalHealingDoneUses = 0;
          var totalDamageTakenUses = 0;
          if ((zoneFound == "1006" || zoneFound == "2006"))
            statOrMisc = statOrMisc.replace("Parry outgoing", "Parry outgoing -> excl. Thaddius");
          statOrMisc = statOrMisc.replace(" - needs version 1.0.4+ to work!", "");
          if (statsAndMiscArr[statOrMiscCount + 1] == null || statsAndMiscArr[statOrMiscCount + 1].length == 0) {
            statsAndMiscArr[statOrMiscCount + 1] = [];
            statsAndMiscArr[statOrMiscCount + 1].push(statOrMisc.split(" [")[0].split(" {")[0]);
          }
          if (previousClass != playerByNameAsc.type)
            statsAndMiscArr[statOrMiscCount + 1].push("");
          if (statOrMisc.indexOf("Battle Shout uptime on you") > -1) {
            uptime += getUptimeForDebuffSpellId("11551", buffsData, totalTimeElapsedRaw);
            uptime += getUptimeForDebuffSpellId("25289", buffsData, totalTimeElapsedRaw);
            if (uptime > 0)
              statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = uptime + "%";
            else
              statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = "";
          } else if (statOrMisc.indexOf("# of extra Windfury Attacks") > -1) {
            var lowerlevelwindfuryprocs = getUsesForDebuffSpellId("8516", buffsData, totalTimeElapsedRaw) + getUsesForDebuffSpellId("10608", buffsData, totalTimeElapsedRaw);
            var maxlevelwindfuryprocs = getUsesForDebuffSpellId("10610", buffsData, totalTimeElapsedRaw);
            if ((maxlevelwindfuryprocs + lowerlevelwindfuryprocs) > 0 && Math.round(lowerlevelwindfuryprocs * 100 / (maxlevelwindfuryprocs + lowerlevelwindfuryprocs)) > 50)
              sheet.getRange(statsAndMisc.getRow() + statOrMiscCount + 1, statsAndMisc.getColumn() + playerDoneCount + classDoneCount + 1, 1, 1).setFontWeight("bold").setFontStyle("italic").setFontColor("#980000");
            if (playerByNameAsc.type == "Shaman" && lowerlevelwindfuryprocs + maxlevelwindfuryprocs > 0)
              sheet.getRange(statsAndMisc.getRow() + statOrMiscCount + 1, statsAndMisc.getColumn() + playerDoneCount + classDoneCount + 1, 1, 1).setFontWeight("bold").setFontStyle("italic").setFontColor("#986200");
            statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = lowerlevelwindfuryprocs + maxlevelwindfuryprocs;
          } else if (statOrMisc.indexOf("Critical heals done") > -1) {
            healingData.entries.forEach(function (healing, healingCount) {
              var increased = false;
              if (healing.targets != null && healing.targets.length > 0 && healing.actor != null && healing.actor == playerByNameAsc.id) {
                if (healing.critHitCount != null && healing.critHitCount > 0) {
                  amount += healing.critHitCount;
                  increased = true;
                }
              } else if (healing.subentries != null) {
                healing.subentries.forEach(function (subentry, subentryCount) {
                  if (subentry.targets != null && subentry.targets.length > 0 && subentry.actor != null && subentry.actor == playerByNameAsc.id) {
                    if (subentry.critHitCount != null && subentry.critHitCount > 0) {
                      amount += subentry.critHitCount;
                      increased = true;
                    }
                  }
                })
              }
              if (increased)
                totalHealingDoneUses += healing.hitCount;
            })
            if (amount > 0)
              statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(amount * 1000 / totalHealingDoneUses) / 10 + "%)";
            else
              statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = "";
          } else if (statOrMisc.indexOf("outgoing") > -1) {
            var searchType = statOrMisc.split(" outgoing")[0];
            damageDoneData.entries.forEach(function (damage, damageCount) {
              if (damage.uses != null && damage.uses > 0) {
                var increased = false;
                if (damage.targets != null && damage.targets.length > 0 && damage.actor != null && damage.actor == playerByNameAsc.id) {
                  if (statOrMisc.indexOf("Critical") > -1) {
                    if (damage.critHitCount != null && damage.critHitCount > 0) {
                      amount += damage.critHitCount;
                      increased = true;
                    }
                  } else if (damage.missdetails != null) {
                    damage.missdetails.forEach(function (missdetail, missdetailCount) {
                      if (missdetail.type != null && missdetail.type.indexOf(searchType) > -1) {
                        amount += missdetail.count;
                        increased = true;
                      }
                    })
                  }
                } else if (damage.subentries != null) {
                  damage.subentries.forEach(function (subentry, subentryCount) {
                    if (subentry.targets != null && subentry.targets.length > 0 && subentry.actor != null && subentry.actor == playerByNameAsc.id) {
                      if (statOrMisc.indexOf("Critical") > -1) {
                        if (subentry.critHitCount != null && subentry.critHitCount > 0) {
                          amount += subentry.critHitCount;
                          increased = true;
                        }
                      } else if (subentry.missdetails != null) {
                        subentry.missdetails.forEach(function (missdetail, missdetailCount) {
                          if (missdetail.type != null && missdetail.type.indexOf(searchType) > -1) {
                            amount += missdetail.count;
                            increased = true;
                          }
                        })
                      }
                    }
                  })
                }
                if (increased) {
                  if (damage.hitCount == 0 && (damage.missCount != null || statOrMisc.indexOf("Critical") > -1) && damage.uses >= damage.missCount)
                    totalDamageDoneUses += damage.uses;
                  else
                    totalDamageDoneUses += damage.hitCount;
                  if (damage.missCount != null && damage.missCount > 0)
                    totalDamageDoneUses += damage.missCount;
                }
              }
            })
            if ((zoneFound == "1006" || zoneFound == "2006") && statOrMisc.indexOf("Parry") > -1) {
              var playerDamageDoneThaddiusData = JSON.parse(UrlFetchApp.fetch(urlDamageDoneThaddius + playerByNameAsc.id));
              playerDamageDoneThaddiusData.entries.forEach(function (damage, damageCount) {
                var decreased = false;
                if (damage.targets != null && damage.targets.length > 0 && damage.actor != null && damage.actor == playerByNameAsc.id) {
                  if (damage.missdetails != null) {
                    damage.missdetails.forEach(function (missdetail, missdetailCount) {
                      if (missdetail.type != null && missdetail.type.indexOf(searchType) > -1 && statOrMisc.indexOf("Parry") > -1) {
                        amount -= missdetail.count;
                        decreased = true;
                      }
                    })
                  }
                } else if (damage.subentries != null) {
                  damage.subentries.forEach(function (subentry, subentryCount) {
                    if (subentry.targets != null && subentry.targets.length > 0 && subentry.actor != null && subentry.actor == playerByNameAsc.id) {
                      if (subentry.missdetails != null) {
                        subentry.missdetails.forEach(function (missdetail, missdetailCount) {
                          if (missdetail.type != null && missdetail.type.indexOf(searchType) > -1 && statOrMisc.indexOf("Parry") > -1) {
                            amount -= missdetail.count;
                            decreased = true;
                          }
                        })
                      }
                    }
                  })
                }
                if (decreased) {
                  totalDamageDoneUses -= damage.hitCount;
                  if (damage.missCount != null && damage.missCount > 0)
                    totalDamageDoneUses -= damage.missCount;
                }
              })
            }
            if (amount > 0)
              statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(amount * 1000 / totalDamageDoneUses) / 10 + "%)";
            else
              statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = "";
          } else if (statOrMisc.indexOf("incoming") > -1) {
            var searchType = statOrMisc.split(" incoming")[0];
            if (statOrMisc.indexOf("Dodge") > -1 || statOrMisc.indexOf("Immune") > -1 || statOrMisc.indexOf("Miss") > -1 || statOrMisc.indexOf("Parry") > -1) {
              damageTakenTotalData.entries.forEach(function (damage, damageCount) {
                if (damage.guid == 1) {
                  if (damage.sources != null && damage.sources.length > 0) {
                    if (damage.missdetails != null) {
                      damage.missdetails.forEach(function (missdetail, missdetailCount) {
                        if (missdetail.type != null && missdetail.type.indexOf(searchType) > -1)
                          amount += missdetail.count;
                      })
                    }
                  } else if (damage.subentries != null) {
                    damage.subentries.forEach(function (subentry, subentryCount) {
                      if (subentry.sources != null && subentry.sources.length > 0) {
                        if (subentry.missdetails != null) {
                          subentry.missdetails.forEach(function (missdetail, missdetailCount) {
                            if (missdetail.type != null && missdetail.type.indexOf(searchType) > -1)
                              amount += missdetail.count;
                          })
                        }
                      }
                    })
                  }
                  totalDamageTakenUses += damage.hitCount;
                  if (damage.missCount != null && damage.missCount > 0)
                    totalDamageTakenUses += damage.missCount;
                }
              })
              if (amount > 0)
                statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(amount * 1000 / totalDamageTakenUses) / 10 + "%)";
              else
                statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = "";
            }
            if (statOrMisc.indexOf("Crushing") > -1 || statOrMisc.indexOf("Critical") > -1 || statOrMisc.indexOf("Blocked") > -1 || statOrMisc.indexOf("Resist") > -1) {
              damageTakenTotalData.entries.forEach(function (damage, damageCount) {
                if (damage.guid == 1) {
                  if (damage.sources != null && damage.sources.length > 0) {
                    if (damage.hitdetails != null) {
                      damage.hitdetails.forEach(function (hitdetail, missdetailCount) {
                        if (hitdetail.type != null && hitdetail.type.indexOf(searchType) > -1)
                          amount += hitdetail.count;
                      })
                    }
                  } else if (damage.subentries != null) {
                    damage.subentries.forEach(function (subentry, subentryCount) {
                      if (subentry.sources != null && subentry.sources.length > 0) {
                        if (subentry.hitdetails != null) {
                          subentry.hitdetails.forEach(function (hitdetail, missdetailCount) {
                            if (hitdetail.type != null && hitdetail.type.indexOf(searchType) > -1)
                              amount += hitdetail.count;
                          })
                        }
                      }
                    })
                  }
                  totalDamageTakenUses += damage.hitCount;
                  if (damage.missCount != null && damage.missCount > 0)
                    totalDamageTakenUses += damage.missCount;
                }
              })
              if (amount > 0)
                statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = amount + " (" + Math.round(amount * 1000 / totalDamageTakenUses) / 10 + "%)";
              else
                statsAndMiscArr[statOrMiscCount + 1][playerDoneCount + classDoneCount + 1] = "";
            }
          }
        })

        //fill in trinkets and racials
        if (playerDoneCount == 0) {
          copyRowStyles(conf, sheet, confTrinketsAndRacialsToTrack, trinketsAndRacialsToTrack.length, trinketsAndRacials.getRow() + 1, trinketsAndRacials.getColumn(), maxColumns, true, "right", darkMode);

          var confColumnWidth = conf.getColumnWidth(confTrinketsAndRacialsToTrack.getColumn());
          if (confColumnWidth > maxColumnWidth) {
            maxColumnWidth = confColumnWidth;
          }
        }
        trinketsAndRacialsToTrack.forEach(function (trinketOrRacial, trinketOrRacialCount) {
          var amount = 0;
          var uptime = 0;
          var cdMultiplesOfActive = 0;
          if (trinketOrRacial.indexOf("--") > -1 && trinketOrRacial.indexOf("++") > -1 && (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)))
            cdMultiplesOfActive = trinketOrRacial.split("--")[1] * 100 / trinketOrRacial.split("++")[1];
          if (trinketsAndRacialsArr[trinketOrRacialCount + 1] == null || trinketsAndRacialsArr[trinketOrRacialCount + 1].length == 0) {
            trinketsAndRacialsArr[trinketOrRacialCount + 1] = [];
            if (trinketOrRacial.indexOf("--") > -1 && (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0))) {
              var cooldownInSeconds = trinketOrRacial.split("--")[1];
              /*if (cooldownInSeconds > 0)
                trinketsAndRacialsArr[trinketOrRacialCount + 1].push(trinketOrRacial.split(" [")[0].split(" {")[0] + " [max. " + (Math.floor(Math.abs(raidDuration) / 1000 / cooldownInSeconds) + 1) + "]");
              else*/
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push(trinketOrRacial.split(" [")[0].split(" {")[0]);
            }
            else
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push(trinketOrRacial.split(" [")[0].split(" {")[0]);
          }
          if (trinketOrRacial.indexOf("Arcanite Dragonling") > -1) {
            amount += usedArcaniteDragonling;
          } else if (trinketOrRacial.indexOf("Spell Vulnerability") > -1 && !onlyTrash) {
            debuffsAppliedDataBosses.auras.forEach(function (debuff, debuffCount) {
              if (debuff.guid.toString() == trinketOrRacial.split("[")[1].split("]")[0]) {
                amount += debuff.bands.length;
                uptime = Math.round(debuff.totalUptime * 100 / totalTimeElapsedRaw);
              }
            })
          } else {
            var checkAura = false;
            if (trinketOrRacial.indexOf("{") > -1 && trinketOrRacial.split("{")[1].split("}")[0] == "true") {
              checkAura = true;
            }
            if (checkAura) {
              buffsData.auras.forEach(function (spell, spellCount) {
                if (trinketOrRacial.indexOf("[") > -1) {
                  trinketOrRacial.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                    if (spellId == spell.guid.toString()) {
                      amount += spell.bands.length;
                      if (cdMultiplesOfActive > 0) {
                        uptime = Math.round((spell.totalUptime * 100 / Math.abs(raidDuration) * cdMultiplesOfActive) / 100);
                      } else
                        uptime = Math.round(spell.totalUptime * 100 / totalTimeElapsedRaw);
                    }
                  })
                }
              })
            } else {
              playerData.entries.forEach(function (spell, spellCount) {
                if (trinketOrRacial.indexOf("[") > -1) {
                  trinketOrRacial.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                    if (spellId == spell.guid.toString()) {
                      amount += spell.total;
                      if (cdMultiplesOfActive > 0) {
                        uptime = Math.round((spell.uptime * 100 / Math.abs(raidDuration) * cdMultiplesOfActive) / 100);
                      }
                      else
                        uptime = Math.round(spell.uptime * 100 / totalTimeElapsedRaw);
                    }
                  })
                }
              })
            }
          }
          if (previousClass != playerByNameAsc.type)
            trinketsAndRacialsArr[trinketOrRacialCount + 1].push("");
          if (amount == 0) {
            if (trinketOrRacial.indexOf("Berserking") > -1)
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push("");
            else if (trinketOrRacial.indexOf("Blood Fury") > -1)
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push("");
            else if (trinketOrRacial.indexOf("War Stomp") > -1)
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push("");
            else if (trinketOrRacial.indexOf("Will of the Forsaken") > -1)
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push("");
            else if (trinketOrRacial.indexOf("Arcanite Dragonling") > -1)
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push("----------");
            else
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push("");
          }
          else {
            if (trinketOrRacial.indexOf("Arcanite Dragonling") > -1)
              trinketsAndRacialsArr[trinketOrRacialCount + 1].push("dmg done");
            else {
              if (uptime > 0 && (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)))
                trinketsAndRacialsArr[trinketOrRacialCount + 1].push(amount + " (" + uptime + "%)");
              else {
                if (trinketOrRacial.indexOf("--") > -1 && (!onlyBosses && !onlyTrash && (onlyFightNr == null || onlyFightNr.toString().length == 0)))
                  trinketsAndRacialsArr[trinketOrRacialCount + 1].push(amount + " (" + Math.round(amount * 100 / (Math.floor(Math.abs(raidDuration) / 1000 / trinketOrRacial.split("--")[1]) + 1)) + "%)");
                else
                  trinketsAndRacialsArr[trinketOrRacialCount + 1].push(amount);
              }
            }
          }
        })

        //fill in engineering stuff
        var oilOfImmolationCount = 0;
        if (playerDoneCount == 0) {
          copyRowStyles(conf, sheet, confEngineeringToTrack, engineeringToTrack.length, engineering.getRow() + 1, engineering.getColumn(), maxColumns, true, "right", darkMode);

          var confColumnWidth = conf.getColumnWidth(confEngineeringToTrack.getColumn());
          if (confColumnWidth > maxColumnWidth) {
            maxColumnWidth = confColumnWidth;
          }
        }
        engineeringToTrack.forEach(function (engineeringCast, engineeringCastCount) {
          var amount = 0;
          var hitCount = 0;
          if (engineeringArr[engineeringCastCount + 1] == null || engineeringArr[engineeringCastCount + 1].length == 0) {
            engineeringArr[engineeringCastCount + 1] = [];
            engineeringArr[engineeringCastCount + 1].push(engineeringCast.split(" [")[0]);
          }
          playerData.entries.forEach(function (spell, spellCount) {
            if (engineeringCast.indexOf("[") > -1) {
              engineeringCast.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                if (spellId == spell.guid.toString()) {
                  amount += spell.total;
                  damageDoneData.entries.forEach(function (damDone, damDoneCount) {
                    if (damDone != null && damDone.guid != null && damDone.guid == spell.guid) {
                      hitCount += damDone.hitCount + damDone.missCount;
                      if (damDone.missCount != null && damDone.missCount > 0)
                        hitCount += damDone.missCount;
                    }
                  })
                }
              })
            }
          })
          if (previousClass != playerByNameAsc.type)
            engineeringArr[engineeringCastCount + 1].push("");
          if (amount == 0)
            engineeringArr[engineeringCastCount + 1].push("");
          else if (engineeringCast.indexOf("Immolation") < 0 && engineeringCast.indexOf("Dummy") < 0)
            engineeringArr[engineeringCastCount + 1].push(amount.toString() + " (⌀" + Math.round(hitCount / amount) + ")");
          else {
            if (engineeringCast.indexOf("Immolation") > -1)
              oilOfImmolationCount = amount;
            engineeringArr[engineeringCastCount + 1].push(amount);
          }
        })

        if (showEngineeringDmg) {
          if (engineeringArr.length == engineeringToTrack.length + 1) {
            addSingleEntryToMultiDimArray(engineeringArr, "damage done with Engineering etc. total");
            copyRangeStyle(confShowEngineeringDmg, sheet.getRange(engineering.getRow() + engineeringArr.length - 1, engineering.getColumn() + 1, 1, maxColumns), null, "center", null);
            copyRangeStyle(confShowOilOfImmolationDmg, sheet.getRange(engineering.getRow() + engineeringArr.length - 1, engineering.getColumn(), 1, 1), null, "right", null);
            if (darkMode)
              sheet.getRange(engineering.getRow() + engineeringArr.length - 1, engineering.getColumn(), 1, 1).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
          }
          if (previousClass != playerByNameAsc.type) {
            engineeringArr[engineeringToTrack.length + 1].push("");
          }
          if (damageTakenEngineeringData.entries.length > 0) {
            var totalEngineeringDamage = 0;
            damageTakenEngineeringData.entries.forEach(function (damageTakenEngineeringDataEntry, damageTakenEngineeringDataEntryCount) {
              if (damageTakenEngineeringDataEntry.id == playerByNameAsc.id)
                totalEngineeringDamage = totalEngineeringDamage + damageTakenEngineeringDataEntry.total;
            })
            if (totalEngineeringDamage > 0)
              engineeringArr[engineeringToTrack.length + 1].push(totalEngineeringDamage);
            else
              engineeringArr[engineeringToTrack.length + 1].push("");
          } else
            engineeringArr[engineeringToTrack.length + 1].push("");
        }

        if (showOilOfImmolationDmg) {
          if (engineeringArr.length == engineeringToTrack.length + 1 + bonusEngi) {
            addSingleEntryToMultiDimArray(engineeringArr, "damage done only with Oil of Immolation");
            copyRangeStyle(confShowOilOfImmolationDmg, sheet.getRange(engineering.getRow() + engineeringArr.length - 1, engineering.getColumn() + 1, 1, maxColumns), null, "center", null);
            if (darkMode)
              sheet.getRange(engineering.getRow() + engineeringArr.length - 1, engineering.getColumn() + 1, 1, maxColumns).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
            copyRangeStyle(confShowOilOfImmolationDmg, sheet.getRange(engineering.getRow() + engineeringArr.length - 1, engineering.getColumn(), 1, 1), null, "right", null);
            if (darkMode)
              sheet.getRange(engineering.getRow() + engineeringArr.length - 1, engineering.getColumn(), 1, 1).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
          }
          if (previousClass != playerByNameAsc.type)
            engineeringArr[engineeringArr.length - 1].push("");
          if (damageTakenOilOfImmoData.entries.length > 0) {
            var totalOilOfImmolationDamage = 0;
            damageTakenOilOfImmoData.entries.forEach(function (damageTakenOilOfImmoDataEntry, damageTakenOilOfImmoDataEntryCount) {
              if (damageTakenOilOfImmoDataEntry.id == playerByNameAsc.id)
                totalOilOfImmolationDamage = totalOilOfImmolationDamage + damageTakenOilOfImmoDataEntry.total;
            })
            if (totalOilOfImmolationDamage > 0)
              engineeringArr[engineeringArr.length - 1].push(totalOilOfImmolationDamage);
            else {
              if (oilOfImmolationCount > 0)
                engineeringArr[engineeringArr.length - 1].push(0);
              else
                engineeringArr[engineeringArr.length - 1].push("");
            }
          } else {
            if (oilOfImmolationCount > 0)
              engineeringArr[engineeringArr.length - 1].push(0);
            else
              engineeringArr[engineeringArr.length - 1].push("");
          }
        }

        //fill in other casts
        if (playerDoneCount == 0) {
          copyRowStyles(conf, sheet, confOtherCastsToTrack, otherCastsToTrack.length, otherCasts.getRow() + 1, otherCasts.getColumn(), maxColumns, true, "right", darkMode);

          var confColumnWidth = conf.getColumnWidth(confOtherCastsToTrack.getColumn());
          if (confColumnWidth > maxColumnWidth) {
            maxColumnWidth = confColumnWidth;
          }
        }
        otherCastsToTrack.forEach(function (otherCast, otherCastCount) {
          var amount = 0;
          var debuffIdString = otherCast.split("[")[1].split("]")[0];
          var otherCastString = "";
          if (otherCastsArr[otherCastCount + 1] == null || otherCastsArr[otherCastCount + 1].length == 0) {
            otherCastsArr[otherCastCount + 1] = [];
            otherCastString = otherCast.split(" [")[0].split(" {")[0];
            if (!onlyTrash && otherCast.indexOf("uptime") > -1 && otherCast.indexOf("total") < 0 && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
              otherCastString = otherCastString.replace("%)", "% - overall: " + getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedDataBossesTotal, totalTimeElapsedBosses) + "%)");
            } else if (otherCast.indexOf("uptime") > -1) {
              otherCastString = otherCastString.replace("%)", "% - overall: " + getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedDataTotal, totalTimeElapsedRaw) + "%)");
            }
            otherCastsArr[otherCastCount + 1].push(otherCastString);
          }
          playerData.entries.forEach(function (spell, spellCount) {
            if (otherCast.indexOf("[") > -1) {
              otherCast.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                if (spellId == spell.guid.toString()) {
                  if (otherCast.indexOf("Greater Stoneshield") > -1)
                    amount += GreaterStoneshieldUses;
                  else if (otherCast.indexOf("Invulnerability") > -1)
                    amount += LIPUses;
                  else if (otherCast.indexOf("Free Action") > -1)
                    amount += FAPUses;
                  else if (otherCast.indexOf("Restorative") > -1)
                    amount += RestorativeUses;
                  else
                    amount += spell.total;
                }
              })
            }
          })
          if (previousClass != playerByNameAsc.type)
            otherCastsArr[otherCastCount + 1].push("");
          if (otherCast.indexOf("Gift of Arthas") > -1) {
            if (!onlyTrash && otherCast.indexOf("uptime") > -1 && otherCast.indexOf("total") < 0 && (onlyFightNr == null || onlyFightNr.toString().length == 0)) {
              var amount = getAmountForDebuffSpellId(debuffIdString, debuffsAppliedDataBosses, totalTimeElapsedBosses);
              if (amount > 0)
                otherCastsArr[otherCastCount + 1].push(amount + " (" + getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedDataBosses, totalTimeElapsedBosses) + "%)");
              else
                otherCastsArr[otherCastCount + 1].push("");
            } else {
              var amount = getAmountForDebuffSpellId(debuffIdString, debuffsAppliedData, totalTimeElapsedRaw);
              if (amount > 0)
                otherCastsArr[otherCastCount + 1].push(amount + " (" + getUptimeForDebuffSpellId(debuffIdString, debuffsAppliedData, totalTimeElapsedRaw) + "%)");
              else
                otherCastsArr[otherCastCount + 1].push("");
            }
          } else {
            if (amount == 0)
              otherCastsArr[otherCastCount + 1].push("");
            else
              otherCastsArr[otherCastCount + 1].push(amount);
          }
        })
        if (showUsedTemporaryWeaponEnchant) {
          if (otherCastsArr.length == otherCastsToTrack.length + 1) {
            if ((zoneFound == "1006" || zoneFound == "2006"))
              addSingleEntryToMultiDimArray(otherCastsArr, "temporary enchant uptime (1+ consecr./blessed?)");
            else
              addSingleEntryToMultiDimArray(otherCastsArr, "temporary enchant uptime");
            copyRangeStyle(confShowOilOfImmolationDmg, sheet.getRange(otherCasts.getRow() + otherCastsArr.length - 1, otherCasts.getColumn() + 1, 1, maxColumns), null, "center", null);
            if (darkMode)
              sheet.getRange(otherCasts.getRow() + otherCastsArr.length - 1, otherCasts.getColumn() + 1, 1, maxColumns).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
            copyRangeStyle(confShowOilOfImmolationDmg, sheet.getRange(otherCasts.getRow() + otherCastsArr.length - 1, otherCasts.getColumn(), 1, 1), null, "right", null);
            if (darkMode)
              sheet.getRange(otherCasts.getRow() + otherCastsArr.length - 1, otherCasts.getColumn(), 1, 1).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
          }
          if (previousClass != playerByNameAsc.type)
            otherCastsArr[otherCastsArr.length - 1].push("");
          otherCastsArr[otherCastsArr.length - 1].push(usedTemporaryWeaponEnchant);
        }

        //fill in absorbs
        var totalAmount = 0;
        if (playerDoneCount == 0) {
          copyRowStyles(conf, sheet, confAbsorbsToTrack, absorbsToTrack.length, absorbs.getRow() + 1, absorbs.getColumn(), maxColumns, true, "right", darkMode);

          var confColumnWidth = conf.getColumnWidth(confAbsorbsToTrack.getColumn());
          if (confColumnWidth > maxColumnWidth) {
            maxColumnWidth = confColumnWidth;
          }
        }
        absorbsToTrack.forEach(function (absorbCast, absorbCastCount) {
          var amount = 0;
          if (absorbsArr[absorbCastCount + 1] == null || absorbsArr[absorbCastCount + 1].length == 0) {
            absorbsArr[absorbCastCount + 1] = [];
            if (absorbCast.indexOf("Power Word: Shield") > -1)
              absorbsArr[absorbCastCount + 1].push(absorbCast.split(" [")[0] + " (excluded from total absorbed!)");
            else
              absorbsArr[absorbCastCount + 1].push(absorbCast.split(" [")[0]);
          }
          healingData.entries.forEach(function (spell, spellCount) {
            if (absorbCast.indexOf("[") > -1) {
              absorbCast.split("[")[1].split("]")[0].split(",").forEach(function (spellId, spellIdCount) {
                if (spellId == spell.guid.toString()) {
                  amount += spell.total;
                }
              })
            }
          })
          if (previousClass != playerByNameAsc.type)
            absorbsArr[absorbCastCount + 1].push("");
          if (amount == 0)
            absorbsArr[absorbCastCount + 1].push("");
          else
            absorbsArr[absorbCastCount + 1].push(amount);
          if (absorbCast.indexOf("Power Word: Shield") < 0)
            totalAmount += amount;
        })
        if (absorbsArr.length == absorbsToTrack.length + 1) {
          addSingleEntryToMultiDimArray(absorbsArr, "total absorbed");
          sheet.getRange(absorbs.getRow() + absorbsArr.length - 1, absorbs.getColumn(), 1, maxColumns + 1).setFontStyle("italic");
          sheet.getRange(absorbs.getRow() + absorbsArr.length - 1, absorbs.getColumn(), 1, 1).setHorizontalAlignment("right");
          copyRangeStyle(confTotalAndInformationRowsDefaultTemplate, sheet.getRange(absorbs.getRow() + absorbsArr.length - 1, absorbs.getColumn() + 1, 1, maxColumns).setFontStyle("italic"), null, "center", null);
        }
        if (previousClass != playerByNameAsc.type)
          absorbsArr[absorbsArr.length - 1].push("");
        absorbsArr[absorbsArr.length - 1].push(totalAmount);

        //fill in interrupts)
        if (showInterruptedSpells) {
          var interruptedTotal = 0;
          var interruptedString = "";
          interruptedData.entries[0].entries.forEach(function (spell, spellCount) {
            if (spell != null && spell.guid != null) {
              var targets = "";
              if (spell.details != null) {
                spell.details.forEach(function (spellDetail, spellDetailCount) {
                  if (spellDetail.id == playerByNameAsc.id) {
                    spellDetail.actors.forEach(function (target, targetCount) {
                      var targetNameStripped = target.name.replace(/\s\d+/g, '');
                      if (targets.indexOf(targetNameStripped) < 0) {
                        if (targets == "")
                          targets += targetNameStripped;
                        else
                          targets += targetNameStripped;
                      }
                    })
                    if (interruptedTotal == 0)
                      interruptedString += spell.name + " (" + targets + ")";
                    else
                      interruptedString += ", " + spell.name + " (" + targets + ")";
                    interruptedTotal += spellDetail.total;
                  }
                })
              }
            }
          })
          if (interruptsArr.length == 1) {
            addSingleEntryToMultiDimArray(interruptsArr, "# of interrupted spells");
            sheet.getRange(interrupts.getRow() + 1, interrupts.getColumn(), 1, 1).setHorizontalAlignment("right").setFontSize(confShowInterruptedSpells.getFontSize()).setFontStyle(confShowInterruptedSpells.getFontStyle()).setFontWeight(confShowInterruptedSpells.getFontWeight());
            copyRangeStyle(confShowInterruptedSpells, sheet.getRange(interrupts.getRow() + 1, interrupts.getColumn() + 1, 1, maxColumns), null, "center", null);
            if (showInterruptedSpellsNamesRow) {
              addSingleEntryToMultiDimArray(interruptsArr, "names and sources of interrupted spells");
              sheet.getRange(interrupts.getRow() + 2, interrupts.getColumn(), 1, 1).setHorizontalAlignment("right").setFontSize(confShowInterruptedSpellsNamesRow.getFontSize()).setFontStyle(confShowInterruptedSpellsNamesRow.getFontStyle()).setFontWeight(confShowInterruptedSpellsNamesRow.getFontWeight());
              copyRangeStyle(confShowInterruptedSpellsNamesRow, sheet.getRange(interrupts.getRow() + 2, interrupts.getColumn() + 1, 1, maxColumns), null, "center", null);
              if (darkMode)
                sheet.getRange(interrupts.getRow() + 2, interrupts.getColumn() + 1, 1, maxColumns).setBackground("#d9d9d9").setBorder(true, true, true, true, true, true, "#d9d9d9", SpreadsheetApp.BorderStyle.SOLID);
            }
          }
          if (showInterruptedSpellsNamesRow) {
            if (previousClass != playerByNameAsc.type) {
              interruptsArr[interruptsArr.length - 2].push("");
              interruptsArr[interruptsArr.length - 1].push("");
            }
            if (interruptedTotal > 0)
              interruptsArr[interruptsArr.length - 2].push(interruptedTotal);
            else
              interruptsArr[interruptsArr.length - 2].push("");
            interruptsArr[interruptsArr.length - 1].push(interruptedString);
          }
          else {
            if (previousClass != playerByNameAsc.type) {
              interruptsArr[interruptsArr.length - 1].push("");
            }
            if (interruptedTotal > 0)
              interruptsArr[interruptsArr.length - 1].push(interruptedTotal);
            else
              interruptsArr[interruptsArr.length - 1].push("");
          }
          sheet.getRange(interrupts.getRow() + 2, interrupts.getColumn() + 1 + playerDoneCount + classDoneCount, 14, 1).merge();
        }

        //add player names to headers
        if (previousClass != playerByNameAsc.type) {
          rolesAndNames[0].push("");
          rolesAndNames[1].push("");
          rolesAndNames[2].push(playerByNameAsc.type + "s");
          sheet.getRange(singleTargetCasts.getRow() - 1, singleTargetCasts.getColumn() + playerDoneCount + classDoneCount, 1, 1).setFontWeight("bold").setHorizontalAlignment("left");
          sheet.getRange(singleTargetCasts.getRow() - 1, singleTargetCasts.getColumn() + playerDoneCount + classDoneCount + 1, 1, playersInThisClass).setFontWeight("bold").setHorizontalAlignment("center").setBackground(getColourForPlayerClass(playerByNameAsc.type)).setBorder(true, true, true, true, true, true, "#cccccc", SpreadsheetApp.BorderStyle.SOLID);
        }
        rolesAndNames[2].push(playerByNameAsc.name)
        adjustNameRow(sheet.getRange(singleTargetCasts.getRow() - 1, singleTargetCasts.getColumn() + playerDoneCount + classDoneCount + 1), playerByNameAsc.name, 1);
        var role1 = getRoleForPlayerClass(playerByNameAsc.type, dpsCount, tankCount, healerCount, dpsSpec);
        var role2 = "---";
        var roleFromSettings1 = "";
        var roleFromSettings2 = "";
        playersWithRoles.forEach(function (playerWithRole, playerWithRoleCount) {
          if (playerWithRole.split(" ")[0] == playerByNameAsc.name) {
            var parts = playerWithRole.split(" ");
            if (parts.length > 1) {
              if (parts[1].indexOf("---") > -1)
                roleFromSettings1 = parts[1];
              else
                roleFromSettings1 = parts[1];
            }
            if (parts.length > 2) {
              if (parts[2].indexOf("---") > -1)
                roleFromSettings2 = parts[2];
              else
                roleFromSettings2 = parts[2];
            }
          }
        })
        if ((roleFromSettings1 != "" || roleFromSettings2 != "") && (roleFromSettings1 == role1 || roleFromSettings2 == role1)) {
          rolesAndNames[0].push(roleFromSettings1);
          rolesAndNames[1].push(roleFromSettings2);
        } else {
          rolesAndNames[0].push(role1);
          rolesAndNames[1].push(role2);
        }

        if (previousClass != playerByNameAsc.type) {
          previousClass = playerByNameAsc.type;
        }
        playerDoneCount++;
      }
    })
    if (maxColumnWidth > 335)
      sheet.setColumnWidth(2, maxColumnWidth);
    if (singleTargetCastsArr != null)
      singleTargetCasts.setValues(singleTargetCastsArr);
    if (aoeCastsArr != null)
      aoeCasts.setValues(aoeCastsArr);
    if (secondsActiveArr != null)
      secondsActive.setValues(fillUpMultiDimArrayWithEmptyValues(secondsActiveArr, maxColumns));
    damageTaken.setValues(fillUpMultiDimArrayWithEmptyValues(damageTakenArr, maxColumns));
    debuffs.setValues(fillUpMultiDimArrayWithEmptyValues(debuffsArr, maxColumns));
    if (classCooldownsArr != null)
      classCooldowns.setValues(classCooldownsArr);
    statsAndMisc.setValues(fillUpMultiDimArrayWithEmptyValues(statsAndMiscArr, maxColumns));
    trinketsAndRacials.setValues(fillUpMultiDimArrayWithEmptyValues(trinketsAndRacialsArr, maxColumns));
    engineering.setValues(fillUpMultiDimArrayWithEmptyValues(engineeringArr, maxColumns));
    otherCasts.setValues(fillUpMultiDimArrayWithEmptyValues(otherCastsArr, maxColumns));
    absorbs.setValues(fillUpMultiDimArrayWithEmptyValues(absorbsArr, maxColumns));
    if (showInterruptedSpells)
      interrupts.setValues(fillUpMultiDimArrayWithEmptyValues(interruptsArr, maxColumns));
    sheet.getRange(singleTargetCasts.getRow() - 3, singleTargetCasts.getColumn() + 1, rolesAndNames.length, rolesAndNames[0].length).setValues(rolesAndNames);

    var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    for (var i = 0; i < protections.length; i++) {
      if (protections[i].getDescription() == 'removed after Start') {
        protections[i].remove();
      }
    }
    sheet.hideColumns(singleTargetCasts.getColumn() + playerDoneCount + classDoneCount + 1, maxColumns - singleTargetCasts.getColumn() - playerDoneCount - classDoneCount + 2);
    if (darkMode)
      sheet.getRange(4, 63).setFontColor("#d9d9d9").setValue("done");
    else
      sheet.getRange(4, 63).setFontColor("white").setValue("done");
    sheet.getRange(noMessagesRange.getRow() + 1, noMessagesRange.getColumn() - 4).setValue('Step 6 is done. Please adjust the roles of the players.');
    sheet.getRange(noMessagesRange.getRow() + 2, noMessagesRange.getColumn() - 4).setValue('Afterwards please click "7. Export roles".');
  }
  try {
    var conf_del = ss.getSheetByName("configAll" + rnd);
    ss.deleteSheet(conf_del);
  } catch (err) { }
}

// Web App Endpoint Functions for external integration
// NOTE: doPost function moved to CreateRpbBackup.gs to avoid conflicts
// This function is disabled - all web app routing now handled by merged doPost
function doPostRPB_DISABLED(e) {
  // This function has been disabled to avoid conflicts with the merged doPost in CreateRpbBackup.gs
  // All RPB actions are now routed through the merged doPost function
  return ContentService
    .createTextOutput(JSON.stringify({
      success: false, 
      error: 'This doPost function is disabled. Use the merged doPost in CreateRpbBackup.gs instead.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

function startRPBProcessing(logUrl) {
  var startTime = new Date();
  var executionId = 'RPB_' + startTime.getTime(); // Unique execution ID
  var ss, instructionsSheet, statusCell;
  
  try {
    console.log('🚀 [WEB APP] Starting RPB processing for URL:', logUrl);
    console.log('🆔 [WEB APP] Execution ID:', executionId);
    console.log('🕐 [WEB APP] Start time:', startTime.toISOString());
    
    // Get spreadsheet and Instructions sheet (F11 already cleared in Phase 1)
    console.log('📊 [WEB APP] PHASE 2: Getting active spreadsheet...');
    ss = SpreadsheetApp.getActiveSpreadsheet();
    console.log('📊 [WEB APP] Got spreadsheet:', ss.getName(), '- ID:', ss.getId());
    
    console.log('📋 [WEB APP] Getting Instructions sheet...');
    instructionsSheet = ss.getSheetByName("Instructions");
    if (!instructionsSheet) {
      throw new Error('Could not find Instructions sheet in spreadsheet');
    }
    console.log('📋 [WEB APP] Found Instructions sheet');
    
    // Get status cell (should be empty from Phase 1)
    console.log('📍 [WEB APP] Getting F11 status cell...');
    statusCell = instructionsSheet.getRange("F11");
    var currentStatus = statusCell.getValue();
    console.log('📍 [WEB APP] F11 status after Phase 1 clearing:', currentStatus);
    
    // Set to PROCESSING (F11 should already be empty from Phase 1)
    console.log('⏳ [WEB APP] Setting status to PROCESSING (Phase 1 already cleared F11)');
    statusCell.setValue("PROCESSING - Initializing... [" + executionId + "]");
    SpreadsheetApp.flush();
    console.log('✅ [WEB APP] Status set to PROCESSING with execution ID');
    
    // Insert the log URL into E11 (where RPB expects it)
    console.log('📝 [WEB APP] Setting log URL in E11:', logUrl);
    var urlCell = instructionsSheet.getRange("E11");
    var currentUrl = urlCell.getValue();
    console.log('📝 [WEB APP] Current E11 value:', currentUrl);
    urlCell.setValue(logUrl);
    console.log('📝 [WEB APP] Set new E11 value:', logUrl);
    
    // Flush changes to ensure they're saved before proceeding
    console.log('💾 [WEB APP] Flushing spreadsheet changes...');
    SpreadsheetApp.flush();
    console.log('💾 [WEB APP] Spreadsheet changes flushed');
    
    // Update status to indicate main processing is starting
    console.log('⏳ [WEB APP] Updating status to main processing...');
    statusCell.setValue("PROCESSING - Running analysis... [" + executionId + "]");
    SpreadsheetApp.flush();
    
    // Wait a moment for changes to settle
    console.log('⏸️ [WEB APP] Brief pause before starting analysis...');
    Utilities.sleep(500);
    
    // Run the RPB analysis
    console.log('🔄 [WEB APP] Starting generateAllSheet()...');
    var analysisStartTime = new Date();
    
    try {
      generateAllSheet();
      var analysisEndTime = new Date();
      var analysisDuration = (analysisEndTime - analysisStartTime) / 1000;
      console.log('✅ [WEB APP] generateAllSheet() completed successfully in', analysisDuration, 'seconds');
      
      // CRITICAL: Verify that the analysis actually did something by checking the "All" sheet
      var allSheet = ss.getSheetByName("All");
      if (allSheet) {
        var lastRow = allSheet.getLastRow();
        var lastCol = allSheet.getLastColumn();
        console.log('📊 [WEB APP] "All" sheet verification - Last row:', lastRow, 'Last col:', lastCol);
        
        if (lastRow <= 1 || lastCol <= 1) {
          throw new Error('generateAllSheet() completed but "All" sheet appears to be empty (lastRow: ' + lastRow + ', lastCol: ' + lastCol + ')');
        }
        console.log('✅ [WEB APP] "All" sheet verification passed - sheet has data');
      } else {
        throw new Error('generateAllSheet() completed but "All" sheet not found');
      }
      
    } catch (analysisError) {
      console.error('❌ [WEB APP] generateAllSheet() FAILED:', analysisError.toString());
      console.error('❌ [WEB APP] generateAllSheet() error stack:', analysisError.stack);
      console.error('❌ [WEB APP] generateAllSheet() error name:', analysisError.name);
      
      // Check if this is the specific sheet ID error
      if (analysisError.toString().includes("doesn't exist")) {
        console.error('🔍 [WEB APP] SHEET ID ERROR DETECTED');
        console.error('🔍 [WEB APP] This appears to be a sheet reference issue in the RPB script');
        console.error('🔍 [WEB APP] The RPB script may be trying to reference a temporary sheet that was deleted or never created');
        
        // Try to get current sheet list for debugging
        try {
          var currentSheets = ss.getSheets();
          console.log('📊 [WEB APP] Current sheets in spreadsheet:', currentSheets.map(function(sheet) { 
            return sheet.getName() + ' (ID: ' + sheet.getSheetId() + ')'; 
          }));
        } catch (sheetListError) {
          console.error('❌ [WEB APP] Could not list current sheets:', sheetListError.toString());
        }
      }
      
      // Set specific error status with truncated message
      var errorMessage = "ERROR: " + analysisError.toString() + " [" + executionId + "]";
      if (errorMessage.length > 1000) {
        errorMessage = errorMessage.substring(0, 997) + "...";
      }
      statusCell.setValue(errorMessage);
      SpreadsheetApp.flush();
      
      throw new Error('RPB analysis failed: ' + analysisError.toString());
    }
    
    // Set final status to COMPLETE
    console.log('🎉 [WEB APP] Setting final status to COMPLETE in F11');
    var expectedStatus = "COMPLETE [" + executionId + "]";
    statusCell.setValue(expectedStatus);
    SpreadsheetApp.flush();
    console.log('🎉 [WEB APP] Status set to COMPLETE and flushed');
    
    // CRITICAL: Verify that F11 actually shows the expected status
    var finalStatus = statusCell.getValue();
    console.log('🔍 [WEB APP] Final status verification - F11 value:', finalStatus);
    
    if (finalStatus !== expectedStatus) {
      throw new Error('Status verification failed: Expected "' + expectedStatus + '" but F11 shows "' + finalStatus + '"');
    }
    console.log('✅ [WEB APP] Final status verification passed');
    
    var totalDuration = (new Date() - startTime) / 1000;
    console.log('🏁 [WEB APP] Total processing completed successfully in', totalDuration, 'seconds');
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true, 
        status: "COMPLETE",
        message: "RPB processing completed successfully",
        duration: totalDuration,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    var errorTime = new Date();
    var errorDuration = (errorTime - startTime) / 1000;
    
    console.error('❌ [WEB APP] RPB processing FAILED after', errorDuration, 'seconds');
    console.error('❌ [WEB APP] Error message:', error.message);
    console.error('❌ [WEB APP] Error toString:', error.toString());
    console.error('❌ [WEB APP] Error stack:', error.stack);
    console.error('❌ [WEB APP] Error name:', error.name);
    
    // Try to set error status in F11
    try {
      console.log('📝 [WEB APP] Attempting to set error status in F11...');
      if (!ss) {
        console.log('📊 [WEB APP] Spreadsheet reference lost, getting it again...');
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
      if (!statusCell) {
        console.log('📍 [WEB APP] Status cell reference lost, getting it again...');
        instructionsSheet = ss.getSheetByName("Instructions");
        statusCell = instructionsSheet.getRange("F11");
      }
      
      var errorMessage = "ERROR: " + error.toString();
      // Truncate error message if too long for cell (Google Sheets limit)
      if (errorMessage.length > 1000) {
        errorMessage = errorMessage.substring(0, 997) + "...";
        console.log('⚠️ [WEB APP] Error message truncated due to length');
      }
      
      console.log('📝 [WEB APP] Setting error status:', errorMessage);
      statusCell.setValue(errorMessage);
      SpreadsheetApp.flush();
      console.log('📝 [WEB APP] Error status set and flushed');
      
    } catch (statusError) {
      console.error('❌ [WEB APP] CRITICAL: Failed to set error status in F11:', statusError.toString());
      console.error('❌ [WEB APP] Status error stack:', statusError.stack);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false, 
        status: "ERROR",
        error: error.toString(),
        duration: errorDuration,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function checkRPBStatus() {
  try {
    var checkTime = new Date();
    var checkId = 'CHECK_' + checkTime.getTime();
    console.log('🔍 [STATUS CHECK] Checking RPB status...');
    console.log('🆔 [STATUS CHECK] Check ID:', checkId);
    console.log('🕐 [STATUS CHECK] Check time:', checkTime.toISOString());
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    console.log('📊 [STATUS CHECK] Got spreadsheet:', ss.getName(), 'ID:', ss.getId());
    
    var instructionsSheet = ss.getSheetByName("Instructions");
    if (!instructionsSheet) {
      throw new Error('Instructions sheet not found');
    }
    console.log('📋 [STATUS CHECK] Found Instructions sheet');
    
    var statusCell = instructionsSheet.getRange("F11");
    var status = statusCell.getValue();
    console.log('📍 [STATUS CHECK] F11 status value:', status);
    
    var normalizedStatus = status || "IDLE";
    console.log('✅ [STATUS CHECK] Returning status as-is:', normalizedStatus);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        status: normalizedStatus,
        rawStatus: status,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ [STATUS CHECK] Failed to check status:', error.toString());
    console.error('❌ [STATUS CHECK] Error stack:', error.stack);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function clearRPBStatus() {
  try {
    var clearTime = new Date();
    console.log('🧹 [CLEAR STATUS] Clearing RPB completion status...');
    console.log('🕐 [CLEAR STATUS] Clear time:', clearTime.toISOString());
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    console.log('📊 [CLEAR STATUS] Got spreadsheet:', ss.getName());
    
    var instructionsSheet = ss.getSheetByName("Instructions");
    if (!instructionsSheet) {
      throw new Error('Instructions sheet not found');
    }
    console.log('📋 [CLEAR STATUS] Found Instructions sheet');
    
    var statusCell = instructionsSheet.getRange("F11");
    var currentStatus = statusCell.getValue();
    console.log('📍 [CLEAR STATUS] Current F11 status:', currentStatus);
    
    // Clear the status cell
    statusCell.setValue("");
    SpreadsheetApp.flush();
    console.log('✅ [CLEAR STATUS] F11 status cleared successfully');
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: "Status cleared successfully",
        previousStatus: currentStatus,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ [CLEAR STATUS] Failed to clear status:', error.toString());
    console.error('❌ [CLEAR STATUS] Error stack:', error.stack);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function clearF11Only() {
  try {
    var clearTime = new Date();
    console.log('🧹 [CLEAR F11] PHASE 1: Clearing F11 cell only...');
    console.log('🕐 [CLEAR F11] Clear time:', clearTime.toISOString());
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    console.log('📊 [CLEAR F11] Got spreadsheet:', ss.getName());
    
    var instructionsSheet = ss.getSheetByName("Instructions");
    if (!instructionsSheet) {
      throw new Error('Instructions sheet not found');
    }
    console.log('📋 [CLEAR F11] Found Instructions sheet');
    
    var statusCell = instructionsSheet.getRange("F11");
    var currentStatus = statusCell.getValue();
    console.log('📍 [CLEAR F11] Current F11 status before clearing:', currentStatus);
    
    // Clear the status cell
    statusCell.setValue("");
    SpreadsheetApp.flush();
    console.log('✅ [CLEAR F11] F11 status cleared successfully - ready for new run');
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: "F11 cleared successfully - ready for Phase 2",
        previousStatus: currentStatus,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ [CLEAR F11] Failed to clear F11:', error.toString());
    console.error('❌ [CLEAR F11] Error stack:', error.stack);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function clearRPBStatus() {
  try {
    var clearTime = new Date();
    console.log('🧹 [CLEAR STATUS] Clearing RPB completion status...');
    console.log('🕐 [CLEAR STATUS] Clear time:', clearTime.toISOString());
    
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    console.log('📊 [CLEAR STATUS] Got spreadsheet:', ss.getName());
    
    var instructionsSheet = ss.getSheetByName("Instructions");
    if (!instructionsSheet) {
      throw new Error('Instructions sheet not found');
    }
    console.log('📋 [CLEAR STATUS] Found Instructions sheet');
    
    var statusCell = instructionsSheet.getRange("F11");
    var currentStatus = statusCell.getValue();
    console.log('📍 [CLEAR STATUS] Current F11 status:', currentStatus);
    
    // Clear the status cell
    statusCell.setValue("");
    SpreadsheetApp.flush();
    console.log('✅ [CLEAR STATUS] F11 status cleared successfully');
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        message: "Status cleared successfully",
        previousStatus: currentStatus,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('❌ [CLEAR STATUS] Failed to clear status:', error.toString());
    console.error('❌ [CLEAR STATUS] Error stack:', error.stack);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Test function to verify the modification works
function testGenerateAllSheet() {
  try {
    // This should now work even when called from the script editor
    generateAllSheet();
    console.log("SUCCESS: generateAllSheet() executed without active sheet dependency");
    return true;
  } catch (error) {
    console.error("ERROR: generateAllSheet() failed:", error);
    return false;
  }
}

// Archive RPB Results Functions
function archiveRPBResults() {
  var startTime = new Date();
  
  try {
    console.log('🗂️ [ARCHIVE] Starting archive process...');
    console.log('🕐 [ARCHIVE] Start time:', startTime.toISOString());
    
    // Master RPB Sheet ID (the one we run analysis on)
    const masterSheetId = '11Y9nIYRdxPsQivpQGaK1B0Mc-tbnCR45A1I4-RaKvyk';
    console.log('🆔 [ARCHIVE] Master sheet ID:', masterSheetId);
    
    // Target folder ID for archives (your public Google Drive folder)
    const archiveFolderId = '1s3vf73brH783FfDlJLXYsAjDSJTU65tx';
    console.log('📁 [ARCHIVE] Archive folder ID:', archiveFolderId);
    
    // Generate filename with current date
    const today = new Date();
    const dateString = formatDateForFilename(today);
    const fileName = `RPB-${dateString}`;
    console.log('📝 [ARCHIVE] Generated filename:', fileName);
    
    // Get the master spreadsheet
    console.log('📊 [ARCHIVE] Opening master spreadsheet...');
    const masterSpreadsheet = SpreadsheetApp.openById(masterSheetId);
    console.log('📊 [ARCHIVE] Opened master spreadsheet:', masterSpreadsheet.getName());
    
    console.log('📋 [ARCHIVE] Getting "All" sheet from master...');
    const allSheet = masterSpreadsheet.getSheetByName('All');
    
    if (!allSheet) {
      throw new Error('Could not find "All" tab in master sheet');
    }
    console.log('📋 [ARCHIVE] Found "All" sheet');
    
    // Create new spreadsheet in the archive folder
    console.log('🆕 [ARCHIVE] Creating new spreadsheet...');
    const newSpreadsheet = SpreadsheetApp.create(fileName);
    const newSpreadsheetId = newSpreadsheet.getId();
    console.log('🆕 [ARCHIVE] Created new spreadsheet with ID:', newSpreadsheetId);
    
    // Move the new spreadsheet to the archive folder
    console.log('📁 [ARCHIVE] Moving spreadsheet to archive folder...');
    const file = DriveApp.getFileById(newSpreadsheetId);
    console.log('📁 [ARCHIVE] Got file reference');
    
    const folder = DriveApp.getFolderById(archiveFolderId);
    console.log('📁 [ARCHIVE] Got folder reference');
    
    // Remove from root and add to archive folder
    console.log('📁 [ARCHIVE] Removing from root folder...');
    DriveApp.getRootFolder().removeFile(file);
    console.log('📁 [ARCHIVE] Adding to archive folder...');
    folder.addFile(file);
    console.log('📁 [ARCHIVE] File moved successfully');
    
    // Copy the "All" sheet to the new spreadsheet
    console.log('📋 [ARCHIVE] Copying "All" sheet to new spreadsheet...');
    const copiedSheet = allSheet.copyTo(newSpreadsheet);
    console.log('📋 [ARCHIVE] Sheet copied, setting name to "All"...');
    copiedSheet.setName('All');
    console.log('📋 [ARCHIVE] Sheet renamed successfully');
    
    // Remove the default "Sheet1" that was created
    console.log('🗑️ [ARCHIVE] Removing default "Sheet1"...');
    const defaultSheet = newSpreadsheet.getSheetByName('Ark1');
    if (defaultSheet) {
      newSpreadsheet.deleteSheet(defaultSheet);
      console.log('🗑️ [ARCHIVE] Default sheet removed');
    } else {
      console.log('⚠️ [ARCHIVE] No default "Sheet1" found to remove');
    }
    
    // Get the URL of the new spreadsheet
    const newSheetUrl = newSpreadsheet.getUrl();
    console.log('🔗 [ARCHIVE] New spreadsheet URL:', newSheetUrl);
    
    var totalDuration = (new Date() - startTime) / 1000;
    console.log('✅ [ARCHIVE] Archive completed successfully in', totalDuration, 'seconds');
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        fileName: fileName,
        sheetUrl: newSheetUrl,
        sheetId: newSpreadsheetId,
        message: 'RPB results archived successfully',
        duration: totalDuration,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    var errorDuration = (new Date() - startTime) / 1000;
    
    console.error('❌ [ARCHIVE] Archive creation FAILED after', errorDuration, 'seconds');
    console.error('❌ [ARCHIVE] Error message:', error.message);
    console.error('❌ [ARCHIVE] Error toString:', error.toString());
    console.error('❌ [ARCHIVE] Error stack:', error.stack);
    
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: error.toString(),
        duration: errorDuration,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper function to format date as DD-MM-YYYY
function formatDateForFilename(date) {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0'); // getMonth() is 0-indexed
  const year = date.getFullYear();
  
  return `${day}-${month}-${year}`;
}

// Test function to verify the archive functionality
function testArchiveRPBResults() {
  try {
    const result = archiveRPBResults();
    const response = JSON.parse(result.getContent());
    
    if (response.success) {
      console.log('✅ Test successful!');
      console.log('File name:', response.fileName);
      console.log('Sheet URL:', response.sheetUrl);
      return true;
    } else {
      console.error('❌ Test failed:', response.error);
      return false;
    }
  } catch (error) {
    console.error('❌ Test error:', error);
    return false;
  }
}