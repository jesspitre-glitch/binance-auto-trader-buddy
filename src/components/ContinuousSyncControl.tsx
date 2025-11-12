import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Square } from "lucide-react";

export const ContinuousSyncControl = () => {
  const [syncStatus, setSyncStatus] = useState<'active' | 'stopped' | 'unknown'>('unknown');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const checkStatus = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('continuous-sync-binance', {
        body: { action: 'status' }
      });

      if (error) throw error;
      setSyncStatus(data.status);
    } catch (error: any) {
      console.error('Failed to check sync status:', error);
    }
  };

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000); // Check status every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const startSync = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({ action: 'start' });
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/continuous-sync-binance?${params}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          }
        }
      );

      if (!response.ok) throw new Error('Failed to start sync');

      setSyncStatus('active');
      toast({
        title: "Kontinuerlig sync startet",
        description: "Synkroniserer med Binance hvert 5. sekund",
      });
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const stopSync = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ action: 'stop' });
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/continuous-sync-binance?${params}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          }
        }
      );

      if (!response.ok) throw new Error('Failed to stop sync');

      setSyncStatus('stopped');
      toast({
        title: "Sync stoppet",
        description: "Kontinuerlig synkronisering er deaktiveret",
      });
    } catch (error: any) {
      toast({
        title: "Fejl",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className={`h-5 w-5 ${syncStatus === 'active' ? 'animate-spin text-primary' : ''}`} />
              Kontinuerlig Binance Sync
            </CardTitle>
            <CardDescription>
              Automatisk synkronisering hvert 5. sekund - Binance har altid ret
            </CardDescription>
          </div>
          <Badge variant={syncStatus === 'active' ? 'default' : 'secondary'}>
            {syncStatus === 'active' ? 'Aktiv' : syncStatus === 'stopped' ? 'Stoppet' : 'Ukendt'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          {syncStatus !== 'active' ? (
            <Button onClick={startSync} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Start Kontinuerlig Sync
            </Button>
          ) : (
            <Button onClick={stopSync} disabled={loading} variant="destructive">
              <Square className="h-4 w-4 mr-2" />
              Stop Sync
            </Button>
          )}
        </div>
        {syncStatus === 'active' && (
          <p className="text-xs text-muted-foreground mt-4">
            Synkroniserer automatisk med Binance hvert 5. sekund. Databasen opdateres løbende med de faktiske positioner fra Binance.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
