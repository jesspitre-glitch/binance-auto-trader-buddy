import { supabase } from "@/integrations/supabase/client";

const AUTH_TIMEOUT_MS = 12000;
const AUTH_TIMEOUT_MESSAGE = "Login-serveren svarer ikke lige nu. Prøv igen om lidt.";

const withTimeout = async <T,>(factory: () => Promise<T>) => {
  let timeoutId: number | undefined;

  return await new Promise<T>((resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(AUTH_TIMEOUT_MESSAGE));
    }, AUTH_TIMEOUT_MS);

    factory()
      .then(resolve)
      .catch(reject)
      .finally(() => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
  });
};

const isPreviewEnvironment = () => {
  const { hostname } = window.location;
  return hostname.endsWith(".lovable.app") && hostname.includes("preview");
};

const getProxyUrl = () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-password-login`;

const signInThroughPreviewProxy = async (email: string, password: string) => {
  const response = await withTimeout(() =>
    fetch(getProxyUrl(), {
      method: "POST",
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    })
  );

  let data: any;

  try {
    data = await response.json();
  } catch {
    throw new Error(AUTH_TIMEOUT_MESSAGE);
  }

  if (!response.ok || !data?.success || !data?.access_token || !data?.refresh_token) {
    throw new Error(
      data?.error_description ||
        data?.msg ||
        data?.message ||
        data?.error ||
        "Login mislykkedes."
    );
  }

  const { error: sessionError } = await withTimeout(() =>
    supabase.auth.setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
    })
  );

  if (sessionError) {
    throw sessionError;
  }
};

export const signInWithFallback = async (email: string, password: string) => {
  if (isPreviewEnvironment()) {
    await signInThroughPreviewProxy(email, password);
    return;
  }

  try {
    const { data, error } = await withTimeout(() =>
      supabase.auth.signInWithPassword({ email, password })
    );

    if (error) {
      throw error;
    }

    if (!data.session) {
      throw new Error("Login mislykkedes.");
    }
  } catch (error: any) {
    const directMessage = error?.message || "";
    const shouldFallbackToProxy =
      directMessage.includes("Load failed") ||
      directMessage.includes("Failed to fetch") ||
      directMessage.includes(AUTH_TIMEOUT_MESSAGE);

    if (!shouldFallbackToProxy) {
      throw error;
    }

    await signInThroughPreviewProxy(email, password);
  }
};

export const getAuthErrorMessage = (error: any) => {
  const rawMessage = error?.message || "Login mislykkedes.";

  if (rawMessage.includes("Email not confirmed")) {
    return "Du skal først bekræfte din email via linket i din indbakke.";
  }

  if (rawMessage.includes("Invalid login credentials")) {
    return "Forkert email eller adgangskode.";
  }

  if (rawMessage.includes(AUTH_TIMEOUT_MESSAGE)) {
    return AUTH_TIMEOUT_MESSAGE;
  }

  return rawMessage;
};