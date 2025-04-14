import React, { useState, useEffect } from 'react';

const materials = [
  { name: 'Type 1 Aggregate', density: 2.1 },
  { name: 'Grid Sand', density: 1.6 },
  { name: 'Soil', density: 1.5 },
  { name: 'Gravel', density: 1.6 },
  { name: 'Crushed Stone', density: 2.4 },
];

interface SandCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const SandCalculator: React.FC<SandCalculatorProps> = ({ onResultsChange }) => {
  const [selectedMaterial, setSelectedMaterial] = useState(materials[0]);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [result, setResult] = useState<number | null>(null);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState([]);
  const [volume, setVolume] = useState('');

  const calculate = () => {
    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);

    if (isNaN(l) || isNaN(w) || isNaN(h)) {
      return;
    }

    let volume = l * w * (h / 1000); // Convert mm to m
    let mass = volume * selectedMaterial.density;

    setResult(Number(mass.toFixed(2)));
    setVolume(volume.toFixed(2));

    // Add useEffect to notify parent of result changes
    useEffect(() => {
      if (totalHours !== null && materials.length > 0) {
        const formattedResults = {
          name: 'Sand Delivery',
          amount: parseFloat(volume) || 0,
          hours_worked: totalHours,
          materials: materials.map(material => ({
            name: material.name,
            quantity: mass,
            unit: 'kg'
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
      <div>
        <label className="block text-sm font-medium text-gray-700">Select Material</label>
        <select
          value={selectedMaterial.name}
          onChange={(e) =>
            setSelectedMaterial(materials.find((m) => m.name === e.target.value) || materials[0])
          }
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        >
          {materials.map((material) => (
            <option key={material.name} value={material.name}>
              {material.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Length (m)</label>
        <input
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Width (m)</label>
        <input
          type="number"
          value={width}
          onChange={(e) => setWidth(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Height (mm)</label>
        <input
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
        />
      </div>
      <button
        onClick={calculate}
        className="w-full bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 transition-colors"
      >
        Calculate
      </button>
      {result !== null && (
        <div className="mt-4 p-4 bg-gray-100 rounded-md">
          <p className="text-gray-900">
            Required Mass: <span className="font-bold">{result} kg</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default SandCalculator;
