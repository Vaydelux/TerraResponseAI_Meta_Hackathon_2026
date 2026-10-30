// scripts/_sql_split.ts
//
// Splits a SQL file into individual statements, respecting:
//   - dollar-quoted strings ($$ ... $$ or $tag$ ... $tag$)
//   - single-quoted strings ('...' with '' escapes)
//   - line comments (-- ...)
//   - block comments (/* ... */)
//
// Used by the local SQL test runner to apply migrations one statement
// at a time against PGlite (which doesn't accept multi-statement
// queries the same way `psql -f` does).

export function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;
  let dollarTag: string | null = null; // active dollar-quote tag, or null

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1] ?? "";

    // Inside a dollar-quoted string: only look for the closing tag.
    if (dollarTag !== null) {
      buf += ch;
      if (ch === "$") {
        // Check for the matching close tag
        const closeTag = "$" + dollarTag.slice(1) + "$";
        // Actually dollarTag already includes both leading and trailing $
        // e.g. "$$" or "$abc$". We need to compare the next chars.
        const tag = dollarTag; // like "$$" or "$abc$"
        const tagLen = tag.length;
        const candidate = sql.slice(i, i + tagLen);
        if (candidate === tag) {
          buf += sql.slice(i + 1, i + tagLen);
          i += tagLen;
          dollarTag = null;
          continue;
        }
      }
      i++;
      continue;
    }

    // Look for the start of a dollar-quoted string: $optional-tag$
    if (ch === "$") {
      // Match $tag$ where tag is empty or alphanumeric + underscore
      let j = i + 1;
      let tagEnd = -1;
      while (j < n) {
        const c = sql[j];
        if (c === "$") {
          tagEnd = j;
          break;
        }
        if (!/[a-zA-Z_0-9]/.test(c)) break;
        j++;
      }
      if (tagEnd > 0) {
        const tag = sql.slice(i, tagEnd + 1); // includes both $
        buf += tag;
        i = tagEnd + 1;
        dollarTag = tag;
        continue;
      }
    }

    // Single-quoted string
    if (ch === "'") {
      buf += ch;
      i++;
      while (i < n) {
        const c = sql[i];
        buf += c;
        i++;
        if (c === "'") {
          if (sql[i] === "'") {
            // escaped quote, consume and continue
            buf += sql[i];
            i++;
          } else {
            break;
          }
        }
      }
      continue;
    }

    // Line comment
    if (ch === "-" && next === "-") {
      const j = sql.indexOf("\n", i);
      if (j === -1) break;
      i = j; // keep the newline
      continue;
    }

    // Block comment
    if (ch === "/" && next === "*") {
      const j = sql.indexOf("*/", i + 2);
      if (j === -1) break;
      i = j + 2;
      continue;
    }

    // Statement terminator: semicolon at top level
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt.length > 0) statements.push(stmt);
      buf = "";
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  // Last statement (if no trailing ;)
  const last = buf.trim();
  if (last.length > 0) statements.push(last);

  return statements;
}
