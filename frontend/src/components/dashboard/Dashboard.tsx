import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { TOOLS, ToolItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

interface DashboardProps {
  onSelectTool: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectTool }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Tools' },
    { id: 'video', label: 'Video' },
    { id: 'audio', label: 'Audio' },
    { id: 'ytdlp', label: 'Downloader' },
    { id: 'image', label: 'AI & Image' },
    { id: 'tools', label: 'Documents' },
  ];

  const filteredTools = TOOLS.filter((tool: ToolItem) => {
    const matchesSearch = 
      tool.name.toLowerCase().includes(search.toLowerCase()) || 
      tool.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="p-8 space-y-6">
        {/* Header section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Media Toolkit
              </h1>
              <Badge variant="outline" className="text-xs">
                {filteredTools.length} {filteredTools.length === 1 ? 'tool' : 'tools'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Local, fast media processing powered by FFmpeg & neural engines
            </p>
          </div>

          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search tools (e.g. convert, trim)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>
        </div>

        <Separator />

        {/* Category filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {categories.map(cat => (
            <Button
              key={cat.id}
              variant={activeCategory === cat.id ? "default" : "secondary"}
              size="sm"
              onClick={() => setActiveCategory(cat.id)}
              className="rounded-full text-xs h-8 px-3.5"
            >
              {cat.label}
            </Button>
          ))}
        </div>

        {/* Grid of tools */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredTools.map((tool: ToolItem) => {
            const Icon = tool.icon;
            return (
              <Card
                key={tool.id}
                onClick={() => onSelectTool(tool.id)}
                className="group hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between mb-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                      {tool.category}
                    </Badge>
                  </div>
                  <CardTitle className="text-base group-hover:text-primary transition-colors">
                    {tool.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2 pt-1 text-xs leading-normal">
                    {tool.description}
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-0">
                  <div className="pt-3 border-t flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                    <span>Launch Tool</span>
                    <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform duration-200" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
};
