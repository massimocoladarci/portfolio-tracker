/**
 * @OnlyCurrentDoc
 */

function aggiornaPrezzi() {
  Logger.log(">> AggiornaPrezzi - START");
  // per aggiornare i prezzi basta aggiornare il campo CHECK_REFRESH_PRICES del foglio Portafoglio

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var checkBox = ss.getRangeByName("CHECK_REFRESH_PRICES");
  Logger.log("-- AggiornaPrezzi - OLD CHECK_BOX: " + checkBox.isChecked());

  // imposto il flag inverso per cambiare stato del checkbox
  if (checkBox.isChecked()) {
    checkBox.uncheck(); // Se era vera, diventa falsa
  } else {
    checkBox.check();   // Se era falsa, diventa vera
  }
  Logger.log("-- AggiornaPrezzi - NEW CHECK_BOX: " + checkBox.isChecked());
  ui.alert("Aggiorna Prezzi", "Procedura OK", ui.ButtonSet.OK);

  Logger.log("<< AggiornaPrezzi - END");
}

function YAHOO_PRICE(ticker, tipo, dummy) {
  if (!ticker) return "Ticker mancante";

  // Cache per non bombardare Yahoo se usi la stessa funzione due volte
  var cache = CacheService.getScriptCache();
  var cached = cache.get(ticker);
  var data;

  if (cached) {
    data = JSON.parse(cached);
  } else {
    // Chiamata all'API interna di Yahoo (molto più stabile dello scraping HTML)
    var url = "https://query1.finance.yahoo.com/v8/finance/chart/" + ticker + "?interval=1d&range=1d";
    try {
      var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      var json = JSON.parse(response.getContentText());
      var result = json.chart.result[0].meta;

      data = {
        price: result.regularMarketPrice,
        prevClose: result.chartPreviousClose || result.previousClose
      };

      // Salva in cache per 10 minuti
      cache.put(ticker, JSON.stringify(data), 600);
    } catch (e) {
      return "Errore";
    }
  }

  if (tipo === "PREZZO") return data.price;
  if (tipo === "CHIUSURA") return data.prevClose;

  return "Tipo errato";
}

