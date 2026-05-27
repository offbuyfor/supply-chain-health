# Supply Chain Health Assessment

## What this is
A supply chain health assessment tool that reads inventory data 
and assesses chain health by analyzing the shape of a depth spread 
chart — the same way a trader reads an order book.

## Core concept
Inventory data is transformed into bid/ask curves (demand vs supply 
at price levels). The shape of those curves — spread width, imbalance, 
walls, cliffs, slope — is extracted as metrics and sent to an AI 
for a health assessment.

## The two input files
1. inventory.csv — SKU, date, price_level, demand_qty, supply_qty
2. purchase_orders.csv — SKU, vendor, order_date, expected_delivery, 
   actual_delivery, qty_ordered, qty_received

## Tech stack
- React + Vite (frontend)
- Recharts (depth chart)
- Papaparse (CSV parsing)
- Anthropic SDK / SpiLLI SDK (AI — abstracted behind aiProvider.js)
- Tailwind (styling)

## AI provider abstraction
All AI calls go through src/ai/aiProvider.js only.
The function signature is: assessChain(metrics) → standardResponse
Provider is set via AI_PROVIDER in .env
Never call any AI SDK directly outside of src/ai/

## Key files
- src/parser/csvParser.js     — ingestion + masking
- src/engine/shapeExtractor.js — the 6 shape metrics
- src/ai/aiProvider.js        — provider abstraction
- src/components/DepthChart   — Recharts depth chart
- src/components/Dashboard    — health score + signals

## Data masking rule
SKU IDs and vendor IDs are masked on ingestion in csvParser.js.
Masked data only flows downstream. Raw IDs never leave the parser.

## Current build phase
Block 1 — synthetic data generator