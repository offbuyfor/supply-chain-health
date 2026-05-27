#!/usr/bin/env node

const fs   = require('fs');
const path = require('path');

const OUT        = __dirname; // src/data/
const SKUS       = Array.from({ length: 10 }, (_, i) => `SKU-${String(i + 1).padStart(3, '0')}`);
const PRICE_LVLS = [90, 95, 100, 105, 110, 115, 120, 125];
const WEEKS      = 4;
const BASE_DATE  = '2024-01-07';

// ── Utilities ────────────────────────────────────────────────────────────────

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekDate(w) {
  return addDays(BASE_DATE, w * 7);
}

function jitter(base, frac = 0.08) {
  return Math.max(1, Math.round(base * (1 + (Math.random() * 2 - 1) * frac)));
}

function toCSV(headers, rows) {
  return [
    headers.join(','),
    ...rows.map(row => headers.map(h => row[h] ?? '').join(',')),
  ].join('\n') + '\n';
}

function write(filename, headers, rows) {
  fs.writeFileSync(path.join(OUT, filename), toCSV(headers, rows));
  console.log(`  ${filename}  (${rows.length} rows)`);
}

const INV_COLS = ['SKU', 'date', 'price_level', 'demand_qty', 'supply_qty'];
const PO_COLS  = [
  'SKU', 'vendor', 'order_date', 'expected_delivery',
  'actual_delivery', 'qty_ordered', 'qty_received',
  'fill_rate', 'disruption_flag',
];

// ── Healthy ──────────────────────────────────────────────────────────────────
// Symmetric bid/ask curves, tight spread, balanced imbalance (~0)
//
// demand falls as price rises  → bid side
// supply rises as price rises  → ask side
// mirror image ⇒ total demand ≈ total supply ≈ 1960 per SKU/week

const HEALTHY_DEMAND = [500, 420, 340, 260, 190, 130,  80,  40];
const HEALTHY_SUPPLY = [ 40,  80, 130, 190, 260, 340, 420, 500];

function genHealthyInventory() {
  const rows = [];
  for (let w = 0; w < WEEKS; w++) {
    const date = weekDate(w);
    for (const SKU of SKUS) {
      PRICE_LVLS.forEach((price_level, i) => {
        rows.push({
          SKU, date, price_level,
          demand_qty: jitter(HEALTHY_DEMAND[i]),
          supply_qty: jitter(HEALTHY_SUPPLY[i]),
        });
      });
    }
  }
  return rows;
}

function genHealthyPO() {
  const vendors = ['VND-A', 'VND-B', 'VND-C'];
  const rows = [];
  for (let w = 0; w < WEEKS; w++) {
    const order_date = weekDate(w);
    for (const SKU of SKUS) {
      const vendor            = vendors[Math.floor(Math.random() * vendors.length)];
      const qty_ordered       = jitter(200, 0.15);
      const qty_received      = Math.round(qty_ordered * (0.92 + Math.random() * 0.08));
      const fill_rate         = (qty_received / qty_ordered).toFixed(3);
      const expected_delivery = addDays(order_date, 7);
      const actual_delivery   = addDays(order_date, 5 + Math.floor(Math.random() * 4));
      rows.push({
        SKU, vendor, order_date, expected_delivery, actual_delivery,
        qty_ordered, qty_received, fill_rate, disruption_flag: false,
      });
    }
  }
  return rows;
}

// ── Disrupted ────────────────────────────────────────────────────────────────
// Weeks 1-2: normal shape.
// Weeks 3-4: ask-side cliff — supply collapses above the mid-price (index 4+).
//   demand total ≈ 1960, supply total ≈ 269  →  imbalance ≈ +0.76 (shortage)
//
// VND-B is the disrupted vendor: fill_rate 0.20-0.48, 3-5 weeks late, flag=true.

const DISRUPTED_SUPPLY_LATE = [30, 50, 70, 90, 15, 8, 4, 2]; // cliff from index 4

const DISRUPTED_SKUS = new Set(SKUS.slice(0, 4)); // SKU-001..SKU-004 hit by VND-B

