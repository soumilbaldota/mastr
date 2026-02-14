"use client";

import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VoiceCheckin } from "@/components/voice-checkin";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface Developer {
  id: string;
  name: string;
  team: { name: string };
}

interface DeveloperContext {
  openBlockers: { id: string; description: string; priority: string }[];
  assignedTasks: { id: string; name: string; progress: number }[];
}

export function CheckinDeveloperSelect({
  developers,
}: {
  developers: Developer[];
}) {
  const [selectedDev, setSelectedDev] = useState<Developer | null>(null);
  const [context, setContext] = useState<DeveloperContext | null>(null);
  const [loadingContext, setLoadingContext] = useState(false);

  useEffect(() => {
    if (!selectedDev) {
      setContext(null);
      return;
    }

    setLoadingContext(true);
    fetch(`/api/checkins/context?developerId=${selectedDev.id}`)
      .then((res) => res.json())
      .then((data) => {
        setContext({
          openBlockers: data.openBlockers || [],
          assignedTasks: data.assignedTasks || [],
        });
      })
      .catch((err) => {
        console.error("Failed to load developer context:", err);
        setContext(null);
      })
      .finally(() => setLoadingContext(false));
  }, [selectedDev]);

  return (
    <div className="space-y-4">
      <Select
        onValueChange={(id) => {
          const dev = developers.find((d) => d.id === id);
          setSelectedDev(dev || null);
        }}
      >
        <SelectTrigger className="w-[300px]">
          <SelectValue placeholder="Select developer" />
        </SelectTrigger>
        <SelectContent>
          {developers.map((dev) => (
            <SelectItem key={dev.id} value={dev.id}>
              {dev.name} ({dev.team.name})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedDev && context && (
        <>
          {context.openBlockers.length > 0 && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-semibold">
                  {context.openBlockers.length} Open Blocker
                  {context.openBlockers.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-2">
                {context.openBlockers.map((blocker) => (
                  <div
                    key={blocker.id}
                    className="text-sm flex items-start gap-2"
                  >
                    <Badge
                      variant={
                        blocker.priority === "critical"
                          ? "destructive"
                          : "outline"
                      }
                      className="text-xs"
                    >
                      {blocker.priority}
                    </Badge>
                    <span>{blocker.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <VoiceCheckin
            developerId={selectedDev.id}
            developerName={selectedDev.name}
            openBlockers={context.openBlockers}
          />
        </>
      )}

      {selectedDev && loadingContext && (
        <div className="text-sm text-muted-foreground">Loading context...</div>
      )}
    </div>
  );
}
