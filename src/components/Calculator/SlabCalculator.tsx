import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';

interface SlabType {
  id: number;
  name: string;
  unit: string;
  estimated_hours: number;
  is_porcelain: boolean;
}

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
}

interface SlabCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const SlabCalculator: React.FC<SlabCalculatorProps> = ({ onResultsChange }) => {
  const [area, setArea] = useState<string>('');
  const [tape1ThicknessCm, setTape1ThicknessCm] = useState<string>('');
  const [mortarThicknessCm, setMortarThicknessCm] = useState<string>('');
  const [selectedSlabId, setSelectedSlabId] = useState<string>('');
  const [cutSlabs, setCutSlabs] = useState<string>('');
  const [materials, setMaterials] = useState<Material[]>([]);
  const [totalHours, setTotalHours] = useState<number | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  const [taskBreakdown, setTaskBreakdown] = useState<{task: string, hours: number, amount: number, unit: string}[]>([]);

  // Fetch task templates for slab types
  const { data: slabTypes = [], isLoading, error: fetchError } = useQuery({
    queryKey: ['task_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .ilike('name', '%slab%')  // Fetch all tasks with 'slab' in the name
        .order('name');
      
      if (error) throw error;
      
      console.log('Fetched slab types:', data);
      
      // Transform data to include is_porcelain flag based on name
      return data.map(item => ({
        ...item,
        is_porcelain: item.name.toLowerCase().includes('slab') && !item.name.toLowerCase().includes('sandstone')
      }));
    }
  });

