import React, { useState, useRef } from 'react';
import { Upload, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

export default function KnowledgeUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.md')) {
      setStatus('error');
      setMessage('Only Markdown (.md) files are supported.');
      return;
    }

    setIsUploading(true);
    setStatus('idle');
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/kb/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setStatus('success');
        setMessage('Document indexed successfully!');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsUploading(false);
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  return (
    <div 
      className="p-4 rounded-xl border-2 border-dashed transition-all"
      style={{ 
        background: 'var(--bg-secondary)',
        borderColor: status === 'success' ? '#10b98144' : status === 'error' ? '#ef444444' : 'var(--border-subtle)',
      }}
    >
      <div className="flex flex-col items-center text-center">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center mb-3"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          {isUploading ? (
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--accent)' }} />
          ) : status === 'success' ? (
            <CheckCircle2 size={18} style={{ color: '#10b981' }} />
          ) : status === 'error' ? (
            <XCircle size={18} style={{ color: '#ef4444' }} />
          ) : (
            <Upload size={18} style={{ color: 'var(--text-muted)' }} />
          )}
        </div>

        <h3 className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
          Upload Knowledge
        </h3>
        <p className="text-[10px] mb-4" style={{ color: 'var(--text-muted)' }}>
          Drop a Markdown file to index it into your local RAG.
        </p>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="px-4 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ 
            background: 'var(--accent)', 
            color: 'white',
            opacity: isUploading ? 0.6 : 1,
            boxShadow: 'var(--shadow-glow)'
          }}
        >
          Select File
        </button>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".md"
          className="hidden"
        />

        {message && (
          <p 
            className="mt-3 text-[10px] font-medium animate-fade-in"
            style={{ color: status === 'success' ? '#10b981' : status === 'error' ? '#ef4444' : 'var(--text-muted)' }}
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
