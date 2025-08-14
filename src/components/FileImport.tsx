import React, { useRef, useState } from 'react';
import { Upload, FileVideo, Sparkles, FileText, Video, X } from 'lucide-react';
import { ClicksData } from '../types';

interface FileImportProps {
  onFileSelect: (file: File) => void;
  onClicksImport?: (clicksData: ClicksData) => void;
  ffmpegStatus: 'loading' | 'loaded' | 'error';
  onFfmpegCheck: () => void;
}

export const FileImport: React.FC<FileImportProps> = ({
  onFileSelect,
  onClicksImport,
  ffmpegStatus,
  onFfmpegCheck,
}) => {
  const [showFfmpegWarning, setShowFfmpegWarning] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const clicksInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        onFileSelect(file);
      } else if (file.type === 'application/json') {
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
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };


  const RECORDER_EXE_URL = "https://github.com/echetan-max/vercel/releases/download/v1.1/screen.exe"; 
  const downloadExe = () => {
    const a = document.createElement("a");
    a.href = RECORDER_EXE_URL;
    a.download = "AutoZoomRecorder.exe";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#e0eafc] via-[#cfdef3] to-[#e0eafc] flex items-center justify-center p-10">
      <div className="max-w-6xl w-full space-y-10">
        
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <Sparkles className="w-9 h-9 text-yellow-500 animate-pulse" />
            <h1 className="text-4xl font-extrabold text-gray-800 tracking-tight">Smart Zoom Video Editor</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Record or import a video and apply smart zoom effects with elegance.
          </p>
        </div>

        {/* FFmpeg Warning */}
        {ffmpegStatus === 'error' && showFfmpegWarning && (
          <div className="w-full max-w-2xl mx-auto bg-red-800/50 border border-red-700 text-white p-3 rounded-lg flex items-center justify-between">
            <div>
              <p className="font-semibold">FFmpeg Components Not Found</p>
              <p className="text-sm text-red-200">Audio mixing and fallback export may fail. Ensure FFmpeg files are in `/public`.</p>
              <button
                onClick={onFfmpegCheck}
                className="text-sm mt-1 text-red-200 hover:text-white underline"
              >
                Retry Check
              </button>
            </div>
            <button onClick={() => setShowFfmpegWarning(false)} className="text-red-200 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Screen Recorder Section */}
        <div className="flex justify-center">
          <div className="bg-white/60 backdrop-blur-lg border border-purple-300 rounded-2xl p-6 shadow-xl hover:shadow-purple-400 transition-all duration-300 max-w-md w-full">
            <div className="flex items-center justify-center mb-4">
              <Video className="w-8 h-8 text-purple-700" />
            </div>
            <h3 className="text-lg font-semibold text-center text-purple-800">AutoZoom Recorder</h3>
            <p className="text-purple-700 text-sm text-center mb-4">
              Record your screen with automatic zoom effects
            </p>
            <button
              onClick={downloadExe}
              className="w-full flex items-center justify-center space-x-2 py-3 
              bg-purple-600/80 hover:bg-purple-700/90 
              text-white font-semibold rounded-xl 
              border border-purple-500 backdrop-blur-md 
              shadow-lg transition-all duration-300"
            >
              <Video className="w-5 h-5" />
              <span>Click here to download ⬇</span>
            </button>
            <p className="text-purple-700 text-xs text-center mt-3">
              Captures screen with click-based zoom points
            </p>
          </div>
        </div>

        {/* Two-Column: Video and Clicks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Video Import */}
          <div
            className="bg-white/60 backdrop-blur-lg border border-purple-300 rounded-2xl p-10 text-center shadow-xl hover:shadow-purple-400 transition-all duration-300 cursor-pointer"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <FileVideo className="w-14 h-14 text-purple-600 mx-auto mb-4" />
            <h3 className="text-2xl font-semibold text-purple-800 mb-2">Import a Video File</h3>
            <p className="text-gray-700 mb-6">
              Drag and drop your video here, or click to browse.
            </p>
            <button
              className="flex items-center space-x-2 px-6 py-3 
              bg-purple-700/80 hover:bg-purple-800/90 
              text-white font-semibold rounded-xl 
              border border-purple-500 backdrop-blur-md 
              shadow-md transition-all duration-300 mx-auto"
            >
              <Upload className="w-5 h-5" />
              <span>Choose File</span>
            </button>
            <p className="text-sm text-gray-600 mt-3">
              Supports MP4, WebM, MOV, AVI, and other common video formats.
            </p>
          </div>

          {/* Clicks Data Import */}
          <div className="bg-white/60 backdrop-blur-lg border border-blue-300 rounded-2xl p-6 shadow-xl hover:shadow-blue-400 transition-all duration-300">
            <div className="flex items-center space-x-3 mb-4">
              <FileText className="w-6 h-6 text-blue-700" />
              <h3 className="text-lg font-semibold text-blue-800">Import Clicks Data</h3>
            </div>
            <p className="text-blue-700 text-sm mb-4">
              Upload your clicks.json to apply intelligent zoom automation.
            </p>
            <button
              onClick={() => clicksInputRef.current?.click()}
              className="w-full flex items-center justify-center space-x-2 py-3 
              bg-blue-600/80 hover:bg-blue-700/90 
              text-white font-bold rounded-xl 
              border border-blue-500 backdrop-blur-md 
              shadow-md transition-all duration-300"
            >
              <Upload className="w-5 h-5" />
              <span>Choose Clicks.json</span>
            </button>

            <input
              ref={clicksInputRef}
              type="file"
              accept=".json"
              onChange={handleClicksFileSelect}
              className="hidden"
            />
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.webm,.mp4,.mov,.avi,.mkv"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
};

