# Parquet Studio

Parquet Studio is a powerful, cross-platform desktop application for viewing and editing Apache Parquet files. Built with robustness and performance in mind, it allows users to open, inspect, modify, and export Parquet data seamlessly.

## Features

- **Open Parquet Files**: Load `.parquet` files of any size (subject to memory).
- **Tabular View**: View data in a high-performance grid.
- **Edit Data**: Direct cell editing support.
- **Save Changes**: Write changes back to Parquet format (Snappy compressed).
- **Export**:
    - **CSV**: Comma-separated values.
    - **JSON**: JavaScript Object Notation.
    - **Excel**: Microsoft Excel (.xlsx) format.
- **Cross-Platform**: Windows, macOS, Linux.

## Technologies

- **Electron**: Desktop Runtime.
- **React + Vite**: UI Framework and Bundler.
- **Apache Arrow**: In-memory columnar data format.
- **Parquet WASM**: Rust-based Parquet reader/writer via WebAssembly.

## Development

### Prerequisites

- Node.js (v18+)
- npm

### Setup

```bash
# Install dependencies
npm install
```

### Run Locally

```bash
# Run in development mode (Vite + Electron)
npm run dev:electron
```

### Build

```bash
# Build for production
npm run dist
```

 The output installer/executable will be in `dist_electron/`.

## Author

Antigravity
