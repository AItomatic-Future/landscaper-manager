import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Loader2, Search, X, ClipboardList, Trash2 } from 'lucide-react';
import { Database } from '../types/supabase';

interface AdditionalTask {
  id: string;
  event_id: string;
  user_id: string;
  description?: string;
  date?: string;
  created_at: string;
  eventTitle?: string;
}

interface AdditionalTasksModalProps {
  eventId: string;
  onClose: () => void;
}

interface DeleteConfirmationProps {
  recordId: string;
  recordType: string;
  recordName: string;
  onCancel: () => void;
  onConfirm: () => void;
}

type TaskDone = Database['public']['Tables']['tasks_done']['Row'];
type TaskProgressEntry = Database['public']['Tables']['task_progress_entries']['Row'];

// Confirmation dialog component
const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({ 
  recordId, 
  recordType, 
  recordName, 
  onCancel, 
  onConfirm 
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
        <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
        <p className="mb-6">Do you want to delete this record?</p>
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          <strong>Type:</strong> {recordType}<br />
          <strong>Name:</strong> {recordName}
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            No
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
};

const AdditionalTasksModal: React.FC<AdditionalTasksModalProps> = ({ eventId, onClose }) => {
  const { user } = useAuthStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    recordId: string;
    recordName: string;
  }>({ isOpen: false, recordId: '', recordName: '' });
  const [showRequestSent, setShowRequestSent] = useState(false);
  
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['additional_tasks', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      
      const { data, error } = await supabase
        .from('additional_tasks')
        .select(`
          *,
          events (
            id,
            title
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id
  });

  // Mutation to create deletion request
  const createDeletionRequest = useMutation({
    mutationFn: async (recordId: string) => {
      const task = tasks.find(t => t.id === recordId);
      if (!task) throw new Error('Record not found');
      
      const { error } = await supabase
        .from('deletion_requests')
        .insert({
          user_id: user?.id,
          record_id: recordId,
          record_type: 'additional_tasks',
          record_details: {
            description: task.description || 'No description',
            project: task.events?.title || 'Unknown Project',
            created_at: new Date(task.created_at).toLocaleString()
          },
          status: 'pending'
        });
      
      if (error) {
        console.error('Error creating deletion request:', error);
        throw error;
      }
      setShowRequestSent(true);
      return recordId;
    },
    onSuccess: () => {
      setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' });
    },
    onError: (error) => {
      console.error('Failed to create deletion request:', error);
      alert('Failed to create deletion request. Please try again.');
    }
  });

  // Handle delete button click
  const handleDeleteClick = (recordId: string, recordName: string) => {
    setDeleteConfirmation({
      isOpen: true,
      recordId,
      recordName
    });
  };

  // Handle confirmation
  const handleConfirmDelete = () => {
    if (deleteConfirmation.recordId) {
      createDeletionRequest.mutate(deleteConfirmation.recordId);
    }
  };

  // Filter tasks based on search term
  const filteredTasks = searchTerm 
    ? tasks.filter(task => {
        return (
          (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (task.events?.title && task.events.title.toLowerCase().includes(searchTerm.toLowerCase()))
        );
      })
    : tasks;

  // New state variables for progress tracking
  const [selectedTask, setSelectedTask] = useState<TaskDone | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [hoursWorked, setHoursWorked] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [showProgressForm, setShowProgressForm] = useState(false);
  
  // Fetch tasks
  useEffect(() => {
    fetchTasks();
  }, [eventId]);
  
  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .eq('event_id', eventId);
        
      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Add new task function
  const addTask = async () => {
    if (!newTask.trim()) return;
    
    try {
      // Create a new task_done record
      const { data: taskData, error: taskError } = await supabase
        .from('tasks_done')
        .insert({
          name: newTask,
          event_id: eventId,
          created_at: new Date().toISOString(),
          is_finished: false,
          amount: '100 percent', // Default value
          hours_worked: 0,
          unit: 'percent',
          description: 'Additional task'
        })
        .select();
        
      if (taskError) throw taskError;
      
      // Create event_tasks record using the ID generated by the database
      if (taskData && taskData[0]) {
        const { error: eventTaskError } = await supabase
          .from('event_tasks')
          .insert({
            event_id: eventId,
            task_id: taskData[0].id
          });
          
        if (eventTaskError) throw eventTaskError;
      }
      
      setNewTask('');
      fetchTasks(); // Refresh the task list
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };
  
  // Update progress function
  const updateProgress = async () => {
    if (!selectedTask) return;
    
    try {
      // Update the task_done record
      const { error: updateError } = await supabase
        .from('tasks_done')
        .update({
          hours_worked: hoursWorked,
          is_finished: progress === 100,
          amount: `${progress} percent`
        })
        .eq('id', selectedTask.id);
        
      if (updateError) throw updateError;
      
      // Add entry to task_progress_entries
      const { error: progressError } = await supabase
        .from('task_progress_entries')
        .insert({
          task_id: selectedTask.id,
          progress_percentage: progress,
          hours_worked: hoursWorked,
          notes: notes,
          created_at: new Date().toISOString()
        });
        
      if (progressError) throw progressError;
      
      // Reset form and refresh tasks
      setShowProgressForm(false);
      setSelectedTask(null);
      setProgress(0);
      setHoursWorked(0);
      setNotes('');
      fetchTasks();
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };
  
  // Function to open progress form for a task
  const openProgressForm = (task: TaskDone) => {
    setSelectedTask(task);
    // Extract current progress from task.amount (e.g., "50 percent" -> 50)
    const currentProgress = parseInt(task.amount?.split(' ')[0] || '0');
    setProgress(currentProgress);
    setHoursWorked(0); // Reset hours worked
    setNotes(''); // Reset notes
    setShowProgressForm(true);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
            <h2 className="text-xl font-semibold flex items-center">
              <ClipboardList className="w-5 h-5 mr-2 text-blue-500" />
              Additional Tasks
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b dark:border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search tasks by description or project..."
                className="w-full pl-10 pr-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex justify-center p-6">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : filteredTasks.length > 0 ? (
              <div className="space-y-4">
                {filteredTasks.map((task) => (
                  <div key={task.id} className="border dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-750">
                    <div className="flex justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium text-lg text-gray-900 dark:text-gray-100 mb-2">
                          {task.description || 'No description'}
                        </h3>
                        <p className="text-gray-700 dark:text-gray-300 mb-1">
                          Project: <span className="font-medium">{task.events?.title || 'Unknown Project'}</span>
                        </p>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Added on {new Date(task.created_at).toLocaleDateString()} at {new Date(task.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteClick(
                          task.id, 
                          task.description || 'No description'
                        )}
                        className="text-red-600 hover:text-red-800 font-medium flex items-center h-fit"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        DELETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {searchTerm ? "No tasks match your search." : "You haven't added any additional tasks yet."}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation.isOpen && (
        <DeleteConfirmation
          recordId={deleteConfirmation.recordId}
          recordType="Additional Task"
          recordName={deleteConfirmation.recordName}
          onCancel={() => setDeleteConfirmation({ isOpen: false, recordId: '', recordName: '' })}
          onConfirm={handleConfirmDelete}
        />
      )}

      {showRequestSent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-sm w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Success
              </h3>
              <button
                onClick={() => setShowRequestSent(false)}
                className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              Your deletion request has been sent.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setShowRequestSent(false)}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress update form */}
      {showProgressForm && selectedTask && (
        <div>
          <h3 className="font-medium mb-3">Update Progress: {selectedTask.name}</h3>
          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Progress (%)
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hours Worked
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={hoursWorked}
              onChange={(e) => setHoursWorked(Number(e.target.value))}
              className="w-full p-2 border rounded-md"
            />
          </div>
          
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded-md"
              rows={3}
            />
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={updateProgress}
              className="bg-blue-500 text-white px-4 py-2 rounded-md flex-1"
            >
              Save Progress
            </button>
            <button
              onClick={() => setShowProgressForm(false)}
              className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AdditionalTasksModal;
