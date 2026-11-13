"use client";
import { useFormState, useFormStatus } from "react-dom";
import Ornament from "@/components/Ornament";
import { loginAction } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full disabled:opacity-60" disabled={pending}>
      {pending ? "Ingresando…" : "Entrar"}
    </button>
  );
}

export default function AdminLoginPage() {
  const [state, action] = useFormState(loginAction, null);
  return (
    <section className="min-h-screen flex items-center justify-center px-5 bg-champagne/40">
      <form
        action={action}
        className="relative bg-cream border border-champagne rounded-2xl p-8 w-full max-w-sm overflow-hidden shadow-sm"
      >
        <div className="absolute -top-4 -right-4 opacity-30 pointer-events-none">
          <Ornament size={120} opacity={0.4} />
        </div>
        <div className="font-serif text-2xl text-ink mb-6">
          Camélia<span className="text-rose">.</span>
        </div>
        <div className="eyebrow mb-1">— Panel de administración</div>
        <h1 className="font-serif text-3xl text-ink mb-6">Ingresar</h1>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required autoComplete="username" className="input mb-4" />
        <label className="label" htmlFor="password">Contraseña</label>
        <input id="password" name="password" type="password" required autoComplete="current-password" className="input mb-6" />
        {state?.error && <p className="text-sm text-rose mb-4">{state.error}</p>}
        <Submit />
        <a href="/" className="block text-center text-xs text-thyme mt-5 hover:text-rose">← Volver a la tienda</a>
      </form>
    </section>
  );
}
