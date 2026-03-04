'use strict';

/**
 * Shared test setup for kinetica-execute CLI tests.
 *
 * - Snapshots and restores process.env between tests
 * - Exports a createMockDb() factory for GPUdb stubs
 */

// ---------------------------------------------------------------------------
// Environment isolation
// ---------------------------------------------------------------------------

let envSnapshot;

beforeEach(() => {
  envSnapshot = { ...process.env };
});

afterEach(() => {
  process.env = envSnapshot;
});

// ---------------------------------------------------------------------------
// Mock GPUdb factory
// ---------------------------------------------------------------------------

/**
 * Create a mock GPUdb instance with all SDK methods stubbed.
 * Pass overrides to customize individual method implementations.
 *
 * @param {object} [overrides] - Map of method name → vi.fn() implementation
 * @returns {object} Mock db object
 */
globalThis.createMockDb = function createMockDb(overrides = {}) {
  const defaults = {
    url: 'http://mock-kinetica:9191',
    show_table: vi.fn().mockResolvedValue({
      table_names: [],
      sizes: [],
      type_ids: [],
      type_schemas: [],
      properties: [],
    }),
    execute_sql_request: vi.fn().mockResolvedValue({
      data: { column_headers: [] },
      column_headers: [],
      total_number_of_records: 0,
      has_more_records: false,
      count_affected: 0,
    }),
    get_records_by_column: vi.fn().mockResolvedValue({
      data: { column_headers: [] },
      column_headers: [],
      total_number_of_records: 0,
      has_more_records: false,
    }),
    insert_records_from_json: vi.fn().mockResolvedValue({
      count_inserted: 1,
      count_updated: 0,
    }),
    delete_records: vi.fn().mockResolvedValue({
      count_deleted: 1,
    }),
    clear_table: vi.fn().mockResolvedValue({}),
    show_types: vi.fn().mockResolvedValue({
      type_ids: [],
      type_schemas: [],
      labels: [],
    }),
    aggregate_group_by: vi.fn().mockResolvedValue({
      data: { column_headers: [] },
      column_headers: [],
      total_number_of_records: 0,
    }),
  };

  return { ...defaults, ...overrides };
};
