import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, Legend, ResponsiveContainer,
} from 'recharts';
import { parseInventoryCSV, aggregateToCurves } from '../parser/csvParser';

// Vite ?raw imports — CSV loaded as a string at build time, no fetch needed
import healthyRaw   from '../data/healthy-inventory.csv?raw';
import disruptedRaw from '../data/disrupted-inventory.csv?raw';
import overstockRaw from '../data/overstock-inventory.csv?raw';

const SCENARIOS = {
  healthy:   { label: 'Healthy',   csv: healthyRaw },
  disrupted: { label: 'Disrupted', csv: disruptedRaw },
  overstock: { label: 'Overstock', csv: overstockRaw },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Merge separate bid/ask curve arrays onto a shared price axis for Recharts. */
function mergeForChart(bidCurve, askCurve) {
  const map = new Map();
  for (const { price, qty } of bidCurve) map.set(price, { price, bid: qty, ask: null });
  for (const { price, qty } of askCurve) {
    const entry = map.get(price) ?? { price, bid: null };
    map.set(price, { ...entry, ask: qty });
  }
  return [...map.values()].sort((a, b) => a.price - b.price);
}

function fmtQty(v) {
  if (v == null) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k`;
  return String(v);
}

// ── Custom tooltip ────────────────────────────────────────────────────────────

function DepthTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const bid = payload.find(p => p.dataKey === 'bid');
  const ask = payload.find(p => p.dataKey === 'ask');

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 font-medium mb-1.5">Price {label}</p>
      {bid?.value != null && (
        <p className="text-green-400">
          Bid (demand)&ensp;
          <span className="text-green-300 font-semibold tabular-nums">
            {bid.value.toLocaleString()}
          </span>
        </p>
      )}
      {ask?.value != null && (
        <p className="text-red-400 mt-0.5">
          Ask (supply)&ensp;
          <span className="text-red-300 font-semibold tabular-nums">
            {ask.value.toLocaleString()}
          </span>
        </p>
      )}
    </div>
  );
}

// ── Custom legend ─────────────────────────────────────────────────────────────

function DepthLegend() {
  return (
    <div className="flex items-center gap-5 justify-end text-xs text-gray-400 mb-2 mr-6">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-green-500 opacity-70" />
        Bid — cumulative demand
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-red-500 opacity-70" />
        Ask — cumulative supply
      </span>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Renders a depth chart from bid/ask curve data.
 *
 * Props mode  — pass { bidCurve, askCurve } to render a specific dataset.
 * Standalone  — omit props to show the scenario dropdown (testing harness).
 */
export default function DepthChart({ bidCurve: bidProp, askCurve: askProp }) {
  const standalone = !bidProp || !askProp;

  const [scenario, setScenario] = useState('healthy');
  const [bidCurve, setBidCurve] = useState([]);
  const [askCurve, setAskCurve] = useState([]);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(standalone);

  useEffect(() => {
    if (!standalone) {
      setBidCurve(bidProp ?? []);
      setAskCurve(askProp ?? []);
      return;
    }

    setLoading(true);
    setError(null);

    parseInventoryCSV(SCENARIOS[scenario].csv)
      .then(rows => {
        const { bidCurve, askCurve } = aggregateToCurves(rows);
        setBidCurve(bidCurve);
        setAskCurve(askCurve);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [scenario, bidProp, askProp, standalone]);

  const chartData = mergeForChart(bidCurve, askCurve);

  return (
    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
      {/* Scenario picker — visible only in standalone / testing mode */}
      {standalone && (
        <div className="flex items-center gap-3 mb-5">
          <span className="text-gray-500 text-xs uppercase tracking-wider">Scenario</span>
          <div className="flex gap-1">
            {Object.entries(SCENARIOS).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => setScenario(key)}
                className={[
                  'px-3 py-1 rounded-md text-sm font-medium transition-colors',
                  scenario === key
                    ? 'bg-gray-700 text-gray-100'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          {loading && (
            <span className="text-gray-600 text-xs ml-2 animate-pulse">Loading…</span>
          )}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm mb-4 bg-red-950 border border-red-800 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <DepthLegend />

      <ResponsiveContainer width="100%" height={360}>
        <ComposedChart
          data={chartData}
          margin={{ top: 4, right: 24, bottom: 28, left: 8 }}
        >
          <defs>
            <linearGradient id="bidGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="askGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1f2937"
            vertical={false}
          />

          <XAxis
            dataKey="price"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickCount={8}
            tickLine={false}
            axisLine={{ stroke: '#374151' }}
            tick={{ fill: '#6b7280', fontSize: 12 }}
            label={{
              value: 'Price Level',
              position: 'insideBottom',
              offset: -16,
              fill: '#4b5563',
              fontSize: 12,
            }}
          />

          <YAxis
            tickFormatter={fmtQty}
            tickLine={false}
            axisLine={false}
            tick={{ fill: '#6b7280', fontSize: 12 }}
            width={48}
            label={{
              value: 'Cumulative Qty',
              angle: -90,
              position: 'insideLeft',
              offset: 12,
              fill: '#4b5563',
              fontSize: 12,
            }}
          />

          <Tooltip
            content={<DepthTooltip />}
            cursor={{ stroke: '#4b5563', strokeWidth: 1, strokeDasharray: '4 2' }}
          />

          {/* Bid — green, cumulative demand, falls left-to-right */}
          <Area
            type="stepAfter"
            dataKey="bid"
            name="Bid"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#bidGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e', strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={true}
          />

          {/* Ask — red, cumulative supply, rises left-to-right */}
          <Area
            type="stepAfter"
            dataKey="ask"
            name="Ask"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#askGradient)"
            dot={false}
            activeDot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={true}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
