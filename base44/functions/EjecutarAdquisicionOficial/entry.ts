import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SUPABASE_URL = 'https://stwwywzuzbkyoecjujeh.supabase.co';
const TARGET = `${SUPABASE_URL}/functions/v1/industrialpedia-structured-acquisition-v1`;

// Puente interno: reutiliza el JWT del usuario autenticado de Base44.
// No contiene ni expone service-role/secret keys y no modifica la seguridad de Supabase.
// Solo administradores pueden disparar la adquisición oficial.
export default async function (req: Request) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (String(user.role || '').toLowerCase() !== 'admin') {
      return Response.json({ error: 'Admin role required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const queueId = String(body.queue_id || '').trim();
    const publishReal = body.publish_real === true;
    if (!queueId) return Response.json({ error: 'queue_id required' }, { status: 400 });

    const authorization = req.headers.get('authorization');
    if (!authorization) return Response.json({ error: 'Authorization header missing' }, { status: 401 });

    const response = await fetch(TARGET, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ queue_id: queueId, publish_real: publishReal })
    });

    const text = await response.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* preserve raw response */ }

    return Response.json({
      deterministic: true,
      ai_used: false,
      target: 'industrialpedia-structured-acquisition-v1',
      queue_id: queueId,
      publish_real: publishReal,
      target_status: response.status,
      target_ok: response.ok,
      target_response: data
    }, { status: response.ok ? 200 : 502 });
  } catch (error: any) {
    return Response.json({
      error: error?.message || String(error),
      deterministic: true,
      ai_used: false
    }, { status: 500 });
  }
}
