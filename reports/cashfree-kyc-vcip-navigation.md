# Cashfree KYC / VCIP — Exact Location & Blocker Investigation

**Date:** 2026-11-28  
**Scope:** Existing authenticated Cashfree Merchant Dashboard session, read-only.  
**Result:** Dashboard access was available. No login, OTP, upload, activation, key/webhook change, payment, refund, payout, settlement or support submission was performed.

---

## 1. Exact dashboard menu paths inspected

| Purpose | Exact path seen in the dashboard | What was found |
|---|---|---|
| Merchant KYC / VCIP status | **Home → footer → VCIP** | Only explicit VCIP location in the dashboard. No KYC menu exists under Profile or Settings. |
| User profile | **Header avatar (`V`) → Manage your profile → My Information** | Shows Name, User Name, Email ID, Phone Number, Account Password and Customer Support Email ID. **No KYC, VCIP, verification, approval or document-status section.** |
| Settings | **Settings → General → Account / Users / MCP Server** and **Settings → Products → Payment Gateway → Payment Methods / Notifications / Bank Account / Preferences / Wallets / SFTP Configuration** | **No KYC, VCIP, Verification or Approval section.** |
| Bank details | **Settings → Payment Gateway → Bank Account** | Page heading **“Settlement Bank Details”**; row label **“Bank Account Active”**. No pending bank-verification label was displayed. Bank values were not recorded. |
| Product switcher | **Payment Gateway header product selector → Access → Payment Gateway** and **Discover → VERIFY IDENTITY → Secure ID** | `Secure ID` is described as customer KYC during onboarding. It is **not** merchant VCIP and was not opened. No merchant VCIP product entry was found. |
| Payment Gateway activation | **Home → Products Activated → Payment Gateway → Access** → lands at **Payment Gateway → Summary → Overview** | Home lists Payment Gateway under **Products Activated**, but PG Overview shows toast **“Product is not activated”**. |
| Support routes | **Home → Need help?** | Buttons/labels: **Chat with us**, **Raise a ticket**, **View your tickets**, **Your Account Manager**, **Care Support**, **care@cashfree.com**. |

No menu or button was inferred. Every path above was opened or observed in the authenticated session.

---

## 2. Exact VCIP button / section name

- **Exact section name:** **VCIP**
- **Exact location:** bottom of **Home**, beneath the **Need help?** support block and above the copyright footer.
- **Exact UI text:** **“Please reach out to care@cashfree.com to complete VCIP. This is required to complete the KYC process.”**
- **Exact link label:** **care@cashfree.com**
- **Button found:** **None.** No **Start VCIP**, **Complete VCIP**, **Verify now**, **Upload video**, **Continue KYC** or equivalent button exists in the inspected pages.
- **Where Cashfree directs the merchant:** to **care@cashfree.com**. VCIP is support-driven, not self-service in this dashboard.

Safe element screenshot: [`reports/evidence/cashfree-vcip-footer.png`](evidence/cashfree-vcip-footer.png)

---

## 3. Current statuses

| Item | Status | Evidence / interpretation |
|---|---|---|
| **Merchant KYC verification** | **PENDING** | Home says **“Start transacting on Cashfree while we review your submitted details.”** Home footer says VCIP **“is required to complete the KYC process.”** Read-only dashboard network response for merchant details returned `basicKYC: 0`. No `APPROVED` KYC label was found. |
| **Video KYC (VCIP)** | **PENDING** | Required but not completed; no self-service VCIP flow or button found. Dashboard directs merchant to `care@cashfree.com`. Merchant-docs response contains no VCIP/video document entry. |
| **Merchant approval** | **PENDING** | Submitted details are still under review. No merchant-level approval status was found in Profile or Settings. |
| **Payment Gateway product activation** | **UNKNOWN** | Conflicting signals: Home lists PG under **Products Activated**; read-only network responses report `PG: APPROVED` and `paymentActive: 1`; PG Overview still shows **“Product is not activated”**. No authoritative resolution was displayed. |
| **“Product is not activated” reason** | **NOT DISPLAYED** | The toast is a plain error toast with no link, dialog, reason text or action button. No exact reason is shown in the UI inspected. |
| **Document status** | **PENDING / NOT APPROVED** | Read-only merchant-docs response: 34 entries — **17 `SUBMITTED`**, **17 `NOT REQUIRED`**, **0 `APPROVED`**, **0 `REJECTED`**. No document content was opened or displayed. |
| **Business detail status** | **NO PENDING LABEL DISPLAYED** | My Information has no business/KYC verification status. No business-detail rejection or approval text was found. |
| **Bank verification** | **ACTIVE / NO PENDING LABEL** | Bank Account page shows **“Bank Account Active”**. No pending bank-KYC label was displayed. |
| **Cashfree support action** | **REQUIRED** | Dashboard explicitly routes VCIP completion through `care@cashfree.com`; support options are visible under **Need help?**. |

---

## 4. Why Payment Gateway still appears blocked

1. **KYC/VCIP is incomplete**: Home states details are under review and VCIP is required to complete KYC.
2. **VCIP has no in-dashboard start button**: the only route is `care@cashfree.com`.
3. **PG activation signal is contradictory**:
   - Home: **Products Activated → Payment Gateway**
   - PG Overview: **“Product is not activated”**
   - Read-only network: `PG: APPROVED`, `paymentActive: 1`, `basicKYC: 0`
4. **No reason is displayed** for the **“Product is not activated”** toast, so no exact cause is claimed.
5. **17 submitted documents remain `SUBMITTED`** in the read-only document-status response; none show approval.

