import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/store';
import { Plus, X, AlertCircle, Loader2, Check, Pencil } from 'lucide-react';
import BackButton from '../components/BackButton';
import MainTaskModal from './MainTaskModal';
import CalculatorModal from './CalculatorModal';

// Types
interface CalculatorResults {
  name: string;
  materials?: {
    name: string;
    quantity: number;
    unit: string;
  }[];
  labor?: number;
  totalRows?: number;
  roundedDownHeight?: number;
  roundedUpHeight?: number;
  taskBreakdown?: {
    name: string;
    hours: number;
    unit?: string;
    quantity?: number;
  }[];
  excavationTime?: number;
  transportTime?: number;
  totalTime?: number;
  totalTons?: number;
  equipmentUsed?: {
    excavator?: string;
    carrier?: string;
  };
  unit?: string;
  amount?: number;
}

interface MainTask {
  id: string;
  name: string;
  calculatorType: string;
  calculatorSubType: string;
  results: CalculatorResults | null;
}

interface MinorTask {
  template_id: string;
  name: string;
  quantity: number;
  unit: string;
  estimated_hours?: number;
  results?: {
    materials: {
      name: string;
      quantity: number;
      unit: string;
    }[];
    labor: number;
  } | null;
}

interface Material {
  template_id: string;
  quantity: number;
  name?: string;
  unit?: string;
  price?: number;
  description?: string;
  confirmed?: boolean;
}

interface FormData {
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  status: 'planned' | 'scheduled' | 'in_progress';
  has_equipment: boolean;
  has_materials: boolean;
}

interface DiggingEquipment {
  id: string;
  name: string;
  type: string;
  "size (in tones)": number;
}

interface TaskTemplate {
  id: string;
  name: string;
  materials?: {
    name: string;
    quantity: number;
    unit: string;
  }[];
  estimated_hours?: number;
}

