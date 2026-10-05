import React, { useState } from 'react';
import {
  SettingsIcon,
  FolderIcon,
  CpuIcon,
  SunMoonIcon,
  CheckIcon,
  ArrowLeftIcon,
  TerminalIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { pickFolder } from '@/services/tauri';
import { useTheme, type Theme } from '@/components/theme-provider';
import {
  useSettingsState,
  saveSettings,
  type AppSettings,
} from '@/lib/settings';
import { toast } from 'sonner';

interface SettingsToolProps {
  onBack?: () => void;
}

export const SettingsTool: React.FC<SettingsToolProps> = ({ onBack }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useSettingsState();
  const { theme, setTheme } = useTheme();

  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<AppSettings>) =>
    setSettings((prev) => ({ ...prev, ...patch }));

  const handlePickDir = async () => {
    try {
      const selected = await pickFolder(settings.outputDir || undefined);
      if (selected) {
        set({ outputDir: selected });
      }
    } catch {
      toast.error("Could not open the folder dialog.");
    }
  };

  const handleSave = () => {
    saveSettings(settings);
    setSaved(true);
    toast.success("Settings saved.");
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex flex-1 flex-col bg-background h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-8 pt-8 pb-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <Button variant="outline" size="icon" onClick={onBack} aria-label="Back to dashboard" className="rounded-full">
                <ArrowLeftIcon aria-hidden="true" />
              </Button>
            )}
            <div className="flex items-center gap-3">
              <SettingsIcon aria-hidden="true" className="size-6 text-primary" />
              <div className="flex flex-col gap-0.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Settings & Preferences
                </h1>
              </div>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saved}>
            <CheckIcon aria-hidden="true" />
            {saved ? 'Settings Saved' : 'Save Changes'}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-6 p-8 max-w-4xl">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            {/* TabsList contains TabsTriggers strictly per shadcn rules */}
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="general">
                <SunMoonIcon aria-hidden="true" />
                General & Output
              </TabsTrigger>
              <TabsTrigger value="binaries">
                <TerminalIcon aria-hidden="true" />
                Binaries & Tools
              </TabsTrigger>
              <TabsTrigger value="performance">
                <CpuIcon aria-hidden="true" />
                Hardware & Performance
              </TabsTrigger>
            </TabsList>

            {/* General Tab */}
            <TabsContent value="general" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>General & Output Settings</CardTitle>
                  <CardDescription>
                    Configure default output directories, file overwrite policies, and appearance preferences.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <FieldGroup>
                    {/* Output directory field */}
                    <Field>
                      <FieldLabel htmlFor="output-dir">Default Output Folder</FieldLabel>
                      <div className="flex items-center gap-2">
                        <Input
                          id="output-dir"
                          value={settings.outputDir}
                          onChange={(e) => set({ outputDir: e.target.value })}
                          placeholder="Same folder as the input file"
                          className="font-mono text-xs"
                        />
                        <Button variant="outline" onClick={handlePickDir}>
                          <FolderIcon aria-hidden="true" />
                          Browse
                        </Button>
                      </div>
                      <FieldDescription>
                        All processed media files will be saved in this directory unless custom path is specified.
                      </FieldDescription>
                    </Field>

                    <Separator />

                    {/* Auto open folder switch */}
                    <Field orientation="horizontal">
                      <div className="flex flex-col gap-1 flex-1">
                        <FieldLabel htmlFor="auto-open">Auto-Open Folder</FieldLabel>
                        <FieldDescription>
                          Automatically open the output folder in File Explorer when transcoding finishes.
                        </FieldDescription>
                      </div>
                      <Switch
                        id="auto-open"
                        checked={settings.autoOpenFolder}
                        onCheckedChange={(val) => set({ autoOpenFolder: val })}
                      />
                    </Field>

                    <Separator />

                    {/* Overwrite switch */}
                    <Field orientation="horizontal">
                      <div className="flex flex-col gap-1 flex-1">
                        <FieldLabel htmlFor="overwrite">Overwrite Existing Files</FieldLabel>
                        <FieldDescription>
                          Automatically overwrite output files if a file with the same name already exists.
                        </FieldDescription>
                      </div>
                      <Switch
                        id="overwrite"
                        checked={settings.overwriteOutput}
                        onCheckedChange={(val) => set({ overwriteOutput: val })}
                      />
                    </Field>

                    <Separator />

                    {/* Theme selector */}
                    <Field orientation="horizontal">
                      <div className="flex flex-col gap-1 flex-1">
                        <FieldLabel>Appearance Theme</FieldLabel>
                        <FieldDescription>
                          Select user interface theme style.
                        </FieldDescription>
                      </div>
                      <ToggleGroup
                        type="single"
                        value={theme}
                        onValueChange={(val) => val && setTheme(val as Theme)}
                        aria-label="Appearance theme"
                      >
                        <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
                        <ToggleGroupItem value="light">Light</ToggleGroupItem>
                        <ToggleGroupItem value="system">System</ToggleGroupItem>
                      </ToggleGroup>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Binaries Tab */}
            <TabsContent value="binaries" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Binary Paths</CardTitle>
                  <CardDescription>
                    Manage underlying FFmpeg, FFprobe, and yt-dlp binaries used for media processing.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="ffmpeg-path">FFmpeg Binary</FieldLabel>
                      <Input
                        id="ffmpeg-path"
                        value={settings.ffmpegPath}
                        onChange={(e) => set({ ffmpegPath: e.target.value })}
                        className="font-mono text-xs"
                      />
                      <FieldDescription>
                        Path to ffmpeg executable binary.
                      </FieldDescription>
                    </Field>

                    <Separator />

                    <Field>
                      <FieldLabel htmlFor="ffprobe-path">FFprobe Binary</FieldLabel>
                      <Input
                        id="ffprobe-path"
                        value={settings.ffprobePath}
                        onChange={(e) => set({ ffprobePath: e.target.value })}
                        className="font-mono text-xs"
                      />
                      <FieldDescription>
                        Path to ffprobe stream probing binary.
                      </FieldDescription>
                    </Field>

                    <Separator />

                    <Field>
                      <FieldLabel htmlFor="ytdlp-path">yt-dlp Binary</FieldLabel>
                      <Input
                        id="ytdlp-path"
                        value={settings.ytdlpPath}
                        onChange={(e) => set({ ytdlpPath: e.target.value })}
                        className="font-mono text-xs"
                      />
                      <FieldDescription>
                        Path to yt-dlp video downloader executable.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance" className="pt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Hardware Acceleration & Encoding Threads</CardTitle>
                  <CardDescription>
                    Configure GPU hardware decoders/encoders and CPU multi-threading.
                  </CardDescription>
                </CardHeader>

                <CardContent>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="hw-accel">Hardware Acceleration API</FieldLabel>
                      <Select value={settings.hwAccel} onValueChange={(val) => set({ hwAccel: val })}>
                        <SelectTrigger id="hw-accel">
                          <SelectValue placeholder="Select hardware acceleration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="auto">Auto-detect GPU (Recommended)</SelectItem>
                            <SelectItem value="cuda">NVIDIA CUDA / NVENC</SelectItem>
                            <SelectItem value="qsv">Intel QuickSync (QSV)</SelectItem>
                            <SelectItem value="amf">AMD AMF</SelectItem>

                            <SelectItem value="dxva2">DirectX Video Accel (DXVA2)</SelectItem>
                            <SelectItem value="off">Disabled (CPU Software Only)</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Hardware acceleration speeds up encoding and decoding significantly using your graphics processor.
                      </FieldDescription>
                    </Field>

                    <Separator />

                    <Field>
                      <FieldLabel htmlFor="threads">FFmpeg Thread Count</FieldLabel>
                      <Select value={settings.maxThreads} onValueChange={(val) => set({ maxThreads: val })}>
                        <SelectTrigger id="threads">
                          <SelectValue placeholder="Select thread count" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="0">0 (Auto - Use all CPU logical cores)</SelectItem>
                            <SelectItem value="2">2 Threads</SelectItem>
                            <SelectItem value="4">4 Threads</SelectItem>
                            <SelectItem value="8">8 Threads</SelectItem>
                            <SelectItem value="16">16 Threads</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Maximum worker threads allocated to FFmpeg operations.
                      </FieldDescription>
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
};
