/**
 * @OnlyCurrentDoc
 */

// QUESTA FUNZIONE CREA IL MENU IN ALTO ALL'APERTURA DEL FOGLIO
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  // Crea un menu personalizzato chiamato "🚀 Portfolio"
  var menu = ui.createMenu('🚀 Portfolio')
      .addItem('Aggiorna Prezzi ETF', 'aggiornaPrezzi')
      .addItem('Controlla Allarmi su ETF', 'controllaAllarmi')  
      .addSeparator()
      .addItem('Registra Operazioni', 'registraOperazioni')
      .addSeparator();

  var scheduleSubMenu = ui.createMenu('Registrazione Automatica Storico');

  scheduleSubMenu
        .addItem('Attiva', 'attivaAutomazioneStorico')
        .addItem('Disattiva', 'disattivaAutomazioneStorico')
        .addSeparator()
        .addItem('Esegui Ora', 'recordDailySnapshot');

  menu.addSubMenu(scheduleSubMenu).addSeparator();

  var themeSubMenu = buildThemeSubMenu(ui);
    if (themeSubMenu) {
      menu.addSubMenu(themeSubMenu).addSeparator();
    }

  menu.addItem('Apri Console Operativa', 'apriPannelloOperativo')
      .addToUi();

}

function buildThemeSubMenu(ui) {
  var themes = getAvailableThemes();
  if (themes.length === 0) return null;

  var subMenu = ui.createMenu('Cambia Tema');
  themes.forEach(function(themeName, idx) {
    subMenu.addItem(themeName, 'dispatchTheme' + idx);
  });
  return subMenu;
}

function getAvailableThemes() {
  var range = SpreadsheetApp.getActiveSpreadsheet().getRangeByName("THEME_CONFIGURATION");
  if (!range) return [];

  return range.getValues()
    .slice(1)
    .map(function(row) { return String(row[0]).trim(); })
    .filter(Boolean);
}

function runThemeByIndex(idx) {
  var themes = getAvailableThemes();
  if (themes[idx]) {
    applyTheme(themes[idx]);
  }
}

function dispatchTheme0() { runThemeByIndex(0); }
function dispatchTheme1() { runThemeByIndex(1); }
function dispatchTheme2() { runThemeByIndex(2); }
function dispatchTheme3() { runThemeByIndex(3); }
function dispatchTheme4() { runThemeByIndex(4); }
function dispatchTheme5() { runThemeByIndex(5); }
function dispatchTheme6() { runThemeByIndex(6); }
function dispatchTheme7() { runThemeByIndex(7); }
function dispatchTheme8() { runThemeByIndex(8); }
function dispatchTheme9() { runThemeByIndex(9); }

function apriPannelloOperativo() {
  var html = HtmlService.createHtmlOutput(`
    <style>
      body { font-family: sans-serif; padding: 15px; }
      .btn {
        background-color: #1a73e8; color: white; border: none;
        padding: 10px 16px; border-radius: 4px; font-weight: bold;
        cursor: pointer; width: 100%; margin-top: 10px;
      }
      .btn:hover { background-color: #1557b0; }
    </style>
    <h3>Console Portfolio</h3>
    <p>Aggiorna i prezzi e verifica gli allarmi soglia impostati.</p>
    <button class="btn" onclick="google.script.run.aggiornaPrezzi()">Aggiorna Prezzi</button>
    <button class="btn" onclick="google.script.run.controllaAllarmi()">Controlla Allarmi</button>    
    <p>Verifica i ribilanciamenti ed esegui gli ordini.</p>
    <button class="btn" onclick="google.script.run.registraOperazioni()">Registra Operazioni</button>

  `).setTitle('Operatività');
  
  SpreadsheetApp.getUi().showSidebar(html);
}

