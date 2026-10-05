import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { TOOLS, ToolItem } from '@/components/layout/Sidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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
    <div className="flex-1 h-full overflow-y-auto p-8 space-y-6">
      {/* Header banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-border/40">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Media Toolkit
            </h1>
            <Badge variant="outline" className="text-xs">
              {filteredTools.length} {filteredTools.length === 1 ? 'tool' : 'tools'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Local, fast media processing powered by FFmpeg & neural engines
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search tools (e.g. convert, trim)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-xs bg-muted/30 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Category filter badges */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {categories.map(cat => (
          <Button
            key={cat.id}
            variant={activeCategory === cat.id ? "default" : "secondary"}
            size="sm"
            onClick={() => setActiveCategory(cat.id)}
            className="h-7 px-3 text-xs rounded-full font-medium"
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredTools.map((tool: ToolItem) => {
          const Icon = tool.icon;
          return (
            <Card
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className="group hover:border-primary/50 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between overflow-hidden bg-card/60 backdrop-blur-sm"
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200 shadow-2xs">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                    {tool.category}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-semibold group-hover:text-primary transition-colors">
                  {tool.name}
                </CardTitle>
                <CardDescription className="line-clamp-2 pt-1 text-xs text-muted-foreground/80 leading-normal">
                  {tool.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="pt-3 border-t border-border/40 flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                  <span>Launch Tool</span>
                  <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform duration-200" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
