# Kinetica API Reference (Node.js + Python)

> Dual-language reference for `@kinetica/gpudb@7.2.3-1` (Node.js) and `gpudb>=7.2.3.5` (Python).
> Official docs: [Node.js](https://docs.kinetica.com/7.2/api/nodejs-mod/) | [Python](https://docs.kinetica.com/7.2/api/python/)

---

## Connection

### Node.js

```javascript
const GPUdb = require('@kinetica/gpudb');

const db = new GPUdb('http://localhost:9191', {
  username: 'admin',
  password: 'password123',
  timeout: 30000        // ms, 0 = infinite
});

// OAuth alternative
const db = new GPUdb('http://localhost:9191', {
  oauth_token: 'your-token'
});

// Multi-host (HA failover)
const db = new GPUdb(['http://host1:9191', 'http://host2:9191'], { username: 'admin', password: '' });
```

### Python

```python
import gpudb

opts = gpudb.GPUdb.Options()
opts.username = 'admin'
opts.password = 'password123'
opts.timeout = 30000  # ms

db = gpudb.GPUdb(host='http://localhost:9191', options=opts)

# Simpler form (may vary by version)
db = gpudb.GPUdb(host='http://localhost:9191', username='admin', password='password123')
```

### Options Reference

| Option | Node.js key | Python attribute | Description |
|--------|------------|-----------------|-------------|
| URL | constructor arg | `host=` | Server URL(s) |
| Username | `username` | `opts.username` | Auth username |
| Password | `password` | `opts.password` | Auth password |
| OAuth Token | `oauth_token` | `opts.oauth_token` | Bearer token |
| Timeout | `timeout` | `opts.timeout` | Request timeout (ms) |

---

## SQL Execution

### Node.js

```javascript
// Promise-based (no callback)
const resp = await db.execute_sql_request({
  statement: 'SELECT * FROM my_table WHERE id > 10',
  offset: 0,
  limit: 100,        // -9999 = all records
  encoding: 'json',
  options: {}
});

// Response structure:
// resp.column_headers  = ['id', 'name', 'value']
// resp.data.column_1   = [11, 12, 13]
// resp.data.column_2   = ['Alice', 'Bob', 'Carol']
// resp.data.column_3   = [10.5, 20.3, 30.1]
// resp.total_number_of_records = 100
// resp.has_more_records = false
// resp.count_affected   = 0  (for DML: number of rows affected)

// Shorthand (positional args):
const resp = await db.execute_sql(
  'SELECT 1 AS test', // statement
  0,                   // offset
  -9999,               // limit
  '',                  // request_schema_str
  [],                  // data
  {}                   // options
);
```

### Python

```python
resp = db.execute_sql(
    'SELECT * FROM my_table WHERE id > 10',
    offset=0,
    limit=100,       # -9999 = all records
    encoding='json'
)

# Response dict:
# resp['status_info']['status']        = 'OK'
# resp['column_headers']               = ['id', 'name', 'value']
# resp['column_1']                     = [11, 12, 13]
# resp['column_2']                     = ['Alice', 'Bob', 'Carol']
# resp['total_number_of_records']      = 100
# resp['has_more_records']             = False
# resp['count_affected']               = 0
```

### SqlIterator (Paginated Queries)

#### Node.js

```javascript
for await (const record of db.SqlIterator('SELECT * FROM big_table', 10000, {})) {
  console.log(record);  // each record is an object { col1: val, col2: val }
}
```

#### Python

```python
from gpudb import GPUdbSqlIterator

for record in GPUdbSqlIterator(db, 'SELECT * FROM big_table', batch_size=5000):
    print(record)
```

---

## Columnar Response Format

All query/retrieval methods return data in **columnar** layout:

```json
{
  "column_headers": ["id", "name", "score"],
  "column_1": [1, 2, 3],
  "column_2": ["Alice", "Bob", "Carol"],
  "column_3": [95.5, 87.2, 91.0]
}
```

**Converting to rows:**

#### Node.js

```javascript
function columnarToRows(headers, data) {
  const numRows = data.column_1 ? data.column_1.length : 0;
  const rows = [];
  for (let i = 0; i < numRows; i++) {
    const row = {};
    headers.forEach((h, j) => { row[h] = data[`column_${j + 1}`][i]; });
    rows.push(row);
  }
  return rows;
}
```

#### Python

```python
def columnar_to_rows(headers, data):
    num_rows = len(data.get('column_1', []))
    return [
        {h: data[f'column_{j+1}'][i] for j, h in enumerate(headers)}
        for i in range(num_rows)
    ]
```

---

## Table Management

### show_table — List or Inspect Tables

#### Node.js

```javascript
// List all tables with sizes
const resp = await db.show_table('', { get_sizes: 'true', show_children: 'true' });
// resp.table_names  = ['schema1.table1', 'schema1.table2']
// resp.sizes        = [1000, 500]
// resp.type_ids     = ['type_id_1', 'type_id_2']
// resp.type_schemas = ['{"type":"record","name":"...","fields":[...]}', ...]

// Describe one table
const resp = await db.show_table('my_schema.my_table', {
  get_sizes: 'true',
  show_children: 'false',
  get_column_info: 'true'
});
```

#### Python

```python
# List all
resp = db.show_table('', options={'get_sizes': 'true', 'show_children': 'true'})
# resp['table_names'], resp['sizes'], resp['type_ids'], resp['type_schemas']

# Describe one
resp = db.show_table('my_table', options={
    'get_sizes': 'true',
    'show_children': 'false',
    'get_column_info': 'true'
})
```

**Response fields:** `table_names`, `table_descriptions`, `type_ids`, `type_schemas`, `type_labels`, `properties`, `sizes`, `full_sizes`, `total_size`, `additional_info`, `info`

### create_table

#### Node.js

```javascript
// Using Type
const myType = new GPUdb.Type(
  'my_type',
  new GPUdb.Type.Column('id', 'int'),
  new GPUdb.Type.Column('name', 'string'),
  new GPUdb.Type.Column('value', 'double')
);
const typeId = await myType.create(db);
await db.create_table('my_schema.my_table', typeId, {});

// Using SQL (simpler)
await db.execute_sql('CREATE TABLE my_table (id INT, name VARCHAR, value DOUBLE)', 0, -9999, '', [], {});
```

#### Python

```python
# Using SQL (recommended)
db.execute_sql('CREATE TABLE my_table (id INT, name VARCHAR, value DOUBLE)')

# Using Type system
columns = [
    ['id', 'int'],
    ['name', 'string'],
    ['value', 'double']
]
type_obj = gpudb.GPUdbRecordType(columns, label='my_type')
type_id = type_obj.create(db)
db.create_table('my_table', type_id)
```

### clear_table — Drop a Table

#### Node.js

```javascript
await db.clear_table('my_table', '', {});
// Options: { no_error_if_not_exists: 'true' }
```

#### Python

```python
db.clear_table('my_table', authorization='', options={})
# Options: {'no_error_if_not_exists': 'true'}
```

---

## Data Operations

### get_records_by_column — Retrieve Records

#### Node.js

```javascript
const resp = await db.get_records_by_column(
  'my_table',
  ['id', 'name', 'value'],  // columns (or ['*'] for all)
  0,                          // offset
  100,                        // limit
  {
    expression: 'value > 50',
    sort_by: 'id',
    sort_order: 'ascending'   // or 'descending'
  }
);
// resp.data contains columnar data; resp.column_headers has names
```

#### Python

```python
resp = db.get_records_by_column(
    table_name='my_table',
    column_names=['id', 'name', 'value'],  # or ['*']
    offset=0,
    limit=100,
    encoding='json',
    options={
        'expression': 'value > 50',
        'sort_by': 'id',
        'sort_order': 'ascending'
    }
)
# resp['column_headers'], resp['column_1'], resp['column_2'], etc.
```

**Options:** `expression`, `sort_by`, `sort_order` (`ascending`/`descending`), `order_by` (e.g., `'id ASC, name DESC'`)

### insert_records

#### Node.js

```javascript
// Using insert_records_from_json (simplest for JSON data)
await db.insert_records_from_json(
  [{ id: 1, name: 'Alice', value: 95.5 }, { id: 2, name: 'Bob', value: 87.2 }],
  'my_table',
  {},  // create_table_options
  {}   // options
);

// Standard insert (requires type-aware records)
await db.insert_records('my_table', records, {
  update_on_existing_pk: 'true',  // upsert
  return_record_ids: 'true'
});
```

#### Python

```python
# Using SQL (simplest)
db.execute_sql("INSERT INTO my_table VALUES (1, 'Alice', 95.5)")

# Using GPUdbTable (for bulk inserts)
table = gpudb.GPUdbTable(name='my_table', db=db)
table.insert_records([record1, record2])

# Direct HTTP to /insert/records/json (mirrors Node.js insert_records_from_json)
import urllib.request, json
url = f"{db.host}/insert/records/json?table_name=my_table"
req = urllib.request.Request(url, data=json.dumps(records).encode(), headers={'Content-Type': 'application/json'})
```

### update_records

#### Node.js

```javascript
await db.update_records_request({
  table_name: 'my_table',
  expressions: ['id = 1'],
  new_values_maps: [{ name: "'UpdatedName'", value: '99.9' }],
  options: {}
});
```

#### Python

```python
db.update_records(
    table_name='my_table',
    expressions=['id = 1'],
    new_values_maps=[{'name': "'UpdatedName'", 'value': '99.9'}],
    options={}
)
```

### delete_records

#### Node.js

```javascript
const resp = await db.delete_records('my_table', ['value < 50'], {});
// resp.count_deleted = number of rows removed
```

#### Python

```python
resp = db.delete_records(table_name='my_table', expressions=['value < 50'], options={})
# resp['count_deleted']
```

**Options:** `global_expression`, `record_id`, `delete_all_records`

---

## Filtering & Aggregation

### filter — Create a Filtered View

#### Node.js

```javascript
const resp = await db.filter('my_table', 'my_view', 'value > 50 AND name <> \'test\'', {});
// resp.count = number of matching records
```

#### Python

```python
resp = db.filter(table_name='my_table', view_name='my_view', expression='value > 50', options={})
```

### aggregate_group_by

#### Node.js

```javascript
const resp = await db.aggregate_group_by(
  'my_table',
  ['category', 'count(*)', 'sum(value)', 'avg(value)'],
  0,     // offset
  100,   // limit
  { expression: 'value > 0' }
);
// resp.data = columnar: { column_headers: [...], column_1: [...], ... }
```

#### Python

```python
resp = db.aggregate_group_by(
    table_name='my_table',
    column_names=['category', 'count(*)', 'sum(value)', 'avg(value)'],
    offset=0,
    limit=100,
    options={'expression': 'value > 0'}
)
```

### aggregate_unique

#### Node.js

```javascript
const resp = await db.aggregate_unique('my_table', 'category', 0, -9999, {});
```

#### Python

```python
resp = db.aggregate_unique(table_name='my_table', column_name='category', offset=0, limit=-9999, options={})
```

### aggregate_statistics

#### Node.js

```javascript
const resp = await db.aggregate_statistics('my_table', 'value', 'sum,mean,count,min,max,stdv', {});
// resp.stats = { sum: 500.5, mean: 50.05, count: 10, min: 10.1, max: 95.5, stdv: 25.3 }
```

#### Python

```python
resp = db.aggregate_statistics(
    table_name='my_table',
    column_name='value',
    stats='sum,mean,count,min,max,stdv',
    options={}
)
```

---

## Type System

### Kinetica Data Types

| Type | Description |
|------|-------------|
| `int` | 32-bit integer |
| `long` | 64-bit integer |
| `float` | 32-bit float |
| `double` | 64-bit double |
| `string` | Variable-length string |
| `bytes` | Binary data |

### Column Properties

| Property | Description |
|----------|-------------|
| `data` | Standard data column |
| `text_search` | Enable text search |
| `store_only` | No indexing, storage only |
| `disk_optimized` | Store on disk vs. RAM |
| `nullable` | Allow NULL values |
| `shard_key` | Sharding column |
| `primary_key` | Primary key column |
| `dict` | Dictionary-encode (for low-cardinality strings) |

### show_types

#### Node.js

```javascript
const resp = await db.show_types('', '', {});
// resp.type_ids     = ['type_id_1', ...]
// resp.labels       = ['my_type', ...]
// resp.type_schemas = ['{"type":"record",...}', ...]
```

#### Python

```python
resp = db.show_types(type_id='', label='', options={})
# resp['type_ids'], resp['labels'], resp['type_schemas']
```

---

## Error Handling

### Node.js

```javascript
try {
  const resp = await db.execute_sql('SELECT * FROM nonexistent', 0, -9999, '', [], {});
} catch (err) {
  console.error(err.message);
  // "Table 'nonexistent' does not exist"
}
```

### Python

```python
try:
    resp = db.execute_sql('SELECT * FROM nonexistent')
    if resp['status_info']['status'] == 'ERROR':
        print(resp['status_info']['message'])
except gpudb.GPUdbException as e:
    print(str(e))
```

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Connection refused | Server not running or wrong URL | Verify KINETICA_DB_SKILL_URL |
| Authentication failed | Wrong credentials | Check KINETICA_DB_SKILL_USER/PASS |
| Table does not exist | Wrong table name or schema | Use `show-tables` to list |
| Type mismatch on insert | Record fields don't match schema | Use `describe-table` to check schema |
| Expression parse error | Invalid filter syntax | Use standard SQL-like expressions |

---

## Working Examples

### Full Query Pipeline (Node.js)

```javascript
const GPUdb = require('@kinetica/gpudb');

(async () => {
  const db = new GPUdb('http://localhost:9191', { username: 'admin', password: '' });

  // Create table
  await db.execute_sql('CREATE TABLE test.demo (id INT NOT NULL, name VARCHAR(64), score DOUBLE)', 0, -9999, '', [], {});

  // Insert data
  await db.insert_records_from_json(
    [{ id: 1, name: 'Alice', score: 95.5 }, { id: 2, name: 'Bob', score: 87.2 }],
    'test.demo', {}, {}
  );

  // Query
  const resp = await db.execute_sql_request({
    statement: 'SELECT * FROM test.demo ORDER BY score DESC',
    encoding: 'json'
  });
  console.log(resp.column_headers, resp.data);

  // Cleanup
  await db.clear_table('test.demo', '', {});
})();
```

### Full Query Pipeline (Python)

```python
import gpudb

db = gpudb.GPUdb(host='http://localhost:9191', username='admin', password='')

# Create table
db.execute_sql('CREATE TABLE test.demo (id INT NOT NULL, name VARCHAR(64), score DOUBLE)')

# Insert data
db.execute_sql("INSERT INTO test.demo VALUES (1, 'Alice', 95.5), (2, 'Bob', 87.2)")

# Query
resp = db.execute_sql('SELECT * FROM test.demo ORDER BY score DESC', encoding='json')
headers = resp['column_headers']
for i in range(len(resp.get('column_1', []))):
    row = {h: resp[f'column_{j+1}'][i] for j, h in enumerate(headers)}
    print(row)

# Cleanup
db.clear_table('test.demo')
```

---

## Graph Operations

Create, solve, query, and manage graphs built from table data. Kinetica's graph engine supports shortest path, TSP, PageRank, centrality, isochrone, and more.

### create_graph

#### Node.js

```javascript
const resp = await db.create_graph('my_graph', false, [
  'roads.src AS SOURCE', 'roads.dst AS DESTINATION', 'roads.cost AS WEIGHT_VALUESPECIFIED'
], [], [], [], {
  graph_table: 'my_graph_table',
  add_table_monitor: 'true'
});
// resp.result = true on success
```

#### Python

```python
resp = db.create_graph(
    graph_name='my_graph',
    directed_graph=False,
    nodes=[],
    edges=['roads.src AS SOURCE', 'roads.dst AS DESTINATION', 'roads.cost AS WEIGHT_VALUESPECIFIED'],
    weights=[],
    restrictions=[],
    options={
        'graph_table': 'my_graph_table',
        'add_table_monitor': 'true'
    }
)
```

**Edge specification format:** `table.column AS EDGE_ROLE` where roles include `SOURCE`, `DESTINATION`, `WEIGHT_VALUESPECIFIED`, `WEIGHT_FACTORSPECIFIED`, `NODE_ID`, `NODE_NAME`, `NODE_X`, `NODE_Y`.

### solve_graph

#### Node.js

```javascript
const resp = await db.solve_graph('my_graph', [], [], [], 'SHORTEST_PATH', [
  'node_A'  // source nodes
], [
  'node_B'  // destination nodes
], {});
// resp.result_table contains the solution path/costs
```

#### Python

```python
resp = db.solve_graph(
    graph_name='my_graph',
    weights_on_edges=[],
    restrictions=[],
    solver_type='SHORTEST_PATH',
    source_nodes=['node_A'],
    destination_nodes=['node_B'],
    options={}
)
# resp['result_table'] — solution table name
```

**Solver types:** `SHORTEST_PATH`, `PAGE_RANK`, `CENTRALITY`, `MULTIPLE_ROUTING`, `ALLPATHS`, `TSP`, `INVERSE_SHORTEST_PATH`, `BACKHAUL_ROUTING`, `ISOCHRONE`

### query_graph / match_graph

#### Node.js

```javascript
// Query adjacency
const resp = await db.query_graph('my_graph', [
  'SELECT * FROM TABLE(QUERY_GRAPH(PATH => \'node_A\', RINGS => 2))'
], [], [], {});

// Map-match GPS points to graph edges
const resp = await db.match_graph('my_graph', 'gps_points_table', ['x AS SAMPLE_X', 'y AS SAMPLE_Y'], {
  gps_noise: '50'
});
```

#### Python

```python
# Query adjacency
resp = db.query_graph(
    graph_name='my_graph',
    queries=['SELECT * FROM TABLE(QUERY_GRAPH(PATH => \'node_A\', RINGS => 2))'],
    restrictions=[],
    adjacency_table='',
    options={}
)

# Map-match GPS points
resp = db.match_graph(
    graph_name='my_graph',
    sample_points='gps_points_table',
    solve_method='markov_chain',
    options={'gps_noise': '50'}
)
```

**Response format:** Both return a result table name containing the graph solution or match output. Query the result table with SQL to retrieve rows.

---

## Geospatial Filtering

GPU-accelerated spatial filters that create filtered views from table data. All filters return `{ count: N }` indicating how many records matched.

### filter_by_radius

#### Node.js

```javascript
const resp = await db.filter_by_radius('locations', 'nearby_view', 'longitude', 'latitude', -122.4, 37.77, 5000, {});
// resp.count = number of matching records
// Query the view: SELECT * FROM nearby_view
```

#### Python

```python
resp = db.filter_by_radius(
    table_name='locations',
    view_name='nearby_view',
    x_column_name='longitude',
    y_column_name='latitude',
    x_center=-122.4,
    y_center=37.77,
    radius=5000,  # meters
    options={}
)
# resp['count'] — number of matching records
```

### filter_by_box

#### Node.js

```javascript
const resp = await db.filter_by_box('locations', 'box_view', 'longitude', -122.5, -122.3, 'latitude', 37.7, 37.8, {});
```

#### Python

```python
resp = db.filter_by_box(
    table_name='locations',
    view_name='box_view',
    x_column_name='longitude',
    min_x=-122.5,
    max_x=-122.3,
    y_column_name='latitude',
    min_y=37.7,
    max_y=37.8,
    options={}
)
```

### filter_by_geometry

#### Node.js

```javascript
const resp = await db.filter_by_geometry('locations', 'geo_view', 'geom_col', '', 'POLYGON((-122.5 37.7, -122.3 37.7, -122.3 37.8, -122.5 37.8, -122.5 37.7))', 'contains', {});
```

#### Python

```python
resp = db.filter_by_geometry(
    table_name='locations',
    view_name='geo_view',
    column_name='geom_col',
    input_wkt='POLYGON((-122.5 37.7, -122.3 37.7, -122.3 37.8, -122.5 37.8, -122.5 37.7))',
    operation='contains',
    options={}
)
```

**Operations:** `contains`, `crosses`, `disjoint`, `equals`, `intersects`, `overlaps`, `touches`, `within`

---

## Import / Export

Bulk data operations for loading external files and managing Kinetica's distributed file system (KiFS).

### insert_records_from_files (Import)

#### Node.js

```javascript
const resp = await db.insert_records_from_files(
  'my_table',
  ['/data/records.csv'],  // file paths (local or KiFS)
  {},  // create_table_options
  {
    file_type: 'delimited_text',
    text_delimiter: ',',
    text_has_header: 'true'
  }
);
// resp.count_inserted, resp.count_skipped, resp.count_updated
```

#### Python

```python
resp = db.insert_records_from_files(
    table_name='my_table',
    filepaths=['/data/records.csv'],
    create_table_options={},
    options={
        'file_type': 'delimited_text',
        'text_delimiter': ',',
        'text_has_header': 'true'
    }
)
```

**File types:** `delimited_text` (CSV/TSV), `json`, `parquet`, `shapefile`

### export_records_to_files (Export)

#### Node.js

```javascript
const resp = await db.export_records_to_files(
  'my_table',
  '/export/output.csv',
  {
    file_type: 'delimited_text',
    text_delimiter: ','
  }
);
```

#### Python

```python
resp = db.export_records_to_files(
    table_name='my_table',
    filepath='/export/output.csv',
    options={
        'file_type': 'delimited_text',
        'text_delimiter': ','
    }
)
```

### KiFS Operations (upload_files / download_files)

#### Node.js

```javascript
// Upload
const resp = await db.upload_files(['/local/data.csv'], ['/kifs/data/data.csv'], {});

// Download
const resp = await db.download_files(['/kifs/data/data.csv'], ['/local/downloaded.csv'], {});

// List directory
const resp = await db.show_files(['/kifs/data/'], {});
// resp.file_names, resp.sizes

// Create directory
const resp = await db.create_directory('/kifs/data/new_dir', {});
```

#### Python

```python
# Upload
resp = db.upload_files(
    file_names=['/local/data.csv'],
    file_encoding='base64',
    options={'kifs_path': '/kifs/data/data.csv'}
)

# Download
resp = db.download_files(
    file_names=['/kifs/data/data.csv'],
    read_offsets=[0],
    read_lengths=[0],  # 0 = entire file
    options={}
)

# List directory
resp = db.show_files(paths=['/kifs/data/'], options={})

# Create directory
resp = db.create_directory(directory_name='/kifs/data/new_dir', options={})
```

---

## Visualization

Server-side rendering of charts, heatmaps, and geospatial overlays. Returns binary image data (PNG) or base64-encoded strings.

### visualize_image_chart

#### Node.js

```javascript
const resp = await db.visualize_image_chart(
  'sales',            // table_name
  [],                 // x_column_names
  ['month'],          // y_column_names  (used as category axis)
  0, 0,               // min_x, max_x (auto if 0)
  0, 0,               // min_y, max_y (auto if 0)
  800, 600,           // width, height
  'linespoints',      // style_options
  {
    title: 'Monthly Revenue',
    x_label: 'Month',
    y_label: 'Revenue'
  }
);
// resp.image_data = base64 PNG
```

#### Python

```python
resp = db.visualize_image_chart(
    table_name='sales',
    x_column_names=['month'],
    y_column_names=['revenue'],
    min_x=0, max_x=0,
    min_y=0, max_y=0,
    width=800, height=600,
    bg_color='FFFFFF',
    style_options={'pointshape': 'circle', 'pointsize': 5},
    options={'title': 'Monthly Revenue'}
)
# resp['image_data'] — base64-encoded PNG
```

### WMS — Web Map Service (Heatmap, Class-break, Raster)

The `/wms` endpoint replaces the deprecated `visualize_image_heatmap` and `visualize_image_classbreak` endpoints. It returns raw PNG bytes (not base64).

#### Common WMS Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `REQUEST` | Yes | Always `GetMap` |
| `FORMAT` | Yes | `image/png` |
| `SRS` | Yes | Spatial reference system (e.g. `EPSG:4326`) |
| `LAYERS` | Yes | Table name |
| `BBOX` | Yes | `minX,minY,maxX,maxY` |
| `WIDTH` | No | Image width (default: 800) |
| `HEIGHT` | No | Image height (default: 600) |
| `STYLES` | No | Render style: `heatmap`, `cb_raster`, `raster`, etc. |
| `X_ATTR` | No | X coordinate column name |
| `Y_ATTR` | No | Y coordinate column name |

#### Style-Specific Parameters

**heatmap:** `VAL_ATTR`, `BLUR_RADIUS`, `COLORMAP` (jet, hot, viridis, plasma, etc.)

**cb_raster:** `CB_ATTR`, `CB_VALS`, `POINTCOLORS`, `POINTSIZES`, `POINTSHAPES`

#### Node.js

```javascript
// Heatmap via WMS — returns a Buffer (raw PNG)
const buffer = await db.wms_request({
  REQUEST: 'GetMap',
  FORMAT: 'image/png',
  SRS: 'EPSG:4326',
  LAYERS: 'sensor_data',
  BBOX: '-122.5,37.7,-122.3,37.8',
  WIDTH: 800,
  HEIGHT: 600,
  STYLES: 'heatmap',
  X_ATTR: 'longitude',
  Y_ATTR: 'latitude',
  VAL_ATTR: 'temperature',
  BLUR_RADIUS: 5,
  COLORMAP: 'jet',
});
require('fs').writeFileSync('heatmap.png', buffer);

// Class-break via WMS
const buffer = await db.wms_request({
  REQUEST: 'GetMap',
  FORMAT: 'image/png',
  SRS: 'EPSG:4326',
  LAYERS: 'my_table',
  BBOX: '-180,-90,180,90',
  STYLES: 'cb_raster',
  X_ATTR: 'lon',
  Y_ATTR: 'lat',
  CB_ATTR: 'category',
  CB_VALS: 'A,B,C',
  POINTCOLORS: 'FF0000,00FF00,0000FF',
});
```

#### Python

```python
import urllib.parse
import urllib.request
import base64

# Build WMS URL
params = {
    'REQUEST': 'GetMap',
    'FORMAT': 'image/png',
    'SRS': 'EPSG:4326',
    'LAYERS': 'sensor_data',
    'BBOX': '-122.5,37.7,-122.3,37.8',
    'WIDTH': '800',
    'HEIGHT': '600',
    'STYLES': 'heatmap',
    'X_ATTR': 'longitude',
    'Y_ATTR': 'latitude',
    'VAL_ATTR': 'temperature',
    'BLUR_RADIUS': '5',
    'COLORMAP': 'jet',
}
url = f"{db.host}/wms?{urllib.parse.urlencode(params)}"
req = urllib.request.Request(url)
# Add auth header (Bearer or Basic) as needed
with urllib.request.urlopen(req) as resp:
    png_bytes = resp.read()

with open('heatmap.png', 'wb') as f:
    f.write(png_bytes)
```

**Response:** Raw PNG bytes (Buffer in Node.js, bytes in Python). Write directly to file — no base64 decoding needed.

---

## Monitoring

Create table monitors for change notifications and area/range triggers for geofencing.

### create_table_monitor

#### Node.js

```javascript
const resp = await db.create_table_monitor('my_table', {
  event: 'insert'  // 'insert', 'update', 'delete'
});
// resp.topic_id = monitor identifier
// resp.table_name = monitored table
// Use topic_id to subscribe via ZMQ or poll for changes
```

#### Python

```python
resp = db.create_table_monitor(
    table_name='my_table',
    options={'event': 'insert'}
)
# resp['topic_id'] — use to subscribe for notifications
```

### create_trigger_by_area

#### Node.js

```javascript
const resp = await db.create_trigger_by_area(
  'request_id_123',
  ['my_table'],
  'longitude',
  ['latitude'],
  -122.5, -122.3,   // x range
  37.7, 37.8,        // y range
  {}
);
```

#### Python

```python
resp = db.create_trigger_by_area(
    request_id='request_id_123',
    table_names=['my_table'],
    x_column_name='longitude',
    x_vector=['latitude'],
    min_x=-122.5, max_x=-122.3,
    min_y=37.7, max_y=37.8,
    options={}
)
```

### clear_table_monitor / clear_trigger

#### Node.js

```javascript
// Clear monitor
await db.clear_table_monitor('topic_id_here', {});

// Clear trigger
await db.clear_trigger('trigger_id_here', {});
```

#### Python

```python
# Clear monitor
db.clear_table_monitor(topic_id='topic_id_here', options={})

# Clear trigger
db.clear_trigger(trigger_id='trigger_id_here', options={})
```

**Monitor workflow:** Create a monitor to get a `topic_id`, then subscribe to `tcp://<kinetica_host>:9002` via ZMQ with that topic to receive real-time change notifications.
