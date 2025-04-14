import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { format, startOfWeek, endOfWeek, subDays, subWeeks } from 'date-fns';
import { X, Search, Clock, Calendar, CheckCircle, AlertCircle, User } from 'lucide-react';

interface WorkerHoursModalProps {
  onClose: () => void;
}

const WeeklyWorkerHoursModal: React.FC<WorkerHoursModalProps> = ({ onClose }) => {
  const [workerName, setWorkerName] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'current' | 'last'>('current');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Get current week (Friday to Thursday)
  const currentFriday = subDays(new Date(), (new Date().getDay() + 2) % 7);
  const startOfCurrentWeek = startOfWeek(currentFriday, { weekStartsOn: 5 });
  const endOfCurrentWeek = endOfWeek(currentFriday, { weekStartsOn: 5 });

  // Get last week
  const lastFriday = subWeeks(currentFriday, 1);
  const startOfLastWeek = startOfWeek(lastFriday, { weekStartsOn: 5 });
  const endOfLastWeek = endOfWeek(lastFriday, { weekStartsOn: 5 });

  // Get selected date range
  const startDate = timeRange === 'current' ? startOfCurrentWeek : startOfLastWeek;
  const endDate = timeRange === 'current' ? endOfCurrentWeek : endOfLastWeek;

  // Fetch all workers
  const { data: workers = [], isLoading: isLoadingWorkers } = useQuery({
    queryKey: ['workers', workerName],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name');
      
      // Apply search filter only if search term is provided
      if (workerName) {
        query = query.ilike('full_name', `%${workerName}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    }
  });

  // Fetch worker hours
  const { data: workerHours = [], isLoading: isLoadingHours } = useQuery({
    queryKey: ['worker_hours', selectedUserId, startDate, endDate],
    queryFn: async () => {
      if (!selectedUserId) return [];

      // First query - keep exactly as is
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select(`
          hours_spent,
          created_at,
          tasks_done (
            name,
            amount
          ),
          events (
            id,
            title
          )
        `)
        .eq('user_id', selectedUserId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Second query - fetch additional task progress
      const { data: additionalData, error: additionalError } = await supabase
        .from('additional_task_progress_entries')
        .select(`
          hours_spent,
          created_at,
          task_id,
          additional_tasks!task_id (
            description,
            events (
              id,
              title
            )
          )
        `)
        .eq('user_id', selectedUserId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (additionalError) throw additionalError;

      // Transform additional data to match the structure
      const transformedAdditional = (additionalData || []).map(entry => ({
        hours_spent: entry.hours_spent,
        created_at: entry.created_at,
        tasks_done: {
          name: entry.additional_tasks?.description || 'Additional Task',
          amount: null
        },
        events: {
          id: entry.additional_tasks?.events?.id,
          title: entry.additional_tasks?.events?.title
        }
      }));

      // Return combined data
      return [...(data || []), ...transformedAdditional];
    },
    enabled: !!selectedUserId
  });

  // Group hours by event
  const hoursByEvent = workerHours.reduce((acc: any, entry) => {
    const eventId = entry.events?.id;
    if (!eventId) return acc;

    if (!acc[eventId]) {
      acc[eventId] = {
        eventTitle: entry.events.title,
        totalHours: 0,
        tasks: {}
      };
    }

    acc[eventId].totalHours += entry.hours_spent;

    const taskName = entry.tasks_done?.name || 'Unknown Task';
    if (!acc[eventId].tasks[taskName]) {
      acc[eventId].tasks[taskName] = 0;
    }
    acc[eventId].tasks[taskName] += entry.hours_spent;

    return acc;
  }, {});

  // Calculate total hours across all events
  const totalHours = Object.values(hoursByEvent).reduce((sum: number, event: any) => sum + event.totalHours, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b flex-none">
          <h2 className="text-xl font-semibold">Weekly Worker Hours</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {/* Time Range Selection - Stays at top */}
          <div className="sticky top-0 bg-white z-10 pb-4 mb-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Select Time Range</label>
              {selectedUserId && (
                <p className="text-sm text-gray-500">
                  Total Hours: {totalHours}
                </p>
              )}
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setTimeRange('current')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  timeRange === 'current'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                This Week
              </button>
              <button
                onClick={() => setTimeRange('last')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  timeRange === 'last'
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Last Week
              </button>
            </div>
            <div className="mt-2 flex items-center text-sm text-gray-600">
              <Calendar className="w-4 h-4 mr-1" />
              <span>
                {format(startDate, 'MMM d, yyyy')} - {format(endDate, 'MMM d, yyyy')}
              </span>
            </div>
          </div>

          {/* Success message */}
          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              {successMessage}
            </div>
          )}

          {/* Error message */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {errorMessage}
            </div>
          )}

          {/* Worker Search */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Worker Name</label>
              <p className="text-sm text-gray-500">
                Total Workers: {workers.length}
              </p>
            </div>
            <div className="mt-1 relative">
              <input
                type="text"
                value={workerName}
                onChange={(e) => {
                  setWorkerName(e.target.value);
                  setSelectedUserId(null);
                }}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500"
                placeholder="Search worker by name"
              />
              <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>

          {/* Workers List */}
          <div className="mb-6">
            {isLoadingWorkers ? (
              <p className="text-center py-4">Loading workers...</p>
            ) : workers.length === 0 ? (
              <p className="text-center py-4">No workers found</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {workers.map(worker => (
                  <div
                    key={worker.id}
                    onClick={() => {
                      setSelectedUserId(worker.id === selectedUserId ? null : worker.id);
                      if (worker.id !== selectedUserId) {
                        setWorkerName(worker.full_name);
                      }
                    }}
                    className={`p-3 rounded-lg cursor-pointer border transition-all ${
                      worker.id === selectedUserId 
                        ? 'bg-gray-700 border-gray-800 text-white' 
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center">
                      <User className={`w-5 h-5 mr-2 ${worker.id === selectedUserId ? 'text-gray-300' : 'text-gray-500'}`} />
                      <div>
                        <p className="font-medium">{worker.full_name}</p>
                        {worker.role && <p className={`text-xs ${worker.id === selectedUserId ? 'text-gray-300' : 'text-gray-500'}`}>Role: {worker.role}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hours Display */}
          {selectedUserId && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium border-b pb-2">Hours Report</h3>
              {isLoadingHours ? (
                <p className="text-center py-4">Loading hours data...</p>
              ) : Object.keys(hoursByEvent).length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg">
                  <Clock className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-600">No hours recorded for this period.</p>
                </div>
              ) : (
                Object.entries(hoursByEvent).map(([eventId, eventData]: [string, any]) => (
                  <div key={eventId} className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-medium text-lg text-gray-700">{eventData.eventTitle}</h3>
                    <p className="text-gray-600 mt-1">
                      <span className="font-semibold text-gray-700">{eventData.totalHours}</span> hours
                    </p>
                    
                    <div className="mt-4 space-y-2">
                      <h4 className="font-medium text-gray-700">Tasks Breakdown:</h4>
                      {Object.entries(eventData.tasks).map(([taskName, hours]: [string, any]) => (
                        <div key={taskName} className="flex justify-between text-sm">
                          <span>{taskName}</span>
                          <span className="font-medium">{hours} hours</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeeklyWorkerHoursModal;
