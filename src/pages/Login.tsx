import { useState } from "react";
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
  const { toast } = useToast();

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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background" dir="rtl">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">💰 ZABILO MARGIN</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">התחברות למערכת</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "מתחבר..." : "התחבר"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
