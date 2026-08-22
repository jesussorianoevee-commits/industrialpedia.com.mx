import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState(''); const [loading, setLoading] = useState(false); const [sent, setSent] = useState(false);
  const handleSubmit = async (e) => { e.preventDefault(); setLoading(true); await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); setLoading(false); setSent(true); };
  return <AuthLayout title="Recuperar contraseña" subtitle="Te enviaremos un enlace seguro para restablecerla" footer={<Link to="/login" className="font-medium text-blue-400 hover:underline"><ArrowLeft className="mr-1 inline h-3 w-3"/>Volver al inicio de sesión</Link>}>
    {sent ? <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">Si existe una cuenta con ese correo, recibirás instrucciones para restablecer tu contraseña.</p> : <form onSubmit={handleSubmit} className="space-y-5"><div className="space-y-2"><Label className="text-slate-200">Correo electrónico</Label><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"/><Input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="h-12 border-white/10 bg-black/20 pl-10 text-white" required /></div></div><Button type="submit" disabled={loading} className="h-12 w-full bg-blue-600 hover:bg-blue-500">{loading?<><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Enviando...</>:'Enviar enlace'}</Button></form>}
  </AuthLayout>;
}
