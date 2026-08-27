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
