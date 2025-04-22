import React from 'react';
import { useAuthStore } from '../lib/store';
import { Navigate } from 'react-router-dom';
import { DollarSign, FileText, Calculator } from 'lucide-react';
import BackButton from '../components/BackButton';

const Finance = () => {
  const { profile } = useAuthStore();

  // Redirect if not Admin/boss
  if (profile?.role !== 'Admin' && profile?.role !== 'boss') {
    return <Navigate to="/" replace />;
  }

  const sections = [
    {
      title: 'Work Pricing',
      description: 'Calculate and manage pricing for construction work',
      icon: Calculator,
      status: 'Coming Soon'
    },
    {
      title: 'Invoice Maker',
      description: 'Create and manage professional invoices',
      icon: FileText,
      status: 'Coming Soon'
    },
    {
      title: 'Financial Overview',
      description: 'Track financial performance and metrics',
      icon: DollarSign,
      status: 'Coming Soon'
    }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <BackButton />
      <h1 className="text-3xl font-bold text-gray-900">Finance</h1>
      
      <div className="grid md:grid-cols-3 gap-6">
        {sections.map((section) => (
          <div key={section.title} className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center mb-4">
              <section.icon className="w-6 h-6 text-blue-600 mr-3" />
              <h2 className="text-xl font-semibold">{section.title}</h2>
            </div>
            <p className="text-gray-600 mb-4">{section.description}</p>
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {section.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Finance;
