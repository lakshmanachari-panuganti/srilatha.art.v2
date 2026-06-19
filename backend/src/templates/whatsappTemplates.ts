// Centralised catalog of every WhatsApp message body sent by the backend.
// New templates go here — no per-template files, no inline strings in handlers.
//
// Templates are intentionally SITE-AGNOSTIC: no contact numbers, brand-
// specific URLs, or other per-deployment values are baked in. Every dynamic
// value — including the store contact number — is a positional placeholder
// (`{{1}}, {{2}}, …`) matching the WhatsApp Cloud API template-approval format.
//
// `renderTemplate(name, [...])` substitutes positional values in order.
// Per-site defaults (e.g. STORE_CONTACT_NUMBER) live in the caller layer,
// not here.

// Helper that emits the shared signature block with the store-contact slot
// pointed at the correct {{N}} placeholder for the surrounding template.
function signature(storeContactSlot: number): string {
  return [
    '',
    'If you have any questions, please feel free to contact us -',
    '',
    `📞 Call/WhatsApp: {{${storeContactSlot}}}`,
    '✉️ Email: studio@srilatha.art',
    '🌐 www.srilatha.art',
    '',
    '-Srilatha Art',
  ].join('\n');
}

type TemplateName =
  | 'new_order'
  | 'custom_order'
  | 'order_crafting'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'order_refunded'
  | 'order_on_hold'
  | 'review_request'
  | 'reset_password_otp';

interface TemplateDef {
  name: TemplateName;
  description: string;
  // Human-readable labels for {{1}}, {{2}}, … in order. Documents what each
  // positional slot represents — does not affect rendering.
  variables: readonly string[];
  body: string;
}

function template(def: TemplateDef): TemplateDef {
  return def;
}

export const WHATSAPP_TEMPLATES = {
  // Internal admin notification — not part of the customer-facing template set.
  new_order: template({
    name: 'new_order',
    description: 'Admin alert when a new order is placed.',
    variables: ['Order ID', 'Customer Name', 'Phone', 'Items List', 'Total', 'Address'],
    body: [
      '🎨 *New Order - Srilatha Art*',
      '',
      'Order ID: {{1}}',
      'Customer: {{2}}',
      'Phone: {{3}}',
      'Items:',
      '{{4}}',
      'Total: ₹{{5}}',
      'Address: {{6}}',
      '',
      'Please confirm and begin processing!',
    ].join('\n'),
  }),

  // Internal admin notification — not part of the customer-facing template set.
  custom_order: template({
    name: 'custom_order',
    description: 'Admin alert when a custom order request is submitted.',
    variables: ['Customer Name', 'Phone', 'Email', 'Description', 'Budget'],
    body: [
      '🎨 *New Custom Order Request*',
      '',
      'Name: {{1}}',
      'Phone: {{2}}',
      'Email: {{3}}',
      'Description: {{4}}',
      'Budget: {{5}}',
      '',
      'Reply to discuss!',
    ].join('\n'),
  }),

  order_crafting: template({
    name: 'order_crafting',
    description: 'Order Status: CONFIRMED -> CRAFTING.',
    variables: ['Customer Name', 'Order Number', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'We have started crafting your order {{2}}.',
      '',
      'We are handmaking your artwork with care, and we will keep you updated at each stage.',
      signature(3),
    ].join('\n'),
  }),

  order_shipped: template({
    name: 'order_shipped',
    description: 'Order Status: CRAFTING -> SHIPPED.',
    variables: ['Customer Name', 'Order Number', 'Courier Partner', 'Tracking Number', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'Your order {{2}} has been shipped.',
      '',
      'Courier Partner: {{3}}',
      'Tracking Number: {{4}}',
      '',
      'You can use the tracking details above to follow your delivery updates.',
      signature(5),
    ].join('\n'),
  }),

  order_delivered: template({
    name: 'order_delivered',
    description: 'Order Status: SHIPPED -> DELIVERED.',
    variables: ['Customer Name', 'Order Number', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'Your order {{2}} has been delivered.',
      '',
      'We hope your artwork has reached you safely and brings beauty to your space.',
      signature(3),
    ].join('\n'),
  }),

  order_cancelled: template({
    name: 'order_cancelled',
    description: 'Order Status: -> CANCELLED.',
    variables: ['Customer Name', 'Order Number', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'Your order {{2}} has been cancelled as requested or per update from our support team.',
      '',
      'If any payment was captured, the refund (if applicable) will be processed as per our policy.',
      signature(3),
    ].join('\n'),
  }),

  order_refunded: template({
    name: 'order_refunded',
    description: 'Refund processed.',
    variables: ['Customer Name', 'Refund Amount', 'Order Number', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'A refund of Rs. {{2}} for your order {{3}} has been successfully processed.',
      '',
      'The amount will reflect in your original payment method as per your bank or payment provider timeline.',
      signature(4),
    ].join('\n'),
  }),

  order_on_hold: template({
    name: 'order_on_hold',
    description: 'Order Status: -> ON_HOLD.',
    variables: ['Customer Name', 'Order Number', 'Hold Reason', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'Your order {{2}} is currently on hold.',
      '',
      'Reason:',
      '{{3}}',
      '',
      'Please reply to this message with the required details so we can continue processing your order.',
      signature(4),
    ].join('\n'),
  }),

  review_request: template({
    name: 'review_request',
    description: '72h after DELIVERED — request a customer review.',
    variables: ['Customer Name', 'Review Link', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'We hope your artwork has arrived safely and you are happy with it.',
      '',
      'Your feedback helps our small studio grow and helps other customers discover handmade art.',
      '',
      'Please share your review here:',
      '{{2}}',
      signature(3),
    ].join('\n'),
  }),

  reset_password_otp: template({
    name: 'reset_password_otp',
    description: 'Customer requested password reset.',
    variables: ['Customer Name', 'OTP', 'OTP Validity in Minutes', 'Store Contact Number'],
    body: [
      'Hello {{1}},',
      '',
      'We received a request to reset your account password.',
      '',
      'Your one-time password (OTP) is: {{2}}',
      '',
      'This OTP is valid for {{3}} minutes. Please do not share it with anyone.',
      '',
      'If you did not request this, please ignore this message or contact us immediately.',
      signature(4),
    ].join('\n'),
  }),
} as const;

// renderTemplate(name, [v1, v2, ...]) — values map 1:1 onto {{1}}, {{2}}, ...
// Throws if a referenced placeholder has no corresponding value.
export function renderTemplate<T extends TemplateName>(
  name: T,
  values: ReadonlyArray<string | number>,
): string {
  const tpl = WHATSAPP_TEMPLATES[name];
  return tpl.body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const idx = Number(n) - 1;
    const v = values[idx];
    if (v === undefined || v === null) {
      throw new Error(`renderTemplate(${name}): missing value for {{${n}}} (${tpl.variables[idx] ?? 'unknown'})`);
    }
    return String(v);
  });
}

