# Hatch inquiry Apps Script

This is the receiver for the form on `/inquire/`. It is a Google Apps Script bound to a Google Sheet. A submission appends a row on a tab named `Inquiries` and sends two emails through Gmail (a notification to Daniel, and a confirmation to the person who wrote in).

The marketing site stays static. `assets/js/inquire.js` posts the form to the web app URL you deploy below. Until that URL replaces `REPLACE_WITH_APPS_SCRIPT_URL`, the page opens a mail draft instead and does not call this script.

The spreadsheet stays private. "Anyone" on the web app means anyone may submit the form. It does not publish the Sheet.

Resend can replace `MailApp` later. The form already posts to one URL, so that swap stays on this side.

## Deploy

1. Create a new Google Sheet in the Hatch Google account (the account that should own the rows and send the mail). Name the file whatever you like. The script creates a tab named `Inquiries`.
2. In that Sheet, open **Extensions > Apps Script**.
3. Delete the sample `function myFunction()` and paste the full contents of `Code.gs`. The Apps Script editor should be on the V8 runtime (the default for a new project).
4. Click the gear (**Project Settings**) and open **Script properties**. Add a property:
   - Property: `NOTIFY_TO`
   - Value: `daniel.keene223@gmail.com`
   Leave this off only if you want the same address as a fallback. The script uses `daniel.keene223@gmail.com` when `NOTIFY_TO` is missing or not an email.
5. Click **Deploy > New deployment**. Click the gear next to "Select type" and choose **Web app**.
6. Set **Execute as** to **Me**, and **Who has access** to **Anyone**. That "Anyone" must allow a visitor who is not signed in to Google. If the menu still shows **Anyone, even anonymous**, choose that. **Only myself** will silently drop submissions.
7. Click **Deploy**. Google will ask you to authorize the script. Allow it to edit this spreadsheet and to send email as you.
8. Copy the **Web app URL**. It ends in `/exec`.
9. In this repo, open `assets/js/inquire.js` and set the constant at the top:

   `var INQUIRY_ENDPOINT = "https://script.google.com/macros/s/…/exec";`

10. Deploy the site (or refresh a local server) and send a test inquiry. You should get a row on `Inquiries`, a notification at `NOTIFY_TO` with Reply going to the address you typed, and a confirmation in that inbox from the name Hatch.

Opening the `/exec` URL in a browser runs `doGet` and should show `{"ok":true,"service":"hatch-inquiry"}`.

## After you change the script

Apps Script serves the deployment, not the editor copy. After every edit: **Deploy > Manage deployments**, edit the web app, set **Version** to **New version**, and deploy. The `/exec` URL stays the same.

## What a submission does

`doPost` accepts a form-urlencoded body or JSON.

It rejects the submission when:

- `hp_field` (the hidden honeypot) has any value
- `loaded_at` is missing, not a timestamp, or less than 3 seconds before the request arrives
- a field is longer than the limit in `Code.gs`
- the email is not a plain address
- name, work email, company, role, firm size, use case, or timeline is missing
- firm size, timeline, source, or tier is not one of the choices on the form

It then rate-limits with `CacheService`: at most 5 submissions for one email, and 20 submissions overall, per 10 minutes.

A kept submission appends one row. Columns, in order:

`timestamp` (America/Chicago), `name`, `email`, `company`, `role`, `firm size`, `phone`, `use case`, `timeline`, `source`, `source other`, `tier`, `message`, `page URL`, `user agent`, `status`

`status` is always `new`. The header row is written if it is missing. Values that start with `=`, `+`, `-`, or `@` are stored as text so they cannot run as formulas.

The notification goes to `NOTIFY_TO`, with every field, and **reply-to** set to the inquirer. The confirmation goes to the inquirer from the name Hatch, with **reply-to** set to `NOTIFY_TO`:

- Subject: `We received your Hatch inquiry`
- Body: a short note from Daniel that repeats use case, timeline, and firm size

If the Sheet write fails, the notification is still sent and its subject says the sheet write failed. The script then returns JSON `{"ok":true}`. The browser posts with `no-cors`, so it cannot read that JSON. A resolved request is treated as success. Check the Sheet and the two emails when you test. A wrong URL can look successful in the browser for the same reason.

## Try it with curl

Replace the URL, then wait at least 3 seconds after you pick `loaded_at` (it is milliseconds since epoch; `date +%s000` is close enough if you pause before sending).

```bash
curl -s -X POST "https://script.google.com/macros/s/YOUR_ID/exec" \
  -H "Content-Type: application/json" \
  --data '{"name":"Ada Lovelace","email":"ada@example.com","company":"Analytical Engines","role":"Partner","firm_size":"50–250","use_case":"Client memos","timeline":"Exploring","loaded_at":"1700000000000","phone":"","source":"Referral","tier":"","message":"Hello"}'
```

Use a `loaded_at` from a few minutes ago. A brand-new timestamp is rejected as too fast.
