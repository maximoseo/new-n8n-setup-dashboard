# Supabase Email Templates

Configure these in Supabase Dashboard -> Authentication -> Email Templates.

## Confirmation Email

Subject: `Welcome to New Site Onboarding Dashboard - Confirm your email`

```html
<div style="font-family: 'Segoe UI', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="display: inline-block; background: #111827; color: #fff; font-weight: 900; font-size: 18px; width: 48px; height: 48px; line-height: 48px; border-radius: 8px;">NS</div>
    <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">New Site Onboarding Dashboard</h1>
    <p style="color: #475569; margin: 4px 0 0;">Automated n8n blog pipeline setup</p>
  </div>
  <div style="background: #fff; border: 1px solid #d9dee8; border-radius: 8px; padding: 32px;">
    <h2 style="margin: 0 0 16px; color: #111827;">Confirm your email address</h2>
    <p style="color: #475569; line-height: 1.6;">Thanks for signing up. Click the button below to confirm your email and start onboarding your sites.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #1d4ed8; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px;">Confirm Email</a>
    </div>
    <p style="color: #94a3b8; font-size: 13px;">If you did not sign up for this dashboard, you can ignore this email.</p>
  </div>
  <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px;">New Site Onboarding Dashboard</p>
</div>
```

## Password Reset Email

Subject: `Reset your password - New Site Onboarding Dashboard`

```html
<div style="font-family: 'Segoe UI', -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
  <div style="text-align: center; margin-bottom: 32px;">
    <div style="display: inline-block; background: #111827; color: #fff; font-weight: 900; font-size: 18px; width: 48px; height: 48px; line-height: 48px; border-radius: 8px;">NS</div>
    <h1 style="margin: 16px 0 0; font-size: 24px; color: #111827;">New Site Onboarding Dashboard</h1>
  </div>
  <div style="background: #fff; border: 1px solid #d9dee8; border-radius: 8px; padding: 32px;">
    <h2 style="margin: 0 0 16px; color: #111827;">Reset your password</h2>
    <p style="color: #475569; line-height: 1.6;">We received a request to reset your password. Click the button below to choose a new one.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="{{ .ConfirmationURL }}" style="display: inline-block; background: #1d4ed8; color: #fff; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px;">Reset Password</a>
    </div>
    <p style="color: #94a3b8; font-size: 13px;">If you did not request this, you can safely ignore this email. Your password will not be changed.</p>
  </div>
  <p style="text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px;">New Site Onboarding Dashboard</p>
</div>
```

## Magic Link Email

Subject: `Your login link - New Site Onboarding Dashboard`

Use the confirmation template structure with button text `Sign In` and copy: `Click the button below to sign in to your dashboard.`
