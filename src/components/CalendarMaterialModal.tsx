import React, { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';

interface CalendarMaterialModalProps {
  eventId: string;
  date: Date;
  onClose: () => void;
}

const CalendarMaterialModal: React.FC<CalendarMaterialModalProps> = ({ eventId, date, onClose }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch material templates
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

  const addMaterialMutation = useMutation({
    mutationFn: async ({ material, quantity, unit, notes }: { 
      material: string; 
      quantity: number; 
      unit: string;
      notes?: string;
    }) => {
      const formattedDate = format(date, 'yyyy-MM-dd');

      const { error } = await supabase
        .from('calendar_materials')
        .insert({
          event_id: eventId,
          user_id: user?.id,
          material,
          quantity,
          unit,
          date: formattedDate,
          notes: notes || null
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar_materials', format(date, 'yyyy-MM-dd')] });
      queryClient.invalidateQueries({ queryKey: ['dashboard_calendar_materials'] });
      onClose();
    }
  });

  const handleSubmit = () => {
    if (!selectedMaterial || !quantity || !unit) return;
    
    addMaterialMutation.mutate({
      material: selectedMaterial.name,
      quantity: parseFloat(quantity),
      unit,
      notes
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Add Material Needed</h2>
            <p className="text-sm text-gray-600 mt-1">
              For: {format(date, 'MMMM d, yyyy')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Search Materials</label>
            <div className="relative mt-1">
              <input
                type="text"
                value={materialSearch}
                onChange={(e) => setMaterialSearch(e.target.value)}
                className="block w-full rounded-md border-gray-300 pl-10 focus:border-gray-600 focus:ring-gray-600"
                placeholder="Search materials..."
              />
              <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto border rounded-lg">
            {materials.map(material => (
              <div
                key={material.id}
                onClick={() => {
                  setSelectedMaterial(material);
                  setUnit(material.unit);
                }}
                className={`p-4 hover:bg-gray-100 cursor-pointer border-b last:border-b-0 ${
                  selectedMaterial?.id === material.id ? 'bg-gray-200' : ''
                }`}
              >
                <h3 className="font-medium">{material.name}</h3>
                {material.description && (
                  <p className="text-sm text-gray-600 mt-1">{material.description}</p>
                )}
                <p className="text-xs text-gray-500 mt-1">Unit: {material.unit}</p>
              </div>
            ))}
          </div>

          {selectedMaterial && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0.01"
                    step="0.01"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit</label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-gray-600 focus:ring-gray-600"
                  placeholder="Add any notes about this material..."
                />
              </div>
            </>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50">
          <button
            onClick={handleSubmit}
            disabled={!selectedMaterial || !quantity || !unit || addMaterialMutation.isPending}
            className="w-full bg-gray-600 text-white py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            {addMaterialMutation.isPending ? 'Adding...' : 'Add Material'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CalendarMaterialModal;
