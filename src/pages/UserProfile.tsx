import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { useNavigate } from 'react-router-dom';
import { User, LogOut, Save, AlertCircle, Loader2, BarChart, ClipboardList, Package, FileText, Truck } from 'lucide-react';
import BackButton from '../components/BackButton';
import TaskPerformanceModal from '../components/TaskPerformanceModal';
import AdditionalTasksModal from '../components/AdditionalTasksModal';
import MaterialAddedModal from '../components/MaterialAddedModal';
import AdditionalMaterialsModal from '../components/AdditionalMaterialsModal';
import DayNotesModal from '../components/DayNotesModal';

const UserProfile = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, setProfile } = useAuthStore();
  const [newName, setNewName] = useState(profile?.full_name || '');
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modal states
  const [showTaskPerformanceModal, setShowTaskPerformanceModal] = useState(false);
  const [showAdditionalTasksModal, setShowAdditionalTasksModal] = useState(false);
  const [showMaterialAddedModal, setShowMaterialAddedModal] = useState(false);
  const [showAdditionalMaterialsModal, setShowAdditionalMaterialsModal] = useState(false);
  const [showDayNotesModal, setShowDayNotesModal] = useState(false);

  // Update user name mutation
  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: newName })
        .eq('id', user.id)
        .select('*')
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Update the profile in the store
      if (profile) {
        setProfile({
          ...profile,
          full_name: data.full_name
        });
      }
      
      setIsEditing(false);
      setSuccess('Name updated successfully');
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
      
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: (error: any) => {
      setError(error.message || 'Failed to update name');
    }
  });

  const handleUpdateName = () => {
    if (!newName.trim()) {
      setError('Name cannot be empty');
      return;
    }
    
    setError(null);
    updateNameMutation.mutate(newName);
  };

  const handleAbandonTeam = () => {
    // This is just a placeholder button as requested
    console.log('Abandon team button clicked');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center mb-6">
        <BackButton />
        <h1 className="text-2xl font-bold ml-2">User Profile</h1>
      </div>

      {/* User Info Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="h-16 w-16 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              <User className="h-8 w-8 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="ml-4">
              {isEditing ? (
                <div className="flex items-center">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="border rounded-md px-3 py-2 text-lg font-medium dark:bg-gray-700 dark:border-gray-600"
                    placeholder="Enter your name"
                  />
                  <button
                    onClick={handleUpdateName}
                    className="ml-2 p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                    disabled={updateNameMutation.isPending}
                  >
                    {updateNameMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Save className="h-5 w-5" />
                    )}
                  </button>
                </div>
              ) : (
                <h2 className="text-xl font-semibold">{profile?.full_name || 'User'}</h2>
              )}
              <p className="text-gray-600 dark:text-gray-400">{profile?.email}</p>
              <p className="text-sm text-gray-500 dark:text-gray-500">Role: {profile?.role}</p>
            </div>
          </div>
          
          <div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Change Name
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md flex items-center">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md">
            {success}
          </div>
        )}

        {/* First row of buttons - original style */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <button
            onClick={handleAbandonTeam}
            className="px-4 py-3 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors"
          >
            Abandon Team
          </button>
          
          <button
            onClick={handleLogout}
            className="px-4 py-3 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors flex items-center justify-center"
          >
            <LogOut className="h-5 w-5 mr-2" />
            Logout
          </button>
        </div>
      </div>

      {/* Feature Cards - ProjectManagement style */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Task Performance Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <BarChart className="w-6 h-6 text-blue-600 mr-3" />
            <h2 className="text-xl font-semibold">Your Task Performance</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            View your task performance metrics and efficiency.
          </p>
          <button
            onClick={() => setShowTaskPerformanceModal(true)}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
          >
            View Performance
          </button>
        </div>

        {/* Additional Tasks Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <ClipboardList className="w-6 h-6 text-green-600 mr-3" />
            <h2 className="text-xl font-semibold">Additional Tasks</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            View tasks you've added to projects.
          </p>
          <button
            onClick={() => setShowAdditionalTasksModal(true)}
            className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
          >
            View Tasks
          </button>
        </div>

        {/* Material Added Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Truck className="w-6 h-6 text-purple-600 mr-3" />
            <h2 className="text-xl font-semibold">Material Added</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            View materials you've delivered with notes.
          </p>
          <button
            onClick={() => setShowMaterialAddedModal(true)}
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
          >
            View Materials
          </button>
        </div>

        {/* Additional Materials Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <Package className="w-6 h-6 text-indigo-600 mr-3" />
            <h2 className="text-xl font-semibold">Additional Materials</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            View additional materials you've created.
          </p>
          <button
            onClick={() => setShowAdditionalMaterialsModal(true)}
            className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            View Materials
          </button>
        </div>

        {/* Day Notes Card */}
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg">
          <div className="flex items-center mb-4">
            <FileText className="w-6 h-6 text-teal-600 mr-3" />
            <h2 className="text-xl font-semibold">Day Notes</h2>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            View notes you've added to project days.
          </p>
          <button
            onClick={() => setShowDayNotesModal(true)}
            className="w-full bg-teal-600 text-white py-2 px-4 rounded-lg hover:bg-teal-700 transition-colors"
          >
            View Notes
          </button>
        </div>
      </div>
      
      {/* Modals */}
      {showTaskPerformanceModal && (
        <TaskPerformanceModal onClose={() => setShowTaskPerformanceModal(false)} />
      )}
      
      {showAdditionalTasksModal && (
        <AdditionalTasksModal onClose={() => setShowAdditionalTasksModal(false)} />
      )}
      
      {showMaterialAddedModal && (
        <MaterialAddedModal onClose={() => setShowMaterialAddedModal(false)} />
      )}
      
      {showAdditionalMaterialsModal && (
        <AdditionalMaterialsModal onClose={() => setShowAdditionalMaterialsModal(false)} />
      )}
      
      {showDayNotesModal && (
        <DayNotesModal onClose={() => setShowDayNotesModal(false)} />
      )}
    </div>
  );
};

export default UserProfile;