function registraOperazioni() {
  Logger.log(">> RegistraOperazioni - START");

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ui = SpreadsheetApp.getUi();

  var foglioCalcoli = ss.getSheetByName("ETF Portafogli") || ss.getSheetByName("Portafoglio");
  var foglioStorico = ss.getSheetByName("Movimenti Titoli");
  var foglioCash = ss.getSheetByName("Movimenti Cash");

  // Riferimenti ai Range
  var rangeFlag = ss.getRangeByName("FLAG_RIBILANCIAMENTO") || foglioCalcoli.getRange("D56");
  var rangeCash = ss.getRangeByName("CASH_RIBILANCIAMENTO") || foglioCalcoli.getRange("F41");

  // --- CONTROLLO FLAG RIBILANCIAMENTO ---
  var flagRibilanciamento = rangeFlag.getValue();
  if (flagRibilanciamento === false || flagRibilanciamento === "OFF" || flagRibilanciamento === 0) {
    ui.alert("Attenzione", "Il ribilanciamento risulta disattivato. Operazione annullata.", ui.ButtonSet.OK);
    return;
  }

  // --- LETTURA LIQUIDITÀ ADDIZIONALE ---
  var cashAggiuntivo = Number(rangeCash.getValue()) || 0;
  var rangeCalcoli = foglioCalcoli.getRange("B43:L55").getValues();

  var confermaMsg = 'Vuoi registrare le operazioni nello storico?';
  if (cashAggiuntivo > 0) {
    confermaMsg += '\nVerrà registrato anche un Deposito Cash di ' + cashAggiuntivo.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  }

  var risposta = ui.alert('Conferma Operazione', confermaMsg, ui.ButtonSet.YES_NO);
  if (risposta != ui.Button.YES) return;

  var dataOdierna = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

  // 1. REGISTRAZIONE ORDINI TITOLI
  var colName = 0;
  var colPrezzo = 2;
  var colQuoteAggiunte = 7;

  var rigaAttuale = trovaPrimaRigaLiberaTitoli_(foglioStorico, 2);
  var operazioniRegistrate = 0;

  for (var i = 0; i < rangeCalcoli.length; i++) {
    var riga = rangeCalcoli[i];
    var name = riga[colName];
    var prezzo = riga[colPrezzo];
    var quote = riga[colQuoteAggiunte];
    var commissioni = "0";
    var tasse = "0";

    if (quote !== 0 && quote !== "" && name !== "") {

      // Se abbiamo saturato il foglio (oltre l'ultima riga fisica esistente)
      if (rigaAttuale > foglioStorico.getMaxRows()) {
        foglioStorico.insertRowAfter(rigaAttuale - 1);
        var sourceRange = foglioStorico.getRange(rigaAttuale - 1, 1, 1, foglioStorico.getLastColumn());
        sourceRange.copyTo(foglioStorico.getRange(rigaAttuale, 1));
      } else if (rigaAttuale > 2) {
        var formScaleSource = foglioStorico.getRange(rigaAttuale - 1, 9, 1, 8);
        formScaleSource.copyTo(foglioStorico.getRange(rigaAttuale, 9));
      }

      var totale = -quote * prezzo;
      var nuoviDati = [
        "",           // Col A
        "",           // Col B
        dataOdierna,  // Col C (Data)
        name,         // Col D (Ticker/Name)
        quote,        // Col E (Quote)
        totale,       // Col F (Totale)
        commissioni,  // Col G (Commissioni)
        tasse         // Col H (Tasse)
      ];

      // Scrive direttamente il blocco A:H
      foglioStorico.getRange(rigaAttuale, 1, 1, 8).setValues([nuoviDati]);

      operazioniRegistrate++;
      Logger.log("-- RegistraOperazioni - Operazione: " + operazioniRegistrate);
      rigaAttuale++; // Avanza alla riga successiva per il prossimo ordine
    }
  }
  // 2. REGISTRAZIONE MOVIMENTO CASH (se presente)
  if (cashAggiuntivo > 0 && foglioCash) {
    var rigaLiberaCash = trovaPrimaRigaLiberaCash_(foglioCash, 4);

    if (rigaLiberaCash > foglioCash.getMaxRows()) {
      foglioCash.insertRowAfter(rigaLiberaCash - 1);
      foglioCash.getRange(rigaLiberaCash - 1, 3, 1, 4).copyTo(foglioCash.getRange(rigaLiberaCash, 3));
    }

    var recordCash = [
      dataOdierna,                      // Colonna C: Data
      "Deposito",                       // Colonna D: Tipologia
      "Iniezione cash ribilanciamento", // Colonna E: Note
      cashAggiuntivo                    // Colonna F: Importo
    ];

    foglioCash.getRange(rigaLiberaCash, 3, 1, 4).setValues([recordCash]);
    Logger.log("-- RegistraOperazioni - Cash registrato alla riga " + rigaLiberaCash);
  }

  // Forza il rendering a video di tutte le celle e delle formule pendenti
  SpreadsheetApp.flush();

  Logger.log("-- RegistraOperazioni - Concluse " + operazioniRegistrate + " operazioni");
  Logger.log("<< RegistraOperazioni - END");

  var resMsg = operazioniRegistrate + " operazioni registrate con successo.";
  if (cashAggiuntivo > 0) resMsg += "\nDeposito cassa inserito.";
  ui.alert("Completato", resMsg, ui.ButtonSet.OK);
}

function trovaPrimaRigaLiberaTitoli_(sheet, startRow) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < startRow) {
    return startRow;
  }

  // Legge solo il blocco C:F (colonne da 3 a 6) da startRow fino in fondo in un unico colpo
  var numRows = maxRows - startRow + 1;
  var rangeValues = sheet.getRange(startRow, 3, numRows, 4).getValues();

  for (var i = 0; i < rangeValues.length; i++) {
    var c = rangeValues[i][0]; // Colonna C (Data)
    var d = rangeValues[i][1]; // Colonna D (Name/Ticker)
    var e = rangeValues[i][2]; // Colonna E (Quote)
    var f = rangeValues[i][3]; // Colonna F (Totale)

    // Verifica se tutte e 4 le celle sono vuote
    if ((c === "" || c === null) &&
      (d === "" || d === null) &&
      (e === "" || e === null) &&
      (f === "" || f === null)) {
      return startRow + i;
    }
  }
  // Se tutte le righe esistenti sono occupate, la prima libera è oltre la fine del foglio
  return maxRows + 1;
}

