import { useRef, useEffect, useMemo, useCallback } from "react";
import { Bot, Send, Trash2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import ReactMarkdown from "react-markdown";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAIChat } from "@/hooks/useAIChat";

const SUGGESTIONS = [
  "מי הספק הכי רווחי?",
  "תן לי סיכום רכישות לפי ספק",
  "מה המצב של הסכמי הבונוס הפעילים?",
  "אילו ספקים קרובים להשגת יעד בונוס?",
  "מה אחוז הרווח הממוצע?",
];

export default function AIAssistant() {
  const navigate = useNavigate();
  const { messages, input, setInput, isLoading, send, clearChat } = useAIChat();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-for-links"],
    queryFn: async () => {
      const { data } = await supabase.from("suppliers").select("id, name");
      return data || [];
    },
  });

  const supplierMap = useMemo(() => {
    if (!suppliers) return [];
    return suppliers
      .filter((s) => s.name && s.name.length > 1)
      .sort((a, b) => b.name.length - a.name.length)
      .map((s) => ({ name: s.name, id: s.id }));
  }, [suppliers]);

  const renderTextWithSupplierLinks = useCallback(
    (text: string) => {
      if (!supplierMap.length) return <>{text}</>;
      const parts: (string | JSX.Element)[] = [];
      let remaining = text;
      let keyIdx = 0;
      while (remaining.length > 0) {
        let earliest = -1;
        let matched: (typeof supplierMap)[0] | null = null;
        for (const s of supplierMap) {
          const idx = remaining.indexOf(s.name);
          if (idx !== -1 && (earliest === -1 || idx < earliest)) {
            earliest = idx;
            matched = s;
          }
        }
        if (matched && earliest !== -1) {
          if (earliest > 0) parts.push(remaining.slice(0, earliest));
          parts.push(
            <button
              key={keyIdx++}
              onClick={() => navigate(`/suppliers/${matched!.id}`)}
              className="text-primary underline hover:text-primary/80 cursor-pointer font-medium"
            >
              {matched.name}
            </button>
          );
          remaining = remaining.slice(earliest + matched.name.length);
        } else {
          parts.push(remaining);
          break;
        }
      }
      return <>{parts}</>;
    },
    [supplierMap, navigate]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Bot className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">עוזר AI</h1>
          <p className="text-sm text-muted-foreground">שאל כל שאלה על הנתונים במערכת</p>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" className="mr-auto" onClick={clearChat}>
            <Trash2 className="w-4 h-4 ml-1" />
            נקה שיחה
          </Button>
        )}
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
              <div className="p-4 rounded-full bg-primary/10">
                <Sparkles className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-1">מה תרצה לדעת?</h2>
                <p className="text-sm text-muted-foreground">אני יכול לנתח את כל המידע במערכת — ספקים, רכישות, מכירות, בונוסים ורווחיות</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="text-xs" onClick={() => send(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&_table]:text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1">
                      <ReactMarkdown
                        components={{
                          p: ({ children }) => <p>{typeof children === 'string' ? renderTextWithSupplierLinks(children) : children}</p>,
                          td: ({ children }) => <td>{typeof children === 'string' ? renderTextWithSupplierLinks(children) : children}</td>,
                          li: ({ children }) => <li>{typeof children === 'string' ? renderTextWithSupplierLinks(children) : children}</li>,
                          strong: ({ children }) => <strong>{typeof children === 'string' ? renderTextWithSupplierLinks(children) : children}</strong>,
                        }}
                      >{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-xl px-4 py-3 rounded-bl-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-3">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="שאל שאלה על הנתונים במערכת..."
              rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              style={{ minHeight: 40, maxHeight: 120 }}
              disabled={isLoading}
            />
            <Button size="icon" onClick={() => send(input)} disabled={!input.trim() || isLoading}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
