"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { ElevenLabsClient, playAudioChunk } from "@/lib/elevenlabs/client";

interface Message {
  role: "agent" | "user";
  content: string;
  timestamp: Date;
}

interface VoiceCheckinProps {
  developerId: string;
  developerName: string;
  openBlockers?: { id: string; description: string; priority: string }[];
}

export function VoiceCheckin({
  developerId,
  developerName,
  openBlockers = [],
}: VoiceCheckinProps) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<ElevenLabsClient | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);

    try {
      const res = await fetch("/api/elevenlabs/signed-url");
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to get signed URL");
      }

      audioContextRef.current = new AudioContext({ sampleRate: 16000 });

      const client = new ElevenLabsClient({
        signedUrl: data.signedUrl,
        onTranscript: (transcript) => {
          setCurrentTranscript(transcript);
        },
        onAgentResponse: (response) => {
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: response, timestamp: new Date() },
          ]);
        },
        onAudioChunk: (audioBase64) => {
          if (audioContextRef.current) {
            playAudioChunk(audioBase64, audioContextRef.current);
          }
        },
        onError: (err) => {
          setError(err);
        },
        onDisconnect: () => {
          setConnected(false);
          setConnecting(false);
        },
      });

      await client.connect();

      // Send context about the developer including open blockers
      const blockerContext =
        openBlockers.length > 0
          ? `\n\nIMPORTANT: ${developerName} has ${openBlockers.length} open blocker(s). Ask about each one specifically:\n${openBlockers.map((b) => `- [ID: ${b.id}] ${b.description} (${b.priority} priority)`).join("\n")}`
          : "\n\nThis developer has no open blockers currently.";

      client.sendContext(
        `You are conducting a check-in with ${developerName}. ${blockerContext}\n\nAsk about their current progress, any blockers, and how things are going.`
      );

      await client.startMicrophone();

      clientRef.current = client;
      setConnected(true);
      setConnecting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection failed");
      setConnecting(false);
    }
  }, [developerName]);

  const disconnect = useCallback(async () => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setConnected(false);

    // Save the check-in transcript
    const finalMessages =
      currentTranscript.trim().length > 0
        ? [
            ...messages,
            {
              role: "user" as const,
              content: currentTranscript,
              timestamp: new Date(),
            },
          ]
        : messages;

    if (finalMessages.length > 0) {
      const transcript = finalMessages
        .map((m) => `${m.role === "agent" ? "Mastr" : developerName}: ${m.content}`)
        .join("\n");

      try {
        const createRes = await fetch("/api/checkins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            developerId,
            transcript,
            summary: `Voice check-in with ${developerName}`,
            mood: "neutral",
          }),
        });

        if (!createRes.ok) {
          throw new Error(`Failed to save check-in (${createRes.status})`);
        }

        const checkIn = await createRes.json();

        const processRes = await fetch("/api/checkins/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checkInId: checkIn.id }),
        });

        if (!processRes.ok) {
          throw new Error(`Failed to process check-in (${processRes.status})`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save check-in");
      }
    }
    setCurrentTranscript("");
  }, [messages, currentTranscript, developerId, developerName]);

  const commitTranscript = useCallback(() => {
    if (currentTranscript) {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: currentTranscript, timestamp: new Date() },
      ]);
      setCurrentTranscript("");
    }
  }, [currentTranscript]);

  // Commit transcript when there's a pause
  useEffect(() => {
    if (!currentTranscript) return;
    const timer = setTimeout(commitTranscript, 2000);
    return () => clearTimeout(timer);
  }, [currentTranscript, commitTranscript]);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Voice Check-in</span>
          <Badge variant={connected ? "default" : "secondary"}>
            {connected ? "Connected" : connecting ? "Connecting..." : "Ready"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm">
            {error}
          </div>
        )}

        {/* Conversation */}
        <ScrollArea className="h-[400px] rounded-lg border p-4" ref={scrollRef}>
          {messages.length === 0 && !connected && (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Start a check-in to begin your daily standup with the AI agent
            </div>
          )}
          <div className="space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {msg.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            {currentTranscript && (
              <div className="flex justify-end">
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-primary/50 text-primary-foreground">
                  <p className="text-sm italic">{currentTranscript}</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {!connected ? (
            <Button
              onClick={connect}
              disabled={connecting}
              size="lg"
              className="gap-2"
            >
              <Phone className="h-4 w-4" />
              {connecting ? "Connecting..." : "Start Check-in"}
            </Button>
          ) : (
            <>
              <Button
                variant={muted ? "destructive" : "outline"}
                size="icon"
                onClick={() => setMuted(!muted)}
              >
                {muted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="destructive"
                onClick={disconnect}
                size="lg"
                className="gap-2"
              >
                <PhoneOff className="h-4 w-4" />
                End Check-in
              </Button>
            </>
          )}
        </div>

        <p className="text-xs text-center text-muted-foreground">
          {connected
            ? "The AI agent is listening. Speak naturally about your progress and blockers."
            : "Click 'Start Check-in' to begin your daily standup with Mastr AI."}
        </p>
      </CardContent>
    </Card>
  );
}
