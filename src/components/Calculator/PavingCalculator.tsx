import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface PavingCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const PavingCalculator: React.FC<PavingCalculatorProps> = ({ onResultsChange }) => {
  const [area, setArea] = useState<string>('');
  const [sandThicknessCm, setSandThicknessCm] = useState<string>('');
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>('');
  const [monoBlocksHeightCm, setMonoBlocksHeightCm] = useState<string>('');
  const [cutBlocks, setCutBlocks] = useState<string>('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{task: string, hours: number, amount: number, unit: string}[]>([]);

  // Fetch task templates for monoblock laying
  const { data: layingTask, isLoading } = useQuery({
    queryKey: ['monoblock_laying_task'],
    queryFn: async () => {
      console.log('Fetching monoblock laying task...');
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .eq('name', 'laying monoblocks with screed')
        .single();
      
      if (error) {
        console.error('Error fetching laying task:', error);
        throw error;
      }
      
      console.log('Fetched laying task:', data);
      if (!data) {
        throw new Error('No task found for laying monoblocks with screed');
      }
      
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
      
      const priceMap = data.reduce((acc, item) => {
        acc[item.name] = item.price;
        return acc;
      }, {} as Record<string, number>);
      
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
    if (!area || !sandThicknessCm || !tape1ThicknessCm || !monoBlocksHeightCm) {
      setCalculationError('Please fill in all required fields');
      return;
    }

    setCalculationError(null);

    try {
      const areaNum = parseFloat(area);
      const sandThicknessM = parseFloat(sandThicknessCm) / 100;
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100;
      const monoBlocksHeightM = parseFloat(monoBlocksHeightCm) / 100;
      const cutBlocksNum = cutBlocks ? parseInt(cutBlocks) : 0;

      // Calculate base hours needed for installation
      let mainTaskHours = 0;
      console.log('Laying task data:', layingTask);
      
      if (layingTask?.unit && layingTask?.estimated_hours !== undefined) {
        console.log(`Task: ${layingTask.name}, Unit: ${layingTask.unit}, Estimated hours: ${layingTask.estimated_hours}`);
        
        // Always calculate hours based on area
        mainTaskHours = areaNum * layingTask.estimated_hours;
        console.log(`Calculated main task hours: ${areaNum} square meters × ${layingTask.estimated_hours} hours/square meter = ${mainTaskHours} hours`);
      } else {
        console.warn('Laying task has no unit or estimated_hours:', layingTask);
      }

      // Add time for cuts (2 minutes per cut)
      const cuttingHours = (cutBlocksNum * 2) / 60; // Convert minutes to hours

      // Calculate materials needed
      const totalDepthM = sandThicknessM + tape1ThicknessM + monoBlocksHeightM;

      // Calculate soil to be excavated (area × total depth)
      const soilVolume = areaNum * totalDepthM;
      const soilTonnes = soilVolume * 1.5; // 1.5 tonnes per cubic meter

      // Calculate sand needed (area × sand thickness)
      const sandVolume = areaNum * sandThicknessM;
      const sandTonnes = sandVolume * 1.6; // 1.6 tonnes per cubic meter

      // Calculate Type 1 needed (area × Type 1 thickness)
      const tape1Volume = areaNum * tape1ThicknessM;
      const tape1Tonnes = tape1Volume * 2.1; // 2.1 tonnes per cubic meter

      // Create task breakdown
      const breakdown = [
        { 
          task: 'laying monoblocks with screed',
          hours: mainTaskHours,
          amount: areaNum,
          unit: 'square meters'
        }
      ];

      if (cutBlocksNum > 0) {
        breakdown.push({ 
          task: 'cutting blocks',
          hours: cuttingHours,
          amount: cutBlocksNum,
          unit: 'blocks'
        });
      }

      // Calculate total hours
      const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);

      // Prepare materials list
      const materialsList: Material[] = [
        { name: 'Soil excavation', amount: Number(soilTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: 'Sand', amount: Number(sandTonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: 'tape1', amount: Number(tape1Tonnes.toFixed(2)), unit: 'tonnes', price_per_unit: null, total_price: null }
      ];

      // Fetch prices and update state
      const materialsWithPrices = await fetchMaterialPrices(materialsList);
      
      setMaterials(materialsWithPrices);
      setTotalHours(totalHours);
      setTaskBreakdown(breakdown);
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError('An error occurred during calculation');
    }
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: 'Paving Installation',
        amount: parseFloat(area) || 0,
        unit: 'square meters',
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
  }, [totalHours, materials, taskBreakdown, area, onResultsChange]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Area (square meters)</label>
        <input
          type="number"
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder="Enter area in m²"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Sand Thickness (cm)</label>
        <input
          type="number"
          value={sandThicknessCm}
          onChange={(e) => setSandThicknessCm(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder="Enter sand thickness in cm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Type 1 Thickness (cm)</label>
        <input
          type="number"
          value={tape1ThicknessCm}
          onChange={(e) => setTape1ThicknessCm(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder="Enter Type 1 thickness in cm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Monoblock Height (cm)</label>
        <input
          type="number"
          value={monoBlocksHeightCm}
          onChange={(e) => setMonoBlocksHeightCm(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder="Enter monoblock height in cm"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Number of Blocks to Cut</label>
        <input
          type="number"
          value={cutBlocks}
          onChange={(e) => setCutBlocks(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
          placeholder="Enter number of blocks to cut (optional)"
        />
      </div>

      <button
        onClick={calculate}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
      >
        Calculate
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
                    £{materials.reduce((sum, material) => sum + (material.total_price || 0), 0).toFixed(2)}
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

export default PavingCalculator;
