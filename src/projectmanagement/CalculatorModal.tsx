import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import WallCalculator from '../components/Calculator/WallCalculator';
import FenceCalculator from '../components/Calculator/FenceCalculator';
import SlabCalculator from '../components/Calculator/SlabCalculator';
import StairCalculator from '../components/Calculator/StairCalculator';
import Type1AggregateCalculator from '../components/Calculator/Type1AggregateCalculator';
import SoilExcavationCalculator from '../components/Calculator/SoilExcavationCalculator';
import PavingCalculator from '../components/Calculator/PavingCalculator';
import ArtificialGrassCalculator from '../components/Calculator/ArtificialGrassCalculator';

interface CalculatorModalProps {
  calculatorType: string;
  calculatorSubType: string;
  onClose: () => void;
  onSaveResults: (results: any) => void;
}

const CalculatorModal: React.FC<CalculatorModalProps> = ({
  calculatorType,
  calculatorSubType,
  onClose,
  onSaveResults
}) => {
  const queryClient = useQueryClient();
  const [calculatorResults, setCalculatorResults] = useState<any>(null);

  // Mutation for saving task results
  const saveTaskMutation = useMutation({
    mutationFn: async (taskData: any) => {
      const { data, error } = await supabase
        .from('tasks_done')
        .insert([{
          event_id: taskData.event_id,
          name: taskData.name,
          amount: taskData.amount,
          hours_worked: taskData.hours_worked,
          progress_completed: 0,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  });

  // Mutation for saving material results
  const saveMaterialMutation = useMutation({
    mutationFn: async (materialData: any) => {
      const { data, error } = await supabase
        .from('materials_delivered')
        .insert([{
          event_id: materialData.event_id,
          name: materialData.name,
          total_amount: materialData.total_amount,
          unit: materialData.unit,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  });

  const renderCalculator = () => {
    const commonProps = {
      onResultsChange: setCalculatorResults
    };

    switch (calculatorType) {
      case 'aggregate':
        switch (calculatorSubType) {
          case 'type1':
            return <Type1AggregateCalculator {...commonProps} />;
          case 'soil_excavation':
            return <SoilExcavationCalculator {...commonProps} />;
          default:
            return null;
        }
      case 'paving':
        return <PavingCalculator {...commonProps} />;
      case 'wall':
        return <WallCalculator type={calculatorSubType as 'brick' | 'block4' | 'block7'} {...commonProps} />;
      case 'slab':
        return <SlabCalculator {...commonProps} />;
      case 'fence':
        return <FenceCalculator fenceType={calculatorSubType as 'vertical' | 'horizontal'} {...commonProps} />;
      case 'steps':
        return <StairCalculator {...commonProps} />;
      case 'grass':
        return <ArtificialGrassCalculator {...commonProps} />;
      default:
        return null;
    }
  };

  const handleSaveResults = async () => {
    if (!calculatorResults) return;

    try {
      // First update the UI with the results
      onSaveResults(calculatorResults);

      // Then save to database if we have an event_id
      if (calculatorResults.event_id) {
        // Save task results
        if (calculatorResults.hours_worked) {
          await saveTaskMutation.mutateAsync({
            event_id: calculatorResults.event_id,
            name: calculatorResults.name,
            amount: calculatorResults.amount,
            hours_worked: calculatorResults.hours_worked
          });
        }

        // Save material results
        if (calculatorResults.materials && calculatorResults.materials.length > 0) {
          for (const material of calculatorResults.materials) {
            await saveMaterialMutation.mutateAsync({
              event_id: calculatorResults.event_id,
              name: material.name,
              total_amount: material.quantity,
              unit: material.unit
            });
          }
        }

        // Invalidate queries to refresh the data
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['materials'] });
      }

      // Close the modal
      onClose();
    } catch (error) {
      console.error('Error saving results:', error);
      // You might want to show an error message to the user here
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Calculator</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6" data-calculator-results>
          {renderCalculator()}
        </div>

        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveResults}
            disabled={!calculatorResults}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
          >
            Add to Project
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalculatorModal;
