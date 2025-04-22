import React, { useState } from 'react';
import Modal from './Modal';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Database } from '../lib/database.types';
import { useAuthStore } from '../lib/store';
import { X } from 'lucide-react';

type MaterialDelivered = Database['public']['Tables']['materials_delivered']['Row'];

interface MaterialProgressModalProps {
  material: MaterialDelivered | null;
  onClose: () => void;
}

const MaterialProgressModal: React.FC<MaterialProgressModalProps> = ({ material, onClose }) => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const [deliveredAmount, setDeliveredAmount] = useState('');
  const [notes, setNotes] = useState('');

  // Fetch existing deliveries
  const { data: deliveries = [] } = useQuery({
    queryKey: ['material_deliveries', material?.id],
    queryFn: async () => {
      if (!material?.id) return [];
      const { data, error } = await supabase
        .from('material_deliveries')
        .select('amount, delivery_date, notes')
        .eq('material_id', material.id)
        .order('delivery_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!material?.id
  });

  // Calculate total delivered amount
  const totalDelivered = deliveries.reduce((sum, delivery) => sum + (delivery.amount || 0), 0);
  const remaining = material ? material.total_amount - totalDelivered : 0;

  const addDeliveryMutation = useMutation({
    mutationFn: async ({ materialId, amount, notes }: { materialId: string; amount: number; notes: string }) => {
      if (!user?.id || !material?.event_id) throw new Error('Missing required data');
      
      const { error } = await supabase
        .from('material_deliveries')
        .insert({
          material_id: materialId,
          event_id: material.event_id,
          user_id: user.id,
          amount,
          notes: notes.trim() || null,
          delivery_date: new Date().toISOString()
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material_deliveries'] });
      queryClient.invalidateQueries({ queryKey: ['materials'] });
      setDeliveredAmount('');
      setNotes('');
      onClose();
    },
  });

  const handleSubmit = () => {
    if (!material?.id || !deliveredAmount) return;
    
    const amount = parseFloat(deliveredAmount);
    if (isNaN(amount) || amount <= 0) return;

    addDeliveryMutation.mutate({
      materialId: material.id,
      amount,
      notes
    });
  };

  if (!material) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">Update Material Progress</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-900">{material.name || 'Material'}</h3>
            <p className="text-sm text-gray-600">Unit: {material.unit}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Delivered Amount</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <input
                type="number"
                value={deliveredAmount}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setDeliveredAmount('');
                    return;
                  }
                  const parsed = parseFloat(value);
                  if (!isNaN(parsed) && parsed >= 0) {
                    setDeliveredAmount(value);
                  }
                }}
                min="0"
                step="0.01"
                className="block w-full rounded-md border-gray-300 focus:border-blue-500 focus:ring-blue-500 pr-12"
                placeholder="Enter amount delivered"
              />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">{material.unit}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Add any notes about this delivery"
            />
          </div>

          <div className="bg-blue-50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Total Required:</span>
              <span className="text-sm font-medium text-blue-900">{material.total_amount} {material.unit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Currently Delivered:</span>
              <span className="text-sm font-medium text-blue-900">{totalDelivered} {material.unit}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-blue-700">Remaining:</span>
              <span className="text-sm font-medium text-blue-900">{remaining} {material.unit}</span>
            </div>
            <div className="mt-2">
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min((totalDelivered / material.total_amount) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>

          {deliveries.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">Previous Deliveries</h4>
              <div className="space-y-2">
                {deliveries.map((delivery, index) => (
                  <div key={index} className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                    <div className="flex justify-between">
                      <span>{delivery.amount} {material.unit}</span>
                      <span>{new Date(delivery.delivery_date).toLocaleDateString()}</span>
                    </div>
                    {delivery.notes && (
                      <p className="text-xs text-gray-500 mt-1">{delivery.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              addDeliveryMutation.isPending || 
              !deliveredAmount || 
              parseFloat(deliveredAmount) <= 0
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {addDeliveryMutation.isPending ? 'Updating...' : 'Record Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MaterialProgressModal;
