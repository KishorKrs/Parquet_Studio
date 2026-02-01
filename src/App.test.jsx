import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import React from 'react';

// --- Mocks ---

// Mock electronAPI
const mockElectronAPI = {
    openFile: vi.fn(),
    readFile: vi.fn(),
    saveFile: vi.fn(),
};
window.electronAPI = mockElectronAPI;
window.HTMLElement.prototype.scrollIntoView = vi.fn(); // Mock scrollIntoView for RDG

// Mock parquet-wasm
vi.mock('parquet-wasm/esm/parquet_wasm.js', () => ({
    default: vi.fn().mockResolvedValue({}),
    readParquet: vi.fn(),
    writeParquet: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3])),
    Table: {
        fromIPCStream: vi.fn().mockReturnValue({}),
    },
}));

import initWasm, { readParquet } from 'parquet-wasm/esm/parquet_wasm.js';

// Mock apache-arrow
vi.mock('apache-arrow', () => {
    return {
        tableFromIPC: vi.fn(),
        tableToIPC: vi.fn().mockReturnValue(new Uint8Array([4, 5, 6])),
        Table: vi.fn(),
        vectorFromArray: vi.fn().mockReturnValue("mockVector"),
        SelectColumn: { key: '__rdg_select__', name: '', width: 35 },
    };
});
import { tableFromIPC } from 'apache-arrow';

// Mock react-data-grid
vi.mock('react-data-grid', () => ({
    DataGrid: ({ rows, columns, onRowsChange, selectedRows, onSelectedRowsChange }) => (
        <div data-testid="data-grid">
            <div data-testid="grid-rows">{rows.length}</div>
            <button onClick={() => onSelectedRowsChange(new Set([0]))}>Select Row 0</button>
        </div>
    ),
    renderTextEditor: () => <div>Editor</div>,
    SelectColumn: { key: '__rdg_select__' },
}));

// Mock file-saver
vi.mock('file-saver', () => ({
    saveAs: vi.fn(),
}));
import { saveAs } from 'file-saver';

// Mock xlsx
vi.mock('xlsx', () => ({
    utils: {
        json_to_sheet: vi.fn(),
        book_new: vi.fn(),
        book_append_sheet: vi.fn(),
    },
    writeFile: vi.fn(),
}));
import * as XLSX from 'xlsx';


