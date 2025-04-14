import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { format, addDays, parseISO, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Calendar as CalendarIcon, Clock, Package, PenTool as Tool, AlertCircle } from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const today = new Date();
  const tomorrow = addDays(today, 1);

  // Fetch events for today and tomorrow
  const { data: events = [] } = useQuery({
    queryKey: ['dashboard_events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          title,
          description,
          start_date,
          end_date,
          status,
          has_equipment,
          has_materials
        `)
        .or(`status.eq.scheduled,status.eq.in_progress`)
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data;
    }
  });

  // Fetch calendar materials
  const { data: calendarMaterials = [] } = useQuery({
    queryKey: ['dashboard_calendar_materials'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calendar_materials')
        .select(`
          *,
          events (
            id,
            title
          ),
          profiles (
            full_name
          )
        `)
        .in('date', [format(today, 'yyyy-MM-dd'), format(tomorrow, 'yyyy-MM-dd')])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  // Fetch equipment usage with equipment details
  const { data: equipmentUsage = [] } = useQuery({
    queryKey: ['dashboard_equipment'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_usage')
        .select(`
          id,
          equipment_id,
          event_id,
          start_date,
          end_date,
          equipment:equipment_id (
            id,
            name,
            status
          )
        `)
        .eq('equipment.status', 'in_use');

      if (error) throw error;
      return data;
    }
  });

  // Fetch tasks for the events
  const { data: tasks = [] } = useQuery({
    queryKey: ['dashboard_tasks', events.map(e => e.id)],
    queryFn: async () => {
      if (events.length === 0) return [];

      const { data, error } = await supabase
        .from('tasks_done')
        .select('*')
        .in('event_id', events.map(e => e.id));

      if (error) throw error;
      return data;
    },
    enabled: events.length > 0
  });

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

  const DayView = ({ date, dayEvents }: { date: Date; dayEvents: typeof events }) => {
    const dayMaterials = calendarMaterials.filter(m => 
      format(parseISO(m.date), 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    );

    const dayEquipment = equipmentUsage.filter(usage => {
      if (!usage.start_date || !usage.end_date) return false;
      const usageStart = parseISO(usage.start_date);
      const usageEnd = parseISO(usage.end_date);
      return isWithinInterval(date, { start: usageStart, end: usageEnd });
    });

    // Group materials by project
    const materialsByProject = dayMaterials.reduce((acc: Record<string, any[]>, material) => {
      const eventId = material.event_id;
      if (!acc[eventId]) {
        acc[eventId] = [];
      }
      acc[eventId].push(material);
      return acc;
    }, {});

    const handleCalendarClick = () => {
      // Navigate to calendar with date parameter
      navigate(`/calendar?date=${format(date, 'yyyy-MM-dd')}`);
    };

    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div 
          onClick={handleCalendarClick}
          className="flex items-center justify-between mb-6 cursor-pointer hover:bg-gray-50 p-3 rounded-lg transition-colors group"
        >
          <div className="flex items-center">
            <CalendarIcon className="w-6 h-6 text-blue-600 mr-3 group-hover:scale-110 transition-transform" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                {format(date, "EEEE")}
              </h2>
              <p className="text-gray-600">
                {format(date, "MMMM d, yyyy")}
              </p>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {dayEvents.length} events
          </div>
        </div>

        <div className="space-y-6">
          {/* Events Section */}
          <div className="space-y-4">
            {dayEvents.map(event => {
              const eventTasks = tasks.filter(t => t.event_id === event.id);
              const eventMaterials = materialsByProject[event.id] || [];
              const eventEquipment = dayEquipment.filter(e => e.event_id === event.id);

              return (
                <div
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className="bg-gray-50 p-4 rounded-lg hover:bg-gray-100 cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-lg text-blue-600 hover:text-blue-800">
                        {event.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(event.status)}`}>
                      {event.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center text-gray-600">
                      <Clock className="w-4 h-4 mr-2" />
                      <span>
                        {format(parseISO(event.start_date), 'HH:mm')} - {format(parseISO(event.end_date), 'HH:mm')}
                      </span>
                    </div>
                    {eventTasks.length > 0 && (
                      <div className="flex items-center text-gray-600">
                        <Tool className="w-4 h-4 mr-2" />
                        <span>{eventTasks.length} tasks</span>
                      </div>
                    )}
                    {eventMaterials.length > 0 && (
                      <div className="flex items-center text-gray-600">
                        <Package className="w-4 h-4 mr-2" />
                        <span>{eventMaterials.length} materials</span>
                      </div>
                    )}
                  </div>

                  {/* Materials Section */}
                  {eventMaterials.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center text-sm text-red-600 mb-2">
                        <AlertCircle className="w-4 h-4 mr-1" />
                        <span>Required Materials</span>
                      </div>
                      <div className="space-y-2">
                        {eventMaterials.map(material => (
                          <div key={material.id} className="bg-white p-2 rounded-md text-sm">
                            <div className="flex justify-between">
                              <span className="font-medium">
                                {material.material} - {material.quantity} {material.unit}
                              </span>
                              {material.notes && (
                                <span className="text-red-600 text-xs">
                                  Note: {material.notes}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Equipment Section */}
                  {eventEquipment.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center text-sm text-amber-600 mb-2">
                        <Tool className="w-4 h-4 mr-1" />
                        <span>Equipment in Use</span>
                      </div>
                      <div className="space-y-2">
                        {eventEquipment.map(usage => (
                          <div key={usage.id} className="bg-amber-50 p-2 rounded-md text-sm">
                            <span className="font-medium text-amber-800">
                              {usage.equipment?.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {dayEvents.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <CalendarIcon className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No events scheduled for this day</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
      </div>
      
      <div className="grid md:grid-cols-2 gap-6">
        <DayView 
          date={today} 
          dayEvents={events.filter(event => {
            const eventStart = parseISO(event.start_date);
            const eventEnd = parseISO(event.end_date);
            return isWithinInterval(today, { start: eventStart, end: eventEnd });
          })} 
        />
        <DayView 
          date={tomorrow} 
          dayEvents={events.filter(event => {
            const eventStart = parseISO(event.start_date);
            const eventEnd = parseISO(event.end_date);
            return isWithinInterval(tomorrow, { start: eventStart, end: eventEnd });
          })} 
        />
      </div>
    </div>
  );
};

export default Dashboard;
