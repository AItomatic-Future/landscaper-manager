import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { X, Loader, Check, AlertTriangle } from 'lucide-react';

interface MachineryTaskCreatorProps {
  onClose: () => void;
}

interface DiggingEquipment {
  id: string;
  name: string;
  description: string | null;
  status: 'free_to_use' | 'in_use' | 'broken';
  created_at?: string;
  updated_at?: string;
  type: 'excavator' | 'barrows_dumpers';
  quantity: number;
  in_use_quantity: number;
  "size (in tones)": number | null;
}

interface EventTask {
  id?: string;
  name: string;
  description: string;
  unit: string;
  estimated_hours: number;
}

// Define time estimates for different digger sizes (from SoilExcavationCalculator)
const soilDiggerTimeEstimates = [
  { size: 'Shovel (1 Person)', sizeInTons: 0.02, timePerTon: 0.5 },
  { size: 'Digger 1T', sizeInTons: 1, timePerTon: 0.14 },
  { size: 'Digger 2T', sizeInTons: 2, timePerTon: 0.06 },
  { size: 'Digger 3-5T', sizeInTons: 3, timePerTon: 0.02 },
  { size: 'Digger 6-10T', sizeInTons: 6, timePerTon: 0.01 },
  { size: 'Digger 11-20T', sizeInTons: 11, timePerTon: 0.003 },
  { size: 'Digger 21-30T', sizeInTons: 21, timePerTon: 0.0012 },
  { size: 'Digger 31-40T', sizeInTons: 31, timePerTon: 0.0007 },
  { size: 'Digger 41-50T', sizeInTons: 41, timePerTon: 0.0004 }
];

// Define time estimates for different carrier sizes (from SoilExcavationCalculator)
const carrierTimeEstimates = [
  { carrier: 'Wheelbarrow', size: 0.1, timePerTon: 0.355 },
  { carrier: 'Wheelbarrow', size: 0.125, timePerTon: 0.442 },
  { carrier: 'Wheelbarrow', size: 0.15, timePerTon: 0.530 },
  { carrier: 'Petrol Wheelbarrow', size: 0.3, timePerTon: 0.0766 },
  { carrier: 'Petrol Wheelbarrow', size: 0.5, timePerTon: 0.03416 },
  { carrier: 'Dumper', size: 1, timePerTon: 0.00967 },
  { carrier: 'Dumper', size: 3, timePerTon: 0.00283 },
  { carrier: 'Dumper', size: 5, timePerTon: 0.00157 },
  { carrier: 'Dumper', size: 10, timePerTon: 0.00068 }
];

// Define loading time estimates for different digger sizes (from Type1AggregateCalculator)
const preparationDiggerTimeEstimates = [
  { equipment: 'Shovel (manual)', sizeInTons: 0.02, timePerTon: 0.5 },
  { equipment: '0.5t mini digger', sizeInTons: 0.5, timePerTon: 0.23 },
  { equipment: '1t mini digger', sizeInTons: 1, timePerTon: 0.18 },
  { equipment: '3-5t digger', sizeInTons: 3, timePerTon: 0.12 },
  { equipment: '6-10t digger', sizeInTons: 6, timePerTon: 0.08 },
  { equipment: '11-20t digger', sizeInTons: 11, timePerTon: 0.05 },
  { equipment: '21-30t digger', sizeInTons: 21, timePerTon: 0.03 },
  { equipment: '31-40t digger', sizeInTons: 31, timePerTon: 0.02 },
  { equipment: '40t+ digger', sizeInTons: 40, timePerTon: 0.01 }
];

