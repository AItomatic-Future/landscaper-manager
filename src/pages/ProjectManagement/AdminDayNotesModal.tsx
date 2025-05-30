import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { X, Trash2, ChevronDown, ChevronUp, User, Calendar, AlertCircle } from 'lucide-react';

interface DayNoteRecord {
  id: string;
  user_id: string;
  event_id: string;
  content: string;  // This will be displayed as the description
  created_at: string;
  event_title?: string;
}

interface UserGroup {
  user_id: string;
  user_name: string;
  records: DayNoteRecord[];
}

interface AdminDayNotesModalProps {
  onClose: () => void;
}

const AdminDayNotesModal: React.FC<AdminDayNotesModalProps> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const [expandedUsers, setExpandedUsers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState<{recordId: string, recordDate: string} | null>(null);

  // Fetch all day notes records
  const { data: userGroups = [], isLoading, isError } = useQuery({
    queryKey: ['admin_day_notes_records'],
    queryFn: async () => {
      console.log('Fetching all day notes records');
      
      // Fetch all day notes with event titles
      const { data: records, error } = await supabase
        .from('day_notes')
        .select(`
          id,
          user_id,
          event_id,
          content,
          created_at,
          events(title)
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching day notes records:', error);
        throw error;
      }
      
      console.log(`Found ${records?.length || 0} day notes records`);
      if (records && records.length > 0) {
        console.log('Sample record:', records[0]);
      }
      
      // Fetch all profiles to get user names
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name');
      
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }
      
      // Create a map of user IDs to names
      const userMap: Record<string, string> = {};
      profiles?.forEach(profile => {
        userMap[profile.id] = profile.full_name || 'Unknown User';
      });
      
      // Process records to include event title
      const processedRecords = records.map(record => {
        // Check the structure of the joined data
        let eventTitle = 'Unknown Event';
        
        if (record.events && typeof record.events === 'object') {
          if (Array.isArray(record.events) && record.events.length > 0) {
            eventTitle = record.events[0].title || 'Unknown Event';
          } else if (record.events.title) {
            eventTitle = record.events.title;
          }
        }
        
        return {
          ...record,
          event_title: eventTitle
        };
      });
      
      // Group records by user
      const groupedByUser: Record<string, UserGroup> = {};
      
      processedRecords.forEach(record => {
        const userId = record.user_id;
        if (!userId) return;
        
        if (!groupedByUser[userId]) {
          groupedByUser[userId] = {
            user_id: userId,
            user_name: userMap[userId] || 'Unknown User',
            records: []
          };
        }
        
        groupedByUser[userId].records.push(record as DayNoteRecord);
      });
      
      // Convert to array and sort by user name
      return Object.values(groupedByUser).sort((a, b) => 
        a.user_name.localeCompare(b.user_name)
      );
    }
  });

  // Delete record mutation
  const deleteRecord = useMutation({
    mutationFn: async (recordId: string) => {
      console.log(`Deleting day note record: ${recordId}`);
      
      const { error } = await supabase
        .from('day_notes')
        .delete()
        .eq('id', recordId);
      
      if (error) {
        console.error('Error deleting record:', error);
        throw error;
      }
      
      return recordId;
    },
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['admin_day_notes_records'] });
      setDeleteConfirmation(null);
    }
  });

  // Toggle user expansion
  const toggleUserExpand = (userId: string) => {
    setExpandedUsers(prev => 
      prev.includes(userId) 
        ? prev.filter(id => id !== userId) 
        : [...prev, userId]
    );
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  // Filter user groups based on search term
  const filteredUserGroups = searchTerm
    ? userGroups.map(group => ({
        ...group,
        records: group.records.filter(record => {
          const searchLower = searchTerm.toLowerCase();
          return (
            record.content?.toLowerCase().includes(searchLower) ||
            record.event_title?.toLowerCase().includes(searchLower)
          );
        })
      })).filter(group => group.records.length > 0)
    : userGroups;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-xl font-semibold flex items-center">
            <Trash2 className="w-5 h-5 mr-2 text-red-500" />
            Delete Day Notes Records
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
          <input
            type="text"
            placeholder="Search day notes..."
            className="w-full px-4 py-2 border dark:border-gray-600 rounded-lg dark:bg-gray-700"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex justify-center p-6">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <p className="text-red-500 dark:text-red-400 text-center">
                Error loading day notes records.
              </p>
            </div>
          ) : filteredUserGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <AlertCircle className="w-12 h-12 text-gray-400 mb-4" />
              <p className="text-gray-500 dark:text-gray-400 text-center">
                {searchTerm ? "No records match your search." : "No day notes records found."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredUserGroups.map((group) => (
                <div 
                  key={group.user_id} 
                  className="border dark:border-gray-700 rounded-lg overflow-hidden"
                >
                  {/* User header */}
                  <div 
                    className="bg-gray-50 dark:bg-gray-700 p-4 flex justify-between items-center cursor-pointer"
                    onClick={() => toggleUserExpand(group.user_id)}
                  >
                    <div className="flex items-center">
                      <User className="w-5 h-5 mr-2 text-blue-500" />
                      <span className="font-medium">{group.user_name}</span>
                      <span className="ml-2 text-sm text-gray-500">
                        ({group.records.length} note{group.records.length !== 1 ? 's' : ''})
                      </span>
                    </div>
                    {expandedUsers.includes(group.user_id) ? (
                      <ChevronUp className="w-5 h-5 text-gray-500" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-500" />
                    )}
                  </div>
                  
                  {/* User records */}
                  {expandedUsers.includes(group.user_id) && (
                    <div className="divide-y dark:divide-gray-700">
                      {group.records.map((record) => (
                        <div key={record.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-750">
                          <div className="flex justify-between">
                            <div className="flex-1 pr-4">
                              <div className="flex items-center text-gray-500 mb-2">
                                <Calendar className="w-4 h-4 mr-1" />
                                {formatDate(record.created_at)}
                              </div>
                              {record.event_title && (
                                <div className="mb-2">
                                  <span className="font-medium">Project:</span> {record.event_title}
                                </div>
                              )}
                              <div className="mt-2">
                                <span className="font-medium">Description:</span>
                                <div className="mt-1 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                  {record.content || 'No description provided'}
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={() => setDeleteConfirmation({
                                recordId: record.id,
                                recordDate: formatDate(record.created_at)
                              })}
                              className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full h-fit"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4">Confirm Deletion</h3>
            <p className="mb-6">
              Are you sure you want to delete this record? It will be gone from statistics as well.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setDeleteConfirmation(null)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteRecord.mutate(deleteConfirmation.recordId)}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                disabled={deleteRecord.isPending}
              >
                {deleteRecord.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDayNotesModal;
