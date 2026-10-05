import React, { useState } from 'react';
import { WindowHeader } from '@/components/layout/WindowHeader';
import { Sidebar } from '@/components/layout/Sidebar';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ConvertTool } from '@/components/tools/ConvertTool';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function App() {
  const [activeTool, setActiveTool] = useState<string>('dashboard');

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden font-sans select-none antialiased dark">
      {/* Frameless window header with drag region */}
      <WindowHeader />

      {/* Main app body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar navigation */}
        <Sidebar activeTool={activeTool} onSelectTool={setActiveTool} />

        {/* View container */}
        <main className="flex-1 h-full overflow-hidden flex flex-col bg-background/50">
          {activeTool === 'dashboard' && <Dashboard onSelectTool={setActiveTool} />}
          {activeTool === 'convert' && <ConvertTool onBack={() => setActiveTool('dashboard')} />}
          {activeTool !== 'dashboard' && activeTool !== 'convert' && (
            <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-xs">
                <Construction className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-foreground capitalize">
                  {activeTool.replace('-', ' ')} Tool
                </h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  This tool view is scheduled for porting in the next slice. The Convert tool is fully ready with complete UI and IPC execution.
                </p>
              </div>
              <Button
                onClick={() => setActiveTool('convert')}
                size="sm"
                className="gap-2"
              >
                Launch Convert Tool
              </Button>
            </div>
          )}
        </main>
      </div>

      {/* Bottom status footer */}
      <footer className="h-6 w-full border-t border-border/40 bg-muted/20 px-3.5 flex items-center justify-between text-[11px] text-muted-foreground select-none">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
          <span>Tauri v2 IPC Ready</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="capitalize">{activeTool.replace('-', ' ')}</span>
          <span>React 19 + shadcn/ui</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
