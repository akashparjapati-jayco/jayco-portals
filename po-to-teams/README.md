# Customer PO auto-filing: Gmail → Microsoft Teams

Every purchase order that arrives at **office@jaycohousing.com** or **info@jaycohousing.com**
is saved automatically into the **JAYCO Family** team's Files, in the folder you already use:

```
Family / PO From Customers / <Customer> / <Financial year> / <Customer> - DD.MM.YYYY - <original file>.pdf
```

Example: `PO From Customers/Merit BMH Engineering Private Limited/2026-2027/Merit BMH Engineering Private Limited - 04.11.2026 - 1812.pdf`

POs from a sender the script can't match to a customer go to
`PO From Customers/_Auto Saved/<FY>/<Sender>/` and the Gmail thread gets the label
**PO Filed - Check Customer**, so someone can map that customer once (see "Customer mapping" below).

## Why it's built this way

- Both addresses are **Google Workspace (Gmail)** mailboxes, and info@ mail already lands in the
  office@ mailbox (label `09 Mailbox/Info`). Power Automate's Outlook triggers can't watch them, and its
  Gmail connector is restricted, so the watcher runs as a **Google Apps Script** inside office@ (same as
  `lead-intake.gs` and `customer-portal-backend.gs`).
- The script writes to SharePoint through **Microsoft Graph** with an Entra app that can only touch the
  **JAYCO Family** site (`Sites.Selected`). It can't read anyone's mail, Teams chats or other sites.

## What it does every 10 minutes

1. Searches Gmail: mail to/cc office@ or info@, with attachments, last 3 days, not sent by us.
2. Treats a mail as a PO when the subject or file name says so (`Purchase Order`, `PO No`, `26271PO245`,
   `Work Order`, `Amended PO`…) or the thread has the existing **Purchase Order** label. Quotations, RFQs,
   invoices, inspection reports, debit notes, payment mails, GRN, e-way bills are skipped. Inline
   logos/signature images are skipped.
3. Finds the customer: first your **Customers** mapping sheet (sender domain → folder), then an existing
   SharePoint customer folder whose name matches the domain (`meritbmh.com` → *Merit BMH Engineering
   Private Limited*, `vbtpl.co.in` → *VBTPL*). Staff forwards (`Fwd:` from our own address) use the
   original sender from the forwarded header.
4. Uploads each PO file (PDF, Excel, Word, images, zip; large files supported). Missing folders, such as a
   new financial year, are created automatically. Same-name files are kept with a numbered copy, never overwritten.
5. Labels the Gmail thread **PO Filed - SharePoint**, writes a row in the **JAYCO PO Upload Log** sheet,
   and optionally posts a card to a Teams channel.

Each mail + file is uploaded once only (the Log sheet is the memory), so re-running or back-filling is safe.

---

## Setup (about 20 minutes, once)

### 1. Register the Entra app — Microsoft 365 admin

1. Go to <https://entra.microsoft.com> → **App registrations** → **New registration**.
   Name: `JAYCO PO Filing`. Supported accounts: *this organization only*. No redirect URI. **Register**.
2. Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
3. **Certificates & secrets** → **New client secret** → 24 months → copy the **Value** (shown once).
4. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** →
   tick **Sites.Selected** → Add. Then click **Grant admin consent for JAYCO**.

### Microsoft 365 permissions required

| Permission | Type | Why |
|---|---|---|
| `Sites.Selected` (Microsoft Graph) | Application, admin consent | Lets the app reach only the sites it is explicitly given (step 2). |
| `write` role on the **JAYCO Family** site | Site permission grant | Create folders and upload files in *PO From Customers*. |

Nothing else is needed: no mail, Teams, user or tenant-wide file permissions. Don't use
`Sites.ReadWrite.All` or `Files.ReadWrite.All`; they would give access to every site in the tenant.

### 2. Give the app write access to the JAYCO Family site — admin, one-off