Safe element screenshot: [`reports/evidence/cashfree-product-not-activated-toast.png`](evidence/cashfree-product-not-activated-toast.png)

---

## 5. Correct official support route

From the dashboard’s own **Home → Need help?** block:

- **Care Support** → **care@cashfree.com** — use this for the VCIP-specific request shown in the footer.
- **Chat with us** — live chat from the dashboard.
- **Raise a ticket** — official ticket creation from the dashboard.
- **View your tickets** — existing ticket status.
- **Your Account Manager** — account-manager route shown in the dashboard.

Suggested subject line (proposed by OpenCode, not a dashboard-quoted official subject): **Request to complete VCIP and clarify Payment Gateway activation**.

Safe element screenshot: [`reports/evidence/cashfree-support-and-care.png`](evidence/cashfree-support-and-care.png)

No ticket was raised, no chat was sent, and no email was sent by OpenCode.

---

## 6. Exact next action for Vijay

Send one email from the registered Cashfree merchant email to **care@cashfree.com** requesting **VCIP completion and clarification of the “Product is not activated” message**, without attaching or sharing sensitive details with OpenCode. After Cashfree responds, share only the status words (`APPROVED`/`PENDING`, `COMPLETED`/`PENDING`, `ACTIVATED`/`NOT ACTIVATED`).

---

## 7. Gmail draft status

**Gmail connection status: NOT CONNECTED.**

Evidence:
- No authenticated Gmail tab was present in the browser session.
- Opening `https://mail.google.com/mail/u/0/` and `https://mail.google.com/mail/u/0/#drafts` redirected to the public Gmail marketing page and then to the Google sign-in page.
- No Gmail/email MCP tool is available in this session.
- I did **not** sign in, enter credentials, or bypass any login flow.

**Draft status:**
- Gmail draft saved: **NO** — Gmail is not connected, so a draft could not be created in Gmail.
- Email sent: **NO**.
- Explicit approval to send: **PENDING**.
- Draft location: below, in this report.

### Ready-to-use draft (not saved in Gmail yet)

**To:** care@cashfree.com  
**Subject:** Request to Complete VCIP and Clarify Payment Gateway Activation

Dear Cashfree Support Team,

We are writing regarding our Cashfree merchant account (VIJAY VISUALS).

During a read-only review of our authenticated Merchant Dashboard, we observed the following:

1. Merchant KYC is **Pending**: Home states, “Start transacting on Cashfree while we review your submitted details.”
2. The Home footer shows a **VCIP** section stating, “Please reach out to care@cashfree.com to complete VCIP. This is required to complete the KYC process.” However, no **Start VCIP**, **Complete VCIP**, video-verification link or similar self-service button is available in the dashboard.
3. Home lists **Payment Gateway** under **Products Activated**.
4. **Payment Gateway → Summary → Overview** shows the message **“Product is not activated”**. No reason or action link is displayed with this message.

We request the following:

- Please provide the exact step-by-step process to complete **VCIP** for this merchant account, including whether a support-initiated step, video link, account-manager action or document upload is required.
- Please explain the reason for the conflicting activation status and confirm whether **Payment Gateway is fully activated for Live payments**.
- Please confirm whether any KYC/VCIP, document approval or other pending item is blocking activation.

Please share only process and status information. We will not share passwords, OTPs, API keys, bank details, documents or secrets over email.

Kindly confirm once VCIP is completed and the Payment Gateway activation status is resolved.

Regards,  
Vijay  
VIJAY VISUALS

### Required next step after Gmail is connected

1. Save the exact draft above as a Gmail Draft.
2. Show the saved draft to Vijay.
3. Wait for explicit approval.
4. Only after approval, send that approved draft and verify the Gmail **Sent** status.

No email has been sent.

---

## 8. Post-audit Preview completion note

After the read-only dashboard audit, safe local Preview work was completed: payment-hardening code/test fixes, blank `.env.example` placeholders, standalone policy routes, an isolated backup/restore drill, and a current Cashfree-only deploy/rollback runbook. None of that work touched the dashboard, Gmail, Cashfree Live, Production, or the audited Preview deployment. No new dashboard status was observed, so every dashboard status in sections 3–5 remains current and unchanged: KYC `PENDING`, VCIP `PENDING`, merchant approval `PENDING`, PG activation `UNKNOWN`, reason `NOT DISPLAYED`. Gmail remains `NOT CONNECTED`; no draft was saved and no email was sent.

The exact Telugu stop instruction remains:

**మీరు Cashfree డ్యాష్‍బోర్డ్‍లోకి లాగిన్ అయి KYC/merchant approval, Live eligibility, Easy Split స్థితిని మాత్రమే తనిఖీ చేసి, సెన్సిటివ్ వివరాలు పంచకుండా నాకు కేవలం approved/pending స్థితిని చెప్పండి.**

---

## 9. Safety confirmation

- Read-only navigation and element screenshots only.
- No document upload, VCIP start/complete, video verification, KYC edit, account-detail change, API-key change, webhook change, payment, refund, payout, settlement, activation toggle, Gmail sign-in, Gmail draft creation or email send was performed.
- No personal document, document content, bank value, OTP, password, API key, secret or token was displayed in these reports or copied into `reports/evidence/`.
- Only three safe element screenshots were created: the VCIP footer, the Home support block, and the PG activation toast.
- The later local code/test/doc work did not access any external account or Production system.

**Readiness verdict remains: PRODUCTION NOT READY.**
