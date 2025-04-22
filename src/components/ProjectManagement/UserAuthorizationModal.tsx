import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { X, Search, CheckCircle, AlertCircle } from 'lucide-react';

interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'project_manager' | 'Team_Leader' | 'Admin';
}

interface UserAuthorizationModalProps {
  onClose: () => void;
}

const UserAuthorizationModal: React.FC<UserAuthorizationModalProps> = ({ onClose }) => {
  const queryClient = useQueryClient();
  const [userSearch, setUserSearch] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Fetch profiles - exclude Admin users
  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ['profiles', userSearch],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('id, email, full_name, role')
        .neq('role', 'Admin') // Exclude Admin users
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

  // Update role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role, userName }: { userId: string; role: Profile['role']; userName: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId);

      if (error) throw error;
      
      return { role, userName };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setUpdateSuccess(`${data.userName}'s role has been updated to ${data.role}.`);
      setUpdateError(null);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setUpdateSuccess(null);
      }, 3000);
    },
    onError: (error: Error) => {
      setUpdateError(error.message);
      setUpdateSuccess(null);
    }
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b flex-none">
          <h2 className="text-xl font-semibold">User Authorization</h2>
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
              Note: Admin users are not shown in this list.
            </p>
          </div>

          {/* Success message */}
          {updateSuccess && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-md flex items-center">
              <CheckCircle className="w-5 h-5 mr-2" />
              {updateSuccess}
            </div>
          )}

          {/* Error message */}
          {updateError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md flex items-center">
              <AlertCircle className="w-5 h-5 mr-2" />
              {updateError}
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
                      <p className="text-sm text-gray-600">{profile.email}</p>
                      <p className="text-sm text-gray-500">Current Role: <span className="font-medium text-gray-700">{profile.role}</span></p>
                    </div>
                    <div>
                      <select
                        value={profile.role}
                        onChange={(e) => {
                          updateRoleMutation.mutate({
                            userId: profile.id,
                            role: e.target.value as Profile['role'],
                            userName: profile.full_name
                          });
                        }}
                        className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2"
                      >
                        <option value="user">User</option>
                        <option value="project_manager">Project Manager</option>
                        <option value="Team_Leader">Team Leader</option>
                      </select>
                    </div>
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

export default UserAuthorizationModal;