describe('Parquet Studio App', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        // Reset WASM init mock to mimic successful init
        initWasm.mockResolvedValue({});
    });

    it('renders empty state initially', async () => {
        await act(async () => {
            render(<App />);
        });
        expect(screen.getByText(/No File Open/i)).toBeInTheDocument();
    });

    it('opens and loads a parquet file', async () => {
        // Setup Mocks
        const mockPath = '/path/to/file.parquet';
        const mockBuffer = new Uint8Array([1, 2, 3]);
        const mockArrowTable = {
            schema: { fields: [{ name: 'col1', type: {} }] },
            toArray: () => [{ toJSON: () => ({ col1: 'val1' }) }],
        };

        // Simulate initWasm resolving immediately
        let resolveInit;
        initWasm.mockReturnValue(new Promise(r => resolveInit = r));

        mockElectronAPI.openFile.mockResolvedValue(mockPath);
        mockElectronAPI.readFile.mockResolvedValue(mockBuffer);
        readParquet.mockReturnValue({ intoIPCStream: () => { } });
        tableFromIPC.mockReturnValue(mockArrowTable);

        await act(async () => {
            render(<App />);
        });

        // Await wasm ready
        await act(async () => resolveInit());

        // Click Open
        const openBtn = screen.getByText('Open Parquet');
        await act(async () => {
            fireEvent.click(openBtn);
        });

        await waitFor(() => {
            expect(mockElectronAPI.openFile).toHaveBeenCalled();
            expect(mockElectronAPI.readFile).toHaveBeenCalledWith(mockPath);
            expect(readParquet).toHaveBeenCalledWith(mockBuffer);
            // Check if grid is rendered (mocked)
            expect(screen.getByTestId('data-grid')).toBeInTheDocument();
            expect(screen.getByText('File:')).toBeInTheDocument();
            expect(screen.getByText(mockPath)).toBeInTheDocument();
        });
    });

    it('loads persistent file from localStorage', async () => {
        const mockPath = '/saved/path.parquet';
        localStorage.setItem('lastFilepath', mockPath);

        const mockBuffer = new Uint8Array([1, 2, 3]);
        const mockArrowTable = {
            schema: { fields: [] },
            toArray: () => [],
        };

        mockElectronAPI.readFile.mockResolvedValue(mockBuffer);
        readParquet.mockReturnValue({ intoIPCStream: () => { } });
        tableFromIPC.mockReturnValue(mockArrowTable);

        await act(async () => {
            render(<App />);
        });

        await waitFor(() => {
            expect(mockElectronAPI.readFile).toHaveBeenCalledWith(mockPath);
        });
    });

    it('handles row deletion', async () => {
        // Setup loaded state
        const mockArrowTable = {
            schema: { fields: [{ name: 'c', type: {} }] },
            toArray: () => [{ toJSON: () => ({ c: '1' }) }, { toJSON: () => ({ c: '2' }) }],
        };

        mockElectronAPI.openFile.mockResolvedValue('/f.p');
        mockElectronAPI.readFile.mockResolvedValue(new Uint8Array());
        readParquet.mockReturnValue({ intoIPCStream: () => { } });
        tableFromIPC.mockReturnValue(mockArrowTable);

        await act(async () => { render(<App />); });

        // Open file
        await act(async () => { fireEvent.click(screen.getByText('Open Parquet')); });

        await waitFor(() => expect(screen.getByTestId('grid-rows')).toHaveTextContent('2'));

        // Select row (via our mock button)
        await act(async () => {
            fireEvent.click(screen.getByText('Select Row 0'));
        });

        // Click delete
        const deleteBtn = screen.getByText(/Delete selected/i);
        expect(deleteBtn).not.toBeDisabled();

        await act(async () => {
            fireEvent.click(deleteBtn);
        });

        await waitFor(() => {
            expect(screen.getByTestId('grid-rows')).toHaveTextContent('1');
        });
    });

    it('exports to CSV', async () => {
        // Setup loaded state with 1 row
        const mockArrowTable = {
            schema: { fields: [{ name: 'col1', type: {} }] },
            toArray: () => [{ toJSON: () => ({ col1: 'val1' }) }],
        };

        mockElectronAPI.openFile.mockResolvedValue('/f.p');
        mockElectronAPI.readFile.mockResolvedValue(new Uint8Array());
        readParquet.mockReturnValue({ intoIPCStream: () => { } });
        tableFromIPC.mockReturnValue(mockArrowTable);

        await act(async () => { render(<App />); });
        await act(async () => { fireEvent.click(screen.getByText('Open Parquet')); });

        await waitFor(() => expect(screen.getByText('CSV')).not.toBeDisabled());

        await act(async () => {
            fireEvent.click(screen.getByText('CSV'));
        });

        expect(saveAs).toHaveBeenCalled();
        const blob = saveAs.mock.calls[0][0];
        expect(blob.type).toContain('text/csv');
    });

    it('saves the file', async () => {
        // Setup loaded state
        const mockArrowTable = {
            schema: { fields: [{ name: 'col1', type: {} }] },
            toArray: () => [{ toJSON: () => ({ col1: 'val1' }) }],
        };

        mockElectronAPI.openFile.mockResolvedValue('/f.p');
        mockElectronAPI.readFile.mockResolvedValue(new Uint8Array());
        readParquet.mockReturnValue({ intoIPCStream: () => { } });
        tableFromIPC.mockReturnValue(mockArrowTable);

        await act(async () => { render(<App />); });
        await act(async () => { fireEvent.click(screen.getByText('Open Parquet')); });

        await waitFor(() => expect(screen.getByText('Save')).not.toBeDisabled());

        await act(async () => {
            fireEvent.click(screen.getByText('Save'));
        });

        await waitFor(() => {
            expect(window.electronAPI.saveFile).toHaveBeenCalledWith('/f.p', expect.any(Uint8Array));
        });
    });

});
