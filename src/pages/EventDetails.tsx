import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Clock, Package, AlertCircle, Tool } from 'lucide-react';
import BackButton from '../components/BackButton';
import TaskProgressModal from '../components/TaskProgressModal';
import MaterialProgressModal from '../components/MaterialProgressModal';
import HoursWorkedModal from '../components/HoursWorkedModal';
import AdditionalFeatures from '../components/AdditionalFeatures';

type Event = Database['public']['Tables']['events']['Row'];
type TaskDone = Database['public']['Tables']['tasks_done']['Row'];
type MaterialDelivered = Database['public']['Tables']['materials_delivered']['Row'];
type EquipmentUsage = {
  id: string;
  equipment_id: string;
  event_id: string;
  start_date: string;
  end_date: string;
  quantity: number;
  equipment: {
    id: string;
    name: string;
    type: string;
    status: string;
    quantity: number;
    in_use_quantity: number;
  };
};

const EventDetails = () => {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [showTaskProgressModal, setShowTaskProgressModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskDone | null>(null);
  const [showMaterialProgressModal, setShowMaterialProgressModal] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialDelivered | null>(null);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [releaseEquipmentId, setReleaseEquipmentId] = useState<string | null>(null);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);

  // Fetch event details
  const { data: event, isLoading: isEventLoading } = useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('events').select('*').eq('id', id).single();
      if (error) throw error;
      return data as Event;
    },
  });

  // Add mutation for updating event status
  const updateEventStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      // First update the event status
      const { error: eventError } = await supabase
        .from('events')
        .update({ status })
        .eq('id', id);

      if (eventError) throw eventError;

      // If the status is 'finished', update all associated equipment to 'free_to_use'
      if (status === 'finished') {
        const { data: equipmentUsage, error: equipmentError } = await supabase
          .from('equipment_usage')
          .select('equipment_id')
          .eq('event_id', id);

        if (equipmentError) throw equipmentError;

        if (equipmentUsage && equipmentUsage.length > 0) {
          const equipmentIds = equipmentUsage.map(usage => usage.equipment_id);
          
          const { error: updateError } = await supabase
            .from('equipment')
            .update({ status: 'free_to_use' })
            .in('id', equipmentIds)
            .eq('status', 'in_use');

          if (updateError) throw updateError;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['equipment_usage'] });
      setStatusError(null);
    }
  });

  // Fetch tasks with progress
  const { data: tasks = [], isLoading: isTasksLoading } = useQuery({
    queryKey: ['tasks', id],
    queryFn: async () => {
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks_done')
        .select('*')
        .eq('event_id', id)
        .order('created_at', { ascending: false });

      if (tasksError) throw tasksError;

      // Fetch progress for each task
      const tasksWithProgress = await Promise.all(
        tasksData.map(async (task) => {
          const { data: progressData } = await supabase
            .from('task_progress_entries')
            .select('amount_completed, hours_spent')
            .eq('task_id', task.id);

          const totalCompleted = progressData?.reduce((sum, entry) => sum + entry.amount_completed, 0) || 0;
          const totalHoursSpent = progressData?.reduce((sum, entry) => sum + entry.hours_spent, 0) || 0;

          return {
            ...task,
            progress_completed: totalCompleted,
            hours_spent: totalHoursSpent
          };
        })
      );

      return tasksWithProgress;
    },
  });

  // Fetch materials
  const { data: materials = [], isLoading: isMaterialsLoading } = useQuery({
    queryKey: ['materials', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials_delivered')
        .select(`
          *,
          material_deliveries (
            amount,
            delivery_date,
            notes
          )
        `)
        .eq('event_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Create a map to consolidate materials
      const materialsMap = new Map<string, MaterialDelivered & {
        material_deliveries: any[];
        total_amount: number;
      }>();

      // Consolidate materials with same name and unit
      data.forEach(material => {
        const key = `${material.name}-${material.unit}`;
        
        if (materialsMap.has(key)) {
          const existing = materialsMap.get(key)!;
          // Add the amounts
          existing.total_amount += material.total_amount;
          // Combine the deliveries
          existing.material_deliveries = [
            ...(existing.material_deliveries || []),
            ...(material.material_deliveries || [])
          ];
        } else {
          materialsMap.set(key, {
            ...material,
            material_deliveries: material.material_deliveries || [],
            total_amount: material.total_amount
          });
        }
      });

      // Convert map back to array and calculate delivered amounts
      const consolidatedMaterials = Array.from(materialsMap.values()).map(material => ({
        ...material,
        material_deliveries: material.material_deliveries || [],
        amount: material.material_deliveries 
          ? material.material_deliveries.reduce((sum, delivery) => sum + (delivery.amount || 0), 0)
          : 0
      }));

      return consolidatedMaterials as MaterialDelivered[];
    }
  });

  // Fetch total hours
  const { data: totalHours = 0 } = useQuery({
    queryKey: ['total_hours', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select('hours_spent')
        .eq('event_id', id);

      if (error) throw error;
      return data.reduce((sum, entry) => sum + entry.hours_spent, 0);
    },
  });

  // Fetch equipment usage for this event
  const { data: equipmentUsage = [], isLoading: isEquipmentLoading } = useQuery({
    queryKey: ['event_equipment', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_usage')
        .select(`
          id,
          equipment_id,
          event_id,
          start_date,
          end_date,
          quantity,
          equipment:equipment_id (
            id,
            name,
            type,
            status,
            quantity,
            in_use_quantity
          )
        `)
        .eq('event_id', id)
        .eq('is_returned', false);

      if (error) throw error;
      return data as EquipmentUsage[];
    },
  });

  // Mutation to release equipment (set to free_to_use)
  const releaseEquipmentMutation = useMutation({
    mutationFn: async (usageId: string) => {
      // First get the usage record to know the quantity and equipment_id
      const { data: usage, error: usageError } = await supabase
        .from('equipment_usage')
        .select('equipment_id, quantity')
        .eq('id', usageId)
        .single();

      if (usageError) {
        console.error('Error fetching usage:', usageError);
        throw usageError;
      }

      if (!usage) {
        throw new Error('Equipment usage not found');
      }

      // Get current equipment data
      const { data: equipment, error: equipmentError } = await supabase
        .from('equipment')
        .select('in_use_quantity, quantity')
        .eq('id', usage.equipment_id)
        .single();

      if (equipmentError) {
        console.error('Error fetching equipment:', equipmentError);
        throw equipmentError;
      }

      if (!equipment) {
        throw new Error('Equipment not found');
      }

      // Calculate new in_use_quantity
      const newInUseQuantity = Math.max(0, equipment.in_use_quantity - usage.quantity);
      
      // Start a transaction using multiple operations
      
      // 1. Update equipment_usage to mark as returned
      const { error: updateUsageError } = await supabase
        .from('equipment_usage')
        .update({ is_returned: true, return_date: new Date().toISOString() })
        .eq('id', usageId);

      if (updateUsageError) {
        console.error('Error updating usage:', updateUsageError);
        throw updateUsageError;
      }

      // 2. Update equipment status and in_use_quantity
      const { error: updateError } = await supabase
        .from('equipment')
        .update({ 
          status: newInUseQuantity > 0 ? 'in_use' : 'free_to_use',
          in_use_quantity: newInUseQuantity
        })
        .eq('id', usage.equipment_id);

      if (updateError) {
        console.error('Error updating equipment:', updateError);
        throw updateError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event_equipment', id] });
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_equipment'] });
      setReleaseEquipmentId(null);
      setEquipmentError(null);
    },
    onError: (error: Error) => {
      console.error('Failed to release equipment:', error);
      setEquipmentError(error.message);
    }
  });

  const handleReleaseEquipment = (usageId: string) => {
    releaseEquipmentMutation.mutate(usageId);
  };

  if (isEventLoading || !event) return <div>Loading...</div>;

  const totalTasks = tasks.length;
  
  // Calculate total task completion percentage
  const taskCompletionPercentage = tasks.reduce((total, task) => {
    const [amount] = task.amount.split(' ');
    const taskTotal = parseFloat(amount);
    const taskProgress = (task.progress_completed / taskTotal) * 100;
    return total + (taskProgress / totalTasks); // Average progress across all tasks
  }, 0);

  // Calculate total estimated hours from tasks
  const totalEstimatedHours = tasks.reduce((sum, task) => sum + task.hours_worked, 0);
  const hoursProgress = totalHours > 0 ? (totalHours / totalEstimatedHours) * 100 : 0;

  // Determine progress color based on percentage
  const getProgressColor = (percentage: number) => {
    if (percentage >= 110) return 'bg-red-600'; // More than 10% over
    if (percentage > 100) return 'bg-yellow-500'; // Up to 10% over
    return 'bg-green-600'; // Under or at 100%
  };

  const getProgressTextColor = (percentage: number) => {
    if (percentage >= 110) return 'text-red-600'; // More than 10% over
    if (percentage > 100) return 'text-yellow-500'; // Up to 10% over
    return 'text-green-600'; // Under or at 100%
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planned':
        return 'bg-gray-100 text-gray-800';
      case 'scheduled':
        return 'bg-blue-100 text-blue-800';
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'finished':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (newStatus !== event.status) {
      // Check if trying to set status to finished
      if (newStatus === 'finished') {
        // Check if all tasks are completed
        const allTasksCompleted = tasks.every(task => {
          const [amount] = task.amount.split(' ');
          return task.progress_completed >= parseFloat(amount);
        });

        if (!allTasksCompleted) {
          setStatusError('Cannot mark project as finished until all tasks are completed');
          return;
        }
      }

      updateEventStatusMutation.mutate(newStatus);
    }
  };

  const handleStatusUpdate = () => {
    if (!selectedEquipment) return;
    console.log('Updating status:', { id: selectedEquipment.id, status: newStatus });
    
    if (newStatus === 'in_use') {
      // ... existing code ...
    } else {
      updateStatusMutation.mutate({
        id: selectedEquipment.id,
        status: newStatus
      });
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8">
      <BackButton />
      {/* Header Section */}
      <div className="grid grid-cols-2 gap-6">
        {/* Project Info */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h1 className="text-2xl font-bold mb-2">{event.title}</h1>
          <p className="text-gray-600">
            {format(new Date(event.start_date), 'MMM dd, yyyy')} - {format(new Date(event.end_date), 'MMM dd, yyyy')}
          </p>
          <div className="mt-4">
            {event.status === 'finished' ? (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor('finished')}`}>
                Finished
              </span>
            ) : (
              <div className="space-y-2">
                <select
                  value={event.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(event.status)}`}
                >
                  <option value="planned">Planned</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                  <option value="finished">Finished</option>
                </select>
                {statusError && (
                  <p className="text-sm text-red-600">{statusError}</p>
                )}
              </div>
            )}
            {updateEventStatusMutation.isPending && (
              <span className="text-sm text-gray-500 ml-2">Updating status...</span>
            )}
          </div>
        </div>

        {/* Progress Summary */}
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-500 mr-2" />
            <h2 className="font-semibold text-lg">Progress</h2>
          </div>
          <div className="space-y-4">
            {/* Hours Progress */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Hours Progress</span>
                <div className="flex items-center">
                  <span className={`text-sm font-medium ${getProgressTextColor(hoursProgress)}`}>
                    {totalHours} / {totalEstimatedHours} hours
                  </span>
                  <span className={`ml-2 text-sm font-medium ${getProgressTextColor(hoursProgress)}`}>
                    ({hoursProgress.toFixed(1)}%)
                  </span>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-300 ${getProgressColor(hoursProgress)}`}
                  style={{ width: `${Math.min(hoursProgress, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Task Completion Progress */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">Task Completion</span>
                <span className="text-sm font-medium text-green-600">
                  {taskCompletionPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-green-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(taskCompletionPercentage, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-6">Tasks</h2>
        <div className="space-y-4">
          {tasks.map(task => {
            const [amount, ...unitParts] = task.amount.split(' ');
            const totalAmount = parseFloat(amount);
            const unit = unitParts.join(' ');
            const percentComplete = (task.progress_completed / totalAmount) * 100;
            const hoursPercent = (task.hours_spent / task.hours_worked) * 100;
            const isCompleted = percentComplete >= 100;

            return (
              <div
                key={task.id}
                className="border p-4 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">
                      {task.task_name ? (
                        <>
                          {task.task_name}
                          <span className="text-sm text-gray-500 ml-2">({task.name})</span>
                        </>
                      ) : (
                        task.name || task.amount
                      )}
                    </h3>
                    <div className="flex items-center mt-1 space-x-4">
                      <p className="text-sm text-gray-600">
                        Progress: {task.progress_completed} {unit} / {task.amount}
                        <span className="ml-2 font-medium text-green-600">
                          ({percentComplete.toFixed(1)}%)
                        </span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Hours: {parseFloat(task.hours_spent.toFixed(2))} / {parseFloat(task.hours_worked.toFixed(2))}
                        <span className={`ml-2 font-medium ${getProgressTextColor(hoursPercent)}`}>
                          ({hoursPercent.toFixed(1)}%)
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 rounded text-sm ${
                      isCompleted 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {isCompleted ? 'Completed' : 'In Progress'}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedTask(task);
                        setShowTaskProgressModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Update Progress
                    </button>
                  </div>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      isCompleted ? 'bg-green-600' : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(percentComplete, 100)}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Materials Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-6">Materials</h2>
        <div className="space-y-4">
          {materials.map(material => {
            const totalDelivered = material.material_deliveries 
              ? material.material_deliveries.reduce((sum, delivery) => sum + (delivery.amount || 0), 0)
              : material.amount;
            const percentDelivered = (totalDelivered / material.total_amount) * 100;
            const isCompleted = percentDelivered >= 100;

            return (
              <div
                key={material.id}
                className="border p-4 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{material.name}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Delivered: {totalDelivered.toFixed(2)} / {material.total_amount.toFixed(2)} {material.unit}
                      <span className="ml-2 font-medium text-green-600">
                        ({percentDelivered.toFixed(1)}%)
                      </span>
                    </p>
                    {material.material_deliveries && material.material_deliveries.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500">Recent deliveries:</p>
                        {material.material_deliveries.slice(0, 3).map((delivery, idx) => (
                          <p key={idx} className="text-xs text-gray-500">
                            {new Date(delivery.delivery_date).toLocaleDateString()}: {delivery.amount} {material.unit}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className={`px-2 py-1 rounded text-sm ${
                      isCompleted 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {isCompleted ? 'Delivered' : 'In Progress'}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedMaterial(material);
                        setShowMaterialProgressModal(true);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Update Progress
                    </button>
                  </div>
                </div>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      isCompleted ? 'bg-green-600' : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(percentDelivered, 100)}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Equipment Section */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold mb-6">Equipment</h2>
        {equipmentError && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
            <AlertCircle className="w-5 h-5 mr-2" />
            {equipmentError}
          </div>
        )}
        <div className="space-y-4">
          {isEquipmentLoading ? (
            <p className="text-center py-4">Loading equipment...</p>
          ) : equipmentUsage.length === 0 ? (
            <p className="text-center py-4">No equipment assigned to this event</p>
          ) : (
            equipmentUsage.map(usage => (
              <div
                key={usage.id}
                className="border p-4 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium">{usage.equipment.name}</h3>
                    <div className="flex items-center mt-1 space-x-4">
                      <p className="text-sm text-gray-600">
                        Type: <span className="capitalize">{usage.equipment.type}</span>
                      </p>
                      <p className="text-sm text-gray-600">
                        Quantity: {usage.quantity} / {usage.equipment.quantity}
                      </p>
                      <p className="text-sm text-gray-600">
                        Period: {format(new Date(usage.start_date), 'MMM dd, yyyy')} - {format(new Date(usage.end_date), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    {releaseEquipmentId === usage.id ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setReleaseEquipmentId(null)}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReleaseEquipment(usage.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                          disabled={releaseEquipmentMutation.isPending}
                        >
                          {releaseEquipmentMutation.isPending ? 'Releasing...' : 'Confirm'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReleaseEquipmentId(usage.id)}
                        className="px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                      >
                        Release Equipment
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Additional Features Section */}
      <AdditionalFeatures eventId={id!} />

      {/* Modals */}
      {showTaskProgressModal && selectedTask && (
        <TaskProgressModal
          task={selectedTask}
          onClose={() => setShowTaskProgressModal(false)}
        />
      )}

      {showMaterialProgressModal && selectedMaterial && (
        <MaterialProgressModal
          material={selectedMaterial}
          onClose={() => setShowMaterialProgressModal(false)}
        />
      )}

      {showHoursModal && (
        <HoursWorkedModal
          eventId={id}
          onClose={() => setShowHoursModal(false)}
        />
      )}
    </div>
  );
};

export default EventDetails;
