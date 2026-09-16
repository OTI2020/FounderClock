function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",;\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(headers, rows) {
  const lines = [headers.map(escapeField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeField(row[h])).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Einfacher RFC4180-ähnlicher CSV-Parser. Akzeptiert sowohl Komma als auch
 * Semikolon als Trennzeichen (typisch für DE-Excel-Exporte) sowie
 * Anführungszeichen zum Escapen.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const content = String(text).replace(/^﻿/, '');

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',' || char === ';') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // wird zusammen mit folgendem \n behandelt
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const filtered = rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (filtered.length === 0) return { headers: [], records: [] };

  const headers = filtered[0].map((h) => h.trim());
  const records = filtered.slice(1).map((r) => {
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = (r[idx] !== undefined ? r[idx] : '').trim();
    });
    return record;
  });

  return { headers, records };
}

module.exports = { toCsv, parseCsv };
