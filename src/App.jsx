import React from 'react';
import DepthChart from './components/DepthChart';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <h1 className="text-xl font-semibold text-gray-100 mb-1">
        Supply Chain Health
      </h1>
      <p className="text-gray-500 text-sm mb-8">Inventory depth chart</p>
      <DepthChart />
    </div>
  );
}
