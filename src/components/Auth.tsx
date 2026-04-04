import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const AUTH_TIMEOUT_MS = 12000;

export const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { toast } = useToast();

  const withTimeout = async <T,>(promise: Promise<T>) => {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error("Login-serveren svarer ikke lige nu. Prøv igen om lidt."));
        }, AUTH_TIMEOUT_MS);
      }),
    ]);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await withTimeout(supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/index`,
        },
      }));

      if (error) throw error;

      toast({
        title: "Success",
        description: "Konto oprettet. Tjek din email og bekræft kontoen, før du logger ind.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke("preview-password-login", {
          body: { email, password },
        })
      );

      if (error) throw error;

      if (!data?.success || !data?.access_token || !data?.refresh_token) {
        throw new Error(
          data?.error_description ||
            data?.msg ||
            data?.message ||
            data?.error ||
            "Login mislykkedes."
        );
      }

      const { error: sessionError } = await withTimeout(
        supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })
      );

      if (sessionError) throw sessionError;

      toast({
        title: "Success",
        description: "Logged in successfully!",
      });
    } catch (error: any) {
      const rawMessage = error?.message || "Login mislykkedes.";
      const message = rawMessage.includes("Email not confirmed")
        ? "Du skal først bekræfte din email via linket i din indbakke."
        : rawMessage.includes("Invalid login credentials")
          ? "Forkert email eller adgangskode."
          : rawMessage;

      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Binance Trading Bot</CardTitle>
          <CardDescription>Log ind eller opret en konto for at fortsætte</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Log Ind</TabsTrigger>
              <TabsTrigger value="signup">Opret Konto</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-login">Email</Label>
                  <Input
                    id="email-login"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-login">Password</Label>
                  <Input
                    id="password-login"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Log Ind
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-signup">Email</Label>
                  <Input
                    id="email-signup"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-signup">Password</Label>
                  <Input
                    id="password-signup"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Opret Konto
                </Button>
                <p className="text-sm text-muted-foreground">
                  Du skal bekræfte din email, før login virker.
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};