// FUNZIONE CONTROLLO DEGLI ALLARMI
function controllaAllarmi() {

  Logger.log(">> ControllaAllarmi - START");
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("Portafoglio");
  var ui = SpreadsheetApp.getUi();
  
  // --- 1. CONFIGURAZIONE CODICI (Hardcoded qui) ---
  const MAPPA_TIPI = {
    "Equity": "🌍 AZIONARIO",
    "Bond": "🏛️ OBBLIGAZIONARIO",
    "Gold": "⚠️ ORO",
    "Crypto": "🛢️ CRIPTOVALUTE",
    "Cash": "🧩 LIQUIDITA'"
  };

  // Impostazioni
  var subject = "🚨 ALLARME PREZZI";
  var message = "I seguenti asset hanno raggiunto le soglie impostate:\n\n";
  var sendAlarm = false; //false; per ora mando sempre

  // Leggi tutti i dati (dalla riga 103 in poi)
  var data = ss.getRangeByName("PANNELLO_ALLARMI").getValues() || sheet.getRange("G99:P150").getValues();
  
  for (var i = 0; i < data.length; i++) {
    var categoria = data[i][1];
    var pesoCorrente = data[i][3]; 
    var pesoTarget = data[i][4];
    var sogliaMin = data[i][5];
    var sogliaMax = data[i][6];
    var testoAlarm = data[i][7]; 
    var stato = data[i][0]; 
    
    // Se non c'è prezzo o ticker, salta
    if (testoAlarm=="SPENTO") continue;

    var nomeTipo = MAPPA_TIPI[categoria] || "Asset Generico";
    
    var alertType = "";

    // 1. Controllo SOGLIA MIN (Opportunità di Acquisto)
    if (sogliaMin !== "" && pesoCorrente <= sogliaMin) {
      alertType = stato;
      message += "🟢 -> " + testoAlarm + " " + categoria + "\n - ASSET: " + nomeTipo + "\n";
      message += " - Peso Corrente: " + pesoCorrente.toFixed(3) * 100 + " %\n";
      message += " - Peso Target: " + pesoTarget.toFixed(3) * 100 + " %\n";
      message += " - Soglia Minima: " + sogliaMin.toFixed(3) * 100 + " %\n\n";
    }
    
    // 2. Controllo SOGLIA MAX (Opportunità di Vendita/Take Profit)
    else if (sogliaMax !== "" && pesoCorrente >= sogliaMax) {
      alertType = stato;
      message += "🔴 -> " + testoAlarm + " " + categoria + "\n - ASSET: " + nomeTipo + "\n";
      message += " - Peso Corrente: " + pesoCorrente.toFixed(3) * 100 + " %\n";
      message += " - Peso Target: " + pesoTarget.toFixed(3) * 100 + " %\n";      
      message += " - Soglia Massima: " + sogliaMax.toFixed(3) * 100 + " %\n\n";      
    }

    // GESTIONE STATO
    if (alertType !== "" && stato !== "INVIATO") {
      sendAlarm = true;
    } 
    else if (alertType === "" && stato === "INVIATO") {
    }
  }

  // Invia la mail solo se ci sono novità
  if (sendAlarm) {
    Logger.log("<< ControllaAllarmi - Mail di allarme inviata.");
    ui.alert(subject, message, ui.ButtonSet.OK);
  } else {
    ui.alert("Tutto tranquillo 😴", "Nessuna soglia raggiunta.", ui.ButtonSet.OK);
    Logger.log("<< ControllaAllarmi - Nessun nuovo allarme.");
  }
  Logger.log("<< ControllaAllarmi - STOP");
}

/**
 * Crea il trigger temporale automatico direttamente per conto dell'utente
 */
function attivaAutomazioneStorico() {
  // Rimuove eventuali trigger preesistenti per non duplicarli
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === "recordDailySnapshot") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Crea il nuovo trigger: ogni venerdì tra le 22:00 e le 23:00 (a borse chiuse)
  ScriptApp.newTrigger("recordDailySnapshot")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(22)
    .create();

  SpreadsheetApp.getUi().alert("✅ Automazione attivata!\n\nIl portafoglio registrerà automaticamente il proprio valore ogni fine settimana, anche se tieni il foglio chiuso.");
}

function disattivaAutomazioneStorico() {
  // Rimuove eventuali trigger preesistenti per non duplicarli
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === "recordDailySnapshot") {
      ScriptApp.deleteTrigger(t);
    }
  });
  SpreadsheetApp.getUi().alert("✅ Automazione disattivata·\n\nIl portafoglio smette di registrare automaticamente il proprio valore ogni fine settimana.");
}

