import React, { useState, useEffect } from 'react';

interface CalculatorProps {
  type: 'slab' | 'general';
  onResultsChange?: (results: any) => void;
}

const MortarCalculator: React.FC<CalculatorProps> = ({ type, onResultsChange }) => {
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [thickness, setThickness] = useState('');
  const [area, setArea] = useState('');
  const [result, setResult] = useState<{ volume: number; cementBags: number; sand: number } | null>(null);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [materials, setMaterials] = useState<{ name: string; amount: number; unit: string }[]>([]);
  const [taskBreakdown, setTaskBreakdown] = useState<{ task: string; hours: number }[]>([]);

  const calculate = () => {
    let volume = 0;
    let cement = 0;
    let sand = 0;

    if (type === 'slab') {
      // Slab Calculation: Use area input & fixed thickness (3cm = 0.03m)
      const a = parseFloat(area);
      if (isNaN(a) || a <= 0) return;

      const thickness = 0.03; // 3cm = 0.03m
      volume = a * thickness;

      cement = volume * 350; // 350kg cement per m³
      sand = volume * 1200; // 1200kg sand per m³
    } else {
      // General Calculation: Use length, width, and thickness inputs
      const l = parseFloat(length);
      const w = parseFloat(width);
      const t = parseFloat(thickness);

      if (isNaN(l) || isNaN(w) || isNaN(t) || l <= 0 || w <= 0 || t <= 0) return;

      volume = l * w * (t / 100); // Convert thickness from cm to m

      cement = volume * 400; // 400kg cement per m³ (for general)
      sand = volume * 1350; // 1350kg sand per m³ (for general)
    }

    const cementBags = Math.ceil(cement / 25); // Convert cement to 25kg bags

    setResult({
      volume: Number(volume.toFixed(3)),
      cementBags,
      sand: Number(sand.toFixed(1))
    });

    // Add useEffect to notify parent of result changes
    useEffect(() => {
      if (totalHours !== null && materials.length > 0) {
        const formattedResults = {
          name: 'Mortar Mixing',
          amount: parseFloat(volume) || 0,
          hours_worked: totalHours,
          materials: materials.map(material => ({
            name: material.name,
            quantity: material.amount,
            unit: material.unit
          })),
          taskBreakdown: taskBreakdown.map(task => ({
            task: task.task,
            hours: task.hours
          }))
        };

        // Store results in data attribute
        const calculatorElement = document.querySelector('[data-calculator-results]');
        if (calculatorElement) {
          calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
        }

        // Notify parent component
        if (onResultsChange) {
          onResultsChange(formattedResults);
        }
      }
    }, [totalHours, materials, taskBreakdown, volume, onResultsChange]);
  };

  return (
    <div className="space-y-4">
      {type === 'slab' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700">Area (m²)</label>
          <input
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">Length (m)</label>
            <input
              type="number"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Width (m)</label>
            <input
              type="number"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Thickness (cm)</label>
            <input
              type="number"
              value={thickness}
              onChange={(e) => setThickness(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </>
      )}

      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        Calculate
      </button>

      {result && (
        <div className="mt-4 p-4 bg-blue-50 rounded-md space-y-2">
          <p className="text-blue-900">
            Volume: <span className="font-bold">{result.volume} m³</span>
          </p>
          <p className="text-blue-900">
            Cement Required: <span className="font-bold">{result.cementBags} bags (25kg each)</span>
          </p>
          <p className="text-blue-900">
            Sand Required: <span className="font-bold">{result.sand} kg</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default MortarCalculator;
