# SDK Code Templates

Minimal entry-point boilerplate for executing Kinetica operations from a generated script. Use these templates as the skeleton when the user asks for "a script that does X" — fill in the body inside the existing connection/error-handling structure rather than re-writing the boilerplate each time.

Both templates honor the same environment variables used by the CLI (`KINETICA_DB_SKILL_URL`, `KINETICA_DB_SKILL_USER`, `KINETICA_DB_SKILL_PASS`), so generated scripts run against the same target without extra configuration.

For deeper code-generation patterns (connection pooling, batch ingest, GPUdbException handling, generic vs. SQL execution modes), see the kinetica-code skill's SKILL.md — these templates are the minimal "hello world" entry points that the kinetica-code patterns extend.

## Node.js Template

```javascript
const GPUdb = require('@kinetica/gpudb');

(async () => {
  const db = new GPUdb(process.env.KINETICA_DB_SKILL_URL || 'http://localhost:9191', {
    username: process.env.KINETICA_DB_SKILL_USER || '',
    password: process.env.KINETICA_DB_SKILL_PASS || ''
  });

  try {
    // Your operations here
    const resp = await db.execute_sql_request({
      statement: 'SELECT * FROM my_table',
      encoding: 'json'
    });
    console.log(resp.data);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
```

## Python Template

```python
import gpudb
import os

db = gpudb.GPUdb(
    host=os.environ.get('KINETICA_DB_SKILL_URL', 'http://localhost:9191'),
    username=os.environ.get('KINETICA_DB_SKILL_USER', ''),
    password=os.environ.get('KINETICA_DB_SKILL_PASS', '')
)

# Your operations here
resp = db.execute_sql('SELECT * FROM my_table', encoding='json')
print(resp['column_headers'])
```
