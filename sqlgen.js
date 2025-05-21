function flattenJSON(obj, parentKey = '', res = {}) {
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    const propName = parentKey ? `${parentKey}_${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      flattenJSON(obj[key], propName, res);
    } else {
      res[propName] = obj[key];
    }
  }
  return res;
}

function inferSQLType(value) {
  if (typeof value === 'boolean') return 'BOOLEAN';
  if (typeof value === 'number') return Number.isInteger(value) ? 'INTEGER' : 'REAL';
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'DATE';
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return 'DATETIME';
    return 'TEXT';
  }
  return 'TEXT'; // fallback
}

// Replace inferType with inferSQLType in detectTables and use column objects
function detectTables(data, parentTable = 'root') {
  const tables = {};
  const queue = [{ item: data, tableName: parentTable, parentKey: null }];

  while (queue.length) {
    const { item, tableName, parentKey } = queue.shift();

    if (!tables[tableName]) tables[tableName] = { columns: {}, fks: [], pks: ['id'] };

    if (Array.isArray(item)) {
      item.forEach(entry => queue.push({ item: entry, tableName, parentKey }));
    } else if (typeof item === 'object' && item !== null) {
      for (const key in item) {
        if (!item.hasOwnProperty(key)) continue;
        const value = item[key];

        if (Array.isArray(value)) {
          const childTable = `${tableName}_${key}`;
          tables[childTable] = tables[childTable] || { columns: {}, fks: [], pks: ['id'] };
          tables[childTable].columns[`${tableName}_id`] = { type: 'INTEGER', required: false };
          tables[childTable].fks.push({ col: `${tableName}_id`, ref: `${tableName}(id)` });
          queue.push({ item: value, tableName: childTable, parentKey: `${tableName}_id` });
        } else if (typeof value === 'object' && value !== null) {
          const childTable = `${tableName}_${key}`;
          tables[childTable] = tables[childTable] || { columns: {}, fks: [], pks: ['id'] };
          tables[childTable].columns[`${tableName}_id`] = { type: 'INTEGER', required: false };
          tables[childTable].fks.push({ col: `${tableName}_id`, ref: `${tableName}(id)` });
          queue.push({ item: value, tableName: childTable, parentKey: `${tableName}_id` });
        } else {
          // Use inferSQLType and column object
          if (!tables[tableName].columns[key]) {
            tables[tableName].columns[key] = {
              type: inferSQLType(value),
              required: false // Could be set to true if always present
            };
          }
        }
      }
    }
  }

  return tables;
}

// Update generateSQL to use new column object structure
function generateSQL(schema) {
  let sql = '';
  for (const tableName in schema) {
    const table = schema[tableName];
    sql += `CREATE TABLE ${tableName} (\n`;
    const columns = [`  id INTEGER PRIMARY KEY AUTOINCREMENT`];

    for (const col in table.columns) {
      if (col === 'id') continue; // already handled
      const colDef = table.columns[col];
      columns.push(`  ${col} ${colDef.type}`);
    }

    table.fks.forEach(fk => {
      columns.push(`  FOREIGN KEY (${fk.col}) REFERENCES ${fk.ref}`);
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
  const input = document.getElementById('jsonInput').value;
  try {
    const json = JSON.parse(input);
    const schema = generateRelationalSchema(json);
    let fullSQL = '';
    const sqlStatements = {};

    // Generate CREATE TABLE and INSERT statements for each table
    for (const tableName in schema) {
      const createSQL = generateSQL({ [tableName]: schema[tableName] });
      sqlStatements[tableName] = createSQL;
      fullSQL += createSQL + '\n';

      // If data exists for this table in the JSON, generate INSERTs
      if (json[tableName] && Array.isArray(json[tableName])) {
        fullSQL += generateInsertStatements(
          tableName,
          schema[tableName].columns,
          json[tableName]
        ) + '\n';
      }
    }

    document.getElementById('sqlOutput').value = fullSQL.trim();
    renderSchemaTabs(sqlStatements);
    if (window.renderERD) window.renderERD(schema);
  } catch (e) {
    document.getElementById('sqlOutput').value = 'Invalid JSON: ' + e.message;
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
    const values = colNames.map(col =>
      row[col] === null || row[col] === undefined
        ? 'NULL'
        : typeof row[col] === 'string'
          ? `'${row[col].replace(/'/g, "''")}'`
          : row[col]
    );
    sql += `INSERT INTO ${tableName} (${colNames.join(', ')}) VALUES (${values.join(', ')});\n`;
  });
  return sql;
}