const MachineryTaskCreator: React.FC<MachineryTaskCreatorProps> = ({ onClose }) => {
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [creationStatus, setCreationStatus] = useState<{
    success: number;
    failed: number;
    skipped: number;
    total: number;
  }>({ success: 0, failed: 0, skipped: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState<boolean>(false);
  const [newExcavators, setNewExcavators] = useState<DiggingEquipment[]>([]);
  const [newCarriers, setNewCarriers] = useState<DiggingEquipment[]>([]);
  const [existingTasks, setExistingTasks] = useState<string[]>([]);

  useEffect(() => {
    fetchEquipment();
  }, []);

  const fetchEquipment = async () => {
    try {
      setIsLoading(true);
      setError(null);

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

      // Fetch existing tasks to check for duplicates
      const { data: taskData, error: taskError } = await supabase
        .from('event_tasks')
        .select('name');

      if (taskError) throw taskError;

      // Store all excavators and carriers
      setExcavators(excavatorData || []);
      setCarriers(carrierData || []);
      
      // Store existing task names for duplicate checking
      setExistingTasks((taskData || []).map(task => task.name));

      // Determine which equipment combinations need new tasks
      const newExcavatorsList: DiggingEquipment[] = [];
      const newCarriersList: DiggingEquipment[] = [];

      // Check each excavator to see if it needs tasks
      for (const excavator of excavatorData || []) {
        if (excavator["size (in tones)"] === null) continue;
        
        let needsTasks = false;
        
        // For each carrier, check if tasks already exist
        for (const carrier of carrierData || []) {
          if (carrier["size (in tones)"] === null) continue;
          
          // Get time estimates and names for soil excavation
          const soilDiggerEstimate = findSoilDiggerTimeEstimate(excavator["size (in tones)"]);
          const soilCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);
          
          // Get time estimates and names for preparation
          const prepDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
          const prepCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);

          // Generate task names to check if they exist
          const soilTaskName = `Excavation soil with ${soilDiggerEstimate.name} and ${soilCarrierEstimate.name} ${soilCarrierEstimate.size}t`;
          const prepTaskName = `Preparation with ${prepDiggerEstimate.name} and ${prepCarrierEstimate.name} ${prepCarrierEstimate.size}t`;

          // If either task doesn't exist, this excavator needs tasks
          if (!taskData?.some(task => task.name === soilTaskName) || 
              !taskData?.some(task => task.name === prepTaskName)) {
            needsTasks = true;
            break;
          }
        }
        
        // If this excavator needs tasks, add it to the new list
        if (needsTasks) {
          newExcavatorsList.push(excavator);
        }
      }

      // Check each carrier to see if it needs tasks
      for (const carrier of carrierData || []) {
        if (carrier["size (in tones)"] === null) continue;
        
        let needsTasks = false;
        
        // For each excavator, check if tasks already exist
        for (const excavator of excavatorData || []) {
          if (excavator["size (in tones)"] === null) continue;
          
          // Get time estimates and names for soil excavation
          const soilDiggerEstimate = findSoilDiggerTimeEstimate(excavator["size (in tones)"]);
          const soilCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);
          
          // Get time estimates and names for preparation
          const prepDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
          const prepCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);

          // Generate task names to check if they exist
          const soilTaskName = `Excavation soil with ${soilDiggerEstimate.name} and ${soilCarrierEstimate.name} ${soilCarrierEstimate.size}t`;
          const prepTaskName = `Preparation with ${prepDiggerEstimate.name} and ${prepCarrierEstimate.name} ${prepCarrierEstimate.size}t`;

          // If either task doesn't exist, this carrier needs tasks
          if (!taskData?.some(task => task.name === soilTaskName) || 
              !taskData?.some(task => task.name === prepTaskName)) {
            needsTasks = true;
            break;
          }
        }
        
        // If this carrier needs tasks, add it to the new list
        if (needsTasks) {
          newCarriersList.push(carrier);
        }
      }

      setNewExcavators(newExcavatorsList);
      setNewCarriers(newCarriersList);
    } catch (error) {
      console.error('Error fetching equipment:', error);
      setError('Failed to fetch equipment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Find the closest digger time estimate for soil excavation
  const findSoilDiggerTimeEstimate = (sizeInTons: number) => {
    if (sizeInTons <= 0) return soilDiggerTimeEstimates[0].timePerTon;
    
    for (let i = 0; i < soilDiggerTimeEstimates.length - 1; i++) {
      if (
        sizeInTons >= soilDiggerTimeEstimates[i].sizeInTons &&
        sizeInTons < soilDiggerTimeEstimates[i + 1].sizeInTons
      ) {
        return {
          timePerTon: soilDiggerTimeEstimates[i].timePerTon,
          name: soilDiggerTimeEstimates[i].size
        };
      }
    }
    
    return {
      timePerTon: soilDiggerTimeEstimates[soilDiggerTimeEstimates.length - 1].timePerTon,
      name: soilDiggerTimeEstimates[soilDiggerTimeEstimates.length - 1].size
    };
  };

  // Find the closest digger time estimate for preparation
  const findPreparationDiggerTimeEstimate = (sizeInTons: number) => {
    if (sizeInTons <= 0) return preparationDiggerTimeEstimates[0].timePerTon;
    
    for (let i = 0; i < preparationDiggerTimeEstimates.length - 1; i++) {
      if (
        sizeInTons >= preparationDiggerTimeEstimates[i].sizeInTons &&
        sizeInTons < preparationDiggerTimeEstimates[i + 1].sizeInTons
      ) {
        return {
          timePerTon: preparationDiggerTimeEstimates[i].timePerTon,
          name: preparationDiggerTimeEstimates[i].equipment
        };
      }
    }
    
    return {
      timePerTon: preparationDiggerTimeEstimates[preparationDiggerTimeEstimates.length - 1].timePerTon,
      name: preparationDiggerTimeEstimates[preparationDiggerTimeEstimates.length - 1].equipment
    };
  };

  // Find carrier time estimate
  const findCarrierTimeEstimate = (sizeInTons: number) => {
    // Find the closest carrier size that's not larger than the selected one
    const sortedEstimates = [...carrierTimeEstimates].sort((a, b) => b.size - a.size);
    const estimate = sortedEstimates.find(est => est.size <= sizeInTons);
    
    if (!estimate) {
      return {
        timePerTon: carrierTimeEstimates[0].timePerTon,
        name: carrierTimeEstimates[0].carrier,
        size: carrierTimeEstimates[0].size
      };
    }
    
    return {
      timePerTon: estimate.timePerTon,
      name: estimate.carrier,
      size: estimate.size
    };
  };

  const createTasks = async () => {
    try {
      setIsCreating(true);
      setShowResults(false);
      setError(null);
      
      let successCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      
      // Calculate total potential tasks
      let totalNewTasks = 0;
      for (const excavator of newExcavators) {
        for (const carrier of newCarriers) {
          if (excavator["size (in tones)"] !== null && carrier["size (in tones)"] !== null) {
            totalNewTasks += 2; // 2 task types per combination
          }
        }
      }
      
      setCreationStatus({
        success: 0,
        failed: 0,
        skipped: 0,
        total: totalNewTasks
      });

      // Create tasks for each excavator and carrier combination
      for (const excavator of newExcavators) {
        for (const carrier of newCarriers) {
          // Skip if either equipment doesn't have a size
          if (excavator["size (in tones)"] === null || carrier["size (in tones)"] === null) {
            continue;
          }

          // Get time estimates and names for soil excavation
          const soilDiggerEstimate = findSoilDiggerTimeEstimate(excavator["size (in tones)"]);
          const soilCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);
          
          // Get time estimates and names for preparation
          const prepDiggerEstimate = findPreparationDiggerTimeEstimate(excavator["size (in tones)"]);
          const prepCarrierEstimate = findCarrierTimeEstimate(carrier["size (in tones)"]);

          // Generate task names
          const soilTaskName = `Excavation soil with ${soilDiggerEstimate.name} and ${soilCarrierEstimate.name} ${soilCarrierEstimate.size}t`;
          const prepTaskName = `Preparation with ${prepDiggerEstimate.name} and ${prepCarrierEstimate.name} ${prepCarrierEstimate.size}t`;

          // Check if soil task already exists
          if (existingTasks.includes(soilTaskName)) {
            skippedCount++;
          } else {
            // Create soil excavation task
            const soilTask = {
              name: soilTaskName,
              description: "Time estimated for 1 person",
              unit: "tons",
              estimated_hours: soilDiggerEstimate.timePerTon + soilCarrierEstimate.timePerTon
            };

            // Insert soil excavation task
            const { error: soilError } = await supabase
              .from('event_tasks')
              .insert([soilTask]);

            if (soilError) {
              console.error('Error creating soil task:', soilError);
              failedCount++;
            } else {
              successCount++;
              // Add to existing tasks to prevent duplicates in this session
              existingTasks.push(soilTaskName);
            }
          }

          // Check if preparation task already exists
          if (existingTasks.includes(prepTaskName)) {
            skippedCount++;
          } else {
            // Create preparation task
            const prepTask = {
              name: prepTaskName,
              description: "Time estimated for 1 person",
              unit: "tons",
              estimated_hours: prepDiggerEstimate.timePerTon + prepCarrierEstimate.timePerTon
            };

            // Insert preparation task
            const { error: prepError } = await supabase
              .from('event_tasks')
              .insert([prepTask]);

            if (prepError) {
              console.error('Error creating preparation task:', prepError);
              failedCount++;
            } else {
              successCount++;
              // Add to existing tasks to prevent duplicates in this session
              existingTasks.push(prepTaskName);
            }
          }

          // Update status after each combination
          setCreationStatus({
            success: successCount,
            failed: failedCount,
            skipped: skippedCount,
            total: totalNewTasks
          });
        }
      }

      setShowResults(true);
    } catch (error) {
      console.error('Error creating tasks:', error);
      setError('An unexpected error occurred while creating tasks.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold">Machinery Task Creator</h2>
          <button 
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-200 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-grow">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Loader className="w-8 h-8 text-gray-400 animate-spin mb-4" />
              <p className="text-gray-500">Loading equipment data...</p>
            </div>
          ) : error ? (
            <div className="bg-red-50 p-4 rounded-md text-red-700 mb-4">
              <p className="font-medium">Error</p>
              <p>{error}</p>
              <button 
                onClick={fetchEquipment}
                className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 rounded text-sm"
              >
                Try Again
              </button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  This tool will create task templates for all combinations of excavators and carriers in your equipment inventory.
                </p>
                <p className="text-gray-700 mb-4">
                  For each combination, two tasks will be created:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-gray-700 mb-4">
                  <li>Soil excavation task</li>
                  <li>Preparation task</li>
                </ul>
                <div className="bg-yellow-50 p-3 rounded-md text-yellow-800 text-sm">
                  <p className="font-medium flex items-center">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    Important
                  </p>
                  <p>
                    Found {newExcavators.length} new excavators and {newCarriers.length} new carriers.
                    This will create {newExcavators.length * newCarriers.length * 2} new tasks in total.
                  </p>
                </div>
              </div>

              {showResults ? (
                <div className={`p-4 rounded-md mb-4 ${
                  creationStatus.failed > 0 ? 'bg-yellow-50 text-yellow-800' : 'bg-green-50 text-green-800'
                }`}>
                  <p className="font-medium flex items-center">
                    {creationStatus.failed > 0 ? (
                      <AlertTriangle className="w-4 h-4 mr-2" />
                    ) : (
                      <Check className="w-4 h-4 mr-2" />
                    )}
                    Task Creation Results
                  </p>
                  <p>Successfully created: {creationStatus.success} tasks</p>
                  <p>Skipped (already exist): {creationStatus.skipped} tasks</p>
                  {creationStatus.failed > 0 && (
                    <p>Failed to create: {creationStatus.failed} tasks</p>
                  )}
                </div>
              ) : null}

              <button
                onClick={createTasks}
                disabled={isCreating || newExcavators.length === 0 || newCarriers.length === 0}
                className={`w-full py-2 px-4 rounded font-medium flex items-center justify-center ${
                  isCreating || newExcavators.length === 0 || newCarriers.length === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isCreating ? (
                  <>
                    <Loader className="w-4 h-4 mr-2 animate-spin" />
                    Creating Tasks ({creationStatus.success + creationStatus.failed + creationStatus.skipped}/{creationStatus.total})
                  </>
                ) : (
                  'Create Tasks'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MachineryTaskCreator;