function recordDailySnapshot() {

  Logger.log(">> RecordDailySnapshot - START");
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Foglio di destinazione (storico) - Guardia di esistenza
  const historySheet = ss.getSheetByName("Portafoglio Storico");
  if (!historySheet) {
    Logger.log("<< RecordDailySnapshot - ERRORE: Foglio 'Portafoglio Storico' non trovato.");
    return;
  }

  // 2. Aggiorna i Prezzi
  const checkBox = ss.getRangeByName("CHECK_REFRESH_PRICES");
  if (checkBox) {
    checkBox.setValue(!checkBox.getValue());
    // attende l'aggiornamento dei prezzi
    SpreadsheetApp.flush(); // Costringe Sheets ad applicare la modifica subito
    Utilities.sleep(2000);  // Pausa prudenziale di 2s per dare tempo ai calcoli di propagarsi
  }
  // 3. Lettura dei KPI correnti (usando i named range o celle della dashboard)
  const rangeWealth = ss.getRangeByName("PATRIMONIO_TOTALE");
  const rangeDeposits = ss.getRangeByName("TOTALE_DEPOSITI");
  const rangeFunds = ss.getRangeByName("VALORE_DEI_FONDI");

  const totalWealth = rangeWealth ? rangeWealth.getValue() : null;
  const totalDeposits = rangeDeposits ? rangeDeposits.getValue() : null;
  const totalFundsValue = rangeFunds ? rangeFunds.getValue() : null;

  // 4. Se non sono numeri validi o ci sono errori di calcolo (#N/A), abortisci
  const isValidNumber = (val) => typeof val === "number" && !isNaN(val) && isFinite(val);

  if (!isValidNumber(totalWealth) || totalWealth <= 0 || !isValidNumber(totalDeposits) || !isValidNumber(totalFundsValue)) {
    Logger.log("<< RecordDailySnapshot - ERRORE: Dati non validi o formule in errore. Snapshot annullato. Valori rilevati: " + 
               JSON.stringify({ totalWealth, totalDeposits, totalFundsValue }));
    return;
  }

  // 5. Controllo anti-duplicato e calcolo delta
  const today = new Date();
  const lastRow = historySheet.getLastRow();
  const timezone = Session.getScriptTimeZone();
  const todayFormatted = Utilities.formatDate(today, timezone, "dd/MM/yyyy");

  let lastTotalWealth = totalWealth;

  Logger.log("-- RecordDailySnapshot - lastRow: "+ lastRow);
  if (lastRow > 3) {
    const rawLastDate = historySheet.getRange(lastRow, 3).getValue();
    const lastDate = (rawLastDate instanceof Date) ? rawLastDate : new Date(rawLastDate);
    
    // Controllo stesso giorno (ignora l'orario)
    const isSameDay = !isNaN(lastDate.getTime()) && lastDate.toDateString() === today.toDateString();

    if (isSameDay) {
      // Calcola il delta recuperando la riga precedente (lastRow - 1) se esiste
      let prevWealth = totalWealth;
      if (lastRow > 4) {
        const val = historySheet.getRange(lastRow - 1, 4).getValue();
        if (isValidNumber(val)) prevWealth = val;
      }
      const deltaWealth = totalWealth - prevWealth;

      // Sovrascrive la riga odierna senza creare doppioni
      historySheet.getRange(lastRow, 3, 1, 5).setValues([[todayFormatted, totalWealth, totalDeposits, totalFundsValue, deltaWealth]]);
      Logger.log("-- RecordDailySnapshot - Riga odierna aggiornata (idempotente).");
      return;
    }
    // Se è un nuovo giorno, legge l'ultimo valore per il delta
    const previousRecorded = historySheet.getRange(lastRow, 4).getValue();
    if (isValidNumber(previousRecorded)) {
      lastTotalWealth = previousRecorded;
    }
  }    
  // 5. Scrittura nuova riga
  const deltaWealth = totalWealth - lastTotalWealth;
  historySheet.appendRow(["", "", todayFormatted, totalWealth, totalDeposits, totalFundsValue, deltaWealth]);
  Logger.log("-- RecordDailySnapshot - Snapshot registrato con successo. Delta: " + deltaWealth);
  Logger.log("<< RecordDailySnapshot - STOP");
}
