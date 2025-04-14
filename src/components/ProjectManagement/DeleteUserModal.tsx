import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { X, Search, AlertCircle, Info } from 'lucide-react';

interface Profile {
  id: string;
  full_name: string;
  role: string;
  is_active?: boolean;
}

interface DeleteUserModalProps {
  onClose: () => void;
}

const DeleteUserModal: React.FC<DeleteUserModalProps> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Fetch all profiles
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles', userSearch],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, full_name, role')
        .order('full_name');
      
      // Apply search filter only if search term is provided
      if (userSearch) {
        query = query.ilike('full_name', `%${userSearch}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Profile[];
    }
  });

  // Soft delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      // First check if user is an Admin
      const { data: userData, error: userError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      
      if (userError) throw userError;
      
      // Prevent deleting Admin users
      if (userData.role === 'Admin' || userData.role === 'boss') {
        throw new Error('Cannot delete Admin or Boss users');
      }
      
      // Instead of deleting, mark the user as inactive
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_active: false,
          deactivated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;
      
      // Return success message
      return `User has been deactivated. Their data and history have been preserved.`;
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setConfirmDelete(null);
      setDeleteError(null);
      setInfoMessage(message);
    },
    onError: (error: Error) => {
      setDeleteError(error.message);
    }
  });

  const handleDeleteClick = (userId: string) => {
    setConfirmDelete(userId);
    setDeleteError(null);
    setInfoMessage(null);
  };

  const confirmDeleteUser = () => {
    if (confirmDelete) {
      deleteUserMutation.mutate(confirmDelete);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b flex-none">
          <h2 className="text-xl font-semibold">Delete User</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {/* Search - Sticky at top */}
          <div className="sticky top-0 bg-white z-10 pb-4 mb-4 border-b">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Search User</label>
              <p className="text-sm text-gray-500">
                Total Users: {profiles.length}
              </p>
            </div>
            <div className="mt-1 relative">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Enter user name"
              />
              <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Note: Deleting a user will preserve all their tasks, events, and other data.
            </p>
          </div>

          {/* Error message */}
          {deleteError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {deleteError}
            </div>
          )}

          {/* Info message */}
          {infoMessage && (
            <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-md flex items-center">
              <Info className="w-5 h-5 mr-2" />
              {infoMessage}
            </div>
          )}

          {/* User List - Scrollable */}
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-center py-4">Loading users...</p>
            ) : profiles.length === 0 ? (
              <p className="text-center py-4">No users found</p>
            ) : (
              profiles.map(profile => (
                <div key={profile.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="font-medium">{profile.full_name}</h3>
                      <p className="text-sm text-gray-500">Role: {profile.role}</p>
                    </div>
                    {confirmDelete === profile.id ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-3 py-1 bg-gray-100 text-gray-800 rounded hover:bg-gray-200"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmDeleteUser}
                          className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                          disabled={deleteUserMutation.isPending}
                        >
                          {deleteUserMutation.isPending ? 'Processing...' : 'Confirm'}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeleteClick(profile.id)}
                        className="px-3 py-1 bg-red-100 text-red-800 rounded hover:bg-red-200"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteUserModal;
