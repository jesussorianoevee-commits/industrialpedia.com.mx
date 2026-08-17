// Document Intelligence Layer V2 — extracción estructural determinística de PDF.
// Sin IA/OCR externo. Usa PDF.js/unpdf para conservar texto + geometría + orden de lectura.
// Contrato: pages, blocks, tables, specTable, text y totalPages.
import { getDocumentProxy } from 'npm:unpdf';

const Y_TOLERANCE = 3;
// Minimum horizontal whitespace used to separate PDF text runs into visual cells.
// This is a geometry threshold only; it is not tied to a manufacturer or document.
const MIN_TABLE_GAP = 10;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function bboxFromItem(item) {
  const t = Array.isArray(item?.transform) ? item.transform : [];
  const x = Number(t[4] || 0);
  const y = Number(t[5] || 0);
  const width = Number(item?.width || 0);
  const height = Math.abs(Number(item?.height || t[3] || 0));
  return { x0: x, y0: y - height, x1: x + width, y1: y };
}

function mergeBbox(items) {
  const boxes = items.map((i) => i.bbox).filter(Boolean);
  if (!boxes.length) return null;
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1))
  };
}

function groupLines(items) {
  const sorted = [...items].filter((i) => cleanText(i.str)).sort((a, b) => {
    if (Math.abs(b.bbox.y1 - a.bbox.y1) > Y_TOLERANCE) return b.bbox.y1 - a.bbox.y1;
    return a.bbox.x0 - b.bbox.x0;
  });

  const lines = [];
  for (const item of sorted) {
    let line = lines.find((l) => Math.abs(l.y - item.bbox.y1) <= Y_TOLERANCE);
    if (!line) {
      line = { y: item.bbox.y1, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line, index) => {
      line.items.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const text = cleanText(line.items.map((i) => i.str).join(' '));
      const bbox = mergeBbox(line.items);
      const maxHeight = Math.max(...line.items.map((i) => i.bbox.y1 - i.bbox.y0));
      const uppercaseRatio = text.replace(/[^A-Za-z]/g, '').length
        ? text.replace(/[^A-Z]/g, '').length / text.replace(/[^A-Za-z]/g, '').length
        : 0;
      const blockType = text.length <= 100 && (uppercaseRatio > 0.8 || maxHeight >= 14) ? 'heading_or_label' : 'text';
      return { index, text, bbox, items: line.items, block_type: blockType };
    })
    .filter((l) => l.text);
}

const HEADER_ROLE_PATTERNS = [
  ['PART_NUMBER', /^(?:part(?:[ ]+number|[ ]+no\.?|[ ]+#)|p\/n|pn|mpn|order(?:ing)?[ ]+(?:number|no\.?|code)|model[ ]+(?:number|no\.?)|product[ ]+number)$/i],
  ['PARAMETER', /^(?:parameter|param|spec(?:ification)?|characteristic|item)$/i],
  ['TEST_CONDITION', /^(?:test[ ]+conditions?|conditions?|test)$/i],
  ['MIN', /^min(?:imum)?$/i],
  ['TYP', /^(?:typ|typical)$/i],
  ['MAX', /^max(?:imum)?$/i],
  ['UNIT', /^(?:unit|units)$/i],
  ['PACKAGE', /^package(?:[ ]+type)?$/i],
  ['DESCRIPTION', /^(?:description|feature|features)$/i]
];

function cellFromItems(items) {
  return {
    text: cleanText(items.map((i) => i.str).join(' ')),
    bbox: mergeBbox(items),
    item_indexes: items.map((i) => i.item_index)
  };
}

function splitLineIntoCells(items) {
  const sorted = [...items].sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const cells = [];
  let current = [];
  for (const item of sorted) {
    const prev = current[current.length - 1];
    const gap = prev ? item.bbox.x0 - prev.bbox.x1 : 0;
    if (current.length && gap >= MIN_TABLE_GAP) {
      cells.push(cellFromItems(current));
      current = [];
    }
    current.push(item);
  }
  if (current.length) cells.push(cellFromItems(current));
  return cells.filter((c) => c.text);
}

function headerRole(text) {
  const value = cleanText(text);
  for (const [role, re] of HEADER_ROLE_PATTERNS) if (re.test(value)) return role;
  return '';
}

function assignColumnIndexes(rows) {
  const anchors = [];
  for (const row of rows) {
    for (const cell of row) {
      const x = cell.bbox?.x0;
      if (!Number.isFinite(x)) continue;
      let anchor = anchors.find((a) => Math.abs(a.x - x) <= 12);
      if (!anchor) {
        anchor = { x, count: 0 };
        anchors.push(anchor);
      }
      anchor.x = (anchor.x * anchor.count + x) / (anchor.count + 1);
      anchor.count++;
      cell._anchor = anchor;
    }
  }
  anchors.sort((a, b) => a.x - b.x);
  const index = new Map(anchors.map((a, i) => [a, i]));
  return rows.map((row) => row.map((cell) => ({ ...cell, column_index: index.get(cell._anchor) ?? null })));
}

function detectTables(lines) {
  const tables = [];
  let current = [];

  const flush = () => {
    if (current.length < 2) {
      current = [];
      return;
    }
    const rows = current.map((line) => splitLineIntoCells(line.items)).filter((r) => r.length >= 2);
    if (rows.length < 2) {
      current = [];
      return;
    }
    const indexedRows = assignColumnIndexes(rows);
    let headerIndex = -1;
    const headerRoles = [];
    for (let i = 0; i < Math.min(indexedRows.length, 3); i++) {
      const roles = indexedRows[i].map((c) => headerRole(c.text));
      if (roles.filter(Boolean).length >= 2) {
        headerIndex = i;
        for (const c of indexedRows[i]) headerRoles[c.column_index] = headerRole(c.text);
        break;
      }
    }
    const structuredRows = indexedRows.map((row, rowIndex) => row.map((cell) => ({
      ...cell,
      row_index: rowIndex,
      header: headerRoles[cell.column_index] || '',
      is_header: rowIndex === headerIndex
    })));
    tables.push({ rows: structuredRows, header_row_index: headerIndex, header_roles: headerRoles });
    current = [];
  };

  for (const line of lines) {
    const cells = splitLineIntoCells(line.items);
    if (cells.length >= 2) current.push({ ...line, items: line.items });
    else flush();
  }
  flush();

  return tables.map((table, tableIndex) => ({
    id: `table-${tableIndex + 1}`,
    header_row_index: table.header_row_index,
    header_roles: table.header_roles,
    rows: table.rows
  }));
}

function buildPage(pageNumber, content) {
  const rawItems = (content.items || []).map((item, index) => ({
    str: cleanText(item.str),
    transform: item.transform,
    width: Number(item.width || 0),
    height: Number(item.height || 0),
    fontName: item.fontName || '',
    item_index: index,
    bbox: bboxFromItem(item)
  })).filter((i) => i.str);

  const lines = groupLines(rawItems);
  const tables = detectTables(lines);
  const blocks = lines.map((line, readingOrder) => ({
    page: pageNumber,
    block_type: line.block_type,
    text: line.text,
    bbox: line.bbox,
    reading_order: readingOrder
  }));

  const text = lines.map((l) => l.text).join('\n');
  const specTable = [];
  for (const table of tables) {
    const headerIndex = Number.isInteger(table.header_row_index) ? table.header_row_index : -1;
    for (const row of table.rows) {
      if (row.length < 2 || row[0].is_header) continue;
      const attributeCell = row.find((c) => c.header === 'PARAMETER') || row[0];
      const valueCells = row.filter((c) => c !== attributeCell);
      const unitPattern = /^(?:%|°?c|°?f|v|mv|kv|a|ma|ua|μa|µa|hz|khz|mhz|ghz|ohm|ω|kohm|mohm|f|uf|μf|µf|nf|pf|h|uh|μh|µh|mh|w|mw|kw|mm|cm|m|um|μm|µm|nm|in|mil|kg|g|mg|lb|n|kn|l|ml|bar|kpa|mpa|psi|rpm|ms|us|μs|µs|ns|s|db|dbm|deg|degree|x)$/i;
      const scalarPattern = /^[<>≤≥+\-±]?\s*\d+(?:[.,]\d+)?$/;
      const unitCell = valueCells.find((c) => c.header === 'UNIT' || unitPattern.test(c.text));
      const scalarValueCells = valueCells.filter((c) => ['MIN', 'TYP', 'MAX'].includes(c.header));
      const unheadedNumericCells = valueCells.filter((c) => !c.header && scalarPattern.test(c.text));
      const hasStructuredNumericColumns = scalarValueCells.length > 0;
      const valueCell = hasStructuredNumericColumns
        ? (scalarValueCells.length === 1 ? scalarValueCells[0] : null)
        : (unheadedNumericCells.length === 1 ? unheadedNumericCells[0] : null);
      const structuredValues = scalarValueCells.map((c) => ({
        role: c.header,
        text: c.text,
        bbox: c.bbox,
        column_index: c.column_index
      }));
      if (unitCell) structuredValues.push({ role: 'UNIT', text: unitCell.text, bbox: unitCell.bbox, column_index: unitCell.column_index });
      for (const c of unheadedNumericCells) structuredValues.push({ role: 'VALUE', text: c.text, bbox: c.bbox, column_index: c.column_index });

      // Never concatenate multiple numeric columns. A scalar is exact only when
      // one numeric value is structurally associated with one unit (or has a
      // semantic MIN/TYP/MAX header). Otherwise the row remains unverified.
      const exactScalar = valueCell ? valueCell.text : '';
      const exactUnit = unitCell?.text || '';
      const exactValue = exactScalar && exactUnit ? `${exactScalar} ${exactUnit}` : exactScalar;
      const ambiguous = (hasStructuredNumericColumns && scalarValueCells.length !== 1)
        || (!hasStructuredNumericColumns && unheadedNumericCells.length !== 1);

      specTable.push({
        attribute: cleanText(attributeCell.text),
        value: exactValue,
        page: pageNumber,
        bbox: mergeBbox(row),
        attribute_bbox: attributeCell.bbox,
        value_bbox: exactValue ? (valueCell?.bbox || unitCell?.bbox || null) : null,
        table_id: table.id,
        row_index: row[0].row_index,
        column_count: row.length,
        header_row_index: headerIndex,
        header_roles: table.header_roles || [],
        structured_values: structuredValues,
        ambiguous_value: ambiguous,
        relation_context: row.map((c) => ({
          text: c.text,
          bbox: c.bbox,
          column_index: c.column_index,
          header: c.header || ''
        }))
      });
    }
  }

  return { page: pageNumber, text, blocks, tables, specTable };
}

export async function extractPDF(data) {
  const pdf = await getDocumentProxy(data);
  const pageResults = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent({ includeMarkedContent: true });
    pageResults.push(buildPage(pageNumber, content));
  }

  const pages = pageResults.map((p) => p.text);
  const blocks = pageResults.flatMap((p) => p.blocks);
  const tables = pageResults.flatMap((p) => p.tables.map((t) => ({ ...t, page: p.page })));
  const specTable = pageResults.flatMap((p) => p.specTable);
  const text = pages.join('\f');
  const firstHeading = blocks.find((b) => b.page === 1 && b.block_type === 'heading_or_label');

  return {
    extractable: true,
    text,
    pages,
    totalPages: pdf.numPages,
    blocks,
    tables,
    specTable,
    title: firstHeading?.text || '',
    extraction_mode: 'pdfjs_structured_v2'
  };
}

// Extrae especificaciones candidatas conservando la evidencia espacial.
// La validación semántica sigue ocurriendo fuera de esta capa.
export function extractStructuredSpecs(extracted) {
  const out = [];
  for (const row of extracted?.specTable || []) {
    if (!row.attribute || row.ambiguous_value || !row.value || !/\d/.test(row.value)) continue;
    out.push({
      attribute: row.attribute,
      value: row.value,
      page: row.page,
      bbox: row.bbox,
      attribute_bbox: row.attribute_bbox,
      value_bbox: row.value_bbox,
      table_id: row.table_id,
      row_index: row.row_index,
      structured_values: row.structured_values || [],
      relation_context: row.relation_context || [],
      context: `table ${row.table_id}, row ${row.row_index + 1}`
    });
  }

  // También conserva relaciones "Attribute: value" cuando están en una línea real.
  for (const block of extracted?.blocks || []) {
    const m = block.text.match(/^(.{2,80}?)\s*[:：]\s*([^:]{1,80})$/);
    if (!m || !/\d/.test(m[2])) continue;
    out.push({
      attribute: cleanText(m[1]),
      value: cleanText(m[2]),
      page: block.page,
      bbox: block.bbox,
      attribute_bbox: block.bbox,
      value_bbox: block.bbox,
      table_id: '',
      row_index: null,
      context: block.text
    });
  }

  const seen = new Set();
  return out.filter((r) => {
    const key = `${r.page}|${r.attribute}|${r.value}|${r.bbox?.x0}|${r.bbox?.y0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
