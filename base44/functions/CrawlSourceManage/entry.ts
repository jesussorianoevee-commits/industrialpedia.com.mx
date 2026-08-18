import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Human-in-the-loop sobre fuentes. Ninguna fuente rastrea automáticamente:
// se registra en "pending_review" y requiere aprobación humana explícita.
const ACTIONS = ['register', 'approve', 'pause', 'reject', 'resume', 'stop'];

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role && user.role !== 'admin') return Response.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body.action;
    if (!ACTIONS.includes(action)) return Response.json({ error: 'invalid action' }, { status: 400 });

    if (action === 'register') {
      const c = body.config || {};
      if (!c.name || !c.domain) return Response.json({ error: 'name and domain required' }, { status: 400 });
      const src = await base44.asServiceRole.entities.CrawlSource.create({
        name: c.name,
        manufacturer: c.manufacturer || c.name,
        domain: c.domain,
        subdomains: c.subdomains || [],
        seed_urls: c.seed_urls || [`https://${c.domain}/`],
        allow_paths: c.allow_paths || [],
        deny_paths: c.deny_paths || ['/private', '/login', '/admin', '/account', '/cart', '/checkout'],
        url_patterns: c.url_patterns || [],
        allowed_content_types: c.allowed_content_types || ['pdf', 'datasheet', 'manual', 'catalog'],
        max_depth: c.max_depth ?? 3,
        max_pages: c.max_pages ?? 10000,
        max_documents: c.max_documents ?? 5000,
        concurrency: c.concurrency ?? 1,
        rate_limit_ms: c.rate_limit_ms ?? 800,
        frequency: c.frequency || 'manual',
        state: 'pending_review',
        authorized_by: '',
        authorized_date: ''
      });
      return Response.json({ source_id: src.id, state: src.state, message: 'Fuente registrada en pending_review. Requiere aprobación humana; NO rastrea automáticamente.' });
    }

    if (!body.source_id) return Response.json({ error: 'source_id required' }, { status: 400 });
    const src = await base44.asServiceRole.entities.CrawlSource.get(body.source_id);

    let next = src.state;
    const patch = {};
    if (action === 'approve') {
      next = 'approved';
      patch.authorized_by = user.email || user.id || 'admin';
      patch.authorized_date = new Date().toISOString();
    } else if (action === 'pause') next = 'paused';
    else if (action === 'reject') next = 'rejected';
    else if (action === 'resume') next = 'approved';
    else if (action === 'stop') next = 'paused';

    const updated = await base44.asServiceRole.entities.CrawlSource.update(body.source_id, { state: next, ...patch });
    return Response.json({ source_id: body.source_id, state: updated.state, authorized_by: updated.authorized_by || null });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}