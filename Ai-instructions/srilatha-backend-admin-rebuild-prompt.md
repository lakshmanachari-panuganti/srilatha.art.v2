# AI Prompt — Rebuild the Srilatha Art Backend + Admin Panel

You are building the **backend API and admin panel** for **Srilatha Art**, a handmade Indian folk-art e-commerce store (resin art, Lippan art, dot mandala, Kolam, wedding decoratives) shipping across India, prices in INR.

**Rules:**
- Build **only** the backend and the admin panel. Do **not** build the customer-facing storefront UI.
- The list below is the **feature set / capabilities**. **You** choose the stack, data model, libraries, and implementation. Do not ask me how — decide and build.
- Treat every item as a required capability unless I say otherwise.

---

## 1. Customer accounts & auth
- Email/password registration and login
- Google sign-in
- Logout, current-session lookup, profile update
- Customer addresses: add, edit, delete, list

## 2. Product catalog (public)
- Browse products with categories and filtering
- Single product detail
- Product reviews: view per product, view recent, submit a review
- Review eligibility check (only genuine buyers can review)

## 3. Cart, wishlist & discounts
- Server-synced cart (add / update quantity / remove)
- Wishlist (add / remove)
- Coupon codes: validate against a cart, list active offers
- Stock/inventory reservation while an order is in progress, with automatic release of stale/abandoned reservations

## 4. Orders (customer side)
- Place an order
- View my orders + single order detail
- Cancel an order
- Request a return
- Download invoice (PDF) for an order

## 5. Payments
- Online payment processing (create payment order, verify payment, reconcile via payment-gateway webhook)
- Safe handling of duplicate/repeated webhook events so an order is never double-processed

## 6. Order lifecycle / fulfilment
- A defined order status flow covering: placed, confirmed, crafting, packed, shipped, out for delivery, delivered, on hold, cancelled, return requested, returned, refunded
- Refund handling
- Auto-generated human-readable order numbers

## 7. Shipping & serviceability
- Pincode lookup / delivery-serviceability check
- Configurable shipping rules (shipping charges, free-shipping threshold)

## 8. Custom orders
- Customer submits a custom-order/commission request (with image/reference upload)

## 9. Newsletter
- Newsletter subscription capture

## 10. Media uploads
- Image upload for customers (e.g. custom-order references) and for admins (product images), stored in object storage

---

# ADMIN PANEL

## 11. Admin authentication & access
- Separate admin login/logout (isolated from customer auth)
- First-time admin setup
- Role-protected admin routes

## 12. Dashboard & analytics
- Stats dashboard: revenue, order counts, and key business metrics
- Notification activity feed and notification stats

## 13. Product management
- Create, edit, delete products
- **AI product-content generation**: from a product image, auto-generate SEO title, short description, full description, material, and care instructions
- Combined AI-generate-and-upload flow
- Product image upload

## 14. Order management
- List orders with status filtering, view order detail
- Update an order's status (following the lifecycle rules)
- Bulk status updates across multiple orders
- Per-order admin actions: refund, add internal notes, trigger notifications, regenerate/fetch invoice

## 15. Coupon management
- Create, edit, view, and manage discount coupons

## 16. Announcements
- Create and manage site announcement banners (with public read endpoint for the storefront)

## 17. Review moderation
- List reviews and approve/reject/moderate them

## 18. Custom-order management
- List incoming custom-order requests and update their status

## 19. Shipping settings management
- View and edit shipping configuration (rates, thresholds)

---

# NOTIFICATIONS & MESSAGING

## 20. Transactional email
- Templated, branded emails for each order milestone: order confirmation, crafting started, shipped, delivered, on hold, cancelled, refunded
- Post-delivery automated review-request email

## 21. WhatsApp Business messaging
- Send WhatsApp messages to customers for order-lifecycle events using approved Utility and Marketing message templates
- Inbound WhatsApp webhook (receive customer replies / status callbacks)
- Admin view of WhatsApp conversations: list all conversations and open a per-customer message thread
- Track/estimate WhatsApp message billing

## 22. Async/background processing
- All notifications (email + WhatsApp) sent through a background queue, never blocking the request
- Background worker that sends post-delivery review-request nudges
- Scheduled cleanup job for stale stock reservations / abandoned carts

---

# CROSS-CUTTING REQUIREMENTS (apply across the whole backend)
- Authentication with separate scopes for customers vs admins
- CSRF protection on state-changing requests
- Rate limiting per action and per client
- Standardized API error responses with stable error codes
- Structured logging / telemetry
- Money stored and computed as integer minor units (paise) to avoid float errors
- Order line-items snapshotted at purchase time so later price/title edits don't change past orders
- Secrets/keys kept out of source (managed secret store)
- Health-check endpoint

---

**Deliverable:** a complete, working backend API plus an admin panel that exposes all admin features above. Choose and justify your stack briefly, then build it.
