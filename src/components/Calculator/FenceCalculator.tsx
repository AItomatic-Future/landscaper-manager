import React, { useState, useEffect, ChangeEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface FenceCalculatorProps {
  fenceType: 'vertical' | 'horizontal';
  onResultsChange?: (results: any) => void;
}

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface TaskBreakdown {
  task: string;
  hours: number;
  amount: number;
  unit: string;
}

interface MaterialPrice {
  name: string;
  price: number;
}

const FenceCalculator: React.FC<FenceCalculatorProps> = ({ fenceType, onResultsChange }) => {
  console.log(`FenceCalculator.tsx: Received fenceType=${fenceType}`);

  const [length, setLength] = useState('');
  const [height, setHeight] = useState('');
  const [slatWidth, setSlatWidth] = useState('10');
  const [slatLength, setSlatLength] = useState('180');
  const [postmixPerPost, setPostmixPerPost] = useState<string>('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<TaskBreakdown[]>([]);

  // Fetch task template for fence installation
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['fence_laying_task', fenceType],
    queryFn: async () => {
      const taskName = fenceType === 'vertical' ? 'standard fence vertical' : 'standard fence horizontal';
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('name', taskName)
        .single();
      
      if (error) throw error;
      return data;
    }
  });

  const fetchMaterialPrices = async (materials: Material[]): Promise<Material[]> => {
    try {
      const materialNames = materials.map(m => m.name);
      
      const { data, error } = await supabase
        .from('materials')
        .select('name, price')
        .in('name', materialNames);
      
      if (error) throw error;
      
      const priceMap = data.reduce((acc: Record<string, number>, item: MaterialPrice) => {
        acc[item.name] = item.price;
        return acc;
      }, {});
      
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

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>, setter: (value: string) => void) => {
    setter(e.target.value);
  };

  const calculate = async () => {
    console.log(`FenceCalculator.tsx: calculate called with fenceType=${fenceType}`);

    if (!length || !height) {
      setCalculationError('Please fill in all required fields');
      return;
    }

    const l = parseFloat(length) * 100; // Convert meters to cm
    const h = parseFloat(height) * 100; // Convert meters to cm
    const slatW = parseFloat(slatWidth);
    const slatL = parseFloat(slatLength);

    if (isNaN(l) || isNaN(h) || isNaN(slatW) || (fenceType === 'horizontal' && isNaN(slatL))) {
      setCalculationError('Please enter valid numbers');
      return;
    }

    let posts = Math.ceil(l / 180) + 1; // One post every 1.8m (180cm) + 1 extra post
    posts = Math.max(posts, 2); // Minimum 2 posts

    let slatsNeeded = 0;
    let fenceRails = 0;
    let slatsPerLength = 0;

    if (fenceType === 'vertical') {
      console.log('FenceCalculator.tsx: Performing vertical fence calculation');
      fenceRails = Math.ceil((l * 3) / 360); // 3 rows of rails, 360cm each
      slatsNeeded = Math.ceil(l / (slatW + 2)) * Math.ceil(1 / slatL); // Total slats needed
    } else {
      console.log('FenceCalculator.tsx: Performing horizontal fence calculation');
      let slatsPerRow = Math.ceil(h / (slatW + 2)); // Horizontal slats needed per row
      slatsPerLength = Math.ceil(l / slatL); // How many slats fit across the length
      slatsNeeded = slatsPerRow * slatsPerLength; // Total slats needed
    }

    const postmix = parseFloat(postmixPerPost) || 0;
    const totalPostmix = posts * postmix;

    // Calculate labor hours
    let mainTaskHours = 0;
    if (layingTask?.unit && layingTask?.estimated_hours !== undefined) {
      const lengthInMeters = parseFloat(length);
      mainTaskHours = lengthInMeters * layingTask.estimated_hours;
    }

    // Create task breakdown
    const breakdown: TaskBreakdown[] = [
      { 
        task: layingTask?.name || `${fenceType === 'vertical' ? 'Vertical' : 'Horizontal'} Fence Installation`,
        hours: mainTaskHours,
        amount: parseFloat(length),
        unit: 'meters'
      }
    ];

    // Calculate total hours
    const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

    // Prepare materials list
    const materialsList: Material[] = [
      { name: 'Fence Posts', amount: posts, unit: 'posts', price_per_unit: null, total_price: null },
      { name: 'Fence Slats', amount: slatsNeeded, unit: 'slats', price_per_unit: null, total_price: null },
      { name: 'Postmix', amount: totalPostmix, unit: 'bags', price_per_unit: null, total_price: null }
    ];

    if (fenceType === 'vertical') {
      materialsList.push({ name: 'Fence Rails', amount: fenceRails, unit: 'rails', price_per_unit: null, total_price: null });
    }

    // Fetch prices and update state
    const materialsWithPrices = await fetchMaterialPrices(materialsList);
    
    setMaterials(materialsWithPrices);
    setTotalHours(totalHours);
    setTaskBreakdown(breakdown);
    setCalculationError(null);
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: `${fenceType === 'vertical' ? 'Vertical' : 'Horizontal'} Fence Installation`,
        amount: parseFloat(length) || 0,
        unit: 'meters',
        hours_worked: totalHours,
        materials: materials.map(material => ({
          name: material.name,
          quantity: material.amount,
          unit: material.unit
        })),
        taskBreakdown: taskBreakdown.map(task => ({
          task: task.task,
          hours: task.hours,
          amount: task.amount,
          unit: task.unit
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
  }, [totalHours, materials, taskBreakdown, length, fenceType, onResultsChange]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{fenceType === 'vertical' ? 'Vertical' : 'Horizontal'} Fence Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for {fenceType} fence installation projects.
      </p>

      <div>
        <label className="block text-sm font-medium text-gray-700">Fence Length (m)</label>
        <input
          type="number"
          value={length}
          onChange={(e) => handleInputChange(e, setLength)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter length in meters"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Fence Height (m)</label>
        <input
          type="number"
          value={height}
          onChange={(e) => handleInputChange(e, setHeight)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter height in meters"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Slat Width (cm)</label>
        <select
          value={slatWidth}
          onChange={(e) => handleInputChange(e, setSlatWidth)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="10">10 cm</option>
          <option value="12">12 cm</option>
          <option value="15">15 cm</option>
        </select>
      </div>

      {fenceType === 'horizontal' && (
        <div>
          <label className="block text-sm font-medium text-gray-700">Slat Length (cm)</label>
          <select
            value={slatLength}
            onChange={(e) => handleInputChange(e, setSlatLength)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
            <option value="180">180 cm</option>
            <option value="360">360 cm</option>
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Postmix Per Post (bags)</label>
        <input
          type="number"
          value={postmixPerPost}
          onChange={(e) => handleInputChange(e, setPostmixPerPost)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          placeholder="Enter postmix per post"
          min="0"
          step="0.1"
        />
      </div>

      <button
        onClick={calculate}
        disabled={isLoading}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-300"
      >
        {isLoading ? 'Loading...' : 'Calculate'}
      </button>

      {calculationError && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded-md">
          {calculationError}
        </div>
      )}

      {totalHours !== null && (
        <div className="mt-6 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Labor Breakdown</h3>
            <div className="space-y-2">
              {taskBreakdown.map((task, index) => (
                <div key={index} className="flex justify-between text-gray-700">
                  <span>{task.task}</span>
                  <span className="font-medium">{task.hours.toFixed(2)} hours</span>
                </div>
              ))}
              <div className="pt-2 mt-2 border-t border-gray-200">
                <div className="flex justify-between text-gray-900 font-semibold">
                  <span>Total Labor Hours</span>
                  <span>{totalHours.toFixed(2)} hours</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Materials Required</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Material</th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-gray-500">Amount</th>
                      <th className="px-3 py-2 text-left text-sm font-medium text-gray-500">Unit</th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-gray-500">Price/Unit</th>
                      <th className="px-3 py-2 text-right text-sm font-medium text-gray-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {materials.map((material, index) => (
                      <tr key={index} className="text-gray-700">
                        <td className="px-3 py-2">{material.name}</td>
                        <td className="px-3 py-2 text-right">{material.amount.toFixed(2)}</td>
                        <td className="px-3 py-2">{material.unit}</td>
                        <td className="px-3 py-2 text-right">
                          {material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {material.total_price ? `£${material.total_price.toFixed(2)}` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pt-4 mt-4 border-t border-gray-200">
                <div className="flex justify-between text-gray-900 font-semibold">
                  <span>Total Material Cost</span>
                  <span>
                    £{materials.reduce((sum: number, material: Material) => sum + (material.total_price || 0), 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FenceCalculator;
