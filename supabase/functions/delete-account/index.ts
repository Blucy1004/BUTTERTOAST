import {deletionHandler} from './handler.mjs';
// Standard Supabase Edge Function secrets are supplied only in the server deployment.
Deno.serve(deletionHandler({origin:Deno.env.get('SUPABASE_URL')!,serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}));
