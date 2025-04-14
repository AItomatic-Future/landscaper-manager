import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// Define types for our equipment
interface DiggingEquipment {
  id: string;
  name: string;
  description: string | null;
  type: 'excavator' | 'barrows_dumpers';
  "size (in tones)": number | null;
}

// Define loading time estimates for different digger sizes
const diggerTimeEstimates = [
  { equipment: 'Shovel (manual)', sizeInTons: 0.02, timePerTon: 0.5 },
  { equipment: '0.5t mini digger', sizeInTons: 0.5, timePerTon: 0.23 },
  { equipment: '1t mini digger', sizeInTons: 1, timePerTon: 0.18 },
  { equipment: '1.5-2t digger', sizeInTons: 2, timePerTon: 0.15 },
  { equipment: '3-5t digger', sizeInTons: 3, timePerTon: 0.12 },
  { equipment: '6-10t digger', sizeInTons: 6, timePerTon: 0.08 },
  { equipment: '11-20t digger', sizeInTons: 11, timePerTon: 0.05 },
  { equipment: '21-30t digger', sizeInTons: 21, timePerTon: 0.03 },
  { equipment: '31-40t digger', sizeInTons: 31, timePerTon: 0.02 },
  { equipment: '40t+ digger', sizeInTons: 40, timePerTon: 0.01 }
];

// Define time estimates for different carrier sizes (same as SoilExcavationCalculator)
const carrierTimeEstimates = [
  { carrier: 'Wheelbarrow', size: 0.1, timePerTon: 0.355 },
  { carrier: 'Wheelbarrow', size: 0.125, timePerTon: 0.296 },
  { carrier: 'Wheelbarrow', size: 0.15, timePerTon: 0.237 },
  { carrier: 'Petrol Wheelbarrow', size: 0.3, timePerTon: 0.0766 },
  { carrier: 'Petrol Wheelbarrow', size: 0.5, timePerTon: 0.03416 },
  { carrier: 'Dumper', size: 1, timePerTon: 0.00967 },
  { carrier: 'Dumper', size: 3, timePerTon: 0.00283 },
  { carrier: 'Dumper', size: 5, timePerTon: 0.00157 },
  { carrier: 'Dumper', size: 10, timePerTon: 0.00068 }
];

interface Type1AggregateCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const Type1AggregateCalculator: React.FC<Type1AggregateCalculatorProps> = ({ onResultsChange }) => {
  // State for input values
  const [calculationMethod, setCalculationMethod] = useState<'direct' | 'area'>('area');
  const [tons, setTons] = useState<string>('');
  const [length, setLength] = useState<string>('');
  const [width, setWidth] = useState<string>('');
  const [depth, setDepth] = useState<string>('');
  
  // State for equipment selection
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  
  // State for results
  const [result, setResult] = useState<{
    totalTons: number;
    excavationTime: number;
    transportTime: number;
    totalTime: number;
  } | null>(null);

  // Fetch equipment from the database
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        // Fetch excavators
        const { data: excavatorData, error: excavatorError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'excavator');
        
        if (excavatorError) throw excavatorError;
        
        // Fetch carriers (barrows/dumpers)
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers');
        
        if (carrierError) throw carrierError;
        
