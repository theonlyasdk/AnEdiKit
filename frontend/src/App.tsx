import React, { useCallback, useState } from "react";
import { WindowHeader } from "@/components/layout/WindowHeader";
import { Sidebar, TOOLS } from "@/components/layout/Sidebar";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Workspace } from "@/components/dashboard/Workspace";
import { ConvertTool } from "@/components/tools/ConvertTool";
import { SettingsTool } from "@/components/tools/SettingsTool";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ConstructionIcon, ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatToolName(id: string): string {
  return id.replace(/-/g, " ");
}

function toolLabel(id: string): string {
  if (id === "dashboard") return "Dashboard";
  if (id === "workspace") return "Quick workspace";
  const tool = TOOLS.find((t) => t.id === id);
  return tool ? tool.name : formatToolName(id);
}

function AppShell() {
  const [activeTool, setActiveTool] = useState<string>("dashboard");
  const [pendingFile, setPendingFile] = useState<string | null>(null);

  const handleDropFile = useCallback((path: string) => {
    setPendingFile(path);
    setActiveTool("convert");
  }, []);

  const handleConsumeFile = useCallback(() => {
    setPendingFile(null);
  }, []);

  const isKnownView =
    activeTool === "dashboard" ||
    activeTool === "workspace" ||
    activeTool === "convert" ||
    activeTool === "settings";

  return (
    <div className="h-full w-full flex flex-col bg-background text-foreground overflow-hidden font-sans antialiased">
      <WindowHeader />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <Sidebar activeTool={activeTool} onSelectTool={setActiveTool} />

        <main className="flex-1 h-full overflow-hidden flex flex-col bg-background">
          {activeTool === "dashboard" && (
            <Dashboard onSelectTool={setActiveTool} />
          )}
          {activeTool === "workspace" && (
            <Workspace onSelectTool={setActiveTool} onDropFile={handleDropFile} />
          )}
          {activeTool === "convert" && (
            <ConvertTool
              initialFilePath={pendingFile}
              onConsumeInitialFile={handleConsumeFile}
              onBack={() => setActiveTool("dashboard")}
            />
          )}
          {activeTool === "settings" && (
            <SettingsTool onBack={() => setActiveTool("dashboard")} />
          )}
          {!isKnownView && (
            <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center gap-4">
              <ConstructionIcon
                aria-hidden="true"
                className="size-8 text-primary"
              />
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-bold text-foreground">
                  {toolLabel(activeTool)}
                </h2>
                <p className="text-xs text-muted-foreground max-w-sm">
                  This tool view is scheduled for porting in the next slice.
                  The Convert tool is fully ready with complete UI and IPC
                  execution.
                </p>
              </div>
              <Button onClick={() => setActiveTool("convert")} size="sm">
                Launch Convert Tool
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </div>
          )}
        </main>
      </div>

      <footer className="h-6 w-full border-t border-border bg-muted/20 px-3.5 flex items-center justify-between text-xs text-muted-foreground select-none-chrome">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2 rounded-full bg-primary inline-block" />
          <span>Local processing</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{toolLabel(activeTool)}</span>
        </div>
      </footer>
      <Toaster />
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={400}>
        <AppShell />
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
