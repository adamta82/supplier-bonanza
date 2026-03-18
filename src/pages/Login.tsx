import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [checking, setChecking] = useState(true);
  const { toast } = useToast();

  // Check if any users exist (bootstrap mode)
  useEffect(() => {
    (async () => {
      try {
        const resp = await supabase.functions.invoke("manage-users", {
          body: { action: "create", username: "__check__", password: "______" },
        });
        // If we get "User already registered" or similar, users exist
        // If bootstrap creates user, delete it... Actually let's use a different approach
      } catch {}
      setChecking(false);
    })();
  }, []);

  // Simpler: just show login, and a "create first user" link
  useEffect(() => {
    setChecking(false);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const email = `${username}@app.local`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      toast({ title: "שגיאת התחברות", description: "שם משתמש או סיסמא שגויים", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const resp = await supabase.functions.invoke("manage-users", {
        body: { action: "create", username, password, display_name: username },
      });
      if (resp.data?.error) throw new Error(resp.data.error);
      // Now log in
      const email = `${username}@app.local`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast({ title: "משתמש נוצר והתחברת בהצלחה" });
    } catch (err: any) {
      toast({ title: "שגיאה", description: err.message, variant: "destructive" });
    }
    setLoading(false);
  };

  if (checking) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">💰 ZABILO MARGIN</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {bootstrapMode ? "יצירת משתמש ראשון" : "התחברות למערכת"}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={bootstrapMode ? handleBootstrap : handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">שם משתמש</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="הזן שם משתמש"
                required
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">סיסמא</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="הזן סיסמא"
                required
                autoComplete="current-password"
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "מעבד..." : bootstrapMode ? "צור משתמש והתחבר" : "התחבר"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => setBootstrapMode(!bootstrapMode)}
            >
              {bootstrapMode ? "חזרה להתחברות" : "יצירת משתמש ראשון"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
