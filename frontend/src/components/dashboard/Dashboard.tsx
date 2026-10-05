import React, { useState } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { TOOLS, ToolItem } from '@/components/layout/Sidebar';

interface DashboardProps {
  onSelectTool: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onSelectTool }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredTools = TOOLS.filter((tool: ToolItem) => {
    const matchesSearch = 
      tool.name.toLowerCase().includes(search.toLowerCase()) || 
      tool.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'all' || tool.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            All Media Tools
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Fast, local, and privacy-first media processing powered by FFmpeg & AI engines
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tools (e.g. convert, trim)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg text-xs bg-muted/40 border border-border/50 focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
        {['all', 'video', 'audio', 'ytdlp', 'image', 'tools'].map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 rounded-full font-medium capitalize transition-colors ${
              activeCategory === cat
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {cat === 'all' ? 'All Tools' : cat === 'ytdlp' ? 'Downloader' : cat}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {filteredTools.map((tool: ToolItem) => {
          const Icon = tool.icon;
          return (
            <div
              key={tool.id}
              onClick={() => onSelectTool(tool.id)}
              className="group p-4 rounded-xl border border-border/40 bg-card/40 hover:bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-3 group-hover:scale-105 transition-transform">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                  {tool.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {tool.description}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-[11px] font-medium text-muted-foreground group-hover:text-primary">
                <span>Launch Tool</span>
                <ArrowRight className="h-3.5 w-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
