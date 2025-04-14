import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';
import { Plus, Calendar, Package, Loader2, Search, CheckSquare } from 'lucide-react';
import Modal from '../components/Modal';
import { useAuthStore } from '../lib/store';
import BackButton from '../components/BackButton';
import type { Database } from '../lib/database.types';

type Event = Database['public']['Tables']['events']['Row'];
type TaskDone = Database['public']['Tables']['tasks_done']['Row'];
type EventTask = Database['public']['Tables']['event_tasks_with_dynamic_estimates']['Row'];
type Material = Database['public']['Tables']['materials']['Row'];

const Projects = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedTask, setSelectedTask] = useState<EventTask | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [quantity, setQuantity] = useState('');
  const [taskName, setTaskName] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [materialSearch, setMaterialSearch] = useState('');

  // Fetch projects and their associated tasks
  const { data: projects = [], isLoading: isProjectsLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: true });

      if (eventsError) throw eventsError;

      const eventsWithTasks = await Promise.all(
        events.map(async (event) => {
          const { data: tasks, error: tasksError } = await supabase
            .from('tasks_done')
            .select('*')
            .eq('event_id', event.id);

          if (tasksError) {
            console.error('Error fetching tasks:', tasksError);
            return { ...event, tasks: [] };
          }

          return { ...event, tasks: tasks || [] };
        })
      );

      return eventsWithTasks;
    }
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates', taskSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .ilike('name', `%${taskSearch}%`);
      if (error) throw error;
      return data;
    }
  });

  // Fetch materials
  const { data: materials = [] } = useQuery({
    queryKey: ['materials', materialSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('*')
        .ilike('name', `%${materialSearch}%`);
      if (error) throw error;
      return data;
    }
  });

  // Add task mutation
  const addTaskMutation = useMutation({
    mutationFn: async ({ eventId, task, quantity, name }: { eventId: string; task: EventTask; quantity: number; name: string }) => {
      const { error } = await supabase.from('tasks_done').insert({
        event_id: eventId,
        user_id: user?.id,
        name: name || task.name,
        description: task.description,
        amount: `${quantity} ${task.unit}`,
        hours_worked: task.estimated_hours * quantity,
        unit: task.unit,
        is_finished: false
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setShowTaskModal(false);
      setSelectedTask(null);
      setQuantity('');
      setTaskName('');
      setSelectedProject('');
    }
  });

  // Add material mutation
  const addMaterialMutation = useMutation({
    mutationFn: async ({ eventId, material, amount }: { eventId: string; material: Material; amount: number }) => {
      const { error } = await supabase.from('materials_delivered').insert({
        event_id: eventId,
        name: material.name,
        amount: 0,
        total_amount: amount,
        unit: material.unit,
        status: 'pending'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      setShowMaterialModal(false);
      setSelectedMaterial(null);
      setQuantity('');
      setSelectedProject('');
    }
  });

  const handleTaskSubmit = () => {
    if (!selectedProject || !selectedTask || !quantity) return;
    addTaskMutation.mutate({
      eventId: selectedProject,
      task: selectedTask,
      quantity: parseFloat(quantity),
      name: taskName
    });
  };

  const handleMaterialSubmit = () => {
    if (!selectedProject || !selectedMaterial || !quantity) return;
    addMaterialMutation.mutate({
      eventId: selectedProject,
      material: selectedMaterial,
      amount: parseFloat(quantity)
    });
  };

  const getStatusColor = (status: Event['status']) => {
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

  const formatStatus = (status: Event['status']) => {
    return status ? status.replace(/_/g, ' ') : 'Unknown';
  };

  if (isProjectsLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Projects</h1>
        <div className="space-x-4">
          <button
            onClick={() => setShowTaskModal(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Task
          </button>
          <button
            onClick={() => setShowMaterialModal(true)}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Materials
          </button>
        </div>
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-white rounded-lg shadow-lg overflow-hidden hover:shadow-xl transition-shadow cursor-pointer"
            onClick={() => navigate(`/events/${project.id}`)}
          >
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-2">{project.title}</h3>
              <p className="text-gray-600 mb-4">{project.description}</p>
              <div className="flex items-center text-sm text-gray-500 mb-4">
                <Calendar className="w-4 h-4 mr-2" />
                <span>
                  {project.start_date ? format(parseISO(project.start_date), 'MMM dd, yyyy') : 'Date not set'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(project.status)}`}>
                  {formatStatus(project.status)}
                </span>
                {project.has_materials && (
                  <Package className="w-5 h-5 text-gray-400" />
                )}
              </div>
              {project.tasks && project.tasks.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm text-gray-600">
                    Tasks: {project.tasks.length} | Completed: {project.tasks.filter(t => t.is_finished).length}
                  </p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Task Modal */}
      {showTaskModal && (
        <Modal title="Add Task" onClose={() => setShowTaskModal(false)}>
          <div className="flex flex-col h-[calc(90vh-8rem)]">
            <div className="space-y-4 flex-none">
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Project</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="">Select Project</option>
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>{proj.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Search Tasks</label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Search tasks..."
                  />
                  <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                </div>
              </div>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto min-h-0">
              <div className="grid grid-cols-1 gap-3">
                {taskTemplates.map(task => (
                  <div
                    key={task.id}
                    onClick={() => {
                      setSelectedTask(task);
                      setTaskName(task.name);
                    }}
                    className={`p-4 hover:bg-gray-50 rounded-lg cursor-pointer border transition-all ${
                      selectedTask?.id === task.id 
                        ? 'bg-gray-700 border-gray-800 text-white' 
                        : 'border-gray-200 hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className={`font-medium ${selectedTask?.id === task.id ? 'text-white' : 'text-gray-900'}`}>{task.name}</h3>
                        <p className={`text-sm mt-1 ${selectedTask?.id === task.id ? 'text-gray-200' : 'text-gray-600'}`}>{task.description}</p>
                        <div className="flex items-center mt-2 space-x-4">
                          <span className={`text-xs ${selectedTask?.id === task.id ? 'text-gray-300' : 'text-gray-500'}`}>Unit: {task.unit}</span>
                          <span className={`text-xs ${selectedTask?.id === task.id ? 'text-gray-300' : 'text-gray-500'}`}>
                            Est. Hours: {task.estimated_hours} per unit
                          </span>
                        </div>
                      </div>
                      {selectedTask?.id === task.id && (
                        <div className="bg-blue-500 rounded-full p-1">
                          <CheckSquare className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedTask && (
              <div className="mt-4 pt-4 border-t space-y-4 flex-none">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Task Name</label>
                  <div className="mt-1 flex items-center space-x-2">
                    <CheckSquare className="w-5 h-5 text-blue-500 flex-none" />
                    <input
                      type="text"
                      value={taskName}
                      onChange={(e) => setTaskName(e.target.value)}
                      placeholder={selectedTask.name}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Quantity ({selectedTask.unit})
                  </label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder={`Enter quantity in ${selectedTask.unit}`}
                  />
                </div>

                <div className="text-sm text-gray-600 bg-gray-100 p-3 rounded-md">
                  <p className="font-medium text-gray-700 mb-1">Task Details</p>
                  <p>{selectedTask.description}</p>
                  <p className="mt-1">
                    <span className="text-gray-700">Estimated hours per unit:</span>{' '}
                    {selectedTask.estimated_hours}
                  </p>
                </div>

                <button
                  onClick={handleTaskSubmit}
                  disabled={!selectedProject || !selectedTask || !quantity || addTaskMutation.isPending}
                  className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {addTaskMutation.isPending ? 'Adding...' : 'Add Task'}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Materials Modal */}
      {showMaterialModal && (
        <Modal title="Add Materials" onClose={() => setShowMaterialModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Select Project</label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Select Project</option>
                {projects.map((proj) => (
                  <option key={proj.id} value={proj.id}>{proj.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Search Materials</label>
              <div className="relative mt-1">
                <input
                  type="text"
                  value={materialSearch}
                  onChange={(e) => setMaterialSearch(e.target.value)}
                  className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Search materials..."
                />
                <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
              </div>
            </div>
            <div className="mt-4 max-h-60 overflow-y-auto">
              {materials.map(material => (
                <div
                  key={material.id}
                  onClick={() => setSelectedMaterial(material)}
                  className={`p-3 hover:bg-gray-50 rounded-lg cursor-pointer ${
                    selectedMaterial?.id === material.id ? 'bg-blue-50 border-2 border-blue-500' : ''
                  }`}
                >
                  <h3 className="font-medium">{material.name}</h3>
                  <p className="text-sm text-gray-600">{material.description}</p>
                  <p className="text-xs text-gray-500">Unit: {material.unit}</p>
                </div>
              ))}
            </div>
            {selectedMaterial && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Quantity ({selectedMaterial.unit})
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder={`Enter quantity in ${selectedMaterial.unit}`}
                />
              </div>
            )}
            <button
              onClick={handleMaterialSubmit}
              disabled={!selectedProject || !selectedMaterial || !quantity || addMaterialMutation.isPending}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              {addMaterialMutation.isPending ? 'Adding...' : 'Add Material'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default Projects;
