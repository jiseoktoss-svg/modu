import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createLocalSupabaseClient } from "@/lib/supabase/localClient";

// Supabase 접근은 서버에서만 한다. secret/service-role key 는 절대 브라우저로 가지 않는다.
// SUPABASE_SECRET_KEY 를 우선 사용하고, 없으면 SUPABASE_SERVICE_ROLE_KEY 로 fallback 한다.

let cached: SupabaseClient | null = null;
let warnedLocalFallback = false;

export function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!hasSupabaseConfig() || !url || !key) {
    if (process.env.NODE_ENV !== "production") {
      if (!warnedLocalFallback) {
        console.warn(
          "Supabase 환경변수가 없어 개발용 파일 저장소(.modu-local-db.json)를 사용합니다.",
        );
        warnedLocalFallback = true;
      }
      cached = createLocalSupabaseClient() as unknown as SupabaseClient;
      return cached;
    }

    throw new Error(
      "Supabase 환경변수가 없습니다. NEXT_PUBLIC_SUPABASE_URL 와 SUPABASE_SECRET_KEY(또는 SUPABASE_SERVICE_ROLE_KEY) 를 설정하세요.",
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
