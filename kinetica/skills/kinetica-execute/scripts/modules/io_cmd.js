'use strict';

/**
 * Import/Export and KiFS commands for Kinetica CLI (Node.js).
 *
 * Provides 8 commands for file import/export and KiFS (Kinetica File System)
 * operations. Named io_cmd to avoid shadowing Node's built-in io.
 *
 * Each command has signature (db, args) where args comes from parseArgs.
 */

const fs = require('fs');
const path = require('path');
const { die, out, parseCsvArg } = require('./helpers');

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdImportFiles(db, args) {
  const table = args.positional[0];
  if (!table) die('Usage: io import-files <table> --file-path PATH [--batch-size N]');

  const filePaths = parseCsvArg(args.flags['file-path']);
  if (filePaths.length === 0) die('--file-path is required');

  const options = {};
  if (args.flags['batch-size'] !== undefined) {
    options.batch_size = args.flags['batch-size'];
  }
  if (args.flags['columns-to-load'] !== undefined) {
    options.columns_to_load = args.flags['columns-to-load'];
  }
  if (args.flags['type-inference-mode'] !== undefined) {
    options.type_inference_mode = args.flags['type-inference-mode'];
  }

  const resp = await db.insert_records_from_files(
    table,
    filePaths,
    {},
    {},
    options
  );

  out({
    table_name: table,
    status: 'ok',
    count_inserted: resp.count_inserted || 0,
    count_skipped: resp.count_skipped || 0,
    count_updated: resp.count_updated || 0,
  });
}

async function cmdExportFiles(db, args) {
  const table = args.positional[0];
  if (!table) die('Usage: io export-files <table> --file-path PATH [--format csv|json|parquet]');

  const filePath = args.flags['file-path'];
  if (!filePath) die('--file-path is required');

  const options = {};
  const fileType = args.flags.format || 'csv';
  options.file_type = fileType;
  if (args.flags['batch-size'] !== undefined) {
    options.batch_size = args.flags['batch-size'];
  }

  const resp = await db.export_records_to_files(table, filePath, options);

  out({
    table_name: table,
    status: 'ok',
    filepath: filePath,
    count_exported: resp.count_inserted || 0,
  });
}

async function cmdExportTable(db, args) {
  const table = args.positional[0];
  if (!table) {
    die('Usage: io export-table <table> --datasource NAME --remote-table NAME');
  }

  const remoteTable = args.flags['remote-table'];
  if (!remoteTable) die('--remote-table is required');

  const options = {};
  const datasource = args.flags.datasource;
  if (datasource) {
    options.datasink_name = datasource;
  }
  if (args.flags['batch-size'] !== undefined) {
    options.batch_size = args.flags['batch-size'];
  }
  if (args.flags['jdbc-session-init'] !== undefined) {
    options.jdbc_session_init_statement = args.flags['jdbc-session-init'];
  }

  const resp = await db.export_records_to_table(table, remoteTable, options);

  out({
    table_name: table,
    status: 'ok',
    remote_table: remoteTable,
    count_exported: resp.count_inserted || 0,
  });
}

async function cmdKifsUpload(db, args) {
  const kifsPath = args.positional[0];
  if (!kifsPath) die('Usage: io kifs-upload <kifs-path> --file-path LOCAL_PATH');

  const localPath = args.flags['file-path'];
  if (!localPath) die('--file-path is required');

  if (!fs.existsSync(localPath)) {
    die(`Local file not found: ${localPath}`);
  }

  const rawData = fs.readFileSync(localPath);
  const fileData = rawData.toString('base64');

  const resp = await db.upload_files([kifsPath], [fileData], {});

  out({
    kifs_path: kifsPath,
    status: 'ok',
    message: `Uploaded '${localPath}' to '${kifsPath}'`,
  });
}

async function cmdKifsDownload(db, args) {
  const kifsPath = args.positional[0];
  if (!kifsPath) die('Usage: io kifs-download <kifs-path> [--output LOCAL_PATH]');

  const resp = await db.download_files([kifsPath], [0], [-1], {});

  const fileData = (resp.file_data || [''])[0];
  const outputPath = args.flags.output;

  if (outputPath) {
    fs.writeFileSync(outputPath, Buffer.from(fileData, 'base64'));
    out({
      kifs_path: kifsPath,
      status: 'ok',
      output: outputPath,
      message: `Downloaded '${kifsPath}' to '${outputPath}'`,
    });
  } else {
    out({
      kifs_path: kifsPath,
      status: 'ok',
      file_data_base64: fileData,
    });
  }
}

async function cmdKifsList(db, args) {
  const kifsPath = args.positional[0] || '';

  // List directories
  const dirResp = await db.show_directories(kifsPath, {});
  const directories = dirResp.directory_names || [];

  // List files
  const paths = kifsPath ? [kifsPath] : [];
  const fileResp = await db.show_files(paths, {});

  const fileNames = fileResp.file_names || [];
  const sizes = fileResp.sizes || [];
  const files = fileNames.map((name, i) => ({
    name,
    size: i < sizes.length ? sizes[i] : null,
  }));

  out({
    path: kifsPath || '/',
    directories,
    files,
  });
}

async function cmdKifsMkdir(db, args) {
  const kifsPath = args.positional[0];
  if (!kifsPath) die('Usage: io kifs-mkdir <kifs-path>');

  await db.create_directory(kifsPath, {});

  out({
    kifs_path: kifsPath,
    status: 'ok',
    message: `Directory '${kifsPath}' created`,
  });
}

async function cmdKifsDelete(db, args) {
  const kifsPath = args.positional[0];
  if (!kifsPath) die('Usage: io kifs-delete <kifs-path> [--directory]');

  const isDirectory = args.flags.directory === true;

  if (isDirectory) {
    await db.delete_directory(kifsPath, {});
    out({
      kifs_path: kifsPath,
      status: 'ok',
      message: `Directory '${kifsPath}' deleted`,
    });
  } else {
    await db.delete_files([kifsPath], {});
    out({
      kifs_path: kifsPath,
      status: 'ok',
      message: `File '${kifsPath}' deleted`,
    });
  }
}

// ---------------------------------------------------------------------------
// Exports -- module contract for the dispatcher
// ---------------------------------------------------------------------------

module.exports = {
  'import-files': {
    fn: cmdImportFiles,
    desc: 'Import server-side or KiFS files into a table',
  },
  'export-files': {
    fn: cmdExportFiles,
    desc: 'Export table records to a file on the server',
  },
  'export-table': {
    fn: cmdExportTable,
    desc: 'Export table records to a remote data sink',
  },
  'kifs-upload': {
    fn: cmdKifsUpload,
    desc: 'Upload a local file to KiFS',
  },
  'kifs-download': {
    fn: cmdKifsDownload,
    desc: 'Download a file from KiFS',
  },
  'kifs-list': {
    fn: cmdKifsList,
    desc: 'List files and directories in KiFS',
  },
  'kifs-mkdir': {
    fn: cmdKifsMkdir,
    desc: 'Create a directory in KiFS',
  },
  'kifs-delete': {
    fn: cmdKifsDelete,
    desc: 'Delete a file or directory from KiFS',
  },
};
