/* Excel/CSV export — mirrors the prototype's downloadXLSX(). Uses the SheetJS
   library loaded in index.html (window.XLSX); if it is unavailable it falls back
   to a single-sheet CSV so export always works. All data is passed in by the
   caller from live API results — nothing here is static. */

const stamp = () => new Date().toISOString().slice(0, 10);
export const bankingName = (suffix) => `ashika-banking-${stamp()}${suffix}`;

function downloadCSV(filename, headers, rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const body = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// sheets = [{ name, headers, rows }]
export function downloadXLSX(filename, sheets) {
  const XLSX = typeof window !== 'undefined' ? window.XLSX : null;
  if (!XLSX) {
    const s = sheets[0];
    return downloadCSV(filename.replace(/\.xlsx$/, '.csv'), s.headers, s.rows);
  }
  const wb = XLSX.utils.book_new();
  sheets.forEach(s => {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.rows]);
    ws['!cols'] = s.headers.map((h, i) => ({
      wch: Math.min(46, Math.max(String(h).length + 2, ...s.rows.map(r => String(r[i] ?? '').length + 2)))
    }));
    ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: s.rows.length, c: s.headers.length - 1 } }) };
    XLSX.utils.book_append_sheet(wb, ws, String(s.name).slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

/* Read an uploaded .xlsx/.csv File into an array of plain row objects, keyed by
   the (trimmed, lower-cased) header row. Every value comes back as a formatted
   string so numbers like employee codes or capacities survive intact. Uses the
   same SheetJS library (window.XLSX). Returns a Promise. */
export function readXLSX(file) {
  return new Promise((resolve, reject) => {
    const XLSX = typeof window !== 'undefined' ? window.XLSX : null;
    if (!XLSX) return reject(new Error('Excel support is unavailable in this browser'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        const rows = raw.map(r => {
          const o = {};
          for (const k in r) o[String(k).trim().toLowerCase()] = typeof r[k] === 'string' ? r[k].trim() : r[k];
          return o;
        }).filter(r => Object.values(r).some(v => String(v ?? '').trim() !== ''));
        resolve(rows);
      } catch { reject(new Error('That file is not a valid spreadsheet')); }
    };
    reader.readAsArrayBuffer(file);
  });
}
