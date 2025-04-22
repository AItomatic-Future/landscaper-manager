import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface CalculatorProps {
  type: 'brick' | 'block4' | 'block7';
  onResultsChange?: (results: any) => void;
}

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

const WallCalculator: React.FC<CalculatorProps> = ({ type, onResultsChange }) => {
  const [length, setLength] = useState('');
  const [height, setHeight] = useState('');
  const [openings, setOpenings] = useState('');
  const [layingMethod, setLayingMethod] = useState<'flat' | 'standing'>('standing');
  const [result, setResult] = useState<{ 
    units: number; 
    cementBags: number;
    sandVolume: number;
    sandTonnes: number;
    rows: number; 
    roundedDownHeight: number; 
    roundedUpHeight: number;
    totalHours: number;
    taskBreakdown: { task: string; hours: number }[];
    materials: Material[];
  } | null>(null);

  // Fetch task templates for wall building
  const { data: taskTemplates = [], isLoading } = useQuery({
    queryKey: ['wall_tasks', type, layingMethod],
    queryFn: async () => {
      let query = supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours');

      // Add specific filters based on wall type
      if (type === 'brick') {
        query = query.ilike('name', '%bricklaying%');
      } else if (type === 'block4') {
        // More specific queries for block types
        if (layingMethod === 'standing') {
          query = query.ilike('name', '%4-inch block%standing%');
        } else {
          query = query.ilike('name', '%4-inch block%flat%');
        }
      } else if (type === 'block7') {
        if (layingMethod === 'standing') {
          query = query.ilike('name', '%7-inch block%standing%');
        } else {
          query = query.ilike('name', '%7-inch block%flat%');
        }
      }

      const { data, error } = await query.order('name');
      
      if (error) throw error;
      console.log('Task templates fetched:', data); // Add logging to debug
      return data;
    }
  });

  const fetchMaterialPrices = async (materials: Material[]) => {
    try {
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .in('name', materialNames);
      
      if (error) throw error;
      
      // Create a map of material names to prices
      const priceMap = data.reduce((acc: Record<string, number>, item) => {
        acc[item.name] = item.price;
        return acc;
      }, {});
      
      // Update materials with prices
      return materials.map(material => ({
        ...material,
        price_per_unit: priceMap[material.name] || null,
        total_price: priceMap[material.name] ? priceMap[material.name] * material.amount : null
      }));
    } catch (err) {
      console.error('Error fetching material prices:', err);
      return materials.map(material => ({
        ...material,
        price_per_unit: null,
        total_price: null
      }));
    }
  };

  const calculate = async () => {
    const l = parseFloat(length);
    const h = parseFloat(height);
    const o = parseFloat(openings) || 0;

    if (isNaN(l) || isNaN(h)) {
      return;
    }

    let area = (l * h) - o;
    let units = 0;
    let mortarVolume = 0;

    // Constants for mortar components (general purpose ratio)
    const cementDensity = 1500; // kg/m³
    const cementRatio = 0.2; // 1 part cement (20% of volume)
    const sandRatio = 0.8; // 4 parts sand (80% of volume)
    const sandDensity = 1600; // kg/m³

    const brickHeight = 0.06; // Brick height in meters
    const mortarThickness = 0.01; // Mortar thickness in meters
    const totalRowHeight = brickHeight + mortarThickness;

    let blockHeight = 0.22; // Default block height
    let blockWidth = 0;
    let blockLength = 0.44; // Block length in meters

    if (type === 'block4') {
      blockWidth = 0.10;
    } else if (type === 'block7') {
      blockWidth = 0.14;
    }
    
    if (type === 'block4' || type === 'block7') {
      if (layingMethod === 'flat') {
        blockHeight = blockWidth;
      }
    }

    let blocksPerSquareMeter = 1 / ((blockHeight + mortarThickness) * (blockLength + mortarThickness));
    
    switch (type) {
      case 'brick':
        units = Math.ceil(area * 60); // 60 bricks per m²
        mortarVolume = area * 0.02; // 0.02m³ mortar per m²
        break;
      case 'block4':
      case 'block7':
        units = Math.ceil(area * blocksPerSquareMeter);
        mortarVolume = area * 0.015; // 0.015m³ mortar per m²
        break;
    }

    // Calculate cement and sand quantities
    const cementVolume = mortarVolume * cementRatio;
    const sandVolume = mortarVolume * sandRatio;
    
    // Convert cement volume to bags (1 bag = 25kg)
    const cementWeight = cementVolume * cementDensity;
    const cementBags = Math.ceil(cementWeight / 25);
    
    // Convert sand volume to tonnes (using sand density)
    const sandTonnes = sandVolume * sandDensity / 1000; // Convert kg to tonnes

    const rows = h / (blockHeight + mortarThickness);
    const roundedDownHeight = Math.floor(rows) * (blockHeight + mortarThickness);
    const roundedUpHeight = Math.ceil(rows) * (blockHeight + mortarThickness);

    // Calculate time estimates
    let totalHours = 0;
    const taskBreakdown: { task: string; hours: number }[] = [];

    if (taskTemplates && taskTemplates.length > 0) {
      let relevantTask;

      if (type === 'brick') {
        relevantTask = taskTemplates[0]; // Bricklaying task
      } else {
        // Improved task selection for blocks with better matching
        const blockType = type === 'block4' ? '4-inch' : '7-inch';
        
        // First try to find an exact match
        relevantTask = taskTemplates.find(task => 
          task.name.toLowerCase().includes(blockType.toLowerCase()) && 
          task.name.toLowerCase().includes(layingMethod.toLowerCase())
        );
        
        // If no exact match, try just the block type
        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates.find(task => 
            task.name.toLowerCase().includes(blockType.toLowerCase())
          );
        }
        
        // Last resort: just use the first task in the list
        if (!relevantTask && taskTemplates.length > 0) {
          relevantTask = taskTemplates[0];
        }
      }

      console.log('Selected task:', relevantTask); // Add logging to debug

      if (relevantTask && relevantTask.estimated_hours) {
        const taskHours = units * relevantTask.estimated_hours;
        totalHours = taskHours;
        taskBreakdown.push({
          task: relevantTask.name,
          hours: taskHours
        });
      } else {
        console.log('No estimated hours found for task'); // Add logging to debug
      }
    } else {
      console.log('No task templates found'); // Add logging to debug
    }

    // Prepare materials list
    const materials: Material[] = [
      { name: 'Cement', amount: cementBags, unit: 'bags', price_per_unit: null, total_price: null },
      { name: 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null }
    ];

    // Add specific materials based on wall type
    if (type === 'brick') {
      materials.push({ name: 'Bricks', amount: units, unit: 'pieces', price_per_unit: null, total_price: null });
    } else {
      const blockType = type === 'block4' ? '4-inch blocks' : '7-inch blocks';
      materials.push({ name: blockType, amount: units, unit: 'pieces', price_per_unit: null, total_price: null });
    }

    // Fetch material prices
    const materialsWithPrices = await fetchMaterialPrices(materials);

    setResult({
      units,
      cementBags,
      sandVolume: Number(sandVolume.toFixed(3)),
      sandTonnes: Number(sandTonnes.toFixed(2)),
      rows: Number(rows.toFixed(2)),
      roundedDownHeight: Number(roundedDownHeight.toFixed(2)),
      roundedUpHeight: Number(roundedUpHeight.toFixed(2)),
      totalHours,
      taskBreakdown,
      materials: materialsWithPrices
    });
  };

  // Add effect to expose results
  useEffect(() => {
    if (result && onResultsChange) {
      // Format results for database storage
      const formattedResults = {
        name: `${type === 'brick' ? 'Brick' : type === 'block4' ? '4-inch Block' : '7-inch Block'} Wall`,
        amount: result.units,  // Changed to just the number
        unit: 'pieces',        // Added unit separately
        hours_worked: result.totalHours,
        materials: result.materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: result.taskBreakdown.map(item => ({
          task: item.task,     // Changed 'name' to 'task' to match expected format
          hours: item.hours,
          amount: result.units,  // Added amount
          unit: 'pieces'         // Added unit
        }))
      };

      // Store results in a data attribute for the modal to access
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-calculator-results', JSON.stringify(formattedResults));
      }

      // Notify parent component of results
      onResultsChange(formattedResults);
    }
  }, [result, type, onResultsChange]);

  return (
    <div className="space-y-4">
      {(type === 'block4' || type === 'block7') && (
        <div className="flex space-x-2">
          <button
            className={`px-4 py-2 rounded-md ${layingMethod === 'standing' ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}
            onClick={() => setLayingMethod('standing')}
          >
            Standing
          </button>
          <button
            className={`px-4 py-2 rounded-md ${layingMethod === 'flat' ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}
            onClick={() => setLayingMethod('flat')}
          >
            Flat
          </button>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700">Wall Length (m)</label>
        <input
          type="number"
          value={length}
          onChange={(e) => setLength(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Wall Height (m)</label>
        <input
          type="number"
          value={height}
          onChange={(e) => setHeight(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Openings Area (m²) (optional)</label>
        <input
          type="number"
          value={openings}
          onChange={(e) => setOpenings(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        />
      </div>
      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        Calculate
      </button>
      {result && (
        <div className="mt-6 space-y-4">
          <div>
            <div className="mt-2 space-y-2">
              <p>
                Total Rows: <span className="font-bold">{result.rows}</span>
              </p>
              <p>
                Rounded Down Height: <span className="font-bold">{result.roundedDownHeight} m</span>
              </p>
              <p>
                Rounded Up Height: <span className="font-bold">{result.roundedUpHeight} m</span>
              </p>
            </div>

            <h3 className="text-lg font-medium mt-4">Total Labor Hours: <span className="text-blue-600">{result.totalHours.toFixed(2)} hours</span></h3>
            
            <div className="mt-2">
              <h4 className="font-medium text-gray-700 mb-2">Task Breakdown:</h4>
              <ul className="space-y-1 pl-5 list-disc">
                {result.taskBreakdown.map((task, index) => (
                  <li key={index} className="text-sm">
                    <span className="font-medium">{task.task}:</span> {task.hours.toFixed(2)} hours
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h3 className="font-medium mb-2">Materials Required:</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Material
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Quantity
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Unit
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Price per Unit
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-white uppercase tracking-wider">
                      Total Price
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {result.materials.map((material, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.amount.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.unit}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {material.total_price ? `£${material.total_price.toFixed(2)}` : 'N/A'}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-700">
                    <td colSpan={4} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white text-right">
                      Total Cost:
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-white">
                      {result.materials.reduce((sum, material) => sum + (material.total_price || 0), 0).toFixed(2) !== '0.00' 
                        ? `£${result.materials.reduce((sum, material) => sum + (material.total_price || 0), 0).toFixed(2)}`
                        : 'N/A'}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WallCalculator;
