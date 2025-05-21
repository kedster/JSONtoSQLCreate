// Safer object key handling for flattenJSON
function flattenJSON(obj, parentKey = '', res = {}) {
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
    const propName = parentKey ? `${parentKey}_${key}` : key;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      flattenJSON(val, propName, res);
    } else {
      res[propName] = val;
    }
  }
  return res;
}

// Improved type detection for inferSQLType
function inferSQLType(value) {
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) return 'INTEGER';
    if (/^\d+\.\d+$/.test(trimmed)) return 'REAL';
    if (/^\d{4}-\d{2}-\d{2}([ T]|\b)/.test(trimmed)) return trimmed.includes('T') ? 'DATETIME' : 'DATE';
  }

  return 'TEXT'; // fallback
}

// Replace inferType with inferSQLType in detectTables and use column objects
function detectTables(data, parentTable = 'root', parentKey = null) {
  const tables = {};
  const tableDataMap = {};
  const queue = [{ item: data, tableName: parentTable, parentId: null }];

  while (queue.length > 0) {
    const { item, tableName, parentId } = queue.shift();
    if (!tables[tableName]) {
      tables[tableName] = { columns: {}, fks: [], pks: ['id'] };
    }
    if (!tableDataMap[tableName]) tableDataMap[tableName] = [];

    if (Array.isArray(item)) {
      item.forEach(entry => queue.push({ item: entry, tableName, parentId }));
    } else if (typeof item === 'object' && item !== null) {
      const row = {};
      if (parentId !== null) row.parent_id = parentId;
      if (parentId !== null && !tables[tableName].columns['parent_id']) {
        tables[tableName].columns['parent_id'] = { type: 'INTEGER', required: false };
        tables[tableName].fks.push({ col: 'parent_id', ref: parentTable });
      }

      for (const key in item) {
        if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
        const value = item[key];

        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
          const childTable = `${tableName}_${key}`;
          // Always pass the current table's name as parentTable and a placeholder parentId (e.g., 1)
          queue.push({ item: value, tableName: childTable, parentId: 1 });
        } else {
          tables[tableName].columns[key] = {
            type: inferSQLType(value),
            required: false
          };
          row[key] = value;
        }
      }

      tableDataMap[tableName].push(row);
    }
  }

  return { schema: tables, data: tableDataMap };
}

// Updated generateSQL: escapes table/column names for safety
function generateSQL(schema) {
  let sql = '';
  for (const tableName in schema) {
    const table = schema[tableName];
    sql += `CREATE TABLE "${tableName}" (\n`;
    const columns = [`  "id" INTEGER PRIMARY KEY AUTOINCREMENT`];

    for (const col in table.columns) {
      if (col === 'id') continue;
      const colDef = table.columns[col];
      columns.push(`  "${col}" ${colDef.type}`);
    }

    table.fks.forEach(fk => {
      columns.push(`  FOREIGN KEY ("${fk.col}") REFERENCES "${fk.ref}"("id")`);
    });

    sql += columns.join(',\n') + '\n);\n\n';
  }
  return sql.trim();
}

function generateRelationalSchema(json) {
  return detectTables(json);
}

