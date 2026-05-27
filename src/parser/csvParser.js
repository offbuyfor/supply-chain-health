import Papa from 'papaparse';

// ── Per-session masking dictionaries ──────────────────────────────────────────
// Raw SKU and vendor IDs are replaced with opaque tokens the moment a file is
// ingested. Nothing downstream ever sees the originals.

const skuMap    = new Map();
const vendorMap = new Map();
let   skuSeq    = 0;
let   vendorSeq = 0;

function maskSku(raw) {
  if (!skuMap.has(raw)) skuMap.set(raw, `SKU-${String(++skuSeq).padStart(4, '0')}`);
  return skuMap.get(raw);
}

function maskVendor(raw) {
  if (!vendorMap.has(raw)) vendorMap.set(raw, `VND-${String(++vendorSeq).padStart(4, '0')}`);
  return vendorMap.get(raw);
}

// ── Shared Papaparse wrapper ──────────────────────────────────────────────────

function parseCsv(file, requiredCols) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header:         true,
      dynamicTyping:  true,
      skipEmptyLines: true,
      complete({ data, errors, meta }) {
        if (errors.length) {
          reject(new Error(`CSV parse error: ${errors[0].message}`));
          return;
        }
        const missing = requiredCols.filter(col => !meta.fields.includes(col));
        if (missing.length) {
          reject(new Error(`Missing required columns: ${missing.join(', ')}`));
          return;
        }
        resolve(data);
      },
      error(err) {
        reject(new Error(`CSV read error: ${err.message}`));
      },
    });
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

const INV_REQUIRED = ['SKU', 'date', 'price_level', 'demand_qty', 'supply_qty'];
const PO_REQUIRED  = [
  'SKU', 'vendor', 'order_date', 'expected_delivery',
  'actual_delivery', 'qty_ordered', 'qty_received',
];

/**
 * Parse an inventory CSV file (browser File object or CSV string).
 * Validates required columns and masks SKU with session-stable tokens.
 * Returns an array of row objects with numeric price_level/demand_qty/supply_qty.
 */
export async function parseInventoryCSV(file) {
  const rows = await parseCsv(file, INV_REQUIRED);
  return rows.map(row => ({ ...row, SKU: maskSku(row.SKU) }));
}

/**
 * Parse a purchase-orders CSV file.
 * Validates required columns and masks both SKU and vendor.
 * Returns an array of row objects.
 */
export async function parsePOCSV(file) {
  const rows = await parseCsv(file, PO_REQUIRED);
  return rows.map(row => ({
    ...row,
    SKU:    maskSku(row.SKU),
    vendor: maskVendor(row.vendor),
  }));
}

/**
 * Aggregate masked inventory rows into bid/ask depth curves.
 *
 * Groups all rows by price_level and sums demand_qty (bid) and supply_qty (ask)
 * across every SKU and date. Then computes running cumulative totals to produce
 * the stair-step shape a depth chart requires:
 *
 *   bidCurve[i].qty  = total demand willing to buy at prices[i] OR LOWER
 *                      → highest qty at the lowest price (deep left side)
 *
 *   askCurve[i].qty  = total supply willing to sell at prices[i] OR HIGHER
 *                      → highest qty at the highest price (deep right side)
 *
 * Returns { bidCurve, askCurve } — each an array of { price, qty } sorted by
 * price ascending, ready for Recharts AreaChart / ComposedChart.
 */
export function aggregateToCurves(inventoryRows) {
  const byPrice = new Map();

  for (const row of inventoryRows) {
    const price = Number(row.price_level);
    if (!byPrice.has(price)) byPrice.set(price, { demand: 0, supply: 0 });
    const bucket = byPrice.get(price);
    bucket.demand += Number(row.demand_qty);
    bucket.supply += Number(row.supply_qty);
  }

  const prices = [...byPrice.keys()].sort((a, b) => a - b);

  // Bid curve — cumulate downward (high price → low price)
  const bidCurve = new Array(prices.length);
  let bid = 0;
  for (let i = prices.length - 1; i >= 0; i--) {
    bid += byPrice.get(prices[i]).demand;
    bidCurve[i] = { price: prices[i], qty: bid };
  }

  // Ask curve — cumulate upward (low price → high price)
  const askCurve = new Array(prices.length);
  let ask = 0;
  for (let i = 0; i < prices.length; i++) {
    ask += byPrice.get(prices[i]).supply;
    askCurve[i] = { price: prices[i], qty: ask };
  }

  return { bidCurve, askCurve };
}
