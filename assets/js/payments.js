// ============================================
// Dominio Madre · Payment Adapter
// ============================================
// Capa de abstracción: hoy corre en modo 'manual' (tú marcas invoices como
// pagadas, registras transferencias, etc). Cuando se conecte Stripe, se
// implementa StripePaymentProvider y se cambia PROVIDER en localStorage.
//
// API pública (el frontend siempre llama a Payments.X, nunca a un provider directo):
//   Payments.getMRR()                              → { mrr_total, mrr_monthly, active_subs, ... }
//   Payments.listSubscriptions({ status })
//   Payments.createSubscription(clientId, plan)
//   Payments.cancelSubscription(subId, reason)
//   Payments.listInvoices({ clientId, status })
//   Payments.createInvoice(clientId, lines)
//   Payments.markInvoicePaid(invoiceId, { method, reference, paidAt })
//   Payments.retryPayment(invoiceId)              → manual: envía recordatorio; stripe: retry tarjeta
//   Payments.handleWebhook(payload)               → no-op en manual
//   Payments.getProvider()                        → 'manual' | 'stripe'

(function(global){
  'use strict';

  // ══════════════════════════════════════════
  // BASE PROVIDER
  // ══════════════════════════════════════════
  class PaymentProvider {
    constructor(ctx){ this.ctx = ctx; /* { sb, sbGet, sbInsert, sbPatch, toast } */ }
    get name(){ throw new Error('abstract'); }
    async getMRR(){ throw new Error('not impl'); }
    async listSubscriptions(){ throw new Error('not impl'); }
    async createSubscription(){ throw new Error('not impl'); }
    async cancelSubscription(){ throw new Error('not impl'); }
    async listInvoices(){ throw new Error('not impl'); }
    async createInvoice(){ throw new Error('not impl'); }
    async markInvoicePaid(){ throw new Error('not impl'); }
    async retryPayment(){ throw new Error('not impl'); }
    async handleWebhook(){ return { handled: false }; }
  }

  // ══════════════════════════════════════════
  // MANUAL PROVIDER (default hoy)
  // ══════════════════════════════════════════
  // Trabaja directo contra tablas Supabase (subscriptions, invoices, payments).
  // No hay cobro automático — tú registras pagos con markInvoicePaid().
  class ManualPaymentProvider extends PaymentProvider {
    get name(){ return 'manual'; }

    async getMRR(){
      // Usa v_mrr_live (creada en Fase 1 migration 06)
      const rows = await this.ctx.sbGet('v_mrr_live', 'select=*');
      return rows?.[0] || {
        mrr_total: 0, mrr_monthly: 0, mrr_from_annual: 0,
        active_subs: 0, trialing_subs: 0, past_due_subs: 0, canceled_subs: 0
      };
    }

    async listSubscriptions({ status, clientId } = {}){
      const parts = ['select=*,clients(empresa,nombre,email)'];
      if(status)   parts.push(`status=eq.${status}`);
      if(clientId) parts.push(`client_id=eq.${clientId}`);
      parts.push('order=created_at.desc');
      return await this.ctx.sbGet('subscriptions', parts.join('&'));
    }

    async createSubscription(clientId, { plan, amount_cents, interval = 'month', currency = 'USD', trial_days = 0 }){
      const now = new Date();
      const trialEnd = trial_days > 0 ? new Date(now.getTime() + trial_days * 864e5) : null;
      const periodEnd = new Date(now);
      if(interval === 'month') periodEnd.setMonth(periodEnd.getMonth() + 1);
      else if(interval === 'year') periodEnd.setFullYear(periodEnd.getFullYear() + 1);

      const payload = {
        client_id: clientId,
        plan,
        amount_cents,
        interval,
        currency,
        status: trial_days > 0 ? 'trialing' : 'active',
        trial_end: trialEnd ? trialEnd.toISOString() : null,
        current_period_start: now.toISOString(),
        current_period_end: periodEnd.toISOString(),
        provider: 'manual'
      };
      const [row] = await this.ctx.sbInsert('subscriptions', payload);
      return row;
    }

    async cancelSubscription(subId, reason = ''){
      return await this.ctx.sbPatch('subscriptions', subId, {
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        cancel_reason: reason || null
      });
    }

    async listInvoices({ clientId, status, limit = 50 } = {}){
      const parts = [`select=*,clients(empresa,nombre,email)&order=created_at.desc&limit=${limit}`];
      if(clientId) parts.push(`client_id=eq.${clientId}`);
      if(status)   parts.push(`status=eq.${status}`);
      return await this.ctx.sbGet('invoices', parts.join('&'));
    }

    async createInvoice(clientId, { subscription_id, amount_cents, currency = 'usd', description, due_date, period_start, period_end, number }){
      const payload = {
        client_id: clientId,
        subscription_id: subscription_id || null,
        number: number || null,                  // se llena con fn_next_invoice_number si se desea
        amount_due_cents: amount_cents,          // nombre real de la columna
        amount_paid_cents: 0,
        currency: (currency || 'usd').toLowerCase(),
        description: description || null,
        status: 'open',
        due_date: due_date || null,              // nombre real
        period_start: period_start || null,
        period_end: period_end || null,
        provider: 'manual'
      };
      const [row] = await this.ctx.sbInsert('invoices', payload);
      return row;
    }

    async markInvoicePaid(invoiceId, { method, reference, paidAt, amount_cents } = {}){
      const paid_at = paidAt || new Date().toISOString();
      // 1) Patch invoice (amount_paid_cents = amount_due_cents si no se pasa explícito)
      const current = await this.ctx.sbGet('invoices', `id=eq.${invoiceId}&select=amount_due_cents,client_id,currency`);
      const inv0 = current?.[0];
      const paidAmount = amount_cents ?? inv0?.amount_due_cents ?? 0;

      const [inv] = await this.ctx.sbPatch('invoices', invoiceId, {
        status: 'paid',
        paid_at,
        amount_paid_cents: paidAmount,
        payment_method: method || 'manual',
        payment_reference: reference || null,
        dunning_state: 'none',
        next_dunning_at: null
      });
      // 2) Insert payment row
      try {
        await this.ctx.sbInsert('payments', {
          invoice_id: invoiceId,
          client_id: inv?.client_id || inv0?.client_id,
          amount_cents: paidAmount,
          currency: (inv?.currency || inv0?.currency || 'usd').toLowerCase(),
          method: method || 'manual',
          reference: reference || null,
          status: 'succeeded',
          provider: 'manual',
          paid_at
        });
      } catch(e){ console.warn('[Payments] insert payments row failed (non-fatal):', e); }
      return inv;
    }

    async retryPayment(invoiceId){
      // En manual no hay "retry de tarjeta" — solo marcamos un recordatorio
      // (que un workflow n8n convertirá en email/WhatsApp al cliente)
      try {
        await this.ctx.sbInsert('notifications', {
          recipient_type: 'client',
          title: 'Recordatorio de pago pendiente',
          body: `Factura ${invoiceId} requiere pago manual.`,
          severity: 'warn',
          entity_type: 'invoice',
          entity_id: invoiceId
        });
      } catch(e){ console.warn('[Payments] notification insert failed:', e); }
      return { queued: true, channel: 'manual_reminder' };
    }

    async handleWebhook(){ return { handled: false, reason: 'manual provider has no webhooks' }; }
  }

  // ══════════════════════════════════════════
  // STRIPE PROVIDER (stub — placeholder para Fase 5)
  // ══════════════════════════════════════════
  // Cuando llegue Stripe, implementar estos métodos contra la Stripe API
  // (o idealmente, contra Edge Functions de Supabase que sincronicen
  // subscriptions/invoices a tu BD; el frontend sigue leyendo de Postgres).
  class StripePaymentProvider extends PaymentProvider {
    get name(){ return 'stripe'; }
    async getMRR(){ throw new Error('StripePaymentProvider pendiente — activar cuando haya LLC/Stripe'); }
    async listSubscriptions(){ throw new Error('not impl yet'); }
    async createSubscription(){ throw new Error('not impl yet'); }
    async cancelSubscription(){ throw new Error('not impl yet'); }
    async listInvoices(){ throw new Error('not impl yet'); }
    async createInvoice(){ throw new Error('not impl yet'); }
    async markInvoicePaid(){ throw new Error('not impl yet'); }
    async retryPayment(){ throw new Error('not impl yet'); }
    async handleWebhook(payload){ return { handled: false, reason: 'stripe provider stub' }; }
  }

  // ══════════════════════════════════════════
  // FACADE
  // ══════════════════════════════════════════
  const Payments = {
    _provider: null,

    init(ctx){
      const choice = (function(){
        try { return localStorage.getItem('payment_provider') || 'manual'; }
        catch(e){ return 'manual'; }
      })();
      this._provider = choice === 'stripe'
        ? new StripePaymentProvider(ctx)
        : new ManualPaymentProvider(ctx);
      console.log(`[Payments] Provider: ${this._provider.name}`);
    },

    getProvider(){ return this._provider?.name || 'manual'; },

    // Delegación a provider
    async getMRR()                              { return this._provider.getMRR(); },
    async listSubscriptions(opts)               { return this._provider.listSubscriptions(opts); },
    async createSubscription(clientId, params)  { return this._provider.createSubscription(clientId, params); },
    async cancelSubscription(subId, reason)     { return this._provider.cancelSubscription(subId, reason); },
    async listInvoices(opts)                    { return this._provider.listInvoices(opts); },
    async createInvoice(clientId, params)       { return this._provider.createInvoice(clientId, params); },
    async markInvoicePaid(invoiceId, params)    { return this._provider.markInvoicePaid(invoiceId, params); },
    async retryPayment(invoiceId)               { return this._provider.retryPayment(invoiceId); },
    async handleWebhook(payload)                { return this._provider.handleWebhook(payload); }
  };

  global.Payments = Payments;
  global.PaymentProvider = PaymentProvider;            // exposed para extensión
  global.ManualPaymentProvider = ManualPaymentProvider;
  global.StripePaymentProvider = StripePaymentProvider;
})(window);