function genDisruptedInventory() {
  const rows = [];
  for (let w = 0; w < WEEKS; w++) {
    const date = weekDate(w);
    for (const SKU of SKUS) {
      PRICE_LVLS.forEach((price_level, i) => {
        const supplyBase = w < 2 ? HEALTHY_SUPPLY[i] : DISRUPTED_SUPPLY_LATE[i];
        rows.push({
          SKU, date, price_level,
          demand_qty: jitter(HEALTHY_DEMAND[i]),
          supply_qty: jitter(supplyBase),
        });
      });
    }
  }
  return rows;
}

function genDisruptedPO() {
  const goodVendors = ['VND-A', 'VND-C'];
  const rows = [];
  for (let w = 0; w < WEEKS; w++) {
    const order_date = weekDate(w);
    for (const SKU of SKUS) {
      const isDisrupted = w >= 1 && DISRUPTED_SKUS.has(SKU);
      const vendor      = isDisrupted
        ? 'VND-B'
        : goodVendors[Math.floor(Math.random() * goodVendors.length)];

      const qty_ordered       = jitter(200, 0.15);
      const expected_delivery = addDays(order_date, 7);

      let qty_received, actual_delivery, disruption_flag;
      if (isDisrupted) {
        // fill_rate guaranteed < 0.5; delivery 3-5 weeks late
        qty_received      = Math.round(qty_ordered * (0.20 + Math.random() * 0.28));
        actual_delivery   = addDays(order_date, 21 + Math.floor(Math.random() * 14));
        disruption_flag   = true;
      } else {
        qty_received      = Math.round(qty_ordered * (0.92 + Math.random() * 0.08));
        actual_delivery   = addDays(order_date, 5 + Math.floor(Math.random() * 4));
        disruption_flag   = false;
      }

      const fill_rate = (qty_received / qty_ordered).toFixed(3);
      rows.push({
        SKU, vendor, order_date, expected_delivery, actual_delivery,
        qty_ordered, qty_received, fill_rate, disruption_flag,
      });
    }
  }
  return rows;
}

// ── Overstock ────────────────────────────────────────────────────────────────
// Massive ask wall at price 110 (index 4), thin bid side.
//   demand total ≈  257, supply total ≈ 5340 per SKU/week
//   imbalance ≈ (257-5340)/(257+5340) ≈ -0.91  (strongly negative)
//
// Large PO quantities, high fill rate — the goods actually arrived.

const OVERSTOCK_DEMAND = [ 80,  60,  45,  30,   20,  12,   7,   3];
const OVERSTOCK_SUPPLY = [ 15,  25,  35,  45, 5000,  60,  70,  90]; // wall at index 4 (price 110)

function genOverstockInventory() {
  const rows = [];
  for (let w = 0; w < WEEKS; w++) {
    const date = weekDate(w);
    for (const SKU of SKUS) {
      PRICE_LVLS.forEach((price_level, i) => {
        rows.push({
          SKU, date, price_level,
          demand_qty: jitter(OVERSTOCK_DEMAND[i], 0.05),
          supply_qty: jitter(OVERSTOCK_SUPPLY[i], i === 4 ? 0.03 : 0.10),
        });
      });
    }
  }
  return rows;
}

function genOverstockPO() {
  const vendors = ['VND-A', 'VND-B', 'VND-C'];
  const rows = [];
  for (let w = 0; w < WEEKS; w++) {
    const order_date = weekDate(w);
    for (const SKU of SKUS) {
      const vendor            = vendors[Math.floor(Math.random() * vendors.length)];
      const qty_ordered       = jitter(1200, 0.15);
      const qty_received      = Math.round(qty_ordered * (0.97 + Math.random() * 0.03));
      const fill_rate         = (qty_received / qty_ordered).toFixed(3);
      const expected_delivery = addDays(order_date, 7);
      const actual_delivery   = addDays(order_date, 4 + Math.floor(Math.random() * 3));
      rows.push({
        SKU, vendor, order_date, expected_delivery, actual_delivery,
        qty_ordered, qty_received, fill_rate, disruption_flag: false,
      });
    }
  }
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log('Generating synthetic supply chain data...\n');

write('healthy-inventory.csv',   INV_COLS, genHealthyInventory());
write('healthy-po.csv',          PO_COLS,  genHealthyPO());
write('disrupted-inventory.csv', INV_COLS, genDisruptedInventory());
write('disrupted-po.csv',        PO_COLS,  genDisruptedPO());
write('overstock-inventory.csv', INV_COLS, genOverstockInventory());
write('overstock-po.csv',        PO_COLS,  genOverstockPO());

console.log('\nDone.');
