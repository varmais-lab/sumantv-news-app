-- Phase 3B hardening: the admin RPC can rely on the caller's RLS permissions.

alter function public.shorts_analytics_dashboard(integer)
  security invoker;
