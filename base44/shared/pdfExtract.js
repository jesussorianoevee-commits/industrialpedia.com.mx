// Document Intelligence Layer V2 — extracción estructural determinística de PDF.
// Sin IA/OCR externo. Usa PDF.js/unpdf para conservar texto + geometría + orden de lectura.
// Contrato: pages, blocks, tables, specTable, text y totalPages.
import { getDocumentProxy } from 'npm:unpdf';

const Y_TOLERANCE = 3;
const MIN_TABLE_GAP = 18;

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

function detectTables(lines) {
  const tables = [];
  let current = [];

  const flush = () => {
    if (current.length >= 2) {
      const rows = current.map((line) => line.items.map((item) => ({
        text: cleanText(item.str), bbox: item.bbox
      })).filter((c) => c.text));
      const maxCells = Math.max(...rows.map((r) => r.length));
      if (maxCells >= 2) tables.push({ rows });
    }
    current = [];
  };

  for (const line of lines) {
    const cells = [];
    for (let i = 0; i < line.items.length; i++) {
      const item = line.items[i];
      const next = line.items[i + 1];
      const gap = next ? next.bbox.x0 - item.bbox.x1 : 0;
      if (i === 0 || gap >= MIN_TABLE_GAP) cells.push(item);
    }
    // A line with multiple separated text runs is a table-row candidate.
    if (cells.length >= 2) current.push({ ...line, items: cells });
    else flush();
  }
  flush();

  return tables.map((table, tableIndex) => ({
    id: `table-${tableIndex + 1}`,
    rows: table.rows.map((row, rowIndex) => row.map((cell, columnIndex) => ({ ...cell, row_index: rowIndex, column_index: columnIndex })))
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
    for (const row of table.rows) {
      if (row.length >= 2) {
        specTable.push({
          attribute: row[0].text,
          value: row.slice(1).map((c) => c.text).join(' '),
          page: pageNumber,
          bbox: mergeBbox(row),
          attribute_bbox: row[0].bbox,
          value_bbox: mergeBbox(row.slice(1)),
          table_id: table.id,
          row_index: row[0].row_index,
          column_count: row.length
        });
      }
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
    if (!row.attribute || !row.value || !/\d/.test(row.value)) continue;
    out.push({
      attribute: row.attribute,
      value: row.value,
      page: row.page,
      bbox: row.bbox,
      attribute_bbox: row.attribute_bbox,
      value_bbox: row.value_bbox,
      table_id: row.table_id,
      row_index: row.row_index,
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
