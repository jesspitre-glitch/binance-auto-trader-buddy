import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TradingDashboard } from "@/components/TradingDashboard";
import { Auth } from "@/components/Auth";
import { Loader2 } from "lucide-react";
import { withAuthTimeout } from "@/lib/auth";

const SESSION_TIMEOUT_MESSAGE = "Kunne ikke gendanne login-sessionen.";

const Index = () => {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    void withAuthTimeout(() => supabase.auth.getSession(), {
      timeoutMessage: SESSION_TIMEOUT_MESSAGE,
    })
      .then(({ data: { session } }) => {
        setSession(session ?? null);
      })
      .catch((error) => {
        console.error("[Index] Session restore failed", error);
        setSession(null);
      });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return <Auth />;
  }

  return <TradingDashboard />;
};

export default Index;
