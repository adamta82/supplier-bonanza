import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Key, Trash2, ShieldCheck } from "lucide-react";

type UserItem = {
  id: string;
  email: string;
  username: string;
  display_name: string;
  created_at: string;
  is_caller: boolean;
};

async function callManageUsers(action: string, params: Record<string, any> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const resp = await supabase.functions.invoke("manage-users", {
    body: { action, ...params },
    headers: { Authorization: `Bearer ${session?.access_token}` },
  });
  if (resp.error) throw new Error(resp.error.message);
  if (resp.data?.error) throw new Error(resp.data.error);
  return resp.data;
}

export default function Users() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [changePassword, setChangePassword] = useState("");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => callManageUsers("list"),
  });

  const createMutation = useMutation({
    mutationFn: () => callManageUsers("create", { username: newUsername, password: newPassword, display_name: newDisplayName }),
    onSuccess: () => {
      toast({ title: "משתמש נוצר בהצלחה" });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      setAddOpen(false);
      setNewUsername("");
      setNewPassword("");
      setNewDisplayName("");
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const updatePwMutation = useMutation({
    mutationFn: () => callManageUsers("update_password", { user_id: selectedUser?.id, password: changePassword }),
    onSuccess: () => {
      toast({ title: "סיסמא עודכנה בהצלחה" });
      setPwOpen(false);
      setChangePassword("");
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => callManageUsers("delete", { user_id: userId }),
    onSuccess: () => {
      toast({ title: "משתמש נמחק" });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast({ title: "שגיאה", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">ניהול משתמשים</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 ml-2" />הוסף משתמש</Button>
          </DialogTrigger>
          <DialogContent dir="rtl">
            <DialogHeader><DialogTitle>יצירת משתמש חדש</DialogTitle></DialogHeader>
            <form
              onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>שם משתמש</Label>
                <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>שם תצוגה</Label>
                <Input value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>סיסמא</Label>
                <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6} />
              </div>
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? "יוצר..." : "צור משתמש"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>משתמשים</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">טוען...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>שם משתמש</TableHead>
                  <TableHead>שם תצוגה</TableHead>
                  <TableHead>תאריך יצירה</TableHead>
                  <TableHead>פעולות</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(users as UserItem[]).map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.username}
                      {u.is_caller && (
                        <span className="inline-flex items-center gap-1 mr-2 text-xs text-primary">
                          <ShieldCheck className="w-3 h-3" /> (את/ה)
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{u.display_name}</TableCell>
                    <TableCell>{new Date(u.created_at).toLocaleDateString("he-IL")}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => { setSelectedUser(u); setPwOpen(true); }}
                        >
                          <Key className="w-4 h-4 ml-1" />שנה סיסמא
                        </Button>
                        {!u.is_caller && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm(`למחוק את המשתמש ${u.username}?`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>שינוי סיסמא ל-{selectedUser?.username}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); updatePwMutation.mutate(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>סיסמא חדשה</Label>
              <Input type="password" value={changePassword} onChange={(e) => setChangePassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" disabled={updatePwMutation.isPending} className="w-full">
              {updatePwMutation.isPending ? "מעדכן..." : "עדכן סיסמא"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