  // Add a new query to fetch time estimates for cutting tasks
  const { data: cuttingTasks = [], isLoading: isLoadingCuttingTasks } = useQuery({
    queryKey: ['cutting_tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .or('name.ilike.%cutting%,name.ilike.%cut%')
        .order('name');
      
      if (error) throw error;
      console.log('Fetched cutting tasks:', data);
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
      const priceMap = data.reduce((acc, item) => {
        acc[item.name] = item.price;
        return acc;
      }, {} as Record<string, number>);
      
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
    console.log('Calculating with values:', {
      area,
      tape1ThicknessCm,
      mortarThicknessCm,
      selectedSlabId,
      slabTypes
    });

    if (!area) {
      setCalculationError('Please enter the area');
      return;
    }
    
    if (!tape1ThicknessCm) {
      setCalculationError('Please enter the Type 1 Aggregate thickness');
      return;
    }
    
    if (!mortarThicknessCm) {
      setCalculationError('Please enter the mortar thickness');
      return;
    }
    
    if (!selectedSlabId) {
      setCalculationError('Please select a slab type');
      return;
    }
    
    // Find the selected slab type using the ID
    const selectedSlabType = slabTypes.find(type => type.id.toString() === selectedSlabId);
    
    if (!selectedSlabType) {
      setCalculationError(`Selected slab type not found (ID: ${selectedSlabId})`);
      return;
    }
    
    console.log('Selected slab type:', selectedSlabType);
    
    setCalculationError(null);
    
    try {
      const areaNum = parseFloat(area);
      // Convert cm to meters for calculations
      const tape1ThicknessM = parseFloat(tape1ThicknessCm) / 100;
      const mortarThicknessM = parseFloat(mortarThicknessCm) / 100;
      const cutSlabsNum = cutSlabs ? parseInt(cutSlabs) : 0;
      
      // Calculate base hours needed for installation based on time estimator
      let mainTaskHours = 0;
      
      // Check if the selected task has a valid unit and estimated_hours
      if (selectedSlabType.unit && selectedSlabType.estimated_hours !== undefined) {
        console.log(`Task: ${selectedSlabType.name}, Unit: ${selectedSlabType.unit}, Estimated hours: ${selectedSlabType.estimated_hours}`);
        
        if (selectedSlabType.unit.toLowerCase() === 'm2') {
          // If estimated_hours is hours per m2, multiply by area
          // For example, if estimated_hours is 0.64 hours per m2, and area is 10m2, then total hours is 6.4
          mainTaskHours = areaNum * selectedSlabType.estimated_hours;
        } else {
          // For other units, use a reasonable default
          mainTaskHours = areaNum * selectedSlabType.estimated_hours;
        }
      } else {
        console.warn('Selected task has no unit or estimated_hours:', selectedSlabType);
      }
      
      console.log('Main task hours:', mainTaskHours);
      
      // Calculate hours for cutting slabs based on time estimator
      let cuttingHours = 0;
      if (cutSlabsNum > 0) {
        // Find the appropriate cutting task based on slab type
        const isPorcelain = selectedSlabType.name.toLowerCase().includes('slab') && 
                           !selectedSlabType.name.toLowerCase().includes('sandstone');
        
        const cuttingTaskName = isPorcelain ? 'cutting slab' : 'cutting sandstone';
        const cuttingTask = cuttingTasks.find(task => 
          task.name.toLowerCase().includes(cuttingTaskName)
        );
        
        console.log('Cutting task:', cuttingTask);
        
        if (cuttingTask && cuttingTask.estimated_hours !== undefined) {
          // If estimated_hours is hours per cut, multiply by number of cuts
          // For example, if estimated_hours is 0.065 hours per cut, and cuts is 10, then total hours is 0.65
          cuttingHours = cutSlabsNum * cuttingTask.estimated_hours;
          console.log(`Cutting hours: ${cutSlabsNum} cuts × ${cuttingTask.estimated_hours} hours per cut = ${cuttingHours} hours`);
        } else {
          // Fallback to previous estimates if cutting task not found
          const minutesPerCut = isPorcelain ? 6 : 4;
          cuttingHours = (cutSlabsNum * minutesPerCut) / 60;
          console.log(`Cutting hours (fallback): ${cutSlabsNum} cuts × ${minutesPerCut} minutes per cut = ${cuttingHours} hours`);
        }
      }
      
      // Calculate materials needed
      const totalDepthM = tape1ThicknessM + mortarThicknessM + 0.02; // Adding 2cm (0.02m)
      
      // Calculate soil to be dug out (area × total depth)
      const soilVolume = areaNum * totalDepthM;
      // Convert soil volume to tonnes (approximately 1.5 tonnes per cubic meter)
      const soilTonnes = soilVolume * 1.5;
      
      // Calculate tape1 needed (area × tape1 thickness)
      const tape1Volume = areaNum * tape1ThicknessM;
      // Convert tape1 volume to tonnes (approximately 2.1 tonnes per cubic meter)
      const tape1Tonnes = tape1Volume * 2.1;
      
      // Calculate mortar needed (area × mortar thickness)
      const mortarVolume = areaNum * mortarThicknessM;
      
      // Break down mortar into cement and sand
      // Standard mix ratio is 1:4 (cement:sand) by volume
      const cementVolume = mortarVolume * 0.2; // 1/5 of total volume
      const sandVolume = mortarVolume * 0.8; // 4/5 of total volume
      // Convert sand volume to tonnes (approximately 1.6 tonnes per cubic meter)
      const sandTonnes = sandVolume * 1.6;
      
      // Convert cement volume to bags (1 bag = 25kg = ~0.0167 cubic meters)
      const cementBags = cementVolume / 0.0167;
      
      // Create task breakdown with only tasks that have time estimates
      const breakdown = [];
      
      // Only add main task if it has hours
      if (mainTaskHours > 0) {
        breakdown.push({ 
          task: `${selectedSlabType.name}`,
          hours: mainTaskHours,
          amount: areaNum,
          unit: 'square meters'
        });
      }
      
      // Only add cutting task if it has hours
      if (cuttingHours > 0) {
        const isPorcelain = selectedSlabType.name.toLowerCase().includes('slab') && 
                           !selectedSlabType.name.toLowerCase().includes('sandstone');
        const cuttingTaskName = isPorcelain ? 'cutting porcelain' : 'cutting sandstones';
        breakdown.push({ 
          task: cuttingTaskName,
          hours: cuttingHours,
          amount: cutSlabsNum,
          unit: 'slabs'
        });
      }
      
      // Calculate total hours
      const totalHours = breakdown.reduce((sum, item) => sum + item.hours, 0);
      
      // Prepare materials list (excluding slab type)
      const materialsList: Material[] = [
        { name: 'Soil excavation', amount: soilTonnes, unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: 'tape1', amount: tape1Tonnes, unit: 'tonnes', price_per_unit: null, total_price: null },
        { name: 'Cement', amount: cementBags, unit: 'bags', price_per_unit: null, total_price: null },
        { name: 'Sand', amount: sandTonnes, unit: 'tonnes', price_per_unit: null, total_price: null }
      ];
      
      // Fetch prices for materials
      const materialsWithPrices = await fetchMaterialPrices(materialsList);
      
      setMaterials(materialsWithPrices);
      setTotalHours(totalHours);
      setTaskBreakdown(breakdown);
    } catch (err) {
      console.error('Error in calculation:', err);
      setCalculationError(`An error occurred during calculation: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (totalHours !== null && materials.length > 0) {
      const formattedResults = {
        name: selectedSlabId ? slabTypes.find(type => type.id.toString() === selectedSlabId)?.name || 'Slab Installation' : 'Slab Installation',
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
  }, [totalHours, materials, taskBreakdown, area, selectedSlabId, slabTypes, onResultsChange]);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Slab Installation Calculator</h2>
      <p className="text-sm text-gray-600">
        Calculate materials, time, and costs for slab installation projects.
      </p>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Area (m²)</label>
          <input
            type="number"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter area in square meters"
            min="0"
            step="0.01"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Type 1 Aggregate Thickness (cm)</label>
          <input
            type="number"
            value={tape1ThicknessCm}
            onChange={(e) => setTape1ThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter thickness in centimeters"
            min="0"
            step="0.5"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Mortar Thickness (cm)</label>
          <input
            type="number"
            value={mortarThicknessCm}
            onChange={(e) => setMortarThicknessCm(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter thickness in centimeters"
            min="0"
            step="0.5"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Slab Type</label>
          <select
            value={selectedSlabId}
            onChange={(e) => {
              const value = e.target.value;
              console.log('Selected slab ID:', value);
              setSelectedSlabId(value);
            }}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-select"
            disabled={isLoading}
          >
            <option value="">Select slab type</option>
            {slabTypes && slabTypes.length > 0 && slabTypes.map(type => (
              <option key={type.id} value={type.id.toString()}>
                {type.name}
              </option>
            ))}
          </select>
          {isLoading && <p className="text-sm text-gray-500 mt-1">Loading slab types...</p>}
          {fetchError && <p className="text-sm text-red-500 mt-1">Error loading slab types</p>}
          <p className="text-sm text-gray-500 mt-1">Selected ID: {selectedSlabId}</p>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700">Number of Slabs to be Cut (optional)</label>
          <input
            type="number"
            value={cutSlabs}
            onChange={(e) => setCutSlabs(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 form-input"
            placeholder="Enter number of cuts"
            min="0"
            step="1"
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
          <div className="p-3 bg-red-50 text-red-700 rounded-md">
            {calculationError}
          </div>
        )}
        
        {totalHours !== null && (
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="text-lg font-medium">Total Labor Hours: <span className="text-blue-600">{totalHours.toFixed(2)} hours</span></h3>
              
              <div className="mt-2">
                <h4 className="font-medium text-gray-700 mb-2">Task Breakdown:</h4>
                <ul className="space-y-1 pl-5 list-disc">
                  {taskBreakdown.map((task, index) => (
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
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Material
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Unit
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Price per Unit
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Total Price
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {materials.map((material, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {material.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {material.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {material.unit}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {material.price_per_unit ? `£${material.price_per_unit.toFixed(2)}` : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {material.total_price ? `£${material.total_price.toFixed(2)}` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Add total price row */}
                <div className="mt-4 text-right pr-6">
                  <p className="text-sm font-medium">
                    Total Cost: {
                      materials.some(m => m.total_price !== null) 
                        ? `£${materials.reduce((sum, m) => sum + (m.total_price || 0), 0).toFixed(2)}`
                        : 'N/A'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SlabCalculator;
