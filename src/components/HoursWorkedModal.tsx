import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { X } from 'lucide-react';

interface HoursWorkedModalProps {
  eventId: string;
  onClose: () => void;
}

const HoursWorkedModal: React.FC<HoursWorkedModalProps> = ({ eventId, onClose }) => {
  // Fetch task progress entries with user information
  const { data: taskProgress = [], isLoading } = useQuery({
    queryKey: ['task_progress', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_progress_entries')
        .select(`
          hours_spent,
          amount_completed,
          created_at,
          user_id,
          task_id,
          tasks_done (
            name,
            amount
          ),
          profiles (
            full_name
          )
        `)
        .eq('event_id', eventId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group entries by user and task
      const groupedEntries = data.reduce((acc: any, entry) => {
        const userId = entry.user_id;
        const userName = entry.profiles?.full_name || 'Unknown User';
        const taskName = entry.tasks_done?.name || 'Unknown Task';
        
        if (!acc[userId]) {
          acc[userId] = {
            userId,
            userName,
            tasks: {}
          };
        }

        if (!acc[userId].tasks[taskName]) {
          acc[userId].tasks[taskName] = {
            totalHours: 0,
            totalCompleted: 0,
            unit: entry.tasks_done?.amount?.split(' ')[1] || 'units'
          };
        }

        acc[userId].tasks[taskName].totalHours += entry.hours_spent;
        acc[userId].tasks[taskName].totalCompleted += entry.amount_completed;

        return acc;
      }, {});

      return groupedEntries;
    }
  });

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
        <div className="bg-white rounded-lg p-6">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  const totalHours = Object.values(taskProgress).reduce((sum: number, user: any) => {
    return sum + Object.values(user.tasks).reduce((taskSum: number, task: any) => {
      return taskSum + task.totalHours;
    }, 0);
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Hours Worked</h2>
            <p className="text-sm text-gray-600 mt-1">Total Hours: {totalHours}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {Object.keys(taskProgress).length > 0 ? (
            <div className="space-y-6">
              {Object.entries(taskProgress).map(([userId, userData]: [string, any]) => (
                <div key={userId} className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-lg text-gray-900">{userData.userName}</h3>
                  
                  <div className="mt-4 space-y-3">
                    {Object.entries(userData.tasks).map(([taskName, taskData]: [string, any]) => (
                      <div key={taskName} className="bg-white p-3 rounded-md shadow-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-800">{taskName}</p>
                            <p className="text-sm text-gray-600">
                              Completed: {taskData.totalCompleted} {taskData.unit}
                            </p>
                          </div>
                          <span className="text-blue-600 font-medium">
                            {taskData.totalHours} hours
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-600">No hours recorded yet.</p>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HoursWorkedModal;
