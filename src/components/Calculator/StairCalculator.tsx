import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { AlertCircle } from 'lucide-react';
import StandardStairsSlabs from './StandardStairsSlabs';

interface Material {
  name: string;
  amount: number;
  unit: string;
  price_per_unit: number | null;
  total_price: number | null;
  courseDetails?: {step: number; blocks: number; rows: number; material: string; mortarHeight: number; needsCutting?: boolean}[];
}

interface MaterialOption {
  id: string;
  name: string;
  height: number; // cm
  width: number; // cm
  length: number; // cm
  isInches: boolean;
}

interface StairResult {
  totalSteps: number;
  totalLength: number;
  materials: Material[];
  stepDimensions: {
    height: number;
    tread: number;
    isFirst: boolean;
  }[];
  totalWidth?: number;
  sideOverhang: number;
}

interface StairCalculatorProps {
  onResultsChange?: (results: any) => void;
}

const StairCalculator: React.FC<StairCalculatorProps> = ({ onResultsChange }) => {
  // Input measurements
  const [totalHeight, setTotalHeight] = useState<string>('');
  const [totalWidth, setTotalWidth] = useState<string>('');
  const [stepTread, setStepTread] = useState<string>('');
  const [stepHeight, setStepHeight] = useState<string>('');
  const [slabThicknessTop, setSlabThicknessTop] = useState<string>('');
  const [slabThicknessSide, setSlabThicknessSide] = useState<string>('');
  const [slabThicknessFront, setSlabThicknessFront] = useState<string>('');
  const [overhangFront, setOverhangFront] = useState<string>('');
  const [overhangSide, setOverhangSide] = useState<string>('');
  
  // Side options
  const [buildLeftSide, setBuildLeftSide] = useState<boolean>(true);
  const [buildRightSide, setBuildRightSide] = useState<boolean>(true);
  const [buildBackSide, setBuildBackSide] = useState<boolean>(false);
  
  // Step configuration
  const [stepConfig, setStepConfig] = useState<'frontsOnTop' | 'stepsToFronts'>('frontsOnTop');
  
  // Brick orientation (kept for calculations but removed from UI)
  const [brickOrientation, setBrickOrientation] = useState<'flat' | 'side'>('flat');
  
  // Material selection - updated to allow multiple materials
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>(['blocks4', 'blocks7']);
  
  // Material options
  const materialOptions: MaterialOption[] = [
    {
      id: 'blocks4',
      name: '4-inch Blocks',
      height: 21, // cm
      width: 10, // cm
      length: 44, // cm
      isInches: true
    },
    {
      id: 'blocks7',
      name: '7-inch Blocks',
      height: 21, // cm
      width: 14, // cm
      length: 44, // cm
      isInches: true
    },
    {
      id: 'bricks',
      name: 'Standard Bricks (9x6x21)',
      height: 6, // cm
      width: 9, // cm
      length: 21, // cm
      isInches: false
    }
  ];
  
  // Define acceptable mortar thickness range
  const mortarRange = {
    min: 0.5, // Minimum acceptable mortar thickness in cm
    max: 3    // Maximum acceptable mortar thickness in cm
  };
  
  // Results
  const [result, setResult] = useState<StairResult | null>(null);
  const [calculationError, setCalculationError] = useState<string | null>(null);
  
  // Handle material selection toggle
  const toggleMaterial = (materialId: string) => {
    setSelectedMaterials(prev => {
      if (prev.includes(materialId)) {
        return prev.filter(id => id !== materialId);
      } else {
        return [...prev, materialId];
      }
    });
  };
  
  // Calculate the stair dimensions and materials
  const calculate = () => {
    setCalculationError(null);
    
    // Validate inputs
    if (!totalHeight || !totalWidth || !stepTread || !stepHeight || 
        !slabThicknessTop || !slabThicknessSide || !slabThicknessFront || 
        !overhangFront || !overhangSide) {
      setCalculationError('Please fill in all required measurements');
      return;
    }
    
    if (selectedMaterials.length === 0) {
      setCalculationError('Please select at least one material');
      return;
    }
    
    try {
      // Parse input values to numbers
      const totalHeightNum = parseFloat(totalHeight);
      const totalWidthNum = parseFloat(totalWidth);
      const stepTreadNum = parseFloat(stepTread);
      const stepHeightNum = parseFloat(stepHeight);
      const slabThicknessTopNum = parseFloat(slabThicknessTop);
      const slabThicknessSideNum = parseFloat(slabThicknessSide);
      const slabThicknessFrontNum = parseFloat(slabThicknessFront);
      const overhangFrontNum = parseFloat(overhangFront);
      const overhangSideNum = parseFloat(overhangSide);
      
      // Calculate number of steps needed
      // Accounting for slab thickness on top of each step
      const adjustedTotalHeight = totalHeightNum - slabThicknessTopNum;
      const rawStepCount = adjustedTotalHeight / stepHeightNum;
      const stepCount = Math.round(rawStepCount);
      
      if (stepCount <= 0) {
        setCalculationError('Invalid step count. Please check your measurements.');
        return;
      }
      
      // Calculate actual step height to ensure uniform steps
      // First step is shorter, rest are the same height
      const regularStepHeight = stepHeightNum;
      const firstStepHeight = adjustedTotalHeight - (regularStepHeight * (stepCount - 1));
      
      // Calculate total length of stairs
      // Each step tread needs to account for slab thickness and overhang
      const adjustedStepTread = stepTreadNum - overhangFrontNum;
      
      // Calculate total length based on step configuration
      let totalLength = 0;
      if (stepConfig === 'frontsOnTop') {
        // All steps have the same tread except the last one which is shorter by the slab thickness
        const regularStepTread = adjustedStepTread;
        const lastStepTread = adjustedStepTread - slabThicknessFrontNum;
        totalLength = (regularStepTread * (stepCount - 1)) + lastStepTread;
      } else {
        // When steps come to fronts, the last step is shorter by the slab thickness
        const regularStepTread = adjustedStepTread;
        const lastStepTread = adjustedStepTread - slabThicknessFrontNum;
        totalLength = (regularStepTread * (stepCount - 1)) + lastStepTread;
      }
      
      // Calculate actual width of each step
      // Need to subtract side overhangs and slab thickness
      const actualStepWidth = totalWidthNum - (buildLeftSide ? (overhangSideNum + slabThicknessSideNum) : 0) 
                                          - (buildRightSide ? (overhangSideNum + slabThicknessSideNum) : 0);
      
      if (actualStepWidth <= 0) {
        setCalculationError('Invalid step width. Please check your measurements.');
        return;
      }
      
      // Calculate materials needed
      let materials: Material[] = [];
      
      // Create array to store dimensions of each step
      const stepDimensions: {height: number; tread: number; isFirst: boolean}[] = [];
      
      // Create array to store the best material for each step
      const bestMaterialsForSteps: {
        step: number;
        materialId: string;
        blocks: number;
        rows: number;
        mortarHeight: number;
        needsCutting: boolean;
      }[] = [];
      
      // First pass: Find the best material for each step
      for (let i = 0; i < stepCount; i++) {
        // Use different height for first step
        const actualStepHeight = i === 0 ? firstStepHeight : regularStepHeight;
        
        // Find the best material for this step height to minimize cutting
        let bestMaterialId = selectedMaterials[0];
        let bestMortarHeight = 0;
        let bestBlockCount = 0;
        let needsCutting = true;
        
        // First try to find options without cutting
        selectedMaterials.forEach(materialId => {
          const materialOption = materialOptions.find(m => m.id === materialId);
          if (!materialOption) return;
          
          // Use width or height based on orientation for bricks
          let blockHeightWhenFlat = materialOption.width;
          
          // For bricks, use the selected orientation
          if (materialOption.id === 'bricks') {
            // When bricks are laid flat, use the height (6cm) as the height
            // When bricks are on side, use the width (9cm) as the height
            blockHeightWhenFlat = brickOrientation === 'flat' ? materialOption.height : materialOption.width;
          }
          
          // Try different block counts to find one that gives an acceptable mortar thickness
          // Start with the maximum number of blocks that would fit and work down
          const maxBlocksNeeded = Math.floor(actualStepHeight / blockHeightWhenFlat);
          
          // Special case: If step height exactly matches brick height (for flat bricks = 9cm)
          if (materialOption.id === 'bricks' && brickOrientation === 'flat' && 
              Math.abs(actualStepHeight - blockHeightWhenFlat) < 0.1) {
            bestMaterialId = materialId;
            bestMortarHeight = 0; // No mortar needed for height
            bestBlockCount = 1;
            needsCutting = false;
            return; // Perfect match, no need to check further
          }
          
          for (let blocksNeeded = maxBlocksNeeded; blocksNeeded > 0; blocksNeeded--) {
            const totalBlockHeight = blocksNeeded * blockHeightWhenFlat;
            const remainingHeight = actualStepHeight - totalBlockHeight;
            
            // Check if the remaining height falls within our acceptable mortar range
            if (remainingHeight >= mortarRange.min && remainingHeight <= mortarRange.max) {
              // This is a good fit with reasonable mortar thickness
              if (!needsCutting || bestMortarHeight === 0 || 
                  (Math.abs(remainingHeight - 1) < Math.abs(bestMortarHeight - 1))) {
                bestMaterialId = materialId;
                bestMortarHeight = remainingHeight;
                bestBlockCount = blocksNeeded;
                needsCutting = false;
              }
              
              // If we found a solution very close to the ideal mortar height (1cm), use it
              if (Math.abs(remainingHeight - 1) < 0.3) {
                bestMaterialId = materialId;
                bestMortarHeight = remainingHeight;
                bestBlockCount = blocksNeeded;
                needsCutting = false;
                return; // This is close to ideal, no need to check further
              }
            }
          }
          
          // Special case for bricks in flat orientation (6cm height)
          // If the step height is close to a multiple of 6cm, we can use flat bricks without cutting
          if (materialOption.id === 'bricks' && brickOrientation === 'flat') {
            const brickHeight = materialOption.height; // 6cm
            // Check if step height is close to a multiple of brick height
            const closestMultiple = Math.round(actualStepHeight / brickHeight);
            const difference = Math.abs(actualStepHeight - (closestMultiple * brickHeight));
            
            // If we're within 3cm (max mortar thickness), we can use mortar to make up the difference
            if (difference <= mortarRange.max && closestMultiple > 0) {
              bestMaterialId = materialId;
              bestBlockCount = closestMultiple;
              bestMortarHeight = difference;
              needsCutting = false;
              
              // If this is a very good fit, return immediately
              if (difference <= 1.5) {
                return;
              }
            }
          }
        });
        
        // If we still need cutting, choose the option with least waste
        if (needsCutting) {
          selectedMaterials.forEach(materialId => {
            const materialOption = materialOptions.find(m => m.id === materialId);
            if (!materialOption) return;
            
            // Use width or height based on orientation for bricks
            let blockHeightWhenFlat = materialOption.width;
            
            // For bricks, use the selected orientation
            if (materialOption.id === 'bricks') {
              // When bricks are laid flat, use the height (6cm) as the height
              // When bricks are on side, use the width (9cm) as the height
              blockHeightWhenFlat = brickOrientation === 'flat' ? materialOption.height : materialOption.width;
            }
            
            // Special case for bricks in flat orientation (6cm height)
            // If the step height is close to a multiple of 6cm, we can use flat bricks without cutting
            if (materialOption.id === 'bricks' && brickOrientation === 'flat') {
              const brickHeight = materialOption.height; // 6cm
              // Check if step height is close to a multiple of brick height
              const closestMultiple = Math.round(actualStepHeight / brickHeight);
              const difference = Math.abs(actualStepHeight - (closestMultiple * brickHeight));
              
              // If we're within 3cm (max mortar thickness), we can use mortar to make up the difference
              if (difference <= mortarRange.max && closestMultiple > 0) {
                bestMaterialId = materialId;
                bestBlockCount = closestMultiple;
                bestMortarHeight = difference;
                needsCutting = false;
                return; // This is a good solution, no need to check further
              }
            }
            
            const currentBlockCount = Math.ceil(actualStepHeight / blockHeightWhenFlat);
            const currentMortarHeight = (currentBlockCount * blockHeightWhenFlat) - actualStepHeight;
            
            // Initialize best values if this is the first option we're checking
            if (bestBlockCount === 0) {
              bestMaterialId = materialId;
              bestMortarHeight = currentMortarHeight;
              bestBlockCount = currentBlockCount;
            } 
            // Otherwise, compare to see if this option is better
            else if (currentMortarHeight < bestMortarHeight) {
              bestMaterialId = materialId;
              bestMortarHeight = currentMortarHeight;
              bestBlockCount = currentBlockCount;
            }
          });
        }
        
        // Store the best material for this step
        bestMaterialsForSteps.push({
          step: i + 1,
          materialId: bestMaterialId,
          blocks: bestBlockCount,
          rows: 0,
          mortarHeight: bestMortarHeight,
          needsCutting: needsCutting
        });
        
        // Determine step tread based on configuration and position
        let stepTread = adjustedStepTread;
        if ((stepConfig === 'stepsToFronts' || stepConfig === 'frontsOnTop') && i === stepCount - 1) {
          // Last step is shorter when steps come to fronts or when fronts are on top
          stepTread = adjustedStepTread - slabThicknessFrontNum;
        }
        
        // Store the dimensions of this step
        stepDimensions.push({
          height: actualStepHeight,
          tread: stepTread,
          isFirst: i === 0
        });
      }
      
      // Second pass: Calculate blocks needed for each step using the best material
      // Group by material type
      const materialCounts: Record<string, {
        totalBlocks: number;
        courseDetails: {step: number; blocks: number; rows: number; material: string; mortarHeight: number; needsCutting: boolean}[];
      }> = {};
      
      // Initialize material counts
      selectedMaterials.forEach(materialId => {
        materialCounts[materialId] = {
          totalBlocks: 0,
          courseDetails: []
        };
      });
      
      // Calculate blocks for each step using the best material
      bestMaterialsForSteps.forEach(bestMaterial => {
        const i = bestMaterial.step - 1; // Convert to 0-indexed
        const materialOption = materialOptions.find(m => m.id === bestMaterial.materialId);
        if (!materialOption) return;
        
        // Get block dimensions
        // Use width as height when laying blocks flat (default)
        let blockHeight = materialOption.width;
        let blockWidth = materialOption.height; // When laid flat, height becomes width
        
        // For bricks, use the selected orientation
        if (materialOption.id === 'bricks') {
          if (brickOrientation === 'flat') {
            // When flat, height (6cm) becomes height, width (9cm) becomes width
            blockHeight = materialOption.height;
            blockWidth = materialOption.width;
          } else {
            // When on side, width (9cm) becomes height, height (6cm) becomes width
            blockHeight = materialOption.width;
            blockWidth = materialOption.height;
          }
        }
        
        const blockLength = materialOption.length;
        
        // Determine step tread based on configuration and position
        let stepTread = adjustedStepTread;
        if ((stepConfig === 'stepsToFronts' || stepConfig === 'frontsOnTop') && i === stepCount - 1) {
          // Last step is shorter when steps come to fronts or when fronts are on top
          stepTread = adjustedStepTread - slabThicknessFrontNum;
        }
        
        // Calculate the remaining length for this step
        // For each step, we need to calculate how much of the stair is left
        // Total length - sum of treads of steps before this one
        let previousStepsLength = 0;
        for (let j = 0; j < i; j++) {
          // Use the step dimensions we calculated earlier
          const stepDim = stepDimensions[j];
          previousStepsLength += stepDim.tread;
        }
        
        // Calculate the remaining length for this step
        const totalStairLength = totalLength;
        const remainingLength = totalStairLength - previousStepsLength;
        
        // Calculate front blocks - adjust width for side blocks if they exist
        let frontWidth = totalWidthNum;
        if (buildLeftSide) {
          // Subtract 20cm for the side block
          frontWidth -= 20;
        }
        if (buildRightSide) {
          // Subtract 20cm for the side block
          frontWidth -= 20;
        }
        
        // Ensure frontWidth is not negative
        frontWidth = Math.max(0, frontWidth);
        
        // Calculate number of rows for this step
        // Each step has as many rows as there are steps left (including this one)
        const rowsForThisStep = stepCount - i;
        
        // Calculate blocks needed for each row of the front
        // Account for 1cm mortar joints between blocks
        const effectiveBlockLength = blockLength + 1; // Add 1cm for mortar joint
        const blocksPerRow = Math.ceil(frontWidth / effectiveBlockLength);
        
        // Total front blocks is blocks per row times number of rows times blocks per course height
        const frontBlocks = blocksPerRow * rowsForThisStep * bestMaterial.blocks;
        
        // Calculate blocks for sides (if needed)
        let sideBlocks = 0;
        if (buildLeftSide || buildRightSide) {
          // Calculate blocks needed for each side based on the remaining length
          const effectiveBlockLength = blockLength + 1; // Add 1cm for mortar joint
          const blocksPerSide = Math.ceil(remainingLength / effectiveBlockLength);
          
          // Add blocks for left side if needed
          if (buildLeftSide) {
            sideBlocks += bestMaterial.blocks * Math.max(1, blocksPerSide);
          }
          
          // Add blocks for right side if needed
          if (buildRightSide) {
            sideBlocks += bestMaterial.blocks * Math.max(1, blocksPerSide);
          }
        }
        
        // Calculate blocks for back (if needed)
        // Only calculate back blocks for steps after the first one
        let backBlocks = 0;
        if (buildBackSide && i > 0) {
          // Adjust width for blocks on the sides
          const backWidth = totalWidthNum - (buildLeftSide ? blockWidth : 0) - (buildRightSide ? blockWidth : 0);
          // Account for 1cm mortar joints between blocks
          const effectiveBlockLength = blockLength + 1; // Add 1cm for mortar joint
          // For back blocks, we only need one row per step
          backBlocks = Math.ceil(backWidth / effectiveBlockLength) * bestMaterial.blocks;
        }
        
        // Add up blocks for this step
        const stepBlocks = frontBlocks + sideBlocks + backBlocks;
        
        // Add to the material counts
        materialCounts[bestMaterial.materialId].totalBlocks += stepBlocks;
        materialCounts[bestMaterial.materialId].courseDetails.push({
          step: bestMaterial.step,
          blocks: stepBlocks,
          rows: rowsForThisStep,
          material: materialOption.name,
          mortarHeight: bestMaterial.mortarHeight,
          needsCutting: bestMaterial.needsCutting
        });
      });
      
      // Create materials array from the counts
      Object.entries(materialCounts).forEach(([materialId, data]) => {
        if (data.totalBlocks > 0) {
          const materialOption = materialOptions.find(m => m.id === materialId);
          if (!materialOption) return;
          
          materials.push({
            name: materialOption.name,
            amount: data.totalBlocks,
            unit: 'pieces',
            price_per_unit: null,
            total_price: null,
            courseDetails: data.courseDetails
          });
        }
      });
      
      // Calculate mortar needed
      // Typical mortar joint is 1cm thick
      // Estimate mortar volume based on number of blocks and average joint size
      const totalBlockCount = materials.reduce((sum, material) => sum + material.amount, 0);
      const mortarPerBlock = 0.5; // kg per block (approximate)
      const totalMortar = totalBlockCount * mortarPerBlock;
      
      materials.push({
        name: 'Mortar',
        amount: totalMortar,
        unit: 'kg',
        price_per_unit: null,
        total_price: null
      });
      
      // Set the result
      setResult({
        totalSteps: stepCount,
        totalLength: totalLength,
        materials: materials,
        stepDimensions: stepDimensions,
        totalWidth: totalWidthNum,
        sideOverhang: overhangSideNum
      });
      
      // Add useEffect to notify parent of result changes
      useEffect(() => {
        if (totalHours !== null && materials.length > 0) {
          const formattedResults = {
            name: 'Stair Installation',
            amount: parseFloat(totalSteps) || 0,
            hours_worked: totalHours,
            materials: materials.map(material => ({
              name: material.name,
              quantity: material.amount,
              unit: material.unit
            })),
            taskBreakdown: taskBreakdown.map(task => ({
              task: task.task,
              hours: task.hours
            }))
          };

          // Store results in data attribute
          const calculatorElement = document.querySelector('[data-calculator-results]');
          if (calculatorElement) {
            calculatorElement.setAttribute('data-results', JSON.stringify(formattedResults));
          }

          // Notify parent component
          if (onResultsChange) {
            onResultsChange(formattedResults);
          }
        }
      }, [totalHours, materials, taskBreakdown, totalSteps, onResultsChange]);
      
    } catch (error) {
      console.error('Calculation error:', error);
      setCalculationError('An error occurred during calculation. Please check your inputs.');
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="bg-gray-100 p-4 rounded-lg relative">
        <h3 className="text-lg font-medium text-gray-800 mb-2">Important Information</h3>
        <p className="text-sm text-gray-700">
          This calculator accounts for slab thickness and adhesive on each step. These built stairs will be shorter than raw measurements but after adding slabs will be exact same like measurements.
          All measurements should be in centimeters.
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-800">Measurements (in cm)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Height
              </label>
              <input
                type="number"
                value={totalHeight}
                onChange={(e) => setTotalHeight(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Width
              </label>
              <input
                type="number"
                value={totalWidth}
                onChange={(e) => setTotalWidth(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Step Tread
              </label>
              <input
                type="number"
                value={stepTread}
                onChange={(e) => setStepTread(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Step Height
              </label>
              <input
                type="number"
                value={stepHeight}
                onChange={(e) => setStepHeight(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Slab & Adhesive Thickness (in cm)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Top of Step
              </label>
              <input
                type="number"
                value={slabThicknessTop}
                onChange={(e) => setSlabThicknessTop(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Side of Step
              </label>
              <input
                type="number"
                value={slabThicknessSide}
                onChange={(e) => setSlabThicknessSide(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Front of Step
              </label>
              <input
                type="number"
                value={slabThicknessFront}
                onChange={(e) => setSlabThicknessFront(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Overhang (in cm)</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Front Overhang
              </label>
              <input
                type="number"
                value={overhangFront}
                onChange={(e) => setOverhangFront(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Side Overhang
              </label>
              <input
                type="number"
                value={overhangSide}
                onChange={(e) => setOverhangSide(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="cm"
                min="0"
                step="0.1"
              />
            </div>
          </div>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-800">Sides to Build</h3>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="checkbox"
                id="leftSide"
                checked={buildLeftSide}
                onChange={(e) => setBuildLeftSide(e.target.checked)}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="leftSide" className="ml-2 text-sm text-gray-700">
                Left Side
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="rightSide"
                checked={buildRightSide}
                onChange={(e) => setBuildRightSide(e.target.checked)}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="rightSide" className="ml-2 text-sm text-gray-700">
                Right Side
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="backSide"
                checked={buildBackSide}
                onChange={(e) => setBuildBackSide(e.target.checked)}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="backSide" className="ml-2 text-sm text-gray-700">
                Back Side
              </label>
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Step Configuration</h3>
          
          <div className="space-y-2">
            <div className="flex items-center">
              <input
                type="radio"
                id="frontsOnTop"
                checked={stepConfig === 'frontsOnTop'}
                onChange={() => setStepConfig('frontsOnTop')}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="frontsOnTop" className="ml-2 text-sm text-gray-700">
                Fronts on top of steps
              </label>
            </div>
            
            <div className="flex items-center">
              <input
                type="radio"
                id="stepsToFronts"
                checked={stepConfig === 'stepsToFronts'}
                onChange={() => setStepConfig('stepsToFronts')}
                className="h-4 w-4 text-gray-600 rounded"
              />
              <label htmlFor="stepsToFronts" className="ml-2 text-sm text-gray-700">
                Steps coming to the fronts
              </label>
            </div>
          </div>
          
          <h3 className="text-lg font-medium text-gray-800 mt-4">Material Selection (Select one or more)</h3>
          
          <div className="space-y-2">
            {materialOptions.map(material => (
              <div key={material.id} className="flex items-center">
                <input
                  type="checkbox"
                  id={material.id}
                  checked={selectedMaterials.includes(material.id)}
                  onChange={() => toggleMaterial(material.id)}
                  className="h-4 w-4 text-gray-600 rounded"
                />
                <label htmlFor={material.id} className="ml-2 text-sm text-gray-700">
                  {material.name}
                </label>
              </div>
            ))}
          </div>
          
          <div className="mt-6">
            <button
              onClick={calculate}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Calculate
            </button>
          </div>
        </div>
      </div>
      
      {calculationError && (
        <div className="bg-red-50 p-4 rounded-lg flex items-start">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
          <p className="text-red-700">{calculationError}</p>
        </div>
      )}
      
      {result && (
        <div className="bg-gray-800 p-6 rounded-lg text-white">
          <h3 className="text-xl font-semibold text-white mb-4">Results</h3>
          
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-3 w-full">
              <h4 className="text-lg font-medium text-white mb-3">Step Details</h4>
              <div className="overflow-x-auto border border-gray-700 rounded-lg w-full">
                <table className="w-full table-fixed bg-gray-700 rounded-lg">
                  <colgroup>
                    <col className="w-16" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="py-2 px-4 text-left text-gray-300">Step</th>
                      <th className="py-2 px-4 text-left text-gray-300">Height (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Tread (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Length (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Mortar (cm)</th>
                      <th className="py-2 px-4 text-left text-gray-300">Materials</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.stepDimensions.map((step, index) => {
                      // Find course details for this step across all materials
                      const stepCourseDetails = result.materials
                        .filter(m => m.courseDetails)
                        .flatMap(m => m.courseDetails || [])
                        .filter(c => c.step === index + 1);
                      
                      // Calculate total length for this step
                      // This is the length from the start to the end of this step
                      let previousStepsLength = 0;
                      for (let j = 0; j < index; j++) {
                        previousStepsLength += result.stepDimensions[j].tread;
                      }
                      const totalLength = previousStepsLength + step.tread;
                      
                      // Display length in opposite order - first step has the longest length
                      const displayLength = result.totalLength - previousStepsLength;
                      
                      return (
                        <tr key={index} className={index % 2 === 0 ? "bg-gray-750" : "bg-gray-700"}>
                          <td className="py-2 px-4 border-t border-gray-600">{index + 1}</td>
                          <td className="py-2 px-4 border-t border-gray-600">{step.height.toFixed(2)}</td>
                          <td className="py-2 px-4 border-t border-gray-600">{step.tread.toFixed(2)}</td>
                          <td className="py-2 px-4 border-t border-gray-600">{displayLength.toFixed(2)}</td>
                          <td className="py-2 px-4 border-t border-gray-600">
                            {stepCourseDetails.map((course, idx) => (
                              <div key={idx}>
                                {course.mortarHeight.toFixed(2)}
                              </div>
                            ))}
                          </td>
                          <td className="py-2 px-4 border-t border-gray-600">
                            {stepCourseDetails.map((course, idx) => (
                              <div key={idx} className={course.needsCutting ? "text-yellow-400" : ""}>
                                {course.blocks} x {course.material === 'Standard Bricks (9x6x21)' ? 'brick' : course.material} {course.material === 'Standard Bricks (9x6x21)' ? 
                                  (course.mortarHeight === 9 || step.height === 9 ? 'laid on side' : 'laid flat') : 
                                  ''}
                                {course.needsCutting && " (needs cutting)"}
                              </div>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="lg:col-span-1">
              <h4 className="text-lg font-medium text-white mb-2">Total Materials Needed</h4>
              <div className="space-y-3 bg-gray-700 p-4 rounded-lg">
                {result.materials.map((material, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-gray-300">{material.name}:</span>
                    <span className="font-medium">
                      {material.amount.toFixed(2)} {material.unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {result && <StandardStairsSlabs stairResult={result} />}
    </div>
  );
};

export default StairCalculator;
