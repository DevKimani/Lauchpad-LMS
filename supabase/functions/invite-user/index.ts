import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  const json = { ...cors, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    // Admin client (service role) — server-side only
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify the CALLER is an admin
    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(jwt)
    if (!user)
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401, headers: json })

    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin')
      return new Response(JSON.stringify({ error: 'Admins only' }), { status: 403, headers: json })

    const { email, role, full_name } = await req.json()
    if (!email || !['instructor', 'admin'].includes(role))
      return new Response(JSON.stringify({ error: 'Provide email and role (instructor|admin)' }), { status: 400, headers: json })

    const { error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_role: role, full_name: full_name ?? '' },
      redirectTo: `${req.headers.get('origin') ?? 'https://learn.efac.org'}/set-password`,
    })
    if (error) throw error

    return new Response(JSON.stringify({ ok: true }), { headers: json })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: json })
  }
})