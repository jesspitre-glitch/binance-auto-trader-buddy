import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TradingDashboard } from "@/components/TradingDashboard";
import { Auth } from "@/components/Auth";
import { Loader2 } from "lucide-react";

const Index = () => {
  const [session, setSession] = useState<any>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
