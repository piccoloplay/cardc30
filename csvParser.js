// ─── csvParser.js ───────────────────────────────────────
export function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headerLine = lines.shift();
  const headers = headerLine.split(";");

  return lines.map((line) => {
    let values;
    if (line.includes(";")) {
      values = line.split(";");
    } else {
      values = parseCSVLine(line, ",");
    }

    const card = {};
    headers.forEach((h, i) => {
      const val = (values[i] ?? "").replace(/^"|"$/g, "").trim();
      card[h] = val;
    });

    card.id = parseInt(card.id) || 0;
    card.costo_gioco_PR = parseInt(card.costo_gioco_PR) || 0;
    card.costo_mantenimento_PR = parseInt(card.costo_mantenimento_PR) || 0;
    card.produzione_PR = parseInt(card.produzione_PR) || 0;
    card.produzione_PE = parseInt(card.produzione_PE) || 0;
    card.soglia_engagement = parseInt(card.soglia_engagement) || 0;

    card.tipo = (card.tipo || "").trim();
    card.sottotipo = (card.sottotipo || "").trim();
    card.nome = (card.nome || "").trim();
    card.effetto = (card.effetto || "").trim();
    card.attivazione = (card.attivazione || "").trim();

    card.img = `Cards/${card.id}.jpg`;
    card.costo = card.costo_gioco_PR;

    return card;
  }).filter(card => card.id > 0);
}

function parseCSVLine(line, separator) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === separator && !inQuotes) {
      result.push(current); current = "";
    } else { current += ch; }
  }
  result.push(current);
  return result;
}
