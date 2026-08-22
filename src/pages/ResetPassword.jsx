import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function ResetPassword() {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const navigate = useNavigate();
  useEffect(() => { const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') setError(''); }); return () => data.subscription.unsubscribe(); }, []);
  const submit = async (e) => { e.preventDefault(); setError(''); if (password !== confirm) return setError('Las contraseñas no coinciden.'); if (password.length < 8) return setError('Usa una contraseña de al menos 8 caracteres.'); setLoading(true); const { error } = await supabase.auth.updateUser({ password }); setLoading(false); if (error) return setError('El enlace expiró o no es válido. Solicita uno nuevo.'); navigate('/login', { replace: true }); };
  return <AuthLayout title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta" footer={<Link to="/forgot-password" className="font-medium text-blue-400 hover:underline">Solicitar un nuevo enlace</Link>}>
    {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    <form onSubmit={submit} className="space-y-5"><div className="space-y-2"><Label className="text-slate-200">Nueva contraseña</Label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><Input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="h-12 border-white/10 bg-black/20 pl-10 text-white" required /></div></div><div className="space-y-2"><Label className="text-slate-200">Confirmar contraseña</Label><Input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="h-12 border-white/10 bg-black/20 text-white" required /></div><Button type="submit" disabled={loading} className="h-12 w-full bg-blue-600 hover:bg-blue-500">{loading?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Guardando...</>:'Actualizar contraseña'}</Button></form>
  </AuthLayout>;
}
