import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isToday, 
  addMonths, 
  subMonths, 
  parseISO, 
  isSameMonth,
  startOfWeek,
  endOfWeek,
  eachWeekOfInterval,
  isSameDay,
  isFuture,
  isAfter
} from 'date-fns';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';
import BackButton from '../components/BackButton';
import DayDetailsModal from '../components/DayDetailsModal';

type Event = Database['public']['Tables']['events']['Row'];

const Calendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedStatus, setSelectedStatus] = useState<Event['status'] | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Get date from URL parameter
  useEffect(() => {
    const dateParam = searchParams.get('date');
    if (dateParam) {
      const parsedDate = parseISO(dateParam);
      setSelectedDate(parsedDate);
      setCurrentDate(parsedDate); // Set current month to show the selected date
    }
  }, [searchParams]);

  // Fetch events from Supabase
  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .neq('status', 'finished') // Exclude finished events
        .order('start_date', { ascending: true });

      if (error) throw error;
      return data as Event[];
    },
  });

  // Fetch equipment usage
  const { data: equipmentUsage = [] } = useQuery({
    queryKey: ['equipment_usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_usage')
        .select(`
          *,
          equipment (
            id,
            name
          ),
          events (
            id,
            status
          )
        `);
      if (error) throw error;
      return data;
    },
  });

  // Filter events by selected status
  const filteredEvents = events.filter(event => {
    // Skip events with invalid dates
    if (!event.start_date || !event.end_date) return false;

    // If a status filter is active, apply it
    if (selectedStatus && event.status !== selectedStatus) {
      return false;
    }

    return true;
  });

  const statusColors = {
    planned: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    finished: 'bg-green-100 text-green-800'
  };

  const handleEventClick = (eventId: string) => {
    navigate(`/events/${eventId}`);
  };

  // Get days for the current month, starting from Monday
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Get weeks for the calendar
  const weeks = eachWeekOfInterval(
    { start: calendarStart, end: calendarEnd },
    { weekStartsOn: 1 }
  );

  // Filter equipment for a specific date
  const filterEquipmentForDay = (date: Date) => {
    return equipmentUsage.filter(usage => {
      if (!usage.start_date || !usage.end_date) return false;
      
      const start = parseISO(usage.start_date);
      const end = parseISO(usage.end_date);
      
      // Skip equipment from finished events
      if (usage.events?.status === 'finished') {
        return false;
      }
      
      // For active events, check if the equipment is scheduled for this date
      return date >= start && date <= end;
    });
  };

  // Loading spinner
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <BackButton />
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
        <button
          onClick={() => navigate('/events/new')}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5 mr-2" />
          Add Event
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex space-x-4 mb-6">
        {(['planned', 'scheduled', 'in_progress'] as const).map(status => (
          <button
            key={status}
            onClick={() => setSelectedStatus(selectedStatus === status ? null : status)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              selectedStatus === status ? statusColors[status] : 'bg-gray-100 text-gray-600'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-semibold">{format(currentDate, 'MMMM yyyy')}</h2>
            <button
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-4">
            {/* Day headers - Starting from Monday */}
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
              <div key={day} className="text-center font-medium text-gray-500 pb-4">
                {day}
              </div>
            ))}

            {/* Calendar weeks */}
            {weeks.map(week => (
              <React.Fragment key={week.toISOString()}>
                {eachDayOfInterval({
                  start: startOfWeek(week, { weekStartsOn: 1 }),
                  end: endOfWeek(week, { weekStartsOn: 1 })
                }).map(date => {
                  const dayEvents = filteredEvents.filter(event => {
                    const eventStart = parseISO(event.start_date);
                    const eventEnd = parseISO(event.end_date);
                    return date >= eventStart && date <= eventEnd;
                  });

                  const dayEquipment = filterEquipmentForDay(date);

                  const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;

                  return (
                    <div
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(date)}
                      className={`min-h-[120px] p-4 border rounded-lg cursor-pointer transition-all ${
                        !isSameMonth(date, currentDate)
                          ? 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                          : isToday(date)
                          ? 'bg-white border-blue-400 hover:bg-gray-50'
                          : isSelected
                          ? 'bg-blue-100 border-blue-300'
                          : 'bg-white hover:bg-gray-50'
                      } ${
                        isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''
                      }`}
                    >
                      <div className={`font-medium mb-2 flex items-center ${
                        !isSameMonth(date, currentDate)
                          ? 'text-gray-400'
                          : isToday(date)
                          ? 'text-blue-600'
                          : 'text-gray-900'
                      }`}>
                        {format(date, 'd')}
                        {isToday(date) && (
                          <span className="ml-2 w-2 h-2 rounded-full bg-blue-500"></span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {dayEvents.map(event => (
                          <button
                            key={event.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEventClick(event.id);
                            }}
                            className={`w-full text-left px-3 py-2 rounded text-sm font-medium ${statusColors[event.status]}`}
                          >
                            <span className="block truncate">{event.title}</span>
                          </button>
                        ))}
                        {dayEquipment.length > 0 && (
                          <div className={`text-xs ${
                            !isSameMonth(date, currentDate)
                              ? 'text-gray-400'
                              : 'text-gray-500'
                          }`}>
                            {dayEquipment.length} equipment in use
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Day Details Modal */}
      {selectedDate && (
        <DayDetailsModal
          date={selectedDate}
          events={filteredEvents.filter(event => {
            const eventStart = parseISO(event.start_date);
            const eventEnd = parseISO(event.end_date);
            return selectedDate >= eventStart && selectedDate <= eventEnd;
          })}
          equipment={filterEquipmentForDay(selectedDate)}
          onClose={() => {
            setSelectedDate(null);
            // Remove date parameter from URL when closing modal
            navigate('/calendar', { replace: true });
          }}
        />
      )}
    </div>
  );
};

export default Calendar;