const ProjectCreating = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'planned',
    has_equipment: false,
    has_materials: false
  });

  const [mainTasks, setMainTasks] = useState<MainTask[]>([]);
  const [minorTasks, setMinorTasks] = useState<MinorTask[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [showMainTaskModal, setShowMainTaskModal] = useState(false);
  const [selectedCalculator, setSelectedCalculator] = useState<string | null>(null);
  const [selectedSubCalculator, setSelectedSubCalculator] = useState<string | null>(null);
  const [extraSoilExcavation, setExtraSoilExcavation] = useState({
    area: '',
    weight: ''
  });
  const [showCalculatorModal, setShowCalculatorModal] = useState(false);
  const [selectedMainTask, setSelectedMainTask] = useState<MainTask | null>(null);
  const [totalSoilExcavation, setTotalSoilExcavation] = useState(0);
  const [totalTape1, setTotalTape1] = useState(0);
  const [totalHours, setTotalHours] = useState(0);

  // Add state for the created event
  const [createdEventId, setCreatedEventId] = useState<string | null>(null);

  // Add new state variables for equipment selection
  const [excavators, setExcavators] = useState<DiggingEquipment[]>([]);
  const [carriers, setCarriers] = useState<DiggingEquipment[]>([]);
  const [excavationOption, setExcavationOption] = useState<'removal' | 'pile'>('removal');
  const [selectedExcavator, setSelectedExcavator] = useState<DiggingEquipment | null>(null);
  const [selectedCarrier, setSelectedCarrier] = useState<DiggingEquipment | null>(null);
  const [selectedTape1Excavator, setSelectedTape1Excavator] = useState<DiggingEquipment | null>(null);
  const [selectedTape1Carrier, setSelectedTape1Carrier] = useState<DiggingEquipment | null>(null);
  const [soilExcavationHours, setSoilExcavationHours] = useState(0);
  const [tape1Hours, setTape1Hours] = useState(0);
  const [excavationMeasureType, setExcavationMeasureType] = useState<'area' | 'weight'>('area');

  // Add new state variables for name prompt
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [tempMainTask, setTempMainTask] = useState<MainTask | null>(null);
  const [taskName, setTaskName] = useState('');

  // Add mutation for creating event
  const createEventMutation = useMutation({
    mutationFn: async (eventData: FormData) => {
      const { data, error } = await supabase
        .from('events')
        .insert([{
          title: eventData.title,
          description: eventData.description,
          start_date: eventData.start_date,
          end_date: eventData.end_date,
          status: eventData.status,
          has_equipment: eventData.has_equipment,
          has_materials: eventData.has_materials,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  });

  // Fetch task templates
  const { data: taskTemplates = [] } = useQuery({
    queryKey: ['task_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_tasks_with_dynamic_estimates')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch material templates
  const { data: materialTemplates = [] } = useQuery({
    queryKey: ['material_templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('materials')
        .select('id, name, description, unit, price, created_at')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Calculator groups from Calculator.tsx, excluding specified ones
  const calculatorGroups = [
    {
      type: 'aggregate',
      label: 'Aggregate Calculator',
      subTypes: [
        { type: 'type1', label: 'Preparation' },
        { type: 'soil_excavation', label: 'Soil Excavation' }
      ]
    },
    {
      type: 'paving',
      label: 'Paving Calculator',
      subTypes: [
        { type: 'default', label: 'Monoblock Paving' }
      ]
    },
    {
      type: 'wall',
      label: 'Wall & Finish Calculator',
      subTypes: [
        { type: 'brick', label: 'Brick Wall Calculator' },
        { type: 'block4', label: '4-inch Block Wall Calculator' },
        { type: 'block7', label: '7-inch Block Wall Calculator' }
      ]
    },
    {
      type: 'slab',
      label: 'Slab Calculator',
      subTypes: [
        { type: 'default', label: 'Slab Calculator' }
      ]
    },
    {
      type: 'fence',
      label: 'Fence Calculator',
      subTypes: [
        { type: 'vertical', label: 'Vertical Fence' },
        { type: 'horizontal', label: 'Horizontal Fence' },
      ]
    },
    {
      type: 'steps',
      label: 'Steps Calculator',
      subTypes: [
        { type: 'standard', label: 'Standard Stairs' }
      ]
    },
    {
      type: 'grass',
      label: 'Artificial Grass Calculator',
      subTypes: [
        { type: 'default', label: 'Artificial Grass' }
      ]
    }
  ];

  // Add helper function at the top level of the component
  const normalizeTaskName = (name: string): string => name.toLowerCase().trim();

  const findExactTemplate = (taskName: string): TaskTemplate | undefined => {
    const normalizedTaskName = normalizeTaskName(taskName);
    return taskTemplates.find((template: TaskTemplate) => 
      normalizeTaskName(template.name) === normalizedTaskName
    );
  };

  const findCuttingTemplate = (taskName: string): TaskTemplate | undefined => {
    return taskTemplates.find((template: TaskTemplate) => {
      const normalizedTemplateName = normalizeTaskName(template.name);
      const normalizedTaskName = normalizeTaskName(taskName);
      return normalizedTemplateName.includes('cutting') &&
             normalizedTemplateName.includes(normalizedTaskName.replace('cutting', '').trim());
    });
  };

  // Add handlers for main tasks
  const handleAddMainTask = (task: MainTask) => {
    setTempMainTask(task);
    setShowNamePrompt(true);
  };

  const handleConfirmTaskName = () => {
    if (tempMainTask && taskName.trim()) {
      const taskWithName = {
        ...tempMainTask,
        name: taskName.trim()
      };
      setMainTasks(prev => [...prev, taskWithName]);
      setTaskName('');
      setTempMainTask(null);
      setShowNamePrompt(false);
    }
  };

  const handleSaveCalculatorResults = (results: CalculatorResults) => {
    if (selectedMainTask) {
      const newTask = {
        ...selectedMainTask,
        results
      };

      // Update totals
      if (results.materials) {
        results.materials.forEach(material => {
          if (material.name.toLowerCase().includes('soil')) {
            setTotalSoilExcavation(prev => prev + material.quantity);
          } else if (material.name.toLowerCase().includes('tape 1')) {
            setTotalTape1(prev => prev + material.quantity);
          }
        });
      }

      if (results.totalTons) {
        if (selectedMainTask.calculatorType === 'soil_excavation') {
          setTotalSoilExcavation(prev => prev + results.totalTons);
        } else if (selectedMainTask.calculatorType === 'tape1') {
          setTotalTape1(prev => prev + results.totalTons);
        }
      }
      if (results.labor || results.totalTime) {
        setTotalHours(prev => prev + (results.labor || results.totalTime || 0));
      }

      setMainTasks(prev => [...prev, newTask]);
    }
    setShowCalculatorModal(false);
    setSelectedMainTask(null);
  };

  const handleAddMinorTask = () => {
    const newTask = { template_id: '', name: '', quantity: 1, unit: '' };
    setMinorTasks(prev => [...prev, newTask]);
  };

  const handleSaveMinorTask = (index: number) => {
    const task = minorTasks[index];
    if (task.template_id && task.name && task.quantity) {
      // First try exact match
      let matchingTemplate = findExactTemplate(task.name);
      
      // If no exact match and it's a cutting task, try specialized matching
      if (!matchingTemplate && normalizeTaskName(task.name).includes('cutting')) {
        matchingTemplate = findCuttingTemplate(task.name);
      }
      
      // Only if still no match, try includes matching
      if (!matchingTemplate) {
        matchingTemplate = taskTemplates.find(template => 
          normalizeTaskName(template.name).includes(normalizeTaskName(task.name))
        );
      }

      if (matchingTemplate) {
        const results = {
          materials: matchingTemplate.materials?.map(m => ({
            name: m.name,
            quantity: m.quantity * task.quantity,
            unit: m.unit
          })) || [],
          labor: (matchingTemplate.estimated_hours || 0) * task.quantity
        };

        // Update the task with the results and template ID
        const updatedTask = {
          ...task,
          results,
          template_id: matchingTemplate.id // Ensure template ID is set
        };

        setMinorTasks(prev => {
          const newTasks = [...prev];
          newTasks[index] = updatedTask;
          return newTasks;
        });

        // Update totals
        results.materials.forEach(material => {
          if (material.name.toLowerCase().includes('soil')) {
            setTotalSoilExcavation(prev => prev + material.quantity);
          } else if (material.name.toLowerCase().includes('tape 1')) {
            setTotalTape1(prev => prev + material.quantity);
          }
        });
        setTotalHours(prev => prev + results.labor);
      }
    }
  };

  const handleDeleteMinorTask = (index: number) => {
    const task = minorTasks[index];
    if (task.results) {
      // Subtract from totals
      if (task.results.materials) {
        task.results.materials.forEach(material => {
          if (material.name.toLowerCase().includes('soil')) {
            setTotalSoilExcavation(prev => prev - material.quantity);
          } else if (material.name.toLowerCase().includes('tape 1')) {
            setTotalTape1(prev => prev - material.quantity);
          }
        });
      }
      if (task.results.labor) {
        setTotalHours(prev => prev - task.results.labor);
      }
    }
    const newTasks = [...minorTasks];
    newTasks.splice(index, 1);
    setMinorTasks(newTasks);
  };

  const formatTime = (hours: number) => {
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    
    if (wholeHours === 0) {
      return `${minutes} minutes`;
    } else if (minutes === 0) {
      return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''}`;
    } else {
      return `${wholeHours} hour${wholeHours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Validate required fields
      if (!formData.title || !formData.start_date || !formData.end_date) {
        throw new Error('Please fill in all required fields');
      }

      // Create the event first
      const { data: event, error: eventError } = await supabase
        .from('events')
        .insert({
          title: formData.title,
          description: formData.description,
          start_date: formData.start_date,
          end_date: formData.end_date,
          status: formData.status,
          has_equipment: formData.has_equipment,
          has_materials: formData.has_materials,
          created_by: user?.id
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Process main tasks
      for (const mainTask of mainTasks) {
        if (mainTask.results?.taskBreakdown && mainTask.results.taskBreakdown.length > 0) {
          // Create a task for each item in the task breakdown
          for (const taskItem of mainTask.results.taskBreakdown) {
            // Use the original task name for template matching
            const taskName = taskItem.task;
            console.log('Processing task:', taskName, 'with amount:', taskItem.amount);

            // Determine if we're dealing with porcelain or sandstone
            let matchingTaskTemplateId = null;
            let actualTaskName = taskName;

            // If the task is "Cutting Slabs", determine the correct type based on the main task name
            if (taskName.toLowerCase() === 'cutting slabs') {
              const isPortcelain = mainTask.name.toLowerCase().includes('porcelain') || 
                                  mainTask.results.name?.toLowerCase().includes('porcelain');
              const isSandstone = mainTask.name.toLowerCase().includes('sandstone') || 
                                 mainTask.results.name?.toLowerCase().includes('sandstone');

              if (isPortcelain) {
                actualTaskName = 'cutting porcelain';
              } else if (isSandstone) {
                actualTaskName = 'cutting sandstones';
              }
            }

            // Try multiple matching strategies, from most specific to least specific
            let matchingTemplate = null;
            let matchStage = '';

            // 1. Try exact match first
            matchingTemplate = taskTemplates.find(template => 
              template.name.toLowerCase() === actualTaskName.toLowerCase()
            );
            if (matchingTemplate) {
              matchStage = 'exact';
              console.log('Found exact match:', matchingTemplate.name);
            }

            // 2. If no exact match, try matching task type specifically
            if (!matchingTemplate) {
              // For cutting tasks, ensure we match with cutting templates
              if (actualTaskName.toLowerCase().includes('cutting')) {
                matchingTemplate = taskTemplates.find(template => {
                  const name = template.name.toLowerCase();
                  return name.includes('cutting') && 
                         name.includes(actualTaskName.toLowerCase().replace('cutting ', ''));
                });
                if (matchingTemplate) {
                  matchStage = 'task-specific';
                  console.log('Found task-specific match:', matchingTemplate.name);
                }
              }
            }

            // 3. If still no match, try matching main words in order
            if (!matchingTemplate) {
              const taskWords = actualTaskName.toLowerCase().split(' ');
              matchingTemplate = taskTemplates.find(template => {
                const templateWords = template.name.toLowerCase().split(' ');
                // Words must appear in the same order
                let templateIndex = 0;
                return taskWords.every(word => {
                  while (templateIndex < templateWords.length) {
                    if (templateWords[templateIndex].includes(word)) {
                      templateIndex++;
                      return true;
                    }
                    templateIndex++;
                  }
                  return false;
                });
              });
              if (matchingTemplate) {
                matchStage = 'word-order';
                console.log('Found word-order match:', matchingTemplate.name);
              }
            }

            // 4. Last resort: try partial match with key terms
            if (!matchingTemplate) {
              matchingTemplate = taskTemplates.find(template => {
                const name = template.name.toLowerCase();
                const taskNameLower = actualTaskName.toLowerCase();
                
                // Split both names into words and find common significant words
                const templateWords = name.split(' ').filter(word => word.length > 3);
                const taskWords = taskNameLower.split(' ').filter(word => word.length > 3);
                
                // Require all task words to be present in template
                return taskWords.every(taskWord => 
                  templateWords.some(templateWord => 
                    templateWord.includes(taskWord) || taskWord.includes(templateWord)
                  )
                );
              });
              if (matchingTemplate) {
                matchStage = 'partial';
                console.log('Found partial match:', matchingTemplate.name);
              }
            }

            // Log the matching results
            console.log('Template matching results:', {
              taskName: actualTaskName,
              matchStage,
              matchedTemplate: matchingTemplate?.name || 'No match found'
            });

            matchingTaskTemplateId = matchingTemplate?.id || null;

            const { error: taskError } = await supabase
              .from('tasks_done')
              .insert({
                event_id: event.id,
                user_id: user?.id,
                name: actualTaskName.toLowerCase() === 'bricklaying' ? 'Bricklaying' : actualTaskName.toLowerCase(),
                task_name: mainTask.name,
                description: mainTask.results.name || '',
                unit: taskName.toLowerCase() === 'cutting slabs' ? 'slabs' : (taskItem.unit || ''),
                amount: `${taskItem.amount || 0} ${taskName.toLowerCase() === 'cutting slabs' ? 'slabs' : (taskItem.unit || '')}`.trim(),
                hours_worked: taskItem.hours || 0,
                is_finished: false,
                event_task_id: matchingTaskTemplateId
              });

            if (taskError) {
              console.error('Error creating task:', taskError);
              throw new Error('Failed to create task');
            }
          }
        } else if (mainTask.results) {
          // If no task breakdown but we have results, create a single task
          const taskName = mainTask.name || mainTask.results.name || 'Unnamed Task';
          
          console.log('Task breakdown:', mainTask.results.taskBreakdown); // Debug log
          console.log('Full results:', mainTask.results); // Debug log

          if (mainTask.results.taskBreakdown && mainTask.results.taskBreakdown.length > 0) {
            // Create a task for each item in the task breakdown
            for (const taskItem of mainTask.results.taskBreakdown) {
              console.log('Processing task item:', taskItem); // Debug log

              // Find matching task template
              let matchingTaskTemplateId = null;
              const matchingTemplate = taskTemplates.find(template => 
                template.name.toLowerCase() === taskItem.task.toLowerCase() || 
                template.name.toLowerCase().includes(taskItem.task.toLowerCase())
              );
              matchingTaskTemplateId = matchingTemplate?.id || null;

              // Extract amount from task name if it's in brackets
              let amount = 0;
              let unit = '';
              const amountMatch = taskItem.task.match(/\[([\d.]+)\s*([^\]]+)\]/);
              if (amountMatch) {
                amount = parseFloat(amountMatch[1]);
                unit = amountMatch[2].trim();
              } else {
                // Fallback to task item's amount and unit if available
                amount = taskItem.amount || 0;
                unit = taskItem.unit || '';
              }

              console.log('Task amount and unit:', { amount, unit }); // Debug log

              const { error: taskError } = await supabase
                .from('tasks_done')
                .insert({
                  event_id: event.id,
                  user_id: user?.id,
                  name: taskItem.task.toLowerCase(),  // Convert to lowercase here
                  task_name: mainTask.name,
                  description: mainTask.results.name || '',
                  unit: unit,
                  amount: `${amount} ${unit}`.trim(),
                  hours_worked: taskItem.hours || 0,
                  is_finished: false,
                  event_task_id: matchingTaskTemplateId
                });

              if (taskError) {
                console.error('Error creating task:', taskError);
                throw new Error('Failed to create task');
              }
            }
          } else {
            // If no task breakdown, create a single task
            const { error: taskError } = await supabase
              .from('tasks_done')
              .insert({
                event_id: event.id,
                user_id: user?.id,
                name: taskName,
                description: mainTask.results.name || '',
                unit: mainTask.results.unit || '',
                amount: `${mainTask.results.amount || 0} ${mainTask.results.unit || ''}`.trim(),
                hours_worked: parseFloat((mainTask.results.totalTime || mainTask.results.labor || 0).toFixed(2)),
                is_finished: false,
                event_task_id: matchingTaskTemplateId
              });

            if (taskError) {
              console.error('Error creating task:', taskError);
              throw new Error('Failed to create task');
            }
          }
        }

        // Process materials from main task
        if (mainTask.results?.materials) {
          for (const material of mainTask.results.materials) {
            const { error: materialError } = await supabase
              .from('materials_delivered')
              .insert({
                event_id: event.id,
                amount: 0,
                total_amount: material.quantity,
                unit: material.unit,
                status: 'pending',
                name: material.name
              });

            if (materialError) {
              console.error('Error creating material:', materialError);
              throw new Error('Failed to create material');
            }
          }
        }
      }

      // Add this after processing main tasks but before processing minor tasks
      // Add Soil Excavation and Tape 1 Preparation tasks
      if (selectedExcavator) {
        if (totalSoilExcavation > 0) {
          const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalSoilExcavation);
          const transportTime = excavationOption === 'removal' && selectedCarrier
            ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalSoilExcavation)
            : 0;
          
          // Format the hours to 2 decimal places
          const totalHours = parseFloat((excavationTime + transportTime).toFixed(2));
          
          // Create task name with equipment details
          const equipmentDetails = selectedCarrier
            ? `(${selectedExcavator["size (in tones)"]}t digger and ${selectedCarrier["size (in tones)"]}t ${selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier'})`
            : `(${selectedExcavator["size (in tones)"]}t digger)`;
          
          // Find excavation task template with matching equipment
          const excavatorSize = selectedExcavator["size (in tones)"] || 0;
          const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;
          const carrierType = selectedCarrier ? 
            (selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier') : '';

          // Log information for debugging
          console.log('Looking for excavation task template with:', {
            excavatorSize,
            carrierSize,
            carrierType
          });

          let excavationTaskTemplate = null;

          if (selectedCarrier) {
            // Search for template with both excavator and carrier
            excavationTaskTemplate = taskTemplates.find(template => {
              const name = template.name.toLowerCase();
              const nameMatches = 
                name.includes('excavation') || 
                name.includes('soil');
              const excavatorMatches = name.includes(`${excavatorSize}t`);
              const carrierMatches = name.includes(`${carrierSize}t`) && 
                                    (name.includes('barrow') || 
                                     name.includes('wheelbarrow') || 
                                     name.includes('carrier'));
              
              return nameMatches && excavatorMatches && carrierMatches;
            });
            
            console.log('Found excavation template with carrier:', excavationTaskTemplate?.name || 'None');
            
            // If no exact match, try a looser match with just excavator size and carrier type
            if (!excavationTaskTemplate) {
              excavationTaskTemplate = taskTemplates.find(template => {
                const name = template.name.toLowerCase();
                const isExcavation = name.includes('excavation') || name.includes('soil');
                const hasExcavatorSize = name.includes(`${excavatorSize}t`);
                const hasCarrierType = selectedCarrier.type === 'barrows_dumpers' 
                  ? (name.includes('barrow') || name.includes('wheelbarrow'))
                  : name.includes('carrier');
                
                return isExcavation && hasExcavatorSize && hasCarrierType;
              });
              
              console.log('Found excavation template with looser carrier match:', excavationTaskTemplate?.name || 'None');
            }
            
            // Fall back to just matching excavation with excavator size
            if (!excavationTaskTemplate) {
              excavationTaskTemplate = taskTemplates.find(template => {
                const name = template.name.toLowerCase();
                return (name.includes('excavation') || name.includes('soil')) && 
                       name.includes(`${excavatorSize}t`);
              });
              
              console.log('Found excavation template with excavator size only:', excavationTaskTemplate?.name || 'None');
            }
          } else {
            // Search for template with just excavator
            excavationTaskTemplate = taskTemplates.find(template => {
              const name = template.name.toLowerCase();
              const nameMatches = 
                name.includes('excavation') || 
                name.includes('soil');
              const excavatorMatches = name.includes(`${excavatorSize}t`);
              const noCarrierMention = !name.includes('carrier') && 
                                       !name.includes('barrow') && 
                                       !name.includes('wheelbarrow');
              
              return nameMatches && excavatorMatches && noCarrierMention;
            });
            
            console.log('Found excavation template with just excavator:', excavationTaskTemplate?.name || 'None');
            
            // Fall back to just matching excavation with excavator size
            if (!excavationTaskTemplate) {
              excavationTaskTemplate = taskTemplates.find(template => {
                const name = template.name.toLowerCase();
                return (name.includes('excavation') || name.includes('soil')) && 
                       name.includes(`${excavatorSize}t`);
              });
              
              console.log('Found excavation fallback template:', excavationTaskTemplate?.name || 'None');
            }
          }

          // Absolute fallback - just find any excavation task if everything else fails
          if (!excavationTaskTemplate) {
            excavationTaskTemplate = taskTemplates.find(template => {
              const name = template.name.toLowerCase();
              return name.includes('excavation') || name.includes('soil');
            });
            
            console.log('Found generic excavation template as last resort:', excavationTaskTemplate?.name || 'None');
          }

          // Create Soil Excavation task
          const { error: soilTaskError } = await supabase
            .from('tasks_done')
            .insert({
              event_id: event.id,
              user_id: user?.id,
              name: `Soil Excavation ${equipmentDetails}`,
              description: `Total soil to excavate: ${totalSoilExcavation.toFixed(2)} tonnes`,
              unit: 'tonnes',
              amount: `${totalSoilExcavation.toFixed(2)} tonnes`,
              hours_worked: totalHours,
              is_finished: false,
              event_task_id: excavationTaskTemplate?.id || null
            });

          if (soilTaskError) {
            console.error('Error creating soil excavation task:', soilTaskError);
            throw new Error('Failed to create soil excavation task');
          }
        }

        if (totalTape1 > 0) {
          const tape1ExcavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalTape1);
          const tape1TransportTime = excavationOption === 'removal' && selectedCarrier
            ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalTape1)
            : 0;
          
          // Create task name with equipment details
          const equipmentDetails = selectedCarrier
            ? `(${selectedExcavator["size (in tones)"]}t digger and ${selectedCarrier["size (in tones)"]}t ${selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier'})`
            : `(${selectedExcavator["size (in tones)"]}t digger)`;
          
          // Find tape1 task template with matching equipment
          const excavatorSize = selectedExcavator["size (in tones)"] || 0;
          const carrierSize = selectedCarrier ? selectedCarrier["size (in tones)"] || 0 : 0;
          const carrierType = selectedCarrier ? 
            (selectedCarrier.type === 'barrows_dumpers' ? 'barrow' : 'carrier') : '';

          // Log information for debugging
          console.log('Looking for tape1 task template with:', {
            excavatorSize,
            carrierSize,
            carrierType
          });

          let tape1TaskTemplate = null;

          if (selectedCarrier) {
            // Search for template with both excavator and carrier
            tape1TaskTemplate = taskTemplates.find(template => {
              const name = template.name.toLowerCase();
              const nameMatches = 
                name.includes('tape 1') || 
                name.includes('preparation') ||
                name.includes('type 1');
              const excavatorMatches = name.includes(`${excavatorSize}t`);
              const carrierMatches = name.includes(`${carrierSize}t`) && 
                                    (name.includes('barrow') || 
                                     name.includes('wheelbarrow') || 
                                     name.includes('carrier'));
              
              return nameMatches && excavatorMatches && carrierMatches;
            });
            
            console.log('Found tape1 template with carrier:', tape1TaskTemplate?.name || 'None');
            
            // If no exact match, try a looser match with just excavator size and carrier type
            if (!tape1TaskTemplate) {
              tape1TaskTemplate = taskTemplates.find(template => {
                const name = template.name.toLowerCase();
                const isPreparation = name.includes('tape 1') || 
                                      name.includes('preparation') || 
                                      name.includes('type 1');
                const hasExcavatorSize = name.includes(`${excavatorSize}t`);
                const hasCarrierType = selectedCarrier.type === 'barrows_dumpers' 
                  ? (name.includes('barrow') || name.includes('wheelbarrow'))
                  : name.includes('carrier');
                
                return isPreparation && hasExcavatorSize && hasCarrierType;
              });
              
              console.log('Found tape1 template with looser carrier match:', tape1TaskTemplate?.name || 'None');
            }
            
            // Fall back to just matching preparation with excavator size
            if (!tape1TaskTemplate) {
              tape1TaskTemplate = taskTemplates.find(template => {
                const name = template.name.toLowerCase();
                return (name.includes('tape 1') || name.includes('preparation') || name.includes('type 1')) && 
                       name.includes(`${excavatorSize}t`);
              });
              
              console.log('Found tape1 template with excavator size only:', tape1TaskTemplate?.name || 'None');
            }
          } else {
            // Search for template with just excavator
            tape1TaskTemplate = taskTemplates.find(template => {
              const name = template.name.toLowerCase();
              const nameMatches = 
                name.includes('tape 1') || 
                name.includes('preparation') ||
                name.includes('type 1');
              const excavatorMatches = name.includes(`${excavatorSize}t`);
              const noCarrierMention = !name.includes('carrier') && 
                                       !name.includes('barrow') && 
                                       !name.includes('wheelbarrow');
              
              return nameMatches && excavatorMatches && noCarrierMention;
            });
            
            console.log('Found tape1 template with just excavator:', tape1TaskTemplate?.name || 'None');
            
            // Fall back to just matching preparation with excavator size
            if (!tape1TaskTemplate) {
              tape1TaskTemplate = taskTemplates.find(template => {
                const name = template.name.toLowerCase();
                return (name.includes('tape 1') || name.includes('preparation') || name.includes('type 1')) && 
                       name.includes(`${excavatorSize}t`);
              });
              
              console.log('Found tape1 fallback template:', tape1TaskTemplate?.name || 'None');
            }
          }

          // Absolute fallback - just find any preparation task if everything else fails
          if (!tape1TaskTemplate) {
            tape1TaskTemplate = taskTemplates.find(template => {
              const name = template.name.toLowerCase();
              return name.includes('tape 1') || name.includes('preparation') || name.includes('type 1');
            });
            
            console.log('Found generic tape1 template as last resort:', tape1TaskTemplate?.name || 'None');
          }

          // Create Tape 1 Preparation task
          const { error: tape1TaskError } = await supabase
            .from('tasks_done')
            .insert({
              event_id: event.id,
              user_id: user?.id,
              name: `Tape 1 Preparation ${equipmentDetails}`,
              description: `Total Type 1 aggregate to prepare: ${totalTape1.toFixed(2)} tonnes`,
              unit: 'tonnes',
              amount: `${totalTape1.toFixed(2)} tonnes`,
              hours_worked: tape1ExcavationTime + tape1TransportTime,
              is_finished: false,
              event_task_id: tape1TaskTemplate?.id || null
            });

          if (tape1TaskError) {
            console.error('Error creating tape 1 preparation task:', tape1TaskError);
            throw new Error('Failed to create tape 1 preparation task');
          }
        }
      }

      // Process minor tasks
      for (const minorTask of minorTasks) {
        if (minorTask.template_id) {
          // Create task in tasks_done
          const { error: taskError } = await supabase
            .from('tasks_done')
            .insert({
              event_id: event.id,
              event_task_id: minorTask.template_id,
              user_id: user?.id,
              name: minorTask.name,
              description: minorTask.description || '',
              unit: minorTask.unit,
              amount: `${minorTask.quantity} ${minorTask.unit}`,
              hours_worked: minorTask.estimated_hours || 0,
              is_finished: false
            });

          if (taskError) {
            console.error('Error creating minor task:', taskError);
            throw new Error('Failed to create minor task');
          }

          // Process materials from minor task
          if (minorTask.results?.materials) {
            for (const material of minorTask.results.materials) {
              const { error: materialError } = await supabase
                .from('materials_delivered')
                .insert({
                  event_id: event.id,
                  amount: 0,
                  total_amount: material.quantity,
                  unit: material.unit,
                  status: 'pending',
                  name: material.name
                });

              if (materialError) {
                console.error('Error creating material:', materialError);
                throw new Error('Failed to create material');
              }
            }
          }
        }
      }

      // Process direct materials
      for (const material of materials) {
        if (material.template_id && material.quantity > 0) {
          const materialTemplate = materialTemplates.find(t => t.id === material.template_id);
          const { error: materialError } = await supabase
            .from('materials_delivered')
            .insert({
              event_id: event.id,
              amount: 0,
              total_amount: material.quantity,
              unit: material.unit || materialTemplate?.unit || '',
              status: 'pending',
              name: material.name || materialTemplate?.name || ''
            });

          if (materialError) {
            console.error('Error creating material:', materialError);
            throw new Error('Failed to create material');
          }
        }
      }

      // Navigate to projects page on success
      navigate('/projects');
    } catch (error) {
      console.error('Error creating event:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while creating the event');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Update the useEffect that calculates totals
  useEffect(() => {
    let soilTotal = 0;
    let tape1Total = 0;

    // Calculate from main tasks
    mainTasks.forEach(task => {
      if (task.results?.materials) {
        task.results.materials.forEach(material => {
          // Check for soil excavation
          if (material.name.toLowerCase().includes('soil')) {
            soilTotal += material.quantity;
          }
          // Check for tape1
          if (material.name.toLowerCase().includes('tape1') || 
              material.name.toLowerCase().includes('tape 1')) {
            tape1Total += material.quantity;
          }
        });
      }
      // Add totalTons if it exists (for soil excavation tasks)
      if (task.calculatorType === 'soil_excavation' && task.results?.totalTons) {
        soilTotal += task.results.totalTons;
      }
    });

    // Calculate from minor tasks
    minorTasks.forEach(task => {
      // Check if task name includes 'excavation' or 'preparation'
      const isExcavation = task.name.toLowerCase().includes('excavation');
      const isPreparation = task.name.toLowerCase().includes('preparation');

      if (task.results?.materials) {
        task.results.materials.forEach(material => {
          if (isExcavation && material.name.toLowerCase().includes('soil')) {
            // For excavation tasks, multiply by task quantity
            soilTotal += material.quantity * task.quantity;
          }
          if (isPreparation && (material.name.toLowerCase().includes('tape1') || 
              material.name.toLowerCase().includes('tape 1'))) {
            // For preparation tasks, multiply by task quantity
            tape1Total += material.quantity * task.quantity;
          }
        });
      } else if (isExcavation) {
        // If no materials but task is excavation, use quantity directly
        soilTotal += task.quantity;
      } else if (isPreparation) {
        // If no materials but task is preparation, use quantity directly
        tape1Total += task.quantity;
      }
    });

    setTotalSoilExcavation(soilTotal);
    setTotalTape1(tape1Total);
  }, [mainTasks, minorTasks]);

  // Update the total hours calculation to include minor tasks
  const calculateTotalHours = () => {
    let total = 0;

    // Add hours from main tasks
    mainTasks.forEach(task => {
      if (task.results?.taskBreakdown) {
        total += task.results.taskBreakdown.reduce((sum, breakdown) => sum + (breakdown.hours || 0), 0);
      }
    });

    // Add hours from minor tasks
    minorTasks.forEach(task => {
      if (task.results?.labor) {
        total += task.results.labor;
      } else if (task.estimated_hours) {
        total += task.estimated_hours * task.quantity;
      }
    });

    // Add additional excavation time if there is any
    if (extraSoilExcavation.area || extraSoilExcavation.weight) {
      const additionalTons = excavationMeasureType === 'area' 
        ? Number(extraSoilExcavation.area) * 1.5 // Convert m³ to tonnes (1.5 tonnes per m³)
        : Number(extraSoilExcavation.weight);

      if (additionalTons > 0 && selectedExcavator) {
        const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, additionalTons);
        const transportTime = excavationOption === 'removal' && selectedCarrier
          ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, additionalTons)
          : 0;
        total += excavationTime + transportTime;
      }
    }

    // Add soil excavation hours based on selected machinery
    if (selectedExcavator && totalSoilExcavation > 0) {
      const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalSoilExcavation);
      const transportTime = excavationOption === 'removal' && selectedCarrier
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalSoilExcavation)
        : 0;
      total += excavationTime + transportTime;
    }

    // Add tape 1 preparation hours based on selected machinery
    if (selectedExcavator && totalTape1 > 0) {
      const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalTape1);
      const transportTime = excavationOption === 'removal' && selectedCarrier
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalTape1)
        : 0;
      total += excavationTime + transportTime;
    }

    return total;
  };

  // Update the fetchEquipment function to use the correct table
  useEffect(() => {
    const fetchEquipment = async () => {
      try {
        // Fetch excavators
        const { data: excavatorData, error: excavatorError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'excavator');
        
        if (excavatorError) throw excavatorError;
        
        // Fetch carriers (barrows/dumpers)
        const { data: carrierData, error: carrierError } = await supabase
          .from('setup_digging')
          .select('*')
          .eq('type', 'barrows_dumpers');
        
        if (carrierError) throw carrierError;
        
        setExcavators(excavatorData || []);
        setCarriers(carrierData || []);
      } catch (error) {
        console.error('Error fetching equipment:', error);
      }
    };
    
    fetchEquipment();
  }, []);

  // Add calculation functions
  const findDiggerTimeEstimate = (sizeInTons: number, totalTons: number) => {
    if (sizeInTons <= 3) return totalTons * 0.5;
    if (sizeInTons <= 8) return totalTons * 0.35;
    return totalTons * 0.25;
  };

  const findCarrierTimeEstimate = (sizeInTons: number, totalTons: number) => {
    if (sizeInTons <= 3) return totalTons * 0.4;
    if (sizeInTons <= 8) return totalTons * 0.3;
    return totalTons * 0.2;
  };

  useEffect(() => {
    if (selectedExcavator && selectedCarrier) {
      // Calculate soil excavation hours
      const excavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalSoilExcavation);
      const transportTime = excavationOption === 'removal' 
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalSoilExcavation)
        : 0;
      
      setSoilExcavationHours(excavationTime + transportTime);

      // Calculate tape 1 preparation hours using the same equipment
      const tape1ExcavationTime = findDiggerTimeEstimate(selectedExcavator["size (in tones)"] || 0, totalTape1);
      const tape1TransportTime = excavationOption === 'removal'
        ? findCarrierTimeEstimate(selectedCarrier["size (in tones)"] || 0, totalTape1)
        : 0;
      
      setTape1Hours(tape1ExcavationTime + tape1TransportTime);
    }
  }, [selectedExcavator, selectedCarrier, excavationOption, totalSoilExcavation, totalTape1]);

  // Add useEffect for handling additional excavation
  useEffect(() => {
    const additionalSoil = excavationMeasureType === 'weight' 
      ? Number(extraSoilExcavation.weight) || 0
      : Number(extraSoilExcavation.area) * 1.5; // Assuming 1.5 tonnes per square meter, adjust as needed
    
    setTotalSoilExcavation(prev => {
      const baseAmount = mainTasks.reduce((total, task) => {
        if (task.results?.materials) {
          task.results.materials.forEach(material => {
            if (material.name.toLowerCase().includes('soil')) {
              total += material.quantity;
            }
          });
        }
        return total;
      }, 0);
      
      return baseAmount + additionalSoil;
    });
  }, [extraSoilExcavation, excavationMeasureType, mainTasks]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
        <BackButton />
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Project</h1>
          <button
          onClick={handleSubmit}
          disabled={!formData.title || !formData.start_date || !formData.end_date}
          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Event
          </button>
        </div>

        <div className="space-y-8">
          {/* Basic Information */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as FormData['status'] }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="planned">Planned</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="in_progress">In Progress</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Start Date</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">End Date</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    min={formData.start_date}
                    required
                  />
                </div>
              </div>

              <div className="flex space-x-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.has_equipment}
                    onChange={(e) => setFormData(prev => ({ ...prev, has_equipment: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Requires Equipment</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.has_materials}
                    onChange={(e) => setFormData(prev => ({ ...prev, has_materials: e.target.checked }))}
                    className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm text-gray-600">Requires Materials</span>
                </label>
              </div>
            </div>
          </div>

          {/* Main Tasks Section */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Main Tasks</h2>
              <button
                onClick={() => setShowMainTaskModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
              <Plus className="w-5 h-5" />
                Add Main Task
              </button>
            </div>

              {mainTasks.map((task, index) => (
            <div key={task.id} className="bg-gray-700 rounded-lg p-4 mb-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium text-white">{task.name}</h3>
                    <button
                      onClick={() => {
                    const updatedTasks = mainTasks.filter((_, i) => i !== index);
                    setMainTasks(updatedTasks);
                  }}
                  className="text-gray-400 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {task.results && (
                <>
                  {/* Task Breakdown */}
                  <div className="mb-4">
                    <h4 className="text-blue-300 mb-2">Task Breakdown:</h4>
                    {task.results.taskBreakdown?.map((breakdown, i) => (
                      <div key={i} className="flex justify-between text-gray-300">
                        <span>{breakdown.name}</span>
                        <span>{breakdown.hours.toFixed(2)} hours</span>
                          </div>
                        ))}
                    <div className="mt-2 pt-2 border-t border-gray-600">
                      <div className="flex justify-between text-white font-medium">
                        <span>Total Labor Hours</span>
                        <span>
                          {task.results.taskBreakdown?.reduce((sum, breakdown) => sum + (breakdown.hours || 0), 0).toFixed(2) || '0.00'} hours
                        </span>
                          </div>
                      </div>
                    </div>

                  {/* Materials */}
                  <div>
                    <h4 className="text-blue-300 mb-2">Materials Required:</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead>
                          <tr className="text-gray-400 text-sm">
                            <th className="text-left py-2">Material</th>
                            <th className="text-right py-2">Quantity</th>
                            <th className="text-left py-2">Unit</th>
                            <th className="text-right py-2">Price/Unit</th>
                            <th className="text-right py-2">Total Price</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-300">
                          {task.results.materials?.map((material, i) => (
                            <tr key={i}>
                              <td className="py-1">{material.name}</td>
                              <td className="text-right py-1">{material.quantity.toFixed(2)}</td>
                              <td className="pl-4 py-1">{material.unit}</td>
                              <td className="text-right py-1">£{(material.pricePerUnit || 0).toFixed(2)}</td>
                              <td className="text-right py-1">£{((material.pricePerUnit || 0) * material.quantity).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
                  )}
                </div>
              ))}
          </div>

          {/* Minor Tasks Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Minor Tasks</h2>
              <button
                onClick={handleAddMinorTask}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Minor Task
              </button>
            </div>

            <div className="space-y-4">
            {minorTasks
              .filter(task => !task.name.toLowerCase().includes('preparation') && !task.name.toLowerCase().includes('excavation'))
              .map((task, index) => (
                <div key={index} className="flex items-start space-x-4 bg-gray-50 p-4 rounded-lg">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Task Type</label>
                      <select
                        value={task.template_id}
                        onChange={(e) => {
                          const newTasks = [...minorTasks];
                          const selectedTemplate = taskTemplates.find(t => t.id === e.target.value);
                          newTasks[index] = {
                            ...newTasks[index],
                            template_id: e.target.value,
                            name: selectedTemplate?.name || '',
                            unit: selectedTemplate?.unit || '',
                            estimated_hours: selectedTemplate?.estimated_hours || 0,
                            results: null
                          };
                          setMinorTasks(newTasks);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      >
                        <option value="">Select a task type</option>
                      {taskTemplates
                        .filter(template => 
                          !template.name.toLowerCase().includes('preparation') && 
                          !template.name.toLowerCase().includes('excavation')
                        )
                        .map(template => (
                          <option key={template.id} value={template.id}>
                            {template.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {task.template_id && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Task Name</label>
                          <input
                            type="text"
                            value={task.name}
                            onChange={(e) => {
                              const newTasks = [...minorTasks];
                              newTasks[index].name = e.target.value;
                              setMinorTasks(newTasks);
                            }}
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700">Quantity</label>
                            <input
                              type="number"
                              min="1"
                              value={task.quantity}
                              onChange={(e) => {
                                const newTasks = [...minorTasks];
                                newTasks[index].quantity = parseInt(e.target.value) || 1;
                                newTasks[index].results = null;
                                setMinorTasks(newTasks);
                              }}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700">Unit</label>
                            <input
                              type="text"
                              value={task.unit}
                              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                              readOnly
                            />
                          </div>
                        </div>

                        {task.estimated_hours && !task.results && (
                          <div className="text-sm text-gray-600">
                            Estimated time: {formatTime(task.estimated_hours * task.quantity)}
                          </div>
                        )}

                        {task.results && (
                          <div className="mt-4 space-y-2">
                            <div className="text-sm font-medium text-green-600">Task Accepted</div>
                            <div className="text-sm">
                              Labor Hours: {formatTime(task.results.labor)}
                            </div>
                            {task.results.materials.map((material, i) => (
                              <div key={i} className="text-sm">
                                {material.name}: {material.quantity} {material.unit}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handleDeleteMinorTask(index)}
                      className="p-2 text-red-600 hover:text-red-700"
                      title="Delete Task"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Materials Section */}
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Materials</h2>
              <button
              onClick={() => setMaterials(prev => [...prev, { template_id: '', quantity: 1, confirmed: false }])}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Material
              </button>
            </div>

            <div className="space-y-4">
              {materials.map((material, index) => (
                <div key={index} className="flex items-start space-x-4 bg-gray-50 p-4 rounded-lg">
                  <div className="flex-1 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Material Type</label>
                      <select
                        value={material.template_id}
                        onChange={(e) => {
                          const newMaterials = [...materials];
                        const selectedTemplate = materialTemplates.find(t => t.id === e.target.value);
                        newMaterials[index] = {
                          template_id: e.target.value,
                          quantity: newMaterials[index].quantity,
                          name: selectedTemplate?.name,
                          unit: selectedTemplate?.unit,
                          price: selectedTemplate?.price,
                          description: selectedTemplate?.description,
                          confirmed: false
                        };
                          setMaterials(newMaterials);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      disabled={material.confirmed}
                      >
                        <option value="">Select a material</option>
                        {materialTemplates.map(template => (
                          <option key={template.id} value={template.id}>
                          {template.name} ({template.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                  {material.description && (
                    <div className="text-sm text-gray-600">
                      {material.description}
                    </div>
                  )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={material.quantity}
                        onChange={(e) => {
                          const newMaterials = [...materials];
                          newMaterials[index].quantity = parseInt(e.target.value) || 1;
                        newMaterials[index].confirmed = false;
                          setMaterials(newMaterials);
                        }}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                      disabled={material.confirmed}
                      />
                    </div>

                  {material.price !== undefined && material.price !== null && (
                    <div className="text-sm text-gray-600">
                      Price per unit: £{material.price.toFixed(2)}
                    </div>
                  )}
                  </div>

                <div className="flex flex-col gap-2">
                  {!material.confirmed ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!material.template_id || !material.quantity || material.quantity <= 0) return;
                          const newMaterials = [...materials];
                          newMaterials[index].confirmed = true;
                          setMaterials(newMaterials);
                        }}
                        disabled={!material.template_id || !material.quantity || material.quantity <= 0}
                        className="p-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Confirm Material"
                      >
                        <Check className="w-5 h-5" />
                      </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newMaterials = [...materials];
                      newMaterials.splice(index, 1);
                      setMaterials(newMaterials);
                    }}
                        className="p-2 text-red-600 hover:text-red-700"
                        title="Delete Material"
                  >
                    <X className="w-5 h-5" />
                  </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const newMaterials = [...materials];
                        newMaterials[index].confirmed = false;
                        setMaterials(newMaterials);
                      }}
                      className="p-2 text-blue-600 hover:text-blue-700"
                      title="Edit Material"
                    >
                      <Pencil className="w-5 h-5" />
                    </button>
                  )}
                </div>
                </div>
              ))}
            </div>
          </div>

        {/* Shared Equipment Selection */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Equipment Selection</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Excavation Machinery</label>
              <div className="space-y-2">
                {excavators.length === 0 ? (
                  <p className="text-gray-500">No excavators found</p>
                ) : (
                  excavators.map((excavator) => (
                    <div 
                      key={excavator.id}
                      className="flex items-center p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                      onClick={() => setSelectedExcavator(excavator)}
                    >
                      <div className={`w-4 h-4 rounded-full border mr-2 ${
                        selectedExcavator?.id === excavator.id 
                          ? 'border-gray-400' 
                          : 'border-gray-400'
                      }`}>
                        <div className={`w-2 h-2 rounded-full m-0.5 ${
                          selectedExcavator?.id === excavator.id 
                            ? 'bg-gray-400' 
                            : 'bg-transparent'
                        }`}></div>
                      </div>
                      <div>
                        <span className="text-gray-800">{excavator.name}</span>
                        <span className="text-sm text-gray-600 ml-2">({excavator["size (in tones)"]} tons)</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            {/* Only show Carrier Machinery for "Removal" option */}
            {excavationOption === 'removal' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Carrier Machinery</label>
                <div className="space-y-2">
                  {carriers.length === 0 ? (
                    <p className="text-gray-500">No carriers found</p>
                  ) : (
                    carriers.map((carrier) => (
                      <div 
                        key={carrier.id}
                        className="flex items-center p-2 cursor-pointer hover:bg-gray-50 rounded-md"
                        onClick={() => setSelectedCarrier(carrier)}
                      >
                        <div className={`w-4 h-4 rounded-full border mr-2 ${
                          selectedCarrier?.id === carrier.id 
                            ? 'border-gray-400' 
                            : 'border-gray-400'
                        }`}>
                          <div className={`w-2 h-2 rounded-full m-0.5 ${
                            selectedCarrier?.id === carrier.id 
                              ? 'bg-gray-400' 
                              : 'bg-transparent'
                          }`}></div>
                        </div>
                        <div>
                          <span className="text-gray-800">{carrier.name}</span>
                          <span className="text-sm text-gray-600 ml-2">({carrier["size (in tones)"]} tons)</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              // Empty div to maintain the grid layout when Carrier Machinery is hidden
              <div></div>
            )}
          </div>
        </div>

        {/* Soil Excavation Section */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Soil Excavation</h2>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-300">
              Based on all your tasks, amount of soil to be excavated will be approximately: {totalSoilExcavation.toFixed(2)} tonnes
            </p>
            <p className="text-gray-300">
              Estimated Time: <span className="font-medium">{formatTime(soilExcavationHours)}</span>
            </p>
          </div>

          {/* Excavation Options */}
          <div className="mt-4 mb-6">
            <h3 className="text-lg font-medium text-gray-800 mb-2">Excavation Type</h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="excavationOption"
                  value="removal"
                  checked={excavationOption === 'removal'}
                  onChange={(e) => setExcavationOption(e.target.value as 'removal' | 'pile')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Soil Excavation and Removal</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="excavationOption"
                  value="pile"
                  checked={excavationOption === 'pile'}
                  onChange={(e) => setExcavationOption(e.target.value as 'removal' | 'pile')}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-gray-700">Soil Excavation and Pile Up</span>
              </label>
            </div>
          </div>
              
              <div className="mt-4">
            <h3 className="text-lg font-medium text-gray-800 mb-2">
              Additional Excavation <span className="text-sm font-normal text-gray-600">(We calculate amount of soil to be excavated based for every single main tasks but if there is any exceeded amount of soil which is above final level of any of main tasks please describe it here)</span>

            </h3>
            
            <div className="space-y-4">
              <div className="flex space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="excavationMeasureType"
                    value="area"
                    checked={excavationMeasureType === 'area'}
                    onChange={(e) => setExcavationMeasureType(e.target.value as 'area' | 'weight')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Area (m³)</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="excavationMeasureType"
                    value="weight"
                    checked={excavationMeasureType === 'weight'}
                    onChange={(e) => setExcavationMeasureType(e.target.value as 'area' | 'weight')}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Weight (tonnes)</span>
                </label>
              </div>

              {excavationMeasureType === 'area' ? (
                    <input
                      type="number"
                      value={extraSoilExcavation.area}
                  onChange={(e) => setExtraSoilExcavation(prev => ({ ...prev, area: e.target.value, weight: '' }))}
                  placeholder="Enter area in m²"
                  className="block w-full rounded-md border-gray-300 bg-gray-700 text-white placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg py-3"
                    />
              ) : (
                    <input
                      type="number"
                      value={extraSoilExcavation.weight}
                  onChange={(e) => setExtraSoilExcavation(prev => ({ ...prev, weight: e.target.value, area: '' }))}
                  placeholder="Enter weight in tonnes"
                  className="block w-full rounded-md border-gray-300 bg-gray-700 text-white placeholder-gray-400 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-lg py-3"
                    />
              )}
                </div>
              </div>

              {/* Soil Excavation Results */}
              {mainTasks.some(task => task.calculatorType === 'soil_excavation' && task.results) && (
                <div className="mt-6 border-t pt-6">
                  <h3 className="text-lg font-medium text-gray-800 mb-4">Excavation Details</h3>
                  <div className="space-y-6">
                    {mainTasks
                      .filter(task => task.calculatorType === 'soil_excavation' && task.results)
                      .map((task, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-3">{task.name}</h4>
                          <div className="space-y-4">
                            {task.results?.totalTons && (
                              <div className="text-sm">
                                <span className="font-medium">Total Soil:</span> {task.results.totalTons.toFixed(2)} tonnes
                              </div>
                            )}
                            {task.results?.excavationTime && (
                              <div className="text-sm">
                                <span className="font-medium">Excavation Time:</span> {formatTime(task.results.excavationTime)}
                              </div>
                            )}
                            {task.results?.transportTime && (
                              <div className="text-sm">
                                <span className="font-medium">Transport Time:</span> {formatTime(task.results.transportTime)}
                              </div>
                            )}
                            {task.results?.totalTime && (
                              <div className="text-sm">
                                <span className="font-medium">Total Time:</span> {formatTime(task.results.totalTime)}
                              </div>
                            )}
                            {task.results?.equipmentUsed && (
                              <div className="text-sm space-y-1">
                                <div className="font-medium">Equipment Used:</div>
                                {task.results.equipmentUsed.excavator && (
                                  <div>Excavator: {task.results.equipmentUsed.excavator}</div>
                                )}
                                {task.results.equipmentUsed.carrier && (
                                  <div>Carrier: {task.results.equipmentUsed.carrier}</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

        {/* Tape 1 Preparation Section */}
        <div className="mb-8 bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Tape 1 Preparation</h2>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-300">
              Based on all your tasks, amount of Tape 1 will be approximately: {totalTape1.toFixed(2)} tonnes
            </p>
            <p className="text-gray-300">
              Estimated Time: <span className="font-medium">{formatTime(tape1Hours)}</span>
            </p>
            </div>
          </div>

          {/* Results Section */}
        <div className="mt-8 bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Total Results</h2>
          
          {/* Total Hours */}
          <div className="mb-6">
            <div className="flex justify-between text-white font-medium">
              <span>Total Labor Hours</span>
              <span>{calculateTotalHours().toFixed(2)} hours</span>
                          </div>
                            </div>

          {/* Combined Materials Table */}
          <div>
            <h3 className="text-blue-300 mb-2">Total Materials Required:</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="text-gray-400 text-sm">
                    <th className="text-left py-2">Material</th>
                    <th className="text-right py-2">Quantity</th>
                    <th className="text-left py-2">Unit</th>
                    <th className="text-right py-2">Price/Unit</th>
                    <th className="text-right py-2">Total Price</th>
                  </tr>
                </thead>
                <tbody className="text-gray-300">
                  {mainTasks.reduce((materials, task) => {
                    // Process main task materials
                    if (task.results?.materials) {
                      task.results.materials.forEach(material => {
                        const existingMaterial = materials.find(m => 
                          m.name === material.name && m.unit === material.unit
                        );
                        
                        // Find material price from materials table
                        const materialFromTable = materialTemplates?.find(m => m.name === material.name);
                        const pricePerUnit = materialFromTable?.price ?? 0;
                        const quantity = material.quantity ?? 0;
                        
                        if (existingMaterial) {
                          existingMaterial.quantity = (existingMaterial.quantity ?? 0) + quantity;
                          existingMaterial.totalPrice = existingMaterial.quantity * pricePerUnit;
                        } else {
                          materials.push({ 
                            ...material,
                            quantity,
                            pricePerUnit,
                            totalPrice: quantity * pricePerUnit,
                            description: materialFromTable?.description,
                            category: materialFromTable?.category
                          });
                        }
                      });
                    }

                    // Process additional excavation if this is the last task
                    if (task === mainTasks[mainTasks.length - 1]) {
                      if (extraSoilExcavation.area || extraSoilExcavation.weight) {
                        const additionalTons = excavationMeasureType === 'area' 
                          ? Number(extraSoilExcavation.area) * 1.5 // Convert area to tonnes (1.5 tonnes per m³)
                          : Number(extraSoilExcavation.weight);

                        if (additionalTons > 0) {
                          const soilMaterial = materialTemplates?.find(m => m.name.toLowerCase().includes('soil'));
                          const pricePerUnit = soilMaterial?.price || 0;
                          
                          // Find existing soil excavation material
                          const existingSoilMaterial = materials.find(m => 
                            m.name.toLowerCase().includes('soil') && m.unit === 'tonnes'
                          );

                          if (existingSoilMaterial) {
                            existingSoilMaterial.quantity += additionalTons;
                            existingSoilMaterial.totalPrice = existingSoilMaterial.quantity * pricePerUnit;
                          } else {
                            materials.push({
                              name: 'Soil Excavation',
                              quantity: additionalTons,
                              unit: 'tonnes',
                              pricePerUnit,
                              totalPrice: additionalTons * pricePerUnit,
                              description: soilMaterial?.description,
                              category: soilMaterial?.category
                            });
                          }
                        }
                      }
                    }
                    
                    return materials;
                  }, [] as { name: string; quantity: number; unit: string; pricePerUnit: number; totalPrice: number; description?: string; category?: string }[])
                  .concat(
                    // Add materials from minor tasks
                    minorTasks.reduce((materials, task) => {
                      if (task.results?.materials) {
                        task.results.materials.forEach(material => {
                          const existingMaterial = materials.find(m => 
                            m.name === material.name && m.unit === material.unit
                          );
                          
                          // Find material price from materials table
                          const materialFromTable = materialTemplates?.find(m => m.name === material.name);
                          const pricePerUnit = materialFromTable?.price ?? 0;
                          const quantity = material.quantity ?? 0;
                          
                          if (existingMaterial) {
                            existingMaterial.quantity = (existingMaterial.quantity ?? 0) + quantity;
                            existingMaterial.totalPrice = existingMaterial.quantity * pricePerUnit;
                          } else {
                            materials.push({ 
                              ...material,
                              quantity,
                              pricePerUnit,
                              totalPrice: quantity * pricePerUnit,
                              description: materialFromTable?.description,
                              category: materialFromTable?.category
                            });
                          }
                        });
                      }
                      return materials;
                    }, [] as { name: string; quantity: number; unit: string; pricePerUnit: number; totalPrice: number; description?: string; category?: string }[])
                  )
                  // Add directly added confirmed materials
                  .concat(
                    materials
                      .filter(material => material.confirmed)
                      .map(material => {
                        const materialFromTable = materialTemplates?.find(t => t.id === material.template_id);
                        const pricePerUnit = materialFromTable?.price ?? 0;
                        return {
                          name: material.name || materialFromTable?.name || '',
                          quantity: material.quantity,
                          unit: material.unit || materialFromTable?.unit || '',
                          pricePerUnit,
                          totalPrice: material.quantity * pricePerUnit,
                          description: material.description || materialFromTable?.description,
                          category: materialFromTable?.category
                        };
                      })
                  )
                  .reduce((merged, material) => {
                    // Merge any duplicate materials after concatenation
                    const existingMaterial = merged.find(m => 
                      m.name === material.name && m.unit === material.unit
                    );
                    
                    if (existingMaterial) {
                      existingMaterial.quantity += material.quantity;
                      existingMaterial.totalPrice = existingMaterial.quantity * existingMaterial.pricePerUnit;
                    } else {
                      merged.push(material);
                    }
                    
                    return merged;
                  }, [] as { name: string; quantity: number; unit: string; pricePerUnit: number; totalPrice: number; description?: string; category?: string }[])
                  .map((material, i) => (
                    <tr key={i}>
                      <td className="py-1">
                        <div>{material.name}</div>
                        {material.description && <div className="text-sm text-gray-400">{material.description}</div>}
                        {material.category && <div className="text-sm text-gray-400">Category: {material.category}</div>}
                      </td>
                      <td className="text-right py-1">{(material.quantity ?? 0).toFixed(2)}</td>
                      <td className="pl-4 py-1">{material.unit}</td>
                      <td className="text-right py-1">£{(material.pricePerUnit ?? 0).toFixed(2)}</td>
                      <td className="text-right py-1">£{(material.totalPrice ?? 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {showMainTaskModal && (
        <MainTaskModal
          onClose={() => setShowMainTaskModal(false)}
          onAddTask={handleAddMainTask}
          calculatorGroups={calculatorGroups}
        />
      )}

      {showCalculatorModal && selectedMainTask && (
        <CalculatorModal
          calculatorType={selectedMainTask.calculatorType}
          calculatorSubType={selectedMainTask.calculatorSubType}
          onClose={() => {
            setShowCalculatorModal(false);
            setSelectedMainTask(null);
          }}
          onSaveResults={handleSaveCalculatorResults}
        />
      )}

      {showNamePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Enter Task Name</h3>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Enter task name"
              className="w-full p-2 border rounded mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTaskName('');
                  setTempMainTask(null);
                  setShowNamePrompt(false);
                }}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmTaskName}
                disabled={!taskName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectCreating;
