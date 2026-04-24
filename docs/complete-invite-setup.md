# Invite Completion Setup Guide

This guide explains how to configure Supabase and the admin app so invited users can complete setup at:

`/complete-invite?mode=signup`

## What this flow does

1. An admin sends an invite from the admin panel.
2. Supabase emails the user a link.
3. The link redirects the user to the admin app's invite completion page.
4. The user sets a password and finishes setup.
5. On success, the app redirects them into the admin portal.

## Supabase configuration

Open your Supabase project and go to:

`Authentication -> URL Configuration`

Set these values:

### Site URL

Use the main URL of your admin app.

Examples:

- `http://localhost:5173`
- `https://your-admin-domain.com`

### Additional Redirect URLs

Add the invite completion route and sign-in route.

For local development:

- `http://localhost:5173/complete-invite**`
- `http://localhost:5173/login**`

For production:

- `https://your-admin-domain.com/complete-invite**`
- `https://your-admin-domain.com/login**`

If you want to allow the entire app, you can also add:

- `https://your-admin-domain.com/**`

## Environment variables

The backend builds the invite redirect URL from one of these environment variables:

- `ADMIN_INVITE_REDIRECT_URL`
- `ADMIN_FRONTEND_URL`
- `FRONTEND_URL`
- `VITE_ADMIN_FRONTEND_URL`
- `VITE_FRONTEND_URL`

Set one of them to your admin app base URL.

Examples:

```env
ADMIN_INVITE_REDIRECT_URL=http://localhost:5173
```

```env
ADMIN_INVITE_REDIRECT_URL=https://your-admin-domain.com
```

## Expected redirect behavior

The backend sends invite links to:

`/complete-invite?mode=signup&email=user@example.com`

The frontend invite completion page then:

- pre-fills the invited email when available
- lets the user set a password
- signs the user into Supabase
- redirects them back to the admin dashboard

## Troubleshooting

### Redirect rejected by Supabase

If Supabase shows a redirect error, confirm that the exact route is listed in Additional Redirect URLs.

### Invite link opens the wrong page

Check the backend environment variable and make sure it points to the correct admin frontend base URL.

### User lands on the page but cannot sign in

Confirm the invite email address matches the account in Supabase Auth and that the invite was accepted before setting a password.

### User is redirected but still sees access denied

Make sure the user has the `admin` role in `app_metadata`.

## Related files

- `backend/app/services.py`
- `admin-frontend/src/components/InviteCompletionPage.tsx`
- `admin-frontend/src/App.tsx`
- `admin-frontend/src/components/AuthDialog.tsx`

