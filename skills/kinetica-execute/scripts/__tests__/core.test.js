'use strict';

/**
 * Unit tests for scripts/modules/core.js
 *
 * Each of the 10 commands gets at least: happy-path + validation-error test.
 * Pattern: create mock db → call cmd.fn(db, args) → assert console.log output.
 */

const core = require('../modules/core');

/** Parse the JSON string passed to console.log */
function capturedOutput(logSpy) {
  const call = logSpy.mock.calls[0];
  return JSON.parse(call[0]);
}

/** Build a minimal args object matching parseArgs shape */
function makeArgs(positional = [], flags = {}) {
  return { cmd: 'test', positional, flags };
}

// ---------------------------------------------------------------------------
// health
// ---------------------------------------------------------------------------

describe('health', () => {
  it('reports ok on successful connection', async () => {
    const db = createMockDb();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core.health.fn(db);

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.url).toBe('http://mock-kinetica:9191');
    expect(db.show_table).toHaveBeenCalledWith('', { show_children: 'false' });
  });

  it('reports error and exits on failure', async () => {
    const db = createMockDb({
      show_table: vi.fn().mockRejectedValue(new Error('conn refused')),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    await core.health.fn(db);

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('error');
    expect(result.message).toBe('conn refused');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

describe('query', () => {
  it('executes SQL and returns rows', async () => {
    const db = createMockDb({
      execute_sql_request: vi.fn().mockResolvedValue({
        data: {
          column_headers: ['id', 'name'],
          column_1: [1, 2],
          column_2: ['Alice', 'Bob'],
        },
        total_number_of_records: 2,
        has_more_records: false,
        count_affected: 0,
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core.query.fn(db, makeArgs(['SELECT * FROM users']));

    const result = capturedOutput(logSpy);
    expect(result.records).toEqual([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
    expect(result.total_number_of_records).toBe(2);
  });

  it('dies when no SQL provided', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(core.query.fn(db, makeArgs([]))).rejects.toThrow(
      'process.exit'
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes limit and offset flags', async () => {
    const db = createMockDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await core.query.fn(
      db,
      makeArgs(['SELECT 1'], { limit: '10', offset: '5' })
    );

    expect(db.execute_sql_request).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 5 })
    );
  });
});

// ---------------------------------------------------------------------------
// show-tables
// ---------------------------------------------------------------------------

describe('show-tables', () => {
  it('returns table list', async () => {
    const db = createMockDb({
      show_table: vi.fn().mockResolvedValue({
        table_names: ['users', 'orders'],
        sizes: [100, 200],
        type_ids: ['t1', 't2'],
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['show-tables'].fn(db, makeArgs([]));

    const result = capturedOutput(logSpy);
    expect(result.tables).toHaveLength(2);
    expect(result.tables[0].table_name).toBe('users');
    expect(result.tables[0].size).toBe(100);
    expect(result.total).toBe(2);
  });

  it('passes schema as table name filter', async () => {
    const db = createMockDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['show-tables'].fn(db, makeArgs(['my_schema']));

    expect(db.show_table).toHaveBeenCalledWith('my_schema', expect.any(Object));
  });
});

// ---------------------------------------------------------------------------
// describe-table
// ---------------------------------------------------------------------------

describe('describe-table', () => {
  it('returns column info from type schema', async () => {
    const schema = JSON.stringify({
      fields: [
        { name: 'id', type: 'int' },
        { name: 'name', type: ['string', 'null'] },
      ],
    });
    const db = createMockDb({
      show_table: vi.fn().mockResolvedValue({
        type_schemas: [schema],
        sizes: [42],
        type_ids: ['t1'],
        properties: [],
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['describe-table'].fn(db, makeArgs(['users']));

    const result = capturedOutput(logSpy);
    expect(result.table_name).toBe('users');
    expect(result.columns).toEqual([
      { name: 'id', type: 'int' },
      { name: 'name', type: 'string' },
    ]);
    expect(result.size).toBe(42);
  });

  it('dies when no table name provided', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      core['describe-table'].fn(db, makeArgs([]))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('attaches column properties when available', async () => {
    const schema = JSON.stringify({
      fields: [{ name: 'id', type: 'int' }],
    });
    const props = JSON.stringify({ id: ['primary_key', 'shard_key'] });
    const db = createMockDb({
      show_table: vi.fn().mockResolvedValue({
        type_schemas: [schema],
        sizes: [10],
        type_ids: ['t1'],
        properties: [props],
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['describe-table'].fn(db, makeArgs(['mytable']));

    const result = capturedOutput(logSpy);
    expect(result.columns[0].properties).toEqual([
      'primary_key',
      'shard_key',
    ]);
  });

  it('handles properties as pre-parsed object (not JSON string)', async () => {
    const schema = JSON.stringify({
      fields: [{ name: 'id', type: 'int' }],
    });
    const db = createMockDb({
      show_table: vi.fn().mockResolvedValue({
        type_schemas: [schema],
        sizes: [10],
        type_ids: ['t1'],
        properties: [{ id: ['primary_key', 'shard_key'] }],
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['describe-table'].fn(db, makeArgs(['mytable']));

    const result = capturedOutput(logSpy);
    expect(result.columns[0].properties).toEqual([
      'primary_key',
      'shard_key',
    ]);
  });

  it('overrides type to array<string> when properties contain array(string,-1)', async () => {
    const schema = JSON.stringify({
      fields: [
        { name: 'node', type: 'string' },
        { name: 'label', type: 'string' },
      ],
    });
    const props = JSON.stringify({
      node: ['data', 'char64'],
      label: ['data', 'array(string,-1)'],
    });
    const db = createMockDb({
      show_table: vi.fn().mockResolvedValue({
        type_schemas: [schema],
        sizes: [100],
        type_ids: ['t1'],
        properties: [props],
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['describe-table'].fn(db, makeArgs(['graph_table']));

    const result = capturedOutput(logSpy);
    expect(result.columns[0]).toEqual({
      name: 'node',
      type: 'string',
      properties: ['data', 'char64'],
    });
    expect(result.columns[1]).toEqual({
      name: 'label',
      type: 'array<string>',
      properties: ['data', 'array(string,-1)'],
    });
  });
});

// ---------------------------------------------------------------------------
// get-records
// ---------------------------------------------------------------------------

describe('get-records', () => {
  it('retrieves records with defaults', async () => {
    const db = createMockDb({
      get_records_by_column: vi.fn().mockResolvedValue({
        data: {
          column_headers: ['id'],
          column_1: [1, 2],
        },
        total_number_of_records: 2,
        has_more_records: false,
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['get-records'].fn(db, makeArgs(['users']));

    const result = capturedOutput(logSpy);
    expect(result.records).toEqual([{ id: 1 }, { id: 2 }]);
    expect(db.get_records_by_column).toHaveBeenCalledWith(
      'users',
      ['*'],
      0,
      100,
      {}
    );
  });

  it('dies when no table name provided', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      core['get-records'].fn(db, makeArgs([]))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('passes expression and sort options', async () => {
    const db = createMockDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['get-records'].fn(
      db,
      makeArgs(['users'], {
        expression: 'age > 21',
        'sort-by': 'name',
        'sort-order': 'desc',
        columns: 'id,name',
      })
    );

    expect(db.get_records_by_column).toHaveBeenCalledWith(
      'users',
      ['id', 'name'],
      0,
      100,
      { expression: 'age > 21', sort_by: 'name', sort_order: 'descending' }
    );
  });
});

// ---------------------------------------------------------------------------
// insert-json
// ---------------------------------------------------------------------------

describe('insert-json', () => {
  it('inserts JSON records', async () => {
    const db = createMockDb();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['insert-json'].fn(
      db,
      makeArgs(['users', '[{"id":1,"name":"Alice"}]'])
    );

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.count_inserted).toBe(1);
    expect(db.insert_records_from_json).toHaveBeenCalledWith(
      [{ id: 1, name: 'Alice' }],
      'users',
      {},
      {}
    );
  });

  it('wraps single object in array', async () => {
    const db = createMockDb();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['insert-json'].fn(
      db,
      makeArgs(['users', '{"id":1}'])
    );

    expect(db.insert_records_from_json).toHaveBeenCalledWith(
      [{ id: 1 }],
      'users',
      {},
      {}
    );
  });

  it('dies when missing arguments', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      core['insert-json'].fn(db, makeArgs(['users']))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('dies on invalid JSON', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      core['insert-json'].fn(db, makeArgs(['users', '{bad json']))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// delete-records
// ---------------------------------------------------------------------------

describe('delete-records', () => {
  it('deletes matching records', async () => {
    const db = createMockDb();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['delete-records'].fn(
      db,
      makeArgs(['users', 'id = 1'])
    );

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.count_deleted).toBe(1);
    expect(db.delete_records).toHaveBeenCalledWith(
      'users',
      ['id = 1'],
      {}
    );
  });

  it('dies when missing expression', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      core['delete-records'].fn(db, makeArgs(['users']))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// clear-table
// ---------------------------------------------------------------------------

describe('clear-table', () => {
  it('drops the table', async () => {
    const db = createMockDb();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['clear-table'].fn(db, makeArgs(['old_table']));

    const result = capturedOutput(logSpy);
    expect(result.status).toBe('ok');
    expect(result.message).toContain('old_table');
    expect(db.clear_table).toHaveBeenCalledWith('old_table', '', {});
  });

  it('dies when no table name provided', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      core['clear-table'].fn(db, makeArgs([]))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// show-types
// ---------------------------------------------------------------------------

describe('show-types', () => {
  it('returns type list with parsed schemas', async () => {
    const schema = JSON.stringify({ fields: [{ name: 'id', type: 'int' }] });
    const db = createMockDb({
      show_types: vi.fn().mockResolvedValue({
        type_ids: ['t1'],
        type_schemas: [schema],
        labels: ['my_type'],
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['show-types'].fn(db, makeArgs([]));

    const result = capturedOutput(logSpy);
    expect(result.types).toHaveLength(1);
    expect(result.types[0].type_id).toBe('t1');
    expect(result.types[0].label).toBe('my_type');
    expect(result.types[0].schema).toEqual({
      fields: [{ name: 'id', type: 'int' }],
    });
  });

  it('handles unparseable schema gracefully', async () => {
    const db = createMockDb({
      show_types: vi.fn().mockResolvedValue({
        type_ids: ['t1'],
        type_schemas: ['not-json'],
        labels: ['broken'],
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core['show-types'].fn(db, makeArgs([]));

    const result = capturedOutput(logSpy);
    expect(result.types[0].schema).toBe('not-json');
  });
});

// ---------------------------------------------------------------------------
// aggregate
// ---------------------------------------------------------------------------

describe('aggregate', () => {
  it('performs group-by aggregation', async () => {
    const db = createMockDb({
      aggregate_group_by: vi.fn().mockResolvedValue({
        data: {
          column_headers: ['city', 'count(*)'],
          column_1: ['NYC', 'LA'],
          column_2: [100, 50],
        },
        total_number_of_records: 2,
      }),
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await core.aggregate.fn(db, makeArgs(['users', 'city,count(*)']));

    const result = capturedOutput(logSpy);
    expect(result.records).toEqual([
      { city: 'NYC', 'count(*)': 100 },
      { city: 'LA', 'count(*)': 50 },
    ]);
    expect(db.aggregate_group_by).toHaveBeenCalledWith(
      'users',
      ['city', 'count(*)'],
      0,
      100,
      {}
    );
  });

  it('dies when missing required arguments', async () => {
    const db = createMockDb();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      core.aggregate.fn(db, makeArgs(['users']))
    ).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

