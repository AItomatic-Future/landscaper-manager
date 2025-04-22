import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { format, parseISO, eachWeekOfInterval, startOfWeek, endOfWeek } from 'date-fns';
import { Search, Calendar as CalendarIcon } from 'lucide-react';
import BackButton from '../../components/BackButton';

const ProjectPerformance = () => {
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState<'single' | 'weekly' | 'range'>('range');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: '', end: '' });
  const [allowOutOfRangeSelection, setAllowOutOfRangeSelection] = useState<boolean>(false);
  const [weeks, setWeeks] = useState<{ start: Date; end: Date }[]>([]);

  // Fetch projects with custom ordering
  const { data: projects = [] } = useQuery({
    queryKey: ['projects', projectSearch],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_date, end_date, status')
        .ilike('title', `%${projectSearch}%`)
        .order('status', { 
          ascending: true,
          nullsLast: true,
          foreignTable: null,
          // Custom ordering: in_progress, finished, scheduled, planned
          options: {
            orderBy: [
              { column: 'status', order: 'asc', transform: (status) => {
                switch (status) {
                  case 'in_progress': return 1;
                  case 'finished': return 2;
                  case 'scheduled': return 3;
                  case 'planned': return 4;
                  default: return 5;
                }
              }}
            ]
          }
        });

      if (error) throw error;

      // Additional client-side sorting to ensure correct order
      return data.sort((a, b) => {
        const order = {
          'in_progress': 1,
          'finished': 2,
          'scheduled': 3,
          'planned': 4
        };
        return (order[a.status] || 5) - (order[b.status] || 5);
      });
    }
  });

  // Calculate weeks when project is selected
  useEffect(() => {
    if (selectedProject) {
      const project = projects.find(p => p.id === selectedProject);
      if (project) {
        const startDate = parseISO(project.start_date);
        const endDate = parseISO(project.end_date);
        
        const weeksList = eachWeekOfInterval(
          { start: startDate, end: endDate },
          { weekStartsOn: 1 }
        ).map(weekStart => ({
          start: weekStart,
          end: endOfWeek(weekStart, { weekStartsOn: 1 })
        }));

        setWeeks(weeksList);
        
        // Set initial date range to project dates
        setDateRange({
          start: project.start_date,
          end: project.end_date
        });
      }
    }
  }, [selectedProject, projects]);

  // Fetch project data
  const { data: performanceData = null } = useQuery({
    queryKey: ['project_performance', selectedProject, selectedTimeRange, selectedDate, selectedWeek, dateRange],
    queryFn: async () => {
      if (!selectedProject) return null;

      let startDate, endDate;

      if (selectedTimeRange === 'single') {
        if (!selectedDate) return null;
        startDate = selectedDate;
        endDate = selectedDate;
      } else if (selectedTimeRange === 'weekly') {
        if (!selectedWeek) return null;
        const [start, end] = selectedWeek.split('|');
        startDate = start;
        endDate = end;
      } else {
        if (!dateRange.start || !dateRange.end) return null;
        startDate = dateRange.start;
        endDate = dateRange.end;
      }

      // Fetch hours data
      const { data: hoursData, error: hoursError } = await supabase
        .from('task_progress_entries')
        .select(`
          user_id,
          task_id,
          hours_spent,
          tasks_done (
            name,
            amount
          ),
          profiles (
            full_name
          )
        `)
        .eq('event_id', selectedProject)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (hoursError) throw hoursError;

      // Fetch additional tasks
      const { data: additionalTasks, error: tasksError } = await supabase
        .from('additional_tasks')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('event_id', selectedProject)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (tasksError) throw tasksError;

      // Fetch additional materials
      const { data: additionalMaterials, error: materialsError } = await supabase
        .from('additional_materials')
        .select(`
          *,
          profiles (
            full_name
          )
        `)
        .eq('event_id', selectedProject)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`);

      if (materialsError) throw materialsError;

      // Process hours data
      const totalProjectHours = hoursData.reduce((sum, item) => sum + item.hours_spent, 0);
      
      // Group hours by user
      const hoursByUser = hoursData.reduce((acc: any, item) => {
        const userId = item.user_id;
        if (!acc[userId]) {
          acc[userId] = {
            userName: item.profiles?.full_name,
            totalHours: 0,
            taskHours: {}
          };
        }
        acc[userId].totalHours += item.hours_spent;

        // Group by task
        const taskName = item.tasks_done?.name || 'Unknown Task';
        if (!acc[userId].taskHours[taskName]) {
          acc[userId].taskHours[taskName] = 0;
        }
        acc[userId].taskHours[taskName] += item.hours_spent;

        return acc;
      }, {});

      return {
        totalHours: totalProjectHours,
        byUser: hoursByUser,
        additionalTasks,
        additionalMaterials
      };
    },
    enabled: !!selectedProject
  });

  const selectedProject_data = selectedProject ? projects.find(p => p.id === selectedProject) : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'finished':
        return 'bg-green-100 text-green-800';
      case 'scheduled':
        return 'bg-gray-700 text-white';
      case 'planned':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <h1 className="text-3xl font-bold text-gray-900">Project Performance</h1>

      {/* Project Selection */}
      <div className="bg-white p-6 rounded-lg shadow-lg">
        <label className="block text-sm font-medium text-gray-700">Search Project</label>
        <div className="mt-1 relative">
          <input
            type="text"
            value={projectSearch}
            onChange={(e) => setProjectSearch(e.target.value)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500"
            placeholder="Enter project name"
          />
          <Search className="absolute right-3 top-2.5 h-5 w-5 text-gray-400" />
        </div>

        {projects.length > 0 && (
          <div className="mt-4 h-[400px] overflow-y-auto pr-2">
            <div className="space-y-2">
              {projects.map(project => (
                <div
                  key={project.id}
                  onClick={() => setSelectedProject(project.id)}
                  className={`p-4 hover:bg-gray-50 cursor-pointer rounded-lg border transition-all ${
                    selectedProject === project.id ? 'bg-gray-700 border-gray-800 text-white' : 'border-gray-200'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{project.title}</h3>
                      <p className={`text-sm ${selectedProject === project.id ? 'text-gray-300' : 'text-gray-600'}`}>
                        {format(parseISO(project.start_date), 'MMM d, yyyy')} - {format(parseISO(project.end_date), 'MMM d, yyyy')}
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-sm rounded-full ${getStatusColor(project.status)}`}>
                      {project.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selectedProject && (
        <>
          {/* Time Range Selection */}
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <div className="flex space-x-4 mb-6">
              <button
                onClick={() => {
                  setSelectedTimeRange('single');
                  setSelectedWeek('');
                  setDateRange({ start: '', end: '' });
                }}
                className={`px-4 py-2 rounded-lg ${
                  selectedTimeRange === 'single' ? 'bg-gray-700 text-white' : 'bg-gray-100'
                }`}
              >
                Single Day
              </button>
              <button
                onClick={() => {
                  setSelectedTimeRange('weekly');
                  setSelectedDate('');
                  setDateRange({ start: '', end: '' });
                }}
                className={`px-4 py-2 rounded-lg ${
                  selectedTimeRange === 'weekly' ? 'bg-gray-700 text-white' : 'bg-gray-100'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => {
                  setSelectedTimeRange('range');
                  setSelectedDate('');
                  setSelectedWeek('');
                }}
                className={`px-4 py-2 rounded-lg ${
                  selectedTimeRange === 'range' ? 'bg-gray-700 text-white' : 'bg-gray-100'
                }`}
              >
                Date Range
              </button>
            </div>

            {/* Date Selection based on time range */}
            {selectedTimeRange === 'single' && (
              <div>
                <label className="block text-sm font-medium text-gray-700">Select Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  min={selectedProject_data?.start_date}
                  max={selectedProject_data?.end_date}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500"
                />
              </div>
            )}

            {selectedTimeRange === 'weekly' && (
              <div className="max-h-48 overflow-y-auto">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Week</label>
                {weeks.map((week, index) => (
                  <div
                    key={index}
                    onClick={() => setSelectedWeek(`${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`)}
                    className={`p-2 rounded-lg cursor-pointer hover:bg-gray-50 ${
                      selectedWeek === `${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`
                        ? 'bg-gray-700 border border-gray-800 text-white'
                        : ''
                    }`}
                  >
                    <div className="flex items-center">
                      <CalendarIcon className={`w-4 h-4 mr-2 ${
                        selectedWeek === `${format(week.start, 'yyyy-MM-dd')}|${format(week.end, 'yyyy-MM-dd')}`
                          ? 'text-gray-300'
                          : 'text-gray-500'
                      }`} />
                      <span>
                        {format(week.start, 'MMM d')} - {format(week.end, 'MMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedTimeRange === 'range' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="date"
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    min={allowOutOfRangeSelection ? undefined : selectedProject_data?.start_date}
                    max={allowOutOfRangeSelection ? undefined : selectedProject_data?.end_date}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date</label>
                  <input
                    type="date"
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    min={dateRange.start}
                    max={allowOutOfRangeSelection ? undefined : selectedProject_data?.end_date}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-500 focus:ring-gray-500"
                  />
                </div>
                <div className="col-span-2 mt-2">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="allowOutOfRangeSelection"
                      checked={allowOutOfRangeSelection}
                      onChange={(e) => setAllowOutOfRangeSelection(e.target.checked)}
                      className="h-4 w-4 text-gray-600 rounded border-gray-300 focus:ring-gray-500"
                    />
                    <label htmlFor="allowOutOfRangeSelection" className="ml-2 text-sm text-gray-600">
                      Allow dates outside project range
                    </label>
                  </div>
                  {allowOutOfRangeSelection && (
                    <div className="mt-1 p-2 bg-gray-100 rounded-md text-xs text-gray-600">
                      <p>Project date range: {selectedProject_data ? format(parseISO(selectedProject_data.start_date), 'MMM d, yyyy') : ''} - {selectedProject_data ? format(parseISO(selectedProject_data.end_date), 'MMM d, yyyy') : ''}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {performanceData && (
            <>
              {/* Hours Overview Section */}
              <div className="bg-white p-6 rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold mb-4">Hours Overview</h2>
                <div className="bg-gray-100 p-4 rounded-lg mb-6">
                  <h3 className="font-medium text-gray-900">Total Project Hours</h3>
                  <p className="text-3xl font-bold text-gray-700 mt-1">
                    {performanceData.totalHours} hours
                  </p>
                </div>

                <div className="space-y-4">
                  {Object.entries(performanceData.byUser).map(([userId, userData]: [string, any]) => (
                    <div key={userId} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium">{userData.userName}</h3>
                          <p className="text-lg font-semibold text-gray-700 mt-1">
                            {userData.totalHours} hours
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {Object.entries(userData.taskHours).map(([taskName, hours]: [string, any]) => (
                          <div key={taskName} className="flex justify-between text-sm text-gray-600">
                            <span>{taskName}</span>
                            <span>{hours} hours</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Tasks and Materials Section */}
              <div className="grid grid-cols-2 gap-6">
                {/* Additional Tasks */}
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h2 className="text-xl font-semibold mb-4">Additional Tasks</h2>
                  <div className="space-y-4">
                    {performanceData.additionalTasks.map((task: any) => (
                      <div key={task.id} className="bg-gray-50 p-4 rounded-lg">
                        <h3 className="font-medium">{task.description}</h3>
                        <p className="text-sm text-gray-600 mt-1">
                          Added by {task.profiles?.full_name}
                        </p>
                        <div className="mt-2 text-sm">
                          <p className="text-gray-700">Hours needed: {task.hours_needed}</p>
                          <p>
                            {format(parseISO(task.start_date), 'MMM d')} - {format(parseISO(task.end_date), 'MMM d, yyyy')}
                          </p>
                          {task.materials_needed && (
                            <p className="mt-1 text-gray-600">
                              Materials: {task.materials_needed}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                    {performanceData.additionalTasks.length === 0 && (
                      <p className="text-center text-gray-600 py-4">
                        No additional tasks for this period
                      </p>
                    )}
                  </div>
                </div>

                {/* Additional Materials */}
                <div className="bg-white p-6 rounded-lg shadow-lg">
                  <h2 className="text-xl font-semibold mb-4">Additional Materials</h2>
                  <div className="space-y-4">
                    {performanceData?.additionalMaterials?.map((material: any) => (
                      <div key={material.id} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">{material.material}</h3>
                            <p className="text-sm text-gray-600 mt-1">
                              Added by {material.profiles?.full_name}
                            </p>
                            <div className="mt-2 text-sm">
                              <p className="text-gray-700">
                                Quantity: {material.quantity} {material.unit}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!performanceData?.additionalMaterials || performanceData.additionalMaterials.length === 0) && (
                      <p className="text-center text-gray-600 py-4">
                        No additional materials for this period
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ProjectPerformance;
