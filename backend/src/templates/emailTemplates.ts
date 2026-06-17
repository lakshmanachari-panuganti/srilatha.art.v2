// Plain-text + minimal-HTML email templates. Keep them short and free of
// brand-specific colors so they render well in any client. The contact
// number is a parameter rather than a hard-coded constant, mirroring the
// approach taken by the WhatsApp template catalog.

export interface OrderConfirmationParams {
  customerName: string;
  orderId: string;
  total: number;          // paise
  itemsList: string;      // already-formatted multi-line list
  shippingAddress: string;
  storeContactNumber: string;
}

export interface CustomOrderAckParams {
  customerName: string;
  referenceId: string;
  storeContactNumber: string;
}

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderOrderConfirmation(p: OrderConfirmationParams): { subject: string; text: string; html: string } {
  const subject = `Order ${p.orderId} confirmed`;
  const text = [
    `Hi ${p.customerName},`,
    '',
    `Thank you for your order! We've received your payment and are getting started.`,
    '',
    `Order ID: ${p.orderId}`,
    `Total: ${rupees(p.total)}`,
    '',
    `Items:`,
    p.itemsList,
    '',
    `Shipping to:`,
    p.shippingAddress,
    '',
    `We'll send you WhatsApp updates from ${p.storeContactNumber} as your piece is crafted and shipped.`,
    '',
    `If you have any questions, just reply to this email or message us on WhatsApp.`,
    '',
    `— Srilatha Art`,
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
  <h2 style="margin:0 0 16px;color:#111827;">Order confirmed</h2>
  <p>Hi ${escapeHtml(p.customerName)},</p>
  <p>Thank you for your order! We&rsquo;ve received your payment and are getting started.</p>
  <table cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;width:100%;">
    <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Order ID</td><td style="padding:6px 0;font-family:monospace;">${escapeHtml(p.orderId)}</td></tr>
    <tr><td style="padding:6px 0;color:#6b7280;">Total</td><td style="padding:6px 0;"><strong>${rupees(p.total)}</strong></td></tr>
  </table>
  <h3 style="margin:24px 0 8px;color:#111827;">Items</h3>
  <pre style="font-family:inherit;white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(p.itemsList)}</pre>
  <h3 style="margin:24px 0 8px;color:#111827;">Shipping to</h3>
  <pre style="font-family:inherit;white-space:pre-wrap;margin:0 0 16px;">${escapeHtml(p.shippingAddress)}</pre>
  <p>We&rsquo;ll send you WhatsApp updates from <strong>${escapeHtml(p.storeContactNumber)}</strong> as your piece is crafted and shipped.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:24px;">If you have any questions, just reply to this email or message us on WhatsApp.</p>
  <p style="margin-top:24px;">&mdash; Srilatha Art</p>
</div>`.trim();

  return { subject, text, html };
}

export function renderCustomOrderAck(p: CustomOrderAckParams): { subject: string; text: string; html: string } {
  const subject = `We received your custom-order request (${p.referenceId})`;
  const text = [
    `Hi ${p.customerName},`,
    '',
    `Thank you for the custom-order request! Srilatha will personally review the details and get back to you within 24 hours via WhatsApp or email.`,
    '',
    `Reference: ${p.referenceId}`,
    '',
    `If you'd like to share more references or talk things through, message us on WhatsApp at ${p.storeContactNumber}.`,
    '',
    `— Srilatha Art`,
  ].join('\n');

  const html = `
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1f2937;">
  <h2 style="margin:0 0 16px;color:#111827;">Commission request received</h2>
  <p>Hi ${escapeHtml(p.customerName)},</p>
  <p>Thank you for the custom-order request! Srilatha will personally review the details and get back to you within <strong>24 hours</strong> via WhatsApp or email.</p>
  <p>Reference: <span style="font-family:monospace;">${escapeHtml(p.referenceId)}</span></p>
  <p style="color:#6b7280;font-size:13px;margin-top:24px;">If you&rsquo;d like to share more references or talk things through, message us on WhatsApp at <strong>${escapeHtml(p.storeContactNumber)}</strong>.</p>
  <p style="margin-top:24px;">&mdash; Srilatha Art</p>
</div>`.trim();

  return { subject, text, html };
}
