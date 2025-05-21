# JSON to SQL CREATE Tool

A simple web tool that converts JSON column definitions into a SQL `CREATE TABLE` statement. Paste your JSON data, click "Generate SQL", and copy the resulting SQL statement to your clipboard.

---

## Features

- **Paste JSON**: Input your JSON column definitions directly into the web interface.
- **Generate SQL**: Instantly create a SQL `CREATE TABLE` statement based on your JSON.
- **Copy to Clipboard**: One-click copy of the generated SQL for easy use in your database projects.
- **Client-side**: All processing is done in your browser—no data is sent to a server.

---

## Usage

1. **Clone or Download the Repository**
   ```sh
   git clone https://github.com/yourusername/JsontoSQLCreate.git
   cd JsontoSQLCreate
   ```

2. **Open `index.html` in your browser**

3. **Paste your JSON**
   - The JSON should be an array of objects, each with a `name` and `type` property.

   **Example:**
   ```json
   [
     { "name": "id", "type": "int" },
     { "name": "username", "type": "varchar(255)" },
     { "name": "created_at", "type": "datetime" }
   ]
   ```

4. **Click "Generate SQL"**
   - The SQL `CREATE TABLE` statement will appear in the output box.

5. **Click "Copy to Clipboard"**
   - The SQL statement is copied for use elsewhere.

---

## File Structure

```
JsontoSQLCreate/
│
├── index.html      # Main HTML file
├── style.css       # Styles for the tool
├── script.js       # JavaScript logic for parsing and SQL generation
├── README.md       # This file
```

---

## Customization

- **Table Name**: You can modify the JavaScript to prompt for or infer a table name.
- **Data Types**: The script can be extended to validate or infer SQL data types.

---

## License

MIT License

---

## Contributing

Pull requests and suggestions are welcome! Please open an issue or submit a PR.
