import React, { useState } from "react";
import {
  SearchIcon,
  ArrowRightIcon,
  SearchXIcon,
} from "lucide-react";
import {
  TOOLS,
  AVAILABLE_TOOLS,
  CATEGORY_LABELS,
  type ToolItem,
  type ToolCategory,
} from "@/components/layout/Sidebar";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

interface DashboardProps {
  onSelectTool: (id: string) => void;
}

const CATEGORIES: Array<{ id: "all" | ToolCategory; label: string }> = [
  { id: "all", label: "All Tools" },
  { id: "video", label: CATEGORY_LABELS.video },
  { id: "audio", label: CATEGORY_LABELS.audio },
  { id: "ytdlp", label: CATEGORY_LABELS.ytdlp },
  { id: "image", label: CATEGORY_LABELS.image },
  { id: "tools", label: CATEGORY_LABELS.tools },
];

export const Dashboard: React.FC<DashboardProps> = ({ onSelectTool }) => {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredTools = TOOLS.filter((tool: ToolItem) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(search.toLowerCase()) ||
      tool.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      activeCategory === "all" || tool.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <ScrollArea className="flex-1 h-full">
      <div className="flex flex-col gap-6 p-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                Media Toolkit
              </h1>
              <Badge variant="outline">
                {filteredTools.length}{" "}
                {filteredTools.length === 1 ? "tool" : "tools"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Local, fast media processing powered by FFmpeg & neural engines
            </p>
          </div>

          <div className="w-full md:w-80">
            <Field>
              <FieldLabel htmlFor="search-tools" className="sr-only">
                Search tools
              </FieldLabel>
              <div className="relative flex items-center w-full">
                <SearchIcon
                  aria-hidden="true"
                  className="absolute left-3 size-4 text-muted-foreground pointer-events-none"
                />
                <Input
                  id="search-tools"
                  type="search"
                  placeholder="Search tools (e.g. convert, trim)..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
            </Field>
          </div>
        </div>

        <Separator />

        <div className="flex items-center overflow-x-auto pb-1">
          <ToggleGroup
            type="single"
            value={activeCategory}
            onValueChange={(val) => val && setActiveCategory(val)}
            aria-label="Filter tools by category"
          >
            {CATEGORIES.map((cat) => (
              <ToggleGroupItem
                key={cat.id}
                value={cat.id}
                aria-label={cat.label}
              >
                {cat.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {filteredTools.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchXIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No tools found</EmptyTitle>
              <EmptyDescription>
                No media processing tools matched your search filter “{search}”.
                Try searching for something else.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <ul role="list" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 list-none m-0 p-0">
            {filteredTools.map((tool: ToolItem) => {
              const IconComponent = tool.icon;
              const available = AVAILABLE_TOOLS.has(tool.id);
              return (
                <li key={tool.id}>
                  <Card
                    className={
                      available
                        ? "group relative hover:border-primary/50 transition-colors duration-200 flex flex-col justify-between overflow-hidden h-full focus-within:border-primary/50"
                        : "relative flex flex-col justify-between overflow-hidden h-full opacity-70"
                    }
                  >
                    <CardHeader className="flex flex-col gap-3">
                      <IconComponent
                        aria-hidden="true"
                        className="size-6 text-primary"
                      />
                      <div className="flex flex-col gap-1">
                        <CardTitle
                          className={
                            available
                              ? "text-base group-hover:text-primary transition-colors"
                              : "text-base"
                          }
                        >
                          {tool.name}
                        </CardTitle>
                        <CardDescription className="line-clamp-2 text-xs">
                          {tool.description}
                        </CardDescription>
                      </div>
                    </CardHeader>

                    <CardFooter className="pt-0">
                      {available ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="pt-3 border-t w-full flex items-center justify-between text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors"
                          >
                            <span>Launch Tool</span>
                            <ArrowRightIcon className="size-3.5 -translate-x-1 group-hover:translate-x-0 transition-transform duration-200" />
                          </span>
                          <button
                            type="button"
                            onClick={() => onSelectTool(tool.id)}
                            aria-label={`Launch ${tool.name}: ${tool.description}`}
                            className="absolute inset-0 rounded-[inherit] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          />
                        </>
                      ) : (
                        <span className="pt-3 border-t w-full text-xs text-muted-foreground">
                          Coming soon
                        </span>
                      )}
                    </CardFooter>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </ScrollArea>
  );
};