`Sites.Selected` starts with access to nothing. Grant it the one site with **Graph Explorer**
(<https://developer.microsoft.com/graph/graph-explorer>), signed in as a Global or SharePoint admin
(consent to `Sites.FullControl.All` for Graph Explorer when it asks):

1. Get the site id:
   `GET https://graph.microsoft.com/v1.0/sites/jaycoeng.sharepoint.com:/sites/JAYCOFamily?$select=id`
2. Grant write:
   `POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions`
   ```json
   {
     "roles": ["write"],
     "grantedToIdentities": [
       { "application": { "id": "<Application (client) ID>", "displayName": "JAYCO PO Filing" } }
     ]
   }
   ```
   A `201 Created` reply means it worked.

(PowerShell alternative: `Grant-PnPAzureADAppSitePermission -AppId <client id> -DisplayName "JAYCO PO Filing" -Site https://jaycoeng.sharepoint.com/sites/JAYCOFamily -Permissions Write`.)

### 3. Create the Apps Script — signed in to Google as office@jaycohousing.com

1. Open <https://script.google.com> → **New project** → name it `JAYCO PO to Teams`.
2. Replace `Code.gs` with the contents of [`po-to-teams.gs`](po-to-teams.gs). Save.
3. **Project Settings** (gear) → **Script Properties** → add:

   | Property | Value |
   |---|---|
   | `TENANT_ID` | Directory (tenant) ID from step 1 |
   | `CLIENT_ID` | Application (client) ID from step 1 |
   | `CLIENT_SECRET` | Client secret **Value** from step 1 |
   | `DRY_RUN` | `true` (for the first test) |
   | `TEAMS_WEBHOOK_URL` | *optional*, see step 6 |

   Keep the secret here only. Never paste it into the code or this repository (it's public).
4. In the editor choose the function **`setup`** → **Run** → allow Gmail, Sheets and external-request access.
   The log shows `SharePoint library OK… N customer folders found` and the link to the
   **JAYCO PO Upload Log** sheet. The 10-minute trigger is now installed.

### 4. Test, then go live

1. Run **`testDryRun`**. The execution log lists every PO it *would* file and the path, e.g.
   `[DRY RUN] Purchase Order → Family/PO From Customers/_Auto Saved/2026-2027/Gallantt/Gallantt - 04.11.2026 - PO.pdf (unknown)`.
   Nothing is uploaded.
2. Fix any customer names in the **Customers** tab (next section), then set Script Property
   `DRY_RUN` = `false`.
3. Optional: run **`backfillLast30Days`** once to file the last month's POs.

### 5. Customer mapping (the Customers tab of the Log sheet)

| domain | customerFolder | notes |
|---|---|---|
| `eibc.in` | `EIBC Ahmedabad` | |
| `gallantt.com` | `Gallantt Ispat Ltd` | |

- `customerFolder` must match the folder name under *PO From Customers* exactly. Run
  **`exportCustomerFolders`** to list every existing folder in column E for copy-paste.
- A new folder name is fine; the script creates it.
- Unknown company domains are added here automatically with a **NEW** note. Fill column B and
  future POs from that customer go straight to the right folder. (Files already in `_Auto Saved` stay
  there; move them in Teams if you like.)
- Gmail/Yahoo/Rediff senders can't be matched by domain; they're filed under the sender's name in
  `_Auto Saved`.

### 6. Optional: Teams channel alert for each new PO

1. In Teams, open the channel (for example *Account Management → Accounts*) → **⋯** → **Workflows** →
   **Post to a channel when a webhook request is received** → finish the wizard → copy the URL.
2. Paste it as Script Property `TEAMS_WEBHOOK_URL`. Each filed PO then posts a card with the customer,
   sender, subject and an **Open in Teams Files** button.

---

## Day-to-day

- **Where are the files?** Teams → *JAYCO Family* → Files → *Family* → *PO From Customers*.
- **Check what happened:** the **Log** tab of *JAYCO PO Upload Log* (one row per file, with the SharePoint link
  and `uploaded` or the error).
- **A PO was missed:** add the Gmail label **Purchase Order** to that thread; the next run (or
  `backfillLast30Days` if it's older than 3 days) files it.
- **Something was filed that isn't a PO:** delete it in Teams; adjust `SKIP_RE` at the top of the script if it
  keeps happening.
- **Client secret expires** (every 24 months): create a new one in Entra and update `CLIENT_SECRET`. The Log
  shows `Microsoft sign-in failed` when this is needed.

## Settings at the top of the script

`CFG` holds the site, base folder, mailboxes, labels, scan window (`newer_than:3d`) and limits. `PO_RE` and
`SKIP_RE` are the PO / not-PO word rules. After changing them, run `node po-to-teams/test-po-rules.js` to
check the rules against sample subjects.

## Troubleshooting

| Log / error | Fix |
|---|---|
| `Script Property TENANT_ID is missing` | Step 3.3 |
| `Microsoft sign-in failed: AADSTS7000215` | Wrong or expired client secret: copy the secret **Value**, not its ID |
| `Graph 403` | Step 2 not done, or admin consent for `Sites.Selected` not granted |
| `Graph 404` on setup | Site path changed: update `CFG.SP_SITE_PATH` / `CFG.BASE_FOLDER` |
| Nothing filed, no errors | `DRY_RUN` is still `true`, or the mail didn't look like a PO: add the **Purchase Order** label |
