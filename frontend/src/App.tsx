import React, { useState } from 'react';
import { WindowHeader } from '@/components/layout/WindowHeader';
import { Sidebar } from '@/components/layout/Sidebar';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ConvertTool } from '@/components/tools/ConvertTool';
import { Construction } from 'lucide-react';

export function App() {
  const [activeTool, setActiveTool] = useState<string>('dashboard');

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans select-none antialiased dark">
      {/* Frameless window header with titlebar drag region */}
      <WindowHeader />

      {/* Main app body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar navigation */}
        <Sidebar activeTool={activeTool} onSelectTool={setActiveTool} />

        {/* View container */}
        <main className="flex-1 h-full overflow-hidden flex flex-col bg-background/50">
          {activeTool === 'dashboard' && <Dashboard onSelectTool={setActiveTool} />}
          {activeTool === 'convert' && <ConvertTool />}
          {activeTool !== 'dashboard' && activeTool !== 'convert' && (
            <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Construction className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-foreground capitalize">
                  {activeTool.replace('-', ' ')} Tool
                </h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  This tool view is queued for component porting in subsequent slices. The Convert tool is ready and fully operational for IPC testing.
                </p>
              </div>
              <button
                onClick={() => setActiveTool('convert')}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-xs"
              >
                Switch to Convert Tool
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Bottom status footer */}
      <footer className="h-6 w-full border-t border-border/30 bg-muted/20 px-3 flex items-center justify-between text-[11px] text-muted-foreground select-none">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
          <span>Tauri v2 IPC Online</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Active View: {activeTool}</span>
          <span>Port: React 19 + Tailwind v4 + Vite</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
