import React, { useState, useEffect } from 'react';
import { DataGrid, renderTextEditor, SelectColumn } from 'react-data-grid';
import 'react-data-grid/lib/styles.css';
import { tableFromIPC, tableToIPC, Table, vectorFromArray } from 'apache-arrow';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import initWasm, { readParquet, writeParquet, Table as ParquetTable } from 'parquet-wasm/esm/parquet_wasm.js';

import './App.css';

function App() {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [filepath, setFilepath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [wasmReady, setWasmReady] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());

  useEffect(() => {
    const init = async () => {
      try {
        await initWasm({ module_or_path: './parquet_core.wasm' });
        setWasmReady(true);
      } catch (e) {
        console.error("WASM Init Error", e);
        setError("Failed to initialize Parquet engine. " + e.message);
      }
    };
    init();
  }, []);

  const handleOpenFile = async () => {
    if (!wasmReady) return;
    try {
      setError(null);
      const path = await window.electronAPI.openFile();
      if (!path) return;

      setLoading(true);
      setFilepath(path);
      const buffer = await window.electronAPI.readFile(path);

      // Parse Parquet
      const wasmTable = readParquet(buffer);
      const arrowTable = tableFromIPC(wasmTable.intoIPCStream());

      // Map columns
      const cols = [
        SelectColumn,
        {
          key: '__internal_sn__',
          name: 'SN',
          width: 60,
          frozen: true,
          renderCell: (props) => <div className="sn-cell">{props.rowIdx + 1}</div>
        },
        ...arrowTable.schema.fields.map(f => ({
          key: f.name,
          name: f.name,
          editable: true,
          renderEditCell: renderTextEditor,
          resizable: true,
          // Basic render to ensure objects/dates show up
          renderCell: (props) => {
            const val = props.row[f.name];
            return <div className="cell-content">{val !== null && val !== undefined ? String(val) : ''}</div>;
          }
        }))
      ];
      setColumns(cols);

      // Map rows
      // arrowTable.toArray() returns array of TypedObjects. 
      // .toJSON() converts generic arrow objects to JS objects.
      const data = arrowTable.toArray().map(row => row.toJSON());
      setRows(data);
    } catch (err) {
      console.error(err);
      setError("Failed to open file: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRowsChange = (newRows) => {
    setRows(newRows);
  };

  const handleSave = async () => {
    if (!filepath || !wasmReady) return;
    try {
      setLoading(true);

      // Reconstruct Arrow Table from rows and columns
      // tableFromJSON or Table.from isn't available/reliable in all versions for this data shape
      // So we build columns manually.

      const vectors = {};
      columns.forEach(col => {
        // Skip internal columns like SN and SelectColumn
        if (col.key === '__internal_sn__' || col.key === '__rdg_select__') return;

        const values = rows.map(r => {
          const val = r[col.key];
          // Convert empty strings back to null if needed, or keep as string
          return val === undefined ? null : val;
        });
        vectors[col.key] = vectorFromArray(values);
      });

      const table = new Table(vectors);

      // Serialize to Arrow IPC
      const ipcBuffer = tableToIPC(table, 'stream');

      // Load into WASM Table
      const wasmTable = ParquetTable.fromIPCStream(ipcBuffer);

      // Compress to Parquet
      const parquetBuffer = writeParquet(wasmTable);

      await window.electronAPI.saveFile(filepath, parquetBuffer);
      // Optional: show success

    } catch (err) {
      console.error(err);
      setError("Failed to save: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format) => {
    if (rows.length === 0) return;
    try {
      if (format === 'csv') {
        const header = columns.map(c => c.key).join(',');
        const csv = [
          header,
          ...rows.map(row => columns.map(c => {
            let val = row[c.key] || '';
            if (typeof val === 'string' && val.includes(',')) val = `"${val}"`;
            return val;
          }).join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `export_${Date.now()}.csv`);
      } else if (format === 'json') {
        const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
        saveAs(blob, `export_${Date.now()}.json`);
      } else if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data");
        XLSX.writeFile(wb, `export_${Date.now()}.xlsx`);
      }
    } catch (e) {
      setError(`Export failed: ${e.message}`);
    }
  };

  const handleDeleteRows = () => {
    if (selectedRows.size === 0) return;
    const newRows = rows.filter((_, idx) => !selectedRows.has(idx));
    setRows(newRows);
    setSelectedRows(new Set());
  };

  return (
    <div className="app-container">
      <header className="toolbar">
        <div className="logo-section">
          <img src="/logo.png" alt="Parquet Studio Logo" className="logo-image" />
          <h1 className="logo-text">Parquet Studio</h1>
        </div>
        <div className="actions">
          <button className="primary" onClick={handleOpenFile} disabled={loading || !wasmReady}>
            {loading ? 'Loading...' : 'Open Parquet'}
          </button>
          <button className="secondary" onClick={handleSave} disabled={loading || rows.length === 0}>
            Save
          </button>
          <button className="danger" onClick={handleDeleteRows} disabled={selectedRows.size === 0}>
            Delete selected ({selectedRows.size})
          </button>
          <div className="separator"></div>
          <button className="secondary" onClick={() => handleExport('csv')} disabled={rows.length === 0}>CSV</button>
          <button className="secondary" onClick={() => handleExport('json')} disabled={rows.length === 0}>JSON</button>
          <button className="secondary" onClick={() => handleExport('xlsx')} disabled={rows.length === 0}>Excel</button>
        </div>
      </header>

      {error && <div className="error-banner">
        <span>⚠ {error}</span>
        <button className="close-btn" onClick={() => setError(null)}>×</button>
      </div>}

      <main className="grid-area">
        {rows.length > 0 ? (
          <DataGrid
            columns={columns}
            rows={rows}
            onRowsChange={handleRowsChange}
            className="rdg-premium"
            style={{ height: '100%', border: 'none' }}
            rowKeyGetter={(row) => rows.indexOf(row)} // Simple index key
            selectedRows={selectedRows}
            onSelectedRowsChange={setSelectedRows}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h2>No File Open</h2>
            <p>Open a .parquet file to view and edit its contents.</p>
            {!wasmReady && <small>Initializing Parquet Engine...</small>}
          </div>
        )}
      </main>

      <footer className="statusbar">
        <div className="status-item">
          <span className="label">File:</span>
          <span className="value">{filepath || 'None'}</span>
        </div>
        <div className="status-item">
          <span className="label">Rows:</span>
          <span className="value">{rows.length}</span>
        </div>
        <div className="status-item">
          <span className="label">Cols:</span>
          <span className="value">{columns.length}</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
