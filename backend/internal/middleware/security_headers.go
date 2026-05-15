package middleware

import "github.com/gofiber/fiber/v2"

// SecurityHeaders sets standard HTTP security headers on every response.
//
// CSP policy rationale:
//   - default-src 'self'            — deny everything not explicitly allowed
//   - script-src  'self'            — no inline scripts, no eval
//   - style-src   'self' 'unsafe-inline' — shadcn/Tailwind injects <style> tags at runtime
//   - img-src     'self' data: blob: — product images can be data-URIs or blob objects
//   - font-src    'self'            — web fonts served from origin only
//   - connect-src 'self'            — API calls to same origin only (plus /api/* proxy)
//   - frame-ancestors 'none'        — equivalent to X-Frame-Options: DENY but standardised
//   - object-src  'none'            — block Flash, PDFs rendered inline, etc.
//   - base-uri    'self'            — prevent base-tag hijacking
//   - form-action 'self'            — POST targets must be same origin
//
// Note: X-XSS-Protection is intentionally omitted. The header was removed from
// all major browsers (Chrome 78+, Firefox 69+) and the W3C recommendation is
// to not send it. Sending "1; mode=block" can trigger XSS-auditor bugs in older
// browsers. CSP is the correct, modern replacement.
func SecurityHeaders() fiber.Handler {
	const csp = "default-src 'self'; " +
		"script-src 'self'; " +
		"style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' data: blob:; " +
		"font-src 'self'; " +
		"connect-src 'self'; " +
		"frame-ancestors 'none'; " +
		"object-src 'none'; " +
		"base-uri 'self'; " +
		"form-action 'self'"

	return func(c *fiber.Ctx) error {
		c.Set("X-Content-Type-Options", "nosniff")
		c.Set("X-Frame-Options", "DENY")
		c.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		c.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=(self)")
		c.Set("Content-Security-Policy", csp)
		return c.Next()
	}
}
