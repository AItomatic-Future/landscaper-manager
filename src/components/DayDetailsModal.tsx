import React, { useState } from 'react';
import { format } from 'date-fns';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { X, PenTool as Tool, Plus, Package, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CalendarMaterialModal from './CalendarMaterialModal';

interface DayDetailsModalProps {
  date: Date;
  events: any[];
  equipment: any[];
  onClose: () => void;
}

const DayDetailsModal: React.FC<DayDetailsModalProps> = ({ date, events, equipment, onClose }) => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [noteContent, setNoteContent] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [showMaterialModal, setShowMaterialModal] = useState(false);
  const [selectedEventForMaterial, setSelectedEventForMaterial] = useState<string | null>(null);

  // Fetch notes for the selected date
  const { data: notes = [] } = useQuery({
    queryKey: ['day_notes', date.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('day_notes')
        .select(`
          id,
          event_id,
          content,
          created_at,
          events (
            title
          ),
          profiles (
            full_name
          )
        `)
        .eq('date', format(date, 'yyyy-MM-dd'))
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    }
  });

  // Fetch calendar materials with refetch interval
  const { data: calendarMaterials = [] } = useQuery({
    queryKey: ['calendar_materials', date.toISOString()],
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
        .eq('date', format(date, 'yyyy-MM-dd'))
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    refetchInterval: 1000
  });

  // Group materials by project
  const materialsByProject = calendarMaterials.reduce((acc: Record<string, any[]>, material) => {
    const eventId = material.events?.id || 'unassigned';
    if (!acc[eventId]) {
      acc[eventId] = [];
    }
    acc[eventId].push(material);
    return acc;
  }, {});

  // Fetch equipment details
  const { data: equipmentDetails = {} } = useQuery({
    queryKey: ['equipment_details', equipment.map(e => e.equipment_id)],
    queryFn: async () => {
      if (equipment.length === 0) return {};
      
      const { data, error } = await supabase
        .from('equipment')
        .select('id, name')
        .in('id', equipment.map(e => e.equipment_id));

      if (error) throw error;
      
      return data.reduce((acc: Record<string, { name: string }>, item) => {
        acc[item.id] = { name: item.name };
        return acc;
      }, {});
    },
    enabled: equipment.length > 0
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ eventId, content }: { eventId: string; content: string }) => {
      const { error } = await supabase
        .from('day_notes')
        .insert({
          event_id: eventId,
          content,
          date: format(date, 'yyyy-MM-dd'),
          user_id: user?.id
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['day_notes'] });
      setNoteContent('');
      setShowNoteForm(false);
    }
  });

  const handleAddNote = () => {
    if (!selectedEvent || !noteContent.trim()) return;
    addNoteMutation.mutate({ eventId: selectedEvent, content: noteContent });
  };

  const handleAddMaterial = (eventId: string) => {
    setSelectedEventForMaterial(eventId);
    setShowMaterialModal(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              {format(date, 'MMMM d, yyyy')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {events.length} events • {equipment.length} equipment in use
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Events Section */}
          {events.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Events</h3>
              <div className="space-y-4">
                {events.map(event => (
                  <div key={event.id} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
                            onClick={() => navigate(`/events/${event.id}`)}>
                          {event.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <button
                          onClick={() => handleAddMaterial(event.id)}
                          className="inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm hover:bg-green-200"
                        >
                          <Package className="w-4 h-4 mr-1" />
                          Add Material
                        </button>
                        <span className={`inline-block px-2 py-1 text-xs rounded-full ${
                          event.status === 'planned' ? 'bg-gray-100 text-gray-800' :
                          event.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                          event.status === 'in_progress' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {event.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Materials Needed Section - Grouped by Project */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Materials Needed</h3>
              <span className="text-sm text-red-600 font-medium flex items-center">
                <AlertCircle className="w-4 h-4 mr-1" />
                Required Materials
              </span>
            </div>
            <div className="space-y-6">
              {events.map(event => {
                const eventMaterials = materialsByProject[event.id] || [];
                if (eventMaterials.length === 0) return null;

                return (
                  <div key={event.id} className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-medium text-blue-600 mb-3 hover:text-blue-800 cursor-pointer"
                        onClick={() => navigate(`/events/${event.id}`)}>
                      {event.title}
                    </h4>
                    <div className="space-y-3">
                      {eventMaterials.map(material => (
                        <div key={material.id} className="bg-white p-3 rounded-md shadow-sm">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-gray-900">
                                {material.material} - {material.quantity} {material.unit}
                              </p>
                              {material.notes && (
                                <p className="text-sm text-red-600 mt-1 font-medium">
                                  Note: {material.notes}
                                </p>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">
                              Added by {material.profiles?.full_name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {Object.keys(materialsByProject).length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No materials needed for this day
                </p>
              )}
            </div>
          </div>

          {/* Equipment Section */}
          {equipment.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Equipment in Use</h3>
              <div className="space-y-4">
                {equipment.map(item => (
                  <div key={item.id} className="flex items-center space-x-4 bg-gray-50 p-4 rounded-lg">
                    <Tool className="w-5 h-5 text-gray-500" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {equipmentDetails[item.equipment_id]?.name || 'Loading...'}
                      </p>
                      <p className="text-sm text-gray-600">
                        Used in: {events.find(e => e.id === item.event_id)?.title}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
              <button
                onClick={() => setShowNoteForm(true)}
                className="flex items-center text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Note
              </button>
            </div>

            {showNoteForm && (
              <div className="bg-gray-50 p-4 rounded-lg mb-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Event</label>
                  <select
                    value={selectedEvent || ''}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="">Select an event</option>
                    {events.map(event => (
                      <option key={event.id} value={event.id}>{event.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Note</label>
                  <textarea
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    placeholder="Enter your note..."
                  />
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowNoteForm(false)}
                    className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddNote}
                    disabled={!selectedEvent || !noteContent.trim() || addNoteMutation.isPending}
                    className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                  >
                    {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {notes.map(note => (
                <div key={note.id} className="bg-gray-50 p-4 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-600">
                        Event: <span 
                          className="text-blue-600 hover:text-blue-800 cursor-pointer"
                          onClick={() => navigate(`/events/${note.event_id}`)}
                        >
                          {note.events?.title}
                        </span>
                      </p>
                      <p className="text-gray-900 mt-1">{note.content}</p>
                    </div>
                    <span className="text-xs text-gray-500">
                      {format(new Date(note.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Added by {note.profiles?.full_name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Material Modal */}
      {showMaterialModal && selectedEventForMaterial && (
        <CalendarMaterialModal
          eventId={selectedEventForMaterial}
          date={date}
          onClose={() => {
            setShowMaterialModal(false);
            setSelectedEventForMaterial(null);
          }}
        />
      )}
    </div>
  );
};

export default DayDetailsModal;
