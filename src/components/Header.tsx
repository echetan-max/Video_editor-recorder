import React, { useRef } from 'react';
import { Upload, Download, FileVideo, Sparkles, FileText, Video } from 'lucide-react';
import { ClicksData } from '../types';

interface HeaderProps {
  videoFile: File;
  onExport: () => void;
  onNewProject: () => void;
  onScreenrecorder: () => void;
  onClicksImport: (clicksData: ClicksData) => void;
}

export const Header: React.FC<HeaderProps> = ({
  videoFile,
  onExport,
  onNewProject,
  onScreenrecorder,
  onClicksImport
}) => {
  const clicksInputRef = useRef<HTMLInputElement>(null);

  const handleClicksFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const clicksData = JSON.parse(e.target?.result as string);
          if (onClicksImport) {
            onClicksImport(clicksData);
          }
        } catch (error) {
          console.error('Error parsing JSON file:', error);
          alert('Invalid JSON file. Please select a valid clicks.json file.');
        }
      };
      reader.readAsText(file);
    } else {
      alert('Please select a valid JSON file.');
    }
  };

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-6 h-6 text-purple-400" />
            <h1 className="text-xl font-bold text-white">Smart Zoom Editor</h1>
          </div>
          <div className="flex items-center space-x-2 text-gray-300">
            <FileVideo className="w-4 h-4" />
            <span className="text-sm">{videoFile.name}</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={onScreenrecorder}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Video className="w-4 h-4" />
            <span>Screen Recorder</span>
          </button>
          
          <button
            onClick={() => clicksInputRef.current?.click()}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>Import Data</span>
          </button>
          
          <button
            onClick={onNewProject}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>New Project</span>
          </button>
          
          <button
            onClick={onExport}
            className="flex items-center space-x-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export Video</span>
          </button>
        </div>
      </div>
      <input
        ref={clicksInputRef}
        type="file"
        accept=".json"
        onChange={handleClicksFileSelect}
        className="hidden"
      />
    </header>
  );
};