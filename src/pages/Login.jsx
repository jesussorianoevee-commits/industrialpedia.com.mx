import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Lock, Loader2, Eye, EyeOff } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { safeReturnTo } from '@/lib/authReturnTo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setError('No pudimos iniciar sesión. Verifica tus datos e inténtalo nuevamente.');
    navigate(returnTo, { replace: true });
  };

  return (
    <AuthLayout backTo={returnTo || '/'} backLabel="Volver a Industrialpedia" title="Bienvenido de nuevo" subtitle="Inicia sesión para continuar en Industrialpedia" footer={<><span>¿Aún no tienes una cuenta? </span><Link to="/register" className="font-medium text-blue-400 hover:underline">Crear cuenta</Link></>}>
      {error && <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="email" className="text-slate-200">Correo electrónico</Label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><Input id="email" type="email" autoComplete="email" placeholder="tu@correo.com" value={email} onChange={(e)=>setEmail(e.target.value)} className="h-12 border-white/10 bg-black/20 pl-10 text-white placeholder:text-slate-600" required /></div></div>
        <div className="space-y-2"><div className="flex justify-between"><Label htmlFor="password" className="text-slate-200">Contraseña</Label><Link to="/forgot-password" className="text-xs text-blue-400 hover:underline">¿Olvidaste tu contraseña?</Link></div><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e)=>setPassword(e.target.value)} className="h-12 border-white/10 bg-black/20 pl-10 pr-10 text-white" required /><button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">{showPassword?<EyeOff className="h-4 w-4"/>:<Eye className="h-4 w-4"/>}</button></div></div>
        <Button type="submit" disabled={loading} className="h-12 w-full bg-blue-600 font-semibold hover:bg-blue-500">{loading?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Iniciando sesión...</>:'Iniciar sesión'}</Button>
      </form>
    </AuthLayout>
  );
}