function trovaPrimaRigaLiberaCash_(sheet, startRow) {
  var maxRows = sheet.getMaxRows();
  if (maxRows < startRow) return startRow;

  // Legge colonne C:F (da colonna 3 a 6)
  var rangeValues = sheet.getRange(startRow, 3, maxRows - startRow + 1, 4).getValues();

  for (var i = 0; i < rangeValues.length; i++) {
    var data = rangeValues[i][0];   // Colonna C
    var importo = rangeValues[i][3];// Colonna F
    if ((data === "" || data === null) && (importo === "" || importo === null)) {
      return startRow + i;
    }
  }
  return maxRows + 1;
}

function applyTheme(selectedTheme) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Feedback immediato per l'utente finale
  ss.toast("Applicazione del nuovo tema in corso...", "🎨 Personalizzazione", 5);

  // 1. Lettura tema selezionato
  if (!selectedTheme) {
    ss.toast("Tema da applicare non trovato.", "Errore", 5);
    return;
  }
  // 2. Lettura configurazione temi
  const configRange = ss.getRangeByName("THEME_CONFIGURATION");
  if (!configRange) {
    ss.toast("Intervallo THEME_CONFIGURATION non trovato.", "Errore", 5);
    return;
  }

  const themeData = configRange.getValues();

  // Ricerca senza case-sensitivity saltando l'intestazione
  const themeRow = themeData.slice(1).find(row =>
    String(row[0]).trim().toLowerCase() === selectedTheme.toLowerCase()
  );

  if (!themeRow) {
    ss.toast(`Tema "${selectedTheme}" non configurato.`, "Attenzione", 5);
    return;
  }

  const headerBg = themeRow[1];
  const headerFg = themeRow[2];

  if (!headerBg || !headerFg) {
    ss.toast("Codici colore mancanti per questo tema.", "Errore", 5);
    return;
  }

  const bodyBg = themeRow[3];
  const bodyFg = themeRow[4];

  // 3. Raccolta ed elaborazione batch degli intervalli THEME_HEADER_
  const namedRanges = ss.getNamedRanges();
  let count = 0;

  namedRanges.forEach(nr => {
    const fullName = nr.getName();
    const cleanName = fullName.includes("!") ? fullName.split("!")[1] : fullName;

    if (cleanName.startsWith("THEME_HEADER_")) {
      const targetRange = nr.getRange();
      const numRows = targetRange.getNumRows();
      const numCols = targetRange.getNumColumns();

      // Crea matrici 2D per aggiornare tutto in una singola chiamata I/O per range
      const bgMatrix = Array.from({ length: numRows }, () => Array(numCols).fill(headerBg));
      const fgMatrix = Array.from({ length: numRows }, () => Array(numCols).fill(headerFg));

      targetRange.setBackgrounds(bgMatrix);
      targetRange.setFontColors(fgMatrix);
      count++;
    }
    if (cleanName.startsWith("THEME_BODY_")) {
      const targetRange = nr.getRange();
      const numRows = targetRange.getNumRows();
      const numCols = targetRange.getNumColumns();

      // Crea matrici 2D per aggiornare tutto in una singola chiamata I/O per range
      if (bodyBg) {
        const bgMatrix = Array.from({ length: numRows }, () => Array(numCols).fill(bodyBg));
        targetRange.setBackgrounds(bgMatrix);
      }
      if (bodyFg) {
        const fgMatrix = Array.from({ length: numRows }, () => Array(numCols).fill(bodyFg));
        targetRange.setFontColors(fgMatrix);
      }
      count++;
    }
  });

  const bodyFgAlt = themeRow[5];

  if (bodyFgAlt) {
    namedRanges.forEach(nr => {
      const fullName = nr.getName();
      const cleanName = fullName.includes("!") ? fullName.split("!")[1] : fullName;
      if (cleanName.startsWith("THEME_FG_ALT_")) {
        const targetRange = nr.getRange();
        const numRows = targetRange.getNumRows();
        const numCols = targetRange.getNumColumns();

        // Crea matrici 2D per aggiornare tutto in una singola chiamata I/O per range
        const fgMatrix = Array.from({ length: numRows }, () => Array(numCols).fill(bodyFgAlt));
        targetRange.setFontColors(fgMatrix);
        count++;
      }
    });
  }

  // Forza l'aggiornamento immediato della UI prima di chiudere
  SpreadsheetApp.flush();
  ss.toast(`Tema "${selectedTheme}" applicato (${count} sezioni aggiornate).`, "Completato", 3);
  return "OK"
}
