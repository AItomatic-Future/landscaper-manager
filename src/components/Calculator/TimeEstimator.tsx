import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { Clock, Users } from 'lucide-react';

interface TaskTemplate {
  id: string;
  name: string;
  unit: string;
  estimated_hours: number;
}

const TimeEstimator = () => {
  const [selectedTask, setSelectedTask] = useState<TaskTemplate | null>(null);
  const [quantity, setQuantity] = useState('');
  const [workers, setWorkers] = useState('');
  const [result, setResult] = useState<{ totalHours: number; perWorker: number; days: number } | null>(null);

  // Fetch task templates
  const { data: taskTemplates = [], isLoading } = useQuery({
    queryKey: ['task_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('id, name, unit, estimated_hours')
        .order('name');
      
      if (error) throw error;
      return data as TaskTemplate[];
    }
  });

  const calculateTime = () => {
    if (!selectedTask || !quantity || !workers) return;

    const totalUnits = parseFloat(quantity);
    const numWorkers = parseInt(workers);
    
    if (isNaN(totalUnits) || isNaN(numWorkers) || numWorkers <= 0) return;

    // Calculate total hours needed for all units
    const totalHours = totalUnits * selectedTask.estimated_hours;
    
    // Calculate hours per worker
    const hoursPerWorker = totalHours / numWorkers;
    
    // Calculate working days (8-hour workday)
    const workingDays = Math.ceil(hoursPerWorker / 8);

    setResult({
      totalHours: Number(totalHours.toFixed(1)),
      perWorker: Number(hoursPerWorker.toFixed(1)),
      days: workingDays
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Task Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700">Select Task</label>
        <select
          value={selectedTask?.id || ''}
          onChange={(e) => {
            const task = taskTemplates.find(t => t.id === e.target.value);
            setSelectedTask(task || null);
            setResult(null);
          }}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
        >
          <option value="">Select a task</option>
          {taskTemplates.map(task => (
            <option key={task.id} value={task.id}>
              {task.name} ({task.estimated_hours}h per {task.unit})
            </option>
          ))}
        </select>
      </div>

      {selectedTask && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Quantity ({selectedTask.unit})
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                setResult(null);
              }}
              min="0.1"
              step="0.1"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder={`Enter amount in ${selectedTask.unit}`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Number of Workers
            </label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Users className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                value={workers}
                onChange={(e) => {
                  setWorkers(e.target.value);
                  setResult(null);
                }}
                min="1"
                className="block w-full pl-10 rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter number of workers"
              />
            </div>
          </div>

          <button
            onClick={calculateTime}
            disabled={!quantity || !workers}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            Calculate
          </button>

          {result && (
            <div className="mt-4 p-4 bg-blue-50 rounded-md space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-blue-700">Total Hours Needed</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {result.totalHours}h
                  </div>
                </div>
                <div>
                  <div className="text-sm text-blue-700">Hours per Worker</div>
                  <div className="text-2xl font-bold text-blue-900">
                    {result.perWorker}h
                  </div>
                </div>
              </div>
              <div className="pt-3 border-t border-blue-200">
                <div className="text-sm text-blue-700">Estimated Working Days</div>
                <div className="text-2xl font-bold text-blue-900">
                  {result.days} days
                </div>
                <div className="text-xs text-blue-600 mt-1">
                  Based on 8-hour workday
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TimeEstimator;