        setExcavators(excavatorData || []);
        setCarriers(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    fetchEquipment();
  }, []);

  // Calculate Type 1 aggregate weight from dimensions
  const calculateType1Weight = () => {
    if (calculationMethod === 'direct') {
      return parseFloat(tons) || 0;
    } else {
      const l = parseFloat(length) || 0;
      const w = parseFloat(width) || 0;
      const d = parseFloat(depth) || 0;
      
      // Calculate volume in cubic meters
      const volumeInCubicMeters = l * w * d;
      
      // Convert to tons (1 cubic meter = 2.3 tons for Type 1 aggregate)
      return volumeInCubicMeters * 2.3;
    }
  };

  // Find the closest digger time estimate based on size
  const findDiggerTimeEstimate = (sizeInTons: number) => {
    if (sizeInTons <= 0) return diggerTimeEstimates[0].timePerTon;
    
    for (let i = 0; i < diggerTimeEstimates.length - 1; i++) {
      if (
        sizeInTons >= diggerTimeEstimates[i].sizeInTons &&
        sizeInTons < diggerTimeEstimates[i + 1].sizeInTons
      ) {
        return diggerTimeEstimates[i].timePerTon;
      }
    }
    
    return diggerTimeEstimates[diggerTimeEstimates.length - 1].timePerTon;
  };

  // Find carrier time estimate
  const findCarrierTimeEstimate = (sizeInTons: number) => {
    // Find the closest carrier size that's not larger than the selected one
    const sortedEstimates = [...carrierTimeEstimates].sort((a, b) => b.size - a.size);
    const estimate = sortedEstimates.find(est => est.size <= sizeInTons);
    
    if (!estimate) {
      return carrierTimeEstimates[0].timePerTon; // Default to smallest if none found
    }
    
    return estimate.timePerTon;
  };

  // Calculate time needed
  const calculateTime = () => {
    if (!selectedExcavator) {
      alert('Please select an excavator');
      return;
    }
    
    if (!selectedCarrier) {
      alert('Please select a carrier');
      return;
    }
    
    const totalTons = calculateType1Weight();
    
    if (totalTons <= 0) {
      alert('Please enter valid dimensions or weight');
      return;
    }
    
    // Get excavator size
    const excavatorSize = selectedExcavator["size (in tones)"] || 0;
    
    // Find excavation time estimate
    const excavationTimePerTon = findDiggerTimeEstimate(excavatorSize);
    const excavationTime = excavationTimePerTon * totalTons;
    
    // Calculate transport time
    const carrierSize = selectedCarrier["size (in tones)"] || 0;
    const transportTimePerTon = findCarrierTimeEstimate(carrierSize);
    const transportTime = transportTimePerTon * totalTons;
    
    // Set result - total time is excavation time + transport time
    setResult({
      totalTons,
      excavationTime,
      transportTime,
      totalTime: excavationTime + transportTime
    });
  };

  // Format time to hours and minutes
  const formatTime = (hours: number) => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    
    if (wholeHours === 0) {
      return `${minutes} minutes`;
    } else if (minutes === 0) {
      return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''}`;
    } else {
      return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  };

  // Add useEffect to notify parent of result changes
  useEffect(() => {
    if (result && onResultsChange) {
      const formattedResults = {
        name: 'Type 1 Aggregate Installation',
        amount: result.totalTons,
        hours_worked: result.totalTime,
        materials: [],
        taskBreakdown: []
      };

      // Store results in data attribute
      const calculatorElement = document.querySelector('[data-calculator-results]');
      if (calculatorElement) {
        calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
      }

      // Notify parent component
      onResultsChange(formattedResults);
    }
  }, [result, onResultsChange]);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-800">Preparation Calculator</h2>
      
      {/* Calculation Method */}
      <div>
        <p 
          className="text-blue-600 cursor-pointer hover:underline mb-2"
          onClick={() => setCalculationMethod(calculationMethod === 'direct' ? 'area' : 'direct')}
        >
          {calculationMethod === 'direct' ? 'Calculate by area' : 'Calculate by weight'}
        </p>
        
        {calculationMethod === 'direct' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Aggregate Weight (tons)</label>
            <input
              type="number"
              value={tons}
              onChange={(e) => setTons(e.target.value)}
              className="w-full p-2 border rounded-md"
              placeholder="Enter weight in tons"
              min="0"
              step="0.1"
            />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Length (m)</label>
              <input
                type="number"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Length"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Width (m)</label>
              <input
                type="number"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Width"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Depth (m)</label>
              <input
                type="number"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                className="w-full p-2 border rounded-md"
                placeholder="Depth"
                min="0"
                step="0.01"
              />
            </div>
          </div>
        )}
      </div>
      
      {/* Equipment Selection */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Excavation Machinery</label>
          <div className="space-y-2">
            {excavators.length === 0 ? (
              <p className="text-gray-500">No excavators found</p>
            ) : (
              excavators.map((excavator) => (
                <div 
                  key={excavator.id}
                  className="flex items-center p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                  onClick={() => setSelectedExcavator(excavator)}
                >
                  <div className={`w-4 h-4 rounded-full border mr-2 ${
                    selectedExcavator?.id === excavator.id 
                      ? 'border-blue-600' 
                      : 'border-gray-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${
                      selectedExcavator?.id === excavator.id 
                        ? 'bg-blue-600' 
                        : 'bg-transparent'
                    }`}></div>
                  </div>
                  <div>
                    <span className="text-gray-800">{excavator.name}</span>
                    <span className="text-sm text-gray-600 ml-2">({excavator["size (in tones)"]} tons)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Carrier Machinery</label>
          <div className="space-y-2">
            {carriers.length === 0 ? (
              <p className="text-gray-500">No carriers found</p>
            ) : (
              carriers.map((carrier) => (
                <div 
                  key={carrier.id}
                  className="flex items-center p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                  onClick={() => setSelectedCarrier(carrier)}
                >
                  <div className={`w-4 h-4 rounded-full border mr-2 ${
                    selectedCarrier?.id === carrier.id 
                      ? 'border-blue-600' 
                      : 'border-gray-400'
                  }`}>
                    <div className={`w-2 h-2 rounded-full m-0.5 ${
                      selectedCarrier?.id === carrier.id 
                        ? 'bg-blue-600' 
                        : 'bg-transparent'
                    }`}></div>
                  </div>
                  <div>
                    <span className="text-gray-800">{carrier.name}</span>
                    <span className="text-sm text-gray-600 ml-2">({carrier["size (in tones)"]} tons)</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
      {/* Calculate Button */}
      <button
        onClick={calculateTime}
        className="w-full bg-gray-700 text-white py-3 rounded-md hover:bg-gray-800 transition-colors"
      >
        Calculate Time
      </button>
      
      {/* Results */}
      {result && (
        <div className="mt-4 p-6 bg-gray-100 rounded-md">
          <h3 className="text-lg font-semibold mb-2">Estimated Time</h3>
          <div className="space-y-2">
            <p>Total Aggregate: <span className="font-medium">{result.totalTons.toFixed(2)} tons</span></p>
            <p>Preparation Time: <span className="font-medium">{formatTime(result.excavationTime)}</span></p>
            <p>Transport Time: <span className="font-medium">{formatTime(result.transportTime)}</span></p>
            <p className="text-lg">
              Total Time: <span className="font-bold">
                {formatTime(result.totalTime)}
              </span>
            </p>
            <p className="text-sm text-gray-500 italic mt-2">
              * Calculated for 30 meter of transport route (each way)
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Type1AggregateCalculator;