// Render schema tabs for SQL statements
function renderSchemaTabs(sqlStatements) {
  const container = document.getElementById('schemaTabs');
  container.innerHTML = '';

  const tabHeaders = document.createElement('ul');
  tabHeaders.className = 'tab-headers';

  Object.entries(sqlStatements).forEach(([table, sql], index) => {
    const header = document.createElement('li');
    header.textContent = table;
    header.dataset.tab = table;
    if (index === 0) header.classList.add('active');
    tabHeaders.appendChild(header);
  });

  const tabContents = document.createElement('div');
  tabContents.className = 'tab-contents';

  Object.entries(sqlStatements).forEach(([table, sql], index) => {
    const tab = document.createElement('div');
    tab.className = 'tab-content';
    tab.id = `tab-${table}`;
    if (index === 0) tab.classList.add('active');
    tab.innerHTML = `<h3>${table}</h3><pre>${sql}</pre>`;
    tabContents.appendChild(tab);
  });

  container.appendChild(tabHeaders);
  container.appendChild(tabContents);

  tabHeaders.addEventListener('click', e => {
    if (e.target.tagName === 'LI') {
      const selected = e.target.dataset.tab;
      [...tabHeaders.children].forEach(el => el.classList.remove('active'));
      [...tabContents.children].forEach(el => el.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(`tab-${selected}`).classList.add('active');
    }
  });
}

// Event listeners for UI

document.getElementById('generateBtn').addEventListener('click', () => {
  let input = document.getElementById('jsonInput').value;
  // NDJSON support
  if (isNDJSON(input)) {
    input = ndjsonToJSONArray(input);
  }
  const { json, error } = parseAnyJSON(input);
  if (error) {
    document.getElementById('sqlOutput').value =
      'Invalid JSON: ' + error + '\n\nTip: Paste standard JSON, NDJSON, or JSON-like data (loose JSON).';
    return;
  }
  if (!json || (typeof json !== 'object' && !Array.isArray(json))) {
    document.getElementById('sqlOutput').value = 'Input is not a valid JSON object or array.';
    return;
  }
  try {
    const { schema, data } = generateRelationalSchema(json);
    let fullSQL = '';
    const sqlStatements = {};

    for (const tableName in schema) {
      const createSQL = generateSQL({ [tableName]: schema[tableName] });
      sqlStatements[tableName] = createSQL;
      fullSQL += createSQL + '\n\n'; // <-- Add extra newline here
      if (data[tableName] && data[tableName].length > 0) {
        fullSQL += generateInsertStatements(
          tableName,
          schema[tableName].columns,
          data[tableName]
        ) + '\n';
      }
    }

    document.getElementById('sqlOutput').value = fullSQL.trim();
    renderSchemaTabs(sqlStatements);
    if (window.renderERD) window.renderERD(schema);
  } catch (e) {
    document.getElementById('sqlOutput').value =
      'Error processing data: ' + e.message;
  }
});

document.getElementById('copyBtn').addEventListener('click', () => {
  const output = document.getElementById('sqlOutput');
  output.select();
  document.execCommand('copy');
});

function generateInsertStatements(tableName, columns, dataRows) {
  if (!Array.isArray(dataRows) || dataRows.length === 0) return '';
  const colNames = Object.keys(columns);
  let sql = '';

  dataRows.forEach(row => {
    const values = colNames.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
      return val;
    });
    sql += `INSERT INTO "${tableName}" (${colNames.map(c => `"${c}"`).join(', ')}) VALUES (${values.join(', ')});\n`;
  });

  return sql;
}

function sanitizeJSON(input) {
  // Remove BOM if present
  input = input.replace(/^\uFEFF/, '');
  // Remove trailing commas before } or ]
  input = input.replace(/,\s*([\]}])/g, '$1');
  // Optionally, normalize non-standard quotes (replace smart quotes with standard quotes)
  input = input.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
               .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
  return input;
}

function isNDJSON(input) {
  const lines = input.split('\n')
    .map(l => l.trim())
    .filter(line => line && !line.startsWith('//') && !line.startsWith('#'));
  const validLines = lines.filter(line => line.startsWith('{') || line.startsWith('['));
  return lines.length > 1 && validLines.length / lines.length > 0.8;
}

function ndjsonToJSONArray(input) {
  const lines = input
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('//') && !line.startsWith('#'));
  return `[${lines.join(',')}]`;
}

function fixLooseJSON(input) {
  // Trim whitespace first
  input = input.trim();

  // If input looks like multiple objects without enclosing []
  if (!input.startsWith('[') && input.includes('},') && input.includes('{')) {
    input = `[${input}]`;
  }

  // Wrap unquoted keys with double quotes
  input = input.replace(/([\{\[,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');

  // Convert single quotes to double quotes
  input = input.replace(/'([^']*)'/g, '"$1"');

  // Remove trailing commas before } or ]
  input = input.replace(/,\s*([\}\]])/g, '$1');

  return input;
}

function parseAnyJSON(input) {
  // Try strict JSON first
  try {
    return { json: JSON.parse(input), error: null };
  } catch {}
  // Try sanitizing
  try {
    return { json: JSON.parse(sanitizeJSON(input)), error: null };
  } catch {}
  // Try fixing loose JSON
  try {
    return { json: JSON.parse(fixLooseJSON(input)), error: null };
  } catch (e) {
    return { json: null, error: e.message };
  }
}

function renderERD(tables) {
  let erd = 'erDiagram\n';
  for (const [table, def] of Object.entries(tables)) {
    erd += `  ${table} {\n`;
    for (const colName in def.columns) {
      erd += `    ${def.columns[colName].type} ${colName}\n`;
    }
    erd += '  }\n';
  }
  for (const [table, def] of Object.entries(tables)) {
    if (def.fks) {
      def.fks.forEach(fk => {
        erd += `  ${fk.ref} ||--o{ ${table} : "parent_id"\n`;
      });
    }
  }
  document.getElementById('erdContainer').innerHTML = `<pre class="mermaid">${erd}</pre>`;
  mermaid.run();
}
