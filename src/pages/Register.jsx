import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, UserPlus } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { safeReturnTo } from '@/lib/authReturnTo';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setMessage('');
    if (password !== confirmPassword) return setError('Las contraseñas no coinciden.');
    if (password.length < 8) return setError('Usa una contraseña de al menos 8 caracteres.');
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}${safeReturnTo()}` } });
    setLoading(false);
    if (error) return setError(error.message);
    if (data.session) return navigate(safeReturnTo(), { replace: true });
    setMessage('Revisa tu correo para confirmar tu cuenta y activar tu acceso.');
  };

  return <AuthLayout title="Crea tu cuenta" subtitle="Únete a Industrialpedia" footer={<><span>¿Ya tienes una cuenta? </span><Link to="/login" className="font-medium text-blue-400 hover:underline">Iniciar sesión</Link></>}>
    {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
    {message && <div className="mb-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</div>}
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2"><Label className="text-slate-200">Correo electrónico</Label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><Input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="h-12 border-white/10 bg-black/20 pl-10 text-white" required /></div></div>
      <div className="space-y-2"><Label className="text-slate-200">Contraseña</Label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><Input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="h-12 border-white/10 bg-black/20 pl-10 text-white" required /></div><p className="text-xs text-slate-500">Mínimo 8 caracteres.</p></div>
      <div className="space-y-2"><Label className="text-slate-200">Confirmar contraseña</Label><Input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} className="h-12 border-white/10 bg-black/20 text-white" required /></div>
      <Button type="submit" disabled={loading} className="h-12 w-full bg-blue-600 font-semibold hover:bg-blue-500">{loading?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Creando cuenta...</>:<><UserPlus className="mr-2 h-4 w-4"/>Crear cuenta</>}</Button>
    </form>
  </AuthLayout>;
}
