"use client";

import { useActionState, useState } from "react";
import { loginAction, type LoginActionState } from "@/modules/auth/actions";

const initialState: LoginActionState = { error: null };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-xs font-medium tracking-wide text-white/70 uppercase"
        >
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={isPending}
          className="rounded-md border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none focus:border-[var(--gold)] disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-xs font-medium tracking-wide text-white/70 uppercase"
        >
          Passwort
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={isPasswordVisible ? "text" : "password"}
            autoComplete="current-password"
            required
            disabled={isPending}
            className="w-full rounded-md border border-white/15 bg-white/5 px-3 py-2.5 pr-11 text-sm text-white outline-none focus:border-[var(--gold)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => setIsPasswordVisible((visible) => !visible)}
            disabled={isPending}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-xs text-white/50 hover:text-white/80 disabled:opacity-50"
            aria-label={isPasswordVisible ? "Passwort verbergen" : "Passwort anzeigen"}
          >
            {isPasswordVisible ? "Verbergen" : "Anzeigen"}
          </button>
        </div>
      </div>

      {state.error ? <p className="text-sm text-red-400">{state.error}</p> : null}

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 rounded-md bg-[var(--gold)] px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-[var(--gold)]/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Anmelden..." : "Anmelden"}
      </button>
    </form>
  );
}
